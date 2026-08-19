from pathlib import Path

path = Path('src/app/screens/FacturesView.tsx')
text = path.read_text()

old = '''  const [emailAddr, setEmailAddr] = useState(clientRecord?.email ?? "");'''
new = '''  const [emailAddr, setEmailAddr] = useState(inv.clientEmailSnapshot ?? clientRecord?.email ?? "");'''
if old not in text:
    raise SystemExit('share email snapshot anchor not found')
text = text.replace(old, new, 1)

old = '''    return `Bonjour ${inv.client}\n\nVoici votre facture ${inv.id} de ${boutique.nom}.\nTotal : ${fmtN(inv.montant)} F\n${statusLine}\n\nConsulter / télécharger la facture :\n${url}\n\nLien valable 48 h. Après expiration, la facture peut être régénérée sur demande.\n\nMerci pour votre confiance.`;'''
new = '''    const issuerName = inv.boutiqueNomSnapshot ?? boutique.nom;
    return `Bonjour ${inv.client}\n\nVoici votre facture ${inv.id} de ${issuerName}.\nTotal : ${fmtN(inv.montant)} F\n${statusLine}\n\nConsulter / télécharger la facture :\n${url}\n\nLien valable 48 h. Après expiration, la facture peut être régénérée sur demande.\n\nMerci pour votre confiance.`;'''
if old not in text:
    raise SystemExit('share message snapshot anchor not found')
text = text.replace(old, new, 1)

text = text.replace('''    const subject = encodeURIComponent(`Facture ${inv.id} — ${boutique.nom}`);''', '''    const subject = encodeURIComponent(`Facture ${inv.id} — ${inv.boutiqueNomSnapshot ?? boutique.nom}`);''', 1)

path.write_text(text)
print('B2B invoice share snapshots integrated successfully')
