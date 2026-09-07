'use client';
import {useEffect,useMemo,useState} from 'react';
import {Ban,BookOpen,Copy,Crown,Gavel,Link2,LogOut,RefreshCw,Shield,ShieldCheck,Timer,Trash2,UserMinus,Users} from 'lucide-react';
import {Avatar} from './media';

const labels:Record<string,string>={owner:'Dono',admin:'Administrador',moderator:'Moderador',member:'Membro'};
const rank:Record<string,number>={member:1,moderator:2,admin:3,owner:4};
const auditLabels:Record<string,string>={
 server_create:'criou o servidor',server_update:'atualizou o servidor',server_rename:'renomeou o servidor',invite_rotate:'gerou um novo convite',
 member_join:'entrou no servidor',member_leave:'saiu do servidor',member_kick:'expulsou',member_ban:'baniu',member_unban:'removeu o banimento de',
 member_timeout:'aplicou timeout em',timeout_clear:'removeu o timeout de',role_change:'alterou o cargo de',owner_transfer:'transferiu a propriedade para',
 channel_create:'criou um canal',channel_rename:'renomeou um canal',channel_update:'atualizou um canal',channel_delete:'excluiu um canal'
};

export function ServerSettings({group,data,act,busy,copy,onClose,onLeaveOrDelete,setNotice}:any){
 const [tab,setTab]=useState('overview'),[serverName,setServerName]=useState(group?.name||''),[description,setDescription]=useState(group?.description||'');
 useEffect(()=>{setServerName(group?.name||'');setDescription(group?.description||'')},[group?.id,group?.name,group?.description]);
 const me=data.me,meMember=data.members.find((m:any)=>m.userKey===me?.userKey),myRank=rank[group?.role]||0;
 const online=data.members.filter((m:any)=>m.presence!=='offline').length;
 const canManageTarget=(m:any,min=2)=>m.userKey!==me?.userKey&&myRank>=min&&myRank>(rank[m.role]||0);
 const roleOptions=(m:any)=>group.role==='owner'?['member','moderator','admin']:group.role==='admin'&&rank[m.role]<3?['member','moderator']:[];
 const timeoutText=(m:any)=>Number(m.timeoutUntil)>Date.now()?new Date(Number(m.timeoutUntil)).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 const tabs=useMemo(()=>[
  ['overview','Visão geral',Shield],['members','Membros',Users],['roles','Cargos',Crown],['bans','Banimentos',Ban],['audit','Registro',BookOpen]
 ],[]);
 async function doAct(action:string,extra:any={},message='Alteração salva.') {const r=await act(action,extra);if(r)setNotice(message);return r}
 async function saveOverview(){await doAct('serverUpdate',{name:serverName,description},'Servidor atualizado.')}
 async function moderate(action:string,m:any,extra:any={}){
  const text=action==='kick'?`Expulsar ${m.name}?`:action==='ban'?`Banir ${m.name}?`:action==='transferOwner'?`Transferir a propriedade para ${m.name}? Você passará a Administrador.`:'';
  if(text&&!confirm(text))return;
  const reason=(action==='kick'||action==='ban')?prompt('Motivo (opcional):','')||'':'';
  const r=await doAct(action,{target:m.userKey,reason,...extra},action==='transferOwner'?'Propriedade transferida.':'Moderação aplicada.');
  if(r&&action==='transferOwner')onClose();
 }
 return <div className="server-settings-shell">
  <aside className="server-settings-nav">
   <div className="server-settings-identity"><span>{group.name.slice(0,2).toUpperCase()}</span><div><strong>{group.name}</strong><small>{labels[group.role]}</small></div></div>
   {tabs.map(([key,label,Icon]:any)=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}><Icon size={16}/>{label}{key==='bans'&&data.bans?.length?<i>{data.bans.length}</i>:null}</button>)}
  </aside>
  <section className="server-settings-content">
   {tab==='overview'&&<div className="settings-page">
    <header><div><small>CONFIGURAÇÃO DO SERVIDOR</small><h3>Visão geral</h3></div><span className="permission-chip"><ShieldCheck size={14}/>{labels[group.role]}</span></header>
    <div className="server-stats"><div><strong>{group.memberCount}</strong><span>Membros</span></div><div><strong>{online}</strong><span>Online</span></div><div><strong>{data.channels.length}</strong><span>Canais</span></div></div>
    {myRank>=3?<><label>Nome do servidor<input maxLength={40} value={serverName} onChange={e=>setServerName(e.target.value)}/></label><label>Descrição<textarea maxLength={240} rows={3} value={description} placeholder="Explique o objetivo deste servidor" onChange={e=>setDescription(e.target.value)}/></label><button className="primary" disabled={busy||serverName.trim().length<2} onClick={()=>void saveOverview()}>Salvar alterações</button></>:<p className="settings-note">Somente Dono e Administradores podem alterar estas informações.</p>}
    <div className="settings-card"><div><Link2 size={18}/><div><strong>Convite do servidor</strong><small>Compartilhe este link para adicionar pessoas.</small></div></div><code>{location.origin}/?invite={group.inviteCode}</code><div className="settings-card-actions"><button onClick={()=>void copy(location.origin+'/?invite='+group.inviteCode)}><Copy size={15}/>Copiar link</button>{myRank>=3&&<button disabled={busy} onClick={()=>void doAct('invite',{},'Novo convite gerado.')}><RefreshCw size={15}/>Gerar novo</button>}</div></div>
    <div className="danger-zone"><strong>Zona de risco</strong>{group.role==='owner'?<button className="danger" onClick={()=>{if(confirm('Excluir este servidor e todo o conteúdo?'))onLeaveOrDelete('delete')}}><Trash2 size={16}/>Excluir servidor</button>:<button className="danger" onClick={()=>{if(confirm('Sair deste servidor?'))onLeaveOrDelete('leave')}}><LogOut size={16}/>Sair do servidor</button>}</div>
   </div>}
   {tab==='members'&&<div className="settings-page"><header><div><small>GERENCIAMENTO</small><h3>Membros</h3></div><span>{data.members.length} pessoas</span></header><div className="member-admin-list">{data.members.map((m:any)=>{const opts=roleOptions(m),timed=timeoutText(m);return <div className="member-admin-row" key={m.userKey}><Avatar src={m.avatar} name={m.name} className="member-admin-avatar"/><div className="member-admin-info"><strong>{m.name}{m.userKey===me?.userKey&&<em> você</em>}</strong><small>{labels[m.role]} · {m.presence==='offline'?'Offline':'Online'}{timed?' · timeout até '+timed:''}</small></div><div className="member-admin-actions">{opts.length>0&&<select aria-label={'Cargo de '+m.name} value={m.role} disabled={busy} onChange={e=>void doAct('role',{target:m.userKey,role:e.target.value},'Cargo atualizado.')}>{opts.map(r=><option key={r} value={r}>{labels[r]}</option>)}</select>}{canManageTarget(m,2)&&<><select className="timeout-select" aria-label={'Timeout de '+m.name} defaultValue="" onChange={e=>{const v=e.currentTarget.value;if(v!=='')void moderate('timeout',m,{minutes:Number(v)});e.currentTarget.value=''}}><option value="">Timeout…</option><option value="1">1 minuto</option><option value="5">5 minutos</option><option value="10">10 minutos</option><option value="60">1 hora</option><option value="1440">1 dia</option><option value="10080">7 dias</option><option value="40320">28 dias</option>{timed&&<option value="0">Remover timeout</option>}</select><button title="Expulsar" onClick={()=>void moderate('kick',m)}><UserMinus size={15}/></button></>}{canManageTarget(m,3)&&<button className="danger" title="Banir" onClick={()=>void moderate('ban',m)}><Ban size={15}/></button>}{group.role==='owner'&&m.role!=='owner'&&<button className="owner-transfer" title="Transferir propriedade" onClick={()=>void moderate('transferOwner',m)}><Crown size={15}/></button>}</div></div>})}</div></div>}
   {tab==='roles'&&<div className="settings-page"><header><div><small>HIERARQUIA</small><h3>Cargos e permissões</h3></div></header><div className="role-grid"><article><Crown/><strong>Dono</strong><p>Controle total, transferência de propriedade, exclusão do servidor e gerenciamento de todos os cargos.</p></article><article><ShieldCheck/><strong>Administrador</strong><p>Gerencia servidor, canais, convites, membros abaixo do cargo de Admin, banimentos e registro de moderação.</p></article><article><Gavel/><strong>Moderador</strong><p>Apaga e fixa mensagens, aplica timeout e expulsa membros abaixo do próprio cargo.</p></article><article><Users/><strong>Membro</strong><p>Conversa, reage, envia mídia, participa de DMs e entra nos canais de voz.</p></article></div><p className="settings-note">A hierarquia é aplicada também no servidor: um cargo nunca pode moderar outro do mesmo nível ou acima.</p></div>}
   {tab==='bans'&&<div className="settings-page"><header><div><small>SEGURANÇA</small><h3>Banimentos</h3></div></header>{myRank<3?<p className="settings-note">Somente Dono e Administradores podem ver banimentos.</p>:!data.bans?.length?<div className="settings-empty"><Ban size={26}/><strong>Nenhum usuário banido</strong><span>Os banimentos aparecerão aqui.</span></div>:<div className="ban-list">{data.bans.map((b:any)=><div key={b.userKey}><div><strong>{b.name||'Usuário'}</strong><small>{b.reason||'Sem motivo'} · {new Date(b.created).toLocaleDateString('pt-BR')}</small></div><button onClick={()=>void doAct('unban',{target:b.userKey},'Banimento removido.')}>Desbanir</button></div>)}</div>}</div>}
   {tab==='audit'&&<div className="settings-page"><header><div><small>MODERAÇÃO</small><h3>Registro de auditoria</h3></div></header>{myRank<3?<p className="settings-note">Somente Dono e Administradores podem ver o registro.</p>:!data.auditLog?.length?<div className="settings-empty"><BookOpen size={26}/><strong>Nenhuma ação registrada</strong></div>:<div className="audit-list">{data.auditLog.map((a:any)=><div key={a.id}><span className="audit-icon"><Gavel size={14}/></span><p><strong>{a.actorName}</strong> {auditLabels[a.action]||a.action} {a.targetName&&<b>{a.targetName}</b>}{a.details&&<small>{a.details}</small>}</p><time>{new Date(a.created).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</time></div>)}</div>}</div>}
  </section>
 </div>
}
