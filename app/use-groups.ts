'use client';
import {useCallback,useEffect,useRef,useState} from 'react';

export type Group={id:string;name:string;inviteCode:string;ownerKey:string;space:string;memberCount:number};
export type GroupMember={userKey:string;name:string;role:string;joined:number};
export type GroupMessage={id:number;userKey:string;name:string;body:string;created:number};

export function useGroups(userName:string){
 const [groups,setGroups]=useState<Group[]>([]),[members,setMembers]=useState<GroupMember[]>([]),[messages,setMessages]=useState<GroupMessage[]>([]),[selectedId,setSelectedId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const userKeyRef=useRef(''),afterRef=useRef(0),selectedRef=useRef('');
 useEffect(()=>{selectedRef.current=selectedId;afterRef.current=0;setMessages([])},[selectedId]);
 useEffect(()=>{
  try{let k=localStorage.getItem('voz-user-key')||'';if(!/^[a-f0-9-]{36}$/i.test(k)){k=crypto.randomUUID();localStorage.setItem('voz-user-key',k)}userKeyRef.current=k}
  catch{userKeyRef.current=crypto.randomUUID()}
 },[]);

 const request=useCallback(async(action:string,extra:any={})=>{
  const key=userKeyRef.current;if(!key)throw Error('Identidade ainda carregando.');
  const r=await fetch('/api/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,userKey:key,userName:userName||'Visitante',groupId:selectedRef.current,after:afterRef.current,...extra})});
  const j:any=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Falha ao atualizar grupos.');
  if(Array.isArray(j.groups)){setGroups(j.groups);const valid=selectedRef.current&&j.groups.some((g:Group)=>g.id===selectedRef.current);const next=String(j.activeGroupId||'');if(next&&j.groups.some((g:Group)=>g.id===next))setSelectedId(next);else if(!valid&&j.groups[0])setSelectedId(j.groups[0].id);else if(!j.groups.length)setSelectedId('')}
  if(Array.isArray(j.members))setMembers(j.members);
  if(Array.isArray(j.messages)&&j.messages.length){setMessages(old=>{const m=new Map<number,GroupMessage>(old.map(x=>[x.id,x]));for(const x of j.messages as GroupMessage[])m.set(x.id,x);return [...m.values()].sort((a,b)=>a.id-b.id).slice(-120)});afterRef.current=Math.max(afterRef.current,...j.messages.map((x:GroupMessage)=>Number(x.id)||0));}
  return j;
 },[userName]);

 useEffect(()=>{let active=true,t=0;const run=async()=>{if(!userKeyRef.current){t=window.setTimeout(run,100);return}try{await request('poll');if(active)setError('')}catch(e:any){if(active)setError(e.message)}finally{if(active)t=window.setTimeout(run,1400)}};void run();return()=>{active=false;if(t)clearTimeout(t)}},[request,selectedId]);

 async function act(action:string,extra:any={}){setBusy(true);setError('');try{const j=await request(action,extra);return j}catch(e:any){setError(e.message);return null}finally{setBusy(false)}}
 return {groups,members,messages,selectedId,setSelectedId,busy,error,userKey:()=>userKeyRef.current,create:(name:string)=>act('create',{name}),join:(code:string)=>act('join',{code}),leave:(groupId:string)=>act('leave',{groupId}),remove:(groupId:string)=>act('delete',{groupId}),rename:(groupId:string,name:string)=>act('rename',{groupId,name}),send:(message:string)=>act('message',{message})};
}
