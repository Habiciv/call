import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir=process.env.DATA_DIR||'./data';mkdirSync(dir,{recursive:true});
const sqlite=new DatabaseSync(resolve(dir,'voz.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='peers'").get())sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
// Migra volumes existentes do Railway sem apagar salas ou exigir recriar o banco.
const peerColumns=new Set(sqlite.prepare('PRAGMA table_info(peers)').all().map(row=>row.name));
if(!peerColumns.has('avatar'))sqlite.exec("ALTER TABLE peers ADD COLUMN avatar text NOT NULL DEFAULT ''");
if(!peerColumns.has('profile_version'))sqlite.exec('ALTER TABLE peers ADD COLUMN profile_version integer NOT NULL DEFAULT 0');
if(!peerColumns.has('client_key'))sqlite.exec("ALTER TABLE peers ADD COLUMN client_key text NOT NULL DEFAULT ''");
sqlite.exec("UPDATE peers SET client_key=id WHERE client_key='' OR client_key IS NULL");
// Bancos persistentes de versões antigas podem já conter dois perfis com o
// mesmo client_key. Limpa os duplicados ANTES de recriar o índice para que um
// deploy novo nunca deixe o serviço fora do ar por UNIQUE constraint.
sqlite.exec(`DELETE FROM peers WHERE rowid IN (
 SELECT rowid FROM (
  SELECT rowid,ROW_NUMBER() OVER (PARTITION BY room,client_key ORDER BY seen DESC,rowid DESC) AS rn
  FROM peers
 ) WHERE rn>1
)`);
sqlite.exec('DROP INDEX IF EXISTS peers_room_client');
sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS peers_room_client ON peers(room,client_key)');
sqlite.exec(`CREATE TABLE IF NOT EXISTS messages (
 id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 room text NOT NULL,
 sender text NOT NULL,
 name text NOT NULL,
 body text NOT NULL,
 created integer NOT NULL
)`);
sqlite.exec('CREATE INDEX IF NOT EXISTS messages_room_id ON messages(room,id)');

sqlite.exec(`CREATE TABLE IF NOT EXISTS groups (
 id text PRIMARY KEY NOT NULL,
 name text NOT NULL,
 invite_code text NOT NULL UNIQUE,
 owner_key text NOT NULL,
 space text NOT NULL UNIQUE,
 created integer NOT NULL
)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS group_members (
 group_id text NOT NULL,
 user_key text NOT NULL,
 name text NOT NULL,
 role text NOT NULL DEFAULT 'member',
 joined integer NOT NULL,
 PRIMARY KEY(group_id,user_key)
)`);
sqlite.exec('CREATE INDEX IF NOT EXISTS group_members_user ON group_members(user_key,group_id)');
sqlite.exec(`CREATE TABLE IF NOT EXISTS group_messages (
 id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 group_id text NOT NULL,
 user_key text NOT NULL,
 name text NOT NULL,
 body text NOT NULL,
 created integer NOT NULL
)`);
sqlite.exec('CREATE INDEX IF NOT EXISTS group_messages_group_id ON group_messages(group_id,id)');

function prepare(sql){let params=[];const stmt=sqlite.prepare(sql);return {bind(...values){params=values;return this},first(){return stmt.get(...params)||null},run(){const r=stmt.run(...params);return {meta:{changes:Number(r.changes)}}},execute(){if(stmt.columns().length)return {results:stmt.all(...params)};this.run();return {results:[]}}}}
export function database(){return {prepare,batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
// Signaling é efêmero: remove participantes e ofertas abandonados globalmente.
setInterval(()=>{const now=Date.now();sqlite.prepare('DELETE FROM peers WHERE seen<?').run(now-120000);sqlite.prepare('DELETE FROM signals WHERE created<?').run(now-120000)},60000).unref();
