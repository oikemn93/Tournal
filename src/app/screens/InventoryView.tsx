import React, { useMemo, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Boutique } from "../types";
import { fmt } from "../utils/formatting";
import { productQty } from "../utils/inventory";
import { recordStockMovement } from "../../lib/api";

/**
 * Relational inventory adjustment. Every confirmation creates one immutable
 * stock_entries row through the transactional stock RPC; no inventory value is
 * held as a source of truth in the browser.
 */
export function InventoryView({ boutique, onUpdate, logAction }: {
  boutique: Boutique;
  onUpdate: (update: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const [productId, setProductId] = useState<string>("");
  const [counted, setCounted] = useState("");
  const [saving, setSaving] = useState(false);
  const products = useMemo(() => boutique.products.slice().sort((a, b) => a.nom.localeCompare(b.nom)), [boutique.products]);
  const product = products.find((item) => String(item.id) === productId);
  const expected = product ? productQty(product.id, boutique.entries) : 0;
  const countedValue = Number(counted);
  const difference = Number.isFinite(countedValue) ? countedValue - expected : 0;

  async function confirmAdjustment() {
    if (!product || !counted.trim() || !Number.isFinite(countedValue) || countedValue < 0 || difference === 0 || saving) return;
    setSaving(true);
    try {
      await recordStockMovement({
        boutiqueId: boutique.id,
        productId: product.id,
        qty: difference,
        type: "inventaire",
        note: `Inventaire physique : ${countedValue} ${product.unit} compté(s)`,
      });
      // Immediate feedback only. Realtime reloads the canonical relational row.
      onUpdate({
        entries: [...boutique.entries, {
          id: Date.now(), productId: product.id, qty: difference, unit: product.unit,
          montantDu: 0, date: new Date().toLocaleDateString("fr-FR"), fournisseur: "Inventaire physique",
        }],
      });
      logAction("Inventaire physique", `${product.nom} : ${expected} → ${countedValue} ${product.unit}`, "📋");
      toast.success("Ajustement d’inventaire enregistré");
      setCounted("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajustement impossible");
    } finally {
      setSaving(false);
    }
  }

  return <div className="max-w-xl mx-auto space-y-5" data-screen-source="relational-inventory">
    <div className="rounded-3xl p-5 border border-border bg-card">
      <div className="flex items-center gap-3 mb-2"><ClipboardCheck className="text-emerald-600"/><h2 className="text-xl font-black">Inventaire physique</h2></div>
      <p className="text-sm text-muted-foreground">Chaque validation écrit un mouvement d’inventaire immuable dans Supabase.</p>
    </div>
    <div className="rounded-3xl p-5 border border-border bg-card space-y-4">
      <label className="block text-sm font-black">Produit
        <select value={productId} onChange={(event) => { setProductId(event.target.value); setCounted(""); }} className="mt-2 w-full rounded-xl border border-border bg-background p-3">
          <option value="">Sélectionner un produit</option>
          {products.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}
        </select>
      </label>
      {product && <>
        <div className="rounded-2xl bg-amber-50 p-4 text-sm"><span className="font-bold">Stock théorique : </span>{fmt(expected)} {product.unit}</div>
        <label className="block text-sm font-black">Quantité comptée
          <input inputMode="decimal" type="number" min="0" step="any" value={counted} onChange={(event) => setCounted(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3" placeholder="0"/>
        </label>
        {counted.trim() && Number.isFinite(countedValue) && <p className={difference === 0 ? "text-sm font-bold text-slate-600" : "text-sm font-bold text-emerald-700"}>Écart : {difference > 0 ? "+" : ""}{fmt(difference)} {product.unit}</p>}
        <button onClick={confirmAdjustment} disabled={saving || !counted.trim() || !Number.isFinite(countedValue) || countedValue < 0 || difference === 0} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">
          {saving ? <span className="flex justify-center gap-2"><Loader2 className="animate-spin" size={20}/> Enregistrement…</span> : "Valider l’inventaire"}
        </button>
      </>}
    </div>
  </div>;
}
