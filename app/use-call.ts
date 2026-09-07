'use client';
import { useEffect,useRef,useState } from 'react';

type Person={id:string;name:string;hasAvatar:number|boolean;avatarVersion:number};
type IceServer={urls:string|string[];username?:string;credential?:string};
type Session={room:string;id:string;token:string;after:number};
export type ShareQuality='stable'|'balanced'|'high';

type QualityPreset={width:number;height:number;fps:number;bitrate:number};
const QUALITY:Record<ShareQuality,QualityPreset>={
 stable:{width:960,height:540,fps:15,bitrate:850000},
 balanced:{width:1280,height:720,fps:20,bitrate:1450000},
 high:{width:1920,height:1080,fps:30,bitrate:2400000},
};

const FALLBACK_ICE:IceServer[]=[
 {urls:'stun:stun.cloudflare.com:3478'},
 {urls:'stun:stun.l.google.com:19302'},
];

export function useCall(channel:string){
 const [people,setPeople]=useState<Person[]>([]),[streams,setStreams]=useState<Record<string,MediaStream>>({}),[screenStreams,setScreenStreams]=useState<Record<string,MediaStream>>({}),[remoteSharing,setRemoteSharing]=useState<Record<string,boolean>>({}),[remoteShareAudio,setRemoteShareAudio]=useState<Record<string,boolean>>({}),[avatars,setAvatars]=useState<Record<string,string>>({}),[joined,setJoined]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[sharing,setSharing]=useState(false),[screen,setScreen]=useState<MediaStream|null>(null),[localStream,setLocalStream]=useState<MediaStream|null>(null),[space,setSpace]=useState(''),[shareQuality,setShareQualityState]=useState<ShareQuality>('balanced'),[shareAudio,setShareAudio]=useState(false);
 const session=useRef<Session|null>(null),mic=useRef<MediaStream|null>(null),display=useRef<MediaStream|null>(null),connections=useRef<Record<string,RTCPeerConnection>>({}),pending=useRef<Record<string,RTCIceCandidateInit[]>>({}),iceServers=useRef<IceServer[]>(FALLBACK_ICE),restartTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({}),screenVideoSenders=useRef<Record<string,RTCRtpSender>>({}),screenAudioSenders=useRef<Record<string,RTCRtpSender>>({}),voiceSenders=useRef<Record<string,RTCRtpSender>>({}),shareQualityRef=useRef<ShareQuality>('balanced'),avatarVersions=useRef<Record<string,number>>({}),avatarLoading=useRef<Set<string>>(new Set());

 useEffect(()=>{
  let key=location.hash.slice(1);
  if(!/^[a-f0-9-]{36}$/.test(key)){key=crypto.randomUUID();history.replaceState(null,'','#'+key)}
  setSpace(key);void loadIceConfig();
  return()=>{cleanup()};
 },[]);

 async function loadIceConfig(){
  try{
   const r=await fetch('/api/config',{cache:'no-store'});
   if(!r.ok)return;
   const j=await r.json();
   if(Array.isArray(j.iceServers)&&j.iceServers.length)iceServers.current=j.iceServers;
  }catch{}
 }

 function cleanup(){
  session.current=null;
  mic.current?.getTracks().forEach(t=>t.stop());
  display.current?.getTracks().forEach(t=>t.stop());
  Object.values(restartTimers.current).forEach(clearTimeout);restartTimers.current={};
  Object.values(connections.current).forEach(p=>p.close());
  connections.current={};pending.current={};screenVideoSenders.current={};screenAudioSenders.current={};voiceSenders.current={};mic.current=null;display.current=null;avatarLoading.current.clear();avatarVersions.current={};
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
  cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setAvatars({});setScreen(null);setLocalStream(null);setSharing(false);setShareAudio(false);setMuted(false);setError('');
 }

 async function tuneAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   params.encodings[0].maxBitrate=72000;params.encodings[0].priority='high';params.encodings[0].networkPriority='high';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneShareAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   params.encodings[0].maxBitrate=112000;params.encodings[0].priority='medium';params.encodings[0].networkPriority='medium';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneVideo(sender:RTCRtpSender){
  try{
   const preset=QUALITY[shareQualityRef.current],remoteCount=Math.max(1,Object.keys(connections.current).length);
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   // Como a sala é mesh, cada pessoa recebe uma cópia. Reduzimos resolução/FPS
   // gradualmente quando a sala cresce para não fazer o áudio engasgar.
   const perPeer=Math.max(260000,Math.floor(preset.bitrate/Math.max(1,remoteCount*.82)));
   const enc=params.encodings[0];enc.maxBitrate=perPeer;enc.maxFramerate=remoteCount>=5?Math.min(15,preset.fps):remoteCount>=3?Math.min(18,preset.fps):preset.fps;
   enc.scaleResolutionDownBy=remoteCount>=7?2:remoteCount>=4?1.5:remoteCount>=3?1.25:1;
   enc.priority='medium';enc.networkPriority='low';
   params.degradationPreference=shareQualityRef.current==='stable'?'maintain-framerate':'balanced';
   await sender.setParameters(params);
  }catch{}
 }

 function retuneVideo(){for(const sender of Object.values(screenVideoSenders.current))if(sender.track)void tuneVideo(sender)}

 function makeOffer(id:string,s:Session,restart=false){
  const p=connections.current[id];if(!p||p.signalingState==='closed'||p.signalingState!=='stable')return;
  void (async()=>{
   try{
    if(restart)p.restartIce();
    await p.setLocalDescription(await p.createOffer({iceRestart:restart}));
    await request('signal',{target:id,data:{description:p.localDescription}},s);
   }catch(e:any){if(session.current===s)setError(e.message||'Falha ao reconectar o áudio.');}
  })();
 }

 function scheduleReconnect(id:string,s:Session){
  if(restartTimers.current[id])return;
  restartTimers.current[id]=setTimeout(()=>{
   delete restartTimers.current[id];
   const p=connections.current[id];if(session.current!==s||!p)return;
   if((p.iceConnectionState==='failed'||p.iceConnectionState==='disconnected')&&s.id<id)makeOffer(id,s,true);
  },2500);
 }

 function putTrack(setter:React.Dispatch<React.SetStateAction<Record<string,MediaStream>>>,id:string,track:MediaStreamTrack){
  setter(old=>{
   const stream=old[id]||new MediaStream();
   if(!stream.getTracks().some(t=>t.id===track.id))stream.addTrack(track);
   return {...old,[id]:stream};
  });
 }

 function connection(id:string,s:Session){
  if(connections.current[id])return connections.current[id];
  const p=new RTCPeerConnection({iceServers:iceServers.current,bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:4});connections.current[id]=p;
  const audioTrack=mic.current?.getAudioTracks()[0];
  const voice=audioTrack?p.addTransceiver(audioTrack,{direction:'sendrecv'}):p.addTransceiver('audio',{direction:'sendrecv'});voiceSenders.current[id]=voice.sender;if(audioTrack)void tuneAudio(voice.sender);
  const video=p.addTransceiver('video',{direction:'sendrecv'});screenVideoSenders.current[id]=video.sender;
  const sharedAudio=p.addTransceiver('audio',{direction:'sendrecv'});screenAudioSenders.current[id]=sharedAudio.sender;
  const displayVideo=display.current?.getVideoTracks()[0],displayAudio=display.current?.getAudioTracks()[0];
  if(displayVideo){void video.sender.replaceTrack(displayVideo).then(()=>tuneVideo(video.sender))}
  if(displayAudio){void sharedAudio.sender.replaceTrack(displayAudio).then(()=>tuneShareAudio(sharedAudio.sender))}

  p.onicecandidate=e=>{if(e.candidate)void request('signal',{target:id,data:{candidate:e.candidate.toJSON()}},s).catch(e=>{if(session.current===s)setError(e.message)})};
  p.ontrack=e=>{
   const isScreen=e.transceiver===video||e.transceiver===sharedAudio;
   putTrack(isScreen?setScreenStreams:setStreams,id,e.track);
   if(e.transceiver===video){
    // `mute` também acontece em oscilações curtas de rede. Não escondemos a
    // transmissão por isso; o estado explícito `media` decide quando ela para.
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
  p.oniceconnectionstatechange=()=>{
   if(p.iceConnectionState==='connected'||p.iceConnectionState==='completed'){
    if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
   }else if(p.iceConnectionState==='failed'||p.iceConnectionState==='disconnected')scheduleReconnect(id,s);
  };
  p.onconnectionstatechange=()=>{
   if(p.connectionState==='connected'&&session.current===s)setError(old=>old.includes('conexão direta falhou')?'':old);
   if(p.connectionState==='failed'&&session.current===s)setError('A conexão direta falhou. Para funcionar em todas as redes, configure um servidor TURN no Railway.');
  };
  if(display.current){queueMicrotask(()=>{if(session.current===s&&display.current)void request('signal',{target:id,data:{media:{sharing:true,shareAudio:Boolean(display.current.getAudioTracks()[0])}}},s).catch(()=>{})})}
  return p;
 }

 async function syncAvatar(person:Person,s:Session){
  const version=Number(person.avatarVersion)||0;
  if(!person.hasAvatar){
   avatarVersions.current[person.id]=version;setAvatars(old=>old[person.id]?{...old,[person.id]:''}:old);return;
  }
  if(avatarVersions.current[person.id]===version||avatarLoading.current.has(person.id))return;
  avatarLoading.current.add(person.id);
  try{
   const result=await request('avatar',{target:person.id},s);
   if(session.current!==s)return;
   avatarVersions.current[person.id]=Number(result.avatarVersion)||version;
   setAvatars(old=>({...old,[person.id]:typeof result.avatar==='string'?result.avatar:''}));
  }catch{}finally{avatarLoading.current.delete(person.id)}
 }

 async function apply(j:any,s:Session){
  if(session.current!==s)return;
  const peers:Array<Person>=Array.isArray(j.peers)?j.peers:[];setPeople(peers);
  const ids=new Set<string>(peers.map(p=>p.id));
  for(const id of Object.keys(connections.current)){
   if(!ids.has(id)){
    connections.current[id].close();delete connections.current[id];delete screenVideoSenders.current[id];delete screenAudioSenders.current[id];delete voiceSenders.current[id];
    if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
    setStreams(o=>{const n={...o};delete n[id];return n});setScreenStreams(o=>{const n={...o};delete n[id];return n});setRemoteSharing(o=>{const n={...o};delete n[id];return n});setRemoteShareAudio(o=>{const n={...o};delete n[id];return n});setAvatars(o=>{const n={...o};delete n[id];return n});delete avatarVersions.current[id];
   }
  }
  for(const person of peers){
   void syncAvatar(person,s);
   if(person.id!==s.id&&s.id<person.id&&!connections.current[person.id]){connection(person.id,s);makeOffer(person.id,s)}
  }
  retuneVideo();
  for(const signal of Array.isArray(j.signals)?j.signals:[]){
   s.after=Math.max(s.after,Number(signal.id)||0);if(!ids.has(signal.sender))continue;
   let data:any;try{data=JSON.parse(signal.data)}catch{continue}
   const p=connection(signal.sender,s);
   try{
    if(data.media){
     const active=Boolean(data.media.sharing);
     setRemoteSharing(old=>old[signal.sender]===active?old:{...old,[signal.sender]:active});
     setRemoteShareAudio(old=>old[signal.sender]===Boolean(data.media.shareAudio)?old:{...old,[signal.sender]:Boolean(data.media.shareAudio)});
     continue;
    }
    if(data.description){
     if(data.description.type==='offer'&&p.signalingState!=='stable'){
      if(s.id<signal.sender)continue;
      try{await p.setLocalDescription({type:'rollback'} as RTCSessionDescriptionInit)}catch{}
     }
     await p.setRemoteDescription(data.description);
     for(const c of pending.current[signal.sender]||[])await p.addIceCandidate(c);
     pending.current[signal.sender]=[];
     if(data.description.type==='offer'){
      await p.setLocalDescription(await p.createAnswer());
      await request('signal',{target:signal.sender,data:{description:p.localDescription}},s);
     }
    }else if(data.candidate){
     if(p.remoteDescription)await p.addIceCandidate(data.candidate);else(pending.current[signal.sender]??=[]).push(data.candidate);
    }
   }catch(e){console.warn('WebRTC signal error',e)}
  }
 }

 async function join(name:string,avatar=''){
  if(busy||joined)return;
  setBusy(true);setError('');
  try{
   if(!space)throw Error('A sala ainda está carregando. Tente novamente em um instante.');
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Abra o site em uma janela segura do Chrome ou Edge para usar o microfone.');
   await loadIceConfig();
   mic.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,sampleRate:48000},video:false});
   const track=mic.current.getAudioTracks()[0];if(track&&'contentHint' in track)track.contentHint='speech';setLocalStream(mic.current);
   const s:Session={room:space+'-'+channel,id:crypto.randomUUID(),token:crypto.randomUUID(),after:0};session.current=s;
   if(avatar)setAvatars({[s.id]:avatar});
   await apply(await request('join',{name:name.trim()||'Visitante',avatar},s),s);setJoined(true);void poll(s);
  }catch(e:any){
   const message=e?.name==='NotAllowedError'?'Permita o microfone no navegador e tente novamente.':e?.name==='NotFoundError'?'Nenhum microfone foi encontrado neste dispositivo.':e?.message||'Não foi possível entrar na call.';
   cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setLocalStream(null);setError(message);
  }finally{setBusy(false)}
 }

 async function poll(s:Session){
  let failures=0;
  while(session.current===s){
   await new Promise(r=>setTimeout(r,failures?Math.min(2500,700*failures):600));if(session.current!==s)return;
   try{
    await apply(await request('poll',{},s),s);failures=0;setError(old=>old.startsWith('Reconectando com a sala')?'':old);
   }catch(e:any){
    if(session.current!==s)return;
    if(e?.status!==401&&failures<4){failures++;setError(`Reconectando com a sala… tentativa ${failures}/4`);continue}
    const message=e?.message||'A conexão com a sala caiu.';cleanup();setJoined(false);setPeople([]);setStreams({});setScreenStreams({});setRemoteSharing({});setRemoteShareAudio({});setScreen(null);setLocalStream(null);setSharing(false);setError(message);return;
   }
  }
 }

 function toggleMute(){
  const next=!muted;mic.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next);
 }

 async function updateProfile(name:string,avatar:string){
  const s=session.current;if(!s)return false;
  try{setError('');const result=await request('profile',{name:name.trim()||'Visitante',avatar},s);if(avatar)setAvatars(old=>({...old,[s.id]:avatar}));else setAvatars(old=>({...old,[s.id]:''}));await apply(result,s);return true}catch(e:any){setError(e?.message||'Não foi possível atualizar o perfil.');return false}
 }

 async function announceMedia(s:Session,sharingNow:boolean,hasAudio:boolean){
  await Promise.allSettled(Object.keys(connections.current).map(id=>request('signal',{target:id,data:{media:{sharing:sharingNow,shareAudio:hasAudio}}},s)));
 }

 function renegotiateAll(s:Session){
  // replaceTrack normalmente dispensa renegociação, mas uma nova oferta após
  // iniciar/parar a tela melhora compatibilidade entre Chrome/Edge/Firefox e
  // garante que a trilha de vídeo seja anunciada corretamente ao outro lado.
  window.setTimeout(()=>{
   if(session.current!==s)return;
   for(const id of Object.keys(connections.current))makeOffer(id,s);
  },90);
 }

 async function stopScreen(){
  const s=session.current,current=display.current;display.current=null;
  current?.getTracks().forEach(t=>{t.onended=null;t.stop()});setScreen(null);setSharing(false);setShareAudio(false);
  await Promise.allSettled(Object.keys(connections.current).flatMap(id=>{
   const jobs:Promise<void>[]=[];const vs=screenVideoSenders.current[id],as=screenAudioSenders.current[id];if(vs)jobs.push(vs.replaceTrack(null));if(as)jobs.push(as.replaceTrack(null));return jobs;
  }));
  if(s){void announceMedia(s,false,false);renegotiateAll(s)}
 }

 async function setShareQuality(next:ShareQuality){
  shareQualityRef.current=next;setShareQualityState(next);
  const preset=QUALITY[next],track=display.current?.getVideoTracks()[0];
  if(track){try{await track.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}retuneVideo()}
 }

 async function share(){
  setError('');if(sharing){await stopScreen();return}
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('O compartilhamento de tela está disponível em navegadores compatíveis no computador.');
   const preset=QUALITY[shareQualityRef.current];
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:preset.width,max:preset.width},height:{ideal:preset.height,max:preset.height},frameRate:{ideal:preset.fps,max:preset.fps}},audio:true});
   const videoTrack=stream.getVideoTracks()[0],audioTrack=stream.getAudioTracks()[0];if(!videoTrack){stream.getTracks().forEach(t=>t.stop());throw Error('Nenhuma tela foi selecionada.');}
   try{await videoTrack.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}
   if('contentHint' in videoTrack)videoTrack.contentHint='detail';if(audioTrack&&'contentHint' in audioTrack)audioTrack.contentHint='music';
   display.current=stream;setScreen(stream);setSharing(true);setShareAudio(Boolean(audioTrack));videoTrack.onended=()=>{void stopScreen()};
   if(audioTrack)audioTrack.onended=()=>{setShareAudio(false);for(const sender of Object.values(screenAudioSenders.current))void sender.replaceTrack(null).catch(()=>{});const s=session.current;if(s)void announceMedia(s,true,false)};
   await Promise.allSettled(Object.keys(connections.current).flatMap(id=>{
    const jobs:Promise<void>[]=[];const vs=screenVideoSenders.current[id],as=screenAudioSenders.current[id];if(vs)jobs.push(vs.replaceTrack(videoTrack).then(()=>tuneVideo(vs)));if(as)jobs.push(as.replaceTrack(audioTrack||null).then(()=>audioTrack?tuneShareAudio(as):undefined));return jobs;
   }));
   const s=session.current;if(s){await announceMedia(s,true,Boolean(audioTrack));renegotiateAll(s)}
  }catch(e:any){if(e?.name!=='NotAllowedError')setError(e?.message||'Não foi possível iniciar a transmissão.')}
 }

 async function invite(){
  try{await navigator.clipboard.writeText(location.href);setError('Link copiado! Envie para sua galera entrar na mesma sala.')}catch{setError('Não consegui copiar automaticamente. Copie o endereço completo da barra do navegador.')}
 }

 return {people,streams,screenStreams,remoteSharing,remoteShareAudio,avatars,joined,busy,error,muted,sharing,screen,localStream,shareAudio,shareQuality,join,leave,toggleMute,share,setShareQuality,invite,updateProfile,self:session.current?.id};
}
