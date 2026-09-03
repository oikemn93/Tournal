import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');
const old=`  return <TournalOps
    boutiques={props.boutiques}
    users={props.platformUsers}
    canSystemAdmin={canSystemAdmin}
    canEnterBoutique={canSystemAdmin}
    opsRole={opsRole}
    onOpenBoutique={(boutiqueId)=>{ if (!canSystemAdmin) return; const boutique = props.boutiques.find(item=>item.id===boutiqueId); if (boutique) props.onEnterBoutique(boutique); }}`;
const neu=`  return <TournalOps
    boutiques={props.boutiques}
    users={props.platformUsers}
    canSystemAdmin={canSystemAdmin}
    canEnterBoutique={canSystemAdmin || Boolean(opsRole)}
    opsRole={opsRole}
    onOpenBoutique={(boutiqueId)=>{ if (!canSystemAdmin && !opsRole) return; const boutique = props.boutiques.find(item=>item.id===boutiqueId); if (boutique) props.onEnterBoutique(boutique); }}`;
if(!s.includes(old)) throw new Error('Ops entry anchor changed');
s=s.replace(old,neu);
fs.writeFileSync(path,s);
