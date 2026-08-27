import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardCheck, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Boutique } from "../types";
import { fmt } from "../utils/formatting";
import { productQty } from "../utils/inventory";
import { recordStockMovement } from "../../lib/api";

/**
 * Server-backed physical inventory adjustment.
 *
 * The stock ledger in Supabase is the source of truth: every confirmation goes
 * through record_stock_movement(type = "inventaire") and only appears as a
 * success after the RPC has committed. Realtime then reconciles the same
 * canonical stock_entries row on every connected device.
 */
export function InventoryView({ boutique, onUpdate, logAction, initialProductId, onInitialProductPrepared, onClose }: {
  boutique: Boutique;
  onUpdate: (update: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialProductId?: number;
  onInitialProductPrepared?: () => void;
  onClose?: () => void;
}) {
  const [productId, setProductId] = useState<string>(initialProductId ? String(initialProductId) : "");
  const [counted, setCounted] = useState("");
  const [saving, setSaving] = useState(false);

  const products = useMemo(
    () => boutique.products.slice().sort((a, b) => a.nom.localeCompare(b.nom)),
    [boutique.products],
  );

  useEffect(() => {
    if (!initialProductId || !products.some(product => product.id === initialProductId)) return;
    setProductId(String(initialProductId));
    setCounted("");
    onInitialProductPrepared?.();
  }, [initialProductId, onInitialProductPrepared, products]);

  const product = products.find(item => String(item.id) === productId);
  const expected = product ? productQty(product.id, boutique.entries) : 0;
  const countedValue = Number(counted);
  const difference = Number.isFinite(countedValue) ? countedValue - expected : 0;

  const recentInventory = useMemo(() => boutique.entries
    .filter(entry => entry.movementType === "inventaire")
    .slice()
    .sort((a, b) => {
      const ta = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
      const tb = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
      return tb - ta || b.id - a.id;
    })
    .slice(0, 20), [boutique.entries]);

  const productById = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);

  async function confirmAdjustment() {
    if (!product || !counted.trim() || !Number.isFinite(countedValue) || countedValue < 0 || difference === 0 || saving) return;
    setSaving(true);
    try {
      const persisted = await recordStockMovement({
        boutiqueId: boutique.id,
        productId: product.id,
        qty: difference,
        type: "inventaire",
        note: `Inventaire physique : ${countedValue} ${product.unit} compté(s)`,
      });

      const now = new Date();
      const canonicalEntry = {
        id: persisted.entry_id,
        productId: product.id,
        qty: difference,
        unit: product.unit,
        montantDu: 0,
        date: now.toLocaleDateString("fr-FR"),
        recordedAt: now.toISOString(),
        fournisseur: `Inventaire physique : ${countedValue} ${product.unit} compté(s)`,
        movementType: "inventaire" as const,
      };

      // Use the server ID immediately. When Realtime delivers the same record,
      // the canonical merge path replaces/keeps this row instead of creating a
      // temporary duplicate.
      onUpdate({
        entries: [...boutique.entries.filter(entry => entry.id !== persisted.entry_id), canonicalEntry],
      });

      logAction("Inventaire physique", `${product.nom} : ${expected} → ${countedValue} ${product.unit}`, "📋");
      toast.success("Inventaire enregistré dans Supabase");
      setCounted("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajustement impossible");
    } finally {
      setSaving(false);
    }
  }

  return <div className="max-w-3xl mx-auto space-y-5" data-screen-source="relational-inventory">
    <div className="rounded-3xl p-5 border border-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-emerald-600"/>
          <div>
            <h2 className="text-xl font-black">Inventaire physique</h2>
            <p className="text-sm text-muted-foreground">Chaque validation est écrite dans le ledger Supabase avant d’être annoncée comme réussie.</p>
          </div>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm font-bold flex items-center gap-2"><ArrowLeft size={16}/> Retour</button>}
      </div>
    </div>

    <div className="rounded-3xl p-5 border border-border bg-card space-y-4">
      <label className="block text-sm font-black">Produit
        <select value={productId} onChange={(event) => { setProductId(event.target.value); setCounted(""); }} className="mt-2 w-full rounded-xl border border-border bg-background p-3">
          <option value="">Sélectionner un produit</option>
          {products.map(item => <option key={item.id} value={item.id}>{item.nom}</option>)}
        </select>
      </label>
      {product && <>
        <div className="rounded-2xl bg-amber-50 p-4 text-sm"><span className="font-bold">Stock théorique : </span>{fmt(expected)} {product.unit}</div>
        <label className="block text-sm font-black">Quantité réellement comptée
          <input inputMode="decimal" type="number" min="0" step="any" value={counted} onChange={(event) => setCounted(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3" placeholder="0"/>
        </label>
        {counted.trim() && Number.isFinite(countedValue) && <p className={difference === 0 ? "text-sm font-bold text-slate-600" : difference > 0 ? "text-sm font-bold text-emerald-700" : "text-sm font-bold text-red-700"}>Écart : {difference > 0 ? "+" : ""}{fmt(difference)} {product.unit}</p>}
        <button onClick={confirmAdjustment} disabled={saving || !counted.trim() || !Number.isFinite(countedValue) || countedValue < 0 || difference === 0} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">
          {saving ? <span className="flex justify-center gap-2"><Loader2 className="animate-spin" size={20}/> Enregistrement Supabase…</span> : "Valider l’inventaire"}
        </button>
        {difference === 0 && counted.trim() && <p className="text-xs text-center text-muted-foreground">Aucun mouvement n’est nécessaire : le stock compté correspond au stock théorique.</p>}
      </>}
    </div>

    <div className="rounded-3xl p-5 border border-border bg-card space-y-3">
      <div className="flex items-center gap-2"><History size={18} className="text-muted-foreground"/><h3 className="font-black">Derniers ajustements persistés</h3></div>
      {recentInventory.length === 0 ? <p className="text-sm text-muted-foreground">Aucun mouvement d’inventaire enregistré dans Supabase.</p> : (
        <div className="divide-y divide-border">
          {recentInventory.map(entry => {
            const item = productById.get(entry.productId);
            const when = entry.recordedAt ? new Date(entry.recordedAt).toLocaleString("fr-FR") : entry.date;
            return <div key={entry.id} className="py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-black truncate">{item?.nom ?? `Produit #${entry.productId}`}</p>
                <p className="text-xs text-muted-foreground">{when}{entry.operatorName ? ` · ${entry.operatorName}` : ""}</p>
                {entry.fournisseur && <p className="text-xs text-muted-foreground mt-0.5">{entry.fournisseur}</p>}
              </div>
              <span className={entry.qty >= 0 ? "text-sm font-black text-emerald-700" : "text-sm font-black text-red-700"}>{entry.qty > 0 ? "+" : ""}{fmt(entry.qty)} {entry.unit}</span>
            </div>;
          })}
        </div>
      )}
    </div>
  </div>;
}
