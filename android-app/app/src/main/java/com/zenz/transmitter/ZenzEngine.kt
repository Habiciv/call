package com.zenz.transmitter

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.projection.MediaProjection
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpSender
import org.webrtc.RtpTransceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import org.webrtc.audio.JavaAudioDeviceModule
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

enum class Phase { IDLE, JOINING, JOINED }

data class Person(val id: String, val name: String)

data class StreamInfo(val peerId: String, val name: String, val ready: Boolean, val audio: Boolean)

data class UiState(
    val phase: Phase = Phase.IDLE,
    val error: String = "",
    val selfId: String = "",
    val people: List<Person> = emptyList(),
    val streams: List<StreamInfo> = emptyList(),
    val connected: Int = 0,
    val sharing: Boolean = false,
    val quality: Quality = Quality.BALANCED,
    val shareLink: String = "",
    val turn: Boolean = false,
)

private class Session(val room: String, val id: String, val token: String, var after: Long)

private class FrameWatcher(private val onFirstFrame: () -> Unit) : VideoSink {
    private val seen = AtomicBoolean(false)
    val hasFrames: Boolean get() = seen.get()
    fun reset() = seen.set(false)
    override fun onFrame(frame: VideoFrame?) {
        if (seen.compareAndSet(false, true)) onFirstFrame()
    }
}

private class Peer(val id: String, val pc: PeerConnection, val watcher: FrameWatcher) {
    lateinit var video: RtpTransceiver
    lateinit var audio: RtpTransceiver
    var offerLock = false
    val pendingIce = ArrayList<IceCandidate>()
    var restartJob: Job? = null
    var watchdogJob: Job? = null
    var repairJob: Job? = null
    var repairRequestedAt = 0L
    var state = "new"
}

private open class SdpAdapter : SdpObserver {
    override fun onCreateSuccess(sdp: SessionDescription?) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(error: String?) {}
    override fun onSetFailure(error: String?) {}
}

private suspend fun PeerConnection.createOfferAwait(): SessionDescription =
    suspendCancellableCoroutine { c ->
        createOffer(object : SdpAdapter() {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                if (sdp != null) c.resume(sdp) else c.resumeWithException(IllegalStateException("Oferta vazia"))
            }

            override fun onCreateFailure(error: String?) {
                c.resumeWithException(IllegalStateException(error ?: "Falha ao criar a oferta"))
            }
        }, MediaConstraints())
    }

private suspend fun PeerConnection.createAnswerAwait(): SessionDescription =
    suspendCancellableCoroutine { c ->
        createAnswer(object : SdpAdapter() {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                if (sdp != null) c.resume(sdp) else c.resumeWithException(IllegalStateException("Resposta vazia"))
            }

            override fun onCreateFailure(error: String?) {
                c.resumeWithException(IllegalStateException(error ?: "Falha ao criar a resposta"))
            }
        }, MediaConstraints())
    }

private suspend fun PeerConnection.setLocalAwait(d: SessionDescription) =
    suspendCancellableCoroutine<Unit> { c ->
        setLocalDescription(object : SdpAdapter() {
            override fun onSetSuccess() {
                c.resume(Unit)
            }

            override fun onSetFailure(error: String?) {
                c.resumeWithException(IllegalStateException(error ?: "Falha ao aplicar a descrição local"))
            }
        }, d)
    }

private suspend fun PeerConnection.setRemoteAwait(d: SessionDescription) =
    suspendCancellableCoroutine<Unit> { c ->
        setRemoteDescription(object : SdpAdapter() {
            override fun onSetSuccess() {
                c.resume(Unit)
            }

            override fun onSetFailure(error: String?) {
                c.resumeWithException(IllegalStateException(error ?: "Falha ao aplicar a descrição remota"))
            }
        }, d)
    }

/**
 * Motor do app. Fala o mesmo protocolo de sinalização do site (app/use-broadcast.ts):
 * malha WebRTC entre os participantes da sala "<código>-Principal", cada conexão com um
 * transceiver de vídeo e um de áudio (sendrecv), "perfect negotiation" com iniciador =
 * menor id, e avisos {media:{sharing,shareAudio}} / {control:{type:repair|share-repair}}.
 *
 * Todo o estado mutável abaixo só é tocado na thread única [dispatcher].
 */
object ZenzEngine {
    private const val TAG = "ZenzEngine"
    const val CHANNEL = "Principal"
    private val KEY_RE = Regex("^[a-f0-9-]{36}$")
    private val FALLBACK_ICE = listOf(
        PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
    )

    private lateinit var app: Context
    private lateinit var factory: PeerConnectionFactory
    lateinit var eglBase: EglBase
        private set

    private val dispatcher = Executors.newSingleThreadExecutor { r -> Thread(r, "zenz-engine") }.asCoroutineDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    /** Entregue pela Activity ao CaptureService depois que o usuário autoriza a captura. */
    @Volatile
    var pendingProjection: Intent? = null

    @Volatile
    private var uiVisible = false

    // ---- estado da sala (somente thread do motor) ----
    private var api: RoomApi? = null
    private var session: Session? = null
    private var iceServers: List<PeerConnection.IceServer> = FALLBACK_ICE
    private var turnConfigured = false
    private val peers = HashMap<String, Peer>()
    private var people: List<Person> = emptyList()
    private val remoteSharing = HashMap<String, Boolean>()
    private val remoteAudio = HashMap<String, Boolean>()
    private var idleJob: Job? = null

    // ---- captura de tela local ----
    private var screenCapturer: ScreenCapturerAndroid? = null
    private var screenSource: VideoSource? = null
    private var screenHelper: SurfaceTextureHelper? = null
    private var screenTrack: VideoTrack? = null
    private var lastTunedCount = -1

    // ---- renderer da tela (escolhido pela Activity) ----
    private var viewerPeer: String? = null
    private var viewerSink: VideoSink? = null
    private var boundTrack: VideoTrack? = null
    private var boundSink: VideoSink? = null

    private val prefs by lazy { app.getSharedPreferences("zenz", Context.MODE_PRIVATE) }

    // =====================================================================
    // Inicialização e preferências
    // =====================================================================

    fun init(context: Context) {
        app = context.applicationContext
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(app).createInitializationOptions()
        )
        eglBase = EglBase.create()
        val audioModule = JavaAudioDeviceModule.builder(app)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                    .build()
            )
            .createAudioDeviceModule()
        factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(audioModule)
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
        _state.update { it.copy(quality = Quality.from(prefs.getString("quality", null))) }
    }

    fun savedLink(): String = prefs.getString("link", "") ?: ""
    fun savedName(): String = prefs.getString("name", "") ?: ""

    private fun clientKey(): String {
        val stored = prefs.getString("clientKey", null)
        if (stored != null && stored.length == 36) return stored
        val fresh = UUID.randomUUID().toString()
        prefs.edit().putString("clientKey", fresh).apply()
        return fresh
    }

    /** A Activity informa se está na tela. Sem tela e sem transmitir por 1 min, sai da sala. */
    fun setUiVisible(visible: Boolean) {
        uiVisible = visible
        scope.launch { checkIdle() }
    }

    private fun checkIdle() {
        idleJob?.cancel()
        idleJob = null
        if (session == null || uiVisible || screenCapturer != null) return
        idleJob = scope.launch {
            delay(60_000)
            if (session != null && !uiVisible && screenCapturer == null) doLeave()
        }
    }

    // =====================================================================
    // Entrar / sair
    // =====================================================================

    fun join(rawLink: String, rawName: String) {
        prefs.edit().putString("name", rawName.trim()).apply()
        scope.launch { doJoin(rawLink, rawName) }
    }

    fun leave() {
        scope.launch { doLeave() }
    }

    private suspend fun doJoin(rawLink: String, rawName: String) {
        if (session != null || _state.value.phase == Phase.JOINING) return
        _state.update { it.copy(phase = Phase.JOINING, error = "") }
        try {
            val base = RoomApi.parse(rawLink)
                ?: throw IllegalArgumentException("Digite o endereço do site ou cole o link da sala.")
            val fragment = base.fragment?.lowercase()
            val key = if (fragment != null && KEY_RE.matches(fragment)) fragment else UUID.randomUUID().toString()
            val client = RoomApi(base)
            api = client

            // Configuração de ICE/TURN do servidor (falha aqui não impede entrar).
            val cfg = withContext(Dispatchers.IO) { runCatching { client.config() }.getOrNull() }
            if (cfg != null) {
                val parsed = parseIceServers(cfg)
                if (parsed.isNotEmpty()) iceServers = parsed
                turnConfigured = cfg.optBoolean("turnConfigured", false)
            }

            val s = Session(room = "$key-$CHANNEL", id = UUID.randomUUID().toString(), token = UUID.randomUUID().toString(), after = 0)
            session = s
            val name = rawName.trim().ifEmpty { "Visitante" }.take(30)
            val res = withContext(Dispatchers.IO) {
                client.room(
                    JSONObject()
                        .put("action", "join")
                        .put("room", s.room)
                        .put("id", s.id)
                        .put("token", s.token)
                        .put("clientKey", clientKey())
                        .put("name", name)
                        .put("after", 0)
                )
            }
            val link = "${client.origin}/#$key"
            prefs.edit().putString("link", link).apply()
            _state.update { it.copy(phase = Phase.JOINED, error = "", selfId = s.id, shareLink = link, turn = turnConfigured) }
            applyServer(res, s)
            scope.launch { poll(s) }
            checkIdle()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val message = when (e) {
                is ApiException -> e.message
                is IllegalArgumentException -> e.message
                else -> "Não foi possível conectar. Confira o endereço e a internet."
            } ?: "Não foi possível entrar na sala."
            Log.w(TAG, "join falhou", e)
            teardown()
            _state.update { UiState(error = message, quality = it.quality) }
        }
    }

    private suspend fun doLeave() {
        val s = session
        val client = api
        if (s != null && client != null) {
            scope.launch(Dispatchers.IO) {
                runCatching {
                    client.room(
                        JSONObject().put("action", "leave").put("room", s.room).put("id", s.id)
                            .put("token", s.token).put("after", s.after)
                    )
                }
            }
        }
        teardown()
        _state.update { UiState(quality = it.quality) }
    }

    /** Fecha tudo (conexões, captura, serviço). Sempre na thread do motor. */
    private fun teardown() {
        session = null
        idleJob?.cancel()
        idleJob = null
        releaseScreen()
        stopCaptureService()
        for (id in peers.keys.toList()) dropConnection(id)
        peers.clear()
        people = emptyList()
        remoteSharing.clear()
        remoteAudio.clear()
        lastTunedCount = -1
    }

    private fun parseIceServers(cfg: JSONObject): List<PeerConnection.IceServer> {
        val arr = cfg.optJSONArray("iceServers") ?: return emptyList()
        val out = ArrayList<PeerConnection.IceServer>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val urls = ArrayList<String>()
            when (val raw = o.opt("urls")) {
                is String -> urls.add(raw)
                is JSONArray -> for (j in 0 until raw.length()) urls.add(raw.optString(j))
            }
            if (urls.isEmpty()) continue
            val builder = PeerConnection.IceServer.builder(urls)
            val user = o.optString("username")
            val cred = o.optString("credential")
            if (user.isNotEmpty()) builder.setUsername(user)
            if (cred.isNotEmpty()) builder.setPassword(cred)
            out.add(builder.createIceServer())
        }
        return out
    }

    // =====================================================================
    // HTTP de sinalização
    // =====================================================================

    private suspend fun request(action: String, s: Session, extra: JSONObject? = null): JSONObject {
        val client = api ?: throw ApiException(0, "Entre na sala primeiro.")
        val body = JSONObject()
            .put("action", action).put("room", s.room).put("id", s.id).put("token", s.token).put("after", s.after)
        if (extra != null) {
            val keys = extra.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                body.put(k, extra.get(k))
            }
        }
        return withContext(Dispatchers.IO) { client.room(body) }
    }

    private suspend fun signal(target: String, s: Session, data: JSONObject) {
        request("signal", s, JSONObject().put("target", target).put("data", data))
    }

    private fun sendSignal(target: String, s: Session, data: JSONObject) {
        scope.launch {
            try {
                if (session === s) signal(target, s, data)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "signal falhou: ${e.message}")
            }
        }
    }

    private suspend fun poll(s: Session) {
        var failures = 0
        while (session === s) {
            delay(if (failures > 0) min(2400L, 650L * failures) else 450L)
            if (session !== s) return
            try {
                applyServer(request("poll", s), s)
                failures = 0
                if (_state.value.error.startsWith("Reconectando com a sala")) _state.update { it.copy(error = "") }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (session !== s) return
                val status = (e as? ApiException)?.status
                if (status != 401 && failures < 6) {
                    failures++
                    _state.update { it.copy(error = "Reconectando com a sala… tentativa $failures/6") }
                    continue
                }
                val message = e.message ?: "A conexão com a sala caiu."
                teardown()
                _state.update { UiState(error = message, quality = it.quality) }
                return
            }
        }
    }

    // =====================================================================
    // Aplicação da resposta do servidor (lista de pessoas + sinais)
    // =====================================================================

    private fun isInitiator(otherId: String, s: Session) = s.id < otherId

    private suspend fun applyServer(j: JSONObject, s: Session) {
        if (session !== s) return
        val list = LinkedHashMap<String, Person>()
        val arr = j.optJSONArray("peers") ?: JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id")
            if (id.isEmpty() || list.containsKey(id)) continue
            list[id] = Person(id, o.optString("name", "Visitante").ifEmpty { "Visitante" })
        }
        val ids = list.keys.toSet()
        people = list.values.toList()

        for (id in peers.keys.toList()) {
            if (id !in ids) {
                dropConnection(id)
                remoteSharing.remove(id)
                remoteAudio.remove(id)
            }
        }
        for (p in list.values) {
            if (p.id != s.id && isInitiator(p.id, s) && peers[p.id] == null) {
                connection(p.id, s)
                scope.launch { ensureOffer(p.id, s, false) }
            }
        }

        val sigs = j.optJSONArray("signals") ?: JSONArray()
        for (i in 0 until sigs.length()) {
            val sig = sigs.optJSONObject(i) ?: continue
            try {
                handleSignal(sig, s, ids)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "sinal ignorado: ${e.message}")
            }
            s.after = max(s.after, sig.optLong("id", 0))
        }
        retuneVideo(false)
        publishState()
    }

    private fun publishState() {
        val s = session
        val streams = people
            .filter { it.id != s?.id && remoteSharing[it.id] == true && peers.containsKey(it.id) }
            .map { StreamInfo(it.id, it.name, peers[it.id]?.watcher?.hasFrames == true, remoteAudio[it.id] == true) }
        val connected = peers.values.count { it.state == "connected" }
        _state.update {
            it.copy(
                people = people,
                streams = streams,
                connected = connected,
                sharing = screenCapturer != null,
                selfId = s?.id ?: "",
                turn = turnConfigured,
            )
        }
    }

    private fun setPeerState(id: String, state: String) {
        val p = peers[id] ?: return
        if (p.state == state) return
        p.state = state
        publishState()
    }

    // =====================================================================
    // Conexões WebRTC
    // =====================================================================

    private fun connection(id: String, s: Session): Peer {
        peers[id]?.let { return it }
        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            rtcpMuxPolicy = PeerConnection.RtcpMuxPolicy.REQUIRE
            iceCandidatePoolSize = 8
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        val observer = object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
                scope.launch { onIceState(id, s, state) }
            }

            override fun onConnectionChange(state: PeerConnection.PeerConnectionState?) {
                scope.launch { onConnState(id, s, state) }
            }

            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidate(candidate: IceCandidate?) {
                if (candidate == null) return
                val json = JSONObject()
                    .put("candidate", candidate.sdp)
                    .put("sdpMid", candidate.sdpMid)
                    .put("sdpMLineIndex", candidate.sdpMLineIndex)
                sendSignal(id, s, JSONObject().put("candidate", json))
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(channel: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
        }
        val watcher = FrameWatcher {
            scope.launch {
                peers[id]?.repairJob?.cancel()
                publishState()
            }
        }
        val pc = factory.createPeerConnection(config, observer)
            ?: throw IllegalStateException("Não foi possível criar a conexão WebRTC.")
        val peer = Peer(id, pc, watcher)
        peer.video = pc.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)
        )
        peer.audio = pc.addTransceiver(
            MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO,
            RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.SEND_RECV)
        )
        (peer.video.receiver.track() as? VideoTrack)?.addSink(watcher)
        peers[id] = peer
        setPeerState(id, "new")
        scheduleWatchdog(id, s)
        applyViewer()

        // Já estamos transmitindo: quem entra agora também precisa receber a tela.
        if (screenTrack != null) {
            attachShare(peer)
            scope.launch {
                delay(400) // deixa a primeira oferta/resposta terminar antes de renegociar
                if (session === s && peers[id] === peer) {
                    renegotiateSharePeer(id, s)
                    sendSignal(id, s, mediaJson(true))
                }
            }
        }
        return peer
    }

    private fun dropConnection(id: String) {
        val p = peers.remove(id) ?: return
        p.restartJob?.cancel()
        p.watchdogJob?.cancel()
        p.repairJob?.cancel()
        if (viewerPeer == id) unbindViewer()
        runCatching { (p.video.receiver.track() as? VideoTrack)?.removeSink(p.watcher) }
        runCatching { p.pc.close() }
        runCatching { p.pc.dispose() }
    }

    private fun onIceState(id: String, s: Session, state: PeerConnection.IceConnectionState?) {
        if (session !== s || peers[id] == null) return
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED -> onConnected(id)
            PeerConnection.IceConnectionState.CHECKING -> scheduleWatchdog(id, s)
            PeerConnection.IceConnectionState.FAILED,
            PeerConnection.IceConnectionState.DISCONNECTED -> scheduleReconnect(id, s, 1800)
            else -> {}
        }
    }

    private fun onConnState(id: String, s: Session, state: PeerConnection.PeerConnectionState?) {
        if (session !== s || peers[id] == null) return
        when (state) {
            PeerConnection.PeerConnectionState.CONNECTED -> onConnected(id)
            PeerConnection.PeerConnectionState.CONNECTING,
            PeerConnection.PeerConnectionState.NEW -> {
                setPeerState(id, "connecting")
                scheduleWatchdog(id, s)
            }
            PeerConnection.PeerConnectionState.DISCONNECTED -> scheduleReconnect(id, s, 1800)
            PeerConnection.PeerConnectionState.FAILED -> {
                setPeerState(id, "failed")
                scheduleReconnect(id, s, 0)
                _state.update {
                    it.copy(
                        error = if (turnConfigured) "A conexão da transmissão falhou e está tentando novamente pelo TURN…"
                        else "A conexão da transmissão falhou. Configure o TURN no servidor para redes bloqueadas."
                    )
                }
            }
            else -> {}
        }
    }

    private fun onConnected(id: String) {
        val p = peers[id] ?: return
        p.restartJob?.cancel(); p.restartJob = null
        p.watchdogJob?.cancel(); p.watchdogJob = null
        p.repairRequestedAt = 0
        setPeerState(id, "connected")
        if (_state.value.error.startsWith("A conexão da transmissão") || _state.value.error.startsWith("Reconectando transmissão")) {
            _state.update { it.copy(error = "") }
        }
        retuneVideo(true)
    }

    private fun scheduleWatchdog(id: String, s: Session) {
        val p = peers[id] ?: return
        p.watchdogJob?.cancel()
        p.watchdogJob = scope.launch {
            delay(7000)
            p.watchdogJob = null
            if (session !== s || peers[id] !== p) return@launch
            if (p.pc.connectionState() != PeerConnection.PeerConnectionState.CONNECTED) scheduleReconnect(id, s, 0)
        }
    }

    private fun scheduleReconnect(id: String, s: Session, delayMs: Long) {
        val p = peers[id] ?: return
        if (p.restartJob != null) return
        setPeerState(id, "reconnecting")
        p.restartJob = scope.launch {
            delay(delayMs)
            p.restartJob = null
            if (session !== s || peers[id] !== p) return@launch
            val ice = p.pc.iceConnectionState()
            if (p.pc.connectionState() == PeerConnection.PeerConnectionState.CONNECTED ||
                ice == PeerConnection.IceConnectionState.CONNECTED ||
                ice == PeerConnection.IceConnectionState.COMPLETED
            ) return@launch
            if (isInitiator(id, s)) ensureOffer(id, s, true) else askInitiatorToRepair(id, s)
            scheduleReconnect(id, s, 4500)
        }
    }

    private fun askInitiatorToRepair(id: String, s: Session) {
        val p = peers[id] ?: return
        val now = System.currentTimeMillis()
        if (p.repairRequestedAt > now - 3000) return
        p.repairRequestedAt = now
        sendSignal(id, s, JSONObject().put("control", JSONObject().put("type", "repair")))
    }

    // =====================================================================
    // Ofertas / respostas (perfect negotiation, igual ao site)
    // =====================================================================

    private fun descJson(d: SessionDescription) =
        JSONObject().put("type", d.type.canonicalForm()).put("sdp", d.description)

    private suspend fun sendOffer(id: String, s: Session, restart: Boolean) {
        val p = peers[id] ?: return
        if (session !== s || p.pc.signalingState() != PeerConnection.SignalingState.STABLE || p.offerLock) return
        p.offerLock = true
        try {
            if (restart) runCatching { p.pc.restartIce() }
            val offer = p.pc.createOfferAwait()
            if (session !== s || peers[id] !== p || p.pc.signalingState() != PeerConnection.SignalingState.STABLE) return
            p.pc.setLocalAwait(offer)
            signal(id, s, JSONObject().put("description", descJson(p.pc.localDescription ?: offer)))
            setPeerState(id, if (restart) "reconnecting" else "connecting")
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (session === s) _state.update { it.copy(error = e.message ?: "Falha ao preparar a conexão da transmissão.") }
        } finally {
            p.offerLock = false
        }
    }

    private suspend fun ensureOffer(id: String, s: Session, restart: Boolean) {
        val p = peers[id] ?: return
        if (session !== s) return
        val local = p.pc.localDescription
        if (p.pc.signalingState() == PeerConnection.SignalingState.HAVE_LOCAL_OFFER &&
            local != null && local.type == SessionDescription.Type.OFFER
        ) {
            try {
                signal(id, s, JSONObject().put("description", descJson(local)))
                setPeerState(id, "reconnecting")
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            return
        }
        sendOffer(id, s, restart)
    }

    private suspend fun renegotiateSharePeer(id: String, s: Session) {
        for (attempt in 0 until 24) {
            if (session !== s) return
            val p = peers[id] ?: return
            if (p.pc.signalingState() == PeerConnection.SignalingState.STABLE && !p.offerLock) {
                sendOffer(id, s, false)
                return
            }
            delay(75)
        }
    }

    private suspend fun handleSignal(sig: JSONObject, s: Session, ids: Set<String>) {
        val sender = sig.optString("sender")
        if (sender !in ids || sender == s.id) return
        val data = try {
            JSONObject(sig.optString("data"))
        } catch (_: Exception) {
            return
        }

        val media = data.optJSONObject("media")
        if (media != null) {
            onMedia(sender, s, media.optBoolean("sharing"), media.optBoolean("shareAudio"))
            return
        }

        when (data.optJSONObject("control")?.optString("type")) {
            "repair" -> {
                if (isInitiator(sender, s)) {
                    connection(sender, s)
                    scope.launch { ensureOffer(sender, s, true) }
                }
                return
            }
            "share-repair" -> {
                val track = screenTrack
                val peer = peers[sender]
                if (track != null && peer != null) {
                    runCatching { peer.video.sender.setTrack(track, false) }
                    tuneVideo(peer.video.sender)
                    renegotiateSharePeer(sender, s)
                    sendSignal(sender, s, mediaJson(true))
                }
                return
            }
        }

        val peer = connection(sender, s)

        val desc = data.optJSONObject("description")
        if (desc != null) {
            handleDescription(peer, sender, s, desc)
            return
        }

        val cand = data.optJSONObject("candidate")
        if (cand != null) {
            val sdp = cand.optString("candidate")
            if (sdp.isEmpty()) return
            val ice = IceCandidate(cand.optString("sdpMid", ""), cand.optInt("sdpMLineIndex", 0), sdp)
            if (peer.pc.remoteDescription != null) {
                runCatching { peer.pc.addIceCandidate(ice) }
            } else {
                peer.pendingIce.add(ice)
            }
        }
    }

    private suspend fun handleDescription(peer: Peer, sender: String, s: Session, desc: JSONObject) {
        val type = desc.optString("type")
        try {
            val remote = SessionDescription(SessionDescription.Type.fromCanonicalForm(type), desc.optString("sdp"))
            val collision = type == "offer" &&
                (peer.offerLock || peer.pc.signalingState() != PeerConnection.SignalingState.STABLE)
            val polite = !isInitiator(sender, s)
            if (collision && !polite) return
            if (collision && polite) {
                runCatching { peer.pc.setLocalAwait(SessionDescription(SessionDescription.Type.ROLLBACK, "")) }
            }
            peer.pc.setRemoteAwait(remote)
            val queued = peer.pendingIce.toList()
            peer.pendingIce.clear()
            for (c in queued) runCatching { peer.pc.addIceCandidate(c) }
            if (type == "offer") {
                val answer = peer.pc.createAnswerAwait()
                peer.pc.setLocalAwait(answer)
                signal(sender, s, JSONObject().put("description", descJson(peer.pc.localDescription ?: answer)))
                setPeerState(sender, "connecting")
                scheduleWatchdog(sender, s)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "erro de sinalização WebRTC: ${e.message}")
            scheduleReconnect(sender, s, 0)
        }
    }

    // =====================================================================
    // Quem está transmitindo na sala
    // =====================================================================

    private fun mediaJson(sharing: Boolean) =
        JSONObject().put("media", JSONObject().put("sharing", sharing).put("shareAudio", false))

    private fun onMedia(sender: String, s: Session, active: Boolean, hasAudio: Boolean) {
        remoteSharing[sender] = active
        remoteAudio[sender] = active && hasAudio
        val p = peers[sender]
        if (p != null) {
            if (active) {
                if (!p.watcher.hasFrames) scheduleShareRepair(sender, s)
            } else {
                p.watcher.reset()
                p.repairJob?.cancel()
                p.repairJob = null
            }
        }
        publishState()
    }

    /** O aviso "AO VIVO" chegou mas nenhum quadro apareceu: pede ao transmissor para refazer a faixa. */
    private fun scheduleShareRepair(id: String, s: Session) {
        val p = peers[id] ?: return
        p.repairJob?.cancel()
        p.repairJob = scope.launch {
            delay(2200)
            p.repairJob = null
            if (session !== s || peers[id] !== p || p.watcher.hasFrames) return@launch
            sendSignal(id, s, JSONObject().put("control", JSONObject().put("type", "share-repair")))
        }
    }

    // =====================================================================
    // Assistir: a Activity escolhe qual transmissão e em qual renderer
    // =====================================================================

    fun setViewer(peerId: String?, sink: VideoSink?) {
        scope.launch {
            viewerPeer = peerId
            viewerSink = sink
            applyViewer()
        }
    }

    private fun unbindViewer() {
        val t = boundTrack
        val k = boundSink
        if (t != null && k != null) runCatching { t.removeSink(k) }
        boundTrack = null
        boundSink = null
    }

    private fun applyViewer() {
        unbindViewer()
        val id = viewerPeer ?: return
        val sink = viewerSink ?: return
        val track = peers[id]?.video?.receiver?.track() as? VideoTrack ?: return
        track.addSink(sink)
        boundTrack = track
        boundSink = sink
    }

    // =====================================================================
    // Transmitir a tela
    // =====================================================================

    fun setQuality(q: Quality) {
        prefs.edit().putString("quality", q.name).apply()
        scope.launch {
            _state.update { it.copy(quality = q) }
            val capturer = screenCapturer
            if (capturer != null) {
                val (w, h) = captureSize(q)
                runCatching { capturer.changeCaptureFormat(w, h, q.fps) }
                retuneVideo(true)
            }
        }
    }

    fun onOrientationChanged() {
        scope.launch {
            val capturer = screenCapturer ?: return@launch
            val q = _state.value.quality
            val (w, h) = captureSize(q)
            runCatching { capturer.changeCaptureFormat(w, h, q.fps) }
        }
    }

    fun startShare(resultData: Intent) {
        scope.launch { doStartShare(resultData) }
    }

    fun stopShare() {
        scope.launch { doStopShare(true) }
    }

    fun shareCancelled() {
        scope.launch { stopCaptureService() }
    }

    @Suppress("DEPRECATION")
    private fun captureSize(q: Quality): Pair<Int, Int> {
        val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val dm = DisplayMetrics()
        wm.defaultDisplay.getRealMetrics(dm)
        val w = dm.widthPixels
        val h = dm.heightPixels
        val long = max(w, h).toDouble()
        val short = min(w, h).toDouble()
        val scale = min(1.0, min(q.maxLong / long, q.maxShort / short))
        fun even(v: Double) = max(2, (v.toInt() / 2) * 2)
        return even(w * scale) to even(h * scale)
    }

    private suspend fun doStartShare(resultData: Intent) {
        val s = session
        if (s == null) {
            stopCaptureService()
            return
        }
        if (screenCapturer != null) return
        try {
            val q = _state.value.quality
            val source = factory.createVideoSource(true)
            val helper = SurfaceTextureHelper.create("zenz-capture", eglBase.eglBaseContext)
            val capturer = ScreenCapturerAndroid(resultData, object : MediaProjection.Callback() {
                override fun onStop() {
                    // O sistema encerrou a captura (usuário tocou em "parar" na barra de status).
                    scope.launch { doStopShare(true) }
                }
            })
            capturer.initialize(helper, app, source.capturerObserver)
            val (w, h) = captureSize(q)
            capturer.startCapture(w, h, q.fps)
            val track = factory.createVideoTrack("zenz-screen", source)
            track.setEnabled(true)

            screenCapturer = capturer
            screenSource = source
            screenHelper = helper
            screenTrack = track
            lastTunedCount = -1

            for (peer in peers.values.toList()) attachShare(peer)
            publishState()
            checkIdle()
            for (id in peers.keys.toList()) renegotiateSharePeer(id, s)
            for (id in peers.keys.toList()) sendSignal(id, s, mediaJson(true))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "não foi possível iniciar a captura", e)
            releaseScreen()
            stopCaptureService()
            publishState()
            _state.update { it.copy(error = "Não foi possível iniciar a transmissão: ${e.message ?: "erro desconhecido"}") }
        }
    }

    private suspend fun doStopShare(announce: Boolean) {
        if (screenCapturer == null) return
        val s = session
        for (p in peers.values) runCatching { p.video.sender.setTrack(null, false) }
        releaseScreen()
        stopCaptureService()
        publishState()
        checkIdle()
        if (announce && s != null) for (id in peers.keys.toList()) sendSignal(id, s, mediaJson(false))
    }

    private fun releaseScreen() {
        val capturer = screenCapturer
        val track = screenTrack
        val source = screenSource
        val helper = screenHelper
        screenCapturer = null
        screenTrack = null
        screenSource = null
        screenHelper = null
        for (p in peers.values) runCatching { p.video.sender.setTrack(null, false) }
        if (capturer != null) {
            runCatching { capturer.stopCapture() }
            runCatching { capturer.dispose() }
        }
        runCatching { track?.dispose() }
        runCatching { source?.dispose() }
        runCatching { helper?.dispose() }
    }

    private fun attachShare(peer: Peer) {
        val track = screenTrack ?: return
        runCatching { peer.video.sender.setTrack(track, false) }
        tuneVideo(peer.video.sender)
    }

    private fun stopCaptureService() {
        runCatching { app.stopService(Intent(app, CaptureService::class.java)) }
    }

    // ---- ajuste de bitrate (mesma conta do site) ----

    private fun retuneVideo(force: Boolean) {
        if (screenTrack == null) return
        val n = peers.size
        if (!force && lastTunedCount == n) return
        lastTunedCount = n
        for (p in peers.values) tuneVideo(p.video.sender)
    }

    private fun tuneVideo(sender: RtpSender) {
        try {
            val preset = _state.value.quality
            val n = max(1, peers.size)
            val budget = min(preset.bitrate, 12_000_000 / n)
            val safe = max(650_000, budget)
            val params = sender.parameters
            if (params.encodings.isEmpty()) return
            val enc = params.encodings[0]
            enc.maxBitrateBps = safe
            enc.maxFramerate = preset.fps
            enc.scaleResolutionDownBy = max(1.0, sqrt(preset.bitrate.toDouble() / safe))
            sender.setParameters(params)
        } catch (e: Exception) {
            Log.w(TAG, "tuneVideo: ${e.message}")
        }
    }
}
