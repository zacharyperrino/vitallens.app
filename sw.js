// ─── VitalLens Service Worker ─────────────────────────────────
// Offline shell + background sync for queued writes + push notifications.
//
// Honesty rules: a write that could not reach the server is NEVER reported
// as a success. The client receives 503 + {queued:true} and shows "saved
// offline, pending sync". Queued items carry no auth header; the page
// supplies a fresh token at replay time. Items are dropped after 5 failed
// attempts or 7 days so the queue cannot grow forever.

const CACHE_NAME = 'vitallens-v3';
const OFFLINE_QUEUE = 'vitallens-offline-queue';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];
const MAX_ATTEMPTS = 5;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      event.respondWith(handleOfflineWrite(request));
    }
    return; // GET API — network only
  }

  if (request.method !== 'GET') return;

  // HTML shell — network first; only a GOOD response is cached as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Content-hashed build assets — immutable, cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Other static — stale-while-revalidate.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// ── Offline write handler ─────────────────────────────────────
async function handleOfflineWrite(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Multipart bodies (image uploads) cannot be replayed faithfully — refuse honestly.
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      return json({ error: 'You are offline. Photo uploads need a connection — please try again when reconnected.', queued: false }, 503);
    }
    const body = await request.clone().text();
    const headers = Object.fromEntries(request.headers.entries());
    delete headers.authorization; // tokens expire; the page supplies a fresh one at replay
    try {
      await queueOfflineRequest({ url: request.url, method: request.method, headers, body, timestamp: Date.now(), attempts: 0 });
      return json({ error: 'Saved offline — this will sync when your connection returns.', queued: true }, 503);
    } catch {
      return json({ error: 'You are offline and this could not be saved. Please try again when reconnected.', queued: false }, 503);
    }
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── Offline queue (IndexedDB) ─────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vitallens-offline', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (db.objectStoreNames.contains(OFFLINE_QUEUE)) db.deleteObjectStore(OFFLINE_QUEUE);
      db.createObjectStore(OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  try {
    const tx = db.transaction(OFFLINE_QUEUE, mode);
    const store = tx.objectStore(OFFLINE_QUEUE);
    const result = await fn(store);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    return result;
  } finally {
    db.close();
  }
}

const queueOfflineRequest = (item) => withStore('readwrite', (store) => { store.add(item); });
const getQueuedRequests = () => withStore('readonly', (store) => new Promise((res, rej) => {
  const req = store.getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
}));
const clearQueuedRequest = (id) => withStore('readwrite', (store) => { store.delete(id); });
const updateQueuedRequest = (item) => withStore('readwrite', (store) => { store.put(item); });

// ── Background sync ───────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'vitallens-sync') event.waitUntil(syncOfflineQueue());
});

async function getFreshToken() {
  const clients = await self.clients.matchAll({ type: 'window' });
  if (!clients.length) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data?.token || null); };
    clients[0].postMessage({ type: 'get-token' }, [channel.port2]);
  });
}

async function syncOfflineQueue() {
  const queued = await getQueuedRequests();
  if (!queued.length) return;
  const token = await getFreshToken();
  if (!token) return; // no open page to mint a token; try again next sync

  let synced = 0, dropped = 0;
  for (const item of queued) {
    if (Date.now() - item.timestamp > MAX_AGE_MS || item.attempts >= MAX_ATTEMPTS) {
      await clearQueuedRequest(item.id); dropped++; continue;
    }
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: { ...item.headers, Authorization: `Bearer ${token}` },
        body: item.body,
      });
      if (response.ok) { await clearQueuedRequest(item.id); synced++; }
      else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // Permanent client error — replaying will never succeed.
        await clearQueuedRequest(item.id); dropped++;
      } else {
        await updateQueuedRequest({ ...item, attempts: item.attempts + 1 });
      }
    } catch {
      await updateQueuedRequest({ ...item, attempts: item.attempts + 1 });
    }
  }
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'sync-complete', synced, dropped }));
}

// ── Messages from the page ────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  if (type === 'show-notification' && payload?.title) {
    event.waitUntil(self.registration.showNotification(payload.title, payload.options || {}));
  }
  if (type === 'trigger-sync') event.waitUntil(syncOfflineQueue());
  if (type === 'get-queue-count') {
    getQueuedRequests().then(q => event.source?.postMessage({ type: 'queue-count', count: q.length })).catch(() => {});
  }
});

// ── Push ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data;
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text?.() || '' }; }
  const { title = 'VitalLens', body = 'You have a new update.', url = '/' } = data;
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: '/icons/icon-192.svg', badge: '/icons/icon-192.svg', data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    if (list.length > 0) { list[0].focus(); return list[0].navigate(url); }
    return self.clients.openWindow(url);
  }));
});
