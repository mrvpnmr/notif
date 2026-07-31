// ============================================
// Service Worker - Simple Notifier
// ============================================

const CACHE_NAME = 'notifier-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// فایل‌های کش شده
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/script.js',
    '/static/manifest.json',
    '/static/icon-192.png',
    '/static/icon-512.png'
];

// ===== INSTALL =====
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('📦 Caching static assets...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ===== ACTIVATE =====
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                        console.log('🗑️ Removing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
    );
});

// ===== FETCH =====
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    
    // فقط درخواست‌های GET را مدیریت کن
    if (request.method !== 'GET') {
        return event.respondWith(fetch(request));
    }
    
    // درخواست‌های API را از کش خارج کن
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stream')) {
        return event.respondWith(fetch(request));
    }
    
    // استراتژی: Cache First, Network Fallback
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // بروزرسانی پس‌زمینه
                    fetch(request)
                        .then((networkResponse) => {
                            if (networkResponse && networkResponse.ok) {
                                caches.open(DYNAMIC_CACHE)
                                    .then((cache) => {
                                        cache.put(request, networkResponse);
                                    });
                            }
                        })
                        .catch(() => {});
                    
                    return cachedResponse;
                }
                
                // اگر در کش نبود، از شبکه دریافت کن
                return fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.ok) {
                            caches.open(DYNAMIC_CACHE)
                                .then((cache) => {
                                    cache.put(request, networkResponse.clone());
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // آفلاین: صفحه پیش‌فرض
                        if (request.headers.get('Accept').includes('text/html')) {
                            return caches.match('/');
                        }
                        return new Response('🚫 آفلاین', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    const options = {
        body: data.message || 'پیام جدید از مدیریت',
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: '/',
            notifId: data.id
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
        self.registration.showNotification('📢 اطلاع‌رسانی', options)
    );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});