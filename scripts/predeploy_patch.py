from pathlib import Path

path = Path('src/app/screens/StockView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    '''  const [editingEntryId, setEditingEntryId] = useState<number|null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [editEntryMontant, setEditEntryMontant] = useState("");
  const todayRaw = new Date().toISOString().split("T")[0];

  function saveEntryEdit(entryId: number) {
    const qty = Number(editEntryQty);
    if (!qty || qty <= 0) return;
    onUpdate({ entries: entries.map(e => e.id === entryId ? { ...e, qty, montantDu: Number(editEntryMontant) || 0 } : e) });
    logAction("Correction stock", `Entrée #${entryId} modifiée`, "✏️");
    setEditingEntryId(null);
  }

  function deleteEntry(entryId: number) {
    onUpdate({ entries: entries.filter(e => e.id !== entryId) });
    logAction("Suppression entrée", `Entrée #${entryId} supprimée`, "🗑️");
  }
''',
    '''  const [editingEntryId, setEditingEntryId] = useState<number|null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [stockCorrectionBusy, setStockCorrectionBusy] = useState<number|null>(null);
  const todayRaw = new Date().toISOString().split("T")[0];

  async function saveEntryEdit(entryId: number) {
    const original = entries.find(e => e.id === entryId);
    const desiredQty = Number(editEntryQty);
    if (!original || !Number.isFinite(desiredQty) || desiredQty <= 0 || stockCorrectionBusy != null) return;
    const delta = desiredQty - original.qty;
    if (Math.abs(delta) < 0.000001) { setEditingEntryId(null); return; }
    const originalUnitCost = original.qty !== 0 ? Math.abs(original.montantDu / original.qty) : 0;
    setStockCorrectionBusy(entryId);
    try {
      await recordStockMovement({
        boutiqueId:boutique.id,
        productId:original.productId,
        qty:delta,
        type:"ajustement",
        prixUnit:originalUnitCost,
        note:`Correction entrée #${entryId}`,
      });
      const adjustment = {
        id:Date.now(), productId:original.productId, qty:delta, unit:original.unit,
        montantDu:delta * originalUnitCost, date:today(), fournisseur:`Correction entrée #${entryId}`,
      };
      onUpdate({ entries:[...entries, adjustment] });
      logAction("Correction stock", `Entrée #${entryId} · ajustement ${delta > 0 ? "+" : ""}${delta} ${original.unit}`, "✏️");
      setEditingEntryId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Correction de stock impossible");
    } finally {
      setStockCorrectionBusy(null);
    }
  }

  async function deleteEntry(entryId: number) {
    const original = entries.find(e => e.id === entryId);
    if (!original || original.qty <= 0 || stockCorrectionBusy != null) return;
    if (!window.confirm("Annuler cette réception ? L'entrée d'origine restera dans l'historique et un mouvement inverse sera ajouté.")) return;
    const unitCost = original.qty !== 0 ? Math.abs(original.montantDu / original.qty) : 0;
    setStockCorrectionBusy(entryId);
    try {
      await recordStockMovement({
        boutiqueId:boutique.id,
        productId:original.productId,
        qty:-original.qty,
        type:"ajustement",
        prixUnit:unitCost,
        note:`Annulation entrée #${entryId}`,
      });
      const reversal = {
        id:Date.now(), productId:original.productId, qty:-original.qty, unit:original.unit,
        montantDu:-Math.abs(original.montantDu), date:today(), fournisseur:`Annulation entrée #${entryId}`,
      };
      onUpdate({ entries:[...entries, reversal] });
      logAction("Annulation réception", `Entrée #${entryId} · mouvement inverse ${-original.qty} ${original.unit}`, "↩️");
      setEditingEntryId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Annulation de la réception impossible");
    } finally {
      setStockCorrectionBusy(null);
    }
  }
''',
    'immutable stock correction functions',
)

replace_once(
    '''                        <p className="text-xs font-bold" style={{ color:"#3b82f6" }}>Modifier l'entrée</p>
                        <div className="flex gap-2">
                          <input value={editEntryQty} onChange={e2=>setEditEntryQty(e2.target.value)} placeholder="Quantité" type="number" className={inputCls+" flex-1"} autoFocus onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                          <input value={editEntryMontant} onChange={e2=>setEditEntryMontant(e2.target.value)} placeholder="Montant dû" type="number" className={inputCls+" flex-1"} onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={()=>setEditingEntryId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background:"#EEE9D8", color:"#7A7055" }}>Annuler</button>
                          <button onClick={()=>saveEntryEdit(e.id)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background:"#3b82f6" }}>Enregistrer</button>
                        </div>''',
    '''                        <p className="text-xs font-bold" style={{ color:"#3b82f6" }}>Corriger la quantité</p>
                        <p className="text-xs text-muted-foreground">L'entrée d'origine restera intacte. Tournal ajoutera uniquement le mouvement d'ajustement nécessaire.</p>
                        <input value={editEntryQty} onChange={e2=>setEditEntryQty(e2.target.value)} placeholder="Nouvelle quantité" type="number" min="0.0001" className={inputCls} autoFocus onKeyDown={ev=>ev.key==="Enter"&&saveEntryEdit(e.id)}/>
                        <div className="flex gap-2">
                          <button disabled={stockCorrectionBusy===e.id} onClick={()=>setEditingEntryId(null)} className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-40" style={{ background:"#EEE9D8", color:"#7A7055" }}>Annuler</button>
                          <button disabled={stockCorrectionBusy===e.id} onClick={()=>saveEntryEdit(e.id)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40" style={{ background:"#3b82f6" }}>{stockCorrectionBusy===e.id?"Ajustement…":"Ajouter l'ajustement"}</button>
                        </div>''',
    'stock correction UI',
)

replace_once(
    'setEditingEntryId(e.id); setEditEntryQty(String(e.qty)); setEditEntryMontant(String(e.montantDu));',
    'setEditingEntryId(e.id); setEditEntryQty(String(e.qty));',
    'open correction UI',
)

path.write_text(text)
print('Immutable stock correction UI patched successfully')
