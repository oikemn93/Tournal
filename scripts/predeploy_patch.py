from pathlib import Path

path = Path('src/app/screens/RapportView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    '''  const periodLabel: Record<DashPeriod,string> = { jour:"Aujourd'hui", semaine:"Cette semaine", mois:"Ce mois", annee:"Cette année", custom:"Période personnalisée" };

  function buildSummaryHtml() {''',
    '''  const periodLabel: Record<DashPeriod,string> = { jour:"Aujourd'hui", semaine:"Cette semaine", mois:"Ce mois", annee:"Cette année", custom:"Période personnalisée" };

  function invoicePaymentLabel(inv: typeof invoices[number]): string {
    const rows = inv.payments?.length
      ? inv.payments.map(payment => ({ method:payment.paymentMethod, amount:payment.amount }))
      : inv.paymentSplit?.length
        ? inv.paymentSplit.map(payment => ({ method:payment.method, amount:payment.amount }))
        : inv.paymentMethod && invoicePaidAmount(inv) > 0
          ? [{ method:inv.paymentMethod, amount:invoicePaidAmount(inv) }]
          : [];
    return rows.map(payment => `${payment.method} ${fmt(payment.amount)}`).join(" + ");
  }

  function buildSummaryHtml() {''',
    'report payment label helper',
)

replace_once(
    '''      const linesHtml = (inv.lines??[]).map(l=>`<tr style="background:#fafafa"><td style="padding-left:24px;color:#888">↳ ${l.nom}</td><td></td><td></td><td class="val muted">${lineDispQty(l)} ${lineDispUnit(l)} × ${fmt(l.prixUnit)}</td><td class="val muted">${fmt(lineTotal(l))}</td></tr>`).join("");
      const [tc,bc]=invBadge(inv.status);
      return `<tr><td>${inv.id}</td><td>${inv.client}</td><td>${inv.date}</td><td><span style="background:${bc};color:${tc};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">${inv.status}</span></td><td class="val">${fmt(inv.montant)}</td><td class="val green">${fmt(invoicePaidAmount(inv))}</td></tr>${linesHtml}`;''',
    '''      const linesHtml = (inv.lines??[]).map(l=>`<tr style="background:#fafafa"><td style="padding-left:24px;color:#888">↳ ${l.nom}</td><td></td><td></td><td class="val muted">${lineDispQty(l)} ${lineDispUnit(l)} × ${fmt(l.prixUnit)}</td><td class="val muted">${fmt(lineTotal(l))}</td><td></td></tr>`).join("");
      const paymentLabel = invoicePaymentLabel(inv);
      const paymentHtml = paymentLabel ? `<tr style="background:#f0fdf4"><td colspan="6" style="padding-left:24px;color:#166534;font-size:10px;font-weight:700">Paiements : ${paymentLabel}</td></tr>` : "";
      const [tc,bc]=invBadge(inv.status);
      return `<tr><td>${inv.id}</td><td>${inv.client}</td><td>${inv.date}</td><td><span style="background:${bc};color:${tc};padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">${inv.status}</span></td><td class="val">${fmt(inv.montant)}</td><td class="val green">${fmt(invoicePaidAmount(inv))}</td></tr>${paymentHtml}${linesHtml}`;''',
    'full report payment detail',
)

replace_once(
    '''  function doPrint(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const w = window.open("","_blank","width=860,height=700");
    if (!w) return;
    w.document.write(html + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\\/script>`);
    w.document.close();
    setExportModal(null);
  }
''',
    '''  function doPrint(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const w = window.open("","_blank","width=860,height=700");
    if (!w) return;
    w.document.write(html + `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},300);});<\\/script>`);
    w.document.close();
    setExportModal(null);
  }

  async function downloadRapportPDF(type: "summary"|"full") {
    const html = type === "summary" ? buildSummaryHtml() : buildFullHtml();
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;background:#fff";
    document.body.appendChild(iframe);
    try {
      const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
      if (!doc) throw new Error("Aperçu PDF indisponible");
      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        doc.open(); doc.write(html); doc.close();
        setTimeout(resolve, 300);
      });
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(doc.body, { scale:1.5, useCORS:true, backgroundColor:"#ffffff", windowWidth:900 });
      const pdf = new jsPDF({ orientation:"portrait", unit:"mm", format:"a4" });
      const img = canvas.toDataURL("image/jpeg", 0.86);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const imgH = canvas.height / canvas.width * pdfW;
      for (let offset=0; offset<imgH; offset+=pdfH) {
        if (offset>0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, -offset, pdfW, imgH);
      }
      const safeName = boutique.nom.replace(/[^a-zA-Z0-9_-]+/g,"-");
      pdf.save(`Rapport-${safeName}-${period}.pdf`);
      setExportModal(null);
    } finally {
      iframe.remove();
    }
  }
''',
    'direct report PDF download',
)

transactions_block = '''      {/* Factures */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><FileText size={16} style={{color:"#a855f7"}}/><p className="font-bold text-sm">Transactions ({filtInv.length})</p></div>
        {filtInv.length === 0 && <p className="text-center py-8 text-sm text-muted-foreground">Aucune transaction sur cette période</p>}
        {[...filtInv].reverse().slice(0,30).map(inv=>{
          const [tc,bc]=invBadge(inv.status);
          return (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
              <div><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p></div>
              <div className="text-right">
                <p className="text-sm font-black" style={{fontFamily:"'Nunito',sans-serif"}}>{fmt(invoicePaidAmount(inv) > 0 ? invoicePaidAmount(inv) : inv.montant)}</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold capitalize" style={{background:bc,color:tc}}>{inv.status}</span>
              </div>
            </div>
          );
        })}
      </div>

'''
export_block = '''      {/* Export */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2"><Download size={16} style={{color:RC}}/><p className="font-bold text-sm">Exporter</p></div>
        <div className="grid grid-cols-2 divide-x divide-border">
          <button onClick={()=>openPreview("summary")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:RC+"18"}}><FileText size={18} style={{color:RC}}/></div>
            <p className="text-xs font-black" style={{color:RC}}>Entête de rapport</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">CA, ventes, panier moyen, répartition</p>
          </button>
          <button onClick={()=>openPreview("full")} className="flex flex-col items-center gap-1.5 px-4 py-4 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"#a855f718"}}><BookOpen size={18} style={{color:"#a855f7"}}/></div>
            <p className="text-xs font-black" style={{color:"#a855f7"}}>Rapport complet</p>
            <p className="text-xs text-muted-foreground text-center leading-tight">Toutes les transactions + détail lignes</p>
          </button>
        </div>
      </div>

'''
# Move Export before Transactions and show payment breakdown on transaction cards.
if export_block not in text or transactions_block not in text:
    raise SystemExit('report blocks not found exactly once')
text = text.replace(transactions_block + export_block, export_block + transactions_block, 1)
replace_once(
    '<div><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p></div>',
    '<div className="min-w-0 flex-1"><p className="text-sm font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.id} · {inv.date}</p>{invoicePaymentLabel(inv)&&<p className="text-xs font-bold mt-0.5 truncate" style={{color:SEM.success.accent}}>💳 {invoicePaymentLabel(inv)}</p>}</div>',
    'transaction card payment label',
)

replace_once(
    '''            <div className="flex gap-2">
              <button onClick={()=>setExportModal(null)} className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-border active:scale-95">Annuler</button>
              <button onClick={()=>doPrint(exportModal)} className="flex-1 py-3 rounded-2xl font-black text-sm active:scale-95 text-white flex items-center justify-center gap-2" style={{background:RC}}>
                <Download size={15}/> Imprimer / Exporter
              </button>
            </div>''',
    '''            <div className="grid grid-cols-2 gap-2">
              <button onClick={()=>downloadRapportPDF(exportModal)} className="py-3 rounded-2xl font-black text-sm active:scale-95 text-white flex items-center justify-center gap-2" style={{background:RC}}>
                <Download size={15}/> Télécharger PDF
              </button>
              <button onClick={()=>doPrint(exportModal)} className="py-3 rounded-2xl font-black text-sm active:scale-95 border-2 border-border flex items-center justify-center gap-2">
                <FileText size={15}/> Imprimer
              </button>
            </div>
            <button onClick={()=>setExportModal(null)} className="w-full py-2.5 rounded-2xl font-bold text-sm text-muted-foreground active:scale-95">Annuler</button>''',
    'report modal actions',
)

path.write_text(text)
print('Report export and multipayment detail patched successfully')
