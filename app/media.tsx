import {useEffect,useRef,useState} from 'react';
import {Volume2} from 'lucide-react';
type Sensitivity='low'|'normal'|'high';
type SettingsTab='audio'|'stream'|'profile'|'appearance';
type AudioDevice={deviceId:string;label:string};
type PresencePerson={id:string;name:string;channel:string;hasAvatar:number|boolean;avatarVersion:number};

let activityContext:AudioContext|null=null;

function audioContext(){
  const Ctx=(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;
  if(!Ctx)return null;
  activityContext??=new Ctx();
  return activityContext;
}

export async function unlockRoomAudio(){
  const ctx=audioContext();
  if(ctx?.state==='suspended')await ctx.resume().catch(()=>{});
  const audios=[...document.querySelectorAll('audio.remote-audio')] as HTMLAudioElement[];
  await Promise.allSettled(audios.map(audio=>audio.play()));
}

export function SpeakingSensor({stream,enabled=true,sensitivity='normal',onChange}:{stream:MediaStream|null;enabled?:boolean;sensitivity?:Sensitivity;onChange:(value:boolean)=>void}){
  const callback=useRef(onChange);
  callback.current=onChange;
  useEffect(()=>{
    if(!stream||!enabled||!stream.getAudioTracks().length){callback.current(false);return;}
    const Ctx=(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;
    if(!Ctx){callback.current(false);return;}
    try{
      const ctx=audioContext();if(!ctx){callback.current(false);return;}
      void ctx.resume().catch(()=>{});
      const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();
      analyser.fftSize=256;analyser.smoothingTimeConstant=.72;source.connect(analyser);
      const data=new Uint8Array(analyser.fftSize),threshold={low:.05,normal:.032,high:.019}[sensitivity];
      let active=false,quiet=0;
      const timer=window.setInterval(()=>{
        analyser.getByteTimeDomainData(data);let sum=0;
        for(const value of data){const x=(value-128)/128;sum+=x*x;}
        const rms=Math.sqrt(sum/data.length);
        if(rms>threshold){quiet=0;if(!active){active=true;callback.current(true);}}
        else if(active&&++quiet>=4){active=false;quiet=0;callback.current(false);}
      },80);
      return()=>{window.clearInterval(timer);try{source.disconnect();analyser.disconnect();}catch{}callback.current(false);};
    }catch{callback.current(false);}
  },[stream,enabled,sensitivity]);
  return null;
}

export function Media({stream,local=false,forceVideo=false,audioMuted=false,sensitivity='normal',outputDeviceId='',onSpeaking}:{stream:MediaStream;local?:boolean;forceVideo?:boolean;audioMuted?:boolean;sensitivity?:Sensitivity;outputDeviceId?:string;onSpeaking?:(value:boolean)=>void}){
  const audioRef=useRef<HTMLAudioElement>(null),videoRef=useRef<HTMLVideoElement>(null);
  const [blocked,setBlocked]=useState(false),[hasVideo,setHasVideo]=useState(false);

  useEffect(()=>{
    const update=()=>setHasVideo(forceVideo||stream.getVideoTracks().some(track=>track.readyState==='live'&&!track.muted));
    const bind=(track:MediaStreamTrack)=>{track.addEventListener('mute',update);track.addEventListener('unmute',update);track.addEventListener('ended',update);};
    const unbind=(track:MediaStreamTrack)=>{track.removeEventListener('mute',update);track.removeEventListener('unmute',update);track.removeEventListener('ended',update);};
    const add=(event:MediaStreamTrackEvent)=>{bind(event.track);update();},remove=(event:MediaStreamTrackEvent)=>{unbind(event.track);update();};
    stream.getTracks().forEach(bind);stream.addEventListener('addtrack',add);stream.addEventListener('removetrack',remove);update();
    if(audioRef.current&&!local){audioRef.current.srcObject=stream;void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true));}
    if(videoRef.current){videoRef.current.srcObject=stream;void videoRef.current.play().catch(()=>{});}
    return()=>{stream.getTracks().forEach(unbind);stream.removeEventListener('addtrack',add);stream.removeEventListener('removetrack',remove);};
  },[stream,local,forceVideo]);

  useEffect(()=>{
    if(audioRef.current){audioRef.current.volume=1;audioRef.current.muted=audioMuted;}
  },[audioMuted]);

  useEffect(()=>{
    if(local||!audioRef.current)return;
    const element=audioRef.current as HTMLAudioElement&{setSinkId?:(id:string)=>Promise<void>};
    if(typeof element.setSinkId==='function')void element.setSinkId(outputDeviceId||'').catch(()=>{});
  },[outputDeviceId,local,stream]);

  useEffect(()=>{if(videoRef.current&&hasVideo){videoRef.current.srcObject=stream;void videoRef.current.play().catch(()=>{});}},[hasVideo,stream]);

  useEffect(()=>{
    if(local)return;
    const retry=()=>{if(audioRef.current)void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>{});};
    window.addEventListener('pointerdown',retry,{passive:true});
    return()=>window.removeEventListener('pointerdown',retry);
  },[local]);

  return <>
    <audio ref={audioRef} className="remote-audio" autoPlay={!local} preload="auto"/>
    {onSpeaking&&<SpeakingSensor stream={stream} enabled={!local} sensitivity={sensitivity} onChange={onSpeaking}/>} 
    {hasVideo&&<video ref={videoRef} autoPlay playsInline muted className="screen-video"/>}
    {blocked&&<button type="button" className="enable-audio" onClick={()=>{if(audioRef.current)void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>{});}}><Volume2 size={15}/> Ativar áudio</button>}
  </>;
}

export function Avatar({src,name,className='avatar'}:{src?:string;name:string;className?:string}){
  return <div className={className}>{src?<img src={src} alt={`Foto de ${name}`}/>:<span>{(name||'V').slice(0,2).toUpperCase()}</span>}</div>;
}

export async function avatarFromFile(file:File){
  if(!file.type.startsWith('image/'))throw Error('Escolha uma imagem JPG, PNG ou WebP.');
  if(file.size>8*1024*1024)throw Error('A foto precisa ter no máximo 8 MB.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.decoding='async';image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw Error('Não consegui abrir essa imagem.');
    const side=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-side)/2,sy=(image.naturalHeight-side)/2;
    for(const [size,quality] of [[160,.78],[128,.72],[96,.68]] as const){
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');if(!ctx)continue;
      ctx.fillStyle='#1e1f22';ctx.fillRect(0,0,size,size);ctx.drawImage(image,sx,sy,side,side,0,0,size,size);
      const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=23500)return data;
    }
    throw Error('Essa foto ficou grande demais. Tente outra imagem.');
  }finally{URL.revokeObjectURL(url);}
}


