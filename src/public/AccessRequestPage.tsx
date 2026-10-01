import { useCallback, useEffect, useRef, useState } from "react"
import { Turnstile } from "./Turnstile"
import "./access-request.css"
const url =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://cnxtylngddwmhugxkzju.supabase.co"
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_Jeo4Bx2IsTPCkzsQMYTuFQ_VKPQc9Aq"
export default function AccessRequestPage({
  privacy = false,
}: {
  privacy?: boolean
}) {
  const [token, setToken] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const sending = useRef(false)
  const confirmation = useRef<HTMLHeadingElement>(null)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || ""
  const onError = useCallback(
    () =>
      setError(
        "La vérification anti-spam ne se charge pas. Réessayez plus tard.",
      ),
    [],
  )
  useEffect(() => {
    document.title = privacy
      ? "Confidentialité | Tournal"
      : "Demander un accès | Tournal"
    if (sent) confirmation.current?.focus()
  }, [privacy, sent])
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    if (!token) {
      setError("Terminez la vérification anti-spam avant l’envoi.")
      return
    }
    const data = new FormData(event.currentTarget)
    const phone = String(data.get("telephone") || "")
    let digits = phone.replace(/[^0-9]/g, "")
    if (digits.startsWith("00")) digits = digits.slice(2)
    if (digits.length === 9) digits = "221" + digits
    if (!/^\+?[0-9 ()-]+$/.test(phone) || !/^[1-9][0-9]{7,14}$/.test(digits)) {
      setError(
        "Indiquez un numéro local à 9 chiffres ou un numéro international valide.",
      )
      return
    }
    sending.current = true
    setBusy(true)
    setError("")
    try {
      const body = Object.fromEntries(
        [
          "nom",
          "societe",
          "telephone",
          "type_activite",
          "message",
          "website",
        ].map((name) => [name, String(data.get(name) || "")]),
      )
      const response = await fetch(
        `${url}/functions/v1/submit-access-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ ...body, token }),
          signal: AbortSignal.timeout(20000),
          credentials: "omit",
          cache: "no-store",
        },
      )
      const result = await response.json().catch(() => null)
      if (!response.ok || result?.received !== true)
        throw new Error(
          result?.error || "Envoi indisponible. Réessayez plus tard.",
        )
      setSent(true)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Envoi indisponible. Réessayez plus tard.",
      )
    } finally {
      sending.current = false
      setBusy(false)
      setToken("")
      setAttempt((n) => n + 1)
    }
  }
  return (
    <div className="access-public">
      <a className="access-skip" href="#contenu">
        Aller au contenu
      </a>
      <header>
        <a href="/" aria-label="Tournal, accueil">
          Tournal
        </a>
        <a href="/login">Se connecter</a>
      </header>
      <main id="contenu">
        {privacy ? (
          <>
            <h1>Politique de confidentialité provisoire</h1>
            <p>
              Pour étudier votre demande, Tournal collecte votre nom, votre
              téléphone, votre activité et, si vous les renseignez, votre
              société et votre message. N’indiquez aucune donnée sensible dans
              le message.
            </p>
            <p>
              Ces informations sont accessibles au SuperAdmin et au propriétaire
              de la boutique à laquelle votre demande est attribuée. Elles
              servent à examiner la demande et à vous recontacter.
            </p>
            <p>
              Les demandes refusées sont supprimées 30 jours après le refus. Les
              données personnelles des demandes acceptées sont anonymisées 30
              jours après l’acceptation. Une demande non clôturée est supprimée
              après 90 jours sans décision. Les journaux de décision conservent
              uniquement les identifiants et les actions, sans donnée
              personnelle.
            </p>
            <p>
              Cloudflare Turnstile vérifie les soumissions pour limiter le spam.
              Consultez la{" "}
              <a href="https://www.cloudflare.com/privacypolicy/">
                politique de confidentialité Cloudflare
              </a>
              .
            </p>
            <p>
              Vous pouvez demander l’accès, la rectification ou la suppression
              de vos données. L’identité du responsable, la base légale et
              l’adresse d’exercice des droits restent à fournir et à valider
              avant publication définitive.
            </p>
            <a href="/demande-acces">Retour au formulaire</a>
          </>
        ) : sent ? (
          <section aria-live="polite">
            <h1 ref={confirmation} tabIndex={-1}>
              Votre demande a bien été reçue
            </h1>
            <p>
              Si une suite peut être donnée à votre demande, l’équipe Tournal
              vous recontactera au numéro indiqué. Cette confirmation ne crée
              pas de compte.
            </p>
            <a href="/login">Se connecter</a>
          </section>
        ) : (
          <>
            <p className="access-eyebrow">DÉCOUVRIR TOURNAL</p>
            <h1>Demander un accès</h1>
            <p>
              Présentez-nous votre activité. L’équipe Tournal examinera votre
              demande avant de vous proposer un accès adapté.
            </p>
            <form onSubmit={submit} aria-busy={busy}>
              <fieldset disabled={busy}>
                <legend className="sr-only">
                  Vos coordonnées et votre activité
                </legend>
                <label htmlFor="nom">Nom *</label>
                <input
                  id="nom"
                  name="nom"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
                <label htmlFor="societe">Société (facultatif)</label>
                <input
                  id="societe"
                  name="societe"
                  autoComplete="organization"
                  maxLength={120}
                />
                <label htmlFor="telephone">Téléphone *</label>
                <input
                  id="telephone"
                  name="telephone"
                  type="tel"
                  autoComplete="tel"
                  required
                  maxLength={32}
                  aria-describedby="phone-help"
                />
                <small id="phone-help">
                  Numéro local sénégalais à 9 chiffres ou numéro international
                  avec indicatif.
                </small>
                <label htmlFor="type_activite">Type d’activité *</label>
                <input
                  id="type_activite"
                  name="type_activite"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex. commerce de tissus"
                />
                <label htmlFor="message">Message (facultatif)</label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  maxLength={1000}
                  aria-describedby="message-help"
                />
                <small id="message-help">
                  1 000 caractères maximum. Aucune donnée sensible.
                </small>
                <div className="access-trap" aria-hidden="true">
                  <label htmlFor="website">Site internet</label>
                  <input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>
              </fieldset>
              <p>
                En envoyant ce formulaire, vous demandez à être recontacté pour
                l’étude de votre accès.{" "}
                <a href="/confidentialite">
                  Lire la politique de confidentialité
                </a>
                .
              </p>
              {siteKey ? (
                <Turnstile
                  siteKey={siteKey}
                  attempt={attempt}
                  onToken={setToken}
                  onError={onError}
                />
              ) : (
                <p role="status">
                  Le formulaire sera disponible dès que la protection anti-spam
                  sera configurée.
                </p>
              )}
              {error && (
                <p role="alert" className="access-error">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy || !token || !siteKey}>
                {busy ? "Envoi en cours…" : "Envoyer ma demande"}
              </button>
            </form>
          </>
        )}
      </main>
      <footer>
        <a href="/">Accueil</a>
        <a href="/confidentialite">Confidentialité</a>
      </footer>
    </div>
  )
}
