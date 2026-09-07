import { createServer } from 'node:http';
import { readFile,stat,mkdir,writeFile,unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve,extname,sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { POST,PRESENCE } from './room.mjs';
import { COMMUNITY,authenticate } from './community.mjs';
import { sqlite } from './db.mjs';
const root=resolve('dist'),port=Number(process.env.PORT||8080),dataRoot=resolve(process.env.DATA_DIR||'./data'),uploadsRoot=resolve(dataRoot,'uploads');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};
const uploadMime={
 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif',
 'video/mp4':'.mp4','video/webm':'.webm'
};
const uploadBuckets=new Map();
function uploadThrottle(key){const now=Date.now(),b=uploadBuckets.get(key);if(!b||now-b.start>60000){uploadBuckets.set(key,{start:now,n:1});return true}if(++b.n>20)return false;return true}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))}


function turnUrls(){
 const raw=[process.env.TURN_URL,process.env.TURN_URLS].filter(Boolean).join(',').split(/[\n,]+/).map(v=>v.trim()).filter(Boolean);
 const urls=new Set(raw);
 // O painel da Metered normalmente entrega quatro rotas para a mesma credencial.
 // Se o usuário colou só a rota :80, completamos UDP/TCP/443/TLS automaticamente.
 for(const value of raw){
  const match=value.match(/^turn:(global\.relay\.metered\.ca)(?::\d+)?(?:\?.*)?$/i);
  if(match){
   const host=match[1];
   urls.add(`turn:${host}:80`);
   urls.add(`turn:${host}:80?transport=tcp`);
   urls.add(`turn:${host}:443`);
   urls.add(`turns:${host}:443?transport=tcp`);
  }
 }
 return [...urls];
}

function iceConfig(){
 const urls=turnUrls(),username=String(process.env.TURN_USERNAME||''),credential=String(process.env.TURN_CREDENTIAL||'');
 const iceServers=[{urls:'stun:stun.cloudflare.com:3478'},{urls:'stun:stun.l.google.com:19302'}];
 if(urls.some(v=>/relay\.metered\.ca/i.test(v)))iceServers.unshift({urls:'stun:stun.relay.metered.ca:80'});
 const turnConfigured=Boolean(urls.length&&username&&credential);
 if(turnConfigured)for(const url of urls)iceServers.push({urls:url,username,credential});
 return {iceServers,turnConfigured,turnUrls:turnConfigured?urls:[]};
}

const server=createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','microphone=(self), display-capture=(self), camera=()');
 const protocol=req.headers['x-forwarded-proto']==='https'?'https':'http';const origin=process.env.PUBLIC_ORIGIN||`${protocol}://${req.headers.host}`;const url=new URL(req.url,origin);
 if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return}
 if(url.pathname==='/api/config'){
  if(req.method!=='GET'){res.writeHead(405);res.end();return}
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(iceConfig()));return
 }
 if(url.pathname==='/api/presence'){
  if(req.method!=='GET'){res.writeHead(405);res.end();return}
  const result=await PRESENCE(new Request(url,{method:'GET',headers:{origin:req.headers.origin||'',authorization:req.headers.authorization||''}}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return
 }
 if(url.pathname==='/api/upload'){
  if(req.method!=='POST'){res.writeHead(405);res.end();return}
  if((req.headers.origin||'')!==new URL(origin).origin){json(res,403,{error:'Origem inválida.'});return}
  let user;try{user=authenticate(new Request(new URL('/api/community',origin),{headers:{authorization:req.headers.authorization||''}}))}catch(e){json(res,e.status||401,{error:e.message||'Acesso negado.'});return}
  if(!uploadThrottle(user.user_key)){json(res,429,{error:'Muitos anexos enviados. Aguarde um minuto.'});return}
  const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase(),extension=uploadMime[type];
  if(!extension){json(res,415,{error:'Envie uma imagem JPG, PNG, WEBP ou GIF, ou um vídeo MP4/WEBM.'});return}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>10*1024*1024){json(res,413,{error:'O arquivo pode ter no máximo 10 MB.'});return}chunks.push(chunk)}
  if(!size){json(res,400,{error:'Escolha um arquivo para enviar.'});return}
  let original='arquivo'+extension;try{original=decodeURIComponent(String(req.headers['x-file-name']||original))}catch{}
  original=original.replace(/[\u0000-\u001f\u007f/\\]/g,' ').trim().slice(0,120)||('arquivo'+extension);
  const id=randomBytes(24).toString('hex'),stored=id+extension;await mkdir(uploadsRoot,{recursive:true});await writeFile(resolve(uploadsRoot,stored),Buffer.concat(chunks));
  sqlite.prepare('INSERT INTO attachments(id,user_key,name,mime,size,path,created,used) VALUES(?,?,?,?,?,?,?,0)').run(id,user.user_key,original,type,size,stored,Date.now());
  json(res,200,{id,url:'/api/attachment/'+id,name:original,type,size});return
 }
 const attachmentMatch=url.pathname.match(/^\/api\/attachment\/([a-f0-9]{48})$/);
 if(attachmentMatch){
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
  const a=sqlite.prepare('SELECT name,mime,size,path FROM attachments WHERE id=?').get(attachmentMatch[1]);if(!a){res.writeHead(404);res.end('Not found');return}
  const file=resolve(uploadsRoot,a.path);if(file!==uploadsRoot&&!file.startsWith(uploadsRoot+sep)){res.writeHead(403);res.end();return}
  let info;try{info=await stat(file)}catch{res.writeHead(404);res.end('Not found');return}
  const total=Number(info.size),range=String(req.headers.range||'');
  const headers={'Content-Type':a.mime,'Accept-Ranges':'bytes','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(a.name)}`};
  if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);if(!m){res.writeHead(416,{'Content-Range':'bytes */'+total});res.end();return}let start=m[1]?Number(m[1]):0,end=m[2]?Number(m[2]):total-1;if(!m[1]&&m[2]){const suffix=Number(m[2]);start=Math.max(0,total-suffix);end=total-1}if(start<0||end<start||start>=total){res.writeHead(416,{'Content-Range':'bytes */'+total});res.end();return}end=Math.min(end,total-1);res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${total}`,'Content-Length':String(end-start+1)});if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);return}
  res.writeHead(200,{...headers,'Content-Length':String(total)});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);return
 }
 if(url.pathname==='/api/community' || url.pathname==='/api/groups'){
  if(req.method!=='POST'){res.writeHead(405);res.end();return}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>40000){res.writeHead(413);res.end();return}chunks.push(chunk)}
  const result=await COMMUNITY(new Request(new URL('/api/groups',origin),{method:'POST',headers:{origin:req.headers.origin||'',authorization:req.headers.authorization||'','Content-Type':'application/json'},body:Buffer.concat(chunks)}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return
 }
 if(url.pathname==='/api/room'){
  if(req.method!=='POST'){res.writeHead(405);res.end();return}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>40000){res.writeHead(413);res.end();return}chunks.push(chunk)}
  const result=await POST(new Request(new URL('/api/room',origin),{method:'POST',headers:{origin:req.headers.origin||'',authorization:req.headers.authorization||'','Content-Type':'application/json'},body:Buffer.concat(chunks)}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
 let path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return}
 if(url.pathname==='/')path=resolve(root,'index.html');
 try{if(!(await stat(path)).isFile())throw Error()}catch{res.writeHead(404);res.end('Not found');return}
 const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':path.endsWith('.html')?'no-cache':'public,max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
}catch(e){console.error('Request failed:',e.message);if(!res.headersSent)res.writeHead(500);res.end('Internal error')}});
setInterval(async()=>{try{const cutoff=Date.now()-60*60*1000;const rows=sqlite.prepare(`SELECT id,path FROM attachments a WHERE created<? AND NOT EXISTS(SELECT 1 FROM channel_messages m WHERE m.attachment_id=a.id) AND NOT EXISTS(SELECT 1 FROM direct_messages d WHERE d.attachment_id=a.id) LIMIT 100`).all(cutoff);for(const row of rows){try{await unlink(resolve(uploadsRoot,row.path))}catch{}sqlite.prepare('DELETE FROM attachments WHERE id=?').run(row.id)}}catch(e){console.error('Attachment cleanup failed:',e.message)}},60*60*1000).unref();
server.listen(port,'0.0.0.0',()=>console.log(`Voz listening on ${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));

