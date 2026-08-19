import React from "react";
import { Store, MapPin, ChevronRight, LogOut, ArrowLeft } from "lucide-react";
import type { Boutique, PlatformUser, BoutiqueAssignment } from "../types";

export function BoutiqueSelectScreen({ user, boutiques, assignments, onSelect, onLogout, onBack }: {
  user: PlatformUser; boutiques: Boutique[]; assignments: BoutiqueAssignment[];
  onSelect: (b: Boutique, a: BoutiqueAssignment) => void; onLogout: () => void;
  onBack?: () => void;
}) {
  const available = assignments.map(a=>({ boutique:boutiques.find(b=>b.id===a.boutiqueId)!, a })).filter(x=>x.boutique);
  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col" style={{ fontFamily:"'Inter', sans-serif" }}>
      <div className="flex items-center justify-between px-4 pt-10 pb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:"#EEE9D8" }}>
              <ArrowLeft size={18} className="text-muted-foreground"/>
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-base font-black" style={{ background:user.color+"22", color:user.color, fontFamily:"'Nunito', sans-serif" }}>{user.initials}</div>
          <div><p className="font-bold">{user.nom}</p><p className="text-xs text-muted-foreground">{onBack ? "Changer de boutique" : "Choisissez votre boutique"}</p></div>
        </div>
        <button onClick={onLogout} className="p-2.5 rounded-xl" style={{ background:"#EEE9D8" }}><LogOut size={18} className="text-muted-foreground"/></button>
      </div>
      <div className="flex-1 px-4 space-y-3">
        {available.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background:"#C9A22722" }}><Store size={32} style={{ color:"#C9A227" }}/></div>
            <p className="font-black text-base" style={{ fontFamily:"'Nunito', sans-serif", color:"#C9A227" }}>Aucune boutique assignée</p>
            <p className="text-sm text-muted-foreground">Contactez votre administrateur pour être ajouté à une boutique.</p>
          </div>
        )}
        {available.map(({ boutique:b, a })=>(
          <button key={b.id} onClick={()=>onSelect(b,a)} className="w-full bg-card rounded-2xl p-5 border border-border text-left flex items-center gap-4 active:scale-[0.98]" style={{ boxShadow:`inset 3px 0 0 ${b.color}` }}>
            <div className="w-16 h-16 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl font-black" style={{ background:b.color+"22", color:b.color, fontFamily:"'Nunito', sans-serif" }}>{b.initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-black" style={{ fontFamily:"'Nunito', sans-serif" }}>{b.nom}</p>
              <div className="flex items-center gap-1.5 mt-0.5"><MapPin size={11} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">{b.ville}</span></div>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold mt-1.5 inline-block" style={{ background:user.color+"22", color:user.color }}>{a.role}</span>
            </div>
            <ChevronRight size={20} style={{ color:b.color }}/>
          </button>
        ))}
      </div>
    </div>
  );
}
