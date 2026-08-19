from pathlib import Path

# ── Types: source invoice link for returns ────────────────────────────────────
types_path = Path('src/app/types.ts')
types = types_path.read_text()
old = '''  montant: number; acompte: number; date: string; dateRaw?: string;
  status: InvoiceStatus; type: string;
  operatorNom?: string; operatorColor?: string;'''
new = '''  montant: number; acompte: number; date: string; dateRaw?: string;
  status: InvoiceStatus; type: string; returnOfInvoiceId?: string;
  operatorNom?: string; operatorColor?: string;'''
if old not in types:
    raise SystemExit('Invoice return link anchor not found')
types = types.replace(old, new, 1)
types_path.write_text(types)

# ── API projection / return result ────────────────────────────────────────────
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
old = '''          type:i.type,
          operatorNom:i.operator_nom_snapshot ?? operator.nom ?? undefined,'''
new = '''          type:i.type,
          returnOfInvoiceId:i.return_of_invoice_id ?? undefined,
          operatorNom:i.operator_nom_snapshot ?? operator.nom ?? undefined,'''
if old not in api:
    raise SystemExit('API return link anchor not found')
api = api.replace(old, new, 1)
api = api.replace(
    '''  return dataRequest<{ return_invoice_id:string; total:number }>("rpc/return_sale", {''',
    '''  return dataRequest<{ return_invoice_id:string; source_invoice_id:string; total:number; returned_at:string }>("rpc/return_sale", {''',
    1,
)
api_path.write_text(api)

# ── Factures: proportional commercial quantity + authoritative refund total ──
view_path = Path('src/app/screens/FacturesView.tsx')
view = view_path.read_text()
old = '''    const lines = returnInv.lines;
    const returnLines = lines.map((l,i) => ({ ...l, qty: returnQtys[i] ?? 0 })).filter(l => l.qty > 0);'''
new = '''    const lines = returnInv.lines;
    const returnLines = lines.map((l,i) => {
      const qty = returnQtys[i] ?? 0;
      const proportionalSellQty = l.sellUnit && l.sellQty != null && l.qty > 0
        ? l.sellQty * qty / l.qty
        : undefined;
      return {
        ...l,
        qty,
        ...(proportionalSellQty != null ? { sellQty: proportionalSellQty } : {}),
      };
    }).filter(l => l.qty > 0);'''
if old not in view:
    raise SystemExit('Return line mapping anchor not found')
view = view.replace(old, new, 1)
old = '''    const refundTotal = returnLines.reduce((s, l) => s + l.qty * l.prixUnit, 0);
    const retId = persisted.return_invoice_id;
    const retInv: Invoice = {
      id: retId, clientId:returnInv.clientId, client: returnInv.client, clientTel: returnInv.clientTel,
      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw: new Date().toISOString(), status: "payé", type: "Retour",
      operatorNom: currentUser.nom, operatorColor: currentUser.color,
    };'''
new = '''    const refundTotal = Number(persisted.total);
    const retId = persisted.return_invoice_id;
    const retInv: Invoice = {
      id: retId, clientId:returnInv.clientId, client: returnInv.client, clientTel: returnInv.clientTel,
      clientType:returnInv.clientType,
      lines: returnLines, montant: refundTotal, acompte: refundTotal,
      date: today(), dateRaw:persisted.returned_at, status: "payé", type: "Retour", returnOfInvoiceId:returnInv.id,
      operatorNom: currentUser.nom, operatorColor: currentUser.color,
    };'''
if old not in view:
    raise SystemExit('Return invoice construction anchor not found')
view = view.replace(old, new, 1)
view_path.write_text(view)

print('Return accounting frontend integrated successfully')
