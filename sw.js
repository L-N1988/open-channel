/* Cache only the static same-origin shell; never API replies or private media. */
const VERSION = 'quiet-archive-v4';
const CACHE = `${VERSION}:${self.registration.scope}`;
const base = self.registration.scope;
const pages = ['', 'record/', 'memories/', 'journals/', 'trips/', 'calendar/', 'todos/', 'photos/', 'videos/', 'map/', 'insights/', 'settings/'];
const assets = ['javascripts/love-record-config.js', 'javascripts/love-icons.js', 'javascripts/love-core.js', 'javascripts/love-store.js', 'javascripts/love-record.js', 'stylesheets/extra.css', 'vendor/supabase.js', 'vendor/leaflet.js', 'vendor/leaflet.css', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'search/search_index.json', 'assets/javascripts/lunr/tinyseg.js', 'assets/javascripts/lunr/min/lunr.stemmer.support.min.js', 'assets/javascripts/lunr/min/lunr.multi.min.js', 'assets/javascripts/lunr/min/lunr.zh.min.js'];
function cacheable(url) {
  return url.origin === new URL(base).origin && url.href.startsWith(base) &&
    !url.search && (pages.includes(url.href.slice(base.length)) || /^(assets\/|javascripts\/|stylesheets\/|vendor\/|search\/)/.test(url.href.slice(base.length)) || url.pathname.endsWith('/manifest.webmanifest'));
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const responses = await Promise.all([...pages, ...assets].map(async path => {
      const url = new URL(path, base);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Cannot cache ${path}`);
      await cache.put(url, response.clone());
      return { url, response };
    }));
    const dependencies = new Set();
    for (const { url, response } of responses) {
      if (!response.headers.get('content-type')?.includes('text/html')) continue;
      const html = await response.text();
      const configMatch = /<script id="__config" type="application\/json">([^<]+)<\/script>/.exec(html);
      if (configMatch) {
        const config = JSON.parse(configMatch[1]);
        if (config.search) dependencies.add(new URL(config.search, url).href);
      }
      for (const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js|woff2?|ttf)(?:\?[^" ]*)?)"/g)) {
        const dependency = new URL(match[1], url);
        if (cacheable(dependency)) dependencies.add(dependency.href);
      }
    }
    await cache.addAll([...dependencies]);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    for (const key of keys) if (key.startsWith('quiet-archive-') && key.endsWith(`:${base}`) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const canonical = new URL(url); canonical.search = ''; canonical.hash = '';
  if (canonical.pathname.endsWith('/index.html')) canonical.pathname = canonical.pathname.slice(0, -10);
  // Query strings on app pages are UI state, not personalized server responses.
  const isPage = pages.includes(canonical.href.slice(base.length));
  if (!cacheable(url) && !(isPage && canonical.origin === new URL(base).origin && canonical.href.startsWith(base))) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(isPage ? canonical : url, response.clone());
      return response;
    } catch {
      const cached = await cache.match(isPage ? canonical : url);
      return cached || new Response('此页面尚未缓存，请联网后打开。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
