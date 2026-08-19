from pathlib import Path

# ── Dashboard: signed return-aware CA and cash charge totals ──────────────────
dash_path = Path('src/app/screens/DashboardView.tsx')
dash = dash_path.read_text()
dash = dash.replace(
    '''import { productQty, invBadge, filterByPeriod } from "../utils/inventory";''',
    '''import { productQty, invBadge, filterByPeriod } from "../utils/inventory";\nimport { filterPaymentEventsByPeriod, invoiceRemainingAmount } from "../utils/payments";''',
    1,
)
old = '''  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);

  const ca          = filtInv.reduce((s,i) => s + i.acompte, 0);
  const caTotal     = filtInv.reduce((s,i) => s + i.montant, 0);
  const totalCharges= filtCh.reduce((s,c) => s + c.montant, 0);
  const margeBrute  = ca - totalCharges;
  const tauxMarge   = ca > 0 ? Math.round((margeBrute/ca)*100) : 0;
  const impayées    = filtInv.filter(i=>i.status!=="payé");
  const totalImpayé = impayées.reduce((s,i)=>s+(i.montant-i.acompte),0);'''
new = '''  const filtInv = filterByPeriod(invoices, period, customFrom, customTo);
  const filtPayments = filterPaymentEventsByPeriod(invoices, period, customFrom, customTo);
  const filtCh  = filterByPeriod(charges, period, customFrom, customTo);
  const invoiceSign = (invoice: typeof invoices[number]) => invoice.type.toLowerCase() === "retour" ? -1 : 1;
  const chargeCashAmount = (charge: typeof charges[number]) => charge.source === "transfer" ? Number(charge.paidAmount ?? 0) : charge.montant;

  const ca          = filtPayments.reduce((s,p) => s + p.signedAmount, 0);
  const caTotal     = filtInv.reduce((s,i) => s + invoiceSign(i) * i.montant, 0);
  const totalCharges= filtCh.reduce((s,c) => s + chargeCashAmount(c), 0);
  const margeBrute  = ca - totalCharges;
  const tauxMarge   = ca !== 0 ? Math.round((margeBrute/Math.abs(ca))*100) : 0;
  const impayées    = filtInv.filter(i=>invoiceSign(i)>0 && invoiceRemainingAmount(i)>0);
  const totalImpayé = impayées.reduce((s,i)=>s+invoiceRemainingAmount(i),0);'''
if old not in dash:
    raise SystemExit('Dashboard accounting anchor not found')
dash = dash.replace(old, new, 1)
old = '''    if (period === "semaine") {
      const days = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      return days.map((d,i) => {
        const v = filtInv.filter(inv => {
          const raw = inv.date ?? "";
          const parsed = (() => { try { const parts = raw.toLowerCase().split(" "); const months: Record<string,number> = {jan:0,fév:1,mar:2,avr:3,mai:4,jun:5,jul:6,aoû:7,sep:8,oct:9,nov:10,déc:11}; return new Date(new Date().getFullYear(), months[parts[1]?.slice(0,3)]??0, parseInt(parts[0])); } catch { return new Date(); }})();
          return (parsed.getDay()+6)%7 === i;
        }).reduce((s,inv)=>s+inv.acompte,0);
        return { m: d, v: Math.round(v/1000) };
      });
    }
    const map = new Map<string,number>();
    filtInv.forEach(inv => { const k = inv.date.split(" · ")[0]; map.set(k,(map.get(k)??0)+inv.acompte); });
    return Array.from(map.entries()).slice(-10).map(([m,v])=>({ m, v:Math.round(v/1000) }));'''
new = '''    if (period === "semaine") {
      const days = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
      return days.map((d,i) => {
        const v = filtPayments.filter(payment => (new Date(payment.paidAt).getDay()+6)%7 === i)
          .reduce((s,payment)=>s+payment.signedAmount,0);
        return { m:d, v:Math.round(v/1000) };
      });
    }
    const map = new Map<string,number>();
    filtPayments.forEach(payment => {
      const date = new Date(payment.paidAt);
      const k = Number.isNaN(date.getTime()) ? payment.paidAt.slice(0,10) : date.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"});
      map.set(k,(map.get(k)??0)+payment.signedAmount);
    });
    return Array.from(map.entries()).slice(-10).map(([m,v])=>({ m, v:Math.round(v/1000) }));'''
if old not in dash:
    raise SystemExit('Dashboard chart anchor not found')
dash = dash.replace(old, new, 1)
dash = dash.replace('{label:"Marge nette", value:margeBrute, color:margeBrute>=0?SEM.success.accent:SEM.danger.accent}', '{label:"Solde net", value:margeBrute, color:margeBrute>=0?SEM.success.accent:SEM.danger.accent}', 1)
dash_path.write_text(dash)

# ── Clients: returns reduce CA but never create debt ──────────────────────────
clients_path = Path('src/app/screens/ClientsView.tsx')
clients = clients_path.read_text()
old = '''    const totalFacturé  = clientInvoices.reduce((s,i)=>s+i.montant,0);
    const totalEncaissé = clientInvoices.reduce((s,i)=>s+invoicePaidAmount(i),0);
    const totalImpayé   = clientInvoices.reduce((s,i)=>s+invoiceRemainingAmount(i),0);
    const nbVentes = clientInvoices.filter(i=>invoicePaidAmount(i)>0).length;
    const panierMoyen = nbVentes>0?totalEncaissé/nbVentes:0;
    const retours = clientInvoices.filter(i=>i.type==="Retour");
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);'''
new = '''    const isReturn = (invoice: Invoice) => invoice.type.toLowerCase() === "retour";
    const ventes = clientInvoices.filter(i=>!isReturn(i));
    const retours = clientInvoices.filter(i=>isReturn(i));
    const totalVentesFacturées = ventes.reduce((s,i)=>s+i.montant,0);
    const totalRetours = retours.reduce((s,i)=>s+i.montant,0);
    const totalFacturé  = totalVentesFacturées-totalRetours;
    const totalEncaissé = ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)-retours.reduce((s,i)=>s+invoicePaidAmount(i),0);
    const totalImpayé   = ventes.reduce((s,i)=>s+invoiceRemainingAmount(i),0);
    const nbVentes = ventes.filter(i=>invoicePaidAmount(i)>0).length;
    const panierMoyen = nbVentes>0?ventes.reduce((s,i)=>s+invoicePaidAmount(i),0)/nbVentes:0;'''
if old not in clients:
    raise SystemExit('Client KPI anchor not found')
clients = clients.replace(old, new, 1)
old = '''      byMonth[m].facturé += inv.montant;
      byMonth[m].encaissé += invoicePaidAmount(inv);'''
new = '''      const sign = isReturn(inv) ? -1 : 1;
      byMonth[m].facturé += sign * inv.montant;
      byMonth[m].encaissé += sign * invoicePaidAmount(inv);'''
if old not in clients:
    raise SystemExit('Client monthly anchor not found')
clients = clients.replace(old, new, 1)
clients = clients.replace('{label:"CA Facturé",val:fmt(totalFacturé)', '{label:"CA facturé net",val:fmt(totalFacturé)', 1)
clients_path.write_text(clients)

# ── Rapport: transfer charges by paid amount; stock purchases excluded from P&L ──
report_path = Path('src/app/screens/RapportView.tsx')
report = report_path.read_text()
old = '''  const totalCharges = filtCh.reduce((s,c)=>s+c.montant,0);'''
new = '''  const chargeCashAmount = (charge: typeof charges[number]) => charge.source === "transfer" ? Number(charge.paidAmount ?? 0) : charge.montant;
  const totalCharges = filtCh.reduce((s,c)=>s+chargeCashAmount(c),0);
  const chargesExploitation = filtCh.filter(c=>c.categorie!=="Achat stock").reduce((s,c)=>s+chargeCashAmount(c),0);'''
if old not in report:
    raise SystemExit('Report total charges anchor not found')
report = report.replace(old, new, 1)
report = report.replace('''  const resultatApresCharges = margeVentes - totalCharges;''', '''  const resultatApresCharges = margeVentes - chargesExploitation;''', 1)
old = '''    cat, montant: filtCh.filter(c=>c.categorie===cat).reduce((s,c)=>s+c.montant,0)'''
new = '''    cat, montant: filtCh.filter(c=>c.categorie===cat).reduce((s,c)=>s+chargeCashAmount(c),0)'''
if old not in report:
    raise SystemExit('Report category charges anchor not found')
report = report.replace(old, new, 1)
report = report.replace('${fmt(c.montant)}</span></div>`).join("")}', '${fmt(chargeCashAmount(c))}</span></div>`).join("")}', 1)
report = report.replace('${fmt(c.montant)}</td></tr>`).join("")}', '${fmt(chargeCashAmount(c))}</td></tr>`).join("")}', 1)
report_path.write_text(report)

print('CA, returns and debt reporting corrected successfully')
