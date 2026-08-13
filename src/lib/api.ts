import { projectId, publicAnonKey } from "../../utils/supabase/info";

const GATEWAY = `https://${projectId}.supabase.co/functions/v1`;
const FN = "make-server-9ae2c303";
const AUTH = { "Content-Type": "application/json", "Authorization": `Bearer ${publicAnonKey}` };

export async function getData<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`${GATEWAY}/${FN}/data/${encodeURIComponent(key)}`, {
      headers: { ...AUTH, "Accept-Encoding": "gzip" },
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: T | null };
    return json.data;
  } catch {
    return null;
  }
}

export async function saveData<T>(key: string, data: T): Promise<void> {
  const res = await fetch(`${GATEWAY}/${FN}/data/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function signQZ(toSign: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/${FN}/qz/sign`, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Authorization": `Bearer ${publicAnonKey}` },
    body: toSign,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QZ sign failed ${res.status}: ${text}`);
  }
  return res.text();
}

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY}/${FN}/health`, { headers: AUTH });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Image stripping helpers ───────────────────────────────────────────────────
// Base64 images are extracted before saving to keep the main payload small,
// then merged back after loading.

type ImageMap = Record<string, string>; // key → base64

function isBase64(s: string) { return typeof s === "string" && s.startsWith("data:"); }

export function stripImages(boutiques: any[]): { stripped: any[]; images: ImageMap } {
  const images: ImageMap = {};
  const stripped = boutiques.map(b => ({
    ...b,
    logo: isBase64(b.logo) ? (images[`logo:${b.id}`] = b.logo, `__img:logo:${b.id}`) : b.logo,
    products: (b.products ?? []).map((p: any) => ({
      ...p,
      img: isBase64(p.img) ? (images[`${b.id}:${p.id}`] = p.img, `__img:${b.id}:${p.id}`) : p.img,
    })),
  }));
  return { stripped, images };
}

// ── Invoice email via Resend ──────────────────────────────────────────────────
export async function sendInvoiceEmail(params: {
  to: string; subject: string; html: string;
  fromName?: string; fromEmail?: string;
}): Promise<void> {
  const res = await fetch(`${GATEWAY}/${FN}/email/invoice`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email failed ${res.status}: ${text}`);
  }
}

// ── Store invoice PDF (binary) and get a 48h signed URL (for SMS / WhatsApp) ──
// pdfBase64: jsPDF output("arraybuffer") converted to base64 on the client
export async function storePDFForSMS(params: {
  invoiceId: string; boutiqueId: string; pdfBase64: string;
}): Promise<string> {
  const res = await fetch(`${GATEWAY}/${FN}/pdf/store`, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PDF store failed ${res.status}: ${text}`);
  }
  const json = await res.json() as { url: string };
  return json.url;
}

export function mergeImages(boutiques: any[], images: ImageMap): any[] {
  return boutiques.map(b => ({
    ...b,
    logo: typeof b.logo === "string" && b.logo.startsWith("__img:") ? images[b.logo.slice(6)] ?? b.logo : b.logo,
    products: (b.products ?? []).map((p: any) => ({
      ...p,
      img: typeof p.img === "string" && p.img.startsWith("__img:") ? images[p.img.slice(6)] ?? p.img : p.img,
    })),
  }));
}
