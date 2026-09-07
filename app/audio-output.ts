// A removed output device must fall back to the system default, not fail silently.
export async function routeAudio(element:HTMLAudioElement,deviceId:string){
 const sink=element as HTMLAudioElement & {setSinkId?:(id:string)=>Promise<void>};
 if(!sink.setSinkId)return false;
 try{await sink.setSinkId(deviceId||'');return false}catch(error){
  if(!deviceId)throw error;
  await sink.setSinkId('');return true;
 }
}
