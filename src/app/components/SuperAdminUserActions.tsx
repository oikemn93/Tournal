import React, { useState } from "react";
import { Activity, Ban, Edit2, Loader2, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { deleteAdminUser, getAdminUserDebug, setAdminUserSuspended, updateAdminUser } from "../../lib/api";

type Assignment = { boutiqueId:string; role:string; droits?:Record<string,boolean> };
type UserLike = {
  id:string; nom:string; phone:string; initials:string; color:string;
  isSuspended?:boolean; suspensionReason?:string; assignments:Assignment[];
};
type BoutiqueLike = { id:string; nom:string; ville:string };
type DebugData = {
  user:{ id:string; nom:string; phone:string; isSuspended:boolean; suspensionReason?:string|null };
  auth:{ createdAt?:string|null; lastSignInAt?:string|null; bannedUntil?:string|null; email?:string|null };
  assignments:Array<{ boutique_id:string; role:string; droits?:Record<string,boolean>; boutiques?:{nom?:string;ville?:string}|null }>;
};

function dt(value?:string|null) {
  if (!value) return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?value:d.toLocaleString("fr-FR");
}

export function SuperAdminUserActions({ user, boutiques, onChanged }: { user:UserLike; boutiques:BoutiqueLike[]; onChanged:()=>void }) {
  const [busy,setBusy]=useState(false);
  const [debug,setDebug]=useState<DebugData|null>(null);

  async function editIdentity() {
    const nom=window.prompt("Nom complet",user.nom)?.trim();
    if (!nom) return;
    const phone=window.prompt("Numéro de téléphone",user.phone)?.trim();
    if (!phone) return;
    setBusy(true);
    try { await updateAdminUser({userId:user.id,fullName:nom,phone}); toast.success("Compte modifié"); onChanged(); }
    catch(e){ toast.error(e instanceof Error?e.message:"Modification impossible"); }
    finally{setBusy(false);}
  }

  async function toggleSuspension() {
    if (user.isSuspended) {
      if (!window.confirm(`Réactiver le compte de ${user.nom} ?`)) return;
      setBusy(true);
      try { await setAdminUserSuspended({userId:user.id,suspended:false}); toast.success("Compte réactivé"); onChanged(); }
      catch(e){ toast.error(e instanceof Error?e.message:"Réactivation impossible"); }
      finally{setBusy(false);}
      return;
    }
    const reason=window.prompt("Motif de la restriction (visible au support)","Restriction par le superadmin")?.trim();
    if (reason==null) return;
    if (!window.confirm(`Suspendre ${user.nom} ? Le compte ne pourra plus travailler dans les boutiques.`)) return;
    setBusy(true);
    try { await setAdminUserSuspended({userId:user.id,suspended:true,reason}); toast.success("Compte suspendu"); onChanged(); }
    catch(e){ toast.error(e instanceof Error?e.message:"Suspension impossible"); }
    finally{setBusy(false);}
  }

  async function openDebug() {
    setBusy(true);
    try { setDebug(await getAdminUserDebug(user.id)); }
    catch(e){ toast.error(e instanceof Error?e.message:"Diagnostic impossible"); }
    finally{setBusy(false);}
  }

  async function remove() {
    const owned=user.assignments.filter(a=>a.role==="Propriétaire").map(a=>boutiques.find(b=>b.id===a.boutiqueId)?.nom).filter(Boolean);
    const extra=owned.length?`\n\nBoutiques propriétaires : ${owned.join(", ")}. Leur propriété sera transférée au superadmin.`:"";
    if (!window.confirm(`SUPPRIMER définitivement ${user.nom} (${user.phone}) ?${extra}\n\nCette action supprime le compte de connexion mais conserve l'historique métier.`)) return;
    setBusy(true);
    try { await deleteAdminUser(user.id); toast.success("Compte supprimé"); onChanged(); }
    catch(e){ toast.error(e instanceof Error?e.message:"Suppression impossible"); }
    finally{setBusy(false);}
  }

  return <>
    <div className="flex flex-wrap gap-1.5">
      <button disabled={busy} onClick={()=>void editIdentity()} title="Modifier nom / téléphone" className="px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40" style={{background:"#eff6ff",color:"#2563eb"}}><Edit2 size={13}/> Modifier</button>
      <button disabled={busy} onClick={()=>void toggleSuspension()} title={user.isSuspended?"Réactiver":"Restreindre"} className="px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40" style={{background:user.isSuspended?"#f0fdf4":"#fff7ed",color:user.isSuspended?"#16a34a":"#ea580c"}}>{busy?<Loader2 size={13} className="animate-spin"/>:<Ban size={13}/>} {user.isSuspended?"Réactiver":"Restreindre"}</button>
      <button disabled={busy} onClick={()=>void openDebug()} title="Diagnostic support" className="px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40" style={{background:"#f3f4f6",color:"#374151"}}><Activity size={13}/> Debug</button>
      <button disabled={busy} onClick={()=>void remove()} title="Supprimer le compte" className="px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40" style={{background:"#fef2f2",color:"#dc2626"}}><Trash2 size={13}/></button>
    </div>

    {debug&&<div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={()=>setDebug(null)}>
      <div onClick={e=>e.stopPropagation()} className="w-full max-w-xl bg-background rounded-3xl border border-border shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck size={19}/><div><p className="font-black">Diagnostic utilisateur</p><p className="text-xs text-muted-foreground">{debug.user.nom} · {debug.user.phone}</p></div></div><button onClick={()=>setDebug(null)} className="p-2 rounded-xl bg-muted"><X size={16}/></button></div>
        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">État</p><p className="font-black">{debug.user.isSuspended?"Suspendu":"Actif"}</p></div>
            <div className="rounded-2xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Dernière connexion</p><p className="font-bold text-xs mt-1">{dt(debug.auth.lastSignInAt)}</p></div>
            <div className="rounded-2xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Compte créé</p><p className="font-bold text-xs mt-1">{dt(debug.auth.createdAt)}</p></div>
            <div className="rounded-2xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Banni jusqu'au</p><p className="font-bold text-xs mt-1">{dt(debug.auth.bannedUntil)}</p></div>
          </div>
          {debug.user.suspensionReason&&<div className="rounded-2xl border border-orange-200 bg-orange-50 p-3"><p className="text-xs font-black text-orange-800">Motif de restriction</p><p className="text-sm text-orange-900 mt-1">{debug.user.suspensionReason}</p></div>}
          <div><p className="text-xs font-black tracking-wider text-muted-foreground mb-2">AFFECTATIONS ({debug.assignments.length})</p><div className="space-y-2">{debug.assignments.length===0?<div className="rounded-xl bg-muted p-3 text-muted-foreground">Aucune boutique assignée</div>:debug.assignments.map((a,i)=><div key={`${a.boutique_id}-${i}`} className="rounded-xl border border-border p-3"><div className="flex justify-between gap-2"><p className="font-bold">{a.boutiques?.nom ?? boutiques.find(b=>b.id===a.boutique_id)?.nom ?? a.boutique_id}</p><span className="text-xs font-bold rounded-lg bg-blue-50 text-blue-700 px-2 py-1">{a.role}</span></div><p className="text-xs text-muted-foreground mt-1">{a.boutiques?.ville ?? boutiques.find(b=>b.id===a.boutique_id)?.ville ?? ""}</p><p className="text-xs text-muted-foreground mt-1">Droits actifs : {Object.entries(a.droits ?? {}).filter(([,v])=>v).map(([k])=>k).join(", ") || "aucun droit spécifique"}</p></div>)}</div></div>
        </div>
      </div>
    </div>}
  </>;
}
