import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const dir=process.env.DATA_DIR||'./data';mkdirSync(dir,{recursive:true});
const sqlite=new DatabaseSync(resolve(dir,'voz.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
if(!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='peers'").get())sqlite.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
function prepare(sql){let params=[];const stmt=sqlite.prepare(sql);return {bind(...values){params=values;return this},first(){return stmt.get(...params)||null},run(){const r=stmt.run(...params);return {meta:{changes:Number(r.changes)}}},execute(){if(stmt.columns().length)return {results:stmt.all(...params)};this.run();return {results:[]}}}}
export function database(){return {prepare,batch(statements){sqlite.exec('BEGIN');try{const r=statements.map(s=>s.execute());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
// Signaling is ephemeral: remove abandoned rooms and expired offers globally.
setInterval(()=>{const now=Date.now();sqlite.prepare('DELETE FROM peers WHERE seen<?').run(now-120000);sqlite.prepare('DELETE FROM signals WHERE created<?').run(now-120000)},60000).unref();
