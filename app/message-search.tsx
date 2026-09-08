import {useEffect,useState} from 'react';
import {api} from './api';
export function MessageSearch({scope,onReply}:{scope:{groupId:string;channelId:string;dmTarget:string};onReply:(m:any)=>void}){
 const [query,setQuery]=useState(''),[rows,setRows]=useState<any[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(false);
 useEffect(()=>{
  let live=true;setRows([]);setMore(false);setError('');setBusy(query.trim().length>=2);
  const timer=setTimeout(()=>{if(query.trim().length<2)return;void api('search',{...scope,query}).then(j=>{if(live){setRows(j.results);setMore(j.hasMore)}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setBusy(false)})},350);
  return()=>{live=false;clearTimeout(timer)};
 },[query,scope.groupId,scope.channelId,scope.dmTarget]);
 return <div className="search-results"><input autoFocus type="search" aria-label="Buscar no histórico" placeholder="Texto ou nome de arquivo…" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)}/><p role="status">{error|| (busy?'Buscando…':query.trim().length<2?'Digite pelo menos 2 caracteres.':`${rows.length} resultado(s)${more?' · mostrando os 50 mais recentes':''}`)}</p>{rows.map(m=><article key={m.id}><header><strong>{m.name||'Mensagem direta'}</strong><time>{new Date(m.created).toLocaleString('pt-BR')}</time></header><p>{m.body}</p>{m.attachmentName&&<small>📎 {m.attachmentName}</small>}{!scope.dmTarget&&<button className="secondary" onClick={()=>onReply(m)}>Responder à mensagem</button>}</article>)}</div>;
}
