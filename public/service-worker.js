const CACHE_NAME = 'tournal-shell-v5';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon-16.png', '/favicon-32.png', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-192.png', '/icon-maskable-512.png'];
const OFFLINE_DB = 'tournal-offline-v1';
const OFFLINE_DB_VERSION = 1;
const QUEUE_STORE = 'queue';
const META_STORE = 'meta';
const NETWORK_TIMEOUT_MS = 12000;
const SLOW_NETWORK_MS = 8000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ])
  );
});

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB indisponible'));
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openOfflineDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let value;
      try { value = callback(store); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error || new Error('Transaction locale impossible'));
      tx.onabort = () => reject(tx.error || new Error('Transaction locale annulée'));
    });
  } finally {
    db.close();
  }
}

async function putQueue(record) {
  await withStore(QUEUE_STORE, 'readwrite', (store) => store.put(record));
}

async function deleteQueue(id) {
  await withStore(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

async function updateQueueError(id, error) {
  const db = await openOfflineDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const get = store.get(id);
      get.onsuccess = () => {
        const current = get.result;
        if (current) store.put({ ...current, lastError: error, attempts: Number(current.attempts || 0) + 1 });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Mise à jour locale impossible'));
    });
  } finally {
    db.close();
  }
}

async function getQueue() {
  const db = await openOfflineDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const request = tx.objectStore(QUEUE_STORE).getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
      request.onerror = () => reject(request.error || new Error('Lecture locale impossible'));
    });
  } finally {
    db.close();
  }
}

async function getMeta(key, fallback) {
  const db = await openOfflineDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const request = tx.objectStore(META_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value ?? fallback);
      request.onerror = () => reject(request.error || new Error('Lecture locale impossible'));
    });
  } finally {
    db.close();
  }
}

async function setMeta(key, value) {
  await withStore(META_STORE, 'readwrite', (store) => store.put({ key, value }));
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try { client.postMessage(message); } catch {}
  }
}

async function queueStatusMessage(type = 'TOURNAL_OFFLINE_QUEUE_STATUS') {
  const records = await getQueue().catch(() => []);
  await notifyClients({ type, queueCount: records.length, oldestCreatedAt: records[0]?.createdAt });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function offlineError(message, code = 'TOURNAL_OFFLINE_BLOCKED') {
  return jsonResponse({ message, code }, 503);
}

function isSupabaseRequest(url) {
  if (url.origin === self.location.origin) return false;
  return url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/functions/v1/');
}

function rpcName(url) {
  const marker = '/rest/v1/rpc/';
  const index = url.pathname.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.pathname.slice(index + marker.length)) : '';
}

function isReplayRequest(request) {
  return (request.headers.get('x-client-info') || '').startsWith('tournal-offline-replay/');
}

async function timedFetch(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(request, { signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    notifyClients({
      type: 'TOURNAL_NETWORK_HEALTH',
      status: latencyMs >= SLOW_NETWORK_MS ? 'suspect' : 'online',
      latencyMs,
      reason: latencyMs >= SLOW_NETWORK_MS ? 'latency' : 'request_ok',
    });
    return response;
  } catch (error) {
    notifyClients({ type: 'TOURNAL_NETWORK_HEALTH', status: 'suspect', reason: error?.name === 'AbortError' ? 'timeout' : 'network_error' });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function temporaryInvoiceId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `OFF-${stamp}-${suffix}`;
}

function saleTotal(lines) {
  return Math.round((Array.isArray(lines) ? lines : []).reduce((sum, line) => {
    const quantity = Number(line?.sellQty ?? line?.qty ?? 0);
    const price = Number(line?.prixUnit ?? 0);
    return sum + quantity * price;
  }, 0) * 100) / 100;
}

async function enqueueCreateSale(request, body) {
  const idempotencyKey = String(body.p_idempotency_key || crypto.randomUUID());
  const id = `create_sale:${idempotencyKey}`;
  const tempInvoiceId = temporaryInvoiceId();
  const createdAt = Date.now();
  const record = {
    id,
    kind: 'create_sale',
    createdAt,
    url: request.url,
    body: { ...body, p_idempotency_key: idempotencyKey },
    tempInvoiceId,
    attempts: 0,
  };
  await putQueue(record);
  const records = await getQueue();
  await notifyClients({ type: 'TOURNAL_OFFLINE_QUEUED', queueCount: records.length, oldestCreatedAt: records[0]?.createdAt });
  return jsonResponse({
    invoice_id: tempInvoiceId,
    client_id: body.p_client_id ?? null,
    total: saleTotal(body.p_lines),
    due_date: null,
    offline: true,
  });
}

async function enqueueCashPayment(request, body) {
  const invoiceId = String(body.p_invoice_id || '');
  if (!invoiceId.startsWith('OFF-')) {
    return offlineError('Mode hors-ligne : l’encaissement espèces est autorisé uniquement pour une vente créée hors ligne pendant cette phase. Les règlements d’anciennes factures restent bloqués pour éviter une incohérence de solde.');
  }
  if (String(body.p_payment_method || '').toLowerCase() !== 'espèces') {
    return offlineError('Mode hors-ligne : seuls les paiements en espèces sont autorisés. Mobile money, carte et avoir client nécessitent une connexion serveur.');
  }
  const idempotencyKey = String(body.p_idempotency_key || crypto.randomUUID());
  const id = `record_payment:${idempotencyKey}`;
  const createdAt = Date.now();
  const amount = Number(body.p_amount || 0);
  await putQueue({
    id,
    kind: 'record_payment',
    createdAt,
    url: request.url,
    body: { ...body, p_idempotency_key: idempotencyKey },
    tempInvoiceId: invoiceId,
    attempts: 0,
  });
  const records = await getQueue();
  await notifyClients({ type: 'TOURNAL_OFFLINE_QUEUED', queueCount: records.length, oldestCreatedAt: records[0]?.createdAt });
  return jsonResponse({
    invoice_id: invoiceId,
    acompte: amount,
    applied_amount: amount,
    status: 'payé',
    stock_deducted: false,
    payment: {
      id: -createdAt,
      amount,
      payment_method: 'Espèces',
      paid_at: new Date(createdAt).toISOString(),
      operator_id: 'offline',
      operator_name: 'Hors ligne',
      batch_id: `OFF-${idempotencyKey}`,
      source: 'invoice',
    },
    offline: true,
  });
}

async function handleSupabaseRequest(request) {
  if (isReplayRequest(request)) return timedFetch(request);

  const url = new URL(request.url);
  const rpc = rpcName(url);
  const isMutation = request.method !== 'GET' && request.method !== 'HEAD';

  if (request.method === 'POST' && rpc === 'create_sale') {
    const clone = request.clone();
    let body = {};
    try { body = await clone.json(); } catch {}
    try {
      const response = await timedFetch(request);
      if (response.status < 500) return response;
    } catch {}
    return enqueueCreateSale(clone, body).catch(() => offlineError('Impossible d’enregistrer la vente localement. Ne validez pas la vente tant que le stockage local n’est pas disponible.'));
  }

  if (request.method === 'POST' && rpc === 'record_payment') {
    const clone = request.clone();
    let body = {};
    try { body = await clone.json(); } catch {}
    try {
      const response = await timedFetch(request);
      if (response.status < 500) return response;
    } catch {}
    return enqueueCashPayment(clone, body).catch(() => offlineError('Impossible d’enregistrer le paiement localement. Ne remettez pas de reçu hors ligne.'));
  }

  try {
    return await timedFetch(request);
  } catch {
    if (isMutation) {
      return offlineError('Mode hors-ligne : cette opération est bloquée. Seules la création de vente et son encaissement en espèces sont autorisés; retours/remboursements, droits/utilisateurs, transferts et autres écritures exigent une connexion.');
    }
    return offlineError('Mode hors-ligne : donnée serveur indisponible. Les écrans déjà chargés conservent les dernières données synchronisées en mémoire.');
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isSupabaseRequest(url)) {
    event.respondWith(handleSupabaseRequest(event.request));
    return;
  }

  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'TOURNAL_GET_QUEUE_STATUS') {
    event.waitUntil(queueStatusMessage());
    return;
  }
  if (message.type === 'TOURNAL_GET_OFFLINE_QUEUE') {
    event.waitUntil((async () => {
      const records = await getQueue().catch(() => []);
      const invoiceMap = await getMeta('invoiceMap', {}).catch(() => ({}));
      const target = event.source;
      if (target && 'postMessage' in target) target.postMessage({ type: 'TOURNAL_OFFLINE_QUEUE', records, invoiceMap });
      else await notifyClients({ type: 'TOURNAL_OFFLINE_QUEUE', records, invoiceMap });
    })());
    return;
  }
  if (message.type === 'TOURNAL_MARK_OFFLINE_SYNCED' && message.id) {
    event.waitUntil((async () => {
      if (message.tempInvoiceId && message.officialInvoiceId) {
        const invoiceMap = await getMeta('invoiceMap', {}).catch(() => ({}));
        invoiceMap[message.tempInvoiceId] = message.officialInvoiceId;
        await setMeta('invoiceMap', invoiceMap);
      }
      await deleteQueue(message.id);
      await queueStatusMessage();
    })());
    return;
  }
  if (message.type === 'TOURNAL_MARK_OFFLINE_ERROR' && message.id) {
    event.waitUntil((async () => {
      await updateQueueError(message.id, String(message.error || 'Erreur de synchronisation'));
      await queueStatusMessage();
    })());
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Tournal', body: event.data ? event.data.text() : 'Nouvelle notification' };
  }

  const title = payload.title || 'Tournal';
  const options = {
    body: payload.body || 'Nouvelle notification',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || `tournal-${Date.now()}`,
    data: payload.data || { url: '/' },
    renotify: false,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    // Important on iOS/iPadOS: do not navigate an already-open PWA window.
    // Navigating first can recreate/reload the standalone context and lose the
    // tab-scoped authenticated state. Focus the existing Tournal client instead.
    for (const client of windows) {
      try {
        client.postMessage({ type: 'TOURNAL_NOTIFICATION_CLICK', url: target });
      } catch {}
      if ('focus' in client) return client.focus();
    }

    // If iOS has fully terminated the PWA there is no live authenticated window
    // to reuse. Opening a new window is then the only standards-based option.
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  })());
});
