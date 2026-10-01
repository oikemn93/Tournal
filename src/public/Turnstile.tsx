import { useEffect, useRef } from "react"
type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}
let loading: Promise<void> | undefined
function loadWidget() {
  if (window.turnstile) return Promise.resolve()
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script")
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        script.remove()
        loading = undefined
        reject(new Error("widget"))
      }
      document.head.append(script)
    })
  return loading
}
export function Turnstile({
  siteKey,
  attempt,
  onToken,
  onError,
}: {
  siteKey: string
  attempt: number
  onToken: (token: string) => void
  onError: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let disposed = false
    let id: string | undefined
    void loadWidget()
      .then(() => {
        if (disposed || !container.current || !window.turnstile) return
        id = window.turnstile.render(container.current, {
          sitekey: siteKey,
          action: "access_request",
          language: "fr",
          size: "flexible",
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("")
            onError()
          },
        })
      })
      .catch(() => {
        if (!disposed) onError()
      })
    return () => {
      disposed = true
      if (id) window.turnstile?.remove(id)
    }
  }, [siteKey, attempt, onToken, onError])
  return <div ref={container} aria-label="Vérification anti-spam" />
}
