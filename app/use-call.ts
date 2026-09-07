'use client';
import { useEffect,useRef,useState } from 'react';

type Person={id:string;name:string};
type IceServer={urls:string|string[];username?:string;credential?:string};

type Session={room:string;id:string;token:string;after:number};

const FALLBACK_ICE:IceServer[]=[
 {urls:'stun:stun.cloudflare.com:3478'},
 {urls:'stun:stun.l.google.com:19302'},
];

export function useCall(channel:string){
 const [people,setPeople]=useState<Person[]>([]),[streams,setStreams]=useState<Record<string,MediaStream>>({}),[joined,setJoined]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[muted,setMuted]=useState(false),[sharing,setSharing]=useState(false),[screen,setScreen]=useState<MediaStream|null>(null),[space,setSpace]=useState('');
 const session=useRef<Session|null>(null),mic=useRef<MediaStream|null>(null),display=useRef<MediaStream|null>(null),connections=useRef<Record<string,RTCPeerConnection>>({}),pending=useRef<Record<string,RTCIceCandidateInit[]>>({}),iceServers=useRef<IceServer[]>(FALLBACK_ICE),restartTimers=useRef<Record<string,ReturnType<typeof setTimeout>>>({});

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
  Object.values(connections.current).forEach(p=>p.close());connections.current={};pending.current={};mic.current=null;display.current=null;
 }

 async function request(action:string,extra:any={},s=session.current){
  if(!s)throw Error('Entre na call primeiro.');
  const r=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:s.room,id:s.id,token:s.token,after:s.after,...extra}),keepalive:action==='leave'});
  const j:any=await r.json();if(!r.ok)throw Error(j.error||'Falha na conexão.');return j;
 }

 function leave(){const s=session.current;if(s)void request('leave',{},s).catch(()=>{});cleanup();setJoined(false);setPeople([]);setStreams({});setScreen(null);setSharing(false);setMuted(false)}

 async function tuneAudio(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   params.encodings[0].maxBitrate=64000;params.encodings[0].priority='high';params.encodings[0].networkPriority='high';
   await sender.setParameters(params);
  }catch{}
 }

 async function tuneVideo(sender:RTCRtpSender){
  try{
   const params:any=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];
   // Em mesh cada transmissão é enviada uma vez para cada pessoa. Esse teto evita
   // que o compartilhamento de tela mate o áudio quando entram mais participantes.
   const remoteCount=Math.max(1,Object.keys(connections.current).length);
   params.encodings[0].maxBitrate=remoteCount<=1?1400000:remoteCount<=3?900000:600000;
   params.encodings[0].maxFramerate=15;params.encodings[0].priority='medium';params.degradationPreference='maintain-resolution';
   await sender.setParameters(params);
  }catch{}
 }

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
  },3500);
 }

 function connection(id:string,s:Session){
  if(connections.current[id])return connections.current[id];
  const p=new RTCPeerConnection({iceServers:iceServers.current,bundlePolicy:'max-bundle',rtcpMuxPolicy:'require',iceCandidatePoolSize:4});connections.current[id]=p;
  const audioTrack=mic.current?.getAudioTracks()[0];
  if(audioTrack){const sender=p.addTrack(audioTrack,mic.current!);void tuneAudio(sender)}
  const video=p.addTransceiver('video',{direction:'sendrecv'});
  if(display.current){void video.sender.replaceTrack(display.current.getVideoTracks()[0]);void tuneVideo(video.sender)}
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
    connections.current[id].close();delete connections.current[id];
    if(restartTimers.current[id]){clearTimeout(restartTimers.current[id]);delete restartTimers.current[id]}
    setStreams(o=>{const n={...o};delete n[id];return n});
   }
  }
  for(const person of j.peers as Person[]){
   if(person.id!==s.id&&s.id<person.id&&!connections.current[person.id]){
    connection(person.id,s);makeOffer(person.id,s);
   }
  }
  for(const signal of j.signals){
   s.after=Math.max(s.after,signal.id);if(!ids.has(signal.sender))continue;
   const data=JSON.parse(signal.data),p=connection(signal.sender,s);
   try{
    if(data.description){
     if(data.description.type==='offer'&&p.signalingState!=='stable'){
      // Evita colisão de ofertas durante uma reconexão ICE.
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
  display.current?.getTracks().forEach(t=>t.stop());display.current=null;setScreen(null);setSharing(false);
  await Promise.all(Object.values(connections.current).map(async p=>{
   const sender=p.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
   if(sender)await sender.replaceTrack(null);
  }));
 }

 async function share(){
  setError('');if(sharing){await stopScreen();return}
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('O compartilhamento de tela está disponível no Chrome ou Edge no computador.');
   const stream=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:15,max:20}},audio:false});
   const track=stream.getVideoTracks()[0];
   try{await track.applyConstraints({width:{max:1280},height:{max:720},frameRate:{max:15}})}catch{}
   if('contentHint' in track)track.contentHint='detail';
   display.current=stream;setScreen(stream);setSharing(true);track.onended=()=>{void stopScreen()};
   await Promise.all(Object.values(connections.current).map(async p=>{
    const sender=p.getTransceivers().find(t=>t.receiver.track.kind==='video')?.sender;
    if(sender){await sender.replaceTrack(track);await tuneVideo(sender)}
   }));
  }catch(e:any){if(e.name!=='NotAllowedError')setError(e.message)}
 }

 async function invite(){try{await navigator.clipboard.writeText(location.href);setError('Link copiado! Envie para sua galera entrar na mesma sala.')}catch{setError('Copie o endereço da barra do navegador para convidar.')}}
 return {people,streams,joined,busy,error,muted,sharing,screen,join,leave,toggleMute,share,invite,self:session.current?.id};
}
