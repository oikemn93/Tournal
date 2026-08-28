import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, BarChart3, Boxes, CheckCircle2, ClipboardCheck, History,
  Layers3, Loader2, Package, Play, Save, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { Boutique, PlatformUser, StockEntry } from "../types";
import {
  cancelInventorySession,
  finalizeInventorySession,
  getInventorySession,
  listInventorySessions,
  saveInventoryCount,
  startInventorySession,
  type InventoryCountingDetail,
  type InventoryLine,
  type InventoryReport,
  type InventoryScopeType,
  type InventorySession,
  type InventorySessionSummary,
} from "../../lib/inventoryApi";

type CountDraft = {
  direct: string;
  lots: string;
  loosePieces: string;
  extraQty: string;
  mode: "direct" | "conditioning";
};

const zeroReport: InventoryReport = {
  theoreticalCost: 0,
  countedCost: 0,
  theoreticalSales: 0,
  countedSales: 0,
  potentialMargin: 0,
  varianceCost: 0,
  varianceSales: 0,
};

function number(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

function money(value: number) {
  return `${number(Math.round(value))} F`;
}

function initialDraft(line: InventoryLine): CountDraft {
  const detail = line.countingDetail ?? {};
  return {
    direct: line.countedQty == null ? "" : String(line.countedQty),
    lots: detail.lots == null ? "" : String(detail.lots),
    loosePieces: detail.loosePieces == null ? "" : String(detail.loosePieces),
    extraQty: detail.extraQty == null ? "" : String(detail.extraQty),
    mode: detail.mode === "conditioning" && line.piecesPerLot > 0 ? "conditioning" : "direct",
  };
}

function conditionedQuantity(line: InventoryLine, draft: CountDraft) {
  const lots = Math.max(0, Number(draft.lots) || 0);
  const loosePieces = Math.max(0, Number(draft.loosePieces) || 0);
  const extraQty = Math.max(0, Number(draft.extraQty) || 0);
  const pieces = lots * line.piecesPerLot + loosePieces;
  if (line.lengthPerPiece > 0 && line.unit !== "pièces") return pieces * line.lengthPerPiece + extraQty;
  return pieces + extraQty;
}

function countedFromDraft(line: InventoryLine, draft: CountDraft) {
  if (draft.mode === "conditioning" && line.piecesPerLot > 0) return conditionedQuantity(line, draft);
  if (!draft.direct.trim()) return null;
  const value = Number(draft.direct);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function liveReport(lines: InventoryLine[], drafts: Record<number, CountDraft>): InventoryReport {
  return lines.reduce<InventoryReport>((report, line) => {
    const counted = countedFromDraft(line, drafts[line.productId] ?? initialDraft(line));
    const actual = counted ?? line.countedQty;
    const theoretical = line.finalTheoreticalQty ?? line.theoreticalQty;
    report.theoreticalCost += theoretical * line.purchasePrice;
    report.theoreticalSales += theoretical * line.salePrice;
    if (actual != null) {
      report.countedCost += actual * line.purchasePrice;
      report.countedSales += actual * line.salePrice;
      report.varianceCost += (actual - theoretical) * line.purchasePrice;
      report.varianceSales += (actual - theoretical) * line.salePrice;
    }
    report.potentialMargin = report.countedSales - report.countedCost;
    return report;
  }, { ...zeroReport });
}

function ReportCards({ report }: { report: InventoryReport }) {
  const variancePositive = report.varianceCost >= 0;
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">Valeur achat inventoriée</p>
      <p className="mt-1 text-lg font-black">{money(report.countedCost)}</p>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">CA potentiel du stock</p>
      <p className="mt-1 text-lg font-black">{money(report.countedSales)}</p>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">Marge potentielle</p>
      <p className="mt-1 text-lg font-black text-emerald-700">{money(report.potentialMargin)}</p>
    </div>
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-bold text-muted-foreground">Bénéfice / perte inventaire</p>
      <p className={`mt-1 text-lg font-black ${variancePositive ? "text-emerald-700" : "text-red-700"}`}>
        {report.varianceCost > 0 ? "+" : ""}{money(report.varianceCost)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">Écart valorisé au coût d'achat</p>
    </div>
  </div>;
}

export function InventoryView({ boutique, currentUser, onUpdate, logAction, initialProductId, onInitialProductPrepared, onClose }: {
  boutique: Boutique;
  currentUser?: PlatformUser;
  onUpdate: (update: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
  initialProductId?: number;
  onInitialProductPrepared?: () => void;
  onClose?: () => void;
}) {
  const [scopeType, setScopeType] = useState<InventoryScopeType>(initialProductId ? "product" : "all");
  const [scopeId, setScopeId] = useState(initialProductId ? String(initialProductId) : "");
  const [session, setSession] = useState<InventorySession | null>(null);
  const [history, setHistory] = useState<InventorySessionSummary[]>([]);
  const [drafts, setDrafts] = useState<Record<number, CountDraft>>({});
  const [busy, setBusy] = useState(false);
  const [savingProductId, setSavingProductId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  const products = useMemo(() => boutique.products.slice().sort((a, b) => a.nom.localeCompare(b.nom)), [boutique.products]);
  const categories = useMemo(() => (boutique.categories ?? []).slice().sort((a, b) => a.nom.localeCompare(b.nom)), [boutique.categories]);

  const resetDrafts = (next: InventorySession) => {
    setDrafts(Object.fromEntries(next.lines.map(line => [line.productId, initialDraft(line)])));
  };

  async function refreshHistory() {
    try {
      const rows = await listInventorySessions(boutique.id, 30);
      setHistory(rows);
    } catch (error) {
      console.warn("Historique inventaire indisponible", error);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => { void refreshHistory(); }, [boutique.id]);

  useEffect(() => {
    if (!initialProductId || !products.some(product => product.id === initialProductId)) return;
    setScopeType("product");
    setScopeId(String(initialProductId));
    onInitialProductPrepared?.();
  }, [initialProductId, onInitialProductPrepared, products]);

  useEffect(() => {
    if (session) resetDrafts(session);
  }, [session?.id]);

  const countedCount = session?.lines.filter(line => {
    const draft = drafts[line.productId];
    return countedFromDraft(line, draft ?? initialDraft(line)) != null || line.countedQty != null;
  }).length ?? 0;
  const totalCount = session?.lines.length ?? 0;
  const allCounted = totalCount > 0 && countedCount === totalCount;
  const report = session?.status === "completed" ? session.report : session ? liveReport(session.lines, drafts) : zeroReport;

  async function startSession() {
    if (busy) return;
    if (scopeType !== "all" && !scopeId) {
      toast.error(scopeType === "category" ? "Sélectionnez une catégorie" : "Sélectionnez un produit");
      return;
    }
    setBusy(true);
    try {
      const next = await startInventorySession({ boutiqueId: boutique.id, scopeType, scopeId: scopeType === "all" ? null : scopeId });
      setSession(next);
      resetDrafts(next);
      await refreshHistory();
      toast.success(`Inventaire démarré · ${next.scopeLabel}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de démarrer l'inventaire");
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(line: InventoryLine) {
    const draft = drafts[line.productId] ?? initialDraft(line);
    const countedQty = countedFromDraft(line, draft);
    if (countedQty == null || savingProductId != null) {
      toast.error("Saisissez une quantité valide");
      return;
    }
    const countingDetail: InventoryCountingDetail = draft.mode === "conditioning"
      ? {
          mode: "conditioning",
          lots: Math.max(0, Number(draft.lots) || 0),
          loosePieces: Math.max(0, Number(draft.loosePieces) || 0),
          extraQty: Math.max(0, Number(draft.extraQty) || 0),
        }
      : { mode: "direct" };
    setSavingProductId(line.productId);
    try {
      const next = await saveInventoryCount({ sessionId: session!.id, productId: line.productId, countedQty, countingDetail });
      setSession(next);
      resetDrafts(next);
      toast.success(`${line.productName} enregistré`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Comptage impossible");
    } finally {
      setSavingProductId(null);
    }
  }

  async function finalizeSession() {
    if (!session || !allCounted || busy) return;
    setBusy(true);
    try {
      // Persist any edited drafts before the atomic finalization.
      let current = session;
      for (const line of session.lines) {
        const draft = drafts[line.productId] ?? initialDraft(line);
        const countedQty = countedFromDraft(line, draft);
        if (countedQty == null) throw new Error(`${line.productName} n'est pas compté`);
        if (line.countedQty !== countedQty || JSON.stringify(line.countingDetail ?? {}) !== JSON.stringify(draft.mode === "conditioning" ? {
          mode: "conditioning",
          lots: Math.max(0, Number(draft.lots) || 0),
          loosePieces: Math.max(0, Number(draft.loosePieces) || 0),
          extraQty: Math.max(0, Number(draft.extraQty) || 0),
        } : { mode: "direct" })) {
          current = await saveInventoryCount({
            sessionId: session.id,
            productId: line.productId,
            countedQty,
            countingDetail: draft.mode === "conditioning" ? {
              mode: "conditioning",
              lots: Math.max(0, Number(draft.lots) || 0),
              loosePieces: Math.max(0, Number(draft.loosePieces) || 0),
              extraQty: Math.max(0, Number(draft.extraQty) || 0),
            } : { mode: "direct" },
          });
        }
      }

      const completed = await finalizeInventorySession(current.id);
      setSession(completed);
      resetDrafts(completed);

      const generatedEntries: StockEntry[] = completed.lines
        .filter(line => line.stockEntryId != null && Number(line.differenceQty ?? 0) !== 0)
        .map(line => ({
          id: Number(line.stockEntryId),
          productId: line.productId,
          qty: Number(line.differenceQty ?? 0),
          unit: line.unit,
          montantDu: Number(line.differenceQty ?? 0) * line.purchasePrice,
          date: new Date(completed.finalizedAt ?? Date.now()).toLocaleDateString("fr-FR"),
          recordedAt: completed.finalizedAt ?? new Date().toISOString(),
          fournisseur: `Inventaire ${completed.scopeLabel}`,
          movementType: "inventaire",
          operatorId: currentUser?.id,
          operatorName: currentUser?.nom,
        }));
      if (generatedEntries.length) {
        const generatedIds = new Set(generatedEntries.map(entry => entry.id));
        onUpdate({ entries: [...boutique.entries.filter(entry => !generatedIds.has(entry.id)), ...generatedEntries] });
      }

      const variance = completed.report.varianceCost;
      logAction(
        "Inventaire physique",
        `${completed.scopeLabel} · ${completed.lines.length} produit(s) · ${variance >= 0 ? "gain" : "perte"} ${money(Math.abs(variance))}`,
        "📋",
      );
      await refreshHistory();
      toast.success("Inventaire finalisé et stock ajusté dans Supabase");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Finalisation impossible");
    } finally {
      setBusy(false);
    }
  }

  async function openHistory(row: InventorySessionSummary) {
    setBusy(true);
    try {
      const full = await getInventorySession(row.id);
      setSession(full);
      resetDrafts(full);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rapport indisponible");
    } finally {
      setBusy(false);
    }
  }

  async function cancelCurrent() {
    if (!session || session.status !== "draft" || busy) return;
    setBusy(true);
    try {
      await cancelInventorySession(session.id);
      setSession(null);
      setDrafts({});
      await refreshHistory();
      toast.success("Inventaire annulé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Annulation impossible");
    } finally {
      setBusy(false);
    }
  }

  return <div className="max-w-5xl mx-auto space-y-5" data-screen-source="relational-inventory-v2">
    <div className="rounded-3xl p-5 border border-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-emerald-600"/>
          <div>
            <h2 className="text-xl font-black">Inventaire physique</h2>
            <p className="text-sm text-muted-foreground">Par produit, par catégorie ou sur tout le stock · comptages et rapports persistés dans Supabase.</p>
          </div>
        </div>
        {onClose && <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-2 text-sm font-bold flex items-center gap-2"><ArrowLeft size={16}/> Retour</button>}
      </div>
    </div>

    {!session && <div className="rounded-3xl p-5 border border-border bg-card space-y-5">
      <div>
        <h3 className="font-black">Nouveau périmètre d'inventaire</h3>
        <p className="text-xs text-muted-foreground mt-1">Le stock théorique et les prix sont figés au démarrage pour produire un rapport fiable.</p>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        {([
          ["product", Package, "Un produit", "Compter un article précis"],
          ["category", Layers3, "Une catégorie", "Compter tous les produits d'une catégorie"],
          ["all", Boxes, "Tous les produits", "Inventaire général de la boutique"],
        ] as const).map(([id, Icon, title, subtitle]) => <button key={id} onClick={() => { setScopeType(id); setScopeId(""); }} className={`rounded-2xl border p-4 text-left transition-all ${scopeType === id ? "border-emerald-500 bg-emerald-50" : "border-border bg-background"}`}>
          <Icon size={20} className={scopeType === id ? "text-emerald-700" : "text-muted-foreground"}/>
          <p className="font-black mt-2">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </button>)}
      </div>
      {scopeType === "product" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="w-full rounded-xl border border-border bg-background p-3">
        <option value="">Sélectionner un produit</option>
        {products.map(product => <option key={product.id} value={product.id}>{product.nom}{product.categorie ? ` · ${product.categorie}` : ""}</option>)}
      </select>}
      {scopeType === "category" && <select value={scopeId} onChange={event => setScopeId(event.target.value)} className="w-full rounded-xl border border-border bg-background p-3">
        <option value="">Sélectionner une catégorie</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.nom}</option>)}
      </select>}
      <button onClick={startSession} disabled={busy || (scopeType !== "all" && !scopeId)} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50 flex items-center justify-center gap-2">
        {busy ? <Loader2 size={20} className="animate-spin"/> : <Play size={20}/>} Démarrer l'inventaire
      </button>
    </div>}

    {session && <>
      <div className="rounded-3xl p-5 border border-border bg-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-muted-foreground">{session.status === "completed" ? "Rapport d'inventaire" : "Inventaire en cours"}</p>
            <h3 className="text-xl font-black">{session.scopeLabel}</h3>
            <p className="text-xs text-muted-foreground mt-1">Démarré le {new Date(session.startedAt).toLocaleString("fr-FR")}{session.operatorName ? ` · ${session.operatorName}` : ""}</p>
          </div>
          <div className="flex gap-2">
            {session.status === "draft" && <button onClick={cancelCurrent} disabled={busy} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 flex items-center gap-2"><Trash2 size={15}/> Annuler</button>}
            <button onClick={() => { setSession(null); setDrafts({}); }} className="rounded-xl border border-border px-3 py-2 text-sm font-bold"><ArrowLeft size={15} className="inline mr-1"/> Liste</button>
          </div>
        </div>
        {session.status === "draft" && <div>
          <div className="flex justify-between text-xs font-bold"><span>Progression</span><span>{countedCount}/{totalCount}</span></div>
          <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${totalCount ? countedCount / totalCount * 100 : 0}%` }}/></div>
        </div>}
      </div>

      <ReportCards report={report}/>

      <div className="space-y-3">
        {session.lines.map(line => {
          const draft = drafts[line.productId] ?? initialDraft(line);
          const counted = countedFromDraft(line, draft);
          const theoretical = line.finalTheoreticalQty ?? line.theoreticalQty;
          const difference = counted == null ? line.differenceQty : counted - theoretical;
          const conditioningAvailable = line.piecesPerLot > 0;
          const saved = line.countedQty != null;
          return <div key={line.productId} className="rounded-3xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-black text-base">{line.productName}</h4>
                  {line.categoryName && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{line.categoryName}</span>}
                  {saved && <CheckCircle2 size={16} className="text-emerald-600"/>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Théorique : <strong>{number(theoretical)} {line.unit}</strong> · Achat {money(line.purchasePrice)} · Vente {money(line.salePrice)}</p>
              </div>
              {difference != null && <span className={`rounded-full px-3 py-1 text-xs font-black ${difference > 0 ? "bg-emerald-50 text-emerald-700" : difference < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                Écart {difference > 0 ? "+" : ""}{number(difference)} {line.unit}
              </span>}
            </div>

            {session.status === "draft" ? <>
              {conditioningAvailable && <div className="flex rounded-xl bg-muted p-1 w-fit">
                <button onClick={() => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, mode: "direct" } }))} className={`px-3 py-2 rounded-lg text-xs font-bold ${draft.mode === "direct" ? "bg-background shadow-sm" : ""}`}>Quantité directe</button>
                <button onClick={() => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, mode: "conditioning" } }))} className={`px-3 py-2 rounded-lg text-xs font-bold ${draft.mode === "conditioning" ? "bg-background shadow-sm" : ""}`}>Conditionnement</button>
              </div>}

              {draft.mode === "conditioning" && conditioningAvailable ? <div className="grid sm:grid-cols-3 gap-3 rounded-2xl bg-amber-50 p-4">
                <label className="text-xs font-black">Lots
                  <input type="number" min="0" step="1" value={draft.lots} onChange={event => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, lots: event.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3" placeholder="0"/>
                  <span className="block text-[10px] font-normal text-muted-foreground mt-1">{number(line.piecesPerLot)} pièce(s) / lot</span>
                </label>
                <label className="text-xs font-black">Pièces hors lot
                  <input type="number" min="0" step="1" value={draft.loosePieces} onChange={event => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, loosePieces: event.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3" placeholder="0"/>
                  {line.lengthPerPiece > 0 && <span className="block text-[10px] font-normal text-muted-foreground mt-1">{number(line.lengthPerPiece)} {line.unit} / pièce</span>}
                </label>
                <label className="text-xs font-black">Complément {line.unit}
                  <input type="number" min="0" step="any" value={draft.extraQty} onChange={event => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, extraQty: event.target.value } }))} className="mt-1 w-full rounded-xl border border-amber-200 bg-white p-3" placeholder="0"/>
                  <span className="block text-[10px] font-normal text-muted-foreground mt-1">Quantité libre non conditionnée</span>
                </label>
                <div className="sm:col-span-3 text-sm font-black">Total compté : {number(conditionedQuantity(line, draft))} {line.unit}</div>
              </div> : <label className="block text-sm font-black">Quantité réellement comptée
                <input inputMode="decimal" type="number" min="0" step="any" value={draft.direct} onChange={event => setDrafts(prev => ({ ...prev, [line.productId]: { ...draft, direct: event.target.value } }))} className="mt-2 w-full rounded-xl border border-border bg-background p-3" placeholder="0"/>
              </label>}

              <button onClick={() => void saveLine(line)} disabled={savingProductId != null || counted == null} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2 sm:w-fit">
                {savingProductId === line.productId ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>} Enregistrer ce comptage
              </button>
            </> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Compté</p><p className="font-black">{number(line.countedQty ?? 0)} {line.unit}</p></div>
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Écart</p><p className="font-black">{Number(line.differenceQty ?? 0) > 0 ? "+" : ""}{number(line.differenceQty ?? 0)} {line.unit}</p></div>
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Impact coût</p><p className="font-black">{money(Number(line.differenceQty ?? 0) * line.purchasePrice)}</p></div>
              <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Impact CA</p><p className="font-black">{money(Number(line.differenceQty ?? 0) * line.salePrice)}</p></div>
            </div>}
          </div>;
        })}
      </div>

      {session.status === "draft" && <div className="sticky bottom-20 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div><p className="font-black">{allCounted ? "Inventaire prêt à finaliser" : `${totalCount - countedCount} produit(s) restant(s)`}</p><p className="text-xs text-emerald-800">La finalisation recalcule le stock théorique courant et applique tous les écarts dans une seule transaction.</p></div>
          <button onClick={finalizeSession} disabled={!allCounted || busy} className="w-full sm:w-auto rounded-2xl bg-emerald-600 px-6 py-4 font-black text-white disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 size={20} className="animate-spin"/> : <ClipboardCheck size={20}/>} Finaliser l'inventaire
          </button>
        </div>
      </div>}
    </>}

    {!session && <div className="rounded-3xl p-5 border border-border bg-card space-y-3">
      <div className="flex items-center gap-2"><History size={18} className="text-muted-foreground"/><h3 className="font-black">Historique et rapports</h3></div>
      {historyLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-muted-foreground"/></div> : history.length === 0 ? <p className="text-sm text-muted-foreground">Aucun inventaire enregistré.</p> : (
        <div className="divide-y divide-border">
          {history.map(row => <button key={row.id} onClick={() => void openHistory(row)} className="w-full py-3 flex items-center justify-between gap-4 text-left">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><p className="text-sm font-black truncate">{row.scopeLabel}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.status === "completed" ? "bg-emerald-50 text-emerald-700" : row.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{row.status === "completed" ? "Terminé" : row.status === "draft" ? "En cours" : "Annulé"}</span></div>
              <p className="text-xs text-muted-foreground">{new Date(row.startedAt).toLocaleString("fr-FR")}{row.operatorName ? ` · ${row.operatorName}` : ""} · {row.countedCount}/{row.lineCount} comptés</p>
            </div>
            <div className="text-right flex-shrink-0">
              {row.status === "completed" ? <><p className="text-xs text-muted-foreground">Bénéfice / perte</p><p className={`text-sm font-black ${row.report.varianceCost >= 0 ? "text-emerald-700" : "text-red-700"}`}>{row.report.varianceCost > 0 ? "+" : ""}{money(row.report.varianceCost)}</p></> : <BarChart3 size={20} className="text-muted-foreground"/>}
            </div>
          </button>)}
        </div>
      )}
    </div>}

    {!session && <div className="rounded-3xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground flex gap-3">
      <div className="mt-0.5">{zeroReport.varianceCost >= 0 ? <TrendingUp size={17}/> : <TrendingDown size={17}/>}</div>
      <p><strong>Rapport financier :</strong> le « CA potentiel » correspond à la valeur de vente du stock physiquement compté. La marge potentielle est cette valeur moins la valeur d'achat. Le bénéfice/perte d'inventaire valorise uniquement les écarts physiques au coût d'achat.</p>
    </div>}
  </div>;
}
