'use client';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

type Person={id:string;name:string};
export type StreamQuality='stable'|'balanced'|'high';

type Session={room:string;id:string;token:string;after:number};
const ICE=[
  {urls:'stun:stun.cloudflare.com:3478'},
  {urls:'stun:stun.l.google.com:19302'},
];
const QUALITY:Record<StreamQuality,{width:number;height:number;fps:number;bitrate:number}>={
  stable:{width:640,height:360,fps:20,bitrate:450000},
  balanced:{width:960,height:540,fps:24,bitrate:900000},
  high:{width:1280,height:720,fps:30,bitrate:1800000},
};

function setTrackIntoMap(setter:Dispatch<SetStateAction<Record<string,MediaStream>>>,id:string,track:MediaStreamTrack){
  setter(old=>{
    const stream=old[id]||new MediaStream();
    if(!stream.getTracks().some(t=>t.id===track.id))stream.addTrack(track);
    return {...old,[id]:stream};
  });
}

export function useCall(channel:string){
  const [people,setPeople]=useState<Person[]>([]);
  const [streams,setStreams]=useState<Record<string,MediaStream>>({});
  const [joined,setJoined]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sharing,setSharing]=useState(false);
  const [screen,setScreen]=useState<MediaStream|null>(null);
  const [space,setSpace]=useState('');
  const [quality,setQualityState]=useState<StreamQuality>('balanced');

  const session=useRef<Session|null>(null);
  const display=useRef<MediaStream|null>(null);
  const connections=useRef<Record<string,RTCPeerConnection>>({});
  const pending=useRef<Record<string,RTCIceCandidateInit[]>>({});
  const videoSenders=useRef<Record<string,RTCRtpSender>>({});
  const audioSenders=useRef<Record<string,RTCRtpSender>>({});
  const offerLock=useRef<Record<string,boolean>>({});
  const qualityRef=useRef<StreamQuality>('balanced');

  useEffect(()=>{
    let key=location.hash.slice(1);
    if(!/^[a-f0-9-]{36}$/i.test(key)){
      key=crypto.randomUUID();
      history.replaceState(null,'','#'+key);
    }
    setSpace(key);
    return ()=>cleanup();
  },[]);

  const broadcasters=useMemo(()=>people.filter(p=>Boolean(streams[p.id]?.getVideoTracks()?.[0])),[people,streams]);

  function cleanup(){
    session.current=null;
    display.current?.getTracks().forEach(t=>t.stop());
    Object.values(connections.current).forEach(p=>{try{p.close()}catch{}});
    connections.current={};
    pending.current={};
    videoSenders.current={};
    audioSenders.current={};
    offerLock.current={};
    display.current=null;
  }

  async function request(action:string,extra:any={},s=session.current){
    if(!s)throw Error('Entre na sala primeiro.');
    const r=await fetch('/api/room',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,room:s.room,id:s.id,token:s.token,after:s.after,...extra}),keepalive:action==='leave'});
    const j:any=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(j.error||'Falha na conexão.');
    return j;
  }

  function isInitiator(id:string,s:Session){
    return s.id<id;
  }

  async function tuneSender(sender:RTCRtpSender){
    try{
      const preset=QUALITY[qualityRef.current];
      const peers=Math.max(1,Object.keys(connections.current).length);
      const p:any=sender.getParameters();
      p.encodings=p.encodings?.length?p.encodings:[{}];
      const enc=p.encodings[0];
      enc.maxBitrate=peers>=5?Math.round(preset.bitrate*0.35):peers>=3?Math.round(preset.bitrate*0.55):preset.bitrate;
      enc.maxFramerate=peers>=5?16:peers>=3?20:preset.fps;
      enc.scaleResolutionDownBy=peers>=5?2:peers>=3?1.4:1;
      p.degradationPreference='maintain-framerate';
      await sender.setParameters(p);
    }catch{}
  }

  async function sendOffer(id:string,s:Session){
    const p=connections.current[id];
    if(!p||session.current!==s||p.signalingState!=='stable'||offerLock.current[id])return;
    offerLock.current[id]=true;
    try{
      const offer=await p.createOffer();
      if(session.current!==s||p.signalingState!=='stable')return;
      await p.setLocalDescription(offer);
      await request('signal',{target:id,data:{description:p.localDescription}},s);
    }finally{
      offerLock.current[id]=false;
    }
  }

  function connection(id:string,s:Session){
    if(connections.current[id])return connections.current[id];
    const p=new RTCPeerConnection({iceServers:ICE,bundlePolicy:'max-bundle',iceCandidatePoolSize:4});
    connections.current[id]=p;

    const video=p.addTransceiver('video',{direction:'sendrecv'});
    const audio=p.addTransceiver('audio',{direction:'sendrecv'});
    videoSenders.current[id]=video.sender;
    audioSenders.current[id]=audio.sender;

    const displayVideo=display.current?.getVideoTracks()[0]||null;
    const displayAudio=display.current?.getAudioTracks()[0]||null;
    if(displayVideo){ void video.sender.replaceTrack(displayVideo).then(()=>tuneSender(video.sender)); }
    if(displayAudio){ void audio.sender.replaceTrack(displayAudio); }

    p.onicecandidate=e=>{
      if(e.candidate)void request('signal',{target:id,data:{candidate:e.candidate.toJSON()}},s).catch(err=>setError(err.message));
    };

    p.ontrack=e=>{
      setTrackIntoMap(setStreams,id,e.track);
      e.track.addEventListener('ended',()=>{
        setStreams(old=>{
          const stream=old[id];
          if(!stream)return old;
          stream.removeTrack(e.track);
          if(stream.getTracks().length===0){const next={...old};delete next[id];return next;}
          return {...old,[id]:stream};
        });
      });
    };

    p.onconnectionstatechange=()=>{
      if(p.connectionState==='failed')setError('A conexão com uma transmissão falhou. Atualize a sala e tente novamente.');
    };

    return p;
  }

  async function apply(j:any,s:Session){
    if(session.current!==s)return;
    const peers:Array<Person>=Array.isArray(j.peers)?j.peers:[];
    setPeople(peers);
    const ids=new Set(peers.map(p=>p.id));

    for(const id of Object.keys(connections.current)){
      if(!ids.has(id)){
        try{connections.current[id].close()}catch{}
        delete connections.current[id];
        delete pending.current[id];
        delete videoSenders.current[id];
        delete audioSenders.current[id];
        setStreams(old=>{const next={...old};delete next[id];return next;});
      }
    }

    for(const person of peers){
      if(person.id!==s.id && isInitiator(person.id,s) && !connections.current[person.id]){
        const p=connection(person.id,s);
        await sendOffer(person.id,s);
        if(display.current && p.signalingState==='stable')await sendOffer(person.id,s);
      }
    }

    for(const signal of Array.isArray(j.signals)?j.signals:[]){
      s.after=Math.max(s.after,Number(signal.id)||0);
      if(!ids.has(signal.sender))continue;
      const data=JSON.parse(signal.data);
      const p=connection(signal.sender,s);
      if(data.description){
        await p.setRemoteDescription(data.description);
        for(const c of pending.current[signal.sender]||[])await p.addIceCandidate(c);
        pending.current[signal.sender]=[];
        if(data.description.type==='offer'){
          await p.setLocalDescription(await p.createAnswer());
          await request('signal',{target:signal.sender,data:{description:p.localDescription}},s);
        }
      }else if(data.candidate){
        if(p.remoteDescription)await p.addIceCandidate(data.candidate);
        else (pending.current[signal.sender]??=[]).push(data.candidate);
      }
    }
  }

  async function join(name:string){
    setBusy(true); setError('');
    try{
      const s:Session={room:space+'-'+channel,id:crypto.randomUUID(),token:crypto.randomUUID(),after:0};
      session.current=s;
      await apply(await request('join',{name:name.trim()||'Visitante'},s),s);
      setJoined(true);
      void poll(s);
      return true;
    }catch(e:any){
      leave();
      setError(e?.message||'Não foi possível entrar na sala.');
      return false;
    }finally{setBusy(false);}
  }

  async function poll(s:Session){
    while(session.current===s){
      await new Promise(r=>setTimeout(r,900));
      if(session.current!==s)return;
      try{
        await apply(await request('poll',{},s),s);
      }catch(e:any){
        if(session.current!==s)return;
        setError(e?.message||'A conexão com a sala caiu.');
        leave();
        return;
      }
    }
  }

  function leave(){
    const s=session.current;
    if(s)void request('leave',{},s).catch(()=>{});
    cleanup();
    setJoined(false);
    setPeople([]);
    setStreams({});
    setScreen(null);
    setSharing(false);
  }

  async function setQuality(next:StreamQuality){
    qualityRef.current=next;
    setQualityState(next);
    const preset=QUALITY[next];
    const track=display.current?.getVideoTracks()[0];
    if(track){
      try{await track.applyConstraints({width:{ideal:preset.width,max:preset.width},height:{ideal:preset.height,max:preset.height},frameRate:{ideal:preset.fps,max:preset.fps}})}catch{}
      if('contentHint' in track)track.contentHint=next==='high'?'detail':'motion';
      await Promise.allSettled(Object.values(videoSenders.current).filter(s=>s.track).map(s=>tuneSender(s)));
    }
  }

  async function stopShare(){
    const current=display.current;
    display.current=null;
    current?.getTracks().forEach(t=>{t.onended=null; t.stop();});
    setScreen(null);
    setSharing(false);
    await Promise.allSettled(Object.keys(connections.current).flatMap(id=>[
      videoSenders.current[id]?.replaceTrack(null),
      audioSenders.current[id]?.replaceTrack(null),
    ].filter(Boolean) as Promise<any>[]));
    const s=session.current;
    if(s)await Promise.allSettled(Object.keys(connections.current).map(id=>sendOffer(id,s)));
  }

  async function share(){
    setError('');
    if(sharing){await stopShare(); return;}
    try{
      if(!navigator.mediaDevices?.getDisplayMedia)throw Error('No celular, use Chrome/Edge atualizado para transmitir quando o navegador permitir.');
      const preset=QUALITY[qualityRef.current];
      const stream=await navigator.mediaDevices.getDisplayMedia({
        video:{width:{ideal:preset.width,max:preset.width},height:{ideal:preset.height,max:preset.height},frameRate:{ideal:preset.fps,max:preset.fps}},
        audio:true,
      } as DisplayMediaStreamOptions);
      const videoTrack=stream.getVideoTracks()[0];
      if(!videoTrack){stream.getTracks().forEach(t=>t.stop());throw Error('Nenhuma tela foi selecionada.');}
      if('contentHint' in videoTrack)videoTrack.contentHint=qualityRef.current==='high'?'detail':'motion';
      display.current=stream;
      setScreen(stream);
      setSharing(true);
      videoTrack.onended=()=>{void stopShare();};
      await Promise.allSettled(Object.keys(connections.current).map(async id=>{
        const vs=videoSenders.current[id],as=audioSenders.current[id];
        if(vs){await vs.replaceTrack(videoTrack);await tuneSender(vs);}
        if(as){await as.replaceTrack(stream.getAudioTracks()[0]||null);}
      }));
      const s=session.current;
      if(s)await Promise.allSettled(Object.keys(connections.current).map(id=>sendOffer(id,s)));
    }catch(e:any){
      if(e?.name!=='NotAllowedError')setError(e?.message||'Não foi possível iniciar a transmissão.');
    }
  }

  async function invite(){
    try{
      await navigator.clipboard.writeText(location.href);
      setError('Link copiado! Envie para quem vai assistir.');
    }catch{
      setError('Copie o endereço da barra do navegador para compartilhar.');
    }
  }

  return {people,streams,broadcasters,joined,busy,error,sharing,screen,quality,join,leave,share,setQuality,invite,self:session.current?.id};
}
