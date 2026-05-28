// ─── VitalLens Service Worker ─────────────────────────────────
// Offline data entry + background sync + push notifications

const CACHE_NAME = 'vitallens-v1';
const OFFLINE_QUEUE = 'vitallens-offline-queue';

// Assets to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/styles/variables.css',
  '/src/styles/base.css',
  '/src/styles/components.css',
  '/src/styles/animations.css',
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal — some assets may not exist yet
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls — network first, queue if offline
  if (url.pathname.startsWith('/api/')) {
    if (request.method === 'POST' || request.method === 'PUT') {
      event.respondWith(handleOfflinePost(request));
      return;
    }
    // GET API calls — network only, no cache
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation
      if (request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

// ── Offline POST handler ──────────────────────────────────────
async function handleOfflinePost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Network failed — queue for later sync
    const body = await request.clone().text();
    await queueOfflineRequest({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });

    // Return a synthetic success so the UI doesn't break
    return new Response(JSON.stringify({
      success: true,
      offline: true,
      message: 'Saved offline — will sync when connection returns.',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Offline queue (IndexedDB) ─────────────────────────────────
async function queueOfflineRequest(request) {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_QUEUE, 'readwrite');
  const store = tx.objectStore(OFFLINE_QUEUE);
  store.add(request);
  await new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = rej;
  });
  db.close();
  console.log('[SW] Queued offline request:', request.url);
}

async function getQueuedRequests() {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_QUEUE, 'readonly');
  const store = tx.objectStore(OFFLINE_QUEUE);
  const requests = await new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = rej;
  });
  db.close();
  return requests;
}

async function clearQueuedRequest(id) {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_QUEUE, 'readwrite');
  tx.objectStore(OFFLINE_QUEUE).delete(id);
  await new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = rej;
  });
  db.close();
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vitallens-offline', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE)) {
        db.createObjectStore(OFFLINE_QUEUE, { keyPath: 'timestamp', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Background Sync ───────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'vitallens-sync') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const queued = await getQueuedRequests();
  console.log(`[SW] Syncing ${queued.length} offline requests`);

  for (const item of queued) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });

      if (response.ok) {
        await clearQueuedRequest(item.timestamp);
        console.log('[SW] Synced:', item.url);
      }
    } catch (err) {
      console.warn('[SW] Sync failed for:', item.url, err.message);
    }
  }

  // Notify clients that sync is complete
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'sync-complete' }));
}

// ── Messages ──────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'show-notification' && payload?.title) {
    const { title, options } = payload;
    event.waitUntil(self.registration.showNotification(title, options || {}));
  }

  if (type === 'trigger-sync') {
    event.waitUntil(syncOfflineQueue());
  }

  if (type === 'get-queue-count') {
    getQueuedRequests().then(queued => {
      event.source?.postMessage({ type: 'queue-count', count: queued.length });
    });
  }
});

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const { title = 'VitalLens', body = 'You have a new update.', url = '/' } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-72.png',
      data: { url },
      actions: [{ action: 'open', title: 'View' }],
    })
  );
});

// ── Notification click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        clientList[0].focus();
        clientList[0].navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    })
  );
});