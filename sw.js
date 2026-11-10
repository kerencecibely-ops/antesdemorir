// Imperdibles (IADM) · service worker
const VERSION = 'iadm-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './maskable-192.png', './maskable-512.png',
  './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'iadm-state').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la caché (funciona sin internet); en segundo plano se actualiza.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, {ignoreSearch: true}).then(hit => {
    const net = fetch(req).then(res => {
      if (res && res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => hit || caches.match('./index.html'));
    return hit || net;
  }));
});

// ---- avisos en segundo plano (Chrome Android con la app instalada) ----
const today = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

async function readState() {
  const c = await caches.open('iadm-state');
  const r = await c.match('./__state');
  return r ? r.json() : null;
}
async function writeState(s) {
  const c = await caches.open('iadm-state');
  await c.put('./__state', new Response(JSON.stringify(s), {headers: {'Content-Type': 'application/json'}}));
}

async function nudge() {
  const s = await readState();
  if (!s) return;
  const now = new Date(), t = today(now), mins = now.getHours() * 60 + now.getMinutes();
  s.sent = s.sent || {};
  const show = (key, title, body) => {
    s.sent[key] = t;
    return self.registration.showNotification(title, {body, icon: 'icon-192.png', badge: 'maskable-192.png', tag: key, data: {url: './'}});
  };
  const [h, m] = (s.hour || '20:00').split(':').map(Number);
  const [mh, mm] = (s.movieHour || '20:00').split(':').map(Number);
  // 1) idioma del día
  if (s.langDone !== t && mins >= h * 60 + m && s.sent.lang !== t)
    await show('lang', `${s.lang} 🔥`, `Tus 15 minutos de hoy. Racha actual: ${s.streak || 0} días.`);
  // 2) noche de película
  else if (now.getDay() === +s.movieDay && mins >= mh * 60 + mm && s.sent.movie !== t)
    await show('movie', 'Noche de película 🎬', 'Abre la ruleta: gira y elige.');
  // 3) algo del estante olvidado (máximo uno cada 3 días)
  else if (s.stale && (!s.sent.stale || (now - new Date(s.sent.stale)) / 864e5 >= 3))
    await show('stale', `¿Sigues con ${s.stale.t}?`, `Lleva ${s.stale.d} días sin tocarse. Retómalo o cámbialo, sin culpa.`);
  await writeState(s);
}

self.addEventListener('periodicsync', e => { if (e.tag === 'iadm-nudge') e.waitUntil(nudge()); });
self.addEventListener('message', e => { if (e.data === 'nudge') e.waitUntil ? e.waitUntil(nudge()) : nudge(); });

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
