import ts from 'typescript';
import { readFileSync,writeFileSync } from 'node:fs';
const source=readFileSync(new URL('./room.ts',import.meta.url),'utf8').replace("@/db/raw","./db.mjs");
writeFileSync(new URL('./room.mjs',import.meta.url),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
