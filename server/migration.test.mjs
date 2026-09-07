import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrateCommunity} from './migrate.mjs';
test('Migration preserves legacy groups, roles, invitations, group/voice chat and is idempotent with consistent backup',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vertice-migration-'));const previous=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 const db=new DatabaseSync(join(dir,'voz.sqlite'));let backup;
 try{
 db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
 const g=crypto.randomUUID(),space=crypto.randomUUID(),owner=crypto.randomUUID();
 db.prepare('INSERT INTO groups VALUES(?,?,?,?,?,?)').run(g,'Legado','AABBCCDDEE',owner,space,123);
 db.prepare('INSERT INTO group_members VALUES(?,?,?,?,?)').run(g,owner,'Lucas','member',123);
 db.prepare('INSERT INTO group_messages(group_id,user_key,name,body,created) VALUES(?,?,?,?,?)').run(g,owner,'Lucas','Histórico preservado',234);
 db.prepare('INSERT INTO messages(room,sender,name,body,created) VALUES(?,?,?,?,?)').run(space+'-Lounge',owner,'Lucas','Chat da voz',235);
 migrateCommunity(db);
 const before=readdirSync(dir).filter(n=>n.startsWith('before-community-'));assert.equal(before.length,1);
 backup=new DatabaseSync(join(dir,before[0]));assert.equal(backup.prepare('SELECT body FROM group_messages').get().body,'Histórico preservado');assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='channels'").get(),undefined);backup.close();backup=null;
 assert.equal(db.prepare('SELECT count(*) n FROM channels').get().n,4);
 assert.equal(db.prepare('SELECT count(*) n FROM channel_messages').get().n,2);
 assert.equal(db.prepare('SELECT role FROM group_members').get().role,'owner');
 assert.equal(db.prepare('SELECT invite_code FROM groups').get().invite_code,'AABBCCDDEE');
 assert.equal(db.prepare('SELECT count(*) n FROM group_messages').get().n,1);
 assert.equal(db.prepare("SELECT room_key FROM channels WHERE name='Lounge'").get().room_key,space+'-Lounge');
 migrateCommunity(db);assert.equal(db.prepare('SELECT count(*) n FROM channel_messages').get().n,2);
 assert.equal(readdirSync(dir).filter(n=>n.startsWith('before-community-')).length,1);
 }finally{backup?.close();db.close();if(previous===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=previous;rmSync(dir,{recursive:true,force:true})}
});
test('Failed migration rolls back schema additions and never records success',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));db.exec('CREATE TABLE channels(id text)');assert.throws(()=>migrateCommunity(db));assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='profiles'").get(),undefined);assert.equal(db.prepare('SELECT count(*) n FROM app_migrations').get().n,0)}finally{db.close()}
});
