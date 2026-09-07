'use client';
import {useEffect,useState} from 'react';
import {Hash,Trash2,Volume2} from 'lucide-react';
export function ChannelSettings({channel,act,busy,onClose,setNotice}:any){
 const [name,setName]=useState(channel?.name||''),[topic,setTopic]=useState(channel?.topic||''),[slowmode,setSlowmode]=useState(String(channel?.slowmode||0));
 useEffect(()=>{setName(channel?.name||'');setTopic(channel?.topic||'');setSlowmode(String(channel?.slowmode||0))},[channel?.id]);
 async function save(){const r=await act('channelEdit',{name,topic,slowmode:Number(slowmode)});if(r){setNotice('Canal atualizado.');onClose()}}
 async function remove(){if(!confirm('Excluir este canal e suas mensagens?'))return;const r=await act('channelDelete');if(r){setNotice('Canal excluído.');onClose()}}
 return <div className="channel-settings"><div className="channel-settings-icon">{channel?.kind==='voice'?<Volume2/>:<Hash/>}</div><label>Nome<input maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>Tópico / descrição<input maxLength={160} value={topic} placeholder="Sobre o que é este canal?" onChange={e=>setTopic(e.target.value)}/></label><label>Modo lento<select value={slowmode} onChange={e=>setSlowmode(e.target.value)}><option value="0">Desativado</option><option value="5">5 segundos</option><option value="10">10 segundos</option><option value="30">30 segundos</option><option value="60">1 minuto</option><option value="300">5 minutos</option><option value="600">10 minutos</option><option value="3600">1 hora</option></select></label><p>Moderadores, Administradores e o Dono não são limitados pelo modo lento.</p><button className="primary" disabled={busy||name.trim().length<2} onClick={()=>void save()}>Salvar canal</button><button className="danger channel-delete" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/>Excluir canal</button></div>
}
