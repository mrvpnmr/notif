// ============================================
// SIMPLE NOTIFIER - با اعلان‌های کروم
// ============================================

// ===== STATE =====
let lastId = 0;
let notifications = [];
let history = [];
let isConnected = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let toastTimeout = null;
let eventSource = null;
let isPushSubscribed = false;
let swRegistration = null;

// ===== DOM REFS =====
const container = document.getElementById('notificationsContainer');
const historyContainer = document.getElementById('historyContainer');
const notifCount = document.getElementById('notifCount');
const historyBadge = document.getElementById('historyBadge');
const newBadge = document.getElementById('newBadge');
const lastTime = document.getElementById('lastTime');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const fabButton = document.getElementById('fabButton');
const clearAllBtn = document.getElementById('clearAllBtn');
const pushBtn = document.getElementById('pushBtn');
const pushStatus = document.getElementById('pushStatus');
const notificationStatus = document.getElementById('notificationStatus');
const pushSection = document.getElementById('pushSection');

// ===== VAPID KEY (برای Push Notification) =====
// این کلید را از https://web-push-codelab.glitch.me/ دریافت کنید
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY';

// ===== NOTIFICATION SOUND =====
function playSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.08;
        
        oscillator.start();
        setTimeout(() => {
            oscillator.frequency.value = 1000;
        }, 100);
        setTimeout(() => {
            oscillator.frequency.value = 1200;
        }, 200);
        setTimeout(() => {
            oscillator.stop();
        }, 400);
    } catch(e) {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYWFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYWFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYWFhYaFhYaFhYaFhYaFhYWFhYW');
            audio.play().catch(() => {});
        } catch(e2) {}
    }
}

// ===== API CALLS =====
async function fetchNotifications() {
    try {
        const response = await fetch('/api/notifications/all');
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('❌ Fetch error:', error);
        return null;
    }
}

// ===== MARK AS READ =====
function markAsRead(notifId) {
    const index = notifications.findIndex(n => n.id === notifId);
    if (index === -1) return;
    
    const notif = notifications[index];
    history.unshift(notif);
    notifications.splice(index, 1);
    
    saveToLocalStorage();
    renderNotifications(notifications);
    renderHistory(history);
    updateCounts();
    
    showToast('✅ پیام به تاریخچه منتقل شد');
}

function markAllAsRead() {
    if (notifications.length === 0) return;
    
    history = [...notifications, ...history];
    notifications = [];
    
    saveToLocalStorage();
    renderNotifications(notifications);
    renderHistory(history);
    updateCounts();
    
    showToast(`✅ ${history.length} پیام به تاریخچه منتقل شد`);
}

// ===== LOCAL STORAGE =====
function saveToLocalStorage() {
    try {
        localStorage.setItem('notifications', JSON.stringify(notifications));
        localStorage.setItem('history', JSON.stringify(history));
    } catch(e) {}
}

function loadFromLocalStorage() {
    try {
        const savedNotifs = localStorage.getItem('notifications');
        const savedHistory = localStorage.getItem('history');
        
        if (savedNotifs) {
            notifications = JSON.parse(savedNotifs);
        }
        if (savedHistory) {
            history = JSON.parse(savedHistory);
        }
    } catch(e) {}
}

// ===== RENDER =====
function renderNotifications(data) {
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>همه پیام‌ها خوانده شد</h3>
                <p>پیام‌های جدید در اینجا نمایش داده می‌شوند</p>
            </div>
        `;
        clearAllBtn.style.display = 'none';
        return;
    }
    
    clearAllBtn.style.display = 'block';
    
    container.innerHTML = data.map(notif => `
        <div class="notification" id="notif-${notif.id}">
            <div class="notif-header">
                <div class="notif-sender">
                    <i class="fas fa-user-circle"></i>
                    ${notif.sender || 'مدیر'}
                    <span class="sender-badge">
                        <i class="fas fa-bolt"></i> جدید
                    </span>
                </div>
                <div class="notif-time">
                    <i class="far fa-clock"></i> ${formatTime(notif.created_at)}
                </div>
            </div>
            <div class="notif-message">
                <span class="msg-label"><i class="far fa-envelope"></i> پیام:</span>
                ${notif.message}
            </div>
            <div class="notif-actions">
                <button class="btn-read" onclick="markAsRead(${notif.id})">
                    <i class="fas fa-check"></i> خوانده شد
                </button>
            </div>
        </div>
    `).join('');
}

function renderHistory(data) {
    if (!data || data.length === 0) {
        historyContainer.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <div class="empty-icon">📜</div>
                <h3>تاریخچه خالی است</h3>
                <p>پیام‌های خوانده شده به اینجا منتقل می‌شوند</p>
            </div>
        `;
        return;
    }
    
    historyContainer.innerHTML = data.map(notif => `
        <div class="history-item">
            <span class="h-message">
                <i class="far fa-envelope" style="color: var(--text-light); margin-left: 6px;"></i>
                ${notif.message}
            </span>
            <span class="h-badge">خوانده شده</span>
            <span class="h-time">
                <i class="far fa-clock"></i> ${new Date(notif.created_at).toLocaleString('fa-IR')}
            </span>
        </div>
    `).join('');
}

// ===== UPDATE COUNTS =====
function updateCounts() {
    notifCount.textContent = notifications.length;
    newBadge.textContent = notifications.length || '۰';
    historyBadge.textContent = history.length;
    
    if (notifications.length > 0) {
        lastTime.textContent = formatTime(notifications[0].created_at);
    } else if (history.length > 0) {
        lastTime.textContent = formatTime(history[0].created_at);
    } else {
        lastTime.textContent = '-';
    }
}

// ===== FORMAT TIME =====
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'لحظاتی پیش';
    if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
    if (diff < 172800) return 'دیروز';
    return date.toLocaleDateString('fa-IR');
}

// ============================================
// PUSH NOTIFICATION
// ============================================

// ===== ثبت Service Worker =====
async function registerServiceWorker() {
    try {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.register('/static/push-worker.js');
            swRegistration = registration;
            console.log('✅ Service Worker registered:', registration);
            
            // بررسی وضعیت اشتراک
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                isPushSubscribed = true;
                updatePushUI(true);
            }
            
            return registration;
        } else {
            console.warn('⚠️ Service Worker not supported');
            return null;
        }
    } catch (error) {
        console.error('❌ Service Worker registration failed:', error);
        return null;
    }
}

// ===== اشتراک در Push =====
async function subscribePush() {
    try {
        if (!swRegistration) {
            await registerServiceWorker();
        }
        
        if (!swRegistration) {
            showToast('❌ Service Worker ثبت نشد');
            return;
        }
        
        // درخواست مجوز
        const permission = await Notification.requestPermission();
        
        if (permission !== 'granted') {
            showToast('❌ برای دریافت اعلان، لطفاً مجوز را فعال کنید');
            return;
        }
        
        // دریافت VAPID Key از سرور
        const response = await fetch('/api/vapid-public-key');
        const data = await response.json();
        const applicationServerKey = data.publicKey || VAPID_PUBLIC_KEY;
        
        if (!applicationServerKey || applicationServerKey === 'YOUR_VAPID_PUBLIC_KEY') {
            showToast('❌ VAPID Key تنظیم نشده است');
            return;
        }
        
        // تبدیل کلید
        const convertedKey = urlBase64ToUint8Array(applicationServerKey);
        
        // اشتراک
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
        });
        
        // ذخیره در سرور
        const saveResponse = await fetch('/api/save-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        
        if (saveResponse.ok) {
            isPushSubscribed = true;
            updatePushUI(true);
            showToast('✅ اعلان‌ها فعال شدند!');
            
            // ارسال تست
            await fetch('/api/send-test-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: '🎉 اعلان فعال شد!',
                    message: 'شما اعلان‌های مرورگر را فعال کردید'
                })
            });
        } else {
            showToast('❌ خطا در ذخیره اشتراک');
        }
        
    } catch (error) {
        console.error('❌ Push subscription error:', error);
        showToast('❌ خطا در فعال‌سازی اعلان');
    }
}

// ===== لغو اشتراک =====
async function unsubscribePush() {
    try {
        if (swRegistration) {
            const subscription = await swRegistration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                
                // حذف از سرور
                await fetch('/api/remove-subscription', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: subscription.endpoint })
                });
            }
        }
        
        isPushSubscribed = false;
        updatePushUI(false);
        showToast('❌ اعلان‌ها غیرفعال شدند');
    } catch (error) {
        console.error('❌ Unsubscribe error:', error);
    }
}

// ===== تبدیل کلید =====
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ===== بروزرسانی UI اعلان =====
function updatePushUI(active) {
    if (active) {
        pushBtn.innerHTML = '<i class="fas fa-bell-slash"></i> غیرفعال‌سازی اعلان';
        pushBtn.onclick = unsubscribePush;
        pushBtn.className = 'btn-push active';
        pushStatus.textContent = 'فعال';
        pushStatus.style.color = '#2ecc71';
        notificationStatus.className = 'fas fa-bell';
        notificationStatus.style.color = '#2ecc71';
        pushSection.style.display = 'none';
    } else {
        pushBtn.innerHTML = '<i class="fas fa-bell"></i> فعال‌سازی اعلان';
        pushBtn.onclick = subscribePush;
        pushBtn.className = 'btn-push';
        pushStatus.textContent = 'غیرفعال';
        pushStatus.style.color = '#e74c3c';
        notificationStatus.className = 'fas fa-bell-slash';
        notificationStatus.style.color = '#e74c3c';
        pushSection.style.display = 'block';
    }
}

// ===== نمایش اعلان سیستمی =====
function showSystemNotification(title, message) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    
    try {
        const options = {
            body: message,
            icon: '/static/icon-192.png',
            badge: '/static/icon-192.png',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            data: {
                url: '/'
            }
        };
        
        const notification = new Notification(title, options);
        
        notification.onclick = function() {
            window.focus();
            this.close();
        };
        
        setTimeout(() => {
            notification.close();
        }, 10000);
    } catch(e) {
        console.log('Notification error:', e);
    }
}

// ===== LOAD NOTIFICATIONS =====
async function loadNotifications() {
    const btn = document.querySelector('.btn-icon');
    btn.classList.add('spinning');
    
    const data = await fetchNotifications();
    
    if (data !== null) {
        const newNotifs = data.filter(n => {
            return !history.some(h => h.id === n.id);
        });
        
        if (newNotifs.length > 0) {
            notifications = newNotifs;
            const oldHistory = history.filter(h => !newNotifs.some(n => n.id === h.id));
            history = oldHistory;
        }
        
        renderNotifications(notifications);
        renderHistory(history);
        updateCounts();
        saveToLocalStorage();
        updateStatus(true);
    } else {
        updateStatus(false);
    }
    
    setTimeout(() => {
        btn.classList.remove('spinning');
    }, 500);
}

// ===== UPDATE STATUS =====
function updateStatus(connected) {
    isConnected = connected;
    
    if (connected) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'متصل';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'قطع';
    }
}

// ===== TOAST =====
function showToast(message) {
    toastMessage.textContent = message || 'پیام جدید از مدیریت';
    toast.classList.add('show');
    playSound();
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function closeToast() {
    toast.classList.remove('show');
    clearTimeout(toastTimeout);
}

// ===== SSE STREAM =====
function connectStream() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
    }
    
    try {
        eventSource = new EventSource('/stream');
        
        eventSource.onopen = function() {
            console.log('✅ SSE Connected');
            updateStatus(true);
            reconnectAttempts = 0;
        };
        
        eventSource.onmessage = function(event) {
            try {
                const notif = JSON.parse(event.data);
                console.log('📩 New notification:', notif);
                
                if (history.some(h => h.id === notif.id)) return;
                if (notifications.some(n => n.id === notif.id)) return;
                
                notifications.unshift(notif);
                
                renderNotifications(notifications);
                renderHistory(history);
                updateCounts();
                saveToLocalStorage();
                
                // نمایش در صفحه
                showToast(`پیام جدید از ${notif.sender || 'مدیر'}`);
                
                // نمایش اعلان سیستمی
                showSystemNotification(
                    `📢 پیام جدید از ${notif.sender || 'مدیر'}`,
                    notif.message
                );
                
            } catch (error) {
                console.error('❌ SSE message error:', error);
            }
        };
        
        eventSource.onerror = function(event) {
            console.log('⚠️ SSE error, reconnecting...');
            eventSource.close();
            eventSource = null;
            updateStatus(false);
            
            reconnectAttempts++;
            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(connectStream, 3000 * reconnectAttempts);
            } else {
                console.log('❌ Max reconnect attempts reached');
                statusText.textContent = 'قطع (تلاش مجدد)';
            }
        };
        
    } catch (error) {
        console.error('❌ SSE connection error:', error);
        setTimeout(connectStream, 5000);
    }
}

// ===== TOGGLE HISTORY =====
function toggleHistory() {
    const container = document.getElementById('historyContainer');
    const icon = document.getElementById('historyToggleIcon');
    const text = document.getElementById('historyToggleText');
    
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        icon.className = 'fas fa-chevron-up';
        text.textContent = 'مخفی';
    } else {
        container.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
        text.textContent = 'نمایش';
    }
}

// ===== SCROLL TO TOP =====
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== FAB BUTTON =====
window.addEventListener('scroll', function() {
    if (window.scrollY > 300) {
        fabButton.classList.add('show');
    } else {
        fabButton.classList.remove('show');
    }
});

// ===== PWA INSTALL =====
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('installBtn').style.display = 'flex';
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('✅ App installed');
            } else {
                console.log('❌ App not installed');
            }
            deferredPrompt = null;
            document.getElementById('installBtn').style.display = 'none';
        });
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // بارگذاری از localStorage
    loadFromLocalStorage();
    
    // ثبت Service Worker
    await registerServiceWorker();
    
    // بارگذاری اولیه
    await loadNotifications();
    
    // اتصال به استریم
    setTimeout(connectStream, 1000);
    
    // آپدیت خودکار
    setInterval(() => {
        if (!eventSource || !isConnected) {
            loadNotifications();
        }
    }, 30000);
    
    // بازیابی اتصال
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadNotifications();
            if (!eventSource) {
                connectStream();
            }
        }
    });
});

// ===== EXPOSE TO GLOBAL =====
window.loadNotifications = loadNotifications;
window.markAsRead = markAsRead;
window.markAllAsRead = markAllAsRead;
window.toggleHistory = toggleHistory;
window.scrollToTop = scrollToTop;
window.installApp = installApp;
window.closeToast = closeToast;
window.subscribePush = subscribePush;
window.unsubscribePush = unsubscribePush;

console.log('🚀 Simple Notifier loaded with Push Notifications!');
