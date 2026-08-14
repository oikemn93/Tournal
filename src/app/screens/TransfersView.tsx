import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { Boutique } from "../types";
import {
  acceptStockTransfer, createStockTransfer, getStockTransfers,
  rejectStockTransfer, type RelationalTransfer,
} from "../../lib/api";
import { productQty } from "../utils/inventory";
import { fmt } from "../utils/formatting";

type DraftLine = { productId:number; qty:number; unitPrice:number; discountPercent:number };

const STATUS_LABEL: Record<RelationalTransfer["status"], string> = {
  pending:"En attente", accepted:"Accepté", rejected:"Refusé", cancelled:"Annulé",
};

export function TransfersView({ boutique, allBoutiques }: { boutique: Boutique; allBoutiques: Boutique[] }) {
  const [destination, setDestination] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftLine[]>([]);
  const [transfers, setTransfers] = useState<RelationalTransfer[]>([]);
  const [saving, setSaving] = useState(false);
  const products = boutique.products.filter((product) => productQty(product.id, boutique.entries) > 0);
  const destinations = allBoutiques.filter((item) => item.id !== boutique.id);
  const destinationShop = destinations.find((item)=>item.id===destination);

  const load = useCallback(async () => {
    try { setTransfers(await getStockTransfers(boutique.id)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Transferts indisponibles"); }
  }, [boutique.id]);
  useEffect(() => { void load(); }, [load]);

  const total = useMemo(() => items.reduce((sum,line)=>sum+line.qty*line.unitPrice*(1-line.discountPercent/100),0),[items]);
  const selectProduct = (value:string) => {
    setProductId(value);
    const product=products.find((item)=>item.id===Number(value));
    setUnitPrice(product ? String(product.prixVente ?? 0) : "");
  };
  const add = () => {
    const id=Number(productId), amount=Number(qty), price=Number(unitPrice), reduction=Number(discount);
    const product=products.find((item)=>item.id===id);
    if (!product || !Number.isFinite(amount) || amount<=0 || amount>productQty(id,boutique.entries)) return toast.error("Quantité invalide ou stock insuffisant");
    if (!Number.isFinite(price) || price<0 || !Number.isFinite(reduction) || reduction<0 || reduction>100) return toast.error("Prix ou remise invalide");
    setItems((previous)=>[...previous.filter((item)=>item.productId!==id),{productId:id,qty:amount,unitPrice:price,discountPercent:reduction}]);
    setProductId(""); setQty(""); setUnitPrice(""); setDiscount("0");
  };
  async function create() {
    if (!destination || !items.length || saving) return;
    setSaving(true);
    try {
      const result=await createStockTransfer({fromBoutiqueId:boutique.id,toBoutiqueId:destination,lines:items,note});
      toast.success(result.relationship_type==="same_owner" ? "Transfert interne créé — aucun impact sur le CA" : "Transfert commercial créé — facturation à l’acceptation");
      setItems([]); setDestination(""); setNote(""); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Transfert impossible"); }
    finally { setSaving(false); }
  }
  async function decide(transferId:string, decision:"accept"|"reject") {
    if (saving) return; setSaving(true);
    try {
      if (decision==="accept") {
        const result=await acceptStockTransfer(transferId);
        toast.success(result.relationship_type==="same_owner" ? "Stocks transférés sans facture ni charge" : `Transfert accepté — facture ${result.invoice_id} créée`);
      } else { await rejectStockTransfer(transferId); toast.success("Transfert refusé — aucun stock modifié"); }
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Décision impossible"); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-3xl space-y-5 pb-24" data-screen-source="relational-transfers">
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex gap-3"><ArrowRightLeft className="text-orange-600"/><div><h2 className="text-xl font-black">Transferts inter-boutiques</h2><p className="text-sm text-muted-foreground">Même propriétaire : mouvement interne. Propriétaires différents : facture vendeur et charge destinataire.</p></div></div>
    </div>
    <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
      <h3 className="font-black">Nouvelle demande</h3>
      <select value={destination} onChange={(event)=>setDestination(event.target.value)} className="w-full rounded-xl border border-border bg-background p-3"><option value="">Boutique destinataire</option>{destinations.map((item)=><option key={item.id} value={item.id}>{item.nom}</option>)}</select>
      {destinationShop&&<p className="rounded-xl bg-orange-50 p-3 text-xs font-semibold text-orange-800">Destination : {destinationShop.nom}. La relation financière sera déterminée automatiquement en base à partir des propriétaires.</p>}
      <div className="grid gap-2 md:grid-cols-[1.5fr_.6fr_.8fr_.6fr]">
        <select value={productId} onChange={(event)=>selectProduct(event.target.value)} className="rounded-xl border border-border bg-background p-3"><option value="">Produit</option>{products.map((item)=><option key={item.id} value={item.id}>{item.nom} ({productQty(item.id,boutique.entries)} {item.unit})</option>)}</select>
        <input type="number" min="0" step="any" value={qty} onChange={(event)=>setQty(event.target.value)} placeholder="Quantité" className="rounded-xl border border-border bg-background p-3"/>
        <input type="number" min="0" step="any" value={unitPrice} onChange={(event)=>setUnitPrice(event.target.value)} placeholder="Prix de cession" className="rounded-xl border border-border bg-background p-3"/>
        <input type="number" min="0" max="100" step="any" value={discount} onChange={(event)=>setDiscount(event.target.value)} placeholder="Remise %" className="rounded-xl border border-border bg-background p-3"/>
      </div>
      <button onClick={add} className="w-full rounded-xl border border-orange-300 py-2 font-bold text-orange-700">Ajouter la ligne</button>
      {items.map((item)=>{const product=boutique.products.find((p)=>p.id===item.productId);const lineTotal=item.qty*item.unitPrice*(1-item.discountPercent/100);return <div key={item.productId} className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 text-sm"><div className="flex-1"><p className="font-bold">{product?.nom}</p><p className="text-muted-foreground">{item.qty} {product?.unit} × {fmt(item.unitPrice)}{item.discountPercent?` − ${item.discountPercent}%`:""}</p></div><strong>{fmt(lineTotal)}</strong><button aria-label={`Retirer ${product?.nom??"la ligne"}`} onClick={()=>setItems((previous)=>previous.filter((line)=>line.productId!==item.productId))} className="rounded-lg p-2 text-red-600"><X size={16}/></button></div>;})}
      {items.length>0&&<div className="flex justify-between border-t border-border pt-3 font-black"><span>Total de cession</span><span>{fmt(total)}</span></div>}
      <input value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Note (facultative)" className="w-full rounded-xl border border-border bg-background p-3"/>
      <button onClick={()=>void create()} disabled={saving||!destination||!items.length} className="w-full rounded-2xl bg-orange-600 py-4 font-black text-white disabled:opacity-50">{saving?"Enregistrement…":"Envoyer la demande"}</button>
    </div>
    <div className="space-y-3 rounded-3xl border border-border bg-card p-5">
      <h3 className="font-black">Historique</h3>
      {transfers.length===0?<p className="text-sm text-muted-foreground">Aucun transfert.</p>:transfers.map((transfer)=>{
        const incoming=transfer.to_boutique_id===boutique.id;
        const other=allBoutiques.find((shop)=>shop.id===(incoming?transfer.from_boutique_id:transfer.to_boutique_id));
        return <div key={transfer.id} className="rounded-2xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black">{incoming?"Reçu de":"Envoyé à"} {other?.nom??"Boutique"}</p><p className="text-xs text-muted-foreground">{new Date(transfer.created_at).toLocaleString("fr-FR")}</p></div><div className="text-right"><span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">{STATUS_LABEL[transfer.status]}</span><p className="mt-2 font-black">{fmt(Number(transfer.total_amount||0))}</p></div></div>
          <p className="mt-2">{transfer.lines.map((line)=>`${line.product_name} · ${line.qty} ${line.unit} × ${fmt(Number(line.prix_unit))}`).join(", ")}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">{transfer.relationship_type==="same_owner"?"Transfert interne — hors CA/charges":transfer.relationship_type==="commercial"?"Transfert commercial":"Relation calculée à la création"}</p>
          {transfer.invoice_id&&<p className="mt-2 flex items-center gap-1 text-xs font-bold"><FileText size={14}/> Facture {transfer.invoice_id}</p>}
          {incoming&&transfer.status==="pending"&&<div className="mt-3 flex gap-2"><button onClick={()=>void decide(transfer.id,"accept")} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 font-bold text-white"><Check size={16}/>{saving?<Loader2 className="animate-spin" size={16}/>:"Accepter"}</button><button onClick={()=>void decide(transfer.id,"reject")} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-300 px-3 py-2 font-bold text-red-700"><X size={16}/>Refuser</button></div>}
        </div>;
      })}
    </div>
  </div>;
}
