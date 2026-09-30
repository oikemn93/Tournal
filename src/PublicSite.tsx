import React from "react";
import "./PublicSite.css";

const benefits = [
  { number: "01", title: "Un stock que vous pouvez suivre", text: "Voyez ce qui entre, ce qui sort et ce qui reste dans chaque point de vente." },
  { number: "02", title: "Des marges plus lisibles", text: "Rapprochez vos ventes des coûts d’achat des premiers lots sortis (méthode FIFO)." },
  { number: "03", title: "Des transferts mieux maîtrisés", text: "Suivez les mouvements de marchandises entre vos points de vente, de l’envoi à la réception." },
  { number: "04", title: "Une vue d’ensemble", text: "Gardez un œil sur l’activité et les indicateurs de vos boutiques au même endroit." },
];

function ContactLink({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <a className={className} href="/demande-acces">{children}</a>;
}

export default function PublicSite({ page = "home" }: { page?: "home" | "legal" | "privacy" }) {
  const isHome = page === "home";
  return <div className="public-site">
    <a className="public-skip" href="#contenu">Aller au contenu</a>
    <header className="public-header">
      <nav className="public-nav" aria-label="Navigation principale">
        <a className="public-brand" href="/" aria-label="Tournal, accueil"><img src="/brand/tournal-mark-gold.jpg?v=20260823" alt="" width="42" height="42" /> <span>Tournal</span></a>
        <a className="public-nav-login" href="/login">Se connecter</a>
      </nav>
    </header>
    {isHome ? <main id="contenu">
      <section className="public-hero" aria-labelledby="public-title">
        <div className="public-wrap public-hero-grid">
          <div>
            <p className="public-eyebrow">GESTION COMMERCIALE MULTI-BOUTIQUES</p>
            <h1 id="public-title">Gardez vos boutiques, vos stocks et vos marges en vue.</h1>
            <p className="public-lead">Tournal aide les commerçants qui gèrent un ou plusieurs points de vente à suivre leurs marchandises, leurs ventes et leur activité au quotidien.</p>
            <div className="public-actions"><a className="public-button public-button-gold" href="/login">Se connecter</a><ContactLink className="public-button public-button-outline">Demander un accès</ContactLink></div>
          </div>
          <div className="public-preview" role="img" aria-label="Maquette fictive du tableau de bord Tournal avec stock, ventes et transferts">
            <div className="public-preview-top"><span className="public-preview-mark">T</span><strong>Vue d’ensemble</strong><span className="public-preview-tag">DÉMONSTRATION</span></div>
            <div className="public-preview-inner">
              <p className="public-preview-caption">Boutique Exemple · septembre 2026</p>
              <div className="public-metrics"><div><small>Ventes du mois</small><strong>2 480 000 F</strong><span>Exemple fictif</span></div><div><small>Produits en stock</small><strong>128</strong><span>Exemple fictif</span></div></div>
              <div className="public-preview-row"><span>Wax imprimé</span><span>42 en stock</span></div><div className="public-preview-row"><span>Coton uni</span><span>18 en stock</span></div>
              <div className="public-preview-foot">Transfert en cours <strong>1 mouvement</strong></div>
            </div>
            <p className="public-fictive">Maquette illustrative · données entièrement fictives</p>
          </div>
        </div>
      </section>
      <section className="public-section public-wrap" aria-labelledby="benefits-title"><p className="public-eyebrow">AU QUOTIDIEN</p><h2 id="benefits-title">Des décisions appuyées sur vos chiffres</h2><div className="public-benefits">{benefits.map(item => <article key={item.number}><span aria-hidden="true">{item.number}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
      <section className="public-how" aria-labelledby="how-title"><div className="public-wrap"><p className="public-eyebrow">COMMENT ÇA MARCHE</p><h2 id="how-title">Trois gestes pour garder le cap</h2><ol><li><strong>Renseignez vos marchandises</strong><p>Enregistrez les produits et les entrées de stock de chaque boutique.</p></li><li><strong>Suivez les opérations</strong><p>Retrouvez ventes, mouvements de stock et transferts au fil de l’activité.</p></li><li><strong>Consultez votre situation</strong><p>Examinez vos stocks, vos marges et vos indicateurs pour décider de la suite.</p></li></ol></div></section>
      <section className="public-last public-wrap"><h2>Prêt à découvrir Tournal ?</h2><p>Connectez-vous si vous avez déjà un compte ou demandez un accès.</p><div className="public-actions"><a className="public-button public-button-gold" href="/login">Se connecter</a><ContactLink className="public-button public-button-outline">Demander un accès</ContactLink></div></section>
    </main> : <main id="contenu" className="public-wrap public-policy"><p className="public-eyebrow">TOURNAL</p><h1>{page === "legal" ? "Mentions légales" : "Politique de confidentialité"}</h1><p>Cette page est provisoire. Les informations officielles relatives {page === "legal" ? "à l’éditeur, à l’hébergement et au contact légal" : "aux données traitées, aux durées de conservation et à l’exercice des droits"} doivent être fournies et validées avant publication définitive.</p><a href="/">Retour à l’accueil</a></main>}
    <footer className="public-footer"><div className="public-wrap public-footer-inner"><span>© {new Date().getFullYear()} Tournal</span><div><a href="/demande-acces">Demander un accès</a><a href="/mentions-legales">Mentions légales</a><a href="/confidentialite">Politique de confidentialité</a></div></div></footer>
  </div>;
}
