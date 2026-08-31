import fs from 'node:fs';

const apiPath='src/lib/api.ts';
let api=fs.readFileSync(apiPath,'utf8');
const exportFn=`\nexport async function opsDataRequest<T>(path: string, init: RequestInit = {}): Promise<T> {\n  return dataRequest<T>(path, init, false);\n}\n`;
if(!api.includes('export async function opsDataRequest')) api += exportFn;
fs.writeFileSync(apiPath,api);

const appPath='src/app/App.tsx';
let app=fs.readFileSync(appPath,'utf8');
const oldImport='import { TournalOps } from "./components/TournalOps";';
const newImport='import { TournalOpsWorkspace as TournalOps } from "./components/TournalOpsWorkspace";';
if(app.includes(oldImport)) app=app.replace(oldImport,newImport);
else if(!app.includes(newImport)) throw new Error('TournalOps import anchor not found');
fs.writeFileSync(appPath,app);
console.log('Persistent Tournal Ops workspace wired');
