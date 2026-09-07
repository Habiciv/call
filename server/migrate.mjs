import { randomUUID } from 'node:crypto';
export function migrateCommunity(db,backedUp=false) {
 db.exec(`CREATE TABLE IF NOT EXISTS app_migrations(version INTEGER PRIMARY KEY, applied INTEGER NOT NULL)`);
 if(db.prepare('SELECT version FROM app_migrations WHERE version=2').get())return;
 // VACUUM INTO takes a consistent backup, including committed WAL contents.
 const hasData=db.prepare('SELECT count(*) n FROM groups').get().n;
 if(hasData&&!backedUp)db.exec("VACUUM INTO '"+String(process.env.DATA_DIR||'./data').replaceAll("'","''")+"/before-community-"+Date.now()+".sqlite'");
 db.exec('BEGIN IMMEDIATE');
 try {
 db.exec(`
 CREATE TABLE profiles(user_key TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '', presence TEXT NOT NULL DEFAULT 'online', seen INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE channels(id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('text','voice')), room_key TEXT NOT NULL UNIQUE, position INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX channels_group ON channels(group_id,position);
 CREATE TABLE channel_messages(id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, user_key TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL, edited INTEGER, reply_id INTEGER, pinned INTEGER NOT NULL DEFAULT 0, nonce TEXT, UNIQUE(user_key,nonce));
 CREATE INDEX channel_messages_channel ON channel_messages(channel_id,id);
 CREATE TABLE reactions(message_id INTEGER NOT NULL, user_key TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY(message_id,user_key,emoji));
 CREATE TABLE typing(channel_id TEXT NOT NULL,user_key TEXT NOT NULL,seen INTEGER NOT NULL,PRIMARY KEY(channel_id,user_key));
 CREATE TABLE direct_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,sender TEXT NOT NULL,recipient TEXT NOT NULL,body TEXT NOT NULL,created INTEGER NOT NULL,nonce TEXT,UNIQUE(sender,nonce));
 CREATE INDEX dm_sender_recipient ON direct_messages(sender,recipient,id);
 CREATE INDEX dm_recipient_sender ON direct_messages(recipient,sender,id);
 ALTER TABLE peers ADD COLUMN user_key TEXT NOT NULL DEFAULT '';
 `);
 for(const g of db.prepare('SELECT * FROM groups').all()) {
  // Repair owner roles downgraded by the old INSERT OR REPLACE join endpoint.
  db.prepare("UPDATE group_members SET role='owner' WHERE group_id=? AND user_key=?").run(g.id,g.owner_key);
  const textId=randomUUID();
  db.prepare("INSERT INTO channels VALUES(?,?,?,'text',?,0)").run(textId,g.id,'geral',g.space+'-'+textId);
  db.prepare('INSERT INTO channel_messages(channel_id,user_key,name,body,created) SELECT ?,user_key,name,body,created FROM group_messages WHERE group_id=? ORDER BY id').run(textId,g.id);
  for(const [i,name] of ['Lounge','Jogatina','Foco'].entries()) {
   const id=randomUUID(),room=g.space+'-'+name;
   db.prepare("INSERT INTO channels VALUES(?,?,?,'voice',?,?)").run(id,g.id,name,room,i+1);
   // Keep legacy voice-room chat accessible from the voice channel's text pane.
   db.prepare('INSERT INTO channel_messages(channel_id,user_key,name,body,created) SELECT ?,sender,name,body,created FROM messages WHERE room=? ORDER BY id').run(id,room);
  }
 }
 db.prepare('INSERT INTO app_migrations VALUES(2,?)').run(Date.now());
 db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}
}

