import {useEffect,useRef,useState} from 'react';
import {api,bootstrap} from './api';
export function useCommunity(){
 const [data,setData]=useState<any>({groups:[],channels:[],members:[],messages:[],pinned:[],typing:[],dms:[]});
 const [selection,setSelection]=useState({groupId:'',channelId:'',dmTarget:'',before:0}),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const ref=useRef(selection),seq=useRef(0),lock=useRef(false);ref.current=selection;
 function apply(j:any){setData(j);if(j.activeGroupId!==ref.current.groupId||j.activeChannelId!==ref.current.channelId)setSelection(s=>({...s,groupId:j.activeGroupId,channelId:j.activeChannelId,before:0}))}
 useEffect(()=>{void bootstrap().then(()=>setReady(true)).catch(e=>setError(e.message))},[]);
 useEffect(()=>{if(!ready)return;let alive=true,t:any;const poll=async()=>{if(!lock.current){const n=++seq.current;try{const j=await api('poll',ref.current);if(alive&&n===seq.current)apply(j)}catch(e:any){if(alive)setError(e.message)}}if(alive)t=setTimeout(poll,1800)};void poll();return()=>{alive=false;clearTimeout(t);++seq.current}},[ready,selection]);
 async function act(action:string,extra:any={}){if(lock.current)return null;lock.current=true;setBusy(true);setError('');++seq.current;const s=ref.current;try{const j=await api(action,{...s,...extra});if(s===ref.current)apply(j);return j}catch(e:any){setError(e.message);return null}finally{lock.current=false;setBusy(false)}}
 function select(next:any){if(lock.current)return;++seq.current;setData((d:any)=>({...d,messages:[],pinned:[],typing:[],dms:[],...(next.groupId&&next.groupId!==ref.current.groupId?{channels:[],members:[]}:{} )}));setSelection(s=>({...s,before:0,...next}))}
 return {data,selection,select,act,error,setError,ready,busy};
}

