from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count == 0 and new in text:
        return
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/app/utils/inventory.ts",
    '''export function supplierBalance(supplier: Pick<Supplier, "id"|"nom"> | string, entries: StockEntry[], charges?: Charge[]) {
  const linkedCharges = (charges ?? []).filter(c => matchesSupplier(c, supplier));
  // Supplier debt is ledger-driven. A stock entry only carries inventory cost;
  // it does not by itself mean money is owed. This is essential for the
  // special self-supplier, whose receipts intentionally create stock without a
  // supplier payable. Historical entries without a payable also remain debt-free.
  const regularPurchases = linkedCharges
    .filter(c => c.source === "supplier_receipt")
    .reduce((s, c) => s + Number(c.montant), 0);
  const transferPurchases = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + Number(c.montant), 0);
  const regularPayments = linkedCharges
    .filter(c => c.source === "supplier_payment")
    .reduce((s, c) => s + Number(c.montant), 0);
  const transferPayments = linkedCharges
    .filter(c => c.source === "transfer")
    .reduce((s, c) => s + Number(c.paidAmount ?? 0), 0);
  return Math.max(0, regularPurchases + transferPurchases - regularPayments - transferPayments);
}''',
    '''export function supplierBalance(supplier: Pick<Supplier, "id"|"nom"> | string, _entries: StockEntry[], charges?: Charge[]) {
  const linkedCharges = (charges ?? []).filter(c => matchesSupplier(c, supplier));
  // A supplier balance is the sum of outstanding payable documents. Payments
  // mutate paidAmount on those documents; subtracting supplier_payment rows a
  // second time can hide a still-open receipt. Inter-boutique transfer debts
  // use their dedicated transfer payment flow and are deliberately excluded.
  return Math.max(0, linkedCharges
    .filter(c => c.source === "supplier_receipt")
    .reduce((sum, c) => sum + Math.max(0, Number(c.montant) - Number(c.paidAmount ?? 0)), 0));
}''',
)

replace_once(
    "src/lib/api.ts",
    '''export async function recordSupplierPayment(params:{ boutiqueId:string; supplierId:number; amount:number; paymentMethod:string; note?:string; paymentDate:string }) {
  return dataRequest<{charge_id:number; supplier_id:number; applied_amount:number; remaining_due:number; paid_at:string; payment_method:string; operator_name?:string; allocations:Array<{charge_id:number;amount:number}>}>("rpc/record_supplier_payment", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_supplier_id:params.supplierId,p_idempotency_key:crypto.randomUUID(),p_montant:params.amount,p_payment_method:params.paymentMethod,p_note:params.note ?? null,p_payment_date:params.paymentDate }) });
}''',
    '''export async function recordSupplierPayment(params:{ boutiqueId:string; supplierId:number; amount:number; paymentMethod:string; note?:string; paymentDate:string; idempotencyKey?:string }) {
  return dataRequest<{charge_id:number; supplier_id:number; applied_amount:number; remaining_due:number; paid_at:string; payment_method:string; operator_name?:string; allocations:Array<{charge_id:number;amount:number}>}>("rpc/record_supplier_payment", { method:"POST", headers:{ Prefer:"return=representation" }, body:JSON.stringify({ p_boutique_id:params.boutiqueId,p_supplier_id:params.supplierId,p_idempotency_key:params.idempotencyKey ?? crypto.randomUUID(),p_montant:params.amount,p_payment_method:params.paymentMethod,p_note:params.note ?? null,p_payment_date:params.paymentDate }) });
}''',
)

replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''  const [paymentAmount,setPaymentAmount] = useState(""); const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>("Espèces"); const [paymentNote,setPaymentNote] = useState(""); const [paymentDate,setPaymentDate] = useState(isoToday()); const [paying,setPaying] = useState(false); const [paymentDone,setPaymentDone] = useState(false);''',
    '''  const [paymentAmount,setPaymentAmount] = useState(""); const [paymentMethod,setPaymentMethod] = useState<PaymentMethod>("Espèces"); const [paymentNote,setPaymentNote] = useState(""); const [paymentDate,setPaymentDate] = useState(isoToday()); const [paying,setPaying] = useState(false); const [paymentDone,setPaymentDone] = useState(false); const [paymentIdempotencyKey,setPaymentIdempotencyKey] = useState<string|null>(null);''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''    setPaying(true);
    try {
      const result = await recordSupplierPayment({ boutiqueId:boutique.id, supplierId:supplier.id, amount:Math.min(requested,due), paymentMethod, note:paymentNote.trim() || undefined, paymentDate });''',
    '''    const requestKey = paymentIdempotencyKey ?? crypto.randomUUID();
    if (!paymentIdempotencyKey) setPaymentIdempotencyKey(requestKey);
    setPaying(true);
    try {
      const result = await recordSupplierPayment({ boutiqueId:boutique.id, supplierId:supplier.id, amount:Math.min(requested,due), paymentMethod, note:paymentNote.trim() || undefined, paymentDate, idempotencyKey:requestKey });''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''      window.setTimeout(()=>{ setPaymentSupplier(null); setPaymentAmount(""); setPaymentNote(""); setPaymentDone(false); }, 900);''',
    '''      window.setTimeout(()=>{ setPaymentSupplier(null); setPaymentAmount(""); setPaymentNote(""); setPaymentDone(false); setPaymentIdempotencyKey(null); }, 900);''',
)
replace_once("src/app/screens/FournisseursView.tsx", 'type PeriodFilter = "all" | "30" | "365" | "custom";', 'type PeriodFilter = "all" | "30" | "custom";')
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''    const totalPurchased = receipts.filter(entry=>new Date(entry.recordedAt ?? entry.date).getTime() >= Date.now()-365*86_400_000).reduce((sum,entry)=>sum+entry.montantDu,0);''',
    '''    const totalPurchased = receipts.reduce((sum,entry)=>sum+entry.montantDu,0);''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''<Metric label="SOLDE DÛ" value={fmt(balance)} color={balance>0?"#dc2626":SEM.success.accent}/><Metric label="ACHATS · 12 MOIS" value={fmt(totalPurchased)} color={supplier.color}/><Metric label="RÉCEPTIONS" value={String(receipts.length)}/><Metric label="RÉGLÉES / PART." value={`${paidReceipts} / ${receipts.length}`} color={SEM.success.accent}/><Metric label="MOYENNE / LIVRAISON" value={fmt(averageReceipt)} color={supplier.color}/>''',
    '''<Metric label="SOLDE DÛ" value={fmt(balance)} color={balance>0?"#dc2626":SEM.success.accent}/><Metric label="ACHATS · 30 JOURS" value={fmt(totalPurchased)} color={supplier.color}/><Metric label="RÉCEPTIONS · 30 J" value={String(receipts.length)}/><Metric label="RÉGLÉES / PART." value={`${paidReceipts} / ${receipts.length}`} color={SEM.success.accent}/><Metric label="MOYENNE · 30 J" value={fmt(averageReceipt)} color={supplier.color}/>''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''<p className="text-xs font-black tracking-wider text-muted-foreground">HISTORIQUE UNIFIÉ</p><span className="text-[10px] text-muted-foreground">Plus récent d’abord</span>''',
    '''<p className="text-xs font-black tracking-wider text-muted-foreground">HISTORIQUE RÉCENT</p><span className="text-[10px] text-muted-foreground">30 derniers jours chargés</span>''',
)
replace_once("src/app/screens/FournisseursView.tsx", '{(["all","30","365","custom"] as PeriodFilter[]).map(period=>', '{(["all","30","custom"] as PeriodFilter[]).map(period=>')
replace_once("src/app/screens/FournisseursView.tsx", '{period==="all"?"Tout":period==="30"?"30 j":period==="365"?"12 mois":"Dates"}', '{period==="all"?"Tout":period==="30"?"30 j":"Dates"}')
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''onClick={()=>{setPaymentSupplier(supplier);setPaymentAmount(String(balance));setPaymentNote("");setPaymentDate(isoToday());}}''',
    '''onClick={()=>{setPaymentSupplier(supplier);setPaymentAmount(String(balance));setPaymentNote("");setPaymentDate(isoToday());setPaymentIdempotencyKey(crypto.randomUUID());}}''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''{paymentSupplier&&<Modal title="Versement fournisseur" color={SEM.success.accent} onClose={()=>!paying&&setPaymentSupplier(null)}>''',
    '''{paymentSupplier&&<Modal title="Versement fournisseur" color={SEM.success.accent} onClose={()=>{if(!paying){setPaymentSupplier(null);setPaymentIdempotencyKey(null);}}}>''',
)
replace_once(
    "src/app/screens/FournisseursView.tsx",
    '''Les droits « Fournisseurs » et « Charges » sont nécessaires pour enregistrer un versement.''',
    '''Le droit « Décaissement » et l’accès « Charges » sont nécessaires pour enregistrer un versement.''',
)

replace_once(
    "src/app/screens/StockView.tsx",
    '''fournisseur:supplier.nom, supplierId:supplier.id, status:"pending" as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:persisted.entry_id, dueDate:persisted.due_date ?? undefined,''',
    '''fournisseur:supplier.nom, supplierId:supplier.id, status:(Number(dMontant)>0?"pending":"paid") as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:persisted.entry_id, dueDate:persisted.due_date ?? undefined,''',
)
replace_once(
    "src/app/screens/StockView.tsx",
    '''fournisseur:supplier.nom, supplierId:supplier.id, status:"pending" as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:movement.entry_id, dueDate:movement.due_date ?? undefined,''',
    '''fournisseur:supplier.nom, supplierId:supplier.id, status:(Number(nMontant)>0?"pending":"paid") as const, paidAmount:0,
        source:"supplier_receipt" as const, stockEntryId:movement.entry_id, dueDate:movement.due_date ?? undefined,''',
)

manifest = Path(".github/audit/remote-migration-manifest.txt")
text = manifest.read_text().rstrip("\n")
line = "20260906161544|supplier_ledger_single_source_of_truth"
if line not in text.splitlines():
    manifest.write_text(text + "\n" + line + "\n")

replace_once(
    ".github/audit/schema-fingerprint.sql",
    "('functions',    204, '652ce537c1ef284e99134a3e5b686955'),",
    "('functions',    204, '8577813b33245234d0956f8db969f65f'),",
)
fp = Path(".github/audit/schema-fingerprint.sql")
text = fp.read_text()
hook = "\\ir ../../scripts/test-supplier-ledger-db.sql"
if hook not in text:
    fp.write_text(text.replace("\\ir ../../scripts/test-business-smoke.sql", "\\ir ../../scripts/test-business-smoke.sql\n" + hook))

Path("scripts/test-supplier-ledger-db.sql").write_text(r'''\set ON_ERROR_STOP on

do $supplier_contract$
declare
  f text;
begin
  select pg_get_functiondef('public.record_supplier_payment(text,bigint,uuid,numeric,text,text,date)'::regprocedure) into f;
  if position('public.stock_entries' in f) > 0 then raise exception 'supplier payment must not derive debt from stock entries'; end if;
  if position('source = ''supplier_receipt''' in f) = 0 then raise exception 'supplier payment must allocate supplier receipts'; end if;

  select pg_get_functiondef('public.get_supplier_current_balances(text)'::regprocedure) into f;
  if position('supplier_receipt' in f) = 0 or position('stock_entries' in f) > 0 then raise exception 'supplier balance must be payable-ledger based'; end if;

  select pg_get_functiondef('public.correct_supplier_receipt(text,bigint,uuid,numeric,numeric)'::regprocedure) into f;
  if position('receipt correction would make stock negative' in f) = 0 then raise exception 'receipt correction stock floor missing'; end if;

  select pg_get_functiondef('public.get_dashboard_summary(text,timestamp with time zone,timestamp with time zone)'::regprocedure) into f;
  if position('supplier_receipt' in f) = 0 or position('transfer_charge_payments' in f) = 0 then raise exception 'dashboard cash charge source contract missing'; end if;
end
$supplier_contract$;

select 'supplier_ledger_db_contract_ok' as result;
''')

Path("scripts/test-supplier-ledger-contract.mjs").write_text(r'''import fs from 'node:fs';
const inventory = fs.readFileSync('src/app/utils/inventory.ts','utf8');
const api = fs.readFileSync('src/lib/api.ts','utf8');
const suppliers = fs.readFileSync('src/app/screens/FournisseursView.tsx','utf8');
const stock = fs.readFileSync('src/app/screens/StockView.tsx','utf8');
const migration = fs.readFileSync('.github/audit/replay-migrations/20260906161544_supplier_ledger_single_source_of_truth.sql','utf8');
function need(ok,msg){ if(!ok) throw new Error(msg); }
const balanceFn = inventory.slice(inventory.indexOf('export function supplierBalance'), inventory.indexOf('// ─── MARGIN'));
need(balanceFn.includes('c.source === "supplier_receipt"'),'supplierBalance must use supplier receipts');
need(balanceFn.includes('Number(c.montant) - Number(c.paidAmount ?? 0)'),'supplierBalance must use receipt outstanding');
need(!balanceFn.includes('c.source === "transfer"'),'supplierBalance must not mix transfer debt');
need(api.includes('params.idempotencyKey ?? crypto.randomUUID()'),'supplier payment must accept a stable retry key');
need(suppliers.includes('idempotencyKey:requestKey'),'supplier screen must reuse payment retry key');
need(suppliers.includes('ACHATS · 30 JOURS'),'supplier metrics must state the loaded time window');
need(!suppliers.includes('period==="365"'),'supplier screen must not claim unloaded 12-month history');
need(stock.includes('Number(dMontant)>0?"pending":"paid"'),'zero-value receipt optimistic state must be paid');
need(migration.includes("and c.source = 'supplier_receipt'"),'server supplier balance/payment must use payable ledger');
need(!migration.includes('v_stock_due'),'legacy stock-derived supplier debt must be gone');
need(migration.includes("c.source not in ('supplier_receipt','transfer')"),'dashboard must exclude payable documents from cash charges');
need(migration.includes('transfer_charge_payments'),'dashboard must date transfer cash from payment ledger');
need(migration.includes('receipt correction would make stock negative'),'receipt correction must guard stock floor');
console.log('supplier ledger contract ok');
''')
