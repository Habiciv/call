import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {adaptiveBudget} from '../app/adaptive.ts';
test('adaptive bitrate reduces congestion and recovers within limits',()=>{
 assert.equal(adaptiveBudget(2200000,2200000,800000),520000);
 assert.equal(adaptiveBudget(1000000,2200000,10000000),1120000);
 assert.equal(adaptiveBudget(1000000,2200000,undefined,.8),750000);
 assert.equal(adaptiveBudget(300000,2200000,10000),300000);
 assert.equal(adaptiveBudget(2200000,1200000),1200000);
 assert.ok(Number.isFinite(adaptiveBudget(1000000,2200000,NaN)));
});
test('history search isolates servers, channels and DM participants',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vertice-search-')),port=31000+Math.floor(Math.random()*8000),origin='http://localhost:'+port;
 const child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATA_DIR:dir,PORT:String(port),ALLOW_LEGACY_ROOMS:'0'},stdio:'pipe'});
 let log='';child.stderr.on('data',x=>log+=x);
 async function req(c,action,extra={}){const r=await fetch(origin+'/api/community',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+c},body:JSON.stringify({action,...extra})});return {status:r.status,data:await r.json()}}
 async function ok(c,a,e={}){const r=await req(c,a,e);assert.equal(r.status,200,JSON.stringify(r));return r.data}
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,80))}assert.ok(ready,log);
  const a=(await ok('','bootstrap',{name:'Alice'})).credential,b=(await ok('','bootstrap',{name:'Bruno'})).credential,c=(await ok('','bootstrap',{name:'Clara'})).credential;
  let d=await ok(a,'create',{name:'Equipe'});const g=d.groups[0],scope={groupId:g.id,channelId:d.channels[0].id};
  await ok(b,'join',{code:g.inviteCode});await ok(a,'message',{...scope,message:'Entrega 100% concluída'});
  let result=await ok(b,'search',{...scope,query:'Entrega'});assert.equal(result.results.length,1);assert.equal(result.results[0].user_key,undefined);
  assert.equal((await ok(b,'search',{...scope,query:'%%'})).results.length,0);
  assert.equal((await req(c,'search',{...scope,query:'Entrega'})).status,403);
  assert.equal((await ok(b,'search',{...scope,channelId:d.channels[1].id,query:'Entrega'})).results.length,0);
  assert.equal((await req(a,'search',{...scope,query:'x'})).status,400);
  d=await ok(a,'poll',scope);const bid=d.members.find(m=>m.name==='Bruno').userKey;
  await ok(a,'dmSend',{...scope,target:bid,message:'Segredo da entrega'});
  result=await ok(a,'search',{...scope,dmTarget:bid,query:'Segredo'});assert.equal(result.results.length,1);
  await ok(c,'join',{code:g.inviteCode});assert.equal((await ok(c,'search',{...scope,dmTarget:bid,query:'Segredo'})).results.length,0);
  await ok(a,'kick',{...scope,target:bid});assert.equal((await req(b,'search',{...scope,query:'Entrega'})).status,403);
 }finally{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill();await exited}await rm(dir,{recursive:true,force:true})}
});
