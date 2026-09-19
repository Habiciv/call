import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Maximize,Minimize} from 'lucide-react';

export function SharePlayer({children,className=''}:{children:ReactNode;className?:string}){
  const player=useRef<HTMLDivElement>(null);
  const button=useRef<HTMLButtonElement>(null);
  const mounted=useRef(false);
  const busy=useRef(false);
  const [native,setNative]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [message,setMessage]=useState('');
  const active=native||expanded;

  useEffect(()=>{
    mounted.current=true;
    const sync=()=>setNative(document.fullscreenElement===player.current);
    document.addEventListener('fullscreenchange',sync);
    return()=>{mounted.current=false;document.removeEventListener('fullscreenchange',sync);};
  },[]);

  useEffect(()=>{
    if(!expanded)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow='hidden';
    // Keep keyboard navigation within the expanded player, including audio controls.
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setExpanded(false);}
      if(event.key==='Tab'){
        const controls=Array.from(player.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select, textarea, [tabindex="0"]')||[]);
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    button.current?.focus();
    document.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',onKey);button.current?.focus();};
  },[expanded]);

  async function toggle(){
    if(busy.current)return;
    if(expanded){setExpanded(false);setMessage('');return;}
    const element=player.current;
    if(!element)return;
    busy.current=true;
    setMessage('');
    try{
      if(document.fullscreenElement===element){
        await document.exitFullscreen();
        if(mounted.current)button.current?.focus();
      }else{
        try{
          if(!element.requestFullscreen||document.fullscreenEnabled===false)throw new Error('unavailable');
          await element.requestFullscreen();
        }catch{
          if(mounted.current){setExpanded(true);setMessage('Visualização ampliada neste navegador.');}
        }
      }
    }catch{
      if(mounted.current)setMessage('Use Esc ou o controle do navegador para sair da tela cheia.');
    }finally{busy.current=false;}
  }

  return <div ref={player} className={`share-card ${className} ${expanded?'share-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded||undefined} aria-label="Transmissão de tela">
    <div className="share-player-controls">
      <span role="status">{message}</span>
      <button ref={button} type="button" className="fullscreen-button" aria-pressed={active} onClick={()=>void toggle()}>
        {active?<Minimize size={17}/>:<Maximize size={17}/>}{active?'Sair da tela cheia':'Tela cheia'}
      </button>
    </div>
    {children}
  </div>;
}
