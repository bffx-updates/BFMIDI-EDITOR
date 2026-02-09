const CACHE_NAME = "bfmidi-editor-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./main/index.html",
  "./preset-config/index.html",
  "./global-config/index.html",
  "./system/index.html",
  "./savesystem/index.html",
  "./api/logs/index.html",
  "./css/variables.css",
  "./css/base.css",
  "./css/components.css",
  "./css/layout.css",
  "./css/pages/home.css",
  "./css/pages/presets.css",
  "./css/pages/globals.css",
  "./css/pages/system.css",
  "./js/app.js",
  "./js/connection.js",
  "./js/launcher.js",
  "./js/parity-bridge-host.js",
  "./js/parity-bridge-client.js",
  "./js/protocol.js",
  "./js/state.js",
  "./js/components/toast.js",
  "./js/components/modal.js",
  "./js/components/loading-spinner.js",
  "./js/components/color-picker.js",
  "./js/components/custom-select.js",
  "./js/components/toggle-button.js",
  "./js/pages/home.js",
  "./js/pages/presets.js",
  "./js/pages/globals.js",
  "./js/pages/system.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-192-maskable.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/images/logo-bfmidi.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return networkResponse;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
