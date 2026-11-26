const CACHE = "tandagfix-v6";
const SHELL = ["./", "index.html", "css/styles.css", "js/app.js", "js/auth-gps.js", "js/features.js", "js/chat.js", "js/ui.js", "js/supabase-config.js", "manifest.json", "assets/images/tandagfix-logo.jpeg", "assets/images/gcash.svg", "assets/images/maya.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return; // never cache Supabase/API calls
  e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); return res; }).catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
});
