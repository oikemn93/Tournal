from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing pattern in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# API: cancellation RPC
replace_once(
    "src/lib/api.ts",
    '''export async function rejectStockTransfer(transferId: string) {\n  return dataRequest<{transfer_id:string;status:string}>("rpc/reject_stock_transfer", { method:"POST", body:JSON.stringify({ p_transfer_id:transferId,p_idempotency_key:crypto.randomUUID() }) });\n}\n''',
    '''export async function rejectStockTransfer(transferId: string) {\n  return dataRequest<{transfer_id:string;status:string}>("rpc/reject_stock_transfer", { method:"POST", body:JSON.stringify({ p_transfer_id:transferId,p_idempotency_key:crypto.randomUUID() }) });\n}\nexport async function cancelStockTransfer(transferId: string) {\n  return dataRequest<{transfer_id:string;status:string}>("rpc/cancel_stock_transfer", { method:"POST", body:JSON.stringify({ p_transfer_id:transferId,p_idempotency_key:crypto.randomUUID() }) });\n}\n'''
)

# Transfers screen: explicit permission-era behavior, archived products excluded, outbound cancellation.
replace_once(
    "src/app/screens/TransfersView.tsx",
    'import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, subscribeToStockTransfers, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";',
    'import { acceptStockTransfer, cancelStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, subscribeToStockTransfers, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";'
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    'const availableProducts = boutique.products.filter(p => productQty(p.id, boutique.entries) > 0);',
    'const availableProducts = boutique.products.filter(p => p.actif !== false && productQty(p.id, boutique.entries) > 0);'
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '''  async function decide(transferId: string, decision: "accept" | "reject") {\n''',
    '''  async function cancelPendingTransfer(transferId: string) {\n    if (saving) return;\n    setSaving(true);\n    try {\n      await cancelStockTransfer(transferId);\n      toast.success("Transfert annulé — aucun stock modifié");\n      await load();\n    } catch (e) { toast.error(e instanceof Error ? e.message : "Annulation impossible"); }\n    finally { setSaving(false); }\n  }\n\n  async function decide(transferId: string, decision: "accept" | "reject") {\n'''
)
replace_once(
    "src/app/screens/TransfersView.tsx",
    '''        {isIn && t.status === "pending" && (\n          <div className="flex border-t divide-x border-border">\n            <button onClick={() => decide(t.id, "accept")} disabled={saving}\n              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:SEM.success.accent }}>\n              {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Accepter\n            </button>\n            <button onClick={() => decide(t.id, "reject")} disabled={saving}\n              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#ef4444" }}>\n              <X size={14}/> Refuser\n            </button>\n          </div>\n        )}\n''',
    '''        {isIn && t.status === "pending" && (\n          <div className="flex border-t divide-x border-border">\n            <button onClick={() => decide(t.id, "accept")} disabled={saving}\n              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:SEM.success.accent }}>\n              {saving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>} Accepter\n            </button>\n            <button onClick={() => decide(t.id, "reject")} disabled={saving}\n              className="flex-1 flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95" style={{ color:"#ef4444" }}>\n              <X size={14}/> Refuser\n            </button>\n          </div>\n        )}\n        {!isIn && t.status === "pending" && (\n          <div className="border-t border-border">\n            <button onClick={() => void cancelPendingTransfer(t.id)} disabled={saving}\n              className="w-full flex items-center justify-center gap-2 py-3 font-black text-sm active:scale-95 disabled:opacity-50" style={{ color:"#dc2626" }}>\n              {saving ? <Loader2 size={14} className="animate-spin"/> : <X size={14}/>} Annuler le transfert\n            </button>\n          </div>\n        )}\n'''
)

# Shared types: dedicated transfers permission.
for path in ("src/app/types.ts", "src/app/App.tsx"):
    replace_once(path, '"annulation_commande" | "decaissement";', '"annulation_commande" | "decaissement" | "transferts";')

# Constants presets: explicit defaults.
p = Path("src/app/constants.ts")
text = p.read_text()
for role, enabled in (("Gérant", True),("Vendeur", True),("Vendeuse", True),("Caissier", False),("Livreur", False),("Autre", False)):
    prefix = f'  "{role}"'
    start = text.find(prefix)
    if start < 0:
        raise SystemExit(f"missing role {role}")
    end = text.find("\n", start)
    line = text[start:end]
    if "transferts:" not in line:
        line2 = line.replace(" decaissement:", f" transferts:{str(enabled).lower()}, decaissement:")
        if line2 == line:
            raise SystemExit(f"cannot patch preset {role}")
        text = text[:start] + line2 + text[end:]
p.write_text(text)

# Main App duplicate presets/types + permission UI/nav.
p = Path("src/app/App.tsx")
text = p.read_text()
# Add transfer defaults to every ROLE_PRESETS line, matching stock value.
for role in ("Gérant","Vendeur","Vendeuse","Caissier","Livreur","Autre"):
    start = text.find(f'  "{role}"')
    if start < 0:
        raise SystemExit(f"missing app role {role}")
    end = text.find("\n", start)
    line = text[start:end]
    if "transferts:" not in line:
        stock_true = "stock:true" in line
        line2 = line.replace(" decaissement:", f" transferts:{str(stock_true).lower()}, decaissement:")
        if line2 == line:
            # tolerate compact spacing around decaissement
            line2 = line.replace("decaissement:", f"transferts:{str(stock_true).lower()}, decaissement:")
        if line2 == line:
            raise SystemExit(f"cannot patch app preset {role}")
        text = text[:start] + line2 + text[end:]

text = text.replace(
    '{id:"decaissement" as Permission, label:"Décaissement", icon:"💸"},',
    '{id:"decaissement" as Permission, label:"Décaissement", icon:"💸"},\n    {id:"transferts" as Permission, label:"Transferts", icon:"🔄"},',
    1,
)
text = text.replace('perm:"stock" },\n  { id:"inventaire"', 'perm:"transferts" },\n  { id:"inventaire"', 1)
text = text.replace('safeTab==="transferts"   && canAccess("stock")', 'safeTab==="transferts"   && canAccess("transferts")', 1)
# Read-only group assignment explicitly cannot transfer; owner/admin assignments can.
text = text.replace('annulation_commande:false, decaissement:false } };', 'annulation_commande:false, decaissement:false, transferts:false } };')
text = text.replace('annulation_commande:true, decaissement:true } };', 'annulation_commande:true, decaissement:true, transferts:true } };')
p.write_text(text)

# Verify important postconditions before CI build.
checks = {
    "src/lib/api.ts": ["cancelStockTransfer", "rpc/cancel_stock_transfer"],
    "src/app/screens/TransfersView.tsx": ["cancelPendingTransfer", "p.actif !== false"],
    "src/app/types.ts": ['"transferts"'],
    "src/app/App.tsx": ['perm:"transferts"', 'canAccess("transferts")', 'label:"Transferts"'],
}
for path, needles in checks.items():
    data = Path(path).read_text()
    for needle in needles:
        if needle not in data:
            raise SystemExit(f"postcondition failed {path}: {needle}")

print("transfer frontend hardening patch applied")
