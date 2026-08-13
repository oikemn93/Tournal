import React, { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Boutique } from "../types";
import { updateBoutiqueProfile } from "../../lib/api";

/** A persisted subset of Administration. Legacy local-only settings stay unavailable. */
export function AdministrationView({ boutique, onUpdate, logAction }: {
  boutique: Boutique;
  onUpdate: (update: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const [nom, setNom] = useState(boutique.nom);
  const [ville, setVille] = useState(boutique.ville);
  const [adresse, setAdresse] = useState(boutique.adresse ?? "");
  const [email, setEmail] = useState(boutique.email ?? "");
  const [tel, setTel] = useState(boutique.tel ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNom(boutique.nom); setVille(boutique.ville); setAdresse(boutique.adresse ?? ""); setEmail(boutique.email ?? ""); setTel(boutique.tel ?? ""); }, [boutique]);

  async function save() {
    if (!nom.trim() || saving) return;
    setSaving(true);
    try {
      const update = { nom: nom.trim(), ville: ville.trim(), adresse: adresse.trim() || undefined, email: email.trim() || undefined, tel: tel.trim() || undefined };
      await updateBoutiqueProfile({ boutiqueId: boutique.id, ...update });
      onUpdate(update);
      logAction("Profil boutique modifié", update.nom, "⚙️");
      toast.success("Profil de la boutique enregistré");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally { setSaving(false); }
  }

  return <div className="max-w-xl mx-auto space-y-5" data-screen-source="relational-administration">
    <div className="rounded-3xl p-5 border border-border bg-card"><div className="flex gap-3 items-center"><Building2 className="text-amber-600"/><div><h2 className="text-xl font-black">Administration</h2><p className="text-sm text-muted-foreground">Profil enregistré directement dans Supabase.</p></div></div></div>
    <div className="rounded-3xl p-5 border border-border bg-card space-y-4">
      <label className="block text-sm font-black">Nom<input value={nom} onChange={(event) => setNom(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
      <label className="block text-sm font-black">Ville<input value={ville} onChange={(event) => setVille(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
      <label className="block text-sm font-black">Adresse<input value={adresse} onChange={(event) => setAdresse(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
      <label className="block text-sm font-black">Téléphone<input value={tel} onChange={(event) => setTel(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
      <label className="block text-sm font-black">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"/></label>
      <button onClick={save} disabled={saving || !nom.trim()} className="w-full rounded-2xl bg-amber-600 py-4 font-black text-white disabled:opacity-50">{saving ? <span className="flex justify-center gap-2"><Loader2 size={20} className="animate-spin"/> Enregistrement…</span> : "Enregistrer"}</button>
    </div>
  </div>;
}
