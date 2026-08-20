from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str):
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    path.write_text(text.replace(old, new, 1))

api = Path("src/lib/api.ts")
transfers = Path("src/app/screens/TransfersView.tsx")

replace_once(
    api,
    'for (const table of ["products", "stock_entries", "invoices", "invoice_lines", "invoice_payments", "clients", "charges", "caisse_sessions"]) {',
    'for (const table of ["products", "stock_entries", "invoices", "invoice_lines", "invoice_payments", "clients", "charges", "caisse_sessions", "suppliers", "categories", "boutique_partners", "boutique_assignments", "audit_log"]) {',
    "general realtime tables",
)

marker = '''export async function recordAuditLog(params: {\n'''
insert = '''/**\n * Watches transfer headers from both directions for one boutique, plus the\n * transfer lines visible through RLS. stock_transfers has no single boutique_id,\n * so from/to filters must stay distinct.\n */\nexport function subscribeToStockTransfers(boutiqueId: string, onChange: () => void) {\n  const session = readSession();\n  if (!session?.access_token || !boutiqueId) return () => undefined;\n\n  try {\n    realtimeClient.realtime.setAuth(session.access_token);\n    let channel = realtimeClient.channel(`stock-transfers:${boutiqueId}`);\n    channel = channel\n      .on("postgres_changes", {\n        event: "*", schema: "public", table: "stock_transfers",\n        filter: `from_boutique_id=eq.${boutiqueId}`,\n      }, onChange)\n      .on("postgres_changes", {\n        event: "*", schema: "public", table: "stock_transfers",\n        filter: `to_boutique_id=eq.${boutiqueId}`,\n      }, onChange)\n      // stock_transfer_lines has no boutique column. RLS on the parent transfer\n      // authorizes which line events this authenticated subscriber can receive.\n      .on("postgres_changes", {\n        event: "*", schema: "public", table: "stock_transfer_lines",\n      }, onChange)\n      .subscribe((status) => {\n        if (status === "SUBSCRIBED") onChange();\n        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {\n          console.warn(`Realtime transferts ${status.toLowerCase()} pour ${boutiqueId}`);\n        }\n      });\n    return () => { void realtimeClient.removeChannel(channel); };\n  } catch (error) {\n    console.warn("Realtime transferts indisponible", error);\n    return () => undefined;\n  }\n}\n\n'''
text = api.read_text()
if text.count(marker) != 1:
    raise SystemExit(f"stock transfer subscription insertion: expected 1 marker, got {text.count(marker)}")
api.write_text(text.replace(marker, insert + marker, 1))

replace_once(
    transfers,
    'import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";',
    'import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, subscribeToStockTransfers, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";',
    "TransfersView API import",
)

replace_once(
    transfers,
    '  useEffect(() => { void load(); }, [load]);\n',
    '  useEffect(() => { void load(); }, [load]);\n  useEffect(() => subscribeToStockTransfers(boutique.id, () => { void load(); }), [boutique.id, load]);\n',
    "TransfersView realtime effect",
)

print("Realtime coverage patch applied")
