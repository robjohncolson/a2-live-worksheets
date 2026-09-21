// sw.js — Algebra 2 PWA service worker (OFFLINE_MODE_SPEC §4.G).
// Registered from the Desk with the repo-root scope, so it controls the Desk +
// worksheets + study guide. Strategy:
//   - navigations  → NETWORK-FIRST (always fresh HTML online; cached only offline)
//   - same-origin static GET → cache-first (fast + offline)
//   - cross-origin / non-GET / version.json → PASSTHROUGH (APIs + the update-nudge
//     freshness check must never be served from cache)
// Cache is versioned to the build (bump-build.mjs stamps BUILD); activate purges
// old caches, so a deploy never gets 'stuck' on stale assets. The existing
// stale-tab nudge prompts the reload that swaps in the new SW.
//
// KILL SWITCH: if the SW ever misbehaves in the field, deploy an sw.js whose body
// is just `self.addEventListener('install',()=>self.skipWaiting()); self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).then(()=>self.clients.claim())));`
// to unregister-by-emptying (clears caches; pages fall back to plain network).

const BUILD = '2026-09-21-3qfk'; // scripts/bump-build.mjs replaces this stamp
const CACHE = 'apstats-pwa-' + BUILD;

const CORE = [
  './',
  'desk.html',
  'check.html',
  'check.js',
  'a2-client.js',
  'a2-announcement.js',
  'a2-announcement.css',
  'grade-engine.bundle.js',
  'a2-desk.js',
  'lib/a2-answers.js',
  'lib/a2-year-plan.js',
  'teacher-tryits.html',
  'content/a2/lessons.json',
  'content/a2/1-1/deck.csv',
  'content/a2/1-1/images/1-1_savvas_q18-22_graph.png',
  'content/a2/1-1/images/1-1_savvas_q23-27_graph.png',
  'content/a2/1-1/images/1-1_savvas_q32_graph.png',
  'index.html',
  'TOC.html',
  'offline-queue.js',
  'gradebook-client.js',
  'worksheet-diagnostics.js',
  'roster-client.js',
  'roster_config.js',
  'railway_client.js',
  'railway_config.js',
  'manifest.webmanifest',
  'icon.svg',
  'pwa-register.js',
  'flashcards.js',
  'mobile-home.html',
  'verify.html',
  'verify-page.js',
  'receipt-verify.js',
  'roadmap-data.json',
  'data/blooket-topic-csv.json',
  'data/blooket-difficulty.json',
  'lib/flashcard-srs.js',
  'lib/flashcard-store.js',
  'lib/flashcard-flags.js',
  'lib/flashcard-sync.js',
  'data/flashcard-flags.json',
  'js/ced2026-crosswalk.js',
  'js/ced2026-labels.js'
];

// Pure decision (unit-tested via extraction): 'navigate' | 'asset' | 'passthrough'.
function cacheStrategyFor(request, selfOrigin) {
  if (request.method !== 'GET') return 'passthrough';
  // Range requests need the browser's partial-response handling, not a cached full file.
  if (request.headers.get('range')) return 'passthrough';
  let url;
  try { url = new URL(request.url); } catch (_) { return 'passthrough'; }
  if (url.origin !== selfOrigin) return 'passthrough';          // roster/cr/supabase APIs → network only
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json')) return 'passthrough'; // never cache the update-nudge check
  const isNav = request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
  return isNav ? 'navigate' : 'asset';
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(CORE.map((u) => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('apstats-pwa-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const strat = cacheStrategyFor(e.request, self.location.origin);
  if (strat === 'passthrough') return; // default browser handling (network)

  if (strat === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(e.request);
        // A cache failure must not discard a usable network response.
        if (net && net.ok && net.status !== 206) {
          try { const c = await caches.open(CACHE); await c.put(e.request, net.clone()); } catch (_) {}
        }
        return net;
      } catch (_) {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        const shell = await caches.match('desk.html');
        return shell || new Response('Offline — open this page once while online to cache it.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // asset: cache-first, populate on miss
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      const net = await fetch(e.request);
      if (net && net.ok && net.status !== 206) {
        try { const c = await caches.open(CACHE); await c.put(e.request, net.clone()); } catch (_) {}
      }
      return net;
    } catch (_) {
      return new Response('', { status: 504 });
    }
  })());
});

// Background sync: when connectivity returns, ask any open client to drain the
// offline queue. The page (not the SW) does the POST — it has the auth token in
// localStorage, which a service worker cannot read.
self.addEventListener('sync', (e) => {
  if (e.tag !== 'apstats-sync-grades') return;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    cs.forEach((c) => c.postMessage({ type: 'drain-offline-queue' }));
  })());
});

self.addEventListener('message', (e) => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
