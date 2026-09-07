import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const dir=process.env.DATA_DIR||'./data';
const db=new DatabaseSync(resolve(dir,'voz.sqlite'),{readOnly:true});
const target=resolve(dir,'backup-'+Date.now()+'.sqlite');
try{db.exec("VACUUM INTO '"+target.replaceAll("'","''")+"'");console.log(target)}finally{db.close()}
