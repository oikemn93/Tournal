import fs from 'node:fs';
const path='src/app/components/TournalOpsWorkspace.tsx';
let s=fs.readFileSync(path,'utf8');
const start=s.indexOf('  if(selected){const ob=selected.onboarding;return ');
const end=s.indexOf('\n\n  return <div className="min-h-screen bg-[#f6f7f9] text-slate-900 pb-24"',start);
if(start<0||end<0) throw new Error('selected detail block not found');
const block=`  if(selected){
    const ob=selected.onboarding;
    const members=selected.members??[];
    const openTasks=selected.openTasks??[];
    const openTickets=selected.openTickets??[];
    const account=selectedAccount??null;
    const lastActivity=selected.lastSale??selected.firstSale??null;
    return <div className="min-h-screen bg-[#f6f7f9] text-slate-900 pb-10" data-screen-source="tournal-ops-boutique-detail">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={()=>setSelectedId(null)} className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center" aria-label="Retour aux clients"><ArrowLeft size={18}/></button>
          <div className="min-w-0 flex-1"><p className="font-black truncate">{selected.nom||"Boutique"}</p><p className="text-[11px] text-slate-500 truncate">{selected.ville||"Ville non renseignée"}</p></div>
          {canEnterBoutique&&<button type="button" onClick={()=>onOpenBoutique(selected.id)} className="rounded-xl bg-slate-950 text-white px-3 py-2 text-xs font-black">Ouvrir</button>}
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4 space-y-4">
        {error&&<div className="rounded-xl bg-red-50 text-red-700 px-3 py-2 text-xs font-bold">{error}</div>}
        <section className="rounded-3xl bg-white border p-5">
          <div className="flex items-start gap-3"><div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-950 text-white flex items-center justify-center"><Building2 size={21}/></div><div className="min-w-0 flex-1"><h1 className="text-xl font-black break-words">{selected.nom||"Boutique"}</h1><p className="text-sm text-slate-500 mt-1">{selected.ville||"Ville non renseignée"} · {members.length} utilisateur(s)</p></div><span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-black whitespace-nowrap">Santé {Number.isFinite(selected.score)?selected.score:0}/100</span></div>
          <div className="mt-5"><div className="flex justify-between text-xs font-bold"><span>Onboarding</span><span>{Number.isFinite(selected.progress)?selected.progress:0}%</span></div><div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{width:\`\${Math.max(0,Math.min(100,Number.isFinite(selected.progress)?selected.progress:0))}%\`}}/></div></div>
        </section>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-white border p-4"><p className="text-xs text-slate-500 font-bold">Utilisateurs</p><p className="text-2xl font-black mt-1">{members.length}</p></div>
          <div className="rounded-2xl bg-white border p-4"><p className="text-xs text-slate-500 font-bold">Produits</p><p className="text-2xl font-black mt-1">{workspace?.overview.find(x=>x.boutique_id===selected.id)?.product_count??selected.products?.length??0}</p></div>
          <div className="rounded-2xl bg-white border p-4"><p className="text-xs text-slate-500 font-bold">Tâches ouvertes</p><p className="text-2xl font-black mt-1">{openTasks.length}</p></div>
          <div className="rounded-2xl bg-white border p-4"><p className="text-xs text-slate-500 font-bold">Tickets ouverts</p><p className="text-2xl font-black mt-1">{openTickets.length}</p></div>
        </section>
        <section className="rounded-2xl bg-white border p-4"><p className="font-black text-sm">Compte client</p>{account?<div className="mt-3 grid sm:grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-500 font-black">Organisation</p><p className="font-black mt-1 break-words">{account.name||"—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-500 font-black">Étape</p><p className="font-black mt-1">{account.stage||"—"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] uppercase text-slate-500 font-black">Santé</p><p className="font-black mt-1">{account.health_status||"unknown"}</p></div></div>:<p className="mt-2 text-sm text-slate-500">Aucun compte client lié.</p>}</section>
        <section className="grid md:grid-cols-2 gap-3"><div className="rounded-2xl bg-white border p-4"><p className="font-black text-sm">Checklist</p><div className="mt-3 space-y-2">{[["Propriétaire affecté",Boolean(selected.ownerReady)],["Utilisateurs créés",members.length>0],["Catalogue configuré",Boolean(selected.setup)],["Première réception",Boolean(selected.firstReceipt||ob?.first_receipt_at)],["Première vente",Boolean(selected.firstSale||ob?.first_sale_at)],["Formation terminée",Boolean(ob?.training_done)]].map(([label,ok])=><div key={String(label)} className="flex items-center gap-2 text-sm"><CheckCircle2 size={16} className={ok?"text-emerald-600":"text-slate-300"}/><span className={ok?"font-semibold":"text-slate-500"}>{String(label)}</span></div>)}</div></div><div className="rounded-2xl bg-white border p-4"><p className="font-black text-sm">Dernière activité connue</p><p className="text-sm font-bold mt-3">{fmtDate(lastActivity)}</p><p className="text-xs text-slate-500 mt-1">La fiche Ops reste légère : aucune donnée financière n’est chargée ici.</p></div></section>
        <section className="rounded-2xl bg-white border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black text-sm">Travail lié</p><p className="text-xs text-slate-500 mt-0.5">Tâches et tickets ouverts pour cette boutique</p></div><button type="button" onClick={()=>{setSelectedId(null);setView("work")}} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">Ouvrir Travail</button></div><div className="mt-3 space-y-2">{openTasks.slice(0,4).map(t=><div key={t.id} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold">{t.title||"Tâche"}</p><p className="text-xs text-slate-500 mt-1">{teamLabel[t.team]??t.team} · {t.due_at?fmtDate(t.due_at):"sans échéance"}</p></div>)}{openTickets.slice(0,4).map(t=><div key={\`ticket-\${t.id}\`} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-bold">#{t.id} · {t.subject||"Ticket"}</p><p className="text-xs text-slate-500 mt-1">{priorityLabel[t.priority]??t.priority}</p></div>)}{openTasks.length===0&&openTickets.length===0&&<p className="text-sm text-slate-500">Aucune tâche ni ticket ouvert.</p>}</div></section>
      </main>
    </div>;
  }`;
s=s.slice(0,start)+block+s.slice(end);
fs.writeFileSync(path,s);
