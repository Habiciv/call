import {useEffect,useRef,useState} from 'react';
import {Volume2,VolumeX,PictureInPicture2,Radio,RefreshCw} from 'lucide-react';
import {SharePlayer} from './share-player';

export function StreamPlayer({stream,name,local=false,hasAudio=false,quiet=false,onRepair}:{stream?:MediaStream;name:string;local?:boolean;hasAudio?:boolean;quiet?:boolean;onRepair:()=>void}){
 const video=useRef<HTMLVideoElement>(null);
 const [muted,setMuted]=useState(true),[volume,setVolume]=useState(1),[ready,setReady]=useState(false),[pip,setPip]=useState(false),[notice,setNotice]=useState(''),[resolution,setResolution]=useState('');
 useEffect(()=>{
  const element=video.current;if(!element)return;
  setReady(false);setResolution('');element.srcObject=stream||null;
  if(stream)void element.play().catch(()=>setNotice('Toque em Reproduzir para assistir.'));
  return()=>{element.pause();element.srcObject=null;};
 },[stream]);
 useEffect(()=>{const element=video.current;if(element){element.volume=volume;element.muted=local||muted||quiet;}},[volume,muted,local,quiet]);
 useEffect(()=>{
  const element=video.current;if(!element)return;
  const enter=()=>setPip(true),exit=()=>setPip(false);
  element.addEventListener('enterpictureinpicture',enter);element.addEventListener('leavepictureinpicture',exit);
  return()=>{element.removeEventListener('enterpictureinpicture',enter);element.removeEventListener('leavepictureinpicture',exit);};
 },[]);
 async function toggleAudio(){
  const element=video.current;if(!element)return;
  const next=!muted;element.muted=next;setMuted(next);
  try{await element.play();setNotice('');}catch{element.muted=true;setMuted(true);setNotice('Toque em Reproduzir para liberar o áudio.');}
 }
 async function togglePip(){
  try{if(document.pictureInPictureElement===video.current)await document.exitPictureInPicture();else await video.current?.requestPictureInPicture();setNotice('');}
  catch{setNotice('O mini-player não está disponível agora. Use Tela cheia.');}
 }
 return <SharePlayer>
  <div className="share-card-head"><div><Radio size={16}/><strong>{name}{local?' · sua prévia':''}</strong></div><span className="live-pill">AO VIVO</span></div>
  <div className="video-surface">
   <video ref={video} autoPlay playsInline muted={local||muted||quiet} className="screen-video" onPlaying={()=>{setReady(true);setNotice('');}} onWaiting={()=>setReady(false)} onResize={()=>{const v=video.current;if(v?.videoWidth)setResolution(`${v.videoWidth} × ${v.videoHeight}`);}}/>
   {!ready&&<div className="screen-loading"><span className="signal-ring"><Radio size={30}/></span><strong>Conectando transmissão</strong><p>Aguardando o vídeo chegar…</p><button className="subtle" onClick={onRepair}><RefreshCw size={14}/> Tentar novamente</button></div>}
  </div>
  <div className="video-controls">
   <div className="audio-controls">{!local&&hasAudio?<><button aria-label={muted?'Ativar áudio':'Silenciar áudio'} onClick={()=>void toggleAudio()}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}<span>{muted?'Ouvir':'Áudio'}</span></button><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>setVolume(Number(e.target.value))} aria-label="Volume da transmissão"/></>:<span className="muted-label">{local?'Prévia sem retorno de áudio': 'Sem áudio compartilhado'}</span>}</div>
   <div className="video-extras"><span className="resolution">{resolution||'Aguardando vídeo'}</span>{document.pictureInPictureEnabled&&<button disabled={!ready} aria-label={pip?'Fechar mini-player':'Mini-player'} title="Mini-player" onClick={()=>void togglePip()}><PictureInPicture2 size={18}/></button>}</div>
  </div>
  {notice&&<div className="player-notice" role="status">{notice}<button onClick={()=>void video.current?.play().then(()=>setNotice('')).catch(()=>setNotice('Não foi possível reproduzir. Tente reconectar.'))}>Reproduzir</button></div>}
 </SharePlayer>;
}
