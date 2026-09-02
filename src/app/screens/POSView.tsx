import React, { useState, useEffect } from "react";
import { Search, Plus, Minus, ChevronRight, ShoppingBag, Trash2, CheckCircle, AlertCircle, Zap, ClipboardList, Printer, Settings, Pencil } from "lucide-react";
import type { Boutique, CartItem, Invoice, Product, PlatformUser, PaymentMethod, StockEntry } from "../types";
import { SEM, inputCls, searchInputCls, PAYMENT_METHODS, PM_ICON } from "../constants";
import { fmt, today, imgSrc } from "../utils/formatting";
import { productQty, lineTotal, lineDispQty, lineDispUnit } from "../utils/inventory";
import { silentPrint, buildOrderTicketHtml, buildReceiptHtml, agentPrint, connectQZ, PA, usePAStatus } from "../utils/invoice";
import { Modal } from "../components/Modal";
import { Field } from "../components/Field";
import { SubmitBtn } from "../components/SubmitBtn";
import { createSale, recordMultiPayment, recordPayment, cancelPendingInvoice, updatePendingInvoice } from "../../lib/api";
import { getDefaultSaleUnit, getLastSalePrice, getSaleUnitOptions, getSaleUnitLabel, toBaseSaleQty } from "../utils/sales";
import { formatPreciseDateTime } from "../utils/payments";

export function POSView({ boutique, allBoutiques, currentUser, canEncaissVente = false, canCancelPendingOrder = false, initialClientId, initialOrderOrigin = "pos", initialEditingInvoice, onInitialClientPrepared, onOrderCreated, onUpdate, logAction }: {
  boutique: Boutique; allBoutiques: Boutique[]; currentUser: PlatformUser;
  canEncaissVente?: boolean;
  canCancelPendingOrder?: boolean;
  initialClientId?: number;
  initialOrderOrigin?: "pos" | "client_profile";
  initialEditingInvoice?: Invoice;
  onInitialClientPrepared?: () => void;
  onOrderCreated?: (clientId: number, invoiceId: string, notice?: "order"|"payment") => void;
  onUpdate: (u: Partial<Boutique>) => void;
  logAction: (action: string, detail: string, icon: string) => void;
}) {
  const POS_COLOR = boutique.color;
  const { products, entries, invoices } = boutique;
  const pa = usePAStatus();
  const activeAssignment = currentUser.assignments.find(assignment => assignment.boutiqueId === boutique.id);
  const isBoutiqueOwner = activeAssignment?.role === "Propriétaire" || activeAssignment?.role === "owner";
  const canManageAnyPendingOrder = currentUser.isSuperAdmin || isBoutiqueOwner;
  const canManagePendingOrder = (invoice: Invoice) => canManageAnyPendingOrder || invoice.operatorId === currentUser.id;
  const canEditPendingOrder = (invoice: Invoice) => canManagePendingOrder(invoice) && invoice.origin !== "client_profile";
  const hasCancelPermission = canCancelPendingOrder || currentUser.isSuperAdmin || isBoutiqueOwner || !!activeAssignment?.droits?.annulation_commande;
  const canCancelOrder = (invoice: Invoice) => hasCancelPermission && invoice.origin !== "client_profile";

  // Order taking
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addModal, setAddModal] = useState<Product|null>(null);
  const [addQty, setAddQty] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addSellUnit, setAddSellUnit] = useState("");
  const [printerOpen, setPrinterOpen] = useState(false);
  const [printerName, setPrinterName] = useState(() => localStorage.getItem(`tournal.printer.${boutique.id}`) ?? "");
  const [qzBusy, setQzBusy] = useState(false);
  const posCats = boutique.categories ?? [];

  async function connectPrinter() {
    setQzBusy(true);
    try { await connectQZ(printerName || undefined); }
    finally { setQzBusy(false); }
  }
  function selectPrinter(name: string) {
    PA.printer = name;
    setPrinterName(name);
    localStorage.setItem(`tournal.printer.${boutique.id}`, name);
  }

  function getSellOptions(p: Product): string[] {
    return getSaleUnitOptions(p, boutique);
  }

  function toBaseQty(sellQty: number, sellUnit: string, p: Product): number {
    return toBaseSaleQty(sellQty, sellUnit, p, boutique);
  }

  function sellConversion(sellQty: number, sellUnit: string, p: Product): string | null {
    const cat = posCats.find(c => c.nom === p.categorie);
    if (!cat || !sellQty) return null;
    const base = toBaseQty(sellQty, sellUnit, p);
    if (base === sellQty && sellUnit === cat.unitVente) return null;
    return `${base} ${cat.unitVente}`;
  }
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [clientNom, setClientNom] = useState("");
  const [clientTel, setClientTel] = useState("+221 ");
  const [selectedClientId, setSelectedClientId] = useState<number|undefined>();
  const [done, setDone] = useState(false);
  const [lastInv, setLastInv] = useState<Invoice|null>(null);
  const [posTab, setPosTab] = useState<"produits"|"commandes">("produits");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [printJob, setPrintJob] = useState<{status:"printing"|"ok"|"fail"|"fallback";html:string;label:string}|null>(null);
  const [cancelBusy, setCancelBusy] = useState<string|null>(null); // invoiceId en cours d'annulation
  const [editingInvoice, setEditingInvoice] = useState<Invoice|null>(null);
  const [orderOrigin, setOrderOrigin] = useState<"pos"|"client_profile">("pos");
  const [cancelConfirmation, setCancelConfirmation] = useState<Invoice|null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // A known client can start a command from their card without opening the
  // invoice screen. Keep the canonical ID so the command is attached to the
  // correct client even if another customer has the same name.
  useEffect(() => {
    if (initialClientId == null) return;
    const client = boutique.clients.find(item => item.id === initialClientId);
    if (client) {
      setClientNom(client.nom);
      setClientTel(client.tel || "+221 ");
      setSelectedClientId(client.id);
      setOrderOrigin(initialOrderOrigin);
    }
    onInitialClientPrepared?.();
  }, [initialClientId, boutique.clients, onInitialClientPrepared]);

  // Client workspace can reopen an unpaid order for editing. The existing
  // updatePendingInvoice path preserves the invoice number and only rewrites
  // the order lines/total; no stock movement has happened before payment.
  useEffect(() => {
    if (!initialEditingInvoice) return;
    if (initialEditingInvoice.status !== "en attente" || initialEditingInvoice.acompte > 0) return;
    const items: CartItem[] = (initialEditingInvoice.lines ?? []).map(line => ({
      productId:line.productId, nom:line.nom, img:products.find(p=>p.id===line.productId)?.img ?? "",
      unit:line.unit, qty:line.qty, prixUnit:line.prixUnit, sellUnit:line.sellUnit, sellQty:line.sellQty,
    }));
    setCart(items);
    setClientNom(initialEditingInvoice.client === "Client comptoir" ? "" : initialEditingInvoice.client);
    setClientTel(initialEditingInvoice.clientTel ?? "+221 ");
    setSelectedClientId(initialEditingInvoice.clientId);
    setEditingInvoice(initialEditingInvoice);
    setOrderOrigin("client_profile");
    setPosTab("produits");
    setCheckoutOpen(true);
  }, [initialEditingInvoice?.id]);

  // Auto-connect QZ Tray if configured
  useEffect(()=>{ if (boutique.autoPrint && boutique.printerName && PA.status==="idle") connectQZ(boutique.printerName); },[]);

  async function doPrint(html: string, label: string) {
    setPrintJob({ status:"printing", html, label });
    const result = await agentPrint(html);
    setPrintJob(j=>j?{...j, status:result}:null);
    if (result !== "fail") setTimeout(()=>setPrintJob(null), 3500);
  }

  // Pending (unpaid) orders that can still be modified before encaissement.
  // Newest first (descending arrival order) so the latest orders stay on top.
  const pendingOrders = invoices
    .filter(i => i.acompte === 0 && i.status === "en attente" && i.type !== "Retour")
    .sort((a, b) => (b.dateRaw ?? b.date).localeCompare(a.dateRaw ?? a.date));

  const [posCatFilter, setPosCatFilter] = useState("all");
  const [posSort, setPosSort] = useState<"nom"|"stock_asc"|"stock_desc"|"bestseller">("nom");
  const [posViewMode, setPosViewMode] = useState<"grid"|"list">("grid");

  const allPosCats = Array.from(new Set(products.map(p => p.categorie).filter(Boolean) as string[]));

  function getStock(p: Product) {
    return entries.filter(e => e.productId === p.id).reduce((s, e) => s + e.qty, 0);
  }

  function getSalesCount(p: Product) {
    return invoices.filter(inv => inv.lines?.some(l => l.productId === p.id)).length;
  }

  const filtered = products
    .filter(p => p.nom.toLowerCase().includes(search.toLowerCase()))
    .filter(p => posCatFilter === "all" || p.categorie === posCatFilter)
    .sort((a, b) => {
      if (posSort === "nom") return a.nom.localeCompare(b.nom);
      if (posSort === "bestseller") return getSalesCount(b) - getSalesCount(a);
      const sa = getStock(a), sb = getStock(b);
      return posSort === "stock_asc" ? sa - sb : sb - sa;
    });
  const cartTotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // ── Vente express : vend un seul produit, encaisse et imprime immédiatement ──
  const [expressModal, setExpressModal] = useState<Product|null>(null);
  const [expQty, setExpQty] = useState("");
  const [expPrice, setExpPrice] = useState("");
  const [expSellUnit, setExpSellUnit] = useState("");
  const [expMethod, setExpMethod] = useState<PaymentMethod>("Espèces");
  const [expUseClientAdvance, setExpUseClientAdvance] = useState(false);
  const [expBusy, setExpBusy] = useState(false);
  const [expDone, setExpDone] = useState(false);

  function openExpress(e: React.MouseEvent, p: Product) {
    e.stopPropagation();
    const defaultUnit = getDefaultSaleUnit(p, boutique);
    const lastPrice = getLastSalePrice(p.id, invoices, defaultUnit);
    setExpressModal(p);
    setExpSellUnit(defaultUnit);
    setExpQty("");
    setExpPrice(lastPrice != null ? String(lastPrice) : "");
    setExpMethod("Espèces");
    setExpUseClientAdvance(false);
    setExpDone(false);
  }

  const expressClient = selectedClientId == null ? undefined : boutique.clients.find(client => client.id === selectedClientId);
  const expressClientAdvance = expressClient == null
    ? 0
    : (boutique.clientAdvances ?? [])
      .filter(advance => advance.clientId === expressClient.id)
      .reduce((sum, advance) => sum + Math.max(0, advance.amount - (advance.allocatedAmount ?? 0)), 0);

  async function confirmExpress(confirmDuplicate = false) {
    if (!expressModal || expBusy) return;
    const sellQtyN = Number(expQty);
    const prix = Number(expPrice);
    if (sellQtyN <= 0 || prix <= 0) return;
    const opts = getSellOptions(expressModal);
    const cat = posCats.find(c => c.nom === expressModal.categorie);
    const baseUnit = cat?.unitVente ?? expressModal.unit;
    const isSell = opts.length > 1 && expSellUnit !== baseUnit;
    const baseQty = isSell ? toBaseQty(sellQtyN, expSellUnit, expressModal) : sellQtyN;
    const line = { productId: expressModal.id, nom: expressModal.nom, qty: baseQty, unit: baseUnit, prixUnit: prix, ...(isSell ? { sellUnit: expSellUnit, sellQty: sellQtyN } : {}) };
    setExpBusy(true);
    try {
      let saved = await createSale({
        boutiqueId:boutique.id,
        clientId:expressClient?.id,
        client:expressClient?.nom ?? "Client comptoir",
        clientTel:expressClient?.tel,
        origin:orderOrigin,
        confirmDuplicate,
        lines:[line],
      });
      if (saved.duplicate_invoice_id) {
        const confirmed = window.confirm(`Une commande identique (${saved.duplicate_invoice_id}) a été créée il y a moins de 30 minutes. Voulez-vous vraiment créer une seconde commande ?`);
        if (!confirmed) return;
        saved = await createSale({
          boutiqueId:boutique.id,
          clientId:expressClient?.id,
          client:expressClient?.nom ?? "Client comptoir",
          clientTel:expressClient?.tel,
          origin:orderOrigin,
          confirmDuplicate:true,
          lines:[line],
        });
      }
      if (!saved.invoice_id || saved.total == null) throw new Error("Réponse de création de commande invalide");
      if (!canEncaissVente) {
        // Sans droit d'encaissement : commande créée en attente, pas de paiement
        const newInv: Invoice = {
          id:saved.invoice_id, clientId:saved.client_id ?? expressClient?.id, client:expressClient?.nom ?? "Client comptoir", clientTel:expressClient?.tel, lines:[line], montant:saved.total, acompte:0,
          date:today(), dateRaw:new Date().toISOString(), dueDate:saved.due_date ?? undefined, status:"en attente", type:"vente",
          operatorId:currentUser.id, operatorNom:currentUser.nom, operatorColor:currentUser.color, origin:orderOrigin,
        };
        onUpdate({ invoices:[...invoices, newInv] });
        logAction("Commande express", `${newInv.id} · ${expressModal.nom} · ${fmt(saved.total)} · en attente`, "🛒");
        setExpDone(true);
        setTimeout(() => { setExpressModal(null); setExpDone(false); setExpBusy(false); }, 1200);
        return;
      }
      const advanceAmount = expUseClientAdvance && expressClient
        ? Math.min(expressClientAdvance, saved.total)
        : 0;
      const paid = advanceAmount > 0
        ? await recordMultiPayment({
            boutiqueId:boutique.id,
            invoiceId:saved.invoice_id,
            payments:[
              ...(saved.total > advanceAmount ? [{ amount:saved.total - advanceAmount, paymentMethod:expMethod }] : []),
              { amount:advanceAmount, paymentMethod:"Avoir client" },
            ],
          })
        : await recordPayment({ boutiqueId:boutique.id, invoiceId:saved.invoice_id, amount:saved.total, paymentMethod:expMethod });
      const paidPayments = "payments" in paid
        ? paid.payments.map(payment => ({
            id:payment.id, amount:payment.amount, paymentMethod:payment.payment_method as PaymentMethod,
            paidAt:payment.paid_at, operatorId:payment.operator_id, operatorName:payment.operator_name,
            batchId:payment.batch_id, source:payment.source,
          }))
        : [{
            id:paid.payment.id, amount:paid.payment.amount, paymentMethod:paid.payment.payment_method as PaymentMethod,
            paidAt:paid.payment.paid_at, operatorId:paid.payment.operator_id, operatorName:paid.payment.operator_name,
            batchId:paid.payment.batch_id, source:paid.payment.source,
          }];
      const newInv: Invoice = {
        id:saved.invoice_id, clientId:saved.client_id ?? expressClient?.id, client:expressClient?.nom ?? "Client comptoir", clientTel:expressClient?.tel, lines:[line], montant:saved.total, acompte:paid.acompte,
        date:today(), dateRaw:new Date().toISOString(), dueDate:saved.due_date ?? undefined, status:"payé", type:"vente",
        operatorId:currentUser.id, operatorNom:currentUser.nom, operatorColor:currentUser.color, paymentMethod:advanceAmount >= saved.total ? "Avoir client" : expMethod,
        payments:paidPayments, origin:orderOrigin,
      };
      const saleEntries: StockEntry[] = paid.stock_deducted
        ? [{ id:Date.now(), productId:line.productId, qty:-line.qty, unit:line.unit, montantDu:0, date:today(), fournisseur:`Vente ${saved.invoice_id}`, invoiceId:saved.invoice_id }]
        : [];
      const allocatedByAdvance = new Map<number,number>();
      if ("advance_allocations" in paid) {
        paid.advance_allocations.forEach(allocation => allocatedByAdvance.set(
          allocation.advance_id,
          (allocatedByAdvance.get(allocation.advance_id) ?? 0) + allocation.amount,
        ));
      }
      const updatedClientAdvances = allocatedByAdvance.size > 0
        ? (boutique.clientAdvances ?? []).map(advance => ({
            ...advance,
            allocatedAmount:(advance.allocatedAmount ?? 0) + (allocatedByAdvance.get(advance.id) ?? 0),
          }))
        : undefined;
      onUpdate({
        invoices:[...invoices, newInv],
        ...(updatedClientAdvances ? { clientAdvances:updatedClientAdvances } : {}),
      });
      const paymentLabel = advanceAmount > 0
        ? `${fmt(advanceAmount)} avoir${saved.total > advanceAmount ? ` + ${expMethod}` : ""}`
        : expMethod;
      logAction("Vente express", `${newInv.id} · ${expressModal.nom} · ${fmt(saved.total)} · ${paymentLabel}`, "⚡");
      setExpDone(true);
      setTimeout(() => doPrint(buildReceiptHtml(newInv, boutique, currentUser.nom), "Ticket de vente"), 150);
      setTimeout(() => {
        setExpressModal(null); setExpDone(false); setExpBusy(false);
        if (newInv.clientId != null) onOrderCreated?.(newInv.clientId, newInv.id, "payment");
      }, 1200);
    } catch (error) {
      setExpBusy(false);
      alert(error instanceof Error ? error.message : (canEncaissVente ? "Vente express impossible" : "Commande express impossible"));
    }
  }

  function openAdd(p: Product) {
    const defaultUnit = getDefaultSaleUnit(p, boutique);
    const lastPrice = getLastSalePrice(p.id, invoices, defaultUnit);
    setAddModal(p);
    setAddSellUnit(defaultUnit);
    setAddQty("");
    setAddPrice(lastPrice != null ? String(lastPrice) : "");
  }
  function confirmAdd() {
    if (!addModal || !addQty || !addPrice || Number(addQty) <= 0) return;
    const sellQtyN = Number(addQty);
    const prix = Number(addPrice);
    const opts = getSellOptions(addModal);
    const cat = posCats.find(c => c.nom === addModal.categorie);
    const baseUnit = cat?.unitVente ?? addModal.unit;
    const isSell = opts.length > 1 && addSellUnit !== baseUnit;
    const baseQty = isSell ? toBaseQty(sellQtyN, addSellUnit, addModal) : sellQtyN;
    const item: CartItem = {
      productId: addModal.id, nom: addModal.nom, img: addModal.img,
      unit: baseUnit, qty: baseQty, prixUnit: prix,
      ...(isSell ? { sellUnit: addSellUnit, sellQty: sellQtyN } : {}),
    };
    setCart(prev => [...prev, item]);
    setAddModal(null);
  }
  function removeFromCart(lineIndex: number) { setCart(prev => prev.filter((_, index) => index !== lineIndex)); }
  function updateCartQty(lineIndex: number, newDispQty: number) {
    if (newDispQty <= 0) { removeFromCart(lineIndex); return; }
    setCart(prev => prev.map((item, index) => {
      if (index !== lineIndex) return item;
      if (item.sellUnit && item.sellQty !== undefined) {
        const p = products.find(pr => pr.id === item.productId);
        const newBase = p ? toBaseQty(newDispQty, item.sellUnit, p) : newDispQty;
        return { ...item, sellQty: newDispQty, qty: newBase };
      }
      return { ...item, qty: newDispQty };
    }));
  }
  function updateCartPrice(lineIndex: number, newPrice: number) {
    if (!Number.isFinite(newPrice) || newPrice < 0) return;
    setCart(prev => prev.map((item, index) => index === lineIndex ? { ...item, prixUnit:newPrice } : item));
  }

  function askCancelOrder(inv: Invoice) {
    if (!canCancelOrder(inv)) {
      alert(inv.origin === "client_profile"
        ? "Cette commande a été créée depuis Clients. Gérez-la depuis la fiche client."
        : "Vous n’avez pas le droit d’annuler cette commande.");
      return;
    }
    setCancelReason("");
    setCancelConfirmation(inv);
  }

  async function handleCancelOrder(inv: Invoice): Promise<boolean> {
    if (cancelBusy) return false;
    if (!canCancelOrder(inv)) {
      alert("Vous n’avez pas le droit d’annuler cette commande.");
      return false;
    }
    setCancelBusy(inv.id);
    try {
      const result = await cancelPendingInvoice({ boutiqueId:boutique.id, invoiceId:inv.id, reason:cancelReason, originContext:"pos" });
      onUpdate({ invoices: invoices.map(invoice => invoice.id === inv.id ? {
        ...invoice,
        status:"annulée",
        cancelReason:result.cancel_reason ?? undefined,
        cancelledAt:result.cancelled_at,
        cancelledBy:result.cancelled_by ?? undefined,
      } : invoice) });
      setCancelConfirmation(null);
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Annulation impossible");
      return false;
    } finally {
      setCancelBusy(null);
    }
  }

  function handleEditOrder(inv: Invoice) {
    if (!canEditPendingOrder(inv)) {
      alert("Vous pouvez uniquement modifier les commandes que vous avez créées.");
      return;
    }
    if (!inv.lines?.length) return;
    const cartItems: CartItem[] = inv.lines.map(l => ({
      productId: l.productId, nom: l.nom,
      img: products.find(p => p.id === l.productId)?.img ?? "",
      unit: l.unit, qty: l.qty, prixUnit: l.prixUnit,
      sellUnit: l.sellUnit, sellQty: l.sellQty,
    }));
    setCart(cartItems);
    setClientNom(inv.client === "Client comptoir" ? "" : inv.client);
    setClientTel(inv.clientTel ?? "+221 ");
    setSelectedClientId(inv.clientId);
    setEditingInvoice(inv);
    setOrderOrigin(inv.origin ?? "pos");
    setPosTab("produits");
    setCheckoutOpen(true);
  }

  function resetCheckout() {
    setCart([]); setClientNom(""); setClientTel("+221 "); setSelectedClientId(undefined);
    setCheckoutOpen(false); setDone(false); setLastInv(null); setEditingInvoice(null); setOrderOrigin("pos");
  }

  async function checkout() {
    if (cart.length === 0 || submittingOrder) return;
    const client = clientNom.trim() || "Client comptoir";
    const orderLines = cart.map(i => ({ productId: i.productId, nom: i.nom, qty: i.qty, unit: i.unit, prixUnit: i.prixUnit, sellUnit: i.sellUnit, sellQty: i.sellQty }));
    setSubmittingOrder(true);
    try {
      let saved = editingInvoice
        ? await updatePendingInvoice({ boutiqueId:boutique.id, invoiceId:editingInvoice.id, clientId:selectedClientId, client, clientTel:clientTel.trim() || undefined, lines:orderLines })
        : await createSale({ boutiqueId:boutique.id, clientId:selectedClientId, client, clientTel:clientTel.trim() || undefined, origin:orderOrigin, lines:orderLines });
      if (!editingInvoice) {
        let created = saved as Awaited<ReturnType<typeof createSale>>;
        if (created.duplicate_invoice_id) {
          const confirmed = window.confirm(`Une commande identique (${created.duplicate_invoice_id}) a été créée il y a moins de 30 minutes. Voulez-vous vraiment créer une seconde commande ?`);
          if (!confirmed) return;
          created = await createSale({ boutiqueId:boutique.id, clientId:selectedClientId, client, clientTel:clientTel.trim() || undefined, origin:orderOrigin, confirmDuplicate:true, lines:orderLines });
        }
        saved = created;
      }
      if (!saved.invoice_id || saved.total == null) throw new Error("Réponse de création de commande invalide");
      const newInv: Invoice = {
        ...(editingInvoice ?? {}),
        id:saved.invoice_id, clientId:saved.client_id ?? selectedClientId, client, clientTel:clientTel.trim() || undefined, lines:orderLines,
        montant:saved.total, acompte:0, date:today(), dateRaw:new Date().toISOString(), dueDate:saved.due_date ?? undefined,
        status:"en attente", type:"vente", operatorId:editingInvoice?.operatorId ?? currentUser.id, operatorNom:editingInvoice?.operatorNom ?? currentUser.nom, operatorColor:editingInvoice?.operatorColor ?? currentUser.color, origin:editingInvoice?.origin ?? orderOrigin,
      };
      onUpdate({ invoices:editingInvoice ? invoices.map(invoice => invoice.id === editingInvoice.id ? newInv : invoice) : [...invoices, newInv] });
      if (!editingInvoice) logAction("Commande PDV", `${newInv.id} · ${client} · ${fmt(saved.total)}`, "🛒");
      setTimeout(() => doPrint(buildOrderTicketHtml(newInv, boutique, currentUser.nom), "Bon de commande"), 200);
      if (!editingInvoice && orderOrigin === "client_profile" && selectedClientId != null && newInv.clientId != null) {
        onOrderCreated?.(newInv.clientId, newInv.id);
        return;
      }
      setEditingInvoice(null);
      setLastInv(newInv);
      setDone(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d’enregistrer la commande");
    } finally {
      setSubmittingOrder(false);
    }
  }

  // ── Vente (la caisse a été déplacée vers l'écran Factures) ───────────────────
  return (
    <div data-screen-source="relational-pos" className="space-y-3 pb-36">

      <div className="rounded-2xl border border-border bg-card px-3 py-2.5 flex items-center gap-3">
        <Printer size={16} className={pa.status==="connected" ? "text-emerald-600" : "text-muted-foreground"}/>
        <div className="min-w-0 flex-1"><p className="text-xs font-black">Imprimante QZ Tray</p><p className="truncate text-xs text-muted-foreground">{pa.status==="connected" ? (printerName || pa.printer || "Sélectionnez une imprimante") : "Non connectée"}</p></div>
        <button onClick={()=>setPrinterOpen(true)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold"><Settings size={14} className="inline mr-1"/>Configurer</button>
      </div>
      {printerOpen && <Modal title="Imprimante QZ Tray" color={POS_COLOR} onClose={()=>setPrinterOpen(false)}>
        <p className="mb-3 text-sm text-muted-foreground">QZ Tray doit être installé et ouvert sur ce poste. À la première utilisation, acceptez la demande locale de QZ Tray.</p>
        <button onClick={connectPrinter} disabled={qzBusy} className="w-full rounded-2xl bg-slate-800 py-3 font-black text-white disabled:opacity-50">{qzBusy ? "Connexion…" : pa.status==="connected" ? "Actualiser les imprimantes" : "Connecter QZ Tray"}</button>
        {pa.status==="disconnected" && pa.lastError && <p className="mt-3 text-sm font-medium text-red-700">{pa.lastError}</p>}
        {pa.status==="connected" && <div className="mt-4 space-y-2"><p className="text-xs font-black">IMPRIMANTE DE CE POSTE</p>{pa.printers.length ? pa.printers.map((name:string)=><button key={name} onClick={()=>selectPrinter(name)} className="flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-sm font-bold"><Printer size={16}/><span className="flex-1">{name}</span>{printerName===name&&<CheckCircle size={16} className="text-emerald-600"/>}</button>) : <p className="text-sm text-muted-foreground">Aucune imprimante détectée.</p>}</div>}
        {pa.status!=="connected" && <a className="mt-4 block text-center text-sm font-bold text-blue-700 underline" href="https://qz.io/download" target="_blank" rel="noreferrer">Télécharger QZ Tray</a>}
      </Modal>}

      {/* Two tabs: Produits / Commandes */}
      <div className="flex bg-card rounded-2xl p-1 border border-border gap-1">
        <button onClick={()=>setPosTab("produits")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all"
          style={{ background:posTab==="produits"?"#1f2937":"transparent", color:posTab==="produits"?"#fff":"#9a9070" }}>
          <ShoppingBag size={18}/> Produits
        </button>
        <button onClick={()=>setPosTab("commandes")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all relative"
          style={{ background:posTab==="commandes"?"#1f2937":"transparent", color:posTab==="commandes"?"#fff":"#9a9070" }}>
          <ClipboardList size={18}/> Commandes
          {pendingOrders.length > 0 && (
            <span className="absolute top-1.5 right-3 w-5 h-5 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:SEM.danger.accent, border:"2px solid var(--card)" }}>
              {pendingOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Produits ── */}
      {posTab==="produits" && <>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher un produit…" className={searchInputCls+" pl-10"}/>
        </div>
        {/* Category filter + sort */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
            {["all", ...allPosCats].map(cat => (
              <button key={cat} onClick={() => setPosCatFilter(cat)}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: posCatFilter === cat ? "#1f2937" : "#f3f4f6", color: posCatFilter === cat ? "#fff" : "#374151" }}>
                {cat === "all" ? "Tous" : cat}
              </button>
            ))}
          </div>
          <select value={posSort} onChange={e => setPosSort(e.target.value as typeof posSort)}
            className="flex-shrink-0 text-xs font-bold rounded-xl px-2.5 py-1.5 border-0 outline-none"
            style={{ background:"#EEE9D8", color:"#7A7055" }}>
            <option value="bestseller">⭐ Best seller</option>
            <option value="nom">A→Z</option>
            <option value="stock_desc">Stock ↓</option>
            <option value="stock_asc">Stock ↑</option>
          </select>
          <button onClick={() => setPosViewMode(v => v === "grid" ? "list" : "grid")}
            className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "#EEE9D8" }}>
            {posViewMode === "grid"
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="0" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="5" width="6" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="6" height="3" rx="1" fill="#7A7055"/><rect x="8" y="10" width="6" height="3" rx="1" fill="#7A7055"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="5" width="14" height="3" rx="1" fill="#7A7055"/><rect x="0" y="10" width="14" height="3" rx="1" fill="#7A7055"/></svg>}
          </button>
        </div>

        {posViewMode === "list" ? (
          <div className="space-y-2">
            {filtered.map(p => {
              const inCart = cart.find(i => i.productId === p.id);
              const stock = productQty(p.id, entries);
              const isNegative = stock < 0;
              return (
                <div key={p.id} className="relative">
                <button onClick={() => openAdd(p)}
                  className="w-full bg-card rounded-2xl border text-left flex items-center gap-3 p-3 transition-transform active:scale-[0.98]"
                  style={{ borderColor: inCart ? POS_COLOR+"66" : isNegative ? "#fecaca" : "var(--border)" }}>
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 relative">
                    <img src={imgSrc(p.img,120,120)} alt={p.nom} className="w-full h-full object-cover"/>
                    {isNegative && <div className="absolute inset-0 bg-red-950/60 flex items-center justify-center"><span className="text-white text-xs font-black" style={{fontSize:"8px"}}>ÉCART À VÉRIFIER</span></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">Stock : {stock} {p.unit}</p>
                    {p.categorie && <span className="text-xs px-1.5 py-0.5 rounded font-bold mt-0.5 inline-block" style={{ background:"#EEE9D8", color:"#7A7055" }}>{p.categorie}</span>}
                  </div>
                  {inCart && (
                    <div className="flex-shrink-0 text-right mr-12">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white ml-auto" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <p className="text-xs font-black mt-1" style={{ color:POS_COLOR }}>{fmt(lineTotal(inCart))}</p>
                    </div>
                  )}
                </button>
                <button onClick={(e)=>openExpress(e,p)} title={canEncaissVente ? "Vente express" : "Commande express"}
                    className="absolute top-1/2 -translate-y-1/2 right-2.5 flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-black active:scale-90"
                    style={{ background:SEM.success.accent, color:"#fff" }}>
                    <Zap size={14}/>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(p => {
            const inCart = cart.find(i => i.productId === p.id);
            const stock = productQty(p.id, entries);
            const isNegative = stock < 0;
            return (
              <div key={p.id} className="relative">
              <button onClick={() => openAdd(p)}
                className="w-full bg-card rounded-2xl overflow-hidden border text-left relative transition-transform active:scale-95"
                style={{ borderColor: inCart ? POS_COLOR+"66" : isNegative ? "#fecaca" : "var(--border)" }}>
                <div className="w-full h-36 relative overflow-hidden">
                  <img src={imgSrc(p.img,300,300)} alt={p.nom} className="w-full h-full object-cover"/>
                  {inCart && (
                    <div className="absolute inset-0 flex flex-col justify-between p-2">
                      <div className="self-end w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background:POS_COLOR }}>{inCart.qty}</div>
                      <div className="w-full rounded-xl py-1 px-2 text-center text-xs font-black text-white" style={{ background:POS_COLOR+"cc" }}>{fmt(inCart.qty * inCart.prixUnit)}</div>
                    </div>
                  )}
                  {isNegative && (<div className="absolute inset-0 bg-red-950/60 flex items-center justify-center"><span className="text-white text-xs font-black tracking-wide">ÉCART À VÉRIFIER</span></div>)}
                </div>
                <div className="p-2.5">
                  <p className="font-black text-base truncate leading-tight">{p.nom}</p>
                  <p className="text-sm font-semibold text-muted-foreground mt-0.5">Stock : {stock} {p.unit}</p>
                </div>
              </button>
              {!inCart && (
                <button onClick={(e)=>openExpress(e,p)} title={canEncaissVente ? "Vente express" : "Commande express"}
                  className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-black active:scale-90 shadow-lg"
                  style={{ background:SEM.success.accent, color:"#fff" }}>
                  <Zap size={13}/> Express
                </button>
              )}
              </div>
            );
          })}
        </div>
        )}
      </>}

      {/* ── Tab: Commandes en attente ── */}
      {posTab==="commandes" && <>
        {pendingOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={{ background:SEM.warning.bg }}>
              <ClipboardList size={30} style={{ color:SEM.warning.accent }}/>
            </div>
            <p className="font-black text-base" style={{ color:SEM.warning.accent }}>Aucune commande en attente</p>
            <p className="text-sm text-muted-foreground text-center px-8">Les commandes créées par le vendeur et non encore encaissées apparaîtront ici.</p>
            <button onClick={()=>setPosTab("produits")} className="mt-2 px-5 py-3 rounded-2xl font-black text-sm active:scale-95" style={{ background:POS_COLOR, color:"#fff" }}>
              + Nouvelle commande
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingOrders.map(inv => (
              <div key={inv.id} className="bg-card rounded-2xl border overflow-hidden" style={{ borderColor:SEM.warning.accent+"33" }}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background:SEM.warning.bg }}>
                    <ClipboardList size={20} style={{ color:SEM.warning.accent }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-base truncate">{inv.client}</p>
                    <p className="text-sm text-muted-foreground">{inv.id} · {(inv.lines?.length ?? 0)} article(s)</p>
                    {inv.origin === "client_profile" && <p className="mt-1 text-[11px] font-bold" style={{color:"#0e7490"}}>Créée depuis Clients</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-black text-lg" style={{ color:SEM.warning.accent, fontFamily:"'Nunito', sans-serif" }}>{fmt(inv.montant)}</p>
                    <p className="text-xs text-muted-foreground">{formatPreciseDateTime(inv.dateRaw) === "—" ? inv.date : formatPreciseDateTime(inv.dateRaw)}</p>
                  </div>
                </div>
                {inv.lines && inv.lines.length > 0 && (
                  <div className="px-4 pb-3 space-y-1">
                    {inv.lines.map((l,i) => (
                      <div key={i} className="flex justify-between items-center text-sm px-3 py-1.5 rounded-xl" style={{ background:SEM.warning.bg }}>
                        <span className="font-semibold truncate flex-1">{l.nom}</span>
                        <span className="text-muted-foreground ml-2 flex-shrink-0">{l.qty} {l.unit} × {fmt(l.prixUnit)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex border-t divide-x" style={{ borderColor:SEM.warning.accent+"22" }}>
                  <button onClick={()=>silentPrint(buildOrderTicketHtml(inv, boutique, currentUser.nom, true))}
                    className="flex-1 flex items-center justify-center gap-1.5 py-3 font-bold text-sm active:scale-95" style={{ color:"#6b7280" }}>
                    🖨 Réimprimer
                  </button>
                  {inv.origin === "client_profile" ? (
                    <div className="flex-[2] flex items-center justify-center px-3 text-center text-xs font-medium text-muted-foreground" title="Cette commande a été créée depuis Clients, gérez-la depuis cet écran.">
                      Créée depuis Clients — gérez-la depuis la fiche client
                    </div>
                  ) : (canEditPendingOrder(inv) || canCancelOrder(inv)) ? <>
                    {canEditPendingOrder(inv) && <button onClick={()=>handleEditOrder(inv)} disabled={!!cancelBusy}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 font-bold text-sm active:scale-95" style={{ color:POS_COLOR }}>
                      <Pencil size={14}/> Modifier
                    </button>}
                    {canCancelOrder(inv) && <button onClick={()=>askCancelOrder(inv)} disabled={cancelBusy===inv.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-3 font-bold text-sm active:scale-95" style={{ color:"#ef4444" }}>
                      {cancelBusy===inv.id ? "…" : <><Trash2 size={14}/> Annuler</>}
                    </button>}
                  </> : (
                    <div className="flex-[2] flex items-center justify-center px-3 text-center text-xs font-medium text-muted-foreground">
                      {canManagePendingOrder(inv) ? "Droit d’annulation requis" : `Créée par ${inv.operatorNom ?? "un autre utilisateur"}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </>}

      {/* Sticky cart bar */}
      {cart.length > 0 && !checkoutOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-20">
          <button onClick={() => setCheckoutOpen(true)}
            className="w-full py-4 rounded-2xl flex items-center justify-between px-5 active:scale-95 transition-transform"
            style={{ background:POS_COLOR, boxShadow:`0 8px 32px ${POS_COLOR}55` }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><ShoppingBag size={16} color="white"/></div>
              <span className="text-white font-black">{cartCount} article{cartCount>1?"s":""} · Valider commande</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-black text-lg" style={{ fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
              <ChevronRight size={18} color="white"/>
            </div>
          </button>
        </div>
      )}

      {/* Checkout modal */}
      {checkoutOpen && (
        <Modal title={editingInvoice ? `Modifier ${editingInvoice.id}` : "Nouvelle commande"} color={POS_COLOR} onClose={resetCheckout}>
          {!done ? (<>
            <div className="space-y-2">
              {cart.map((item, lineIndex) => {
                const dQty = lineDispQty(item);
                const dUnit = lineDispUnit(item);
                const dTotal = lineTotal(item);
                return (
                <div key={`${item.productId}-${item.prixUnit}-${lineIndex}`} className="flex items-center gap-3 bg-muted rounded-2xl p-3">
                  <img src={imgSrc(item.img,80,80)} alt={item.nom} className="w-12 h-12 rounded-xl object-cover flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-sm truncate">{item.nom}</p>
                      {item.sellUnit && <span className="text-xs font-bold px-1.5 py-0.5 rounded-lg ml-1 flex-shrink-0" style={{ background:POS_COLOR+"18", color:POS_COLOR }}>{item.sellUnit}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button onClick={()=>updateCartQty(lineIndex, dQty-1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Minus size={12} style={{ color:POS_COLOR }}/></button>
                      <span className="text-base font-black w-8 text-center">{dQty}</span>
                      <button onClick={()=>updateCartQty(lineIndex, dQty+1)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:POS_COLOR+"22" }}><Plus size={12} style={{ color:POS_COLOR }}/></button>
                      {editingInvoice ? (
                        <label className="ml-1 flex items-center gap-1 text-xs text-muted-foreground">
                          {dUnit} ×
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={item.prixUnit}
                            onChange={event=>updateCartPrice(lineIndex, Number(event.target.value))}
                            className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs font-black text-foreground"
                            aria-label={`Prix unitaire de ${item.nom}`}
                          />
                        </label>
                      ) : (
                        <span className="text-xs text-muted-foreground ml-0.5">{dUnit} × {fmt(item.prixUnit)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <p className="font-black text-base" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(dTotal)}</p>
                    <button onClick={()=>removeFromCart(lineIndex)} className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"#ef444415" }}><Trash2 size={11} style={{ color:"#ef4444" }}/></button>
                  </div>
                </div>
                );
              })}
            </div>
            {/* Inline product selector (add article to order) */}
            <div className="rounded-2xl border-2 border-dashed overflow-hidden" style={{ borderColor:POS_COLOR+"44" }}>
              <p className="text-xs font-black tracking-wider px-3 py-2" style={{ color:POS_COLOR }}>+ AJOUTER UN ARTICLE</p>
              <div className="grid grid-cols-2 gap-2 px-3 pb-3" style={{ maxHeight:"200px", overflowY:"auto", scrollbarWidth:"none" }}>
                {products.map(p=>{
                  const matchingLines=cart.filter(i=>i.productId===p.id);
                  const inCart=matchingLines[0];
                  const totalInCart=matchingLines.reduce((sum,line)=>sum+lineDispQty(line),0);
                  return (
                    <button key={p.id} onClick={()=>openAdd(p)} className="flex items-center gap-2 rounded-xl p-2 text-left transition-colors active:scale-95"
                      style={{ background:inCart?POS_COLOR+"15":"#EEE9D8", border:inCart?`2px solid ${POS_COLOR}44`:"2px solid transparent" }}>
                      <img src={imgSrc(p.img,60,60)} alt={p.nom} className="w-10 h-10 rounded-lg object-cover flex-shrink-0"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{p.nom}</p>
                        <p className="text-xs text-muted-foreground">{productQty(p.id,entries)} {p.unit}</p>
                        {inCart&&<p className="text-xs font-bold" style={{ color:POS_COLOR }}>Dans la vente : {totalInCart} {lineDispUnit(inCart)}{matchingLines.length>1?` · ${matchingLines.length} tarifs`:""}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="font-black tracking-wide" style={{ color:POS_COLOR }}>TOTAL</span>
              <span className="text-2xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(cartTotal)}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-black flex-shrink-0" style={{ background:currentUser.color }}>{currentUser.initials}</div>
              <span className="text-xs text-muted-foreground">Opérateur : <span className="font-semibold text-foreground">{currentUser.nom}</span></span>
            </div>
            <Field label="NOM DU CLIENT (optionnel)" color={POS_COLOR}>
              <input value={clientNom} onChange={e=>{setClientNom(e.target.value);setSelectedClientId(undefined);}} placeholder="Client comptoir" className={inputCls} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();(e.currentTarget.closest("div")?.nextElementSibling?.querySelector("input") as HTMLInputElement|null)?.focus();}}}/>
            </Field>
            <Field label="TÉLÉPHONE (optionnel)" color={POS_COLOR}>
              <input value={clientTel} onChange={e=>{ const v=e.target.value; setClientTel(v.startsWith("+221 ")?v:"+221 "); setSelectedClientId(undefined); }} placeholder="+221 77 000 0000" className={inputCls} onKeyDown={e=>e.key==="Enter"&&checkout()}/>
            </Field>
            <button disabled={submittingOrder || cart.length===0} onClick={checkout} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              <ClipboardList size={18}/> {submittingOrder ? "Enregistrement…" : editingInvoice ? "Enregistrer les modifications" : "Enregistrer la commande"}
            </button>
          </>) : (<>
            <div className="flex flex-col items-center gap-3 py-5 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={40} style={{ color:SEM.success.accent }}/>
              <div className="text-center">
                <p className="font-black text-lg" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>Commande enregistrée ✓</p>
                <p className="text-sm text-muted-foreground mt-0.5">{lastInv?.id} · {lastInv?.client} · {fmt(lastInv?.montant ?? 0)}</p>
              </div>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:"#3b82f611", color:"#3b82f6" }}>
              <span>🖨️</span>
              <span className="text-sm font-semibold">Bon de commande imprimé automatiquement</span>
            </div>
            <div className="px-4 py-3 rounded-xl flex items-center gap-2" style={{ background:SEM.warning.bg, color:SEM.warning.accent }}>
              <AlertCircle size={16}/> <span className="text-sm font-semibold">Le client présente ce bon au caissier pour encaissement</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => lastInv && silentPrint(buildOrderTicketHtml(lastInv, boutique, currentUser.nom, true))}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95 border-2"
                style={{ borderColor:POS_COLOR, color:POS_COLOR, background:"transparent" }}>
                🖨 Réimprimer
              </button>
              <button onClick={()=>{ resetCheckout(); setPosTab("commandes"); }}
                className="py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-1.5 active:scale-95"
                style={{ background:SEM.warning.accent+"22", color:SEM.warning.accent }}>
                <ClipboardList size={15}/> Commandes
              </button>
            </div>
            <button onClick={resetCheckout}
              className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95"
              style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              + Nouvelle commande
            </button>
          </>)}
        </Modal>
      )}

      {cancelConfirmation && (
        <Modal title="Annuler la commande" color="#ef4444" onClose={()=>{ if (!cancelBusy) setCancelConfirmation(null); }}>
          <p className="text-sm text-muted-foreground">Es-tu sûr de vouloir annuler cette commande&nbsp;? Elle restera conservée dans l’historique avec le statut <strong>Annulée</strong>.</p>
          <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm font-bold">{cancelConfirmation.id} · {cancelConfirmation.client} · {fmt(cancelConfirmation.montant)}</div>
          <Field label="MOTIF D’ANNULATION (optionnel)" color="#ef4444">
            <input value={cancelReason} onChange={event=>setCancelReason(event.target.value)} placeholder="Ex. erreur de saisie, doublon, client a annulé" className={inputCls}/>
          </Field>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={()=>setCancelConfirmation(null)} disabled={!!cancelBusy} className="rounded-xl bg-muted py-3 text-sm font-black disabled:opacity-50">Conserver</button>
            <button type="button" onClick={()=>void handleCancelOrder(cancelConfirmation)} disabled={!!cancelBusy} className="rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50">{cancelBusy ? "Annulation…" : "Oui, annuler"}</button>
          </div>
        </Modal>
      )}

      {/* Vente express modal */}
      {expressModal && (
        <Modal title={`${canEncaissVente ? "Vente express" : "Commande express"} — ${expressModal.nom}`} color={POS_COLOR} onClose={() => { if (!expBusy) setExpressModal(null); }}>
          {expDone ? (
            <div className="flex flex-col items-center gap-3 py-6 rounded-2xl" style={{ background:SEM.success.bg }}>
              <CheckCircle size={40} style={{ color:SEM.success.accent }}/>
              <p className="font-black text-lg" style={{ color:SEM.success.accent, fontFamily:"'Nunito', sans-serif" }}>
                {canEncaissVente ? "Vente encaissée ✓" : "Commande enregistrée ✓"}
              </p>
              <p className="text-sm text-muted-foreground">{canEncaissVente ? (expressClient ? "Encaissement enregistré dans la fiche client" : "Ticket imprimé automatiquement") : "En attente d'encaissement"}</p>
            </div>
          ) : (<>
            <div className="flex gap-4 items-center">
              <img src={imgSrc(expressModal.img,160,160)} alt={expressModal.nom} className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"/>
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Stock disponible</p>
                <p className="text-2xl font-black mt-0.5" style={{ fontFamily:"'Nunito', sans-serif", color:POS_COLOR }}>
                  {productQty(expressModal.id, entries)}<span className="text-sm font-normal ml-1 text-muted-foreground">{expressModal.unit}</span>
                </p>
              </div>
            </div>
            {expressClient&&<div className="rounded-2xl border p-3" style={{background:"#f8fafc",borderColor:POS_COLOR+"33"}}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black" style={{color:POS_COLOR}}>VENTE POUR {expressClient.nom.toUpperCase()}</p><p className="mt-1 text-xs text-muted-foreground">Client sélectionné depuis sa fiche.</p></div>
                <p className="text-xs font-black text-right" style={{color:expressClientAdvance>0?"#0f766e":"#6b7280"}}>{expressClientAdvance>0?`🎟️ ${fmt(expressClientAdvance)}`:"Aucun avoir"}</p>
              </div>
              {canEncaissVente && expressClientAdvance>0&&<button type="button" onClick={()=>setExpUseClientAdvance(value=>!value)} className="mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-black" style={{background:expUseClientAdvance?"#0f766e":"#ccfbf1",color:expUseClientAdvance?"#fff":"#0f766e"}}>{expUseClientAdvance ? "✓ Avoir ajouté au paiement" : "🎟️ Utiliser l'avoir disponible"}</button>}
              {canEncaissVente && expUseClientAdvance&&<p className="mt-2 text-xs font-semibold" style={{color:"#0f766e"}}>L'avoir couvrira d'abord la vente ; le reste éventuel sera réglé par le mode choisi ci-dessous.</p>}
              {!canEncaissVente && expressClientAdvance>0&&<p className="mt-2 text-xs font-semibold" style={{color:"#0f766e"}}>L'avoir sera proposé au caissier lors de l'encaissement.</p>}
            </div>}
            {getSellOptions(expressModal).length > 1 && (
              <Field label="VENDRE PAR" color={POS_COLOR}>
                <div className="flex gap-2">
                  {getSellOptions(expressModal).map(u => (
                    <button key={u} onClick={() => { setExpSellUnit(u); setExpQty(""); const last = getLastSalePrice(expressModal.id, invoices, u); setExpPrice(last != null ? String(last) : ""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"
                      style={{ background: expSellUnit === u ? POS_COLOR : POS_COLOR+"22", color: expSellUnit === u ? "#fff" : POS_COLOR }}>{u}</button>
                  ))}
                </div>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={`QUANTITÉ (${expSellUnit})`} color={POS_COLOR}>
                <div className="flex items-center gap-2">
                  <button onClick={()=>setExpQty(q=>String(Math.max(1,Number(q)-1)))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Minus size={14} style={{ color:POS_COLOR }}/></button>
                  <input value={expQty} onChange={e=>setExpQty(e.target.value)} type="number" className={inputCls+" text-center font-black"} autoFocus/>
                  <button onClick={()=>setExpQty(q=>String(Number(q)+1))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Plus size={14} style={{ color:POS_COLOR }}/></button>
                </div>
              </Field>
              <Field label={`PRIX / ${expSellUnit.toUpperCase()}`} color={POS_COLOR}>
                <input value={expPrice} onChange={e=>setExpPrice(e.target.value)} type="number" placeholder="0 F" className={inputCls+" text-center font-black"}/>
              </Field>
            </div>
            {canEncaissVente ? (
              <Field label={expUseClientAdvance ? "MODE POUR LE COMPLÉMENT ÉVENTUEL" : "MODE DE PAIEMENT"} color={POS_COLOR}>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m} onClick={()=>setExpMethod(m)} className="py-2.5 rounded-xl text-xs font-bold" style={{ background: expMethod===m?POS_COLOR:"#EEE9D8", color: expMethod===m?"#fff":"#6b7280" }}>{PM_ICON[m]} {m}</button>
                  ))}
                </div>
              </Field>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold" style={{ background:"#fffbeb", color:"#92400e" }}>
                <AlertCircle size={16}/> Commande en attente — l'encaissement sera effectué par la caisse
              </div>
            )}
            {Number(expQty)>0 && Number(expPrice)>0 && (
              <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
                <span className="text-sm font-bold" style={{ color:POS_COLOR }}>{canEncaissVente ? "Total à encaisser" : "Total commandé"}</span>
                <span className="text-xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(Number(expQty)*Number(expPrice))}</span>
              </div>
            )}
            <button disabled={expBusy || !Number(expQty) || !Number(expPrice)} onClick={()=>confirmExpress()} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60" style={{ background:POS_COLOR, color:"#fff", fontFamily:"'Nunito', sans-serif" }}>
              <Zap size={18}/> {expBusy ? "En cours…" : canEncaissVente ? "Vendre & imprimer" : "Valider la commande"}
            </button>
          </>)}
        </Modal>
      )}
      {/* Quick-add modal — must be LAST so it renders above checkout modal */}
      {addModal && (
        <Modal title={addModal.nom} color={POS_COLOR} onClose={() => setAddModal(null)}>
          <div className="flex gap-4 items-center">
            <img src={imgSrc(addModal.img,160,160)} alt={addModal.nom} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0"/>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">Stock disponible</p>
              <p className="text-3xl font-black mt-0.5" style={{ fontFamily:"'Nunito', sans-serif", color:POS_COLOR }}>
                {productQty(addModal.id, entries)}<span className="text-base font-normal ml-1 text-muted-foreground">{addModal.unit}</span>
              </p>
            </div>
          </div>
          {getSellOptions(addModal).length > 1 && (
            <Field label="VENDRE PAR" color={POS_COLOR}>
              <div className="flex gap-2">
                {getSellOptions(addModal).map(u => (
                  <button key={u} onClick={() => { setAddSellUnit(u); setAddQty(""); const last = getLastSalePrice(addModal.id, invoices, u); setAddPrice(last != null ? String(last) : ""); }} className="flex-1 py-3 rounded-xl text-sm font-bold"
                    style={{ background: addSellUnit === u ? POS_COLOR : POS_COLOR+"22", color: addSellUnit === u ? "#fff" : POS_COLOR }}>
                    {getSaleUnitLabel(addModal, boutique, u)}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={`QUANTITÉ (${addSellUnit})`} color={POS_COLOR}>
              <div className="flex items-center gap-2">
                <button onClick={()=>setAddQty(q=>String(Math.max(1,Number(q)-1)))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Minus size={14} style={{ color:POS_COLOR }}/></button>
                <input value={addQty} onChange={e=>setAddQty(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" className={inputCls+" text-center font-black"} autoFocus/>
                <button onClick={()=>setAddQty(q=>String(Number(q)+1))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:POS_COLOR+"22" }}><Plus size={14} style={{ color:POS_COLOR }}/></button>
              </div>
            </Field>
            <Field label={`PRIX / ${addSellUnit.toUpperCase()}`} color={POS_COLOR}>
              <input value={addPrice} onChange={e=>setAddPrice(e.target.value)} onKeyDown={e=>e.key==="Enter"&&Number(addQty)>0&&Number(addPrice)>0&&confirmAdd()} type="number" placeholder="0 F" className={inputCls+" text-center font-black"}/>
            </Field>
          </div>
          {Number(addQty) > 0 && sellConversion(Number(addQty), addSellUnit, addModal) && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: POS_COLOR+"12" }}>
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: POS_COLOR }}/>
              <span className="text-xs font-bold" style={{ color: POS_COLOR }}>
                {Number(addQty)} {addSellUnit} = {sellConversion(Number(addQty), addSellUnit, addModal)}
              </span>
            </div>
          )}
          {Number(addQty)>0 && Number(addPrice)>0 && (
            <div className="flex justify-between items-center px-4 py-3 rounded-2xl" style={{ background:POS_COLOR+"15" }}>
              <span className="text-sm font-bold" style={{ color:POS_COLOR }}>Sous-total</span>
              <span className="text-xl font-black" style={{ color:POS_COLOR, fontFamily:"'Nunito', sans-serif" }}>{fmt(Number(addQty)*Number(addPrice))}</span>
            </div>
          )}
          <SubmitBtn color={POS_COLOR} label="Ajouter au panier" onClick={confirmAdd} disabled={!addQty||!addPrice||Number(addQty)<=0||Number(addPrice)<=0}/>
        </Modal>
      )}

      {/* ── Print status bar (fixed, above nav) ── */}
      {printJob && (
        <div className="fixed bottom-20 left-3 right-3 z-[200] pointer-events-none">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl border pointer-events-auto" style={{
            background: printJob.status==="ok" ? "#f0fdf4" : printJob.status==="fail" ? "#fef2f2" : printJob.status==="fallback" ? "#fffbeb" : "#f8fafc",
            borderColor: printJob.status==="ok" ? "#bbf7d0" : printJob.status==="fail" ? "#fecaca" : printJob.status==="fallback" ? "#fde68a" : "#e2e8f0",
          }}>
            {printJob.status==="printing" && <div className="w-4 h-4 rounded-full border-2 border-slate-400 border-t-transparent animate-spin flex-shrink-0"/>}
            {printJob.status==="ok"       && <span className="text-green-600 text-lg flex-shrink-0 leading-none">✓</span>}
            {printJob.status==="fallback" && <span className="text-amber-500 text-lg flex-shrink-0 leading-none">🖨️</span>}
            {printJob.status==="fail"     && <span className="text-red-500 text-lg flex-shrink-0 leading-none">✗</span>}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-tight" style={{
                color: printJob.status==="ok" ? "#166534" : printJob.status==="fail" ? "#991b1b" : printJob.status==="fallback" ? "#92400e" : "#334155",
              }}>
                {printJob.status==="printing" && `Impression en cours — ${printJob.label}…`}
                {printJob.status==="ok"       && `${printJob.label} imprimé ✓`}
                {printJob.status==="fallback" && `${printJob.label} envoyé (dialogue système)`}
                {printJob.status==="fail"     && `Échec — ${printJob.label}`}
              </p>
              {printJob.status==="fail" && <p className="text-xs mt-0.5" style={{ color:"#dc2626" }}>Agent déconnecté ou imprimante hors ligne</p>}
              {printJob.status==="fallback" && <p className="text-xs mt-0.5" style={{ color:"#b45309" }}>Connectez QZ Tray dans Admin → Imprimante pour supprimer ce dialogue</p>}
            </div>
            {printJob.status==="fail" && (
              <button onClick={()=>doPrint(printJob.html, printJob.label)}
                className="px-3 py-1.5 rounded-xl text-xs font-black text-white flex-shrink-0 active:scale-95"
                style={{ background:"#ef4444" }}>
                Réessayer
              </button>
            )}
            {printJob.status!=="printing" && printJob.status!=="fail" && (
              <button onClick={()=>setPrintJob(null)} className="text-muted-foreground w-6 h-6 flex items-center justify-center rounded-lg flex-shrink-0 active:scale-95 text-lg leading-none">×</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
