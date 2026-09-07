'use client';
import {useEffect,useRef,useState} from 'react';
import {SidebarProvider,Sidebar,SidebarContent,SidebarHeader,SidebarFooter,SidebarTrigger} from '@/components/ui/sidebar';
import {Headphones,Volume2,Volume1,MonitorUp,Mic,MicOff,ArrowUpRight,Radio,Link,PhoneOff,Users,SlidersHorizontal,AudioLines} from 'lucide-react';
import {useCall,type ShareQuality} from './use-call';
import FluidBackground from './fluid-background';

type Sensitivity='low'|'normal'|'high';
let activityContext:AudioContext|null=null;

function SpeakingSensor({stream,enabled=true,sensitivity='normal',onChange}:{stream:MediaStream|null;enabled?:boolean;sensitivity?:Sensitivity;onChange:(value:boolean)=>void}){
 const callback=useRef(onChange);callback.current=onChange;
 useEffect(()=>{
  if(!stream||!enabled||!stream.getAudioTracks().length){callback.current(false);return}
  const Ctx=(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;
  if(!Ctx){callback.current(false);return}
  try{
   activityContext??=new Ctx();void activityContext.resume().catch(()=>{});
   const source=activityContext.createMediaStreamSource(stream),analyser=activityContext.createAnalyser();
   analyser.fftSize=256;analyser.smoothingTimeConstant=.72;source.connect(analyser);
   const data=new Uint8Array(analyser.fftSize),threshold={low:.05,normal:.032,high:.019}[sensitivity];
   let active=false,quiet=0;
   const timer=window.setInterval(()=>{
    analyser.getByteTimeDomainData(data);let sum=0;
    for(const v of data){const x=(v-128)/128;sum+=x*x}
    const rms=Math.sqrt(sum/data.length);
    if(rms>threshold){quiet=0;if(!active){active=true;callback.current(true)}}
    else if(active&&++quiet>=4){active=false;quiet=0;callback.current(false)}
   },75);
   return()=>{window.clearInterval(timer);try{source.disconnect();analyser.disconnect()}catch{}callback.current(false)};
  }catch{callback.current(false)}
 },[stream,enabled,sensitivity]);
 return null;
}

function Media({stream,local=false,volume=100,masterVolume=100,sensitivity='normal',onSpeaking}:{stream:MediaStream;local?:boolean;volume?:number;masterVolume?:number;sensitivity?:Sensitivity;onSpeaking?:(value:boolean)=>void}){
 const audioRef=useRef<HTMLAudioElement>(null),videoRef=useRef<HTMLVideoElement>(null);const [blocked,setBlocked]=useState(false),[hasVideo,setHasVideo]=useState(false);
 useEffect(()=>{
  const update=()=>setHasVideo(stream.getVideoTracks().some(t=>t.readyState==='live'&&!t.muted));
  const bind=(track:MediaStreamTrack)=>{track.addEventListener('mute',update);track.addEventListener('unmute',update);track.addEventListener('ended',update)};
  const unbind=(track:MediaStreamTrack)=>{track.removeEventListener('mute',update);track.removeEventListener('unmute',update);track.removeEventListener('ended',update)};
  const add=(e:MediaStreamTrackEvent)=>{bind(e.track);update()};const remove=(e:MediaStreamTrackEvent)=>{unbind(e.track);update()};
  stream.getTracks().forEach(bind);stream.addEventListener('addtrack',add);stream.addEventListener('removetrack',remove);update();
  if(audioRef.current&&!local){audioRef.current.srcObject=stream;void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true))}
  if(videoRef.current){videoRef.current.srcObject=stream;void videoRef.current.play().catch(()=>{})}
  return()=>{stream.getTracks().forEach(unbind);stream.removeEventListener('addtrack',add);stream.removeEventListener('removetrack',remove)};
 },[stream,local]);
 useEffect(()=>{if(audioRef.current)audioRef.current.volume=Math.max(0,Math.min(1,(volume/100)*(masterVolume/100)))},[volume,masterVolume]);
 useEffect(()=>{if(videoRef.current&&hasVideo){videoRef.current.srcObject=stream;void videoRef.current.play().catch(()=>{})}},[hasVideo,stream]);
 const enableAudio=()=>{if(audioRef.current)void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>{})};
 return <><audio ref={audioRef} autoPlay={!local}/>{onSpeaking&&<SpeakingSensor stream={stream} enabled={!local} sensitivity={sensitivity} onChange={onSpeaking}/>} {hasVideo&&<video ref={videoRef} autoPlay playsInline muted controls className="screen-video"/>}{blocked&&<button className="enable-audio" onClick={enableAudio}><Volume2 size={15}/> Ativar áudio</button>}</>;
}

const qualityInfo:Record<ShareQuality,{label:string;detail:string}>={
 stable:{label:'Estável',detail:'540p · 15 FPS'},
 balanced:{label:'Equilibrada',detail:'720p · 20 FPS'},
 high:{label:'Nítida',detail:'1080p · 30 FPS'},
};

export default function Home(){
 const [channel,setChannel]=useState('Lounge'),[name,setName]=useState(''),[masterVolume,setMasterVolume]=useState(90),[volumes,setVolumes]=useState<Record<string,number>>({}),[speaking,setSpeaking]=useState<Record<string,boolean>>({}),[settingsOpen,setSettingsOpen]=useState(false),[sensitivity,setSensitivity]=useState<Sensitivity>('normal');
 const call=useCall(channel);
 const markSpeaking=(id:string,value:boolean)=>setSpeaking(old=>old[id]===value?old:{...old,[id]:value});
 const personVolume=(id:string)=>volumes[id]??100;
 return <SidebarProvider><Sidebar><SidebarHeader><div className="brand"><Radio/> voz<span>BETA</span></div></SidebarHeader><SidebarContent><div className="space-title">Seu espaço <span>⌄</span></div><p className="section-label">CANAIS DE VOZ</p>{['Lounge','Jogatina','Foco'].map(c=><button className={'channel '+(channel===c?'selected':'')} onClick={()=>{if(c!==channel){call.leave();setChannel(c)}}} key={c}><Volume2 size={19}/>{c}{c===channel&&call.joined&&<i className="live-dot"/>}</button>)}<div className="sidebar-note"><Headphones/><strong>O melhor lugar é junto.</strong><p>Entre em um canal e traga sua galera.</p></div></SidebarContent><SidebarFooter><div className="profile"><b>{(name||'V')[0].toUpperCase()}</b><div>{name||'Visitante'}<small>{call.joined?'Conectado em '+channel:'Pronto para conectar'}</small></div></div></SidebarFooter></Sidebar><main className="workspace"><FluidBackground lowPower={call.joined}/><header><div><SidebarTrigger/><Volume2 size={20}/><b>{channel}</b><span className="header-sub">Chega mais. A sala é sua.</span></div><button className="invite" onClick={call.invite}><Link size={16}/> Convidar</button></header><section className="room"><div className="eyebrow">SEU PONTO DE ENCONTRO</div><h1>{call.joined?<>A conversa está<br/>acontecendo<span>.</span></>:<>Uma boa conversa<br/>começa por aqui<span>.</span></>}</h1><p>{call.joined?'Microfone ligado, ideias soltas. Fique à vontade.':<>Abra o microfone, compartilhe sua tela<br/>e fique perto de quem importa.</>}</p>{call.error&&<div role="status" className="notice">{call.error}</div>}{!call.joined?<div className="empty-stage"><div className="orb"><Headphones size={40}/></div><h2>{channel}</h2><p>A sala está esperando por você.</p><label className="name-label" htmlFor="name">Como você quer ser chamado?</label><input id="name" value={name} onChange={e=>setName(e.target.value)} maxLength={30} placeholder="Seu nome" className="name-input" onKeyDown={e=>{if(e.key==='Enter'&&!call.busy)void call.join(name)}}/><button className="primary" disabled={call.busy} onClick={()=>call.join(name)}><Mic size={18}/>{call.busy?'Conectando…':'Entrar na call'}<ArrowUpRight size={18}/></button><small className="capacity">Até 10 pessoas · Áudio em tempo real</small></div>:<><SpeakingSensor stream={call.localStream} enabled={!call.muted} sensitivity={sensitivity} onChange={v=>call.self&&markSpeaking(call.self,v)}/><div className="session-heading"><span className="status"><i/> CONECTADO</span><span><Users size={15}/>{call.people.length} de 10 na sala</span></div><div className="people-grid">{call.people.map((p,i)=>{const isSelf=p.id===call.self,isSpeaking=Boolean(speaking[p.id])&&!((isSelf)&&call.muted);return <div className={'person '+(isSelf?'self ':'')+(isSpeaking?'speaking':'')} key={p.id} aria-label={p.name+(isSpeaking?' está falando':'')}><div className="speaker-state" aria-hidden={!isSpeaking}>{isSpeaking?<><AudioLines size={14}/> Falando</>:<span>&nbsp;</span>}</div><div className={'avatar color-'+i}>{p.name.slice(0,2).toUpperCase()}</div><div className="person-label"><span>{p.name}{isSelf?' (você)':''}</span>{isSelf&&call.muted?<MicOff size={15}/>:<Volume2 size={15}/>}</div>{!isSelf&&<div className="person-volume"><Volume1 size={15}/><input aria-label={'Volume de '+p.name} type="range" min="0" max="100" step="5" value={personVolume(p.id)} onChange={e=>setVolumes(v=>({...v,[p.id]:Number(e.target.value)}))}/><span>{personVolume(p.id)}%</span></div>}{call.streams[p.id]&&<Media stream={call.streams[p.id]} volume={personVolume(p.id)} masterVolume={masterVolume} sensitivity={sensitivity} onSpeaking={isSelf?undefined:v=>markSpeaking(p.id,v)}/>}</div>})}{call.people.length===1&&<div className="waiting"><Users size={26}/><p>A galera ainda não chegou.</p><button onClick={call.invite}>Copiar convite <ArrowUpRight size={14}/></button></div>}</div>{call.screen&&<div className="screen-wrap"><div><MonitorUp size={16}/> Sua transmissão <span>{call.shareAudio?'TELA + ÁUDIO':'AO VIVO'}</span></div><Media stream={call.screen} local/></div>}{settingsOpen&&<section className="audio-panel" aria-label="Configurações de áudio e transmissão"><div className="audio-panel-title"><SlidersHorizontal size={17}/><div><strong>Áudio e transmissão</strong><small>Ajustes só deste dispositivo</small></div></div><label className="setting-row"><span>Volume geral <b>{masterVolume}%</b></span><input type="range" min="0" max="100" step="5" value={masterVolume} onChange={e=>setMasterVolume(Number(e.target.value))}/></label><div className="setting-group"><span>Detecção de quem está falando</span><div className="segmented">{([['low','Baixa'],['normal','Normal'],['high','Alta']] as [Sensitivity,string][]).map(([value,label])=><button type="button" className={sensitivity===value?'selected':''} key={value} onClick={()=>setSensitivity(value)}>{label}</button>)}</div></div><div className="setting-group"><span>Qualidade da transmissão</span><div className="quality-options">{(Object.keys(qualityInfo) as ShareQuality[]).map(value=><button type="button" className={call.shareQuality===value?'selected':''} key={value} onClick={()=>void call.setShareQuality(value)}><strong>{qualityInfo[value].label}</strong><small>{qualityInfo[value].detail}</small></button>)}</div><p className="settings-hint">A qualidade adapta o bitrate ao número de pessoas para priorizar o áudio. Ao compartilhar uma aba/tela com som, marque a opção de compartilhar áudio no seletor do navegador.</p></div></section>}<div className="call-controls"><button title={call.muted?'Ativar microfone':'Silenciar microfone'} aria-label={call.muted?'Ativar microfone':'Silenciar microfone'} className={call.muted?'off':''} onClick={call.toggleMute}>{call.muted?<MicOff/>:<Mic/>}</button><button className={'share '+(call.sharing?'active':'')} onClick={call.share}><MonitorUp size={20}/>{call.sharing?'Parar transmissão':'Compartilhar tela'}</button><button title="Áudio e transmissão" aria-label="Abrir configurações de áudio e transmissão" className={settingsOpen?'active':''} onClick={()=>setSettingsOpen(v=>!v)}><SlidersHorizontal size={20}/><span className="control-label">Áudio</span></button><button title="Sair da call" aria-label="Sair da call" className="hangup" onClick={call.leave}><PhoneOff size={22}/></button></div></>}<div className="room-bottom"><span><MonitorUp size={18}/> Sua tela também tem lugar na conversa</span><span>VOZ · AO VIVO · JUNTOS</span></div></section></main></SidebarProvider>;
}
