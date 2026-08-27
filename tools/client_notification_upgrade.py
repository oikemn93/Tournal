from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"missing anchor: {label}")
    return text.replace(old, new, 1)

# api.ts
path = Path('src/lib/api.ts')
s = path.read_text()
if 'export async function updateClientProfile(' not in s:
    anchor = '''export async function updateClientContact(clientId:number, contact:string|null) {
  await dataRequest(`clients?id=eq.${clientId}`, {
    method:"PATCH", headers:{ Prefer:"return=minimal" },
    body:JSON.stringify({ contact }),
  });
}
'''
    addition = anchor + '''
export async function updateClientProfile(params:{ boutiqueId:string; clientId:number; name:string; phone?:string; email?:string; city?:string; address?:string; contact?:string }) {
  return dataRequest<{client_id:number;name:string;phone:string|null;email:string|null;city:string|null;address:string|null;contact:string|null}>("rpc/update_client_profile", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_client_id:params.clientId,p_name:params.name,p_phone:params.phone ?? null,p_email:params.email ?? null,p_city:params.city ?? null,p_address:params.address ?? null,p_contact:params.contact ?? null }),
  });
}

export async function deleteClientIfUnused(params:{ boutiqueId:string; clientId:number }) {
  return dataRequest<{client_id:number;name:string;deleted:boolean}>("rpc/delete_client_if_unused", {
    method:"POST", headers:{ Prefer:"return=representation" },
    body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_client_id:params.clientId }),
  });
}
'''
    s = replace_once(s, anchor, addition, 'api wrappers')
path.write_text(s)

# notifications.ts
path = Path('src/lib/notifications.ts')
s = path.read_text()
old = '''export async function getNotifications(boutiqueId: string, limit = 80) {
  if (!boutiqueId) return [] as ServerNotification[];
  return dataRequest<ServerNotification[]>(
    `notifications?select=id,user_id,boutique_id,category,title,body,icon,action_tab,action_filter,created_at,read_at,dismissed_at&boutique_id=eq.${encodeURIComponent(boutiqueId)}&dismissed_at=is.null&in_app_enabled=eq.true&order=created_at.desc&limit=${Math.max(1,Math.min(limit,100))}`,
  );
}
'''
new = '''export async function getNotifications(boutiqueId: string, limit = 80) {
  const session = readSession();
  if (!boutiqueId || !session?.user?.id) return [] as ServerNotification[];
  return dataRequest<ServerNotification[]>(
    `notifications?select=id,user_id,boutique_id,category,title,body,icon,action_tab,action_filter,created_at,read_at,dismissed_at&user_id=eq.${encodeURIComponent(session.user.id)}&boutique_id=eq.${encodeURIComponent(boutiqueId)}&dismissed_at=is.null&in_app_enabled=eq.true&order=created_at.desc&limit=${Math.max(1,Math.min(limit,100))}`,
  );
}
'''
if 'user_id=eq.${encodeURIComponent(session.user.id)}' not in s:
    s = replace_once(s, old, new, 'notification user scope')
old = '''    const channel = realtimeClient
      .channel(`notifications:${session.user.id}:${boutiqueId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `boutique_id=eq.${boutiqueId}`,
      }, onChange)
      .subscribe();
    return () => {
      window.removeEventListener("tournal:session-refreshed", refreshRealtimeAuth);
      void realtimeClient.removeChannel(channel);
    };
'''
new = '''    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleChange = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; onChange(); }, 250);
    };
    const channel = realtimeClient
      .channel(`notifications:${session.user.id}:${boutiqueId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `boutique_id=eq.${boutiqueId}`,
      }, scheduleChange)
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn(`Notifications Realtime ${status.toLowerCase()} pour ${boutiqueId}`);
      });
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("tournal:session-refreshed", refreshRealtimeAuth);
      void realtimeClient.removeChannel(channel);
    };
'''
if 'const scheduleChange = () =>' not in s:
    s = replace_once(s, old, new, 'notification debounce')
path.write_text(s)

# ClientsView.tsx
path = Path('src/app/screens/ClientsView.tsx')
s = path.read_text()
s = replace_once(s,
'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2 } from "lucide-react";',
'import { Search, MapPin, Phone, Lock, Store, ChevronRight, Plus, ArrowLeft, FilePlus, Wallet, CheckCircle, CalendarClock, Edit2, Trash2, FileText } from "lucide-react";', 'icons')
s = replace_once(s,
'import { applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, recordClientPayment, updateClientContact, updateClientPaymentTerms, WHOLESALE_MARKER } from "../../lib/api";',
'import { applyClientAdvanceToInvoice, cancelPendingInvoice, createClient, deleteClientIfUnused, recordClientPayment, updateClientContact, updateClientPaymentTerms, updateClientProfile, WHOLESALE_MARKER } from "../../lib/api";', 'api import')
if 'EmbeddedClientPOSView' not in s:
    s = replace_once(s,
'import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";',
'import { formatPreciseDateTime, invoicePaidAmount, invoiceRemainingAmount } from "../utils/payments";\nimport { POSView as EmbeddedClientPOSView } from "./POSView";', 'pos import')
if 'const [orderClient, setOrderClient]' not in s:
    s = replace_once(s,
'  const [detailClient, setDetailClient] = useState<Client|null>(null);',
'''  const [detailClient, setDetailClient] = useState<Client|null>(null);
  const [orderClient, setOrderClient] = useState<Client|null>(null);
  const [viewedInvoice, setViewedInvoice] = useState<Invoice|null>(null);
  const [editClient, setEditClient] = useState<Client|null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editContact, setEditContact] = useState("");
  const [savingClient, setSavingClient] = useState(false);
  const [deleteClientTarget, setDeleteClientTarget] = useState<Client|null>(null);
  const [deletingClient, setDeletingClient] = useState(false);''', 'client states')
if 'data-screen-source="client-order-embedded"' not in s:
    anchor = '  // Client accounting detail modal: invoices are linked only by their canonical client_id.\n  if (detailClient) {'
    block = '''  if (orderClient) {
    return <div className="space-y-4 pb-24" data-screen-source="client-order-embedded">
      <button type="button" onClick={()=>setOrderClient(null)} className="flex items-center gap-2 text-sm font-black text-muted-foreground"><ArrowLeft size={18}/> Retour à {orderClient.nom}</button>
      <EmbeddedClientPOSView
        boutique={boutique}
        allBoutiques={allBoutiques}
        currentUser={currentUser}
        canEncaissVente={canCollectPayment}
        canCancelPendingOrder={canCancelPendingOrder}
        initialClientId={orderClient.id}
        initialOrderOrigin="client_profile"
        onInitialClientPrepared={()=>undefined}
        onOrderCreated={(clientId,invoiceId,notice="order")=>{
          const client = clients.find(item=>item.id===clientId) ?? orderClient;
          setOrderClient(null);
          setDetailClient(client);
          setShowAllInvoices(true);
          setHighlightedInvoiceId(invoiceId);
          setHighlightedInvoiceNotice(notice);
        }}
        onUpdate={onUpdate}
        logAction={logAction}
      />
    </div>;
  }

'''
    s = replace_once(s, anchor, block + anchor, 'embedded pos')
s = replace_once(s, 'onClick={()=>onCreateOrder(c)}', 'onClick={()=>setOrderClient(c)}', 'order callback')
s = replace_once(s, 'onClick={()=>onOpenInvoice(inv.id)}', 'onClick={()=>setViewedInvoice(inv)}', 'invoice callback')
if 'async function saveClientProfile()' not in s:
    anchor = '    async function confirmClientCancellation() {'
    funcs = '''    async function saveClientProfile() {
      if (!editClient || !editName.trim() || savingClient) return;
      setSavingClient(true);
      try {
        const result = await updateClientProfile({ boutiqueId:boutique.id,clientId:editClient.id,name:editName.trim(),phone:editPhone.trim(),email:editEmail.trim(),city:editCity.trim(),address:editAddress.trim(),contact:editContact.trim() });
        const updated: Client = { ...editClient,nom:result.name,tel:result.phone ?? "",email:result.email ?? undefined,ville:result.city ?? "",adresse:result.address ?? undefined,contact:result.contact ?? undefined };
        onUpdate({ clients:clients.map(item=>item.id===updated.id?updated:item) });
        setDetailClient(updated);
        setEditClient(null);
        logAction("Client modifié", updated.nom, "✏️");
      } catch (error) { alert(error instanceof Error ? error.message : "Modification du client impossible"); }
      finally { setSavingClient(false); }
    }

    async function confirmDeleteClient() {
      if (!deleteClientTarget || deletingClient) return;
      setDeletingClient(true);
      try {
        await deleteClientIfUnused({ boutiqueId:boutique.id,clientId:deleteClientTarget.id });
        onUpdate({ clients:clients.filter(item=>item.id!==deleteClientTarget.id) });
        logAction("Client supprimé", deleteClientTarget.nom, "🗑️");
        setDeleteClientTarget(null);
        setDetailClient(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Suppression impossible";
        alert(message.includes("client_has_history") ? "Ce client possède un historique financier (facture ou avoir). Pour préserver la traçabilité comptable, il ne peut pas être supprimé." : message);
      } finally { setDeletingClient(false); }
    }

'''
    s = replace_once(s, anchor, funcs + anchor, 'management functions')
if 'setDeleteClientTarget(c)' not in s:
    anchor = '          {(canCreateOrder || canCollectPayment) && <div className={`grid gap-2 mt-4 ${canCreateOrder && canCollectPayment ? "grid-cols-2" : "grid-cols-1"}`}>\n'
    actionbar = '''          <div className="mt-3 flex gap-2">
            <button type="button" onClick={()=>{setEditClient(c);setEditName(c.nom);setEditPhone(c.tel||"");setEditCity(c.ville||"");setEditAddress(c.adresse||"");setEditEmail(c.email||"");setEditContact(c.contact||"");}} className="flex-1 rounded-xl border border-border bg-card py-2.5 text-xs font-black"><Edit2 size={14} className="mr-1 inline"/>Modifier</button>
            <button type="button" onClick={()=>setDeleteClientTarget(c)} className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-600" title="Supprimer le client"><Trash2 size={14}/></button>
          </div>
'''
    s = replace_once(s, anchor, actionbar + anchor, 'action bar')
if 'title="Modifier le client"' not in s:
    anchor = '        {cancelInvoice&&<Modal title="Annuler la commande" color="#ef4444" onClose={()=>!cancellingInvoice&&setCancelInvoice(null)}>'
    modals = '''        {viewedInvoice&&<Modal title={`Facture ${viewedInvoice.id}`} color={CC} onClose={()=>setViewedInvoice(null)}>
          <div className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between gap-3"><div><p className="font-black">{viewedInvoice.client}</p><p className="text-xs text-muted-foreground">{formatPreciseDateTime(viewedInvoice.dateRaw) === "—" ? viewedInvoice.date : formatPreciseDateTime(viewedInvoice.dateRaw)}</p></div><FileText size={22} className="text-muted-foreground"/></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-muted p-2"><p className="text-[10px] text-muted-foreground">TOTAL</p><p className="text-sm font-black">{fmt(viewedInvoice.montant)}</p></div><div className="rounded-xl bg-green-50 p-2"><p className="text-[10px] text-green-700">PAYÉ</p><p className="text-sm font-black text-green-700">{fmt(invoicePaidAmount(viewedInvoice))}</p></div><div className="rounded-xl bg-red-50 p-2"><p className="text-[10px] text-red-700">RESTE</p><p className="text-sm font-black text-red-700">{fmt(invoiceRemainingAmount(viewedInvoice))}</p></div></div>
          </div>
          <div className="space-y-2">{(viewedInvoice.lines ?? []).map((line,index)=><div key={index} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs"><div><p className="font-bold">{line.nom}</p><p className="text-muted-foreground">{line.sellQty ?? line.qty} {line.sellUnit ?? line.unit}</p></div><p className="font-black">{fmt((line.sellQty ?? line.qty) * line.prixUnit)}</p></div>)}</div>
          {canCollectPayment && invoiceRemainingAmount(viewedInvoice)>0 && <button type="button" onClick={()=>{setPaymentAmount(String(invoiceRemainingAmount(viewedInvoice)));setViewedInvoice(null);setPaymentSummary(null);setPaymentModal(true);}} className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white">Enregistrer un versement</button>}
          <p className="text-xs text-muted-foreground">Le backend applique les versements en FIFO : les factures les plus anciennes sont réglées en premier et tout excédent devient un avoir.</p>
        </Modal>}
        {editClient&&<Modal title="Modifier le client" color={CC} onClose={()=>!savingClient&&setEditClient(null)}>
          <Field label="NOM"><input value={editName} onChange={e=>setEditName(e.target.value)} className={inputCls}/></Field>
          <Field label="TÉLÉPHONE"><input value={editPhone} onChange={e=>setEditPhone(e.target.value)} className={inputCls}/></Field>
          <Field label="VILLE"><input value={editCity} onChange={e=>setEditCity(e.target.value)} className={inputCls}/></Field>
          <Field label="ADRESSE"><input value={editAddress} onChange={e=>setEditAddress(e.target.value)} className={inputCls}/></Field>
          <Field label="E-MAIL"><input type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} className={inputCls}/></Field>
          <Field label="CONTACT"><input value={editContact} onChange={e=>setEditContact(e.target.value)} className={inputCls}/></Field>
          <SubmitBtn color={CC} label={savingClient?"Enregistrement…":"Enregistrer les modifications"} onClick={saveClientProfile} disabled={savingClient||!editName.trim()}/>
        </Modal>}
        {deleteClientTarget&&<Modal title="Supprimer le client" color="#dc2626" onClose={()=>!deletingClient&&setDeleteClientTarget(null)}>
          <p className="text-sm text-muted-foreground">Confirmer la suppression de <strong>{deleteClientTarget.nom}</strong> ? La suppression n'est autorisée que si le client n'a aucune facture ni aucun avoir.</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDeleteClientTarget(null)} disabled={deletingClient} className="rounded-xl bg-muted py-3 text-sm font-black">Annuler</button><button type="button" onClick={()=>void confirmDeleteClient()} disabled={deletingClient} className="rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-50">{deletingClient?"Suppression…":"Supprimer"}</button></div>
        </Modal>}
'''
    s = replace_once(s, anchor, modals + anchor, 'management modals')
old = '''          const montantDu = clientInvoices.reduce((s,inv)=>s+invoiceRemainingAmount(inv),0);
          return (
'''
new = '''          const montantDu = clientInvoices.reduce((s,inv)=>s+invoiceRemainingAmount(inv),0);
          const avoir = (boutique.clientAdvances ?? []).filter(advance=>advance.clientId===c.id).reduce((sum,advance)=>sum+Math.max(0,advance.amount-(advance.allocatedAmount ?? 0)),0);
          const net = avoir - montantDu;
          const balanceLabel = net > 0 ? `+${fmt(net)}` : net < 0 ? `-${fmt(Math.abs(net))}` : "0";
          const balanceColor = net > 0 ? SEM.success.accent : net < 0 ? SEM.danger.text : SEM.neutral.accent;
          const balanceText = net > 0 ? "avoir" : net < 0 ? "dette" : "soldé";
          return (
'''
s = replace_once(s, old, new, 'balance calc')
old = '''                <p className="font-black text-sm" style={{ color: montantDu>0?SEM.warning.accent:SEM.neutral.accent, fontFamily:"'Nunito',sans-serif" }}>{fmt(montantDu)}</p>
                <p className="text-xs text-muted-foreground">{montantDu>0?"dû · ":""}{invCount} fact.</p>
'''
new = '''                <p className="font-black text-sm" style={{ color:balanceColor, fontFamily:"'Nunito',sans-serif" }}>{balanceLabel}</p>
                <p className="text-xs font-bold" style={{color:balanceColor}}>{balanceText} · {invCount} fact.</p>
'''
s = replace_once(s, old, new, 'balance ui')
path.write_text(s)
print('client and notification upgrade applied')
