// FlowLife Service Worker for PWA & iOS Notifications
const CACHE_NAME = 'flowlife-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listener for background messages to trigger notifications
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const notificationOptions = {
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      vibrate: [200, 100, 200],
      ...options
    };
    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
    );
  }
});

// Listener for Web Push
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'FlowLife', body: event.data.text() };
    }
  }

  const title = data.title || 'FlowLife';
  const options = {
    body: data.body || data.text || 'Lembrete de tarefa!',
    icon: data.icon || '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    vibrate: [200, 100, 200],
    data: data.url || '/',
    tag: data.tag || 'flowlife-general',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// When user clicks the notification on iOS / Android / Desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && typeof event.notification.data === 'string') 
    ? event.notification.data 
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
