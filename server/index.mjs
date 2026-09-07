import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { POST,PRESENCE } from './room.mjs';
import { COMMUNITY } from './community.mjs';
const root=resolve('dist'),port=Number(process.env.PORT||8080);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

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
server.listen(port,'0.0.0.0',()=>console.log(`Voz listening on ${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));

