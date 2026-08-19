from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

# 1) Margin calculation must prefer the historical cost snapshot frozen on the invoice line.
inv_path = Path('src/app/utils/inventory.ts')
inv = inv_path.read_text()
inv = replace_once(
    inv,
    '''export function lineUnitCost(line: InvoiceLine, entries: StockEntry[], products: Product[]): number | null {
  if (line.productId > 0) {''',
    '''export function lineUnitCost(line: InvoiceLine, entries: StockEntry[], products: Product[]): number | null {
  // Once the first payment freezes the FIFO unit cost on the invoice line,
  // historical margins must never be recomputed from future stock movements.
  if (line.prixAchat != null && line.prixAchat > 0) return line.prixAchat;
  if (line.productId > 0) {''',
    'prefer frozen invoice cost',
)
inv_path.write_text(inv)

# 2) Report terminology: commercial margin is sales minus COGS; result after charges subtracts charges from it.
r_path = Path('src/app/screens/RapportView.tsx')
r = r_path.read_text()
r = replace_once(
    r,
    '''  const totalCharges = filtCh.reduce((s,c)=>s+c.montant,0);
  const margeBrute   = ca - totalCharges;
  const tauxMarge    = ca > 0 ? (margeBrute/ca*100).toFixed(1) : "0";

  // Product margin''',
    '''  const totalCharges = filtCh.reduce((s,c)=>s+c.montant,0);

  // Product margin''',
    'remove misleading gross margin',
)
r = replace_once(
    r,
    '''  const margeVentes    = margeVentesData.marge;
  const tauxMargeVentes= margeVentesData.ca !== 0 ? Math.round(margeVentes/Math.abs(margeVentesData.ca)*100) : 0;
''',
    '''  const margeVentes    = margeVentesData.marge;
  const tauxMargeVentes= margeVentesData.ca !== 0 ? Math.round(margeVentes/Math.abs(margeVentesData.ca)*100) : 0;
  const resultatApresCharges = margeVentes - totalCharges;
''',
    'result after charges definition',
)

# Summary PDF/HTML KPI: replace the old CA-charges pseudo-margin and duplicate margin card.
r = replace_once(
    r,
    '''  <div class="kpi"><div class="label">Impayé</div><div class="value orange">${fmt(impayé)}</div></div>
  <div class="kpi"><div class="label">Marge brute</div><div class="value ${margeBrute>=0?"green":"red"}">${fmt(margeBrute)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge sur ventes (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div>` : ""}
''',
    '''  <div class="kpi"><div class="label">Impayé</div><div class="value orange">${fmt(impayé)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge commerciale (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div><div class="kpi"><div class="label">Résultat après charges</div><div class="value ${resultatApresCharges>=0?"green":"red"}">${fmt(resultatApresCharges)}</div></div>` : ""}
''',
    'summary commercial margin KPI',
)

r = replace_once(
    r,
    '''<div class="row total-row"><span class="label">Total charges</span><span class="value red">${fmt(totalCharges)}</span></div>
<div class="row total-row" style="border-top:2px solid #1E9B1E"><span class="label" style="color:#1E9B1E">Marge brute</span><span class="value" style="color:#1E9B1E">${fmt(margeBrute)}</span></div>`:""}''',
    '''<div class="row total-row"><span class="label">Total charges</span><span class="value red">${fmt(totalCharges)}</span></div>
${canSeeMargin && margeVentesData.has ? `<div class="row total-row" style="border-top:2px solid ${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}"><span class="label" style="color:${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}">Résultat après charges</span><span class="value" style="color:${resultatApresCharges>=0?"#1E9B1E":"#ef4444"}">${fmt(resultatApresCharges)}</span></div>` : ""}`:""}''',
    'summary result after charges',
)

# Full PDF/HTML KPI has the same old pseudo-margin block.
r = replace_once(
    r,
    '''  <div class="kpi"><div class="label">Impayé</div><div class="value muted">${fmt(impayé)}</div></div>
  <div class="kpi"><div class="label">Marge brute</div><div class="value ${margeBrute>=0?"green":"red"}">${fmt(margeBrute)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge sur ventes (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div>` : ""}
''',
    '''  <div class="kpi"><div class="label">Impayé</div><div class="value muted">${fmt(impayé)}</div></div>
  ${canSeeMargin && margeVentesData.has ? `<div class="kpi"><div class="label">Marge commerciale (${tauxMargeVentes}%)</div><div class="value ${margeVentes>=0?"green":"red"}">${fmt(margeVentes)}</div></div><div class="kpi"><div class="label">Résultat après charges</div><div class="value ${resultatApresCharges>=0?"green":"red"}">${fmt(resultatApresCharges)}</div></div>` : ""}
''',
    'full commercial margin KPI',
)

# On-screen result rows.
r = replace_once(
    r,
    '''    { label:"Charges",       value:totalCharges,  color:"#ef4444"                        },
    ...(canSeeMargin && margeVentesData.has ? [
      { label:"Marge sur ventes", value:margeVentes, color:margeVentes>=0?SEM.success.accent:SEM.danger.accent, bold:true },
      { label:"Taux marge/ventes", value:-1, color:"#a855f7", txt:`${tauxMargeVentes}%` },
    ] : []),
    { label:"Marge brute",   value:margeBrute,    color:margeBrute>=0?SEM.success.accent:SEM.danger.accent, bold:true },
    { label:"Taux de marge", value:-1,            color:"#a855f7", txt:`${tauxMarge}%`   },
''',
    '''    { label:"Charges",       value:totalCharges,  color:"#ef4444"                        },
    ...(canSeeMargin && margeVentesData.has ? [
      { label:"Marge commerciale", value:margeVentes, color:margeVentes>=0?SEM.success.accent:SEM.danger.accent, bold:true },
      { label:"Taux de marge commerciale", value:-1, color:"#a855f7", txt:`${tauxMargeVentes}%` },
      { label:"Résultat après charges", value:resultatApresCharges, color:resultatApresCharges>=0?SEM.success.accent:SEM.danger.accent, bold:true },
    ] : []),
''',
    'onscreen account result rows',
)

# On-screen top KPI cards.
r = replace_once(
    r,
    '''          { label:"Panier moyen", value:fmt(panierMoyen), color:"#a855f7" },
          { label:"Marge brute (CA − charges)", value:fmt(margeBrute), color:margeBrute>=0?SEM.success.accent:SEM.danger.accent },
          ...(canSeeMargin && margeVentesData.has ? [
            { label:`Marge sur ventes (${tauxMargeVentes}%)`, value:fmt(margeVentes), color:margeVentes>=0?SEM.success.accent:SEM.danger.accent },
          ] : []),
''',
    '''          { label:"Panier moyen", value:fmt(panierMoyen), color:"#a855f7" },
          ...(canSeeMargin && margeVentesData.has ? [
            { label:`Marge commerciale (${tauxMargeVentes}%)`, value:fmt(margeVentes), color:margeVentes>=0?SEM.success.accent:SEM.danger.accent },
            { label:"Résultat après charges", value:fmt(resultatApresCharges), color:resultatApresCharges>=0?SEM.success.accent:SEM.danger.accent },
          ] : []),
''',
    'onscreen top margin cards',
)

r_path.write_text(r)
print('Frozen margin display and terminology patched successfully')
