const CACHE = 'dads-docs-v1';
const SHARE_CACHE = 'dads-docs-share';
const APP_FILES = ['/', '/index.html', '/app.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => ![CACHE, SHARE_CACHE].includes(key)).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(handleShare(event.request));
    return;
  }

  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});

async function handleShare(request) {
  try {
    const data = await request.formData();
    const files = data.getAll('files').filter(value => value instanceof File);
    if (!files.length) return Response.redirect('/?share-error=1', 303);

    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(files.map((file, index) =>
      cache.put('/shared/' + index, new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Name': encodeURIComponent(file.name || 'Shared file')
        }
      }))
    ));
    return Response.redirect('/?shared=' + files.length, 303);
  } catch (error) {
    return Response.redirect('/?share-error=1', 303);
  }
}
