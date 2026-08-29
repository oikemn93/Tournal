from pathlib import Path

# Clients: allow reopening an unpaid client-profile order in the embedded POS.
p=Path('src/app/screens/ClientsView.tsx'); s=p.read_text()
s=s.replace('  const [orderClient, setOrderClient] = useState<Client|null>(null);','  const [orderClient, setOrderClient] = useState<Client|null>(null);\n  const [editingClientInvoice, setEditingClientInvoice] = useState<Invoice|null>(null);',1)
s=s.replace('      <button type="button" onClick={()=>setOrderClient(null)} className="flex items-center gap-2 text-sm font-black text-muted-foreground"><ArrowLeft size={18}/> Retour à {orderClient.nom}</button>','      <button type="button" onClick={()=>{setOrderClient(null);setEditingClientInvoice(null);}} className="flex items-center gap-2 text-sm font-black text-muted-foreground"><ArrowLeft size={18}/> Retour à {orderClient.nom}</button>',1)
s=s.replace('        initialOrderOrigin="client_profile"','        initialOrderOrigin="client_profile"\n        initialEditingInvoice={editingClientInvoice ?? undefined}',1)
s=s.replace('          setOrderClient(null);','          setOrderClient(null);\n          setEditingClientInvoice(null);',1)
anchor='''              const canCancel = canCancelPendingOrder && (canManageAnyPendingOrder || inv.operatorId === currentUser.id) && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;'''
replace=anchor+'\n              const canEdit = canCreateOrder && (canManageAnyPendingOrder || inv.operatorId === currentUser.id) && inv.origin === "client_profile" && inv.status === "en attente" && paid <= 0;'
if anchor not in s: raise SystemExit('client canCancel anchor missing')
s=s.replace(anchor,replace,1)
button_anchor='''                  {canUseAdvance&&<button type="button" onClick={()=>applyAdvanceToInvoice(inv)} disabled={!!applyingAdvanceInvoiceId} className="rounded-lg px-2 py-2 text-[11px] font-black disabled:opacity-50" style={{background:"#ccfbf1",color:"#0f766e"}}>{applyingAdvanceInvoiceId===inv.id?"Application…":"🎟️ Utiliser"}</button>}'''
button=button_anchor+'\n                  {canEdit&&<button type="button" onClick={()=>{setEditingClientInvoice(inv);setOrderClient(c);}} className="rounded-lg px-2 py-2 text-[11px] font-black" style={{background:"#eff6ff",color:"#1d4ed8"}}>Modifier</button>}'
if button_anchor not in s: raise SystemExit('client action anchor missing')
s=s.replace(button_anchor,button,1)
# Also expose edit from the invoice modal.
modal_anchor='''          {canCollectPayment && invoiceRemainingAmount(viewedInvoice)>0 && totalAvoir>0 && <button type="button" onClick={()=>void applyAdvanceToInvoice(viewedInvoice)} disabled={!!applyingAdvanceInvoiceId} className="w-full rounded-xl py-3 text-sm font-black disabled:opacity-50" style={{background:SEM.success.bg,color:SEM.success.accent}}>🎟️ Utiliser l'avoir disponible ({fmt(Math.min(totalAvoir,invoiceRemainingAmount(viewedInvoice)))})</button>}'''
modal_edit='''          {canCreateOrder && viewedInvoice.origin === "client_profile" && viewedInvoice.status === "en attente" && invoicePaidAmount(viewedInvoice) <= 0 && (canManageAnyPendingOrder || viewedInvoice.operatorId === currentUser.id) && <button type="button" onClick={()=>{setViewedInvoice(null);setEditingClientInvoice(viewedInvoice);setOrderClient(c);}} className="w-full rounded-xl bg-blue-50 py-3 text-sm font-black text-blue-700">Modifier la commande</button>}\n'''
if modal_anchor not in s: raise SystemExit('client modal payment anchor missing')
s=s.replace(modal_anchor,modal_edit+modal_anchor,1)
p.write_text(s)

# POS: accept an initial invoice to edit from Clients, while retaining the same invoice id.
p=Path('src/app/screens/POSView.tsx'); s=p.read_text()
s=s.replace('export function POSView({ boutique, allBoutiques, currentUser, canEncaissVente = false, canCancelPendingOrder = false, initialClientId, initialOrderOrigin = "pos", onInitialClientPrepared, onOrderCreated, onUpdate, logAction }: {','export function POSView({ boutique, allBoutiques, currentUser, canEncaissVente = false, canCancelPendingOrder = false, initialClientId, initialOrderOrigin = "pos", initialEditingInvoice, onInitialClientPrepared, onOrderCreated, onUpdate, logAction }: {',1)
s=s.replace('  initialOrderOrigin?: "pos" | "client_profile";','  initialOrderOrigin?: "pos" | "client_profile";\n  initialEditingInvoice?: Invoice;',1)
anchor='''  useEffect(() => {\n    if (initialClientId == null) return;\n    const client = boutique.clients.find(item => item.id === initialClientId);'''
if anchor not in s: raise SystemExit('POS initial client effect anchor missing')
# Add a separate effect after the existing effect block by targeting its dependency line.
dep='''  }, [initialClientId, boutique.clients, onInitialClientPrepared]);'''
block=dep+'''\n\n  // Client workspace can reopen an unpaid order for editing. The existing\n  // updatePendingInvoice path preserves the invoice number and only rewrites\n  // the order lines/total; no stock movement has happened before payment.\n  useEffect(() => {\n    if (!initialEditingInvoice) return;\n    if (initialEditingInvoice.status !== "en attente" || initialEditingInvoice.acompte > 0) return;\n    const items: CartItem[] = (initialEditingInvoice.lines ?? []).map(line => ({\n      productId:line.productId, nom:line.nom, img:products.find(p=>p.id===line.productId)?.img ?? "",\n      unit:line.unit, qty:line.qty, prixUnit:line.prixUnit, sellUnit:line.sellUnit, sellQty:line.sellQty,\n    }));\n    setCart(items);\n    setClientNom(initialEditingInvoice.client === "Client comptoir" ? "" : initialEditingInvoice.client);\n    setClientTel(initialEditingInvoice.clientTel ?? "+221 ");\n    setSelectedClientId(initialEditingInvoice.clientId);\n    setEditingInvoice(initialEditingInvoice);\n    setOrderOrigin("client_profile");\n    setPosTab("produits");\n    setCheckoutOpen(true);\n  }, [initialEditingInvoice?.id]);'''
if dep not in s: raise SystemExit('POS effect dependency anchor missing')
s=s.replace(dep,block,1)
p.write_text(s)
