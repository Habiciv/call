import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Maximize,Minimize,Expand} from 'lucide-react';
export function ScreenPanel({children}:{children:ReactNode}){
 const panel=useRef<HTMLElement>(null),expandButton=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState(false),[fullscreen,setFullscreen]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{
  const sync=()=>setFullscreen(document.fullscreenElement===panel.current);
  document.addEventListener('fullscreenchange',sync);
  return()=>document.removeEventListener('fullscreenchange',sync);
 },[]);
 useEffect(()=>{
  if(!expanded)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.fullscreenElement){setExpanded(false);expandButton.current?.focus()}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[expanded]);
 async function full(){
  setMessage('');
  try{if(document.fullscreenElement===panel.current)await document.exitFullscreen();else if(panel.current?.requestFullscreen)await panel.current.requestFullscreen();else throw Error('unsupported')}
  catch{setExpanded(true);setMessage('Tela cheia não disponível neste navegador. Transmissão ampliada na página.');}
 }
 return <aside ref={panel} className={'screens '+(expanded?'expanded':'')} aria-label="Transmissões de tela">
  <div className="screen-view-controls"><button ref={expandButton} type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<Minimize size={16}/>:<Maximize size={16}/>} {expanded?'Reduzir':'Ampliar'}</button><button type="button" onClick={()=>void full()}><Expand size={16}/>{fullscreen?'Sair da tela cheia':'Tela cheia'}</button></div>
  {message&&<p role="status" className="screen-view-message">{message}</p>}{children}
 </aside>;
}
