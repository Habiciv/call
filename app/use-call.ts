'use client';
import { useEffect,useRef,useState } from 'react';

type Person={id:string;name:string};
type IceServer={urls:string|string[];username?:string;credential?:string};
type Session={room:string;id:string;token:string;after:number};
export type ShareQuality='stable'|'balanced'|'high';

type QualityPreset={width:number;height:number;fps:number;bitrate:number};
const QUALITY:Record<ShareQuality,QualityPreset>={
 stable:{width:960,height:540,fps:15,bitrate:900000},
 balanced:{width:1280,height:720,fps:20,bitrate:1600000},
 high:{width:1920,height:1080,fps:30,bitrate:2600000},
};

const FALLBACK_ICE:IceServer[]=[
 {urls:'stun:stun.cloudflare.com:3478'},
 {urls:'stun:stun.l.google.com:19302'},
];

export function useCall(channel:string){
 const [people,setPeople]=useState<Person[]>([]),[streams,setStreams]=useState<Record<string,MediaStream>>({}),[joined,setJoined]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[sharing,setSharing]=useState(false),[screen,setScreen]=useState<MediaStream|null>(null),[localStream,setLocalStream]=useState<MediaStream|null>(null),[space,setSpace]=useState(''),[shareQuality,setShareQualityState]=useState<ShareQuality>('balanced'),[shareAudio,setShareAudio]=useState(false);
 const session=useRef<Session|null>(null),mic=useRef<MediaStream|null>(null),display=useRef<MediaStream|null>(null),connections=useRef<Record<string,RTCPeerConnection>>({}),pending=useRef<Record<string,RTCIceCandidateInit[]>>({}),iceServers=useRef<IceServer[]>(FALLBACK_ICE),restartTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({}),screenVideoSenders=useRef<Record<string,RTCRtpSender>>({}),screenAudioSenders=useRef<Record<string,RTCRtpSender>>({}),shareQualityRef=useRef<ShareQuality>('balanced');

 useEffect(()=>{let key=location.hash.slice(1);if(!/^[a-f0-9-]{36}$/.test(key)){key=crypto.randomUUID();history.replaceState(null,'','#'+key)}setSpace(key);void loadIceConfig();return()=>{cleanup()}},[]);

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
  Object.values(connections.current).forEach(p=>p.close());connections.current={};pending.current={};screenVideoSenders.current={};screenAudioSenders.current={};mic.current=null;display.current=null;
 }

 async function request(action:string,extra:any={},s=session.current){
  if(!s)throw Error('Entre na call primeiro.');
  const r=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:s.room,id:s.id,token:s.token,after:s.after,...extra}),keepalive:action==='leave'});
  const j:any=await r.json();if(!r.ok)throw Error(j.error||'Falha na conexão.');return j;
 }

 function leave(){const s=session.current;if(s)void request('leave',{},s).catch(()=>{});cleanup();setJoined(false);setPeople([]);setStreams({});setScreen(null);setLocalStream(null);setSharing(false);setShareAudio(false);setMuted(false)}

 async function tuneAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   // O áudio da voz sempre recebe prioridade sobre o compartilhamento de tela.
   params.encodings[0].maxBitrate=72000;params.encodings[0].priority='high';params.encodings[0].networkPriority='high';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneShareAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   params.encodings[0].maxBitrate=128000;params.encodings[0].priority='medium';params.encodings[0].networkPriority='medium';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneVideo(sender:RTCRtpSender){
  try{
   const preset=QUALITY[shareQualityRef.current];
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   // A sala é mesh: cada pessoa recebe uma cópia. Limitamos o upload total para
   // manter a voz limpa mesmo quando várias pessoas entram.
   const remoteCount=Math.max(1,Object.keys(connections.current).length);
   const divisor=Math.max(1,remoteCount*.78);
   const adaptive=Math.max(320000,Math.floor(preset.bitrate/divisor));
   params.encodings[0].maxBitrate=adaptive;
   params.encodings[0].maxFramerate=preset.fps;
   params.encodings[0].priority='medium';
   params.encodings[0].networkPriority='low';
   params.degradationPreference='maintain-resolution';
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
   const p=connections.current[id];
   if(session.current!==s||!p)return;
   if((p.iceConnectionState==='failed'||p.iceConnectionState==='disconnected')&&s.id<id)makeOffer(id,s,true);
  },3000);
 }

 function connection(id:string,s:Session){
  if(connections.current[id])return connections.current[id];
  const p=new RTCPeerConnection({iceServers:iceServers.current,bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:4});connections.current[id]=p;
  const audioTrack=mic.current?.getAudioTracks()[0];
  if(audioTrack){const sender=p.addTrack(audioTrack,mic.current!);void tuneAudio(sender)}
  // Reservamos os transceivers desde o começo. Assim ligar/desligar a tela e o
  // áudio da aba não precisa abrir uma nova negociação e fica bem mais estável.
  const video=p.addTransceiver('video',{direction:'sendrecv'});screenVideoSenders.current[id]=video.sender;
  const sharedAudio=p.addTransceiver('audio',{direction:'sendrecv'});screenAudioSenders.current[id]=sharedAudio.sender;
  const displayVideo=display.current?.getVideoTracks()[0],displayAudio=display.current?.getAudioTracks()[0];
  if(displayVideo){void video.sender.replaceTrack(displayVideo);void tuneVideo(video.sender)}
  if(displayAudio){void sharedAudio.sender.replaceTrack(displayAudio);void tuneShareAudio(sharedAudio.sender)}
  p.onicecandidate=e=>{if(e.candidate)void request('signal',{target:id,data:{candidate:e.candidate.toJSON()}},s).catch(e=>setError(e.message))};
  p.ontrack=e=>{
   setStreams(old=>{
    const stream=old[id]||new MediaStream();
    if(!stream.getTracks().some(t=>t.id===e.track.id))stream.addTrack(e.track);
    e.track.onended=()=>setStreams(cur=>({...cur}));
    return {...old,[id]:stream};
   });
  };
  p.oniceconnectionstatechange=()=>{
   if(p.iceConnectionState==='connected'||p.iceConnectionState==='completed'){
    if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
   }else if(p.iceConnectionState==='failed'||p.iceConnectionState==='disconnected')scheduleReconnect(id,s);
  };
  p.onconnectionstatechange=()=>{
   if(p.connectionState==='failed')setError('A conexão direta falhou. Se isso acontecer em algumas redes, configure um servidor TURN no Railway.');
  };
  return p;
 }

 async function apply(j:any,s:Session){
  if(session.current!==s)return;
  setPeople(j.peers);
  const ids=new Set<string>(j.peers.map((p:Person)=>p.id));
  for(const id of Object.keys(connections.current)){
   if(!ids.has(id)){
    connections.current[id].close();delete connections.current[id];delete screenVideoSenders.current[id];delete screenAudioSenders.current[id];
    if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
    setStreams(o=>{const n={...o};delete n[id];return n});
   }
  }
  for(const person of j.peers as Person[]){
   if(person.id!==s.id&&s.id<person.id&&!connections.current[person.id]){
    connection(person.id,s);makeOffer(person.id,s);
   }
  }
  retuneVideo();
  for(const signal of j.signals){
   s.after=Math.max(s.after,signal.id);if(!ids.has(signal.sender))continue;
   const data=JSON.parse(signal.data),p=connection(signal.sender,s);
   try{
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
   }catch(e:any){console.warn('WebRTC signal error',e)}
  }
 }

 async function join(name:string){
  setBusy(true);setError('');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Abra o site em uma janela segura do Chrome ou Edge para usar o microfone.');
   await loadIceConfig();
   mic.current=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,sampleRate:48000},video:false});
   const track=mic.current.getAudioTracks()[0];if(track&&'contentHint' in track)track.contentHint='speech';
   setLocalStream(mic.current);
   const s:Session={room:space+'-'+channel,id:crypto.randomUUID(),token:crypto.randomUUID(),after:0};session.current=s;
   await apply(await request('join',{name:name.trim()||'Visitante'},s),s);setJoined(true);void poll(s);
  }catch(e:any){leave();setError(e.name==='NotAllowedError'?'Permita o microfone no navegador e tente novamente.':e.message)}finally{setBusy(false)}
 }

 async function poll(s:Session){
  while(session.current===s){
   await new Promise(r=>setTimeout(r,650));if(session.current!==s)return;
   try{await apply(await request('poll',{},s),s)}catch(e:any){if(session.current!==s)return;setError(e.message);leave();return}
  }
 }

 function toggleMute(){const next=!muted;mic.current?.getAudioTracks().forEach(t=>t.enabled=!next);setMuted(next)}

 async function stopScreen(){
  display.current?.getTracks().forEach(t=>t.stop());display.current=null;setScreen(null);setSharing(false);setShareAudio(false);
  await Promise.all(Object.keys(connections.current).flatMap(id=>[
   screenVideoSenders.current[id]?.replaceTrack(null),
   screenAudioSenders.current[id]?.replaceTrack(null),
  ].filter(Boolean) as Promise<void>[]));
 }

 async function setShareQuality(next:ShareQuality){
  shareQualityRef.current=next;setShareQualityState(next);
  const preset=QUALITY[next],track=display.current?.getVideoTracks()[0];
  if(track){try{await track.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}retuneVideo()}
 }

 async function share(){
  setError('');if(sharing){await stopScreen();return}
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('O compartilhamento de tela está disponível no Chrome ou Edge no computador.');
   const preset=QUALITY[shareQualityRef.current];
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:preset.width,max:preset.width},height:{ideal:preset.height,max:preset.height},frameRate:{ideal:preset.fps,max:preset.fps}},audio:true});
   const videoTrack=stream.getVideoTracks()[0],audioTrack=stream.getAudioTracks()[0];
   try{await videoTrack.applyConstraints({width:{max:preset.width},height:{max:preset.height},frameRate:{max:preset.fps}})}catch{}
   if('contentHint' in videoTrack)videoTrack.contentHint='detail';
   if(audioTrack&&'contentHint' in audioTrack)audioTrack.contentHint='music';
   display.current=stream;setScreen(stream);setSharing(true);setShareAudio(Boolean(audioTrack));videoTrack.onended=()=>{void stopScreen()};
   await Promise.all(Object.keys(connections.current).flatMap(id=>{
    const jobs:Promise<void>[]=[];
    const vs=screenVideoSenders.current[id];if(vs)jobs.push(vs.replaceTrack(videoTrack).then(()=>tuneVideo(vs)));
    const as=screenAudioSenders.current[id];if(as&&audioTrack)jobs.push(as.replaceTrack(audioTrack).then(()=>tuneShareAudio(as)));
    return jobs;
   }));
  }catch(e:any){if(e.name!=='NotAllowedError')setError(e.message)}
 }

 async function invite(){try{await navigator.clipboard.writeText(location.href);setError('Link copiado! Envie para sua galera entrar na mesma sala.')}catch{setError('Copie o endereço da barra do navegador para convidar.')}}
 return {people,streams,joined,busy,error,muted,sharing,screen,localStream,shareAudio,shareQuality,join,leave,toggleMute,share,setShareQuality,invite,self:session.current?.id};
}
