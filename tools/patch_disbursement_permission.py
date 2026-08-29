from pathlib import Path


def replace(path: str, old: str, new: str, count: int | None = None):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:120]!r}")
    text = text.replace(old, new, -1 if count is None else count)
    p.write_text(text)

# Shared permission type and presets.
replace(
    "src/app/types.ts",
    '"marges" | "encaissement_vente" | "annulation_commande";',
    '"marges" | "encaissement_vente" | "annulation_commande" | "decaissement";',
)
replace(
    "src/app/constants.ts",
    'annulation_commande:false }',
    'annulation_commande:false, decaissement:false }',
)

# App.tsx duplicates the legacy type/presets and owns the permissions UI.
replace(
    "src/app/App.tsx",
    '"marges" | "annulation_commande";',
    '"marges" | "annulation_commande" | "decaissement";',
)
replace(
    "src/app/App.tsx",
    'annulation_commande:false }',
    'annulation_commande:false, decaissement:false }',
)
replace(
    "src/app/App.tsx",
    'annulation_commande:true }',
    'annulation_commande:true, decaissement:true }',
)
replace(
    "src/app/App.tsx",
    '{id:"encaissement_vente" as Permission, label:"Encaissement", icon:"💳"},\n    {id:"annulation_commande" as Permission, label:"Annuler commandes", icon:"🗑️"},',
    '{id:"encaissement_vente" as Permission, label:"Encaissement", icon:"💳"},\n    {id:"decaissement" as Permission, label:"Décaissement", icon:"💸"},\n    {id:"annulation_commande" as Permission, label:"Annuler commandes", icon:"🗑️"},',
)
replace(
    "src/app/App.tsx",
    'canPaySupplier={canAccess("charges")} canManageReceipts=',
    'canPaySupplier={(isOwner || !!currentUser?.isSuperAdmin || !!droits?.decaissement) && canAccess("charges")} canManageReceipts=',
)
replace(
    "src/app/App.tsx",
    'canCollectPayment={isOwner || !!currentUser?.isSuperAdmin || !!(droits?.encaissement_vente)} canCancelPendingOrder=',
    'canCollectPayment={isOwner || !!currentUser?.isSuperAdmin || !!(droits?.encaissement_vente)} canDisburse={isOwner || !!currentUser?.isSuperAdmin || !!droits?.decaissement} canCancelPendingOrder=',
    1,
)
replace(
    "src/app/App.tsx",
    '<RelationalChargesView boutique={boutique} onUpdate={updateBoutique} logAction={logAction}/>',
    '<RelationalChargesView boutique={boutique} onUpdate={updateBoutique} logAction={logAction} canDisburse={isOwner || !!currentUser?.isSuperAdmin || !!droits?.decaissement}/>',
)

# Charges: viewing remains under the existing Charges right, but creating a paid
# charge or settling a transfer requires the new disbursement right.
replace(
    "src/app/screens/ChargesView.tsx",
    'export function ChargesView({ boutique, onUpdate, logAction }: {\n  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;\n  logAction: (action: string, detail: string, icon: string) => void;\n}) {',
    'export function ChargesView({ boutique, onUpdate, logAction, canDisburse = false }: {\n  boutique: Boutique; onUpdate: (u: Partial<Boutique>) => void;\n  logAction: (action: string, detail: string, icon: string) => void;\n  canDisburse?: boolean;\n}) {',
)
replace(
    "src/app/screens/ChargesView.tsx",
    '  async function submit() {\n    if (!label.trim() || !montant) return;',
    '  async function submit() {\n    if (!canDisburse) { alert("Droit de décaissement requis"); return; }\n    if (!label.trim() || !montant) return;',
)
replace(
    "src/app/screens/ChargesView.tsx",
    '  async function payTransferCharge() {\n    if (!paymentCharge || paying) return;',
    '  async function payTransferCharge() {\n    if (!canDisburse) { alert("Droit de décaissement requis"); return; }\n    if (!paymentCharge || paying) return;',
)
replace(
    "src/app/screens/ChargesView.tsx",
    '{c.status!=="paid"&&<button onClick={()=>{const due=',
    '{c.status!=="paid"&&canDisburse&&<button onClick={()=>{const due=',
)
replace(
    "src/app/screens/ChargesView.tsx",
    '<button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95"',
    '{canDisburse && <button onClick={()=>setModal(true)} className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-20 active:scale-95"',
)
replace(
    "src/app/screens/ChargesView.tsx",
    '        <Plus size={28} color="white" strokeWidth={2.5}/>\n      </button>\n\n      {modal &&',
    '        <Plus size={28} color="white" strokeWidth={2.5}/>\n      </button>}\n\n      {!canDisburse && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Lecture des charges autorisée · droit de décaissement requis pour toute sortie d’argent.</div>}\n\n      {modal &&',
)

# Client credit refunds are a real outgoing payment; creating returns that only
# create client credit remains governed by the existing reimbursement right.
replace(
    "src/app/screens/ClientsView.tsx",
    'canCreateOrder = false, canCollectPayment = false, canCancelPendingOrder = false, canOpenInvoice = false,',
    'canCreateOrder = false, canCollectPayment = false, canDisburse = false, canCancelPendingOrder = false, canOpenInvoice = false,',
)
replace(
    "src/app/screens/ClientsView.tsx",
    '  canCollectPayment?: boolean;\n  canCancelPendingOrder?: boolean;',
    '  canCollectPayment?: boolean;\n  canDisburse?: boolean;\n  canCancelPendingOrder?: boolean;',
)
replace(
    "src/app/screens/ClientsView.tsx",
    '  async function submitCreditRefund()',
    '  async function submitCreditRefund()',
)
# Inject into the existing refund function body without depending on its full implementation.
text_path = Path("src/app/screens/ClientsView.tsx")
text = text_path.read_text()
needle = 'async function submitCreditRefund() {'
if needle not in text:
    raise SystemExit("missing submitCreditRefund")
text = text.replace(needle, needle + '\n    if (!canDisburse) { alert("Droit de décaissement requis"); return; }', 1)
text = text.replace(
    '{refundCreditDone?<div className="rounded-xl bg-green-50 p-4 text-center text-sm font-black text-green-700">Avoir remboursé ✓</div>:<SubmitBtn',
    '{refundCreditDone?<div className="rounded-xl bg-green-50 p-4 text-center text-sm font-black text-green-700">Avoir remboursé ✓</div>:canDisburse?<SubmitBtn',
    1,
)
text = text.replace(
    '/>} \n        </Modal>}',
    '/>:<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Droit de décaissement requis pour rembourser cet avoir.</div>} \n        </Modal>}',
    1,
)
text_path.write_text(text)

# Supplier payment UI already has canPaySupplier; App now computes it from both
# Charges access and the dedicated disbursement permission. Keep a defensive
# function-level guard as well.
replace(
    "src/app/screens/FournisseursView.tsx",
    '  async function paySupplier() {\n    const supplier = paymentSupplier;',
    '  async function paySupplier() {\n    if (!canPaySupplier) { alert("Droit de décaissement requis"); return; }\n    const supplier = paymentSupplier;',
)

print("disbursement permission patch applied")
