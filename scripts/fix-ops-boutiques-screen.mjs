import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');
const oldText=`  function handleEnterBoutiqueAsAdmin(b: Boutique) {
    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true, encaissement_vente:true, annulation_commande:true, decaissement:true, transferts:true } };
    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assign); setTab("dashboard"); setBusinessLoading(true);
    void loadAuthSettings(b.id);
    if (currentUser) saveSession(currentUser.id, b.id, assign);
    setTimeout(()=>{ void (async()=>{
      const ok=await hydrateBoutique(b.id);
      if(ok){ setScreen("app"); return; }
      activeBoutiqueIdRef.current=null;
      setActiveBoutiqueId(null);
      setActiveAssign(null);
      if(currentUser) saveSession(currentUser.id,null,null);
      setScreen("superadmin");
    })(); },0);
  }`;
const newText=`  function handleEnterBoutiqueAsAdmin(b: Boutique) {
    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true, encaissement_vente:true, annulation_commande:true, decaissement:true, transferts:true } };
    // Keep the Ops/System screen mounted while the full business snapshot is loading.
    // Setting activeBoutiqueId before hydration lets app-level hooks observe the light
    // Ops shell as if it were a full boutique, which can trigger a blank render.
    setBusinessLoading(true);
    void loadAuthSettings(b.id);
    setTimeout(()=>{ void (async()=>{
      const ok=await hydrateBoutique(b.id);
      if(!ok){
        activeBoutiqueIdRef.current=null;
        setActiveBoutiqueId(null);
        setActiveAssign(null);
        if(currentUser) saveSession(currentUser.id,null,null);
        setScreen("superadmin");
        return;
      }
      activeBoutiqueIdRef.current=b.id;
      setActiveBoutiqueId(b.id);
      setActiveAssign(assign);
      setTab("dashboard");
      if(currentUser) saveSession(currentUser.id,b.id,assign);
      setScreen("app");
    })(); },0);
  }`;
if(!s.includes(oldText)) throw new Error('current admin boutique entry block not found');
s=s.replace(oldText,newText);
fs.writeFileSync(path,s);
// run-deferred-activation
