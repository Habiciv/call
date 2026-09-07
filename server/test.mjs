import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('health, capacity, signaling, profile/avatar, and participant token',async()=>{
 const data=await mkdtemp(join(tmpdir(),'voz-test-')),port=String(18000+Math.floor(Math.random()*10000)),origin='http://localhost:'+port;
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,PORT:port,DATA_DIR:data},stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(origin+'/health')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(ready,'server startup');
  const room=crypto.randomUUID()+'-Lounge',people=Array.from({length:11},()=>({room,id:crypto.randomUUID(),token:crypto.randomUUID()}));
  async function call(p,action,extra={}){const r=await fetch(origin+'/api/room',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...p,action,...extra})});return {status:r.status,data:await r.json()}}
  const avatar='data:image/jpeg;base64,'+Buffer.from('avatar-test').toString('base64');
  const joined=[];for(let i=0;i<people.length;i++)joined.push(await call(people[i],'join',{name:i===0?' Alice ':'Test',avatar:i===0?avatar:''}));
  assert.equal(joined.filter(r=>r.status===200).length,10);assert.equal(joined.filter(r=>r.status===409).length,1);
  const admitted=people.filter((_,i)=>joined[i].status===200);assert.equal((await call({...admitted[0],token:crypto.randomUUID()},'poll')).status,401);
  const avatarResult=await call(admitted[1],'avatar',{target:admitted[0].id});assert.equal(avatarResult.status,200);assert.equal(avatarResult.data.avatar,avatar);
  const profile=await call(admitted[0],'profile',{name:'Alice 2',avatar:''});assert.equal(profile.status,200);const updated=profile.data.peers.find(p=>p.id===admitted[0].id);assert.equal(updated.name,'Alice 2');assert.equal(updated.hasAvatar,0);assert.equal(updated.avatarVersion,2);
  await call(admitted[0],'signal',{target:admitted[1].id,data:{candidate:{candidate:'test'}}});
  await call(admitted[0],'signal',{target:admitted[1].id,data:{media:{sharing:true,shareAudio:true}}});
  const signals=(await call(admitted[1],'poll')).data.signals;assert.equal(signals.length,2);assert.ok(signals.some(s=>JSON.parse(s.data).media?.sharing===true));
  await call(admitted[0],'leave');assert.equal((await call(people[joined.findIndex(r=>r.status===409)],'join')).status,200);
 }finally{if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}await rm(data,{recursive:true,force:true})}
});
