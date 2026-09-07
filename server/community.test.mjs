import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('Communities: auth, permissions, channels, edits, replies, reactions, pins, DM privacy, voice and persistence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vertice-test-')),port=19000+Math.floor(Math.random()*9000),origin='http://localhost:'+port;
 let child;
 async function start(){child=spawn(process.execPath,['server/index.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATA_DIR:dir,PORT:String(port),ALLOW_LEGACY_ROOMS:'0'},stdio:'pipe'});let log='';child.stderr.on('data',x=>log+=x);for(let i=0;i<60;i++){try{if((await fetch(origin+'/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error(log)}
 async function stop(){if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done}}
 async function req(credential,action,extra={},path='/api/community'){const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+(credential||'')},body:JSON.stringify({action,...extra})});return {status:r.status,data:await r.json()}}
 async function ok(c,a,e){const r=await req(c,a,e);assert.equal(r.status,200,JSON.stringify(r));return r.data}
 try{
 await start();
 const A=(await ok('','bootstrap',{name:'Alice'})).credential,B=(await ok('','bootstrap',{name:'Bruno'})).credential,C=(await ok('','bootstrap',{name:'Clara'})).credential;
 assert.equal((await req('','poll')).status,401);
 assert.equal((await req('','bootstrap',{legacyKey:A.split('.')[0]})).status,409);
 let d=await ok(A,'create',{name:'Equipe Alfa'}),g=d.groups[0],cid=d.channels.find(c=>c.kind==='text').id,voice=d.channels.find(c=>c.kind==='voice'),scope={groupId:g.id,channelId:cid};
 const oldCode=g.inviteCode;
 assert.equal(d.me.name,'Alice');assert.notEqual(d.me.userKey,A.split('.')[0]);
 assert.equal(d.channels.length,3);
 d=await ok(B,'join',{code:origin+'/?invite='+g.inviteCode});const bKey=d.me.userKey;
 await ok(A,'join',{code:g.inviteCode});assert.equal((await ok(A,'poll',scope)).groups[0].role,'owner');
 assert.equal((await req(B,'rename',{...scope,name:'Invadido'})).status,403);
 assert.equal((await req(C,'message',{...scope,message:'intruso'})).status,403);
 assert.equal((await req(C,'poll',scope)).data.messages.length,0);
 assert.equal((await req(B,'role',{...scope,target:bKey,role:'admin'})).status,403);
 d=await ok(A,'message',{...scope,message:'Mensagem original',nonce:'same-request'});const mid=d.messages[0].id;
 await ok(A,'message',{...scope,message:'Mensagem original',nonce:'same-request'});assert.equal((await ok(B,'poll',scope)).messages.length,1);
 assert.equal((await req(B,'editMessage',{...scope,messageId:mid,message:'alterado'})).status,403);
 d=await ok(A,'editMessage',{...scope,messageId:mid,message:'Mensagem editada'});assert.equal(d.messages[0].body,'Mensagem editada');assert.ok(d.messages[0].edited);
 d=await ok(B,'message',{...scope,message:'Resposta',replyId:mid});assert.equal(d.messages[1].reply.body,'Mensagem editada');
 await ok(B,'react',{...scope,messageId:mid,emoji:'🔥'});d=await ok(A,'poll',scope);assert.equal(d.messages[0].reactions[0].count,1);
 await ok(B,'react',{...scope,messageId:mid,emoji:'🔥'});assert.equal((await ok(A,'poll',scope)).messages[0].reactions.length,0);
 assert.equal((await req(B,'pin',{...scope,messageId:mid})).status,403);
 await ok(A,'role',{...scope,target:bKey,role:'moderator'});
 await ok(B,'pin',{...scope,messageId:mid});assert.equal((await ok(A,'poll',scope)).pinned.length,1);
 assert.equal((await req(B,'channelCreate',{...scope,name:'negado',kind:'text'})).status,403);
 await ok(B,'typing',scope);assert.equal((await ok(A,'poll',scope)).typing[0].name,'Bruno');
 d=await ok(A,'channelCreate',{...scope,name:'Missões',kind:'text'});const second=d.activeChannelId;
 assert.equal((await req(B,'message',{groupId:g.id,channelId:second,message:'Resposta cruzada',replyId:mid})).status,400);
 assert.equal((await ok(B,'poll',{groupId:g.id,channelId:second})).messages.length,0);
 await ok(A,'channelRename',{groupId:g.id,channelId:second,name:'Operações'});
 assert.equal((await ok(B,'poll',scope)).channels.find(c=>c.id===second).name,'Operações');
 await ok(A,'dmSend',{...scope,target:bKey,message:'Conversa privada'});
 const aKey=(await ok(A,'poll',scope)).me.userKey;
 d=await ok(B,'poll',{...scope,dmTarget:aKey});assert.equal(d.dms.length,1);assert.equal(d.dms[0].body,'Conversa privada');
 assert.equal((await req(C,'dmSend',{target:bKey,message:'intruso'})).status,403);
 assert.equal((await ok(C,'poll',{...scope,dmTarget:bKey})).dms.length,0);
 await ok(B,'profile',{...scope,name:'Bruno atualizado',avatar:'',status:'Em missão',presence:'busy'});
 assert.equal((await ok(A,'poll',scope)).members.find(m=>m.userKey===bKey).presence,'busy');
 const peer={room:voice.roomKey,id:crypto.randomUUID(),token:crypto.randomUUID(),name:'Alice'};
 assert.equal((await req(C,'join',peer,'/api/room')).status,403);
 assert.equal((await req(A,'join',peer,'/api/room')).status,200);
 assert.equal((await req(B,'join',{...peer,token:crypto.randomUUID()},'/api/room')).status,403);
 const textPeer={...peer,id:crypto.randomUUID(),room:d.channels?.find(c=>c.id===cid)?.roomKey||g.space+'-'+cid};
 assert.equal((await req(A,'join',textPeer,'/api/room')).status,403);
 const pres=await fetch(origin+'/api/presence?space='+g.space,{headers:{Authorization:'Bearer '+C}});assert.equal(pres.status,403);
 const presOk=await fetch(origin+'/api/presence?space='+g.space,{headers:{Authorization:'Bearer '+B}});assert.equal(presOk.status,200);
 await ok(A,'invite',scope);assert.equal((await req(C,'join',{code:oldCode})).status,404);
 await stop();await start();assert.equal((await ok(B,'poll',scope)).messages.length,2);assert.equal((await ok(B,'poll',{...scope,dmTarget:aKey})).dms.length,1);
 await ok(B,'deleteMessage',{...scope,messageId:mid});d=await ok(A,'poll',scope);assert.equal(d.pinned.length,0);assert.equal(d.messages.length,1);assert.equal(d.messages[0].reply,null);
 await ok(A,'channelDelete',{groupId:g.id,channelId:second});assert.ok(!(await ok(B,'poll',scope)).channels.some(c=>c.id===second));
 await ok(B,'leave',scope);assert.equal((await ok(A,'poll',{...scope,dmTarget:bKey})).dmAllowed,false);
 assert.equal((await req(B,'poll',peer,'/api/room')).status,403);
 await ok(A,'delete',scope);assert.equal((await ok(A,'poll')).groups.length,0);
 }finally{await stop();await rm(dir,{recursive:true,force:true})}
});
