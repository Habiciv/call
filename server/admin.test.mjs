import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('Admin hierarchy: roles, timeout, slowmode, bans, audit and owner transfer',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vertice-admin-')),port=22000+Math.floor(Math.random()*9000),origin='http://localhost:'+port;let child;
 async function start(){child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATA_DIR:dir,PORT:String(port),ALLOW_LEGACY_ROOMS:'0'},stdio:'pipe'});let log='';child.stderr.on('data',x=>log+=x);for(let i=0;i<70;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,80))}throw Error(log)}
 async function stop(){if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}}
 async function req(c,action,extra={}){const r=await fetch(origin+'/api/community',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+(c||'')},body:JSON.stringify({action,...extra})});return {status:r.status,data:await r.json()}}
 async function ok(c,a,e={}){const r=await req(c,a,e);assert.equal(r.status,200,JSON.stringify(r));return r.data}
 try{
  await start();
  const A=(await ok('','bootstrap',{name:'Dono'})).credential,B=(await ok('','bootstrap',{name:'Admin'})).credential,C=(await ok('','bootstrap',{name:'Mod'})).credential,D=(await ok('','bootstrap',{name:'Membro'})).credential;
  let d=await ok(A,'create',{name:'Servidor Novo'}),g=d.groups[0],cid=d.channels.find(x=>x.kind==='text').id,scope={groupId:g.id,channelId:cid},code=g.inviteCode;
  for(const credential of [B,C,D])await ok(credential,'join',{code});
  d=await ok(A,'poll',scope);const ids=Object.fromEntries(d.members.map(m=>[m.name,m.userKey]));
  await ok(A,'role',{...scope,target:ids.Admin,role:'admin'});await ok(B,'role',{...scope,target:ids.Mod,role:'moderator'});
  assert.equal((await req(B,'role',{...scope,target:ids.Membro,role:'admin'})).status,403);
  await ok(C,'timeout',{...scope,target:ids.Membro,minutes:10});assert.equal((await req(D,'message',{...scope,message:'bloqueada'})).status,403);await ok(C,'timeout',{...scope,target:ids.Membro,minutes:0});
  await ok(D,'message',{...scope,message:'liberada'});await ok(A,'channelEdit',{...scope,name:'geral-2',topic:'Tópico novo',slowmode:1});await new Promise(r=>setTimeout(r,1100));await ok(D,'message',{...scope,message:'primeira'});assert.equal((await req(D,'message',{...scope,message:'segunda'})).status,429);
  assert.equal((await req(C,'timeout',{...scope,target:ids.Admin,minutes:10})).status,403);
  await ok(B,'ban',{...scope,target:ids.Mod,reason:'teste'});assert.equal((await req(C,'join',{code})).status,403);
  d=await ok(B,'poll',scope);assert.equal(d.bans.length,1);assert.equal(d.bans[0].name,'Mod');assert.ok(d.auditLog.length>0);
  await ok(B,'unban',{...scope,target:d.bans[0].userKey});await ok(C,'join',{code});
  d=await ok(A,'poll',scope);await ok(A,'transferOwner',{...scope,target:d.members.find(m=>m.name==='Admin').userKey});d=await ok(B,'poll',scope);assert.equal(d.groups[0].role,'owner');assert.equal(d.members.find(m=>m.name==='Dono').role,'admin');
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
