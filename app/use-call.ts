'use client';
import { useEffect,useRef,useState,type Dispatch,type SetStateAction } from 'react';

type Person={id:string;name:string;hasAvatar:number|boolean;avatarVersion:number};
type IceServer={urls:string|string[];username?:string;credential?:string};
type Session={room:string;id:string;token:string;after:number};
export type ShareQuality='stable'|'balanced'|'high';
export type PeerState='new'|'connecting'|'connected'|'reconnecting'|'failed';

type QualityPreset={width:number;height:number;fps:number;bitrate:number};
const QUALITY:Record<ShareQuality,QualityPreset>={
 stable:{width:640,height:360,fps:20,bitrate:420000},
 balanced:{width:960,height:540,fps:20,bitrate:700000},
 high:{width:1280,height:720,fps:24,bitrate:1200000},
};

const FALLBACK_ICE:IceServer[]=[
 {urls:'stun:stun.cloudflare.com:3478'},
 {urls:'stun:stun.l.google.com:19302'},
];

function preferOpus(transceiver:RTCRtpTransceiver){
 try{
  const capabilities=RTCRtpReceiver.getCapabilities?.('audio');
  if(!capabilities||typeof transceiver.setCodecPreferences!=='function')return;
  const codecs=[...capabilities.codecs].sort((a,b)=>{
   const ao=/opus/i.test(a.mimeType)?0:1,bo=/opus/i.test(b.mimeType)?0:1;
   return ao-bo;
  });
  transceiver.setCodecPreferences(codecs);
 }catch{}
}

export function useCall(channel:string){
 const [people,setPeople]=useState<Person[]>([]),[streams,setStreams]=useState<Record<string,MediaStream>>({}),[screenStreams,setScreenStreams]=useState<Record<string,MediaStream>>({}),[remoteSharing,setRemoteSharing]=useState<Record<string,boolean>>({}),[remoteShareAudio,setRemoteShareAudio]=useState<Record<string,boolean>>({}),[avatars,setAvatars]=useState<Record<string,string>>({}),[joined,setJoined]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[sharing,setSharing]=useState(false),[screen,setScreen]=useState<MediaStream|null>(null),[localStream,setLocalStream]=useState<MediaStream|null>(null),[space,setSpace]=useState(''),[shareQuality,setShareQualityState]=useState<ShareQuality>('balanced'),[shareAudio,setShareAudio]=useState(false),[peerStates,setPeerStates]=useState<Record<string,PeerState>>({}),[turnConfigured,setTurnConfigured]=useState(false),[inputDeviceId,setInputDeviceId]=useState(''),[voiceProcessing,setVoiceProcessingState]=useState(true);
 const session=useRef<Session|null>(null),mic=useRef<MediaStream|null>(null),display=useRef<MediaStream|null>(null),connections=useRef<Record<string,RTCPeerConnection>>({}),pending=useRef<Record<string,RTCIceCandidateInit[]>>({}),iceServers=useRef<IceServer[]>(FALLBACK_ICE),restartTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({}),watchdogTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({}),screenVideoSenders=useRef<Record<string,RTCRtpSender>>({}),screenAudioSenders=useRef<Record<string,RTCRtpSender>>({}),voiceSenders=useRef<Record<string,RTCRtpSender>>({}),shareQualityRef=useRef<ShareQuality>('balanced'),avatarVersions=useRef<Record<string,number>>({}),avatarLoading=useRef<Set<string>>(new Set()),offerLocks=useRef<Record<string,boolean>>({}),repairRequested=useRef<Record<string,number>>({}),mutedRef=useRef(false),micRecovering=useRef(false),inputDeviceRef=useRef(''),voiceProcessingRef=useRef(true),clientKeyRef=useRef(''),lastTunedPeerCount=useRef(-1);

 useEffect(()=>{
  let key=location.hash.slice(1);
  if(!/^[a-f0-9-]{36}$/.test(key)){key=crypto.randomUUID();history.replaceState(null,'','#'+key)}
  try{
   let clientKey=sessionStorage.getItem('voz-tab-id')||'';
   if(!/^[a-f0-9-]{36}$/i.test(clientKey)){clientKey=crypto.randomUUID();sessionStorage.setItem('voz-tab-id',clientKey)}
   clientKeyRef.current=clientKey;
  }catch{clientKeyRef.current=crypto.randomUUID()}
  setSpace(key);void loadIceConfig();
  return()=>{cleanup()};
 },[]);

 async function loadIceConfig(){
  try{
   const r=await fetch('/api/config',{cache:'no-store'});
   if(!r.ok)return;
   const j=await r.json();
   if(Array.isArray(j.iceServers)&&j.iceServers.length)iceServers.current=j.iceServers;
   setTurnConfigured(Boolean(j.turnConfigured));
  }catch{}
 }

 function clearPeerTimer(id:string){
  if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
  if(watchdogTimers.current[id]){clearTimeout(watchdogTimers.current[id]);delete watchdogTimers.current[id]}
 }

 function dropConnection(id:string){
  clearPeerTimer(id);
  try{connections.current[id]?.close()}catch{}
  delete connections.current[id];delete pending.current[id];delete screenVideoSenders.current[id];delete screenAudioSenders.current[id];delete voiceSenders.current[id];delete offerLocks.current[id];delete repairRequested.current[id];
 }

 function cleanup(){
  session.current=null;
  mic.current?.getTracks().forEach(t=>t.stop());
  display.current?.getTracks().forEach(t=>t.stop());
  Object.keys(connections.current).forEach(dropConnection);
  connections.current={};pending.current={};screenVideoSenders.current={};screenAudioSenders.current={};voiceSenders.current={};mic.current=null;display.current=null;avatarLoading.current.clear();avatarVersions.current={};offerLocks.current={};repairRequested.current={};mutedRef.current=false;micRecovering.current=false;lastTunedPeerCount.current=-1;
 }

 async function request(action:string,extra:any={},s=session.current){
  if(!s)throw Error('Entre na call primeiro.');
  const r=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:s.room,id:s.id,token:s.token,after:s.after,...extra}),keepalive:action==='leave'});
  let j:any={};
  try{j=await r.json()}catch{}
  if(!r.ok){const problem:any=new Error(j.error||'Falha na conexão.');problem.status=r.status;throw problem}
  return j;
 }

 function leave(){
  const s=session.current;if(s)void request('leave',{},s).catch(()=>{});
  cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setAvatars({});setPeerStates({});setScreen(null);setLocalStream(null);setSharing(false);setShareAudio(false);setMuted(false);setError('');
 }

 async function tuneAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   const enc=params.encodings[0];enc.maxBitrate=80000;enc.priority='high';enc.networkPriority='high';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneShareAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   const enc=params.encodings[0];enc.maxBitrate=96000;enc.priority='medium';enc.networkPriority='medium';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneVideo(sender:RTCRtpSender){
  try{
   const preset=QUALITY[shareQualityRef.current],remoteCount=Math.max(1,Object.keys(connections.current).length);
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   // A call usa mesh: cada pessoa recebe uma cópia da tela. Em vez de derrubar
   // FPS quando entram mais pessoas, reduzimos resolução/bitrate para manter a
   // transmissão fluida e preservar a prioridade do áudio.
   const enc=params.encodings[0];
   const scale=remoteCount>=7?2.35:remoteCount>=5?2:remoteCount>=4?1.7:remoteCount>=3?1.45:remoteCount>=2?1.2:1;
   const budget=remoteCount>=7?230000:remoteCount>=5?280000:remoteCount>=4?330000:remoteCount>=3?400000:remoteCount>=2?Math.min(preset.bitrate,520000):preset.bitrate;
   enc.maxBitrate=Math.max(220000,budget);enc.maxFramerate=remoteCount>=7?15:remoteCount>=5?16:remoteCount>=3?18:preset.fps;enc.scaleResolutionDownBy=scale;enc.priority='low';enc.networkPriority='low';
   params.degradationPreference='maintain-framerate';
   await sender.setParameters(params);
  }catch{}
 }

 function retuneVideo(force=false){
  const peerCount=Object.keys(connections.current).length;
  if(!force&&lastTunedPeerCount.current===peerCount)return;
  lastTunedPeerCount.current=peerCount;
  for(const sender of Object.values(screenVideoSenders.current) as RTCRtpSender[])if(sender.track)void tuneVideo(sender);
 }

 function isInitiator(id:string,s:Session){return s.id<id}

 function setPeerState(id:string,state:PeerState){setPeerStates(old=>old[id]===state?old:{...old,[id]:state})}

 async function sendOffer(id:string,s:Session,restart=false){
  const p=connections.current[id];
  if(!p||session.current!==s||p.signalingState==='closed'||p.signalingState!=='stable'||offerLocks.current[id])return;
  offerLocks.current[id]=true;
  try{
   if(restart)try{p.restartIce()}catch{}
   const offer=await p.createOffer({iceRestart:restart});
   if(session.current!==s||p.signalingState!=='stable')return;
   await p.setLocalDescription(offer);
   await request('signal',{target:id,data:{description:p.localDescription}},s);
   setPeerState(id,restart?'reconnecting':'connecting');
  }catch(e:any){
   if(session.current===s)setError(e?.message||'Falha ao preparar a conexão de áudio.');
  }finally{offerLocks.current[id]=false}
 }

 async function ensureOffer(id:string,s:Session,restart=false){
  const p=connections.current[id];if(!p||session.current!==s)return;
  if(p.signalingState==='have-local-offer'&&p.localDescription?.type==='offer'){
   try{await request('signal',{target:id,data:{description:p.localDescription}},s);setPeerState(id,'reconnecting')}catch{}
   return;
  }
  await sendOffer(id,s,restart);
 }

 function askInitiatorToRepair(id:string,s:Session){
  const now=Date.now();if((repairRequested.current[id]||0)>now-3000)return;repairRequested.current[id]=now;
  void request('signal',{target:id,data:{control:{type:'repair'}}},s).catch(()=>{});
 }

 function scheduleReconnect(id:string,s:Session,delay=1800){
  if(restartTimers.current[id])return;
  setPeerState(id,'reconnecting');
  restartTimers.current[id]=setTimeout(()=>{
   delete restartTimers.current[id];
   const p=connections.current[id];if(session.current!==s||!p)return;
   if(p.connectionState==='connected'||p.iceConnectionState==='connected'||p.iceConnectionState==='completed')return;
   if(isInitiator(id,s))void ensureOffer(id,s,true);else askInitiatorToRepair(id,s);
   scheduleReconnect(id,s,4500);
  },delay);
 }

 function scheduleWatchdog(id:string,s:Session){
  if(watchdogTimers.current[id])clearTimeout(watchdogTimers.current[id]);
  watchdogTimers.current[id]=setTimeout(()=>{
   delete watchdogTimers.current[id];
   const p=connections.current[id];if(session.current!==s||!p)return;
   if(p.connectionState!=='connected')scheduleReconnect(id,s,0);
  },7000);
 }

 function putTrack(setter:Dispatch<SetStateAction<Record<string,MediaStream>>>,id:string,track:MediaStreamTrack){
  setter(old=>{
   const stream=old[id]||new MediaStream();
   if(!stream.getTracks().some(t=>t.id===track.id))stream.addTrack(track);
   return {...old,[id]:stream};
  });
 }

 function attachMicLifecycle(track:MediaStreamTrack,s:Session){
  track.onended=()=>{if(session.current===s)void recoverMicrophone(s)};
 }

 async function acquireMicrophone(deviceId=inputDeviceRef.current){
  const processing=voiceProcessingRef.current;
  const preferred={
   ...(deviceId?{deviceId:{exact:deviceId}}:{}),
   echoCancellation:processing,
   noiseSuppression:processing,
   autoGainControl:processing,
   channelCount:{ideal:1},
   sampleRate:{ideal:48000}
  } as MediaTrackConstraints;
  try{return await navigator.mediaDevices.getUserMedia({audio:preferred,video:false})}
  catch(first:any){
   if(first?.name==='NotAllowedError'||first?.name==='NotFoundError')throw first;
   const fallback=deviceId?{deviceId:{exact:deviceId}}:true;
   return navigator.mediaDevices.getUserMedia({audio:fallback,video:false});
  }
 }

 async function installMicrophone(next:MediaStream,s:Session){
  if(session.current!==s){next.getTracks().forEach(t=>t.stop());return false}
  const track=next.getAudioTracks()[0];if(!track){next.getTracks().forEach(t=>t.stop());throw Error('Nenhum microfone foi encontrado.')}
  track.enabled=!mutedRef.current;if('contentHint' in track)track.contentHint='speech';attachMicLifecycle(track,s);
  const previous=mic.current;mic.current=next;setLocalStream(next);
  const selected=track.getSettings?.().deviceId||inputDeviceRef.current||'';inputDeviceRef.current=selected;setInputDeviceId(selected);
  await Promise.allSettled((Object.entries(voiceSenders.current) as [string,RTCRtpSender][]).map(async([id,sender])=>{await sender.replaceTrack(track);await tuneAudio(sender);if(connections.current[id]?.connectionState!=='connected')scheduleReconnect(id,s,0)}));
  previous?.getTracks().forEach(t=>{t.onended=null;t.stop()});
  return true;
 }

 async function recoverMicrophone(s:Session){
  if(micRecovering.current||session.current!==s)return;micRecovering.current=true;
  try{
   const next=await acquireMicrophone();if(session.current!==s){next.getTracks().forEach(t=>t.stop());return}
   await installMicrophone(next,s);
   setError(old=>old.includes('microfone')?'':old);
  }catch{if(session.current===s)setError('O microfone foi desconectado. Verifique o dispositivo e permita o acesso novamente.')}finally{micRecovering.current=false}
 }

 function connection(id:string,s:Session){
  if(connections.current[id])return connections.current[id];
  const p=new RTCPeerConnection({iceServers:iceServers.current,iceTransportPolicy:'all',bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:8});connections.current[id]=p;setPeerState(id,'new');
  const audioTrack=mic.current?.getAudioTracks()[0];
  const voice=audioTrack?p.addTransceiver(audioTrack,{direction:'sendrecv'}):p.addTransceiver('audio',{direction:'sendrecv'});preferOpus(voice);voiceSenders.current[id]=voice.sender;if(audioTrack)void tuneAudio(voice.sender);
  const video=p.addTransceiver('video',{direction:'sendrecv'});screenVideoSenders.current[id]=video.sender;
  const sharedAudio=p.addTransceiver('audio',{direction:'sendrecv'});preferOpus(sharedAudio);screenAudioSenders.current[id]=sharedAudio.sender;
  const displayVideo=display.current?.getVideoTracks()[0],displayAudio=display.current?.getAudioTracks()[0];
  if(displayVideo){void video.sender.replaceTrack(displayVideo).then(()=>tuneVideo(video.sender))}
  if(displayAudio){void sharedAudio.sender.replaceTrack(displayAudio).then(()=>tuneShareAudio(sharedAudio.sender))}

  p.onicecandidate=e=>{if(e.candidate)void request('signal',{target:id,data:{candidate:e.candidate.toJSON()}},s).catch(e=>{if(session.current===s)setError(e.message)})};
  p.ontrack=e=>{
   const isScreen=e.transceiver===video||e.transceiver===sharedAudio;
   putTrack(isScreen?setScreenStreams:setStreams,id,e.track);
   if(e.transceiver===video){
    const active=()=>setRemoteSharing(old=>old[id]?old:{...old,[id]:true});
    const ended=()=>setRemoteSharing(old=>old[id]===false?old:{...old,[id]:false});
    e.track.addEventListener('unmute',active);e.track.addEventListener('ended',ended);
    if(!e.track.muted&&e.track.readyState==='live')queueMicrotask(active);
   }
   e.track.addEventListener('ended',()=>{
    const setter=isScreen?setScreenStreams:setStreams;
    setter(cur=>{const current=cur[id];if(!current)return cur;current.removeTrack(e.track);return {...cur,[id]:current}});
   });
  };
  const connected=()=>{
   clearPeerTimer(id);repairRequested.current[id]=0;setPeerState(id,'connected');
   setError(old=>old.startsWith('Reconectando áudio')||old.includes('conexão de áudio falhou')?'':old);
  };
  p.oniceconnectionstatechange=()=>{
   if(p.iceConnectionState==='connected'||p.iceConnectionState==='completed')connected();
   else if(p.iceConnectionState==='checking')scheduleWatchdog(id,s);
   else if(p.iceConnectionState==='failed'||p.iceConnectionState==='disconnected')scheduleReconnect(id,s);
  };
  p.onconnectionstatechange=()=>{
   if(p.connectionState==='connected')connected();
   else if(p.connectionState==='connecting'||p.connectionState==='new'){setPeerState(id,'connecting');scheduleWatchdog(id,s)}
   else if(p.connectionState==='disconnected')scheduleReconnect(id,s);
   else if(p.connectionState==='failed'){
    setPeerState(id,'failed');scheduleReconnect(id,s,0);
    if(session.current===s)setError(turnConfigured?'A conexão de áudio falhou e está tentando novamente pelo TURN…':'A conexão de áudio falhou. Configure o TURN no Railway para redes bloqueadas.');
   }
  };
  if(display.current){queueMicrotask(()=>{if(session.current===s&&display.current)void request('signal',{target:id,data:{media:{sharing:true,shareAudio:Boolean(display.current.getAudioTracks()[0])}}},s).catch(()=>{})})}
  scheduleWatchdog(id,s);
  return p;
 }

 async function syncAvatar(person:Person,s:Session){
  const version=Number(person.avatarVersion)||0;
  if(!person.hasAvatar){avatarVersions.current[person.id]=version;setAvatars(old=>old[person.id]?{...old,[person.id]:''}:old);return}
  if(avatarVersions.current[person.id]===version||avatarLoading.current.has(person.id))return;
  avatarLoading.current.add(person.id);
  try{
   const result=await request('avatar',{target:person.id},s);
   if(session.current!==s)return;
   avatarVersions.current[person.id]=Number(result.avatarVersion)||version;
   setAvatars(old=>({...old,[person.id]:typeof result.avatar==='string'?result.avatar:''}));
  }catch{}finally{avatarLoading.current.delete(person.id)}
 }

 async function handleSignal(signal:any,s:Session,ids:Set<string>){
  if(!ids.has(signal.sender))return true;
  let data:any;try{data=JSON.parse(signal.data)}catch{return true}
  if(data.media){
   const active=Boolean(data.media.sharing);setRemoteSharing(old=>old[signal.sender]===active?old:{...old,[signal.sender]:active});setRemoteShareAudio(old=>old[signal.sender]===Boolean(data.media.shareAudio)?old:{...old,[signal.sender]:Boolean(data.media.shareAudio)});return true;
  }
  if(data.control?.type==='repair'){
   if(isInitiator(signal.sender,s)){const p=connection(signal.sender,s);if(p)void ensureOffer(signal.sender,s,true)}
   return true;
  }
  const p=connection(signal.sender,s);
  try{
   if(data.description){
    const description=data.description as RTCSessionDescriptionInit;
    const collision=description.type==='offer'&&(offerLocks.current[signal.sender]||p.signalingState!=='stable');
    const polite=!isInitiator(signal.sender,s);
    if(collision&&!polite)return true;
    if(collision&&polite){try{await p.setLocalDescription({type:'rollback'} as RTCSessionDescriptionInit)}catch{}}
    await p.setRemoteDescription(description);
    const queued=pending.current[signal.sender]||[];pending.current[signal.sender]=[];
    for(const c of queued){try{await p.addIceCandidate(c)}catch{}}
    if(description.type==='offer'){
     await p.setLocalDescription(await p.createAnswer());
     await request('signal',{target:signal.sender,data:{description:p.localDescription}},s);
     setPeerState(signal.sender,'connecting');scheduleWatchdog(signal.sender,s);
    }
    return true;
   }
   if(data.candidate){
    if(p.remoteDescription)try{await p.addIceCandidate(data.candidate)}catch{}else(pending.current[signal.sender]??=[]).push(data.candidate);
    return true;
   }
  }catch(e){
   console.warn('WebRTC signal error',e);scheduleReconnect(signal.sender,s,0);return true;
  }
  return true;
 }

 async function apply(j:any,s:Session){
  if(session.current!==s)return;
  const rawPeers:Array<Person>=Array.isArray(j.peers)?j.peers:[];
  // Defesa extra contra respostas repetidas: um id só pode aparecer uma vez na UI.
  const peers=[...new Map(rawPeers.filter(p=>p&&typeof p.id==='string').map(p=>[p.id,p] as const)).values()];setPeople(peers);
  const ids=new Set<string>(peers.map(p=>p.id));
  for(const id of Object.keys(connections.current)){
   if(!ids.has(id)){
    dropConnection(id);setStreams(o=>{const n={...o};delete n[id];return n});setScreenStreams(o=>{const n={...o};delete n[id];return n});setRemoteSharing(o=>{const n={...o};delete n[id];return n});setRemoteShareAudio(o=>{const n={...o};delete n[id];return n});setAvatars(o=>{const n={...o};delete n[id];return n});setPeerStates(o=>{const n={...o};delete n[id];return n});delete avatarVersions.current[id];
   }
  }
  for(const person of peers){
   void syncAvatar(person,s);
   if(person.id!==s.id&&isInitiator(person.id,s)&&!connections.current[person.id]){connection(person.id,s);void ensureOffer(person.id,s)}
  }
  for(const signal of Array.isArray(j.signals)?j.signals:[]){
   const processed=await handleSignal(signal,s,ids);
   if(processed)s.after=Math.max(s.after,Number(signal.id)||0);
  }
  retuneVideo();
 }

 async function join(name:string,avatar=''){
  if(busy||joined)return;
  setBusy(true);setError('');
  try{
   if(!space)throw Error('A sala ainda está carregando. Tente novamente em um instante.');
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Abra o site em uma janela segura do Chrome ou Edge para usar o microfone.');
   await loadIceConfig();
   const initialMic=await acquireMicrophone();
   const track=initialMic.getAudioTracks()[0];if(!track)throw Error('Nenhum microfone foi encontrado.');track.enabled=true;if('contentHint' in track)track.contentHint='speech';
   const s:Session={room:space+'-'+channel,id:crypto.randomUUID(),token:crypto.randomUUID(),after:0};session.current=s;mic.current=initialMic;attachMicLifecycle(track,s);setLocalStream(initialMic);const selected=track.getSettings?.().deviceId||'';inputDeviceRef.current=selected;setInputDeviceId(selected);
   if(avatar)setAvatars({[s.id]:avatar});
   await apply(await request('join',{name:name.trim()||'Visitante',avatar,clientKey:clientKeyRef.current||s.id},s),s);setJoined(true);void poll(s);
  }catch(e:any){
   const message=e?.name==='NotAllowedError'?'Permita o microfone no navegador e tente novamente.':e?.name==='NotFoundError'?'Nenhum microfone foi encontrado neste dispositivo.':e?.message||'Não foi possível entrar na call.';
   cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setPeerStates({});setLocalStream(null);setError(message);
  }finally{setBusy(false)}
 }

 async function poll(s:Session){
  let failures=0;
  while(session.current===s){
   await new Promise(r=>setTimeout(r,failures?Math.min(2400,650*failures):450));if(session.current!==s)return;
   try{
    await apply(await request('poll',{},s),s);failures=0;setError(old=>old.startsWith('Reconectando com a sala')?'':old);
   }catch(e:any){
    if(session.current!==s)return;
    if(e?.status!==401&&failures<6){failures++;setError(`Reconectando com a sala… tentativa ${failures}/6`);continue}
    const message=e?.message||'A conexão com a sala caiu.';cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setPeerStates({});setScreen(null);setLocalStream(null);setSharing(false);setError(message);return;
   }
  }
 }

 function toggleMute(){
  const next=!mutedRef.current;mutedRef.current=next;mic.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);
 }

 async function switchMicrophone(deviceId:string){
  const previous=inputDeviceRef.current;inputDeviceRef.current=deviceId;setInputDeviceId(deviceId);const s=session.current;
  if(!s)return true;
  try{setError('');const next=await acquireMicrophone(deviceId);await installMicrophone(next,s);return true}
  catch(e:any){inputDeviceRef.current=previous;setInputDeviceId(previous);setError(e?.name==='NotAllowedError'?'Permita o acesso ao microfone para trocar o dispositivo.':e?.message||'Não foi possível trocar o microfone.');return false}
 }

 async function setVoiceProcessing(enabled:boolean){
  voiceProcessingRef.current=enabled;setVoiceProcessingState(enabled);
  const track=mic.current?.getAudioTracks()[0];if(!track)return true;
  try{await track.applyConstraints({echoCancellation:enabled,noiseSuppression:enabled,autoGainControl:enabled});return true}
  catch{setError('Seu navegador não conseguiu aplicar esse processamento ao microfone atual.');return false}
 }

 async function updateProfile(name:string,avatar:string){
  const s=session.current;if(!s)return false;
  try{setError('');const result=await request('profile',{name:name.trim()||'Visitante',avatar},s);if(avatar)setAvatars(old=>({...old,[s.id]:avatar}));else setAvatars(old=>({...old,[s.id]:''}));await apply(result,s);return true}catch(e:any){setError(e?.message||'Não foi possível atualizar o perfil.');return false}
 }

 async function announceMedia(s:Session,sharingNow:boolean,hasAudio:boolean){
  await Promise.allSettled(Object.keys(connections.current).map(id=>request('signal',{target:id,data:{media:{sharing:sharingNow,shareAudio:hasAudio}}},s)));
 }

 async function stopScreen(){
  const s=session.current,current=display.current;display.current=null;
  current?.getTracks().forEach(t=>{t.onended=null;t.stop()});setScreen(null);setSharing(false);setShareAudio(false);
  await Promise.allSettled(Object.keys(connections.current).flatMap(id=>{
   const jobs:Promise<void>[]=[];const vs=screenVideoSenders.current[id],as=screenAudioSenders.current[id];if(vs)jobs.push(vs.replaceTrack(null));if(as)jobs.push(as.replaceTrack(null));return jobs;
  }));
  if(s)void announceMedia(s,false,false);
 }

 async function setShareQuality(next:ShareQuality){
  shareQualityRef.current=next;setShareQualityState(next);
  const preset=QUALITY[next],track=display.current?.getVideoTracks()[0];
  if(track){try{await track.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}if('contentHint' in track)track.contentHint=next==='high'?'detail':'motion';retuneVideo(true)}
 }

 async function share(){
  setError('');if(sharing){await stopScreen();return}
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('O compartilhamento de tela está disponível em navegadores compatíveis no computador.');
   const preset=QUALITY[shareQualityRef.current];
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:preset.width,max:preset.width},height:{ideal:preset.height,max:preset.height},frameRate:{ideal:preset.fps,max:preset.fps}},audio:true});
   const videoTrack=stream.getVideoTracks()[0],audioTrack=stream.getAudioTracks()[0];if(!videoTrack){stream.getTracks().forEach(t=>t.stop());throw Error('Nenhuma tela foi selecionada.');}
   try{await videoTrack.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}
   if('contentHint' in videoTrack)videoTrack.contentHint=shareQualityRef.current==='high'?'detail':'motion';if(audioTrack&&'contentHint' in audioTrack)audioTrack.contentHint='music';
   display.current=stream;setScreen(stream);setSharing(true);setShareAudio(Boolean(audioTrack));videoTrack.onended=()=>{void stopScreen()};
   if(audioTrack)audioTrack.onended=()=>{setShareAudio(false);for(const sender of Object.values(screenAudioSenders.current) as RTCRtpSender[])void sender.replaceTrack(null).catch(()=>{});const s=session.current;if(s)void announceMedia(s,true,false)};
   await Promise.allSettled(Object.keys(connections.current).flatMap(id=>{
    const jobs:Promise<void>[]=[];const vs=screenVideoSenders.current[id],as=screenAudioSenders.current[id];if(vs)jobs.push(vs.replaceTrack(videoTrack).then(()=>tuneVideo(vs)));if(as)jobs.push(as.replaceTrack(audioTrack||null).then(()=>audioTrack?tuneShareAudio(as):undefined));return jobs;
   }));
   // Os transceivers de tela já são negociados quando a call conecta. Usar
   // replaceTrack aqui evita colisões de SDP e faz a tela aparecer sem quebrar o áudio.
   const s=session.current;if(s)await announceMedia(s,true,Boolean(audioTrack));
  }catch(e:any){if(e?.name!=='NotAllowedError')setError(e?.message||'Não foi possível iniciar a transmissão.')}
 }

 function repairAudio(){
  const s=session.current;if(!s)return;
  setError('Reconectando áudio com a sala…');
  for(const id of Object.keys(connections.current)){if(isInitiator(id,s))void ensureOffer(id,s,true);else askInitiatorToRepair(id,s)}
 }

 async function invite(){
  try{await navigator.clipboard.writeText(location.href);setError('Link copiado! Envie para sua galera entrar na mesma sala.')}catch{setError('Não consegui copiar automaticamente. Copie o endereço completo da barra do navegador.')}
 }

 return {people,streams,screenStreams,remoteSharing,remoteShareAudio,avatars,joined,busy,error,muted,sharing,screen,localStream,shareAudio,shareQuality,peerStates,turnConfigured,inputDeviceId,voiceProcessing,join,leave,toggleMute,share,setShareQuality,invite,updateProfile,repairAudio,switchMicrophone,setVoiceProcessing,self:session.current?.id};
}
