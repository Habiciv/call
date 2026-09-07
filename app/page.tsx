'use client';

import {useEffect,useRef,useState} from 'react';
import {
  Headphones,
  Volume2,
  Volume1,
  MonitorUp,
  Mic,
  MicOff,
  ArrowUpRight,
  Radio,
  Link,
  PhoneOff,
  Users,
  SlidersHorizontal,
  AudioLines,
  Camera,
  Trash2,
} from 'lucide-react';
import {useCall,type ShareQuality} from './use-call';

type Sensitivity='low'|'normal'|'high';
type SettingsTab='audio'|'stream'|'profile'|'appearance';
type AudioDevice={deviceId:string;label:string};

let activityContext:AudioContext|null=null;

function audioContext(){
  const Ctx=(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;
  if(!Ctx)return null;
  activityContext??=new Ctx();
  return activityContext;
}

async function unlockRoomAudio(){
  const ctx=audioContext();
  if(ctx?.state==='suspended')await ctx.resume().catch(()=>{});
  const audios=[...document.querySelectorAll('audio.remote-audio')] as HTMLAudioElement[];
  await Promise.allSettled(audios.map(audio=>audio.play()));
}

function SpeakingSensor({stream,enabled=true,sensitivity='normal',onChange}:{stream:MediaStream|null;enabled?:boolean;sensitivity?:Sensitivity;onChange:(value:boolean)=>void}){
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

function Media({stream,local=false,forceVideo=false,volume=100,masterVolume=100,audioScale=100,sensitivity='normal',outputDeviceId='',onSpeaking}:{stream:MediaStream;local?:boolean;forceVideo?:boolean;volume?:number;masterVolume?:number;audioScale?:number;sensitivity?:Sensitivity;outputDeviceId?:string;onSpeaking?:(value:boolean)=>void}){
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
    if(audioRef.current)audioRef.current.volume=Math.max(0,Math.min(1,(volume/100)*(masterVolume/100)*(audioScale/100)));
  },[volume,masterVolume,audioScale]);

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
    {hasVideo&&<video ref={videoRef} autoPlay playsInline muted controls className="screen-video"/>}
    {blocked&&<button type="button" className="enable-audio" onClick={()=>{if(audioRef.current)void audioRef.current.play().then(()=>setBlocked(false)).catch(()=>{});}}><Volume2 size={15}/> Ativar áudio</button>}
  </>;
}

function Avatar({src,name,className='avatar'}:{src?:string;name:string;className?:string}){
  return <div className={className}>{src?<img src={src} alt={`Foto de ${name}`}/>:<span>{(name||'V').slice(0,2).toUpperCase()}</span>}</div>;
}

async function avatarFromFile(file:File){
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

const qualityInfo:Record<ShareQuality,{label:string;detail:string}>={
  stable:{label:'Estável',detail:'540p · 12 FPS'},
  balanced:{label:'Equilibrada',detail:'720p · 15 FPS'},
  high:{label:'Nítida',detail:'1080p · 24 FPS'},
};

const peerStateText={
  new:'Preparando',
  connecting:'Conectando',
  connected:'Conectado',
  reconnecting:'Reconectando',
  failed:'Falha',
} as const;

export default function Home(){
  const [channel,setChannel]=useState('Lounge');
  const [name,setName]=useState('');
  const [avatar,setAvatar]=useState('');
  const [profileMessage,setProfileMessage]=useState('');
  const [profileBusy,setProfileBusy]=useState(false);
  const [masterVolume,setMasterVolume]=useState(90);
  const [screenVolume,setScreenVolume]=useState(75);
  const [volumes,setVolumes]=useState<Record<string,number>>({});
  const [speaking,setSpeaking]=useState<Record<string,boolean>>({});
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsTab,setSettingsTab]=useState<SettingsTab>('audio');
  const [sensitivity,setSensitivity]=useState<Sensitivity>('normal');
  const [deafened,setDeafened]=useState(false);
  const [memberPanelOpen,setMemberPanelOpen]=useState(true);
  const [compactMode,setCompactMode]=useState(false);
  const [channelSearch,setChannelSearch]=useState('');
  const [inputDevices,setInputDevices]=useState<AudioDevice[]>([]);
  const [outputDevices,setOutputDevices]=useState<AudioDevice[]>([]);
  const [outputDeviceId,setOutputDeviceId]=useState('');
  const mutedBeforeDeafen=useRef(false);
  const photoInput=useRef<HTMLInputElement>(null);
  const call=useCall(channel);

  useEffect(()=>{
    try{
      setName(localStorage.getItem('voz-name')||'');
      const saved=localStorage.getItem('voz-avatar')||'';if(saved.startsWith('data:image/'))setAvatar(saved);
      const mv=Number(localStorage.getItem('voz-master-volume'));if(Number.isFinite(mv)&&mv>=0&&mv<=100)setMasterVolume(mv);
      const sv=Number(localStorage.getItem('voz-screen-volume'));if(Number.isFinite(sv)&&sv>=0&&sv<=100)setScreenVolume(sv);
      const sens=localStorage.getItem('voz-sensitivity');if(sens==='low'||sens==='normal'||sens==='high')setSensitivity(sens);
      setOutputDeviceId(localStorage.getItem('voz-output-device')||'');
      setCompactMode(localStorage.getItem('voz-compact')==='1');
    }catch{}
  },[]);

  useEffect(()=>{try{localStorage.setItem('voz-name',name);}catch{}},[name]);
  useEffect(()=>{try{if(avatar)localStorage.setItem('voz-avatar',avatar);else localStorage.removeItem('voz-avatar');}catch{}},[avatar]);
  useEffect(()=>{try{localStorage.setItem('voz-master-volume',String(masterVolume));localStorage.setItem('voz-screen-volume',String(screenVolume));localStorage.setItem('voz-sensitivity',sensitivity);localStorage.setItem('voz-output-device',outputDeviceId);localStorage.setItem('voz-compact',compactMode?'1':'0');}catch{}},[masterVolume,screenVolume,sensitivity,outputDeviceId,compactMode]);
  useEffect(()=>{if(!call.joined)setDeafened(false);},[call.joined]);
  useEffect(()=>{if(!settingsOpen)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSettingsOpen(false);};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[settingsOpen]);

  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      if(!navigator.mediaDevices?.enumerateDevices)return;
      try{
        const devices=await navigator.mediaDevices.enumerateDevices();
        if(!active)return;
        setInputDevices(devices.filter(d=>d.kind==='audioinput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`Microfone ${i+1}`})));
        setOutputDevices(devices.filter(d=>d.kind==='audiooutput').map((d,i)=>({deviceId:d.deviceId,label:d.label||`Saída ${i+1}`})));
      }catch{}
    };
    void refresh();navigator.mediaDevices?.addEventListener?.('devicechange',refresh);
    return()=>{active=false;navigator.mediaDevices?.removeEventListener?.('devicechange',refresh);};
  },[call.joined]);

  const markSpeaking=(id:string,value:boolean)=>setSpeaking(old=>old[id]===value?old:{...old,[id]:value});
  const personVolume=(id:string)=>volumes[id]??100;
  const remoteScreens=call.people.filter(person=>person.id!==call.self&&call.remoteSharing[person.id]);
  const filteredChannels=['Lounge','Jogatina','Foco'].filter(item=>item.toLowerCase().includes(channelSearch.toLowerCase()));
  const effectiveMasterVolume=deafened?0:masterVolume;
  const supportsOutputSelection=typeof HTMLMediaElement!=='undefined'&&'setSinkId' in HTMLMediaElement.prototype;

  async function choosePhoto(file?:File){
    if(!file)return;setProfileBusy(true);setProfileMessage('');
    try{
      const next=await avatarFromFile(file);setAvatar(next);
      if(call.joined){const ok=await call.updateProfile(name,next);if(ok)setProfileMessage('Foto atualizada para todo mundo na sala.');}
    }catch(error:any){setProfileMessage(error?.message||'Não foi possível usar essa foto.');}
    finally{setProfileBusy(false);if(photoInput.current)photoInput.current.value='';}
  }

  async function removePhoto(){
    setAvatar('');setProfileMessage('');
    if(call.joined){setProfileBusy(true);const ok=await call.updateProfile(name,'');setProfileBusy(false);if(ok)setProfileMessage('Foto removida.');}
  }

  function switchChannel(next:string){
    if(next===channel)return;
    call.leave();setSpeaking({});setDeafened(false);setChannel(next);
  }

  function toggleDeafen(){
    if(!call.joined)return;
    if(!deafened){
      mutedBeforeDeafen.current=call.muted;
      if(!call.muted)call.toggleMute();
      setDeafened(true);
    }else{
      setDeafened(false);
      if(!mutedBeforeDeafen.current&&call.muted)call.toggleMute();
    }
  }

  async function saveProfile(){
    if(!call.joined){setProfileMessage('Perfil salvo neste dispositivo.');return;}
    setProfileBusy(true);const ok=await call.updateProfile(name,avatar);setProfileBusy(false);if(ok)setProfileMessage('Perfil atualizado na sala.');
  }

  const voiceConnected=call.joined?call.people.filter(p=>p.id!==call.self).every(p=>(call.peerStates[p.id]||'connecting')==='connected'):false;

  return <div className={'discord-shell '+(compactMode?'compact ':'')+(memberPanelOpen?'members-open':'members-closed')}>
    <aside className="server-rail" aria-label="Espaços">
      <button type="button" className="server-pill home selected" aria-label="Voz"><Radio size={25}/></button>
      <div className="rail-separator"/>
      <div className="server-pill decorative">VG</div>
      <div className="server-pill decorative">+</div>
      <div className="server-pill decorative">?</div>
    </aside>

    <aside className="channel-sidebar">
      <div className="server-header"><strong>Voz da Galera</strong><span>⌄</span></div>
      <div className="channel-search"><input aria-label="Buscar canal" value={channelSearch} onChange={e=>setChannelSearch(e.target.value)} placeholder="Buscar canal"/></div>
      <div className="channel-scroll">
        <div className="category"><span>INFORMAÇÕES</span><b>+</b></div>
        <div className="text-channel unavailable"><span>#</span> geral <small>em breve</small></div>
        <div className="text-channel unavailable"><span>#</span> avisos <small>em breve</small></div>
        <div className="category voice-category"><span>CANAIS DE VOZ</span><b>+</b></div>
        {filteredChannels.map(item=><div key={item}>
          <button type="button" className={'voice-channel '+(channel===item?'active':'')} onClick={()=>switchChannel(item)}>
            <Volume2 size={18}/><span>{item}</span>{call.joined&&channel===item&&<i className="voice-live-dot"/>}
          </button>
          {call.joined&&channel===item&&<div className="channel-users">{call.people.map(person=><div className={'channel-user '+(speaking[person.id]?'speaking':'')} key={person.id}><Avatar src={call.avatars[person.id]} name={person.name} className="mini-avatar"/><span>{person.name}</span>{person.id===call.self&&call.muted?<MicOff size={13}/>:speaking[person.id]?<AudioLines size={13}/>:null}</div>)}</div>}
        </div>)}
      </div>

      {call.joined&&<div className="voice-connected-panel">
        <div className="voice-connection-row"><div><strong>Voz conectada</strong><small>{channel} · {voiceConnected?'Conexão estável':'Conectando participantes'}</small></div><span className={call.turnConfigured?'network-ok':'network-warn'}>{call.turnConfigured?'TURN':'P2P'}</span></div>
        <div className="voice-quick-actions">
          <button type="button" title="Reconectar áudio" onClick={()=>{void unlockRoomAudio();call.repairAudio();}}><AudioLines size={16}/></button>
          <button type="button" title="Convidar" onClick={call.invite}><Link size={16}/></button>
          <button type="button" title="Sair da call" className="disconnect-mini" onClick={()=>{setSpeaking({});setDeafened(false);call.leave();}}><PhoneOff size={16}/></button>
        </div>
      </div>}

      <div className="user-panel">
        <button type="button" className="user-avatar-button" onClick={()=>{setSettingsTab('profile');setSettingsOpen(true);}} title="Editar perfil"><Avatar src={avatar} name={name||'Visitante'} className="user-avatar"/></button>
        <div className="user-copy"><strong>{name||'Visitante'}</strong><small>{call.joined?'Disponível':'Offline'}</small></div>
        <div className="user-actions">
          <button type="button" className={call.muted?'danger-active':''} disabled={!call.joined||deafened} title={deafened?'Desative o ensurdecimento primeiro':call.muted?'Ativar microfone':'Silenciar microfone'} onClick={call.toggleMute}>{call.muted?<MicOff size={17}/>:<Mic size={17}/>}</button>
          <button type="button" className={deafened?'danger-active':''} disabled={!call.joined} title={deafened?'Desativar ensurdecimento':'Ensurdecer'} onClick={toggleDeafen}><Headphones size={17}/></button>
          <button type="button" title="Configurações" onClick={()=>{setSettingsTab('audio');setSettingsOpen(true);}}><SlidersHorizontal size={17}/></button>
        </div>
      </div>
    </aside>

    <main className="main-column">
      <header className="topbar">
        <div className="channel-title"><Volume2 size={20}/><strong>{channel}</strong><span>Canal de voz</span></div>
        <div className="topbar-actions">
          <button type="button" onClick={call.invite} title="Copiar convite"><Link size={18}/><span>Convidar</span></button>
          <button type="button" className={memberPanelOpen?'active':''} onClick={()=>setMemberPanelOpen(v=>!v)} title="Mostrar participantes"><Users size={19}/></button>
          <button type="button" className={settingsOpen?'active':''} onClick={()=>{setSettingsTab('audio');setSettingsOpen(true);}} title="Configurações"><SlidersHorizontal size={19}/></button>
        </div>
      </header>

      <section className="call-area">
        {call.error&&<div className="notice" role="status">{call.error}</div>}
        {profileMessage&&<div className="profile-message" role="status">{profileMessage}</div>}

        {!call.joined?<div className="join-screen">
          <div className="join-card">
            <div className="join-badge"><Volume2 size={16}/> {channel}</div>
            <button type="button" className="join-photo-button" disabled={profileBusy} onClick={()=>photoInput.current?.click()} aria-label={avatar?'Trocar foto de perfil':'Adicionar foto de perfil'}>
              <Avatar src={avatar} name={name||'Visitante'} className="join-avatar"/>
              <span><Camera size={16}/></span>
            </button>
            <h1>Pronto para conversar?</h1>
            <p>Entre no canal, teste seu microfone e convide a galera.</p>
            <label htmlFor="name">Nome de exibição</label>
            <input id="name" value={name} onChange={e=>setName(e.target.value)} maxLength={30} placeholder="Seu nome" autoComplete="nickname" onKeyDown={e=>{if(e.key==='Enter'&&!call.busy&&!profileBusy){void unlockRoomAudio();void call.join(name,avatar);}}}/>
            <div className="join-photo-actions"><button type="button" onClick={()=>photoInput.current?.click()} disabled={profileBusy}>{profileBusy?'Preparando foto…':avatar?'Trocar foto':'Adicionar foto'}</button>{avatar&&<button type="button" className="remove-photo" onClick={()=>void removePhoto()}><Trash2 size={13}/> Remover</button>}</div>
            <button type="button" className="join-primary" disabled={call.busy||profileBusy} onClick={()=>{void unlockRoomAudio();void call.join(name,avatar);}}><Mic size={19}/>{call.busy?'Conectando…':'Entrar na call'}<ArrowUpRight size={18}/></button>
            <div className="join-meta"><span>Até 10 pessoas</span><i/><span>Áudio em tempo real</span><i/><span>Compartilhamento de tela</span></div>
          </div>
        </div>:<div className="active-call">
          <SpeakingSensor stream={call.localStream} enabled={!call.muted} sensitivity={sensitivity} onChange={value=>call.self&&markSpeaking(call.self,value)}/>

          {(remoteScreens.length>0||call.screen)&&<div className={'share-stage '+((remoteScreens.length+(call.screen?1:0))>1?'multiple':'single')}>
            {remoteScreens.map(person=><div className="share-card" key={person.id}>
              <div className="share-card-head"><div><Avatar src={call.avatars[person.id]} name={person.name} className="share-avatar"/><strong>{person.name}</strong></div><span className="live-pill">AO VIVO</span></div>
              {call.screenStreams[person.id]?<Media stream={call.screenStreams[person.id]} forceVideo volume={personVolume(person.id)} masterVolume={effectiveMasterVolume} audioScale={screenVolume} outputDeviceId={outputDeviceId}/>:<div className="screen-loading"><span/> Conectando transmissão…</div>}
            </div>)}
            {call.screen&&<div className="share-card self-share"><div className="share-card-head"><div><MonitorUp size={17}/><strong>Sua transmissão</strong></div><span className="live-pill">{call.shareAudio?'TELA + ÁUDIO':'AO VIVO'}</span></div><Media stream={call.screen} local forceVideo/></div>}
          </div>}

          <div className={'participant-grid '+((remoteScreens.length||call.screen)?'with-share':'')}>
            {call.people.map((person,index)=>{
              const isSelf=person.id===call.self,isSpeaking=Boolean(speaking[person.id])&&!(isSelf&&call.muted),peerState=isSelf?'connected':(call.peerStates[person.id]||'connecting');
              return <div className={'participant-card '+(isSelf?'self ':'')+(isSpeaking?'speaking':'')} key={person.id}>
                <div className="participant-status"><span className={'connection-dot '+peerState}/>{isSelf?'Você':peerStateText[peerState]}</div>
                <Avatar src={call.avatars[person.id]} name={person.name} className={'participant-avatar color-'+(index%6)}/>
                <div className="participant-name"><strong>{person.name}</strong>{isSelf&&<span>você</span>}</div>
                <div className="participant-state">{isSpeaking?<><AudioLines size={14}/> Falando</>:isSelf&&call.muted?<><MicOff size={14}/> Microfone desligado</>:<><Volume2 size={14}/> Na call</>}</div>
                {call.streams[person.id]&&<Media stream={call.streams[person.id]} volume={personVolume(person.id)} masterVolume={effectiveMasterVolume} sensitivity={sensitivity} outputDeviceId={outputDeviceId} onSpeaking={isSelf?undefined:value=>markSpeaking(person.id,value)}/>} 
              </div>;
            })}
            {call.people.length===1&&<button type="button" className="invite-tile" onClick={call.invite}><Users size={28}/><strong>Convide alguém</strong><span>Copiar link da sala</span></button>}
          </div>

          <div className="call-toolbar" aria-label="Controles da call">
            <button type="button" className={'round-control '+(call.muted?'danger-active':'')} disabled={deafened} onClick={call.toggleMute} title={call.muted?'Ativar microfone':'Silenciar microfone'}>{call.muted?<MicOff size={22}/>:<Mic size={22}/>}<span>{call.muted?'Ativar':'Silenciar'}</span></button>
            <button type="button" className={'round-control '+(deafened?'danger-active':'')} onClick={toggleDeafen} title="Ensurdecer"><Headphones size={22}/><span>{deafened?'Ouvir':'Ensurdecer'}</span></button>
            <button type="button" className={'round-control '+(call.sharing?'share-active':'')} onClick={call.share} title="Compartilhar tela"><MonitorUp size={22}/><span>{call.sharing?'Parar tela':'Transmitir'}</span></button>
            <button type="button" className="round-control" onClick={()=>{setSettingsTab('audio');setSettingsOpen(true);}} title="Configurações"><SlidersHorizontal size={22}/><span>Opções</span></button>
            <button type="button" className="round-control hangup" onClick={()=>{setSpeaking({});setDeafened(false);call.leave();}} title="Desconectar"><PhoneOff size={23}/><span>Sair</span></button>
          </div>
        </div>}
      </section>
    </main>

    <aside className="member-sidebar" aria-label="Participantes">
      <div className="member-header"><strong>Participantes</strong><span>{call.joined?call.people.length:0}</span></div>
      <div className="member-list">
        <p className="member-category">ONLINE — {call.joined?call.people.length:0}</p>
        {call.joined?call.people.map(person=>{
          const isSelf=person.id===call.self,isSpeaking=Boolean(speaking[person.id])&&!(isSelf&&call.muted),peerState=isSelf?'connected':(call.peerStates[person.id]||'connecting');
          return <div className={'member-item '+(isSpeaking?'speaking':'')} key={person.id}>
            <div className="member-main"><div className="member-avatar-wrap"><Avatar src={call.avatars[person.id]} name={person.name} className="member-avatar"/><i className={isSpeaking?'speaking':'online'}/></div><div><strong>{person.name}{isSelf?' (você)':''}</strong><small>{isSpeaking?'Falando agora':isSelf?(call.muted?'Microfone desligado':'Conectado'):`${peerStateText[peerState]} no áudio`}</small></div></div>
            {!isSelf&&<label className="member-volume"><Volume1 size={14}/><input aria-label={'Volume de '+person.name} type="range" min="0" max="100" step="5" value={personVolume(person.id)} onChange={e=>setVolumes(current=>({...current,[person.id]:Number(e.target.value)}))}/><span>{personVolume(person.id)}%</span></label>}
          </div>;
        }):<div className="member-empty"><Users size={28}/><p>Entre na call para ver quem está online.</p></div>}
      </div>
    </aside>

    {settingsOpen&&<div className="settings-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSettingsOpen(false);}}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Configurações">
        <aside className="settings-nav">
          <div className="settings-nav-title">CONFIGURAÇÕES</div>
          <button type="button" className={settingsTab==='audio'?'selected':''} onClick={()=>setSettingsTab('audio')}>Voz e áudio</button>
          <button type="button" className={settingsTab==='stream'?'selected':''} onClick={()=>setSettingsTab('stream')}>Transmissão</button>
          <button type="button" className={settingsTab==='profile'?'selected':''} onClick={()=>setSettingsTab('profile')}>Perfil</button>
          <button type="button" className={settingsTab==='appearance'?'selected':''} onClick={()=>setSettingsTab('appearance')}>Aparência</button>
        </aside>
        <div className="settings-content">
          <button type="button" className="settings-close" onClick={()=>setSettingsOpen(false)} aria-label="Fechar">×<small>ESC</small></button>

          {settingsTab==='audio'&&<>
            <h2>Voz e áudio</h2><p className="settings-description">Ajuste os dispositivos e o volume só neste computador.</p>
            <div className="setting-block"><label>DISPOSITIVO DE ENTRADA</label><select value={call.inputDeviceId} onChange={e=>void call.switchMicrophone(e.target.value)}><option value="">Padrão do sistema</option>{inputDevices.map(device=><option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></div>
            <div className="setting-block"><label>DISPOSITIVO DE SAÍDA</label><select value={outputDeviceId} onChange={e=>setOutputDeviceId(e.target.value)} disabled={!supportsOutputSelection}>{supportsOutputSelection?<><option value="">Padrão do sistema</option>{outputDevices.map(device=><option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</>:<option>Use a saída padrão do sistema</option>}</select></div>
            <div className="setting-block range-block"><div><label>VOLUME DAS VOZES</label><b>{masterVolume}%</b></div><input type="range" min="0" max="100" step="5" value={masterVolume} onChange={e=>setMasterVolume(Number(e.target.value))}/></div>
            <div className="setting-card switch-row"><div><strong>Processamento de voz</strong><small>Cancelamento de eco, redução de ruído e ganho automático.</small></div><button type="button" role="switch" aria-checked={call.voiceProcessing} className={'switch '+(call.voiceProcessing?'on':'')} onClick={()=>void call.setVoiceProcessing(!call.voiceProcessing)}><span/></button></div>
            <div className="setting-block"><label>SENSIBILIDADE DE QUEM ESTÁ FALANDO</label><div className="segmented">{([['low','Baixa'],['normal','Normal'],['high','Alta']] as [Sensitivity,string][]).map(([value,label])=><button type="button" className={sensitivity===value?'selected':''} key={value} onClick={()=>setSensitivity(value)}>{label}</button>)}</div></div>
            <div className="setting-card connection-card"><div><strong>{call.turnConfigured?'TURN configurado':'TURN não detectado'}</strong><small>{call.turnConfigured?'Fallback disponível para redes que bloqueiam conexão direta.':'Algumas redes podem impedir a comunicação sem TURN.'}</small></div><button type="button" onClick={()=>{void unlockRoomAudio();call.repairAudio();}}><AudioLines size={16}/> Reconectar áudio</button></div>
          </>}

          {settingsTab==='stream'&&<>
            <h2>Transmissão</h2><p className="settings-description">Controle a qualidade para preservar o áudio da call.</p>
            <div className="setting-block"><label>QUALIDADE</label><div className="quality-grid">{(Object.keys(qualityInfo) as ShareQuality[]).map(value=><button type="button" className={call.shareQuality===value?'selected':''} key={value} onClick={()=>void call.setShareQuality(value)}><strong>{qualityInfo[value].label}</strong><span>{qualityInfo[value].detail}</span></button>)}</div></div>
            <div className="setting-block range-block"><div><label>VOLUME DO ÁUDIO DAS TRANSMISSÕES</label><b>{screenVolume}%</b></div><input type="range" min="0" max="100" step="5" value={screenVolume} onChange={e=>setScreenVolume(Number(e.target.value))}/></div>
            <div className="setting-card"><div><strong>Compartilhar áudio da aba</strong><small>Ao escolher uma aba ou tela no Chrome/Edge, marque “Compartilhar áudio” quando essa opção aparecer.</small></div></div>
          </>}

          {settingsTab==='profile'&&<>
            <h2>Meu perfil</h2><p className="settings-description">Seu nome e sua foto aparecem para todo mundo da sala.</p>
            <div className="profile-editor"><button type="button" className="profile-editor-avatar" onClick={()=>photoInput.current?.click()} disabled={profileBusy}><Avatar src={avatar} name={name||'Visitante'} className="profile-large-avatar"/><span><Camera size={17}/></span></button><div><button type="button" className="secondary-button" onClick={()=>photoInput.current?.click()} disabled={profileBusy}>{avatar?'Trocar foto':'Enviar foto'}</button>{avatar&&<button type="button" className="text-danger" onClick={()=>void removePhoto()}>Remover foto</button>}</div></div>
            <div className="setting-block"><label>NOME DE EXIBIÇÃO</label><input className="settings-input" value={name} maxLength={30} onChange={e=>setName(e.target.value)} placeholder="Seu nome"/></div>
            <button type="button" className="save-button" disabled={profileBusy} onClick={()=>void saveProfile()}>{profileBusy?'Salvando…':'Salvar perfil'}</button>
          </>}

          {settingsTab==='appearance'&&<>
            <h2>Aparência</h2><p className="settings-description">Pequenos ajustes para deixar a interface mais confortável.</p>
            <div className="setting-card switch-row"><div><strong>Modo compacto</strong><small>Reduz espaços e deixa mais participantes visíveis.</small></div><button type="button" role="switch" aria-checked={compactMode} className={'switch '+(compactMode?'on':'')} onClick={()=>setCompactMode(v=>!v)}><span/></button></div>
            <div className="setting-card switch-row"><div><strong>Lista de participantes</strong><small>Mostra volumes individuais e status de voz na lateral direita.</small></div><button type="button" role="switch" aria-checked={memberPanelOpen} className={'switch '+(memberPanelOpen?'on':'')} onClick={()=>setMemberPanelOpen(v=>!v)}><span/></button></div>
          </>}
        </div>
      </section>
    </div>}

    <input ref={photoInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>void choosePhoto(event.target.files?.[0])}/>
  </div>;
}
