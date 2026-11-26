const home = new URL("./", self.registration.scope);
const index = new URL("index.html", home);
const prefix = "weightline-shell:" + home.href + ":";
const cacheName = prefix + "1";
const assets = new Set([
  "style.css", "app.mjs", "model.mjs", "pwa.mjs", "manifest.webmanifest", "mark.svg",
  "icons/weightline-192.png", "icons/weightline-512.png", "icons/apple-touch-icon.png",
].map((path) => new URL(path, home).href));

function refreshShell(cache, signal) {
  // addAll replaces the cached app together so offline launches use a complete copy.
  return cache.addAll([home.href, ...assets].map((url) => new Request(url, { cache: "no-cache", signal })));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => refreshShell(cache)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function loadHome(request) {
  const cache = await caches.open(cacheName);
  if (self.navigator.onLine) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      await refreshShell(cache, controller.signal);
    } catch {
      // The last complete copy is available if a request fails or times out.
    } finally {
      clearTimeout(timeout);
    }
  }
  return (await cache.match(home.href)) ?? fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  url.search = "";
  if (request.mode === "navigate" && (url.href === home.href || url.href === index.href)) {
    event.respondWith(loadHome(request));
  } else if (assets.has(url.href)) {
    event.respondWith(caches.open(cacheName).then(async (cache) => {
      return (await cache.match(url.href)) ?? fetch(request);
    }));
  }
});
