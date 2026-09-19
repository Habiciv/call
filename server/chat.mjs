import {database} from './db.mjs';

export async function CHAT(req){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
  const body=await req.text();
  if(body.length>4000)return Response.json({error:'Mensagem muito grande'},{status:413});
  let input;try{input=JSON.parse(body)}catch{return Response.json({error:'Dados inválidos'},{status:400})}
  const {room,id,token,text}=input;
  if(typeof room!=='string'||typeof id!=='string'||typeof token!=='string')return Response.json({error:'Sessão inválida'},{status:400});
  const db=database(),now=Date.now();
  const peer=db.prepare('SELECT name FROM peers WHERE room=? AND id=? AND token=? AND seen>?').bind(room,id,token,now-30000).first();
  if(!peer)return Response.json({error:'Entre na sala para conversar.'},{status:401});
  if(text!==undefined){
   if(typeof text!=='string'||!text.trim()||text.length>500)return Response.json({error:'Use entre 1 e 500 caracteres.'},{status:400});
   const last=db.prepare('SELECT created FROM messages WHERE room=? AND sender=? ORDER BY id DESC LIMIT 1').bind(room,id).first();
   if(last&&now-last.created<800)return Response.json({error:'Espere um instante antes de enviar outra mensagem.'},{status:429});
   db.prepare('INSERT INTO messages(room,sender,name,text,created) VALUES(?,?,?,?,?)').bind(room,id,peer.name,text.trim(),now).run();
   db.prepare('DELETE FROM messages WHERE room=? AND id NOT IN (SELECT id FROM messages WHERE room=? ORDER BY id DESC LIMIT 200)').bind(room,room).run();
  }
  const messages=db.prepare('SELECT id,sender,name,text,created FROM messages WHERE room=? AND created>? ORDER BY id DESC LIMIT 100').bind(room,now-86400000).execute().results.reverse();
  return Response.json({messages},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Chat:',error.message);return Response.json({error:'Não foi possível carregar o chat.'},{status:500})}
}
