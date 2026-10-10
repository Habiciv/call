package com.zenz.transmitter

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer

class MainActivity : AppCompatActivity() {

    private lateinit var setupPanel: View
    private lateinit var roomPanel: View
    private lateinit var controls: View
    private lateinit var stage: View
    private lateinit var remoteView: SurfaceViewRenderer
    private lateinit var inputLink: EditText
    private lateinit var inputName: EditText
    private lateinit var btnJoin: Button
    private lateinit var btnShare: Button
    private lateinit var btnNext: Button
    private lateinit var btnCopy: Button
    private lateinit var btnLeave: Button
    private lateinit var setupError: TextView
    private lateinit var roomError: TextView
    private lateinit var statusText: TextView
    private lateinit var infoText: TextView
    private lateinit var stageHint: TextView
    private lateinit var liveBadge: TextView
    private lateinit var spinnerQuality: Spinner

    private var selectedPeer: String? = null
    private var boundPeer: String? = null
    private var immersive = false
    private var rendererReady = false
    private var currentState = UiState()

    private val projectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == RESULT_OK && data != null) {
                ZenzEngine.pendingProjection = data
                ContextCompat.startForegroundService(this, Intent(this, CaptureService::class.java))
            } else {
                Toast.makeText(this, "A captura de tela não foi autorizada.", Toast.LENGTH_SHORT).show()
                ZenzEngine.shareCancelled()
            }
        }

    private val notificationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Com ou sem notificação, a captura pode seguir; o serviço continua em primeiro plano.
            launchCaptureDialog()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setupPanel = findViewById(R.id.setupPanel)
        roomPanel = findViewById(R.id.roomPanel)
        controls = findViewById(R.id.controls)
        stage = findViewById(R.id.stage)
        remoteView = findViewById(R.id.remoteView)
        inputLink = findViewById(R.id.inputLink)
        inputName = findViewById(R.id.inputName)
        btnJoin = findViewById(R.id.btnJoin)
        btnShare = findViewById(R.id.btnShare)
        btnNext = findViewById(R.id.btnNextStream)
        btnCopy = findViewById(R.id.btnCopy)
        btnLeave = findViewById(R.id.btnLeave)
        setupError = findViewById(R.id.setupError)
        roomError = findViewById(R.id.roomError)
        statusText = findViewById(R.id.statusText)
        infoText = findViewById(R.id.infoText)
        stageHint = findViewById(R.id.stageHint)
        liveBadge = findViewById(R.id.liveBadge)
        spinnerQuality = findViewById(R.id.spinnerQuality)

        remoteView.init(ZenzEngine.eglBase.eglBaseContext, null)
        remoteView.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        remoteView.setEnableHardwareScaler(true)
        rendererReady = true

        inputLink.setText(ZenzEngine.savedLink())
        inputName.setText(ZenzEngine.savedName())

        spinnerQuality.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item, Quality.entries.map { it.label }
        )
        spinnerQuality.setSelection(ZenzEngine.state.value.quality.ordinal)
        spinnerQuality.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val q = Quality.entries[position]
                if (q != currentState.quality) ZenzEngine.setQuality(q)
            }

            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        btnJoin.setOnClickListener {
            hideKeyboard()
            ZenzEngine.join(inputLink.text.toString(), inputName.text.toString())
        }
        btnLeave.setOnClickListener {
            setImmersive(false)
            ZenzEngine.leave()
        }
        btnCopy.setOnClickListener {
            val link = currentState.shareLink
            if (link.isNotEmpty()) {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Link da sala", link))
                Toast.makeText(this, "Link copiado. Envie para quem vai assistir.", Toast.LENGTH_SHORT).show()
            }
        }
        btnShare.setOnClickListener {
            if (currentState.sharing) ZenzEngine.stopShare() else startShareFlow()
        }
        btnNext.setOnClickListener {
            val ids = currentState.streams.map { it.peerId }
            if (ids.size > 1) {
                val next = (ids.indexOf(selectedPeer) + 1) % ids.size
                selectedPeer = ids[next]
                render(currentState)
            }
        }
        stage.setOnClickListener {
            if (currentState.streams.isNotEmpty() || immersive) setImmersive(!immersive)
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                ZenzEngine.state.collect { render(it) }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        ZenzEngine.setUiVisible(true)
    }

    override fun onStop() {
        ZenzEngine.setUiVisible(false)
        super.onStop()
    }

    override fun onDestroy() {
        ZenzEngine.setViewer(null, null)
        boundPeer = null
        if (rendererReady) {
            remoteView.release()
            rendererReady = false
        }
        super.onDestroy()
    }

    // ------------------------------------------------------------------
    // Transmitir
    // ------------------------------------------------------------------

    private fun startShareFlow() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            launchCaptureDialog()
        }
    }

    private fun launchCaptureDialog() {
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(manager.createScreenCaptureIntent())
    }

    // ------------------------------------------------------------------
    // Interface
    // ------------------------------------------------------------------

    private fun render(st: UiState) {
        currentState = st
        val inRoom = st.phase == Phase.JOINED

        setupPanel.visibility = if (inRoom) View.GONE else View.VISIBLE
        roomPanel.visibility = if (inRoom) View.VISIBLE else View.GONE

        btnJoin.isEnabled = st.phase != Phase.JOINING
        btnJoin.text = if (st.phase == Phase.JOINING) "Entrando…" else "Entrar na sala"
        if (!inRoom && st.error.isNotEmpty()) {
            setupError.text = st.error
            setupError.visibility = View.VISIBLE
        } else {
            setupError.visibility = View.GONE
        }

        if (!inRoom) {
            if (boundPeer != null) {
                ZenzEngine.setViewer(null, null)
                boundPeer = null
            }
            selectedPeer = null
            if (immersive) setImmersive(false)
            return
        }

        // --- escolhe qual transmissão mostrar ---
        val ids = st.streams.map { it.peerId }
        if (selectedPeer !in ids) selectedPeer = ids.firstOrNull()
        if (selectedPeer != boundPeer) {
            boundPeer = selectedPeer
            ZenzEngine.setViewer(selectedPeer, if (selectedPeer != null) remoteView else null)
        }
        val current = st.streams.firstOrNull { it.peerId == selectedPeer }

        if (current != null) {
            stageHint.visibility = if (current.ready) View.GONE else View.VISIBLE
            stageHint.text = "Conectando à transmissão de ${current.name}…"
            liveBadge.visibility = View.VISIBLE
            liveBadge.text = "AO VIVO · ${current.name}"
        } else {
            stageHint.visibility = View.VISIBLE
            stageHint.text = if (st.sharing) "Você está transmitindo.\nQuem está na sala já vê a sua tela."
            else "Ninguém está transmitindo agora."
            liveBadge.visibility = View.GONE
            if (immersive) setImmersive(false)
        }
        btnNext.visibility = if (st.streams.size > 1 && !immersive) View.VISIBLE else View.GONE

        // --- textos de status ---
        val others = (st.people.size - 1).coerceAtLeast(0)
        statusText.text = when {
            others == 0 -> "Você está sozinho na sala."
            others == 1 -> "1 pessoa na sala · ${st.connected} conectada"
            else -> "$others pessoas na sala · ${st.connected} conectadas"
        }
        infoText.text = if (st.sharing) "Sua tela está sendo transmitida em segundo plano; pode abrir outros apps."
        else "Abra o link da sala no site para assistir também."
        if (st.error.isNotEmpty()) {
            roomError.text = st.error
            roomError.visibility = View.VISIBLE
        } else {
            roomError.visibility = View.GONE
        }

        // --- botão de transmitir ---
        btnShare.text = if (st.sharing) "Parar transmissão" else "Transmitir minha tela"
        btnShare.setBackgroundResource(if (st.sharing) R.drawable.btn_danger else R.drawable.btn_primary)
        if (spinnerQuality.selectedItemPosition != st.quality.ordinal) spinnerQuality.setSelection(st.quality.ordinal)
    }

    private fun setImmersive(on: Boolean) {
        immersive = on
        controls.visibility = if (on) View.GONE else View.VISIBLE
        btnNext.visibility = if (!on && currentState.streams.size > 1) View.VISIBLE else View.GONE
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (on) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun hideKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(inputLink.windowToken, 0)
    }
}
