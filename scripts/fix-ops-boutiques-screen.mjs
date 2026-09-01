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
  ],
  [
    'style={{ background:b.color+"22", color:b.color, fontFamily:"\'Nunito\', sans-serif" }}>{b.logo?<img src={b.logo} alt={b.nom} className="w-full h-full object-contain p-1"/>:b.initials}',
    'style={{ background:(b.color??"#64748b")+"22", color:b.color??"#64748b", fontFamily:"\'Nunito\', sans-serif" }}>{b.logo?<img src={b.logo} alt={b.nom} className="w-full h-full object-contain p-1"/>:(b.initials??(b.nom??"?").slice(0,2).toUpperCase())}'
  ]
];
for (const [oldText,newText] of replacements) {
  if(!s.includes(oldText)) throw new Error('target not found: '+oldText.slice(0,80));
  s=s.replace(oldText,newText);
}
fs.writeFileSync(path,s);
