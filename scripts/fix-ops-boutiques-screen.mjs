import fs from 'node:fs';
const path='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(path,'utf8');
const replacements=[
  [
    'const fmtDate=(value?:string|null)=>value?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"—";',
    'const fmtDate=(value?:string|null)=>{if(!value)return "—";const d=new Date(value);if(Number.isNaN(d.getTime()))return "—";try{return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d)}catch{return d.toLocaleString("fr-FR")}};'
  ],
  [
    'const selectedContacts=selectedAccount?workspace?.contacts.filter(contact=>contact.account_id===selectedAccount.id)??[]:[];',
    'const selectedContacts=selectedAccount?(workspace?.contacts??[]).filter(contact=>contact.account_id===selectedAccount.id):[];'
  ],
  [
    '{selected.ville||"Ville non renseignée"} · {selected.members.length} utilisateur(s)',
    '{selected.ville||"Ville non renseignée"} · {(selected.members??[]).length} utilisateur(s)'
  ],
  [
    'selected.members.length>0',
    '(selected.members??[]).length>0'
  ]
];
for(const [oldText,newText] of replacements){
  if(!s.includes(oldText)) throw new Error('target not found: '+oldText.slice(0,100));
  s=s.split(oldText).join(newText);
}
fs.writeFileSync(path,s);
