'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MonitorUp, Link as LinkIcon, LogOut, Radio, Smartphone, Shield, Gauge, Users, Wifi, MonitorPlay } from 'lucide-react';
import { useCall, type StreamQuality } from './use-call';

function VideoCard({stream,label,tag,muted=false}:{stream:MediaStream;label:string;tag?:string;muted?:boolean}){
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    if(ref.current){
      ref.current.srcObject=stream;
      ref.current.muted=muted;
      void ref.current.play().catch(()=>{});
    }
  },[stream,muted]);
  return <div className="video-card"><div className="video-top"><strong>{label}</strong>{tag&&<span>{tag}</span>}</div><video ref={ref} autoPlay playsInline muted={muted} controls className="video"/></div>;
}

function initials(name:string){
  return name.trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase()||'BO';
}

export default function Home(){
  const [channel,setChannel]=useState('Central');
  const [name,setName]=useState('');
  const call=useCall(channel);
  const channels=['Central','Elite','Mobile'];
  const remoteActive=useMemo(()=>call.broadcasters.filter(p=>p.id!==call.self),[call.broadcasters,call.self]);
  const qualityLabels:Record<StreamQuality,string>={stable:'Estável 360p',balanced:'Equilibrada 540p',high:'Alta 720p'};

  return <div className="bope-app">
    <aside className="sidebar">
      <div className="logo-block">
        <div className="logo-icon"><Radio size={22}/></div>
        <div>
          <div className="logo-title">BOPE</div>
          <div className="logo-sub">stream hub</div>
        </div>
      </div>

      <div className="side-section">
        <div className="side-label">salas</div>
        <div className="channel-list">
          {channels.map(item=><button key={item} className={`channel-btn ${item===channel?'active':''}`} onClick={()=>{if(item!==channel){call.leave();setChannel(item);}}}>
            <MonitorPlay size={16}/>
            <span>{item}</span>
            {item===channel&&call.joined&&<i/>}
          </button>)}
        </div>
      </div>

      <div className="side-panel mobile-ok">
        <Smartphone size={18}/>
        <div>
          <strong>Total mobile</strong>
          <p>Layout leve, responsivo e pronto para assistir do celular.</p>
        </div>
      </div>

      <div className="side-panel quality-box">
        <Shield size={18}/>
        <div>
          <strong>Foco em transmissão</strong>
          <p>Sem call complexa. Só entrar, assistir e transmitir com qualidade.</p>
        </div>
      </div>
    </aside>

    <main className="content">
      <header className="topbar">
        <div>
          <div className="crumb">BOPE / {channel}</div>
          <h1>Transmissão ao vivo em vermelho e preto.</h1>
          <p>Site reformulado para ficar mais leve, bonito e centrado em streaming.</p>
        </div>
        <div className="topbar-actions">
          <button className="ghost-btn" onClick={call.invite}><LinkIcon size={16}/> convite</button>
          {call.joined&&<button className="danger-btn" onClick={call.leave}><LogOut size={16}/> sair</button>}
        </div>
      </header>

      {!call.joined ? (
        <section className="hero-grid">
          <div className="hero-card">
            <div className="eyebrow">AO VIVO · LEVE · MOBILE</div>
            <h2>Entre na sala e foque só na transmissão.</h2>
            <p>Nada de tela poluída. O BOPE foi reformulado para priorizar vídeo, estabilidade e visual bonito em desktop e celular.</p>
            <label htmlFor="name" className="field-label">Seu nome</label>
            <input id="name" className="text-input" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!call.busy)void call.join(name)}} maxLength={30} placeholder="Ex: zen"/>
            <button className="primary-btn" disabled={call.busy} onClick={()=>call.join(name)}><MonitorUp size={18}/>{call.busy?'Entrando...':'Entrar na sala'}</button>
            <div className="hero-mini-stats">
              <span><Users size={14}/> até 10 pessoas</span>
              <span><Wifi size={14}/> vídeo em tempo real</span>
              <span><Gauge size={14}/> qualidade ajustável</span>
            </div>
            {call.error&&<div className="notice">{call.error}</div>}
          </div>

          <div className="preview-card">
            <div className="preview-screen">
              <div className="preview-badge">BOPE LIVE</div>
              <div className="preview-box">
                <div className="preview-head">Central · qualidade {qualityLabels[call.quality]}</div>
                <div className="preview-layout">
                  <div className="fake-video"><span>transmissão principal</span></div>
                  <div className="fake-side">
                    <div className="fake-person">ZE</div>
                    <div className="fake-person">JO</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="stream-layout">
          <div className="main-column">
            {call.error&&<div className="notice">{call.error}</div>}

            {remoteActive.length>0 ? (
              <div className="remote-grid">
                {remoteActive.map(person=>call.streams[person.id] ? <VideoCard key={person.id} stream={call.streams[person.id]} label={person.name} tag="AO VIVO"/> : null)}
              </div>
            ) : (
              <div className="empty-stream">
                <MonitorPlay size={28}/>
                <h3>Ninguém está transmitindo agora</h3>
                <p>Use o botão abaixo para começar uma transmissão ou envie o convite para alguém assistir.</p>
                <button className="ghost-btn large" onClick={call.invite}><LinkIcon size={16}/> copiar convite</button>
              </div>
            )}

            {call.screen && <div className="local-area"><VideoCard stream={call.screen} label="Sua transmissão" tag="AO VIVO" muted/></div>}
          </div>

          <div className="side-column">
            <div className="panel control-panel">
              <div className="panel-title">controle rápido</div>
              <div className="join-status">{channel} · {call.people.length} pessoa{call.people.length===1?'':'s'} na sala</div>
              <div className="action-row">
                <button className={`primary-btn ${call.sharing?'stop':''}`} onClick={call.share}><MonitorUp size={18}/>{call.sharing?'Parar transmissão':'Iniciar transmissão'}</button>
                <button className="ghost-btn" onClick={call.invite}><LinkIcon size={16}/> convite</button>
              </div>
              <div className="quality-selector">
                <div className="field-label">qualidade da transmissão</div>
                <div className="quality-list">
                  {(['stable','balanced','high'] as StreamQuality[]).map(item=><button key={item} className={`quality-btn ${call.quality===item?'active':''}`} onClick={()=>call.setQuality(item)}>{qualityLabels[item]}</button>)}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">pessoas na sala</div>
              <div className="people-list">
                {call.people.map(person=><div className="person-row" key={person.id}>
                  <div className="person-avatar">{initials(person.name)}</div>
                  <div className="person-meta">
                    <strong>{person.name}{person.id===call.self?' (você)':''}</strong>
                    <span>{call.streams[person.id]?.getVideoTracks()?.length ? 'transmitindo agora' : 'assistindo'}</span>
                  </div>
                </div>)}
              </div>
            </div>

            <div className="panel tips-panel">
              <div className="panel-title">dicas de qualidade</div>
              <ul>
                <li><strong>Estável:</strong> melhor para internet fraca e celular.</li>
                <li><strong>Equilibrada:</strong> recomendada para uso geral.</li>
                <li><strong>Alta:</strong> melhor imagem, pede internet melhor.</li>
                <li>No Chrome/Edge, marque compartilhar áudio se quiser enviar o som da aba.</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  </div>;
}
