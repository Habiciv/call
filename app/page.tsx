import {useEffect,useState} from 'react';
import {Radio,MonitorUp,Link2,Star,Plus,ArrowUpRight,ChevronRight,Shield,SlidersHorizontal,MessageSquare,LayoutDashboard,Maximize2,Minimize2,LogOut,Square,Wifi,RefreshCw,Check,Signal,Monitor,Heart,Menu,X,Trash2} from 'lucide-react';
import {useBroadcast,type ShareQuality} from './use-broadcast';
import {StreamPlayer} from './stream-player';
import {Chat} from './chat';

type Bookmark={id:string;name:string};
const presets:{id:ShareQuality;name:string;detail:string;description:string}[]=[
 {id:'stable',name:'Econômica',detail:'480p · 30 fps',description:'Para conexões limitadas'},
 {id:'balanced',name:'Equilibrada',detail:'720p · 30 fps',description:'Boa imagem, menos consumo'},
 {id:'high',name:'Full HD',detail:'1080p · 30 fps',description:'Mais detalhes na tela'},
 {id:'ultra',name:'Fluida',detail:'1080p · 60 fps',description:'Para jogos e movimento'},
];
function read<T,>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export default function Home(){
 const live=useBroadcast('Principal');
 const [name,setName]=useState(()=>{const n=read('zenz-name',read('vyro-name',''));return typeof n==='string'?n:'';}),[title,setTitle]=useState('Sala principal');
 const [bookmarks,setBookmarks]=useState<Bookmark[]>(()=>{const b=read<any>('zenz-favorites',read<any>('vyro-favorites',[]));return Array.isArray(b)?b.filter(x=>x&&typeof x.name==='string'&&/^[a-f0-9-]{36}$/.test(x.id)).slice(0,20):[];});
 const [theater,setTheater]=useState(false),[mobilePanel,setMobilePanel]=useState<'stage'|'chat'|'studio'>('stage'),[menu,setMenu]=useState(false),[toast,setToast]=useState(''),[focus,setFocus]=useState(''),[messageCount,setMessageCount]=useState(0),[copied,setCopied]=useState(false);
 const canShare=typeof navigator.mediaDevices?.getDisplayMedia==='function';
 useEffect(()=>{save('zenz-name',name);},[name]);
 useEffect(()=>{save('zenz-favorites',bookmarks);},[bookmarks]);
 useEffect(()=>{const q=read<ShareQuality>('zenz-quality',read<ShareQuality>('vyro-quality','balanced'));if(presets.some(p=>p.id===q))void live.setShareQuality(q);},[]);
 useEffect(()=>{if(live.space){const stored=read<string>('zenz-room-'+live.space,read<string>('vyro-room-'+live.space,'Sala principal'));setTitle(typeof stored==='string'?stored:'Sala principal');}},[live.space]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMenu(false);if(!document.fullscreenElement)setTheater(false);}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const streams=[...(live.screen?[{id:'self',name:name.trim()||'Você',stream:live.screen,local:true,audio:live.shareAudio}]:[]),...live.people.filter(p=>p.id!==live.self&&live.remoteSharing[p.id]).map(p=>({id:p.id,name:p.name,stream:live.screenStreams[p.id],local:false,audio:live.remoteShareAudio[p.id]}))];
 const focused=streams.find(s=>s.id===focus);
 const visible=focused?[focused]:streams;
 const favorite=bookmarks.some(b=>b.id===live.space);
 const preset=presets.find(p=>p.id===live.shareQuality)!;
 const connectionCount=Object.values(live.peerStates).filter(p=>p==='connected').length;
 const statEntries=Object.entries(live.stats).filter(([key,stat])=>stat.direction==='recebendo'?live.remoteSharing[key.split(':')[0]]:live.sharing);
 async function invite(){
  try{await navigator.clipboard.writeText(location.href);setCopied(true);setToast('Link copiado. Envie para quem vai assistir.');setTimeout(()=>setCopied(false),3000);}
  catch{setToast('Copie o link da sala abaixo.');}
 }
 function toggleFavorite(){
  if(!live.space)return;
  if(favorite)setBookmarks(b=>b.filter(x=>x.id!==live.space));
  else setBookmarks(b=>[{id:live.space,name:title},...b].slice(0,20));
  setToast(favorite?'Sala removida dos favoritos.':'Sala salva neste dispositivo.');
 }
 function navigateRoom(id:string){live.leave();location.hash=id;location.reload();}
 function rename(value:string){setTitle(value);if(live.space)save('zenz-room-'+live.space,value);setBookmarks(b=>b.map(x=>x.id===live.space?{...x,name:value}:x));}
 async function join(){if(await live.join(name)){setToast('Você entrou na sala. Nenhum microfone é utilizado.');}}
 return <div className={`bope-app ${theater?'theater':''} panel-${mobilePanel}`}>
  {menu&&<button className="nav-scrim" aria-label="Fechar menu" onClick={()=>setMenu(false)}/>}
  <aside className={'sidebar '+(menu?'open':'')}>
   <a className="brand" href="#" onClick={e=>{e.preventDefault();setMobilePanel('stage');setMenu(false);}} aria-label="ZENZ início"><span className="brand-mark"><Shield size={25}/></span><span>ZENZ<small>TRANSMISSÕES</small></span></a>
   <div className="workspace-label">SEU ESPAÇO <span>01</span></div>
   <button className="nav-item current" onClick={()=>{setMobilePanel('stage');setMenu(false);}}><LayoutDashboard size={18}/> Central de transmissões</button>
   <button className="nav-item" onClick={()=>{setMobilePanel('studio');setMenu(false);document.getElementById('studio')?.scrollIntoView({behavior:'smooth'});}}><SlidersHorizontal size={18}/> Estúdio</button>
   <div className="sidebar-heading">SUAS SALAS <button title="Criar nova sala" aria-label="Criar nova sala" disabled={live.joined} onClick={()=>navigateRoom(crypto.randomUUID())}><Plus size={17}/></button></div>
   <button className="room-item active" onClick={()=>{setMobilePanel('stage');setMenu(false);}}><span className="room-icon"><Radio size={17}/></span><span><strong>{title||'Sala principal'}</strong><small>{live.joined?'Você está aqui':'Pronta para conectar'}</small></span><i className={live.joined?'online':''}/></button>
   <div className="sidebar-heading favorites-label">FAVORITAS <Star size={13}/></div>
   <div className="favorite-list">{bookmarks.length?bookmarks.map(b=><div className="favorite-row" key={b.id}><button disabled={live.joined&&b.id!==live.space} onClick={()=>{if(b.id!==live.space)navigateRoom(b.id);else setMenu(false);}}><span>#</span>{b.name||'Sala sem nome'}</button><button aria-label={`Remover ${b.name} dos favoritos`} onClick={()=>setBookmarks(old=>old.filter(x=>x.id!==b.id))}><Trash2 size={13}/></button></div>):<p className="sidebar-hint">Salve uma sala para voltar<br/>quando quiser.</p>}</div>
   {live.joined&&<p className="sidebar-hint">Saia da sala atual para criar ou abrir outra.</p>}
   <div className="sidebar-bottom"><div className="mini-promo"><Signal size={21}/><strong>Menos ruído.<br/>Mais transmissão.</strong><p>Sua tela no centro de tudo.</p></div><div className="profile-chip"><span>{(name||'V').slice(0,2).toUpperCase()}</span><div><strong>{name||'Visitante'}</strong><small>{live.joined?'Conectado à sala':'Pronto para assistir'}</small></div><i className={live.joined?'online':''}/></div></div>
  </aside>
  <div className="content-shell">
   <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Abrir menu" onClick={()=>setMenu(true)}><Menu size={21}/></button><span className="desktop-crumb">Seu espaço <ChevronRight size={13}/></span><strong>{title||'Sala principal'}</strong><span className="private-badge"><Link2 size={12}/> Por convite</span></div><div className="topbar-actions"><button className={'icon-button '+(favorite?'is-favorite':'')} aria-label={favorite?'Desfavoritar sala':'Favoritar sala'} onClick={toggleFavorite}><Star size={18} fill={favorite?'currentColor':'none'}/></button><button className="button small" onClick={()=>void invite()}>{copied?<Check size={15}/>:<Link2 size={15}/>}<span>Convidar</span></button></div></header>
   <main className="main-layout">
    <section className="stage-column" aria-label="Transmissões">
     <div className="page-heading"><div><span className="eyebrow"><i/> ZENZ AO VIVO</span><h1>Sua tela. Sua galera.</h1><p>Compartilhe o momento, sem perder nenhum detalhe.</p></div><span className="session-status"><i className={live.joined?'online':''}/>{live.joined?'Sala conectada':'Sala disponível'}</span></div>
     {live.error&&<div className="error-banner" role="alert">{live.error}</div>}
     {!live.joined?<section className="welcome-stage"><div className="stage-lines"/><div className="hero-emblem"><Shield size={54}/><span className="emblem-dot"/></div><span className="eyebrow">DÊ PLAY NO SEU ESPAÇO</span><h2>O próximo momento<br/>começa aqui<span>.</span></h2><p>Uma sala para sua tela, seus jogos e suas ideias.<br/>Entre, convide a galera e comece a transmitir.</p><form className="join-form" onSubmit={e=>{e.preventDefault();void join();}}><label htmlFor="display-name">Como você quer aparecer?</label><div><input id="display-name" autoComplete="nickname" placeholder="Seu nome" maxLength={30} value={name} onChange={e=>setName(e.target.value)}/><button className="button primary" disabled={live.busy||!live.space}>{live.busy?'Entrando…':'Entrar na sala'}<ArrowUpRight size={18}/></button></div></form><div className="hero-foot"><span><Monitor size={13}/> Tela e áudio da transmissão</span><i/><span>Sem câmera. Sem microfone.</span></div></section>:<>
      <div className="stage-heading"><div><span className="live-count"><Radio size={15}/>{streams.length} {streams.length===1?'transmissão':'transmissões'}</span><span className="viewer-count">{live.people.length} {live.people.length===1?'pessoa':'pessoas'} na sala</span></div><button className="subtle" aria-pressed={theater} onClick={()=>setTheater(t=>!t)}>{theater?<Minimize2 size={16}/>:<Maximize2 size={16}/>}<span>{theater?'Sair do cinema':'Modo cinema'}</span></button></div>
      {streams.length>1&&<div className="stream-tabs"><button className={!focused?'selected':''} onClick={()=>setFocus('')}>Todas</button>{streams.map(s=><button key={s.id} className={focused?.id===s.id?'selected':''} onClick={()=>setFocus(s.id)}>{s.name}</button>)}</div>}
      {streams.length?<div className={'stream-grid '+(visible.length===1?'single':'')}>{streams.map(s=><div className="stream-slot" key={s.id} hidden={!!focused&&focused.id!==s.id}><StreamPlayer stream={s.stream} name={s.name} local={s.local} hasAudio={s.audio} quiet={!!focused&&focused.id!==s.id} onRepair={live.repairStream}/></div>)}</div>:<div className="waiting-stage"><div className="waiting-icon"><MonitorUp size={36}/></div><span className="eyebrow">O PALCO ESTÁ PRONTO</span><h2>Quem vai dar o play?</h2><p>Comece uma transmissão ou convide alguém<br/>para compartilhar a tela com você.</p><button className="button primary" disabled={live.shareBusy} onClick={()=>void live.share()}><MonitorUp size={18}/>{live.shareBusy?'Abrindo seletor…':'Iniciar transmissão'}</button>{!canShare&&<small>No celular, toque em Transmitir para abrir a permissão nativa quando o navegador suportar captura de tela. Use Chrome atualizado no Android; alguns navegadores, especialmente no iPhone, não permitem transmitir a tela pelo site.</small>}</div>}
      <div className="broadcast-toolbar"><div><span className={'toolbar-indicator '+(live.sharing?'active':'')}><Radio size={18}/></span><div><strong>{live.sharing?'Você está ao vivo':'Você está na plateia'}</strong><small>{live.sharing?preset.detail:'Escolha uma tela para começar'}</small></div></div><div><button className={'button '+(live.sharing?'stop':'primary')} disabled={live.shareBusy} onClick={()=>void live.share()}>{live.sharing?<Square size={15}/>:<MonitorUp size={17}/>}<span>{live.sharing?'Encerrar':live.shareBusy?'Aguarde…':'Transmitir'}</span></button><button className="icon-button exit-button" aria-label="Sair da sala" title="Sair da sala" onClick={()=>{live.leave();setFocus('');setTheater(false);setMessageCount(0);}}><LogOut size={19}/></button></div></div>
     </>}
     <section className="studio-panel" id="studio"><div className="section-title"><div><SlidersHorizontal size={18}/><h2>Seu estúdio</h2></div><span>CONFIGURE DO SEU JEITO</span></div><div className="studio-intro"><div><h3>Qualidade da transmissão</h3><p>Escolha o equilíbrio entre nitidez e fluidez.</p></div><span className="auto-badge"><Signal size={12}/> Adaptação de rede</span></div><div className="quality-grid">{presets.map(p=><button className={'quality-option '+(live.shareQuality===p.id?'selected':'')} key={p.id} aria-pressed={live.shareQuality===p.id} onClick={()=>{void live.setShareQuality(p.id);save('zenz-quality',p.id);}}><span className="quality-name">{p.name}<span className="radio-check">{live.shareQuality===p.id&&<Check size={10}/>}</span></span><strong>{p.detail}</strong><small>{p.description}</small></button>)}</div><p className="quality-note">A qualidade final depende da tela escolhida, do dispositivo e da conexão. Para transmitir som, marque “Compartilhar áudio” no seletor do navegador.</p>
      <details className="diagnostics"><summary><Wifi size={16}/> Saúde da transmissão <ChevronRight size={14}/></summary><div className="diagnostic-grid"><div><small>Conexões ativas</small><strong>{connectionCount}</strong></div><div><small>Rota alternativa</small><strong>{live.turnConfigured?'Disponível':'Não configurada'}</strong></div><div><small>Perfil de envio</small><strong>{preset.detail}</strong></div></div>{statEntries.map(([id,s])=><div className="stat-row" key={id}><span>{live.people.find(p=>p.id===id.split(':')[0])?.name||'Participante'} · {s.direction}</span><strong>{s.width&&s.height?`${s.width}×${s.height}`:'—'} · {s.fps??'—'} fps · {s.kbps??'—'} kb/s · {s.rtt??'—'} ms</strong></div>)}{!statEntries.length&&<p className="quality-note">As medições aparecem quando há uma transmissão entre participantes.</p>}<button className="subtle" disabled={!live.joined} onClick={live.repairStream}><RefreshCw size={14}/> Reconectar transmissão</button></details>
      <details className="room-settings"><summary><Link2 size={16}/> Sala e convite <ChevronRight size={14}/></summary><label>Nome da sala neste dispositivo<input value={title} maxLength={40} onChange={e=>rename(e.target.value)} placeholder="Sala principal"/></label><label>Link para convidar<input readOnly value={live.space?location.href:''} onFocus={e=>e.target.select()} aria-label="Link da sala"/></label><button className="subtle" onClick={()=>void invite()}><Link2 size={14}/> Copiar convite</button></details>
     </section>
     <footer className="page-footer"><span><Shield size={13}/> ZENZ</span> Feito para compartilhar o que importa.<Heart size={12}/></footer>
    </section>
    <Chat joined={live.joined} self={live.self} request={live.chatRequest} people={live.people} onCount={setMessageCount}/>
   </main>
  </div>
  <nav className="mobile-tabs" aria-label="Navegação principal"><button className={mobilePanel==='stage'?'selected':''} onClick={()=>setMobilePanel('stage')}><Monitor size={19}/><span>Assistir</span></button><button className={mobilePanel==='chat'?'selected':''} onClick={()=>setMobilePanel('chat')}><MessageSquare size={19}/><span>Chat{messageCount?` · ${messageCount}`:''}</span></button><button className={mobilePanel==='studio'?'selected':''} onClick={()=>setMobilePanel('studio')}><SlidersHorizontal size={19}/><span>Estúdio</span></button></nav>
  {toast&&<div className="toast" role="status"><Check size={17}/>{toast}<button aria-label="Fechar aviso" onClick={()=>setToast('')}><X size={15}/></button></div>}
 </div>;
}
