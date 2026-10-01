import { useCallback, useEffect, useRef, useState } from "react"
import { UserPlus, RefreshCw } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
import {
  listRequests,
  requestDetail,
  requestCount,
  requestNotifications,
  readRequestNotification,
  decideRequest,
  routeRequest,
  type AccessSummary,
  type AccessDetail,
  type AccessStatus,
} from "../../lib/access-requests"
import { subscribeToNotifications } from "../../lib/notifications"
const labels: Record<AccessStatus, string> = {
  nouvelle: "Nouvelle",
  vue: "Vue",
  acceptee: "Acceptée",
  refusee: "Refusée",
  complement_demande: "Complément demandé",
}
type Props = {
  scope: string | null
  global: boolean
  boutiques: { id: string; nom: string }[]
}
export function AccessRequestNavigation({ scope, global, boutiques }: Props) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [rows, setRows] = useState<AccessSummary[]>([])
  const [detail, setDetail] = useState<AccessDetail | null>(null)
  const [status, setStatus] = useState("")
  const [offset, setOffset] = useState(0)
  const [note, setNote] = useState("")
  const [destination, setDestination] = useState("")
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const [busy, setBusy] = useState(false)
  const mutation = useRef(false)
  const selection = useRef(0)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      selection.current++
      generation.current++
    }
  }, [])
  const refreshCount = useCallback(async () => {
    try {
      const next = await requestCount(scope)
      if (mounted.current) setCount(Number(next))
    } catch {
      if (mounted.current) setCount(null)
    }
  }, [scope])
  useEffect(() => {
    void refreshCount()
    const onFocus = () => void refreshCount()
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)
    const stop = subscribeToNotifications(scope, onFocus)
    return () => {
      stop()
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refreshCount, scope])
  const reload = useCallback(async () => {
    const current = ++generation.current
    setError("")
    try {
      const next = await listRequests(scope, status || null, offset)
      if (mounted.current && current === generation.current) setRows(next)
      await refreshCount()
    } catch {
      if (mounted.current && current === generation.current) {
        setRows([])
        setDetail(null)
        setError(
          "Accès refusé ou demandes indisponibles. Réessayez avec un compte autorisé.",
        )
      }
    }
  }, [scope, status, offset, refreshCount])
  useEffect(() => {
    if (open) void reload()
  }, [open, reload])
  async function select(id: string) {
    const current = ++selection.current
    setDetail(null)
    setError("")
    try {
      const next = await requestDetail(id)
      if (!mounted.current || current !== selection.current) return
      setDetail(next)
      setNote(next.note_interne || "")
      setDestination(next.boutique_id || "")
      const notifications = await requestNotifications(scope)
      await Promise.all(
        notifications
          .filter((n) => !n.read_at && n.action_filter.request_id === id)
          .map((n) => readRequestNotification(n.id)),
      )
    } catch {
      if (mounted.current && current === selection.current)
        setError("Détail inaccessible ou demande supprimée.")
    }
  }
  useEffect(() => {
    const navigate = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (!id) return
      setOpen(true)
      void select(id)
    }
    window.addEventListener("tournal:access-request", navigate)
    return () => window.removeEventListener("tournal:access-request", navigate)
  }, [scope])
  async function mutate(action: () => Promise<AccessDetail>, success = "Modification enregistrée") {
    if (mutation.current) return
    mutation.current = true
    setBusy(true)
    setError("")
    setFeedback("")
    try {
      const next = await action()
      if (mounted.current) {
        setDetail(next)
        setNote(next.note_interne || "")
        setDestination(next.boutique_id || "")
        setFeedback(success)
        await reload()
      }
    } catch {
      if (mounted.current)
        setError(
          "La décision n’a pas pu être confirmée. Actualisez pour vérifier son état avant de réessayer.",
        )
    } finally {
      mutation.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const terminal = detail?.statut === "acceptee" || detail?.statut === "refusee"
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border bg-white px-2 py-2 text-xs font-black text-slate-900"
        aria-label={`Demandes d’accès${
          count === null ? "" : `, ${count} nouvelles`
        }`}
      >
        <UserPlus size={16} />
        <span className="hidden sm:inline">Demandes d’accès</span>
        {count !== null && count > 0 && (
          <span className="rounded-full bg-[#C9A227] px-1.5 text-slate-950">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (busy) return
          setOpen(value)
          if (!value) {
            selection.current++
            generation.current++
            setDetail(null)
            setRows([])
            setNote("")
          }
        }}
      >
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 h-[100dvh] w-screen max-w-none rounded-none overflow-y-auto p-4 sm:left-[50%] sm:top-[50%] sm:h-auto sm:w-full sm:max-w-4xl sm:max-h-[90dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <DialogTitle>Demandes d’accès</DialogTitle>
          <DialogDescription className="hidden sm:block">
            Étudiez les demandes attribuées à votre périmètre. L’acceptation à cette étape ne crée aucun compte.
          </DialogDescription>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm font-bold">
              Statut
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value)
                  setOffset(0)
                }}
                disabled={busy}
                className="block rounded-lg border p-2"
              >
                <option value="">Tous</option>
                {Object.entries(labels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={busy}
              className="border rounded-lg px-3 py-2 text-sm flex gap-2"
            >
              <RefreshCw size={16} />
              Actualiser
            </button>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}
          {feedback && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{feedback}</p>}
          <div className="grid md:grid-cols-2 gap-5">
            <section aria-label="Liste des demandes" className={detail ? "hidden md:block" : "block"}>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void select(row.id)}
                      className="w-full text-left border rounded-xl p-3 focus-visible:outline-2 focus-visible:outline-amber-700"
                    >
                      <strong>{row.nom || "Demande anonymisée"}</strong>
                      <p className="text-sm">
                        {row.societe ||
                          row.type_activite ||
                          "Données anonymisées"}
                      </p>
                      <p className="text-xs text-slate-600">
                        {labels[row.statut]} ·{" "}
                        {new Date(row.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
              {!rows.length && <p>Aucune demande à afficher.</p>}
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  disabled={busy || offset === 0}
                  onClick={() => setOffset((n) => Math.max(0, n - 50))}
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={busy || rows.length < 50 || offset >= 10000}
                  onClick={() => setOffset((n) => n + 50)}
                >
                  Suivant
                </button>
              </div>
            </section>
            <section aria-label="Détail de la demande" className={detail ? "block" : "hidden md:block"}>
              {detail ? (
                <>
                  <button type="button" disabled={busy} onClick={() => { setDetail(null); setFeedback(""); }} className="mb-3 rounded-lg border px-3 py-2 text-sm font-bold md:hidden">← Retour aux demandes</button>
                  <h2 className="text-lg font-black">
                    {detail.nom || "Demande anonymisée"}
                  </h2>
                  <p>{labels[detail.statut]}</p>
                  <dl className="space-y-2 my-3">
                    <dt className="font-bold">Téléphone</dt>
                    <dd>{detail.telephone || "Anonymisé"}</dd>
                    <dt className="font-bold">Activité</dt>
                    <dd>{detail.type_activite || "Anonymisée"}</dd>
                    <dt className="font-bold">Société</dt>
                    <dd>{detail.societe || "Non renseignée"}</dd>
                    <dt className="font-bold">Message</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {detail.message || "Non renseigné"}
                    </dd>
                  </dl>
                  {global && !terminal && (
                    <div className="space-y-2 border rounded-lg p-3">
                      <label htmlFor="access-destination">
                        Attribuer à une boutique
                      </label>
                      <select
                        id="access-destination"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        disabled={busy}
                        className="w-full border rounded p-2"
                      >
                        <option value="">SuperAdmin uniquement</option>
                        {boutiques.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nom}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(\n                            () => routeRequest(detail.id, destination || null),\n                            "Attribution enregistrée",\n                          )
                        }
                        className="w-full rounded-xl bg-slate-950 px-3 py-3 font-bold text-white disabled:opacity-50"
                      >
                        Enregistrer l’attribution
                      </button>
                    </div>
                  )}
                  <label className="block my-3">
                    Note interne (1 000 caractères maximum, sans donnée
                    sensible)
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={busy || terminal}
                      maxLength={1000}
                      className="block w-full border rounded-lg p-2"
                      rows={3}
                    />
                  </label>
                  {!terminal && (
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      {([
                        "vue",
                        "acceptee",
                        "refusee",
                        "complement_demande",
                      ] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(\n                            () => decideRequest(detail.id, value, note),\n                            value === "vue" ? "Demande marquée comme vue" : value === "acceptee" ? "Demande acceptée" : value === "refusee" ? "Demande refusée" : "Complément demandé",\n                          )
                          }
                          className={`min-h-11 rounded-lg border px-3 py-2 font-bold disabled:opacity-50 ${
                            value === "acceptee"
                              ? "bg-[#C9A227] text-slate-950"
                              : ""
                          }`}
                        >
                          {value === "vue"
                            ? "Marquer vue"
                            : value === "acceptee"
                              ? "Accepter"
                              : value === "refusee"
                                ? "Refuser"
                                : "Demander un complément"}
                        </button>
                      ))}
                    </div>
                  )}
                  {detail.statut === "complement_demande" && (
                    <p className="text-sm mt-3">
                      Recontactez le prospect au numéro indiqué pour préciser
                      les éléments manquants. Aucun SMS ou e-mail n’est envoyé à
                      cette étape.
                    </p>
                  )}
                  {detail.statut === "acceptee" && (
                    <p className="text-sm mt-3">
                      Demande approuvée. La création du compte et son activation
                      seront disponibles à l’étape B.
                    </p>
                  )}
                </>
              ) : (
                <p>Sélectionnez une demande pour consulter ses coordonnées.</p>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
