import { sqlite } from './db.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const one=(sql,...p)=>sqlite.prepare(sql).get(...p);
export const all=(sql,...p)=>sqlite.prepare(sql).all(...p);
export const run=(sql,...p)=>sqlite.prepare(sql).run(...p);
const publicId=k=>createHash('sha256').update('vertice-public:'+k).digest('hex').slice(0,32);
const hash=s=>createHash('sha256').update(s).digest('hex');
const rank={member:1,moderator:2,admin:3,owner:4};

export function fail(message,status=400){throw Object.assign(new Error(message),{status})}
export function authenticate(req){
 const credential=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 const [key,secret]=credential.split('.');
 const user=one('SELECT * FROM profiles WHERE user_key=?',key||'');
 if(!user||!secret||hash(secret)!==user.secret_hash)fail('Sua identidade não foi reconhecida. Use sua chave de acesso nas configurações.',401);
 return user;
}
export function member(group,key){const m=one('SELECT * FROM group_members WHERE group_id=? AND user_key=?',group,key);if(!m)fail('Você não faz parte deste servidor.',403);return m}
export function activeMember(group,key){const m=member(group,key);if(Number(m.timeout_until)>Date.now())fail('Você está em timeout neste servidor.',403);return m}
const clean=(v,max=40)=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
function name(v){const n=clean(v);if(n.length<2)fail('Use um nome com pelo menos 2 caracteres.');return n}
function message(v,allowEmpty=false){const m=String(v||'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();if((!m&&!allowEmpty)||m.length>2000)fail(allowEmpty?'A mensagem pode ter até 2000 caracteres.':'A mensagem deve ter entre 1 e 2000 caracteres.');return m}
function attachment(id,key){if(!id)return null;const a=one('SELECT * FROM attachments WHERE id=? AND user_key=? AND used=0',String(id),key);if(!a)fail('O anexo não foi encontrado ou já foi enviado.');return a}
const mediaFields=m=>({attachmentId:m.attachment_id||'',attachmentName:m.attachment_name||'',attachmentType:m.attachment_type||'',attachmentSize:Number(m.attachment_size)||0,attachmentUrl:m.attachment_id?'/api/attachment/'+m.attachment_id:''});
function transaction(fn){sqlite.exec('BEGIN IMMEDIATE');try{const r=fn();sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}
const buckets=new Map();
function throttle(key,max=120){const now=Date.now(),b=buckets.get(key);if(!b||now-b.start>60000){buckets.set(key,{start:now,n:1});return}if(++b.n>max)fail('Muitas ações. Aguarde um minuto.',429)}
setInterval(()=>{const now=Date.now();for(const [k,v] of buckets)if(now-v.start>60000)buckets.delete(k);run('DELETE FROM typing WHERE seen<?',now-10000)},60000).unref();
function audit(group,actor,action,target='',details=''){run('INSERT INTO moderation_log(group_id,actor_key,target_key,action,details,created) VALUES(?,?,?,?,?,?)',group,actor,target,action,clean(details,300),Date.now())}
function roleLabel(r){return ({owner:'Dono',admin:'Administrador',moderator:'Moderador',member:'Membro'})[r]||r}

function decorateRows(rows,cid,key){
 if(!rows.length)return [];
 const ids=rows.map(r=>Number(r.id));
 const placeholders=ids.map(()=>'?').join(',');
 const reactionRows=all(`SELECT message_id,emoji,count(*) count,max(user_key=?) mine FROM reactions WHERE message_id IN (${placeholders}) GROUP BY message_id,emoji`,key,...ids);
 const reactions=new Map();for(const r of reactionRows){const a=reactions.get(r.message_id)||[];a.push({emoji:r.emoji,count:r.count,mine:r.mine});reactions.set(r.message_id,a)}
 const replyIds=[...new Set(rows.map(r=>Number(r.reply_id)||0).filter(Boolean))];
 const replies=new Map();if(replyIds.length){const q=replyIds.map(()=>'?').join(',');for(const r of all(`SELECT id,name,body,attachment_name attachmentName FROM channel_messages WHERE channel_id=? AND id IN (${q})`,cid,...replyIds))replies.set(r.id,r)}
 return rows.map(m=>{const {user_key,...safe}=m;return {...safe,...mediaFields(m),userKey:publicId(user_key),reply:m.reply_id?replies.get(m.reply_id)||null:null,reactions:reactions.get(m.id)||[]}})
}

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
 let gid=String(b.groupId||''),cid=String(b.channelId||'');
 const resolveTarget=id=>{
  if(!id)return '';
  const shared=all('SELECT DISTINCT b.user_key FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=?',key).find(m=>publicId(m.user_key)===id)?.user_key;
  if(shared)return shared;
  if(gid)return all('SELECT user_key FROM group_bans WHERE group_id=?',gid).find(m=>publicId(m.user_key)===id)?.user_key||'';
  return '';
 };
 if(b.target)b.target=resolveTarget(String(b.target));if(b.dmTarget)b.dmTarget=resolveTarget(String(b.dmTarget));
 if(action!=='poll')throttle(key,action==='typing'?240:120);
 run('UPDATE profiles SET seen=? WHERE user_key=?',now,key);
 const actor=()=>member(gid,key);
 const manager=()=>{const m=actor();if(rank[m.role]<3)fail('Somente dono ou administrador.',403);return m};
 const moderator=()=>{const m=actor();if(rank[m.role]<2)fail('Sem permissão para moderar.',403);return m};
 const owner=()=>{const m=actor();if(m.role!=='owner')fail('Somente o dono pode fazer isso.',403);return m};
 const canAct=(target,minRank=2)=>{const a=actor();if(rank[a.role]<minRank)fail('Sem permissão para moderar.',403);const t=member(gid,target);if(t.user_key===key)fail('Você não pode aplicar esta ação em si mesmo.');if(rank[a.role]<=rank[t.role])fail('Você só pode moderar cargos abaixo do seu.',403);return {a,t}};
 const channel=()=>{const c=one('SELECT * FROM channels WHERE id=? AND group_id=?',cid,gid);if(!c)fail('Canal não encontrado.',404);member(gid,key);return c};

 if(action==='create')transaction(()=>{
  gid=randomUUID();const space=randomUUID(),code=randomBytes(5).toString('hex').toUpperCase();
  run('INSERT INTO groups(id,name,invite_code,owner_key,space,created,description) VALUES(?,?,?,?,?,?,?)',gid,name(b.name),code,key,space,now,'');
  run('INSERT INTO group_members(group_id,user_key,name,role,joined,timeout_until) VALUES(?,?,?,?,?,0)',gid,key,u.name,'owner',now);
  for(const [i,[cn,kind,topic]] of [['geral','text','Conversa principal do servidor'],['avisos','text','Atualizações importantes'],['Lounge','voice','']].entries()){
   const id=randomUUID();run('INSERT INTO channels(id,group_id,name,kind,room_key,position,topic,slowmode) VALUES(?,?,?,?,?,?,?,0)',id,gid,cn,kind,space+'-'+id,i,topic);if(!i)cid=id;
  }
  audit(gid,key,'server_create','',name(b.name));
 });
 else if(action==='join'){
  let code=String(b.code||'').trim();try{if(code.includes('://'))code=new URL(code).searchParams.get('invite')||''}catch{}
  const g=one('SELECT * FROM groups WHERE invite_code=?',code.toUpperCase());if(!g)fail('Convite inválido ou revogado.',404);gid=g.id;
  if(one('SELECT 1 FROM group_bans WHERE group_id=? AND user_key=?',gid,key))fail('Você foi banido deste servidor.',403);
  run('INSERT OR IGNORE INTO group_members(group_id,user_key,name,role,joined,timeout_until) VALUES(?,?,?,?,?,0)',gid,key,u.name,'member',now);
  audit(gid,key,'member_join',key,'Entrou por convite');
 }
 else if(action==='serverUpdate'){
  manager();const newName=name(b.name),description=clean(b.description,240);run('UPDATE groups SET name=?,description=? WHERE id=?',newName,description,gid);audit(gid,key,'server_update','',newName);
 }
 else if(action==='rename'){manager();const n=name(b.name);run('UPDATE groups SET name=? WHERE id=?',n,gid);audit(gid,key,'server_rename','',n)}
 else if(action==='invite'){manager();run('UPDATE groups SET invite_code=? WHERE id=?',randomBytes(5).toString('hex').toUpperCase(),gid);audit(gid,key,'invite_rotate')}
 else if(action==='delete'){owner();transaction(()=>{
  const g=one('SELECT * FROM groups WHERE id=?',gid);
  run('DELETE FROM reactions WHERE message_id IN (SELECT m.id FROM channel_messages m JOIN channels c ON c.id=m.channel_id WHERE c.group_id=?)',gid);
  run('DELETE FROM channel_messages WHERE channel_id IN (SELECT id FROM channels WHERE group_id=?)',gid);
  run('DELETE FROM typing WHERE channel_id IN (SELECT id FROM channels WHERE group_id=?)',gid);
  run('DELETE FROM channels WHERE group_id=?',gid);run('DELETE FROM group_messages WHERE group_id=?',gid);
  run('DELETE FROM messages WHERE room LIKE ?',g.space+'-%');run('DELETE FROM peers WHERE room LIKE ?',g.space+'-%');run('DELETE FROM signals WHERE room LIKE ?',g.space+'-%');
  run('DELETE FROM group_bans WHERE group_id=?',gid);run('DELETE FROM moderation_log WHERE group_id=?',gid);run('DELETE FROM group_members WHERE group_id=?',gid);run('DELETE FROM groups WHERE id=?',gid);
 });gid='';cid=''}
 else if(action==='leave'){if(actor().role==='owner')fail('Transfira a propriedade ou exclua o servidor antes de sair.');run('DELETE FROM group_members WHERE group_id=? AND user_key=?',gid,key);const g=one('SELECT space FROM groups WHERE id=?',gid);if(g)run('DELETE FROM peers WHERE user_key=? AND room LIKE ?',key,g.space+'-%');audit(gid,key,'member_leave',key);gid='';cid=''}
 else if(action==='role'){
  const target=String(b.target||'');const a=actor(),t=member(gid,target);if(t.role==='owner')fail('O cargo do dono é fixo.');
  const next=String(b.role||'');if(!['admin','moderator','member'].includes(next))fail('Cargo inválido.');
  if(a.role==='owner'){}else if(a.role==='admin'&&rank[t.role]<3&&rank[next]<3){}else fail('Você não pode gerenciar esse cargo.',403);
  run('UPDATE group_members SET role=? WHERE group_id=? AND user_key=?',next,gid,target);audit(gid,key,'role_change',target,roleLabel(t.role)+' → '+roleLabel(next));
 }
 else if(action==='transferOwner'){
  owner();const target=String(b.target||''),t=member(gid,target);if(t.user_key===key)fail('Você já é o dono.');transaction(()=>{run("UPDATE group_members SET role='admin' WHERE group_id=? AND user_key=?",gid,key);run("UPDATE group_members SET role='owner' WHERE group_id=? AND user_key=?",gid,target);run('UPDATE groups SET owner_key=? WHERE id=?',target,gid);audit(gid,key,'owner_transfer',target,'Propriedade transferida')});
 }
 else if(action==='kick'){
  const target=String(b.target||'');canAct(target,2);const g=one('SELECT space FROM groups WHERE id=?',gid);transaction(()=>{run('DELETE FROM group_members WHERE group_id=? AND user_key=?',gid,target);run('DELETE FROM peers WHERE user_key=? AND room LIKE ?',target,g.space+'-%');audit(gid,key,'member_kick',target,clean(b.reason,160))});
 }
 else if(action==='ban'){
  const target=String(b.target||'');const {t}=canAct(target,3);const g=one('SELECT space FROM groups WHERE id=?',gid);transaction(()=>{run('INSERT OR REPLACE INTO group_bans(group_id,user_key,name,banned_by,reason,created) VALUES(?,?,?,?,?,?)',gid,target,t.name,key,clean(b.reason,160),now);run('DELETE FROM group_members WHERE group_id=? AND user_key=?',gid,target);run('DELETE FROM peers WHERE user_key=? AND room LIKE ?',target,g.space+'-%');audit(gid,key,'member_ban',target,clean(b.reason,160))});
 }
 else if(action==='unban'){
  manager();const target=String(b.target||'');if(!one('SELECT 1 FROM group_bans WHERE group_id=? AND user_key=?',gid,target))fail('Banimento não encontrado.',404);run('DELETE FROM group_bans WHERE group_id=? AND user_key=?',gid,target);audit(gid,key,'member_unban',target);
 }
 else if(action==='timeout'){
  const target=String(b.target||'');canAct(target,2);const minutes=Math.max(0,Math.min(40320,Number(b.minutes)||0)),until=minutes?now+minutes*60000:0;run('UPDATE group_members SET timeout_until=? WHERE group_id=? AND user_key=?',until,gid,target);audit(gid,key,minutes?'member_timeout':'timeout_clear',target,minutes?minutes+' min':'');
 }
 else if(action==='channelCreate'){
  manager();if(!['text','voice'].includes(b.kind))fail('Tipo de canal inválido.');if(one('SELECT count(*) n FROM channels WHERE group_id=?',gid).n>=50)fail('Limite de 50 canais por servidor.');
  cid=randomUUID();const pos=Number(one('SELECT COALESCE(max(position),-1)+1 n FROM channels WHERE group_id=?',gid).n)||0;run('INSERT INTO channels(id,group_id,name,kind,room_key,position,topic,slowmode) VALUES(?,?,?,?,?,?,?,?)',cid,gid,name(b.name),b.kind,one('SELECT space FROM groups WHERE id=?',gid).space+'-'+cid,pos,clean(b.topic,160),Math.max(0,Math.min(21600,Number(b.slowmode)||0)));audit(gid,key,'channel_create','',name(b.name));
 }
 else if(action==='channelRename'){manager();channel();const n=name(b.name);run('UPDATE channels SET name=? WHERE id=?',n,cid);audit(gid,key,'channel_rename','',n)}
 else if(action==='channelEdit'){
  manager();channel();const n=name(b.name),topic=clean(b.topic,160),slow=Math.max(0,Math.min(21600,Number(b.slowmode)||0));run('UPDATE channels SET name=?,topic=?,slowmode=? WHERE id=?',n,topic,slow,cid);audit(gid,key,'channel_update','',n+' · slowmode '+slow+'s');
 }
 else if(action==='channelDelete'){
  manager();const c=channel();transaction(()=>{run('DELETE FROM reactions WHERE message_id IN (SELECT id FROM channel_messages WHERE channel_id=?)',cid);run('DELETE FROM channel_messages WHERE channel_id=?',cid);run('DELETE FROM typing WHERE channel_id=?',cid);run('DELETE FROM peers WHERE room=?',c.room_key);run('DELETE FROM signals WHERE room=?',c.room_key);run('DELETE FROM channels WHERE id=?',cid);audit(gid,key,'channel_delete','',c.name)});cid='';
 }
 else if(action==='profile'){
  const avatar=String(b.avatar||'');if(avatar&&(avatar.length>24000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)))fail('Avatar inválido.');
  if(!['online','away','busy'].includes(b.presence))fail('Presença inválida.');
  run('UPDATE profiles SET name=?,avatar=?,status=?,presence=? WHERE user_key=?',name(b.name).slice(0,30),avatar,clean(b.status,100),b.presence,key);run('UPDATE group_members SET name=? WHERE user_key=?',name(b.name).slice(0,30),key);
 }
 else if(action==='message'){
  const c=channel(),mbr=activeMember(gid,key);if(Number(c.slowmode)>0&&rank[mbr.role]<2){const last=one('SELECT created FROM channel_messages WHERE channel_id=? AND user_key=? ORDER BY id DESC LIMIT 1',cid,key);const wait=last?Number(c.slowmode)*1000-(now-Number(last.created)):0;if(wait>0)fail('Modo lento ativo. Aguarde '+Math.ceil(wait/1000)+'s.',429)}
  const a=attachment(b.attachmentId,key),text=message(b.message,!!a),reply=Number(b.replyId)||null;if(reply&&!one('SELECT id FROM channel_messages WHERE id=? AND channel_id=?',reply,cid))fail('Resposta fora deste canal.');
  transaction(()=>{const r=run('INSERT OR IGNORE INTO channel_messages(channel_id,user_key,name,body,created,reply_id,nonce,attachment_id,attachment_name,attachment_type,attachment_size) VALUES(?,?,?,?,?,?,?,?,?,?,?)',cid,key,u.name,text,now,reply,clean(b.nonce,80)||randomUUID(),a?.id||null,a?.name||'',a?.mime||'',a?.size||0);if(a&&Number(r.changes))run('UPDATE attachments SET used=1 WHERE id=?',a.id)});run('DELETE FROM typing WHERE channel_id=? AND user_key=?',cid,key);
 }
 else if(['editMessage','deleteMessage','react','pin'].includes(action)){
  channel();const m=one('SELECT * FROM channel_messages WHERE id=? AND channel_id=?',Number(b.messageId)||0,cid);if(!m)fail('Mensagem não encontrada.',404);
  if(action==='editMessage'){if(m.user_key!==key)fail('Você só pode editar suas mensagens.',403);run('UPDATE channel_messages SET body=?,edited=? WHERE id=?',message(b.message,!!m.attachment_id),now,m.id)}
  if(action==='deleteMessage'){if(m.user_key!==key)moderator();transaction(()=>{run('DELETE FROM reactions WHERE message_id=?',m.id);run('UPDATE channel_messages SET reply_id=NULL WHERE reply_id=?',m.id);run('DELETE FROM channel_messages WHERE id=?',m.id)})}
  if(action==='pin'){moderator();run('UPDATE channel_messages SET pinned=? WHERE id=?',m.pinned?0:1,m.id)}
  if(action==='react'){if(!['👍','❤️','🔥','😂','✅'].includes(b.emoji))fail('Reação inválida.');if(one('SELECT 1 FROM reactions WHERE message_id=? AND user_key=? AND emoji=?',m.id,key,b.emoji))run('DELETE FROM reactions WHERE message_id=? AND user_key=? AND emoji=?',m.id,key,b.emoji);else run('INSERT INTO reactions VALUES(?,?,?)',m.id,key,b.emoji)}
 }
 else if(action==='typing'){channel();activeMember(gid,key);run('INSERT OR REPLACE INTO typing VALUES(?,?,?)',cid,key,now)}
 else if(action==='dmSend'){
  const target=String(b.target||'');if(target===key||!one('SELECT 1 FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=? AND b.user_key=?',key,target))fail('A DM exige um servidor em comum.',403);
  const a=attachment(b.attachmentId,key),text=message(b.message,!!a);transaction(()=>{const r=run('INSERT OR IGNORE INTO direct_messages(sender,recipient,body,created,nonce,attachment_id,attachment_name,attachment_type,attachment_size) VALUES(?,?,?,?,?,?,?,?,?)',key,target,text,now,clean(b.nonce,80)||randomUUID(),a?.id||null,a?.name||'',a?.mime||'',a?.size||0);if(a&&Number(r.changes))run('UPDATE attachments SET used=1 WHERE id=?',a.id)});
 }
 else if(action!=='poll')fail('Ação desconhecida.');

 const groups=all(`SELECT g.id,g.name,g.space,g.invite_code inviteCode,g.description,m.role,(SELECT count(*) FROM group_members WHERE group_id=g.id) memberCount FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_key=? ORDER BY g.created`,key);
 if(!groups.some(g=>g.id===gid)){gid=groups[0]?.id||'';cid=''}
 const channels=gid?all('SELECT id,name,kind,room_key roomKey,topic,slowmode FROM channels WHERE group_id=? ORDER BY position,id',gid):[];
 if(!channels.some(c=>c.id===cid))cid=channels[0]?.id||'';
 const members=gid?all(`SELECT m.user_key userKey,COALESCE(p.name,m.name) name,m.role,m.timeout_until timeoutUntil,COALESCE(p.avatar,'') avatar,COALESCE(p.status,'') status,CASE WHEN p.seen>? THEN p.presence ELSE 'offline' END presence FROM group_members m LEFT JOIN profiles p ON p.user_key=m.user_key WHERE m.group_id=? ORDER BY CASE m.role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC,m.joined`,now-35000,gid):[];
 const before=Math.max(0,Number(b.before)||0);
 const rows=cid?all(`SELECT * FROM channel_messages WHERE channel_id=? AND (?=0 OR id<?) ORDER BY id DESC LIMIT 80`,cid,before,before).reverse():[];
 const pinnedRows=cid?all('SELECT * FROM channel_messages WHERE channel_id=? AND pinned=1 ORDER BY id DESC LIMIT 100',cid):[];
 const pinned=decorateRows(pinnedRows,cid,key),messages=decorateRows(rows,cid,key);
 const typing=cid?all('SELECT p.name FROM typing t JOIN profiles p ON p.user_key=t.user_key WHERE t.channel_id=? AND t.seen>? AND t.user_key<>?',cid,now-5000,key):[];
 const target=String(b.dmTarget||b.target||'');let dms=[];
 const dmAllowed=target!==key&&!!one('SELECT 1 FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_key=? AND b.user_key=?',key,target);
 if(target&&dmAllowed)dms=all('SELECT * FROM direct_messages WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND (?=0 OR id<?) ORDER BY id DESC LIMIT 80',key,target,target,key,before,before).reverse();
 const me=one('SELECT user_key userKey,name,avatar,status,presence FROM profiles WHERE user_key=?',key);
 let bans=[],auditLog=[];if(gid){const myRole=member(gid,key).role;if(rank[myRole]>=3){bans=all('SELECT user_key userKey,name,reason,created FROM group_bans WHERE group_id=? ORDER BY created DESC LIMIT 100',gid).map(x=>({...x,userKey:publicId(x.userKey)}));auditLog=all(`SELECT l.id,l.actor_key actorKey,l.target_key targetKey,l.action,l.details,l.created,COALESCE(pa.name,'Sistema') actorName,COALESCE(pt.name,b.name,'') targetName FROM moderation_log l LEFT JOIN profiles pa ON pa.user_key=l.actor_key LEFT JOIN profiles pt ON pt.user_key=l.target_key LEFT JOIN group_bans b ON b.group_id=l.group_id AND b.user_key=l.target_key WHERE l.group_id=? ORDER BY l.id DESC LIMIT 60`,gid).map(x=>({...x,actorKey:x.actorKey?publicId(x.actorKey):'',targetKey:x.targetKey?publicId(x.targetKey):''}))}}
 members.forEach(m=>m.userKey=publicId(m.userKey));me.userKey=publicId(me.userKey);dms=dms.map(m=>({...m,...mediaFields(m),sender:publicId(m.sender),recipient:publicId(m.recipient)}));
 return Response.json({groups,channels,members,messages,pinned,typing,dms,dmAllowed,bans,auditLog,me,activeGroupId:gid,activeChannelId:cid,hasOlder:rows.length===80},{headers:{'Cache-Control':'no-store'}});
 }catch(e){if(!e.status)console.error('Community:',e);return Response.json({error:e.status?e.message:'Não foi possível concluir a ação.'},{status:e.status||500})}}
