// ============================================
// SIMPLE NOTIFIER - Main JavaScript
// ============================================

// ===== STATE =====
let lastId = 0;
let notifications = [];
let isConnected = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let toastTimeout = null;
let eventSource = null;

// ===== DOM REFS =====
const container = document.getElementById('notificationsContainer');
const historyContainer = document.getElementById('historyContainer');
const notifCount = document.getElementById('notifCount');
const lastTime = document.getElementById('lastTime');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const newBadge = document.getElementById('newBadge');
const fabButton = document.getElementById('fabButton');

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
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        setTimeout(() => {
            oscillator.frequency.value = 1000;
        }, 100);
        setTimeout(() => {
            oscillator.stop();
        }, 300);
    } catch(e) {
        // Fallback: استفاده از Audio ساده
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

async function fetchNewNotifications() {
    try {
        const response = await fetch(`/api/notifications?last_id=${lastId}`);
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('❌ Fetch new error:', error);
        return null;
    }
}

// ===== RENDER =====
function renderNotifications(data) {
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>هنوز پیامی ارسال نشده</h3>
                <p>مدیر از طریق ربات تلگرام پیام ارسال می‌کند</p>
                <p style="margin-top: 10px; font-size: 0.85em; color: var(--text-light);">
                    ⏳ منتظر پیام جدید باشید...
                </p>
            </div>
        `;
        return;
    }
    
    // فقط ۵ پیام آخر را در بخش اصلی نشان بده
    const recent = data.slice(0, 5);
    
    container.innerHTML = recent.map(notif => `
        <div class="notification ${notif.id > lastId ? 'new' : ''}" id="notif-${notif.id}">
            <div class="notif-header">
                <div class="notif-sender">
                    👤 ${notif.sender || 'مدیر'}
                    <span class="sender-badge">${notif.chat_id ? '📱' : '💻'}</span>
                </div>
                <div class="notif-time">${formatTime(notif.created_at)}</div>
            </div>
            <div class="notif-message">
                <span class="msg-label">📝 پیام:</span>
                ${notif.message}
            </div>
            <div class="notif-footer">
                <span class="notif-id">#${notif.id}</span>
                <span class="notif-status ${notif.id > lastId ? 'new' : 'read'}">
                    ${notif.id > lastId ? '🆕 جدید' : '✓ خوانده شده'}
                </span>
            </div>
        </div>
    `).join('');
    
    // آپدیت lastId
    if (data.length > 0) {
        lastId = data[0].id;
    }
    
    // آپدیت تعداد
    notifCount.textContent = data.length;
    newBadge.textContent = data.filter(n => n.id > lastId).length || '۰';
    
    // آپدیت زمان آخرین
    if (data.length > 0) {
        lastTime.textContent = formatTime(data[0].created_at);
    }
}

function renderHistory(data) {
    if (!data || data.length === 0) {
        historyContainer.innerHTML = `
            <div style="text-align:center; padding:20px; color: var(--text-light);">
                📭 تاریخچه‌ای وجود ندارد
            </div>
        `;
        return;
    }
    
    historyContainer.innerHTML = data.map(notif => `
        <div class="history-item">
            <span class="h-message">📝 ${notif.message}</span>
            <span class="h-time">${new Date(notif.created_at).toLocaleString('fa-IR')}</span>
        </div>
    `).join('');
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

// ===== LOAD NOTIFICATIONS =====
async function loadNotifications() {
    const btn = document.querySelector('.btn-refresh');
    btn.classList.add('spinning');
    
    const data = await fetchNotifications();
    
    if (data !== null) {
        notifications = data;
        renderNotifications(data);
        renderHistory(data);
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
                
                // اضافه کردن به لیست
                notifications.unshift(notif);
                
                // رندر مجدد
                renderNotifications(notifications);
                renderHistory(notifications);
                
                // آپدیت تعداد
                notifCount.textContent = notifications.length;
                
                // نمایش توست
                showToast(`پیام جدید از ${notif.sender || 'مدیر'}`);
                
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
    const btn = document.querySelector('.btn-toggle');
    
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        btn.textContent = '▲ مخفی';
    } else {
        container.style.display = 'none';
        btn.textContent = '▼ نمایش';
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
    document.getElementById('installBtn').style.display = 'block';
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
document.addEventListener('DOMContentLoaded', () => {
    // بارگذاری اولیه
    loadNotifications();
    
    // اتصال به استریم بعد از ۱ ثانیه
    setTimeout(connectStream, 1000);
    
    // آپدیت خودکار هر ۳۰ ثانیه (پشتیبان)
    setInterval(() => {
        if (!eventSource || !isConnected) {
            loadNotifications();
        }
    }, 30000);
    
    // بازیابی اتصال در صورت بازگشت تب
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
window.toggleHistory = toggleHistory;
window.scrollToTop = scrollToTop;
window.installApp = installApp;

console.log('🚀 Simple Notifier loaded!');