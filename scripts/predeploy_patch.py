from pathlib import Path

path = Path('src/app/screens/TransfersView.tsx')
text = path.read_text()


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, got {count}')
    text = text.replace(old, new, 1)

replace_once(
    '''  async function runDirectorySearch(query = directoryQuery) {
    setDirectoryLoading(true);
    try { setDirectoryResults(await searchBoutiqueDirectory(boutique.id, query)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Annuaire indisponible"); }
    finally { setDirectoryLoading(false); }
  }
''',
    '''  async function runDirectorySearch(query = directoryQuery) {
    const digits = query.replace(/\\D/g, "");
    if (digits.length < 9) {
      setDirectoryResults([]);
      toast.error("Saisissez au moins les 9 derniers chiffres du téléphone de la boutique");
      return;
    }
    setDirectoryLoading(true);
    try { setDirectoryResults(await searchBoutiqueDirectory(boutique.id, digits)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Annuaire indisponible"); }
    finally { setDirectoryLoading(false); }
  }
''',
    'phone-only directory search guard',
)

replace_once(
    '''          <button onClick={() => { setDirectoryOpen(true); void runDirectorySearch(""); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl font-black text-sm active:scale-95 border border-border bg-card"
            style={{ color:TRANSFER_COLOR }}>
            <Building2 size={15}/> Annuaire
          </button>''',
    '''          <button onClick={() => { setDirectoryQuery(""); setDirectoryResults([]); setDirectoryOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl font-black text-sm active:scale-95 border border-border bg-card"
            style={{ color:TRANSFER_COLOR }}>
            <Building2 size={15}/> Annuaire
          </button>''',
    'do not preload directory',
)

replace_once(
    '''              Recherchez une boutique Tournal d'une autre entité par nom, téléphone ou ville. Ajoutez-la à vos partenaires pour pouvoir lui envoyer un transfert commercial.''',
    '''              Pour retrouver une boutique d'une autre entité, saisissez son numéro de téléphone. Tournal compare uniquement les 9 derniers chiffres afin d'éviter les erreurs liées aux indicatifs, espaces ou tirets. Aucune autre boutique n'est affichée sans recherche.''',
    'directory privacy copy',
)

replace_once(
    '''                <input value={directoryQuery} onChange={e=>setDirectoryQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void runDirectorySearch()} placeholder="Nom, téléphone ou ville…" className={inputCls+" pl-9"}/>''',
    '''                <input type="tel" inputMode="tel" value={directoryQuery} onChange={e=>{setDirectoryQuery(e.target.value);setDirectoryResults([]);}} onKeyDown={e=>e.key==="Enter"&&void runDirectorySearch()} placeholder="Téléphone de la boutique…" className={inputCls+" pl-9"}/>''',
    'directory phone input',
)

replace_once(
    '''              <button onClick={()=>void runDirectorySearch()} disabled={directoryLoading} className="px-4 rounded-xl font-black text-sm text-white disabled:opacity-40" style={{background:TRANSFER_COLOR}}>
                {directoryLoading ? <Loader2 size={16} className="animate-spin"/> : "Rechercher"}
              </button>''',
    '''              <button onClick={()=>void runDirectorySearch()} disabled={directoryLoading || directoryQuery.replace(/\\D/g, "").length < 9} className="px-4 rounded-xl font-black text-sm text-white disabled:opacity-40" style={{background:TRANSFER_COLOR}}>
                {directoryLoading ? <Loader2 size={16} className="animate-spin"/> : "Rechercher"}
              </button>''',
    'disable directory search before 9 digits',
)

replace_once(
    '''              {!directoryLoading && directoryResults.length===0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune boutique trouvée</p>}''',
    '''              {!directoryLoading && directoryResults.length===0 && directoryQuery.replace(/\\D/g, "").length < 9 && <p className="text-sm text-muted-foreground text-center py-4">Saisissez au moins les 9 derniers chiffres du numéro de téléphone.</p>}
              {!directoryLoading && directoryResults.length===0 && directoryQuery.replace(/\\D/g, "").length >= 9 && <p className="text-sm text-muted-foreground text-center py-4">Aucune boutique ne correspond à ce numéro.</p>}''',
    'directory empty states',
)

path.write_text(text)
print('Directory lookup locked to phone last9 successfully')
