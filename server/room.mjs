import { database } from './db.mjs';
const ID = /^[a-zA-Z0-9-]{36}$/;
const ROOM = /^[a-zA-Z0-9-]{32,100}$/;
const AVATAR = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function cleanName(value) {
    const name = String(value || 'Visitante').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 30);
    return name || 'Visitante';
}
function cleanAvatar(value) {
    if (!value)
        return '';
    const avatar = String(value);
    if (avatar.length > 24000 || !AVATAR.test(avatar))
        throw new Error('AVATAR_INVALID');
    return avatar;
}
function peerQuery() {
    return "SELECT id,name,CASE WHEN avatar<>'' THEN 1 ELSE 0 END AS hasAvatar,profile_version AS avatarVersion FROM peers WHERE room=? AND seen>?";
}
export async function POST(req) {
    try {
        if (req.headers.get('origin') !== new URL(req.url).origin)
            return Response.json({ error: 'Origem inválida' }, { status: 403 });
        const body = await req.text();
        if (body.length > 40000)
            return Response.json({ error: 'Dados muito grandes' }, { status: 413 });
        const { action, room, id, token, name, avatar, target, data, after } = JSON.parse(body);
        if (!ROOM.test(room || '') || !ID.test(id || '') || !ID.test(token || ''))
            return Response.json({ error: 'Sala inválida' }, { status: 400 });
        if (!['join', 'poll', 'leave', 'signal', 'profile', 'avatar'].includes(action))
            return Response.json({ error: 'Ação inválida' }, { status: 400 });
        const db = database(), now = Date.now();
        if (action === 'join') {
            const safeAvatar = cleanAvatar(avatar);
            const inserted = await db.prepare('INSERT INTO peers(id,room,token,name,avatar,profile_version,seen) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM peers WHERE room=? AND seen>?) < 10').bind(id, room, token, cleanName(name), safeAvatar, 1, now, room, now - 30000).run();
            if (!inserted.meta.changes)
                return Response.json({ error: 'Sala cheia. O limite é de 10 pessoas.' }, { status: 409 });
        }
        else {
            const p = await db.prepare('SELECT id FROM peers WHERE id=? AND room=? AND token=?').bind(id, room, token).first();
            if (!p)
                return Response.json({ error: 'Sua conexão expirou. Entre novamente.' }, { status: 401 });
            if (action === 'leave') {
                await db.prepare('DELETE FROM peers WHERE id=? AND token=?').bind(id, token).run();
                return Response.json({ ok: true });
            }
            if (action === 'signal') {
                if (!ID.test(target || '') || target === id || !data || JSON.stringify(data).length > 32000)
                    return Response.json({ error: 'Sinal inválido' }, { status: 400 });
                await db.prepare('UPDATE peers SET seen=? WHERE id=?').bind(now, id).run();
                await db.prepare('INSERT INTO signals(room,sender,target,data,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM peers WHERE id=? AND room=? AND seen>?)').bind(room, id, target, JSON.stringify(data), now, target, room, now - 30000).run();
                return Response.json({ ok: true });
            }
            if (action === 'avatar') {
                if (!ID.test(target || ''))
                    return Response.json({ error: 'Perfil inválido' }, { status: 400 });
                await db.prepare('UPDATE peers SET seen=? WHERE id=?').bind(now, id).run();
                const profile = await db.prepare('SELECT avatar,profile_version AS avatarVersion FROM peers WHERE id=? AND room=? AND seen>?').bind(target, room, now - 30000).first();
                if (!profile)
                    return Response.json({ error: 'Pessoa não encontrada na sala.' }, { status: 404 });
                return Response.json(profile, { headers: { 'Cache-Control': 'no-store' } });
            }
            if (action === 'profile') {
                const safeAvatar = cleanAvatar(avatar);
                await db.prepare('UPDATE peers SET name=?,avatar=?,profile_version=profile_version+1,seen=? WHERE id=? AND token=?').bind(cleanName(name), safeAvatar, now, id, token).run();
            }
            else {
                await db.prepare('UPDATE peers SET seen=? WHERE id=?').bind(now, id).run();
            }
        }
        const results = await db.batch([
            db.prepare(peerQuery()).bind(room, now - 30000),
            db.prepare('SELECT id,sender,data FROM signals WHERE room=? AND target=? AND id>? ORDER BY id LIMIT 100').bind(room, id, Number(after) || 0),
            db.prepare('DELETE FROM signals WHERE room=? AND created<?').bind(room, now - 120000),
            db.prepare('DELETE FROM peers WHERE room=? AND seen<?').bind(room, now - 120000),
        ]);
        return Response.json({ peers: results[0].results, signals: results[1].results }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'AVATAR_INVALID')
            return Response.json({ error: 'A foto de perfil é inválida ou ficou grande demais.' }, { status: 400 });
        return Response.json({ error: 'Não foi possível conectar à sala. Tente novamente.' }, { status: 500 });
    }
}
