import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');
const importAnchor='import { ROLE_PRESETS } from "./permissions";';
if (!s.includes(importAnchor)) throw new Error('permissions import anchor changed');
if (!s.includes('type Permission = "dashboard"')) throw new Error('local Permission alias missing');
s=s.replace(importAnchor, `${importAnchor}\nimport type { Permission } from "./types";`);
s=s.replace(/\ntype Permission = "dashboard"[^\n]+;\n/, '\n');
fs.writeFileSync(path,s);
