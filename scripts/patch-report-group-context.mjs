import fs from "node:fs";
const path="src/app/App.tsx";let s=fs.readFileSync(path,"utf8");
const from='<RelationalComptabiliteView boutique={boutique} canSeeMargin={canSeeMargin}/>';
const to='<RelationalComptabiliteView boutique={boutique} canSeeMargin={canSeeMargin} comparisonBoutiques={(currentUser?.isCompteMere && currentUser?.groupeId) ? [boutique,...getSiblings(boutique.id,boutiques,platformUsers,groupes)] : []}/>';
if(!s.includes(from))throw new Error("Rapport invocation anchor missing");
s=s.replace(from,to);fs.writeFileSync(path,s);
