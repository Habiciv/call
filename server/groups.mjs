import { database } from './db.mjs';
import { randomUUID, randomBytes } from 'node:crypto';

const UUID=/^[a-f0-9-]{36}$/i;
const CODE=/^[A-Z0-9]{6,12}$/;
function cleanName(v,max=40){return String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)}
function cleanMessage(v){const t=String(v||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,1500);if(!t)throw Error('EMPTY');return t}
function inviteCode(){return randomBytes(5).toString('hex').toUpperCase()}
function originOk(req){try{return req.headers.get('origin')===new URL(req.url).origin}catch{return false}}

export async function GROUPS(req){
 try{
  if(!originOk(req))return Response.json({error:'Origem inválida'},{status:403});
  const raw=await req.text();if(raw.length>12000)return Response.json({error:'Dados muito grandes'},{status:413});
  const body=JSON.parse(raw||'{}');const action=String(body.action||'');const userKey=String(body.userKey||'');const userName=cleanName(body.userName||'Visitante',30)||'Visitante';
  if(!UUID.test(userKey))return Response.json({error:'Usuário inválido'},{status:400});
  const db=database(),now=Date.now();let activeGroupId='';
  const member=async(groupId)=>db.prepare('SELECT role FROM group_members WHERE group_id=? AND user_key=?').bind(groupId,userKey).first();
  if(action==='create'){
   const name=cleanName(body.name,32);if(name.length<2)return Response.json({error:'Digite um nome para o grupo.'},{status:400});
   const id=randomUUID(),space=randomUUID(),code=inviteCode();activeGroupId=id;
   await db.prepare('INSERT INTO groups(id,name,invite_code,owner_key,space,created) VALUES(?,?,?,?,?,?)').bind(id,name,code,userKey,space,now).run();
   await db.prepare('INSERT INTO group_members(group_id,user_key,name,role,joined) VALUES(?,?,?,?,?)').bind(id,userKey,userName,'owner',now).run();
  } else if(action==='join'){
   const code=String(body.code||'').trim().toUpperCase();if(!CODE.test(code))return Response.json({error:'Código de convite inválido.'},{status:400});
   const g=await db.prepare('SELECT id FROM groups WHERE invite_code=?').bind(code).first();if(!g)return Response.json({error:'Grupo não encontrado.'},{status:404});activeGroupId=g.id;
   await db.prepare('INSERT OR REPLACE INTO group_members(group_id,user_key,name,role,joined) VALUES(?,?,?,?,?)').bind(g.id,userKey,userName,'member',now).run();
  } else if(action==='leave'){
   const groupId=String(body.groupId||'');if(!UUID.test(groupId))return Response.json({error:'Grupo inválido'},{status:400});
   const g=await db.prepare('SELECT owner_key FROM groups WHERE id=?').bind(groupId).first();if(!g)return Response.json({error:'Grupo não encontrado'},{status:404});
   if(g.owner_key===userKey)return Response.json({error:'O dono não pode sair sem excluir o grupo.'},{status:409});
   await db.prepare('DELETE FROM group_members WHERE group_id=? AND user_key=?').bind(groupId,userKey).run();
  } else if(action==='delete'){
   const groupId=String(body.groupId||'');const g=await db.prepare('SELECT owner_key FROM groups WHERE id=?').bind(groupId).first();
   if(!g||g.owner_key!==userKey)return Response.json({error:'Sem permissão.'},{status:403});
   await db.prepare('DELETE FROM group_messages WHERE group_id=?').bind(groupId).run();await db.prepare('DELETE FROM group_members WHERE group_id=?').bind(groupId).run();await db.prepare('DELETE FROM groups WHERE id=?').bind(groupId).run();
  } else if(action==='rename'){
   const groupId=String(body.groupId||''),name=cleanName(body.name,32);const g=await db.prepare('SELECT owner_key FROM groups WHERE id=?').bind(groupId).first();
   if(!g||g.owner_key!==userKey)return Response.json({error:'Sem permissão.'},{status:403});if(name.length<2)return Response.json({error:'Nome muito curto.'},{status:400});
   await db.prepare('UPDATE groups SET name=? WHERE id=?').bind(name,groupId).run();
  } else if(action==='message'){
   const groupId=String(body.groupId||'');if(!UUID.test(groupId)||!(await member(groupId)))return Response.json({error:'Você não faz parte desse grupo.'},{status:403});
   const text=cleanMessage(body.message);await db.prepare('UPDATE group_members SET name=? WHERE group_id=? AND user_key=?').bind(userName,groupId,userKey).run();
   await db.prepare('INSERT INTO group_messages(group_id,user_key,name,body,created) VALUES(?,?,?,?,?)').bind(groupId,userKey,userName,text,now).run();
  } else if(action==='list'||action==='poll'){
   // no-op, response below
  } else return Response.json({error:'Ação inválida'},{status:400});

  const groups=db.prepare(`SELECT g.id,g.name,g.invite_code AS inviteCode,g.owner_key AS ownerKey,g.space,g.created,
    (SELECT count(*) FROM group_members gm2 WHERE gm2.group_id=g.id) AS memberCount
    FROM groups g JOIN group_members gm ON gm.group_id=g.id WHERE gm.user_key=? ORDER BY g.created ASC`).bind(userKey).execute().results;
  const requested=String(body.groupId||'');const selected=activeGroupId||(UUID.test(requested)&&groups.some(g=>g.id===requested)?requested:groups[0]?.id||'');
  let members=[],messages=[];
  if(selected&&await member(selected)){
    members=db.prepare('SELECT user_key AS userKey,name,role,joined FROM group_members WHERE group_id=? ORDER BY role DESC,joined ASC').bind(selected).execute().results;
    const after=Math.max(0,Number(body.after)||0);
    messages=(after?db.prepare('SELECT id,user_key AS userKey,name,body,created FROM group_messages WHERE group_id=? AND id>? ORDER BY id ASC LIMIT 100').bind(selected,after):db.prepare('SELECT id,user_key AS userKey,name,body,created FROM (SELECT id,user_key,name,body,created FROM group_messages WHERE group_id=? ORDER BY id DESC LIMIT 80) ORDER BY id ASC').bind(selected)).execute().results;
  }
  return Response.json({groups,members,messages,activeGroupId:selected},{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof Error&&e.message==='EMPTY')return Response.json({error:'Digite uma mensagem.'},{status:400});
  console.error('Groups request failed:',e);return Response.json({error:'Não foi possível atualizar os grupos.'},{status:500});
 }
}
