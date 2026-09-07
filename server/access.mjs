import { authenticate,one,member,fail,run } from './community.mjs';
export function authorizeRoom(req,room){
 const c=one('SELECT * FROM channels WHERE room_key=?',room);
 if(!c){if(process.env.ALLOW_LEGACY_ROOMS==='1')return null;fail('Canal de voz não encontrado.',404)}
 if(c.kind!=='voice')fail('Este canal não é de voz.',403);
 const u=authenticate(req);member(c.group_id,u.user_key);return u;
}
export function authorizePresence(req){
 const g=one('SELECT id FROM groups WHERE space=?',new URL(req.url).searchParams.get('space')||'');
 if(!g){if(process.env.ALLOW_LEGACY_ROOMS==='1')return;fail('Servidor não encontrado.',404)}
 member(g.id,authenticate(req).user_key);
}
