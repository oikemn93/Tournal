const OFFLINE_PIN_KEY = "tournal.offline-pin.v1";
const OFFLINE_PIN_TTL_MS = 12 * 60 * 60 * 1000;
const OFFLINE_PIN_MAX_ATTEMPTS = 5;
const OFFLINE_PIN_LOCK_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 250_000;

type OfflinePinRecord = {
  userId: string;
  salt: string;
  verifier: string;
  expiresAt: number;
  failedAttempts: number;
  lockedUntil?: number | null;
};

export type OfflinePinResult = {
  ok: boolean;
  configured: boolean;
  offline: true;
  attemptsRemaining?: number;
  lockedUntil?: string | null;
  expired?: boolean;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readRecord(): OfflinePinRecord | null {
  try {
    const raw = sessionStorage.getItem(OFFLINE_PIN_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as OfflinePinRecord;
    if (!record?.userId || !record.salt || !record.verifier || !Number.isFinite(record.expiresAt)) return null;
    return record;
  } catch {
    return null;
  }
}

function writeRecord(record: OfflinePinRecord | null) {
  try {
    if (record) sessionStorage.setItem(OFFLINE_PIN_KEY, JSON.stringify(record));
    else sessionStorage.removeItem(OFFLINE_PIN_KEY);
  } catch {
    // Session storage can be unavailable in hardened/private browser contexts.
  }
}

async function deriveVerifier(pin: string, userId: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${userId}:${pin}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBuffer = new Uint8Array(salt).buffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export async function armOfflinePin(pin: string, userId: string) {
  if (!/^\d{6}$/.test(pin) || !userId) return false;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(pin, userId, salt);
  writeRecord({
    userId,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(verifier),
    expiresAt: Date.now() + OFFLINE_PIN_TTL_MS,
    failedAttempts: 0,
    lockedUntil: null,
  });
  return true;
}

export function clearOfflinePin() {
  writeRecord(null);
}

export function hasOfflinePin(userId: string) {
  const record = readRecord();
  if (!record || record.userId !== userId) return false;
  if (record.expiresAt <= Date.now()) {
    writeRecord(null);
    return false;
  }
  return true;
}

export async function verifyOfflinePin(pin: string, userId: string): Promise<OfflinePinResult> {
  const record = readRecord();
  if (!record || record.userId !== userId) return { ok:false, configured:false, offline:true };
  if (record.expiresAt <= Date.now()) {
    writeRecord(null);
    return { ok:false, configured:false, offline:true, expired:true };
  }
  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    return { ok:false, configured:true, offline:true, attemptsRemaining:0, lockedUntil:new Date(record.lockedUntil).toISOString() };
  }
  if (!/^\d{6}$/.test(pin)) {
    return { ok:false, configured:true, offline:true, attemptsRemaining:Math.max(0, OFFLINE_PIN_MAX_ATTEMPTS - record.failedAttempts) };
  }

  const actual = await deriveVerifier(pin, userId, base64ToBytes(record.salt));
  const expected = base64ToBytes(record.verifier);
  if (equalBytes(actual, expected)) {
    writeRecord({ ...record, failedAttempts:0, lockedUntil:null });
    return { ok:true, configured:true, offline:true, attemptsRemaining:OFFLINE_PIN_MAX_ATTEMPTS, lockedUntil:null };
  }

  const failedAttempts = record.failedAttempts + 1;
  if (failedAttempts >= OFFLINE_PIN_MAX_ATTEMPTS) {
    const lockedUntil = now + OFFLINE_PIN_LOCK_MS;
    writeRecord({ ...record, failedAttempts:0, lockedUntil });
    return { ok:false, configured:true, offline:true, attemptsRemaining:0, lockedUntil:new Date(lockedUntil).toISOString() };
  }

  writeRecord({ ...record, failedAttempts, lockedUntil:null });
  return { ok:false, configured:true, offline:true, attemptsRemaining:OFFLINE_PIN_MAX_ATTEMPTS - failedAttempts, lockedUntil:null };
}

export function isOfflineAvailabilityError(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /mode hors-ligne|indisponible|failed to fetch|networkerror|load failed|network request failed/i.test(message);
}
