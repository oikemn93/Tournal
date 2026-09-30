import React from "react";
import "./PublicSite.css";

const benefits = [
  { number: "01", title: "Sachez ce qu’il reste à vendre", text: "Retrouvez les entrées, les sorties et le stock de chaque boutique. Comparez vos comptages aux quantités attendues." },
  { number: "02", title: "Comprenez vos marges", text: "Suivez les coûts des lots sortis en premier (FIFO), les ventes et les charges pour mieux lire vos résultats." },
  { number: "03", title: "Gardez la trace de vos transferts", text: "Envoyez des marchandises d’une boutique à une autre et suivez leur réception, sans perdre le fil des mouvements." },
  { number: "04", title: "Pilotez vos points de vente ensemble", text: "Consultez les indicateurs de vos boutiques et donnez à chaque membre de l’équipe les accès utiles à son travail." },
];
const features = [
  { title: "Ventes et commandes", text: "Préparez un panier, enregistrez une commande et retrouvez les opérations à traiter au point de vente.", tag: "VENDRE" },
  { title: "Factures, acomptes et retours", text: "Suivez les règlements, les factures en attente ou en retard, les retours et les avoirs. Générez vos documents PDF.", tag: "ENCAISSER" },
  { title: "Clients et avances", text: "Retrouvez l’historique d’un client, ses paiements et ses avances pour savoir ce qui reste à régler.", tag: "FIDÉLISER" },
  { title: "Stock et réceptions", text: "Enregistrez les achats, les lots et les réceptions. Consultez les quantités disponibles et leurs coûts.", tag: "APPROVISIONNER" },
  { title: "Fournisseurs et échéances", text: "Rapprochez les marchandises reçues des montants dus et retrouvez l’historique des versements fournisseurs.", tag: "ANTICIPER" },
  { title: "Inventaires et écarts", text: "Comptez vos produits, comparez le stock réel au stock théorique et identifiez les écarts à examiner.", tag: "CONTRÔLER" },
  { title: "Transferts entre boutiques", text: "Suivez l’envoi, l’acceptation ou le refus des marchandises et gardez un historique des échanges.", tag: "RÉPARTIR" },
  { title: "Caisse et dépenses", text: "Ouvrez et clôturez la caisse. Retrouvez les encaissements par moyen de paiement et les charges par catégorie.", tag: "SUIVRE L’ARGENT" },
  { title: "Rapports et exports", text: "Examinez ventes, stock, clients, équipe et charges par période. Exportez les rapports pour prolonger votre analyse.", tag: "DÉCIDER" },
  { title: "Équipe et supervision", text: "Définissez les droits par utilisateur et boutique. Consultez les notifications et les traces d’activité selon votre rôle.", tag: "ORGANISER" },
];
const previews = {
  ventes: { title: "Ventes & règlements", metric: "Ventes du mois", value: "2 480 000 F", second: "Reste à encaisser", secondValue: "185 000 F", rows: [["Facture EX-104", "Réglée"], ["Facture EX-105", "Acompte reçu"], ["Commande EX-106", "À préparer"]] },
  stock: { title: "Stock & mouvements", metric: "Produits suivis", value: "128", second: "Transferts en cours", secondValue: "2", rows: [["Wax imprimé", "42 en stock"], ["Coton uni", "18 en stock"], ["Boutique A → B", "Réception attendue"]] },
  pilotage: { title: "Vue des boutiques", metric: "Boutiques suivies", value: "3", second: "Marge sur ventes", secondValue: "620 000 F", rows: [["Boutique Exemple A", "1 240 000 F"], ["Boutique Exemple B", "820 000 F"], ["Boutique Exemple C", "420 000 F"]] },
};
function ContactLink({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <a className={className} href="/demande-acces">{children}</a>;
}
function Preview() {
  const [view, setView] = React.useState<keyof typeof previews>("ventes");
  const sample = previews[view];
  return <div className="public-preview">
    <div className="public-preview-top"><span className="public-preview-mark" aria-hidden="true">T</span><strong>{sample.title}</strong><span className="public-preview-tag">MAQUETTE</span></div>
    <div className="public-preview-controls" role="group" aria-label="Choisir un aperçu fictif">{([['ventes', 'Ventes'], ['stock', 'Stock'], ['pilotage', 'Pilotage']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
    <div className="public-preview-inner" aria-live="polite" aria-atomic="true">
      <p className="public-preview-caption">Boutiques Exemple · scénario de démonstration</p>
      <div className="public-metrics"><div><small>{sample.metric}</small><strong>{sample.value}</strong><span>Valeur fictive</span></div><div><small>{sample.second}</small><strong>{sample.secondValue}</strong><span>Valeur fictive</span></div></div>
      {sample.rows.map(([label, value]) => <div className="public-preview-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      <div className="public-demo-bars" aria-hidden="true"><span/><span/><span/><span/><span/><span/><span/></div>
    </div>
    <p className="public-fictive">Maquette illustrative · toutes les données sont fictives.</p>
  </div>;
}
export default function PublicSite({ page = "home" }: { page?: "home" | "legal" | "privacy" }) {
  const isHome = page === "home";
  return <div className="public-site">
    <a className="public-skip" href="#contenu">Aller au contenu</a>
    <header className="public-header"><nav className="public-nav" aria-label="Navigation principale"><a className="public-brand" href="/" aria-label="Tournal, accueil"><img src="/brand/tournal-mark-gold.jpg?v=20260823" alt="" width="42" height="42"/><span>Tournal</span></a><div className="public-nav-links">{isHome && <a className="public-nav-features" href="#fonctionnalites">Fonctionnalités</a>}<a className="public-nav-login" href="/login">Se connecter</a></div></nav></header>
    {isHome ? <main id="contenu">
      <section className="public-hero" aria-labelledby="public-title"><div className="public-wrap public-hero-grid"><div><p className="public-eyebrow">POUR LES COMMERCES ET LEURS ÉQUIPES</p><h1 id="public-title">Votre commerce, du premier achat à la dernière vente.</h1><p className="public-lead">Tournal réunit vos stocks, ventes, clients et fournisseurs pour suivre une boutique ou tout un réseau de points de vente.</p><div className="public-actions"><a className="public-button public-button-gold" href="/login">Se connecter</a><ContactLink className="public-button public-button-outline">Demander un accès</ContactLink></div><p className="public-hero-note">Stock · ventes · marges FIFO · pilotage multi-boutiques</p></div><Preview/></div></section>
      <section className="public-section public-wrap" aria-labelledby="benefits-title"><p className="public-eyebrow">UNE VUE CLAIRE SUR VOTRE ACTIVITÉ</p><h2 id="benefits-title">Moins de zones d’ombre.<br/>Plus de repères pour décider.</h2><div className="public-benefits">{benefits.map(item => <article key={item.number}><span aria-hidden="true">{item.number}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
      <section id="fonctionnalites" className="public-feature-section" aria-labelledby="features-title"><div className="public-wrap"><p className="public-eyebrow">TOUT AU LONG DE VOTRE JOURNÉE</p><h2 id="features-title">Les outils qui accompagnent<br/>la vie de vos boutiques.</h2><p className="public-section-intro">De l’approvisionnement au suivi des résultats, retrouvez chaque opération dans son contexte.</p><div className="public-feature-grid">{features.map(item => <article key={item.title}><p className="public-feature-tag">{item.tag}</p><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></div></section>
      <section className="public-how" aria-labelledby="how-title"><div className="public-wrap"><p className="public-eyebrow">COMMENT ÇA MARCHE</p><h2 id="how-title">Un même fil, en trois étapes.</h2><ol><li><strong>Préparez vos boutiques</strong><p>Renseignez produits, clients et fournisseurs, puis définissez les accès de votre équipe.</p></li><li><strong>Enregistrez l’activité</strong><p>Suivez réceptions, commandes, ventes, paiements et transferts au fil de la journée.</p></li><li><strong>Pilotez avec vos chiffres</strong><p>Consultez les stocks, marges, échéances et rapports pour repérer les actions à mener.</p></li></ol></div></section>
      <section className="public-section public-wrap" aria-labelledby="faq-title"><p className="public-eyebrow">VOS QUESTIONS</p><h2 id="faq-title">Avant de commencer.</h2><div className="public-faq"><details><summary>Pour une seule boutique ou plusieurs ?</summary><p>Tournal permet de travailler boutique par boutique et de consulter une vue multi-boutiques selon vos droits.</p></details><details><summary>Est-ce que toute l’équipe voit les mêmes informations ?</summary><p>Les accès sont définis par utilisateur et par boutique. Les opérations et les informations visibles dépendent du rôle et des droits accordés.</p></details><details><summary>Que se passe-t-il si la connexion coupe ?</summary><p>Une session déjà ouverte dispose de mécanismes hors ligne pour certaines ventes et certains règlements, avec synchronisation au retour de la connexion. L’ouverture de session et d’autres opérations nécessitent Internet.</p></details><details><summary>Comment obtenir un compte ?</summary><p>L’accès est accordé après examen de votre demande. Un compte existant se connecte avec son numéro de téléphone et son mot de passe.</p></details><details><summary>Les aperçus montrent-ils de vraies boutiques ?</summary><p>Non. Les boutiques, produits, documents et montants présentés ici sont entièrement fictifs.</p></details></div></section>
      <section className="public-last public-wrap"><p className="public-eyebrow">VOTRE PROCHAINE ÉTAPE</p><h2>Gardez le fil de votre commerce.</h2><p>Vous avez déjà un compte ? Connectez-vous. Pour découvrir Tournal, demandez un accès.</p><div className="public-actions"><a className="public-button public-button-gold" href="/login">Se connecter</a><ContactLink className="public-button public-button-outline">Demander un accès</ContactLink></div></section>
    </main> : <main id="contenu" className="public-wrap public-policy"><p className="public-eyebrow">TOURNAL</p><h1>{page === "legal" ? "Mentions légales" : "Politique de confidentialité"}</h1><p>Informations provisoires, à compléter avant publication définitive.</p>{page === "legal" ? <><h2>Éditeur et contact</h2><p>L’identité juridique, l’adresse et le contact de l’éditeur restent à renseigner. Aucun renseignement fictif n’est utilisé à leur place.</p><h2>Hébergement</h2><p>Le site public est hébergé sur Cloudflare. Les services de données et d’authentification utilisent Supabase.</p></> : <><h2>Demande d’accès</h2><p>Le formulaire recueille votre nom, votre téléphone et votre activité, ainsi que votre société et un message si vous choisissez de les renseigner. Ces informations servent à examiner votre demande et à vous recontacter.</p><h2>Accès et conservation</h2><p>Les demandes sont accessibles aux responsables autorisés selon leur périmètre. Les demandes refusées sont supprimées 30 jours après le refus. Les données personnelles des demandes acceptées sont anonymisées après 30 jours ; les demandes non traitées sont conservées au maximum 90 jours. Les journaux de décision ne contiennent pas les coordonnées ni les messages des prospects.</p><h2>Vos droits</h2><p>Vous pouvez demander l’accès, la rectification ou la suppression de vos données. Le contact du responsable, la base légale et les informations sur les sous-traitants et transferts éventuels restent à préciser.</p></>}<a href="/">Retour à l’accueil</a></main>}
    <footer className="public-footer"><div className="public-wrap public-footer-inner"><div><a className="public-brand" href="/">Tournal</a><span>© {new Date().getFullYear()} Tournal</span></div><nav aria-label="Informations et contact"><a href="/demande-acces">Demander un accès</a><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Politique de confidentialité</a></nav></div></footer>
  </div>;
}
