import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, Building2, ChevronRight, ClipboardCheck, LayoutDashboard, Search, Settings, ShieldCheck, Store, Users } from "lucide-react";

type BoutiqueLike = { id:string; nom:string; ville?:string; products?:unknown[]; invoices?:Array<{dateRaw?:string;date?:string}> };
type UserLike = { id:string; nom:string; phone?:string; isSuperAdmin?:boolean; assignments?:Array<{boutiqueId:string}> };
type View = "home"|"clients"|"work"|"activity"|"team"|"system";

const NAV:[View,string,React.ElementType][] = [
  ["home","Accueil",LayoutDashboard],["clients","Clients",Building2],["work","Travail",ClipboardCheck],
  ["activity","Activité",Activity],["team","Équipe",Users],["system","Système",Settings],
];
const fmtDate=(value?:string)=> value ? new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(value)) : "—";

export function TournalOps({ boutiques, users, onOpenBoutique, onSystem }:{
  boutiques:BoutiqueLike[]; users:UserLike[]; onOpenBoutique:(id:string)=>void; onSystem:()=>void;
}) {
  const [view,setView]=useState<View>("home");
  const [query,setQuery]=useState("");
  const rows=useMemo(()=>boutiques.map(b=>{
    const members=users.filter(u=>u.assignments?.some(a=>a.boutiqueId===b.id));
    const last=(b.invoices??[]).map(i=>i.dateRaw??i.date??"").filter(Boolean).sort().at(-1);
    const setup=(b.products?.length??0)>0;
    const score=Math.min(100,35+(setup?25:0)+(members.length?20:0)+(last?20:0));
    return {...b,members,last,setup,score};
  }),[boutiques,users]);
  const attention=rows.filter(b=>!b.setup||!b.last||b.members.length===0);
  const filtered=rows.filter(b=>(b.nom+" "+(b.ville??"")+" "+b.members.map(m=>m.nom+" "+(m.phone??"")).join(" ")).toLowerCase().includes(query.toLowerCase()));

  return <div className="min-h-screen bg-[#f6f7f9] text-slate-900 pb-24" data-screen-source="tournal-ops">
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-slate-950 text-white flex items-center justify-center font-black">T</div>
        <div className="flex-1"><p className="font-black leading-none">Tournal Ops</p><p className="text-[11px] text-slate-500 mt-1">Customer Operations Control Center</p></div>
        <span className="hidden sm:flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-bold"><ShieldCheck size={13}/> SuperAdmin</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl p-4 space-y-4">
      <div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher boutique, utilisateur, téléphone…" className="w-full rounded-2xl border bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-slate-300"/></div>
      <nav className="flex gap-2 overflow-x-auto pb-1">{NAV.map(([id,label,Icon])=><button key={id} onClick={()=>setView(id)} className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black ${view===id?"bg-slate-950 text-white":"bg-white border text-slate-600"}`}><Icon size={14}/>{label}</button>)}</nav>

      {view==="home"&&<>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">{[["Boutiques",rows.length],["Utilisateurs",users.filter(u=>!u.isSuperAdmin).length],["À traiter",attention.length],["Configurées",rows.filter(b=>b.setup).length]].map(([label,value])=><div key={String(label)} className="rounded-2xl bg-white border p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}</section>
        <section className="rounded-3xl bg-white border overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div><p className="font-black">À traiter</p><p className="text-xs text-slate-500">Priorités détectées depuis l’état réel des boutiques</p></div><AlertTriangle className="text-amber-500" size={20}/></div>{attention.length===0?<p className="p-5 text-sm text-slate-500">Aucune anomalie d’onboarding détectée.</p>:attention.slice(0,8).map(b=><button key={b.id} onClick={()=>onOpenBoutique(b.id)} className="w-full p-4 border-b last:border-0 text-left flex gap-3 items-center hover:bg-slate-50"><div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><Store size={17}/></div><div className="flex-1 min-w-0"><p className="font-bold truncate">{b.nom}</p><p className="text-xs text-slate-500">{!b.setup?"Catalogue à configurer":b.members.length===0?"Aucun utilisateur affecté":"Aucune activité de vente détectée"}</p></div><ChevronRight size={16}/></button>)}</section>
      </>}

      {view==="clients"&&<section className="space-y-2">{filtered.map(b=><button key={b.id} onClick={()=>onOpenBoutique(b.id)} className="w-full rounded-2xl bg-white border p-4 text-left"><div className="flex items-start gap-3"><div className="h-11 w-11 rounded-xl bg-slate-100 flex items-center justify-center"><Building2 size={19}/></div><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><p className="font-black truncate">{b.nom}</p><span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-black">{b.score}/100</span></div><p className="text-xs text-slate-500">{b.ville||"Ville non renseignée"} · {b.members.length} utilisateur(s)</p><div className="mt-2 flex gap-1.5 flex-wrap"><span className={`text-[10px] font-bold rounded-full px-2 py-1 ${b.setup?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{b.setup?"Catalogue ✓":"Catalogue à faire"}</span><span className="text-[10px] font-bold rounded-full px-2 py-1 bg-slate-100 text-slate-600">Dernière activité {fmtDate(b.last)}</span></div></div><ChevronRight size={16}/></div></button>)}</section>}

      {view==="work"&&<section className="rounded-3xl bg-white border p-4"><p className="font-black">File de travail commune</p><p className="text-xs text-slate-500 mt-1">Sales, Service et Support partagent la même priorité client.</p><div className="mt-4 space-y-2">{attention.map((b,i)=><button key={b.id} onClick={()=>onOpenBoutique(b.id)} className="w-full rounded-xl bg-slate-50 p-3 text-left flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${i<2?"bg-red-500":"bg-amber-400"}`}/><div className="flex-1"><p className="text-sm font-bold">{b.nom}</p><p className="text-xs text-slate-500">{!b.setup?"Service · finaliser l’onboarding":"Support / Success · vérifier l’adoption"}</p></div></button>)}</div></section>}

      {view==="activity"&&<section className="rounded-3xl bg-white border p-4"><p className="font-black">Timeline portefeuille</p><div className="mt-4 space-y-4">{rows.filter(b=>b.last).sort((a,b)=>String(b.last).localeCompare(String(a.last))).slice(0,15).map(b=><div key={b.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500"/><div><p className="text-sm font-bold">Activité détectée · {b.nom}</p><p className="text-xs text-slate-500">Dernière vente {fmtDate(b.last)}</p></div></div>)}</div></section>}

      {view==="team"&&<section className="rounded-3xl bg-white border overflow-hidden"><div className="p-4 border-b"><p className="font-black">Équipe & utilisateurs</p><p className="text-xs text-slate-500">Vue transversale des comptes et affectations.</p></div>{users.slice(0,40).map(u=><div key={u.id} className="p-3 border-b last:border-0 flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs">{u.nom?.slice(0,2).toUpperCase()}</div><div className="flex-1"><p className="text-sm font-bold">{u.nom}</p><p className="text-xs text-slate-500">{u.isSuperAdmin?"SuperAdmin":`${u.assignments?.length??0} boutique(s)`}</p></div></div>)}</section>}

      {view==="system"&&<section className="rounded-3xl bg-white border p-5"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-xl bg-red-50 text-red-700 flex items-center justify-center"><Settings size={20}/></div><div><p className="font-black">Administration système</p><p className="text-xs text-slate-500">Zone séparée des opérations clients.</p></div></div><button onClick={onSystem} className="mt-5 w-full rounded-xl bg-slate-950 text-white py-3 text-sm font-black">Ouvrir l’administration technique</button></section>}
    </main>
  </div>;
}
