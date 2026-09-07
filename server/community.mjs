import { sqlite } from './db.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
export const one=(sql,...p)=>sqlite.prepare(sql).get(...p);
export const all=(sql,...p)=>sqlite.prepare(sql).all(...p);
export const run=(sql,...p)=>sqlite.prepare(sql).run(...p);
const publicId=k=>createHash('sha256').update('vertice-public:'+k).digest('hex').slice(0,32);
const hash=s=>createHash('sha256').update(s).digest('hex');
export function fail(message,status=400){throw Object.assign(new Error(message),{status})}
export function authenticate(req){
 const credential=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const [key,secret]=credential.split('.');
 const user=one('SELECT * FROM profiles WHERE user_key=?',key||'');
 if(!user||!secret||hash(secret)!==user.secret_hash)fail('Sua identidade não foi reconhecida. Use sua chave de acesso nas configurações.',401);
 return user;
}
export function member(group,key){const m=one('SELECT * FROM group_members WHERE group_id=? AND user_key=?',group,key);if(!m)fail('Você não faz parte deste servidor.',403);return m}
const clean=(v,max=40)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
function name(v){const n=clean(v);if(n.length<2)fail('Use um nome com pelo menos 2 caracteres.');return n}
function message(v,allowEmpty=false){const m=String(v||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();if((!m&&!allowEmpty)||m.length>2000)fail(allowEmpty?'A mensagem pode ter até 2000 caracteres.':'A mensagem deve ter entre 1 e 2000 caracteres.');return m}
function attachment(id,key){if(!id)return null;const a=one('SELECT * FROM attachments WHERE id=? AND user_key=? AND used=0',String(id),key);if(!a)fail('O anexo não foi encontrado ou já foi enviado.');return a}
const mediaFields=m=>({attachmentId:m.attachment_id||'',attachmentName:m.attachment_name||'',attachmentType:m.attachment_type||'',attachmentSize:Number(m.attachment_size)||0,attachmentUrl:m.attachment_id?'/api/attachment/'+m.attachment_id:''});
function transaction(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}
const buckets=new Map();
function throttle(key,max=120){const now=Date.now(),b=buckets.get(key);if(!b||now-b.start>60000){buckets.set(key,{start:now,n:1});return}if(++b.n>max)fail('Muitas ações. Aguarde um minuto.',429)}
setInterval(()=>{const now=Date.now();for(const [k,v] of buckets)if(now-v.start>60000)buckets.delete(k);run('DELETE FROM typing WHERE seen<?',now-10000)},60000).unref();
export async function COMMUNITY(req){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)fail('Origem inválida.',403);
 const b=await req.json(),action=b.action||'poll';
 if(action==='bootstrap'){
  const legacy=String(b.legacyKey||'');
  const key=/^[a-f0-9-]{36}$/i.test(legacy)?legacy:randomUUID();
  if(one('SELECT user_key FROM profiles WHERE user_key=?',key))fail('Identidade já protegida. Restaure sua chave de acesso.',409);
  const secret=randomBytes(32).toString('hex');
  run('INSERT INTO profiles(user_key,secret_hash,name) VALUES(?,?,?)',key,hash(secret),clean(b.name,30)||'Visitante');
  return Response.json({credential:key+'.'+secret,userKey:key});
 }
 const u=authenticate(req),key=u.user_key,now=Date.now();
 // Public IDs never expose the old browser key used to claim a migrated profile.
 const resolveTarget=id=>all('SELECT DISTINCT b.user_key FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=?',key).find(m=>publicId(m.user_key)===id)?.user_key||'';
 if(b.target)b.target=resolveTarget(b.target);if(b.dmTarget)b.dmTarget=resolveTarget(b.dmTarget);
 if(action!=='poll')throttle(key,action==='typing'?240:120);
 run('UPDATE profiles SET seen=? WHERE user_key=?',now,key);
 let gid=String(b.groupId||''),cid=String(b.channelId||'');
 const manager=()=>{const m=member(gid,key);if(!['owner','admin'].includes(m.role))fail('Somente dono ou administrador.',403);return m};
 const moderator=()=>{const m=member(gid,key);if(!['owner','admin','moderator'].includes(m.role))fail('Sem permissão para moderar.',403);return m};
 const owner=()=>{if(member(gid,key).role!=='owner')fail('Somente o dono pode fazer isso.',403)};
 const channel=()=>{const c=one('SELECT * FROM channels WHERE id=? AND group_id=?',cid,gid);if(!c)fail('Canal não encontrado.',404);member(gid,key);return c};
 if(action==='create')transaction(()=>{
  gid=randomUUID();const space=randomUUID(),code=randomBytes(5).toString('hex').toUpperCase();
  run('INSERT INTO groups VALUES(?,?,?,?,?,?)',gid,name(b.name),code,key,space,now);
  run('INSERT INTO group_members VALUES(?,?,?,?,?)',gid,key,u.name,'owner',now);
  for(const [i,[cn,kind]] of [['geral','text'],['avisos','text'],['Lounge','voice']].entries()){
   const id=randomUUID();run('INSERT INTO channels VALUES(?,?,?,?,?,?)',id,gid,cn,kind,space+'-'+id,i);if(!i)cid=id;
  }
 });
 else if(action==='join'){
  let code=String(b.code||'').trim();try{if(code.includes('://'))code=new URL(code).searchParams.get('invite')||''}catch{}
  const g=one('SELECT * FROM groups WHERE invite_code=?',code.toUpperCase());if(!g)fail('Convite inválido ou revogado.',404);gid=g.id;
  run('INSERT OR IGNORE INTO group_members VALUES(?,?,?,?,?)',gid,key,u.name,'member',now);
 }
 else if(action==='rename'){manager();run('UPDATE groups SET name=? WHERE id=?',name(b.name),gid)}
 else if(action==='invite'){manager();run('UPDATE groups SET invite_code=? WHERE id=?',randomBytes(5).toString('hex').toUpperCase(),gid)}
 else if(action==='delete'){owner();transaction(()=>{
  const g=one('SELECT * FROM groups WHERE id=?',gid);
  run('DELETE FROM reactions WHERE message_id IN (SELECT m.id FROM channel_messages m JOIN channels c ON c.id=m.channel_id WHERE c.group_id=?)',gid);
  run('DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE group_id=?)',gid);
  run('DELETE FROM typing WHERE channel_id IN (SELECT id FROM channels WHERE group_id=?)',gid);
  run('DELETE FROM channels WHERE group_id=?',gid);run('DELETE FROM group_messages WHERE group_id=?',gid);
  run('DELETE FROM messages WHERE room LIKE ?',g.space+'-%');run('DELETE FROM peers WHERE room LIKE ?',g.space+'-%');run('DELETE FROM signals WHERE room LIKE ?',g.space+'-%');
  run('DELETE FROM group_members WHERE group_id=?',gid);run('DELETE FROM groups WHERE id=?',gid);
 });gid='';cid=''}
 else if(action==='leave'){if(member(gid,key).role==='owner')fail('O dono precisa excluir o servidor para sair.');run('DELETE FROM group_members WHERE group_id=? AND user_key=?',gid,key);run('DELETE FROM peers WHERE user_key=? AND room LIKE ?',key,one('SELECT space FROM groups WHERE id=?',gid).space+'-%');gid='';cid=''}
 else if(action==='role'){
  owner();const target=member(gid,String(b.target||''));if(target.role==='owner')fail('O cargo do dono é fixo.');
  if(!['admin','moderator','member'].includes(b.role))fail('Cargo inválido.');run('UPDATE group_members SET role=? WHERE group_id=? AND user_key=?',b.role,gid,b.target);
 }
 else if(action==='channelCreate'){
  manager();if(!['text','voice'].includes(b.kind))fail('Tipo de canal inválido.');
  if(one('SELECT count(*) n FROM channels WHERE group_id=?',gid).n>=50)fail('Limite de 50 canais por servidor.');
  cid=randomUUID();run('INSERT INTO channels VALUES(?,?,?,?,?,?)',cid,gid,name(b.name),b.kind,one('SELECT space FROM groups WHERE id=?',gid).space+'-'+cid,now);
 }
 else if(action==='channelRename'){manager();channel();run('UPDATE channels SET name=? WHERE id=?',name(b.name),cid)}
 else if(action==='channelDelete'){
  manager();const c=channel();transaction(()=>{run('DELETE FROM reactions WHERE message_id IN (SELECT id FROM channel_messages WHERE channel_id=?)',cid);run('DELETE FROM channel_messages WHERE channel_id=?',cid);run('DELETE FROM typing WHERE channel_id=?',cid);run('DELETE FROM peers WHERE room=?',c.room_key);run('DELETE FROM signals WHERE room=?',c.room_key);run('DELETE FROM channels WHERE id=?',cid)});cid='';
 }
 else if(action==='profile'){
  const avatar=String(b.avatar||'');if(avatar&&(avatar.length>24000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)))fail('Avatar inválido.');
  if(!['online','away','busy'].includes(b.presence))fail('Presença inválida.');
  run('UPDATE profiles SET name=?,avatar=?,status=?,presence=? WHERE user_key=?',name(b.name).slice(0,30),avatar,clean(b.status,100),b.presence,key);
  run('UPDATE group_members SET name=? WHERE user_key=?',name(b.name).slice(0,30),key);
 }
 else if(action==='message'){
  channel();const a=attachment(b.attachmentId,key),text=message(b.message,!!a),reply=Number(b.replyId)||null;
  if(reply&&!one('SELECT id FROM channel_messages WHERE id=? AND channel_id=?',reply,cid))fail('Resposta fora deste canal.');
  transaction(()=>{const r=run('INSERT OR IGNORE INTO channel_messages(channel_id,user_key,name,body,created,reply_id,nonce,attachment_id,attachment_name,attachment_type,attachment_size) VALUES(?,?,?,?,?,?,?,?,?,?,?)',cid,key,u.name,text,now,reply,clean(b.nonce,80)||randomUUID(),a?.id||null,a?.name||'',a?.mime||'',a?.size||0);if(a&&Number(r.changes))run('UPDATE attachments SET used=1 WHERE id=?',a.id)});run('DELETE FROM typing WHERE channel_id=? AND user_key=?',cid,key);
 }
 else if(['editMessage','deleteMessage','react','pin'].includes(action)){
  channel();const m=one('SELECT * FROM channel_messages WHERE id=? AND channel_id=?',Number(b.messageId)||0,cid);if(!m)fail('Mensagem não encontrada.',404);
  if(action==='editMessage'){if(m.user_key!==key)fail('Você só pode editar suas mensagens.',403);run('UPDATE channel_messages SET body=?,edited=? WHERE id=?',message(b.message,!!m.attachment_id),now,m.id)}
  if(action==='deleteMessage'){if(m.user_key!==key)moderator();transaction(()=>{run('DELETE FROM reactions WHERE message_id=?',m.id);run('UPDATE channel_messages SET reply_id=NULL WHERE reply_id=?',m.id);run('DELETE FROM channel_messages WHERE id=?',m.id)})}
  if(action==='pin'){moderator();run('UPDATE channel_messages SET pinned=? WHERE id=?',m.pinned?0:1,m.id)}
  if(action==='react'){
   if(!['👍','❤️','🔥','😂','✅'].includes(b.emoji))fail('Reação inválida.');
   if(one('SELECT 1 FROM reactions WHERE message_id=? AND user_key=? AND emoji=?',m.id,key,b.emoji))run('DELETE FROM reactions WHERE message_id=? AND user_key=? AND emoji=?',m.id,key,b.emoji);
   else run('INSERT INTO reactions VALUES(?,?,?)',m.id,key,b.emoji);
  }
 }
 else if(action==='typing'){channel();run('INSERT OR REPLACE INTO typing VALUES(?,?,?)',cid,key,now)}
 else if(action==='dmSend'){
  const target=String(b.target||'');if(target===key||!one('SELECT 1 FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=? AND b.user_key=?',key,target))fail('A DM exige um servidor em comum.',403);
  const a=attachment(b.attachmentId,key),text=message(b.message,!!a);transaction(()=>{const r=run('INSERT OR IGNORE INTO direct_messages(sender,recipient,body,created,nonce,attachment_id,attachment_name,attachment_type,attachment_size) VALUES(?,?,?,?,?,?,?,?,?)',key,target,text,now,clean(b.nonce,80)||randomUUID(),a?.id||null,a?.name||'',a?.mime||'',a?.size||0);if(a&&Number(r.changes))run('UPDATE attachments SET used=1 WHERE id=?',a.id)});
 }
 else if(action!=='poll')fail('Ação desconhecida.');
 const groups=all(`SELECT g.id,g.name,g.space,g.invite_code inviteCode,m.role,(SELECT count(*) FROM group_members WHERE group_id=g.id) memberCount FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_key=? ORDER BY g.created`,key);
 if(!groups.some(g=>g.id===gid)){gid=groups[0]?.id||'';cid=''}
 const channels=gid?all('SELECT id,name,kind,room_key roomKey FROM channels WHERE group_id=? ORDER BY position,id',gid):[];
 if(!channels.some(c=>c.id===cid))cid=channels[0]?.id||'';
 const members=gid?all(`SELECT m.user_key userKey,COALESCE(p.name,m.name) name,m.role,COALESCE(p.avatar,'') avatar,COALESCE(p.status,'') status,CASE WHEN p.seen>? THEN p.presence ELSE 'offline' END presence FROM group_members m LEFT JOIN profiles p ON p.user_key=m.user_key WHERE m.group_id=? ORDER BY m.joined`,now-35000,gid):[];
 const before=Math.max(0,Number(b.before)||0);
 const rows=cid?all(`SELECT * FROM channel_messages WHERE channel_id=? AND (?=0 OR id<?) ORDER BY id DESC LIMIT 80`,cid,before,before).reverse():[];
 function decorate(m){const {user_key,...safe}=m;return {...safe,...mediaFields(m),userKey:publicId(user_key),reply:m.reply_id?one('SELECT name,body,attachment_name attachmentName FROM channel_messages WHERE id=? AND channel_id=?',m.reply_id,cid)||null:null,reactions:all('SELECT emoji,count(*) count,max(user_key=?) mine FROM reactions WHERE message_id=? GROUP BY emoji',key,m.id)}}
 const pinned=cid?all('SELECT * FROM channel_messages WHERE channel_id=? AND pinned=1 ORDER BY id DESC LIMIT 100',cid).map(decorate):[];
 const typing=cid?all('SELECT p.name FROM typing t JOIN profiles p ON p.user_key=t.user_key WHERE t.channel_id=? AND t.seen>? AND t.user_key<>?',cid,now-5000,key):[];
 const target=String(b.dmTarget||b.target||'');let dms=[];
 const dmAllowed=target!==key&&!!one('SELECT 1 FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=? AND b.user_key=?',key,target);
 if(target&&dmAllowed)dms=all('SELECT * FROM direct_messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND (?=0 OR id<?) ORDER BY id DESC LIMIT 80',key,target,target,key,before,before).reverse();
 const me=one('SELECT user_key userKey,name,avatar,status,presence FROM profiles WHERE user_key=?',key);
 members.forEach(m=>m.userKey=publicId(m.userKey));me.userKey=publicId(me.userKey);dms=dms.map(m=>({...m,...mediaFields(m),sender:publicId(m.sender),recipient:publicId(m.recipient)}));
 return Response.json({groups,channels,members,messages:rows.map(decorate),pinned,typing,dms,dmAllowed,me,activeGroupId:gid,activeChannelId:cid,hasOlder:rows.length===80},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(!e.status)console.error('Community:',e);return Response.json({error:e.status?e.message:'Não foi possível concluir a ação.'},{status:e.status||500})}}

