// ============================================
// PUSH SERVICE WORKER
// ============================================

const CACHE_NAME = 'push-v1';

// ===== INSTALL =====
self.addEventListener('install', (event) => {
    console.log('📦 Push Worker installing...');
    self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
    console.log('✅ Push Worker activated');
    event.waitUntil(self.clients.claim());
});

// ===== PUSH =====
self.addEventListener('push', (event) => {
    console.log('📩 Push event received:', event);
    
    let data = {
        title: '📢 اطلاع‌رسانی',
        message: 'پیام جدید از مدیریت',
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        url: '/'
    };
    
    if (event.data) {
        try {
            const jsonData = event.data.json();
            data = { ...data, ...jsonData };
        } catch (e) {
            data.message = event.data.text();
        }
    }
    
    const options = {
        body: data.message,
        icon: data.icon || '/static/icon-192.png',
        badge: data.badge || '/static/icon-192.png',
        vibrate: [200, 100, 200, 100, 300],
        data: {
            url: data.url || '/',
            notifId: data.id || Date.now()
        },
        actions: [
            {
                action: 'open',
                title: '📖 مشاهده'
            },
            {
                action: 'close',
                title: '❌ بستن'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification clicked:', event);
    
    const notification = event.notification;
    const action = event.action;
    
    notification.close();
    
    if (action === 'open' || !action) {
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true })
                .then((clientList) => {
                    // اگر پنجره باز است، آن را فوکوس کن
                    for (const client of clientList) {
                        if (client.url === '/' && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    // در غیر این صورت پنجره جدید باز کن
                    if (clients.openWindow) {
                        const url = notification.data?.url || '/';
                        return clients.openWindow(url);
                    }
                })
        );
    } else if (action === 'close') {
        // فقط بستن
    }
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
    // فقط درخواست‌های GET را مدیریت کن
    if (event.request.method !== 'GET') {
        return event.respondWith(fetch(event.request));
    }
    
    // استراتژی: Cache First
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request)
                    .then((response) => {
                        // فقط پاسخ‌های موفق را کش کن
                        if (response && response.ok) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return response;
                    })
                    .catch(() => {
                        // آفلاین
                        return new Response('🚫 آفلاین', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});
