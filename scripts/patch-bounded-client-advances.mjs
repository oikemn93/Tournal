import fs from 'node:fs';

const apiPath='src/lib/api.ts';
let api=fs.readFileSync(apiPath,'utf8');

const oldAdvance='(options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(`client_advances?select=*${scoped()}&order=paid_at.desc,id.desc`)),';
const newAdvance='(options.historyOnly ? Promise.resolve([]) : dataRequest<any[]>(`client_advances?select=*${scoped()}&or=(paid_at.gte.${historyFromFilter},allocated_amount.lt.amount)&order=paid_at.desc,id.desc`)),';
if(!api.includes(oldAdvance)) throw new Error('client advances bootstrap anchor missing');
api=api.replace(oldAdvance,newAdvance);
fs.writeFileSync(apiPath,api);

const checkPath='scripts/check-bounded-realtime-invariants.mjs';
let check=fs.readFileSync(checkPath,'utf8');
const marker='if(!snapshot.includes("entry_date=gte.${historyFromFilter}")) throw new Error("Bootstrap stock must remain date bounded");';
if(!check.includes(marker)) throw new Error('invariant anchor missing');
const extra=`${marker}\nif(!snapshot.includes('client_advances?select=*\${scoped()}&or=(paid_at.gte.\${historyFromFilter},allocated_amount.lt.amount)')) throw new Error("Bootstrap client advances must keep only recent rows or remaining credit");\nif(snapshot.includes('client_advances?select=*\${scoped()}&order=paid_at.desc,id.desc')) throw new Error("Bootstrap client advances must not load the full ledger");`;
check=check.replace(marker,extra);
fs.writeFileSync(checkPath,check);
