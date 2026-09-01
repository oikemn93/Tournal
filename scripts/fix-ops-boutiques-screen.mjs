import fs from 'node:fs';
const path='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(path,'utf8');
const old='const filtered=rows.filter(b=>{const link=workspace?.accountBoutiques.find(x=>x.boutique_id===b.id);const account=link?workspace?.accounts.find(a=>a.id===link.account_id):null;return (b.nom+" "+(b.ville??"")+" "+(b.tel??"")+" "+(account?.name??"")+" "+b.members.map(m=>m.nom+" "+(m.phone??"")).join(" ")).toLowerCase().includes(query.toLowerCase())});';
const neu='const normalizedQuery=query.trim().toLowerCase();\n  const filtered=rows.filter(b=>{\n    const link=workspace?.accountBoutiques.find(x=>x.boutique_id===b.id);\n    const account=link?workspace?.accounts.find(a=>a.id===link.account_id):null;\n    const memberText=(b.members??[]).map(m=>(m?.nom??"")+" "+(m?.phone??"")).join(" ");\n    const searchable=[b.nom,b.ville,b.tel,account?.name,memberText].filter(Boolean).join(" ").toLowerCase();\n    return !normalizedQuery||searchable.includes(normalizedQuery);\n  });';
if(!s.includes(old)) throw new Error('filtered rows target not found');
s=s.replace(old,neu);
fs.writeFileSync(path,s);
