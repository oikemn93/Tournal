import fs from 'node:fs';
const app=fs.readFileSync('src/app/App.tsx','utf8');
const types=fs.readFileSync('src/app/types.ts','utf8');
if (!types.includes('export type Permission')) throw new Error('canonical Permission export missing');
if (!app.includes('import type { Permission } from "./types";')) throw new Error('App must import canonical Permission');
if (/\ntype Permission\s*=/.test(app)) throw new Error('App must not redefine Permission locally');
console.log('permission_type_contract_ok');
