import {useEffect} from 'react';

export function useNavigation(tv:boolean){
 useEffect(()=>{
  const editable=(el:Element|null)=>!!el?.matches('input,textarea,select,[contenteditable=true]');
  const scope=()=>document.querySelector('[role=dialog]')||(matchMedia('(max-width:760px)').matches&&document.querySelector('.nav-open'))||document;
  const items=()=>Array.from(scope().querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,summary,[tabindex="0"]')).filter(el=>!el.matches(':disabled')&&!el.closest('[inert],[aria-hidden=true]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
  function move(key:string){
   const candidates=items(),active=document.activeElement as HTMLElement;
   if(!candidates.length)return;
   if(!candidates.includes(active)){candidates[0].focus();return}
   const r=active.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
   const horizontal=key==='ArrowLeft'||key==='ArrowRight',sign=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
   const next=candidates.filter(el=>el!==active).map(el=>{const b=el.getBoundingClientRect(),dx=b.x+b.width/2-x,dy=b.y+b.height/2-y;return {el,forward:(horizontal?dx:dy)*sign,score:Math.abs(horizontal?dx:dy)+Math.abs(horizontal?dy:dx)*3}}).filter(v=>v.forward>2).sort((a,b)=>a.score-b.score)[0];
   next?.el.focus();next?.el.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  }
  const key=(e:KeyboardEvent)=>{if(tv&&e.key.startsWith('Arrow')&&!editable(document.activeElement)){e.preventDefault();move(e.key)}};
  window.addEventListener('keydown',key);
  let timer:ReturnType<typeof setInterval>|undefined,last='',at=0,pressed=false,back=false;
  const tick=()=>{
   if(document.hidden)return;
   const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected&&p.mapping==='standard');if(!pad)return;
   const direction=pad.buttons[12]?.pressed?'ArrowUp':pad.buttons[13]?.pressed?'ArrowDown':pad.buttons[14]?.pressed?'ArrowLeft':pad.buttons[15]?.pressed?'ArrowRight':Math.abs(pad.axes[1])>.6?(pad.axes[1]>0?'ArrowDown':'ArrowUp'):Math.abs(pad.axes[0])>.6?(pad.axes[0]>0?'ArrowRight':'ArrowLeft'):'';
   if(direction&&(direction!==last||performance.now()-at>240)){if(!editable(document.activeElement))move(direction);at=performance.now()}last=direction;
   if(pad.buttons[0]?.pressed&&!pressed){const el=document.activeElement as HTMLElement;if(el?.matches('button,a,summary,input[type=checkbox]'))el.click();else if(!el||el===document.body)items()[0]?.focus()}pressed=!!pad.buttons[0]?.pressed;
   if(pad.buttons[1]?.pressed&&!back){(document.activeElement as HTMLElement)?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(editable(document.activeElement))(document.activeElement as HTMLElement).blur()}back=!!pad.buttons[1]?.pressed;
  };
  const start=()=>{if(!timer)timer=setInterval(tick,80)};
  const stop=()=>{if(!Array.from(navigator.getGamepads?.()||[]).some(Boolean)){clearInterval(timer);timer=undefined}};
  window.addEventListener('gamepadconnected',start);window.addEventListener('gamepaddisconnected',stop);
  if(Array.from(navigator.getGamepads?.()||[]).some(Boolean))start();
  return()=>{window.removeEventListener('keydown',key);window.removeEventListener('gamepadconnected',start);window.removeEventListener('gamepaddisconnected',stop);clearInterval(timer)};
 },[tv]);
}
