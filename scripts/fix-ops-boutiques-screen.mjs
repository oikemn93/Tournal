import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');
const replacements=[
  [
    'const filteredBoutiques = boutiques.filter(b=>b.nom.toLowerCase().includes(bSearch.toLowerCase())||b.ville.toLowerCase().includes(bSearch.toLowerCase()));',
    'const filteredBoutiques = boutiques.filter(b=>(b.nom??"").toLowerCase().includes(bSearch.toLowerCase())||(b.ville??"").toLowerCase().includes(bSearch.toLowerCase()));'
  ],
  [
    '<p className="text-xs text-muted-foreground mt-0.5">{uc} user{uc>1?"s":""} · {b.products.length} produits</p>',
    '<p className="text-xs text-muted-foreground mt-0.5">{uc} user{uc>1?"s":""} · {b.products?.length??0} produits</p>'
  ]
];
for (const [oldText,newText] of replacements) {
  if(!s.includes(oldText)) throw new Error('target not found: '+oldText.slice(0,80));
  s=s.replace(oldText,newText);
}
fs.writeFileSync(path,s);
// trigger-2
