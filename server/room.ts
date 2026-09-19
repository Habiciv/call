import { database } from '@/db/raw';
export async function POST(req:Request){
 try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origem inválida'},{status:403});
 const body=await req.text(); if(body.length>40000)return Response.json({error:'Dados muito grandes'},{status:413});
 const {action,room,id,token,name,target,data,after}=JSON.parse(body);
 if(!/^[a-zA-Z0-9-]{32,100}$/.test(room||'') || !/^[a-zA-Z0-9-]{36}$/.test(id||'') || !/^[a-zA-Z0-9-]{36}$/.test(token||''))return Response.json({error:'Sala inválida'},{status:400});
 const db=database(),now=Date.now();
 if(action==='join'){
 const inserted=await db.prepare('INSERT INTO peers(id,room,token,name,seen) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM peers WHERE room=? AND seen>?) < 10').bind(id,room,token,String(name||'Visitante').slice(0,30),now,room,now-30000).run();
 if(!inserted.meta.changes)return Response.json({error:'Sala cheia. O limite é de 10 pessoas.'},{status:409});
 }else{
 const p=await db.prepare('SELECT id FROM peers WHERE id=? AND room=? AND token=?').bind(id,room,token).first();
 if(!p)return Response.json({error:'Sua conexão expirou. Entre novamente.'},{status:401});
 if(action==='leave'){await db.prepare('DELETE FROM peers WHERE id=? AND token=?').bind(id,token).run();return Response.json({ok:true});}
 if(action==='signal'){
 if(!target || !data || JSON.stringify(data).length>32000)return Response.json({error:'Sinal inválido'},{status:400});
 await db.prepare('INSERT INTO signals(room,sender,target,data,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM peers WHERE id=? AND room=? AND seen>?)').bind(room,id,target,JSON.stringify(data),now,target,room,now-30000).run();
 return Response.json({ok:true});
 }
 await db.prepare('UPDATE peers SET seen=? WHERE id=?').bind(now,id).run();
 }
 const results=await db.batch([db.prepare('SELECT id,name FROM peers WHERE room=? AND seen>?').bind(room,now-30000),db.prepare('SELECT id,sender,data FROM signals WHERE room=? AND target=? AND id>? ORDER BY id LIMIT 100').bind(room,id,Number(after)||0),db.prepare('DELETE FROM signals WHERE room=? AND created<?').bind(room,now-120000),db.prepare('DELETE FROM peers WHERE room=? AND seen<?').bind(room,now-120000)]);
 return Response.json({peers:results[0].results,signals:results[1].results},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível conectar à sala. Tente novamente.'},{status:500});}
}
