import {useEffect,useRef,useState} from 'react';
import {Send,MessageSquare,Users} from 'lucide-react';
export type Message={id:number;sender:string;name:string;text:string;created:number};
export function Chat({joined,self,request,people,onCount}:{joined:boolean;self?:string;request:(extra:any)=>Promise<any>;people:{id:string;name:string}[];onCount:(count:number)=>void}){
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState(''),[error,setError]=useState(''),[sending,setSending]=useState(false),[tab,setTab]=useState<'chat'|'people'>('chat');
 const requestRef=useRef(request),countRef=useRef(onCount),list=useRef<HTMLDivElement>(null),nearBottom=useRef(true),sendLock=useRef(false),lastId=useRef(0);
 requestRef.current=request;countRef.current=onCount;
 useEffect(()=>{
  setMessages([]);setError('');setDraft('');lastId.current=0;
  if(!joined)return;
  let active=true,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{const data=await requestRef.current({});if(active){accept(data.messages||[]);setError('');}}
   catch{if(active)setError('Chat desconectado. Tentando novamente…');}
   finally{if(active)timer=setTimeout(poll,1600);}
  };
  const accept=(next:Message[])=>{const id=next.at(-1)?.id||0;if(id>=lastId.current){lastId.current=id;setMessages(next);countRef.current(next.length);}};
  void poll();return()=>{active=false;clearTimeout(timer);};
 },[joined,self]);
 useEffect(()=>{if(nearBottom.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages,tab]);
 async function send(text=draft){
  if(!text.trim()||sendLock.current)return;
  sendLock.current=true;setSending(true);setError('');
  try{const result=await requestRef.current({text});const next=result.messages||[];lastId.current=next.at(-1)?.id||lastId.current;setMessages(next);countRef.current(next.length);setDraft('');nearBottom.current=true;}
  catch(e:any){setError(e.message||'Não foi possível enviar.');}
  finally{sendLock.current=false;setSending(false);}
 }
 return <aside className="community-panel" aria-label="Comunidade da sala">
  <div className="panel-tabs"><button className={tab==='chat'?'selected':''} onClick={()=>setTab('chat')}><MessageSquare size={16}/> Chat</button><button className={tab==='people'?'selected':''} onClick={()=>setTab('people')}><Users size={16}/> Pessoas <span>{people.length}</span></button></div>
  {tab==='chat'?<><div className="chat-info"><i/> Conversa da sala <span>AO VIVO</span></div><div className="chat-messages" ref={list} role="log" aria-label="Mensagens" aria-live="polite" onScroll={()=>{const el=list.current;if(el)nearBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
   {!messages.length&&<div className="chat-empty"><MessageSquare size={30}/><strong>A transmissão aproxima.<br/>O chat conecta.</strong><p>{joined?'Mande a primeira mensagem para a sala.':'Entre na sala para participar da conversa.'}</p></div>}
   {messages.map(m=><div className={'chat-message '+(m.sender===self?'mine':'')} key={m.id}><div className="chat-avatar">{m.name.slice(0,2).toUpperCase()}</div><div><div className="message-meta"><strong>{m.name}{m.sender===self?' · você':''}</strong><time>{new Date(m.created).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.text}</p></div></div>)}
  </div><div className="chat-compose">{error&&<p className="inline-error" role="status">{error}</p>}<div className="quick-reactions">{['🔥','👏','❤️','🎯'].map(e=><button key={e} disabled={!joined||sending} aria-label={`Enviar ${e}`} onClick={()=>void send(e)}>{e}</button>)}<span>{draft.length}/500</span></div><form onSubmit={e=>{e.preventDefault();void send();}}><input aria-label="Mensagem" placeholder={joined?'Mande uma mensagem…':'Entre para conversar'} maxLength={500} value={draft} disabled={!joined} onChange={e=>setDraft(e.target.value)}/><button type="submit" className="send-button" aria-label="Enviar mensagem" disabled={!joined||sending||!draft.trim()}><Send size={17}/></button></form><small>Mensagens disponíveis por até 24 horas.</small></div></>:<div className="people-list">{people.length?people.map(p=><div className="person" key={p.id}><span className="chat-avatar">{p.name.slice(0,2).toUpperCase()}</span><strong>{p.name}{p.id===self?' (você)':''}</strong><i/></div>):<div className="chat-empty"><Users/><p>Ninguém conectado ainda.</p></div>}</div>}
 </aside>;
}
