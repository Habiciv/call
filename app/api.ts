export async function api(action:string,extra:any={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 let r:Response;try{r=await fetch('/api/community',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(localStorage.getItem('tatico-credential')||'')},body:JSON.stringify({action,...extra})})}finally{clearTimeout(timeout)}
 const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível atualizar.');return data;
}
let boot:Promise<any>|null=null;
export function bootstrap(){
 if(!boot)boot=(async()=>{
 if(!localStorage.getItem('tatico-credential')){
  const data=await api('bootstrap',{legacyKey:localStorage.getItem('voz-user-key'),name:localStorage.getItem('voz-name')||'Visitante'});
  localStorage.setItem('tatico-credential',data.credential);
 }
 return true;
 })().catch(e=>{boot=null;throw e});return boot;
}
export function clearLocalIdentity(){
 ['tatico-credential','voz-user-key','voz-name','voz-avatar'].forEach(key=>localStorage.removeItem(key));
}
