import fs from 'node:fs';
const path='src/app/App.tsx';
let s=fs.readFileSync(path,'utf8');

const anchor='const useNotif = () => React.useContext(NotifCtx);';
if(!s.includes(anchor)) throw new Error('notification context anchor not found');
if(!s.includes('class BoutiqueAppErrorBoundary')) {
  s=s.replace(anchor, `${anchor}\n\nclass BoutiqueAppErrorBoundary extends React.Component<{onReset:()=>void;children:React.ReactNode},{error:Error|null}> {\n  state:{error:Error|null}={error:null};\n  static getDerivedStateFromError(error:Error){return {error};}\n  componentDidCatch(error:Error,info:React.ErrorInfo){console.error('Boutique app render crash',error,info);}\n  render(){\n    if(this.state.error){\n      return <div className=\"min-h-screen flex items-center justify-center px-5 bg-background text-foreground\"><div className=\"w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm\"><div className=\"w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4\"><AlertTriangle size={22}/></div><h1 className=\"text-xl font-black\">Ouverture de la boutique impossible</h1><p className=\"text-sm text-muted-foreground mt-2\">Une erreur de rendu a été interceptée au lieu d’afficher un écran blanc.</p><pre className=\"mt-4 whitespace-pre-wrap break-words rounded-2xl bg-red-50 p-3 text-xs text-red-800\">{this.state.error.message||String(this.state.error)}</pre><button type=\"button\" onClick={()=>{this.setState({error:null});this.props.onReset();}} className=\"mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white\">Retour à Tournal Ops</button></div></div>;\n    }\n    return this.props.children;\n  }\n}`);
}

const nullGuard='  if (!boutique||!currentUser||!activeAssign) return null;';
if(!s.includes(nullGuard)) throw new Error('blank null guard not found');
s=s.replace(nullGuard, `  if (!boutique||!currentUser||!activeAssign) {\n    const missing=[!boutique?\"boutique\":\"\",!currentUser?\"utilisateur\":\"\",!activeAssign?\"affectation\":\"\"].filter(Boolean).join(\", \" );\n    return <div className=\"min-h-screen flex items-center justify-center px-5 bg-background text-foreground\"><div className=\"w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm\"><div className=\"w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mb-4\"><AlertTriangle size={22}/></div><h1 className=\"text-xl font-black\">État boutique incomplet</h1><p className=\"text-sm text-muted-foreground mt-2\">Tournal a empêché l’écran blanc. Élément manquant : {missing||\"inconnu\"}.</p><button type=\"button\" onClick={()=>{activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen(\"superadmin\");}} className=\"mt-4 w-full rounded-2xl bg-slate-950 py-3 text-sm font-black text-white\">Retour à Tournal Ops</button></div></div>;\n  }`);

const returnStart='  return (\n    <NotifCtx.Provider value={sendNotif}>';
if(!s.includes(returnStart)) throw new Error('app return start not found');
s=s.replace(returnStart, `  return (\n    <BoutiqueAppErrorBoundary onReset={()=>{activeBoutiqueIdRef.current=null;setActiveBoutiqueId(null);setActiveAssign(null);if(currentUser)saveSession(currentUser.id,null,null);setScreen(\"superadmin\");}}>\n    <NotifCtx.Provider value={sendNotif}>`);

const returnEnd='  </NotifCtx.Provider>\n  );\n}';
if(!s.includes(returnEnd)) throw new Error('app return end not found');
s=s.replace(returnEnd, '  </NotifCtx.Provider>\n  </BoutiqueAppErrorBoundary>\n  );\n}');

fs.writeFileSync(path,s);
// run-crash-boundary
