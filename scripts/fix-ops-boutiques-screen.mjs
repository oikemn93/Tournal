import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');
const oldHydrate=`  const hydrateBoutique = useCallback(async (boutiqueId: string) => {
    setBusinessLoading(true);
    setAppSessionReady(false);
    try {
      // All writes and protected reads require this short-lived application
      // session. Starting it once here removes the former race with the
      // notifications effect and with the first user action.
      const appSession = await startAppSession(boutiqueId);`;
const newHydrate=`  const hydrateBoutique = useCallback(async (boutiqueId: string): Promise<boolean> => {
    setBusinessLoading(true);
    setAppSessionReady(false);
    try {
      // All writes and protected reads require this short-lived application
      // session. Starting it once here removes the former race with the
      // notifications effect and with the first user action.
      const appSession = await startAppSession(boutiqueId);`;
if(!s.includes(oldHydrate)) throw new Error('hydrate signature target not found');
s=s.replace(oldHydrate,newHydrate);
const oldSnapshot=`      const remoteB = await loadBoutiqueSnapshot<Boutique[]>(boutiqueId);
      if (remoteB?.[0]) {
        const hydrated = remoteB[0];
        lastRemoteB.current = JSON.stringify(remoteB);
        setBoutiques(prev => prev.some(b=>b.id===boutiqueId)
          ? prev.map(b=>b.id===boutiqueId?hydrated:b)
          : [...prev, hydrated]);
      }
      setLastSyncAt(Date.now());
      setAppSessionReady(true);`;
const newSnapshot=`      const remoteB = await loadBoutiqueSnapshot<Boutique[]>(boutiqueId);
      if (!remoteB?.[0]) throw new Error("Snapshot boutique introuvable");
      const hydrated = remoteB[0];
      lastRemoteB.current = JSON.stringify(remoteB);
      setBoutiques(prev => prev.some(b=>b.id===boutiqueId)
        ? prev.map(b=>b.id===boutiqueId?hydrated:b)
        : [...prev, hydrated]);
      setLastSyncAt(Date.now());
      setAppSessionReady(true);`;
if(!s.includes(oldSnapshot)) throw new Error('snapshot target not found');
s=s.replace(oldSnapshot,newSnapshot);
const oldCatch=`    } catch (error) {
      setBackendOk(false);
      toast.error("Données boutique indisponibles : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
    } finally {
      setBusinessLoading(false);
    }
  }, []);`;
const newCatch=`      return true;
    } catch (error) {
      setBackendOk(false);
      toast.error("Données boutique indisponibles : " + (error instanceof Error ? error.message : String(error)), { duration:8000 });
      return false;
    } finally {
      setBusinessLoading(false);
    }
  }, []);`;
if(!s.includes(oldCatch)) throw new Error('hydrate return target not found');
s=s.replace(oldCatch,newCatch);
const oldEnter=`  function handleEnterBoutiqueAsAdmin(b: Boutique) {
    const assign: BoutiqueAssignment = { boutiqueId:b.id, role:"Propriétaire", droits:{ dashboard:true, stock:true, fournisseurs:true, clients:true, factures:true, remboursement:true, charges:true, compta:true, vente:true, inventaire:true, marges:true, encaissement_vente:true, annulation_commande:true, decaissement:true, transferts:true } };
    activeBoutiqueIdRef.current=b.id; setActiveBoutiqueId(b.id); setActiveAssign(assign); setTab("dashboard"); setBusinessLoading(true); setScreen("app");
    void loadAuthSettings(b.id);
    setTimeout(()=>{ void hydrateBoutique(b.id); },0);
    if (currentUser) saveSession(currentUser.id, b.id, assign);
  }`;
const newEnter=`  function handleEnterBoutiqueAsAdmin(b: Boutique) {
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
if(!s.includes(oldEnter)) throw new Error('admin enter target not found');
s=s.replace(oldEnter,newEnter);
fs.writeFileSync(path,s);
// run-shared-entry-repair
