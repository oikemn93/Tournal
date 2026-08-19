from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    return text.replace(old, new, 1)

# ── API: directory + partner RPCs ────────────────────────────────────────────
api_path = Path('src/lib/api.ts')
api = api_path.read_text()
anchor = '''export type RelationalTransfer = {
  id:string; from_boutique_id:string; to_boutique_id:string; status:"pending"|"accepted"|"rejected"|"cancelled";
'''
addition = '''export type BoutiqueDirectoryEntry = {
  boutique_id:string; nom:string; ville:string; tel:string; is_partner?:boolean; transfer_count:number;
};
export async function searchBoutiqueDirectory(boutiqueId:string, query="") {
  return dataRequest<BoutiqueDirectoryEntry[]>("rpc/search_boutique_directory", {
    method:"POST", body:JSON.stringify({ p_source_boutique_id:boutiqueId, p_query:query || null }),
  });
}
export async function getBoutiquePartners(boutiqueId:string) {
  return dataRequest<BoutiqueDirectoryEntry[]>("rpc/get_boutique_partners", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId }),
  });
}
export async function addBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string) {
  return dataRequest<{boutique_id:string;nom:string;ville:string|null;tel:string|null}>("rpc/add_boutique_partner", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId }),
  });
}
export async function removeBoutiquePartner(boutiqueId:string, partnerBoutiqueId:string) {
  return dataRequest<{removed:boolean;boutique_id:string}>("rpc/remove_boutique_partner", {
    method:"POST", body:JSON.stringify({ p_boutique_id:boutiqueId, p_partner_boutique_id:partnerBoutiqueId }),
  });
}

''' + anchor
if 'export type BoutiqueDirectoryEntry' not in api:
    api = replace_once(api, anchor, addition, 'directory API helpers')
api_path.write_text(api)

# ── Transfers UI ──────────────────────────────────────────────────────────────
p = Path('src/app/screens/TransfersView.tsx')
text = p.read_text()
text = replace_once(
    text,
    'import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock, Search } from "lucide-react";',
    'import { ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Check, FileText, Loader2, Plus, Trash2, X, PackageCheck, PackageX, Clock, Search, Building2, UserPlus, UserMinus } from "lucide-react";',
    'directory icons',
)
text = replace_once(
    text,
    'import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, type RelationalTransfer } from "../../lib/api";',
    'import { acceptStockTransfer, createStockTransfer, getStockTransfers, rejectStockTransfer, searchBoutiqueDirectory, getBoutiquePartners, addBoutiquePartner, removeBoutiquePartner, type RelationalTransfer, type BoutiqueDirectoryEntry } from "../../lib/api";',
    'directory API imports',
)
text = replace_once(
    text,
    '''  // Destinations = toutes les autres boutiques accessibles (même propriétaire ou même groupe en priorité)
  const destinations = allBoutiques.filter(b => b.id !== boutique.id);
  const sameOwnerIds = new Set(
    destinations.filter(b => myOwnerId && ownerOf(b.id, platformUsers) === myOwnerId).map(b => b.id)
  );

  const [transfers, setTransfers] = useState<RelationalTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newModal, setNewModal] = useState(false);
''',
    '''  const accountDestinations = allBoutiques.filter(b => b.id !== boutique.id);
  const sameOwnerIds = new Set(
    accountDestinations.filter(b => myOwnerId && ownerOf(b.id, platformUsers) === myOwnerId).map(b => b.id)
  );

  const [transfers, setTransfers] = useState<RelationalTransfer[]>([]);
  const [partners, setPartners] = useState<BoutiqueDirectoryEntry[]>([]);
  const [directoryResults, setDirectoryResults] = useState<BoutiqueDirectoryEntry[]>([]);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newModal, setNewModal] = useState(false);

  const destinations = useMemo(() => {
    const map = new Map<string,{id:string;nom:string;ville?:string;tel?:string;isPartner:boolean}>();
    for (const b of accountDestinations) map.set(b.id, { id:b.id, nom:b.nom, ville:b.ville, tel:b.tel, isPartner:false });
    for (const partner of partners) {
      if (!map.has(partner.boutique_id)) map.set(partner.boutique_id, {
        id:partner.boutique_id, nom:partner.nom, ville:partner.ville, tel:partner.tel, isPartner:true,
      });
      else map.get(partner.boutique_id)!.isPartner = true;
    }
    return [...map.values()];
  }, [accountDestinations, partners]);
''',
    'directory state and destinations',
)
text = replace_once(
    text,
    '''  const load = useCallback(async () => {
    setLoading(true);
    try { setTransfers(await getStockTransfers(boutique.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Transferts indisponibles"); }
    finally { setLoading(false); }
  }, [boutique.id]);

  useEffect(() => { void load(); }, [load]);
''',
    '''  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedTransfers, loadedPartners] = await Promise.all([
        getStockTransfers(boutique.id),
        getBoutiquePartners(boutique.id),
      ]);
      setTransfers(loadedTransfers);
      setPartners(loadedPartners);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Transferts indisponibles"); }
    finally { setLoading(false); }
  }, [boutique.id]);

  useEffect(() => { void load(); }, [load]);

  async function runDirectorySearch(query = directoryQuery) {
    setDirectoryLoading(true);
    try { setDirectoryResults(await searchBoutiqueDirectory(boutique.id, query)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Annuaire indisponible"); }
    finally { setDirectoryLoading(false); }
  }

  async function addPartner(entry:BoutiqueDirectoryEntry) {
    if (saving) return;
    setSaving(true);
    try {
      await addBoutiquePartner(boutique.id, entry.boutique_id);
      const loaded = await getBoutiquePartners(boutique.id);
      setPartners(loaded);
      setDirectoryResults(prev => prev.map(row => row.boutique_id===entry.boutique_id ? {...row,is_partner:true} : row));
      toast.success(`${entry.nom} ajouté aux partenaires`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Ajout du partenaire impossible"); }
    finally { setSaving(false); }
  }

  async function removePartner(entry:BoutiqueDirectoryEntry) {
    if (saving) return;
    setSaving(true);
    try {
      await removeBoutiquePartner(boutique.id, entry.boutique_id);
      setPartners(prev => prev.filter(row => row.boutique_id!==entry.boutique_id));
      setDirectoryResults(prev => prev.map(row => row.boutique_id===entry.boutique_id ? {...row,is_partner:false} : row));
      if (destination===entry.boutique_id && !sameOwnerIds.has(entry.boutique_id)) setDestination("");
      toast.success(`${entry.nom} retiré des partenaires`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Suppression du partenaire impossible"); }
    finally { setSaving(false); }
  }
''',
    'load transfers and directory partners',
)
text = replace_once(
    text,
    '''    const other = allBoutiques.find(b => b.id === (isIn ? t.from_boutique_id : t.to_boutique_id));''',
    '''    const otherId = isIn ? t.from_boutique_id : t.to_boutique_id;
    const other = destinations.find(b => b.id === otherId) ?? allBoutiques.find(b => b.id === otherId);''',
    'external transfer display name',
)
text = replace_once(
    text,
    '''        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95"
          style={{ background:TRANSFER_COLOR }}>
          <Plus size={15}/> Nouveau
        </button>''',
    '''        <div className="flex gap-2">
          <button onClick={() => { setDirectoryOpen(true); void runDirectorySearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl font-black text-sm active:scale-95 border border-border bg-card"
            style={{ color:TRANSFER_COLOR }}>
            <Building2 size={15}/> Annuaire
          </button>
          <button onClick={() => setNewModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl font-black text-sm text-white active:scale-95"
            style={{ background:TRANSFER_COLOR }}>
            <Plus size={15}/> Nouveau
          </button>
        </div>''',
    'directory header button',
)
text = replace_once(
    text,
    '''                  const relation = sameOwnerIds.has(b.id) ? "interne" : "commercial";
                  return <option key={b.id} value={b.id}>{b.nom}{b.ville ? ` — ${b.ville}` : ""}{b.tel ? ` · ${b.tel}` : ""} · {relation}{count > 0 ? ` · ${count} transfert${count>1?"s":""}` : ""}</option>;''',
    '''                  const relation = sameOwnerIds.has(b.id) ? "interne" : b.isPartner ? "partenaire commercial" : "commercial";
                  return <option key={b.id} value={b.id}>{b.nom}{b.ville ? ` — ${b.ville}` : ""}{b.tel ? ` · ${b.tel}` : ""} · {relation}{count > 0 ? ` · ${count} transfert${count>1?"s":""}` : ""}</option>;''',
    'partner destination label',
)
modal_anchor = '''      {loading && <p className="text-center text-sm text-muted-foreground py-4">Chargement…</p>}

      {/* New transfer modal */}'''
modal_content = '''      {loading && <p className="text-center text-sm text-muted-foreground py-4">Chargement…</p>}

      {directoryOpen && (
        <Modal title="Annuaire des boutiques" color={TRANSFER_COLOR} onClose={()=>setDirectoryOpen(false)}>
          <div className="space-y-4">
            <div className="rounded-2xl px-4 py-3 text-xs leading-relaxed" style={{background:"#fff7ed",color:"#9a3412"}}>
              Recherchez une boutique Tournal d'une autre entité par nom, téléphone ou ville. Ajoutez-la à vos partenaires pour pouvoir lui envoyer un transfert commercial.
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input value={directoryQuery} onChange={e=>setDirectoryQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void runDirectorySearch()} placeholder="Nom, téléphone ou ville…" className={inputCls+" pl-9"}/>
              </div>
              <button onClick={()=>void runDirectorySearch()} disabled={directoryLoading} className="px-4 rounded-xl font-black text-sm text-white disabled:opacity-40" style={{background:TRANSFER_COLOR}}>
                {directoryLoading ? <Loader2 size={16} className="animate-spin"/> : "Rechercher"}
              </button>
            </div>

            {partners.length > 0 && (
              <div>
                <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">MES PARTENAIRES ({partners.length})</p>
                <div className="space-y-2">
                  {partners.map(entry=>(
                    <div key={entry.boutique_id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:"#fff7ed"}}><Building2 size={16} style={{color:TRANSFER_COLOR}}/></div>
                      <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{entry.nom}</p><p className="text-xs text-muted-foreground truncate">{entry.ville || "Ville non renseignée"}{entry.tel ? ` · ${entry.tel}` : ""}{entry.transfer_count ? ` · ${entry.transfer_count} transfert${entry.transfer_count>1?"s":""}` : ""}</p></div>
                      <button onClick={()=>{setDestination(entry.boutique_id);setDirectoryOpen(false);setNewModal(true);}} className="px-2.5 py-2 rounded-xl text-xs font-black" style={{background:TRANSFER_COLOR+"18",color:TRANSFER_COLOR}}>Choisir</button>
                      <button onClick={()=>void removePartner(entry)} disabled={saving} className="w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-40" style={{background:"#fef2f2",color:"#dc2626"}}><UserMinus size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-black tracking-wider text-muted-foreground mb-2">ANNUAIRE</p>
              {directoryLoading && <p className="text-sm text-muted-foreground text-center py-4">Recherche…</p>}
              {!directoryLoading && directoryResults.length===0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune boutique trouvée</p>}
              <div className="space-y-2">
                {directoryResults.map(entry=>(
                  <div key={entry.boutique_id} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-muted"><Building2 size={16}/></div>
                    <div className="flex-1 min-w-0"><p className="font-black text-sm truncate">{entry.nom}</p><p className="text-xs text-muted-foreground truncate">{entry.ville || "Ville non renseignée"}{entry.tel ? ` · ${entry.tel}` : ""}</p></div>
                    {entry.is_partner || partners.some(p=>p.boutique_id===entry.boutique_id)
                      ? <span className="text-xs font-black px-2.5 py-2 rounded-xl" style={{background:SEM.success.bg,color:SEM.success.accent}}>Partenaire</span>
                      : <button onClick={()=>void addPartner(entry)} disabled={saving} className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-black disabled:opacity-40" style={{background:TRANSFER_COLOR+"18",color:TRANSFER_COLOR}}><UserPlus size={13}/> Ajouter</button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* New transfer modal */}'''
text = replace_once(text, modal_anchor, modal_content, 'directory modal')
p.write_text(text)
print('Inter-entity directory UI patched successfully')
