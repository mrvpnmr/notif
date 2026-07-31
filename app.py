from flask import Flask, request, jsonify, render_template, Response
import os
import json
import time
import sqlite3
from datetime import datetime
import requests
import base64

app = Flask(__name__)

# ==================== تنظیمات ====================
BOT_TOKEN = os.environ.get('BOT_TOKEN')
ADMIN_CHAT_ID = os.environ.get('ADMIN_CHAT_ID')
PORT = int(os.environ.get('PORT', 5000))
BASE_URL = os.environ.get('RAILWAY_STATIC_URL', 'http://localhost')

# ==================== VAPID Keys ====================
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', 'YOUR_PUBLIC_KEY')
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', 'YOUR_PRIVATE_KEY')
VAPID_SUBJECT = os.environ.get('VAPID_SUBJECT', 'mailto:admin@example.com')

# ==================== مدیریت اشتراک‌ها ====================
class SubscriptionManager:
    def __init__(self):
        self._subscriptions = []
    
    def add(self, subscription):
        if not subscription or not subscription.get('endpoint'):
            return False
        if not any(s.get('endpoint') == subscription.get('endpoint') for s in self._subscriptions):
            self._subscriptions.append(subscription)
            print(f"✅ Push subscription added")
            return True
        return False
    
    def remove(self, endpoint):
        if not endpoint:
            return False
        before = len(self._subscriptions)
        self._subscriptions = [s for s in self._subscriptions if s.get('endpoint') != endpoint]
        return before != len(self._subscriptions)
    
    def get_all(self):
        return self._subscriptions.copy()
    
    def count(self):
        return len(self._subscriptions)

subscription_manager = SubscriptionManager()

# ==================== دیتابیس ====================
def get_db():
    db_path = '/tmp/notifications.db'
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT NOT NULL,
            sender TEXT,
            chat_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def add_notification(message, sender='مدیر', chat_id=None):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        INSERT INTO notifications (message, sender, chat_id)
        VALUES (?, ?, ?)
    ''', (message, sender, chat_id))
    notif_id = c.lastrowid
    conn.commit()
    conn.close()
    return notif_id

def get_all_notifications(limit=50):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM notifications 
        ORDER BY created_at DESC 
        LIMIT ?
    ''', (limit,))
    results = c.fetchall()
    conn.close()
    return [dict(r) for r in results]

def get_notifications_after(last_id):
    conn = get_db()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM notifications 
        WHERE id > ?
        ORDER BY created_at DESC
    ''', (last_id,))
    results = c.fetchall()
    conn.close()
    return [dict(r) for r in results]

def get_last_id():
    conn = get_db()
    c = conn.cursor()
    c.execute('SELECT MAX(id) FROM notifications')
    result = c.fetchone()
    conn.close()
    return result[0] if result and result[0] else 0

# ==================== تلگرام ====================
def send_telegram_message(chat_id, text):
    if not BOT_TOKEN or not chat_id:
        return None
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}
    try:
        response = requests.post(url, data=payload, timeout=5)
        return response.json()
    except Exception as e:
        print(f"❌ Telegram error: {e}")
        return None

def set_webhook(webhook_url):
    if not BOT_TOKEN:
        return {'ok': False, 'error': 'BOT_TOKEN not set'}
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook"
    payload = {'url': webhook_url}
    try:
        response = requests.post(url, data=payload, timeout=5)
        return response.json()
    except Exception as e:
        return {'ok': False, 'error': str(e)}

# ==================== مسیرها ====================

@app.route('/')
def dashboard():
    notifications = get_all_notifications(limit=50)
    return render_template('dashboard.html', notifications=notifications)

@app.route('/api/notifications')
def get_notifications_api():
    last_id = request.args.get('last_id', 0, type=int)
    notifications = get_notifications_after(last_id)
    return jsonify(notifications)

@app.route('/api/notifications/all')
def get_all_notifications_api():
    notifications = get_all_notifications(limit=100)
    return jsonify(notifications)

@app.route('/telegram/webhook', methods=['POST'])
def telegram_webhook():
    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'status': 'ok'}), 200
    
    message = data['message']
    chat_id = str(message['chat']['id'])
    text = message.get('text', '').strip()
    username = message['from'].get('username', 'مدیر')
    first_name = message['from'].get('first_name', '')
    
    if chat_id != ADMIN_CHAT_ID:
        send_telegram_message(chat_id, "⛔ شما دسترسی ندارید!")
        return jsonify({'status': 'ok'}), 200
    
    if text:
        notif_id = add_notification(
            message=text,
            sender=username or first_name or 'مدیر',
            chat_id=chat_id
        )
        send_telegram_message(chat_id, f"✅ پیام ارسال شد!\n\n📝 {text}")
        
        # ارسال Push Notification
        send_push_to_all(
            title=f"📢 پیام جدید از {username or first_name or 'مدیر'}",
            message=text,
            notif_id=notif_id
        )
    
    return jsonify({'status': 'ok'}), 200

@app.route('/stream')
def stream():
    def generate():
        last_id = get_last_id()
        while True:
            try:
                new_notifs = get_notifications_after(last_id)
                for notif in new_notifs:
                    yield f"data: {json.dumps(notif)}\n\n"
                    last_id = notif['id']
                time.sleep(1)
            except Exception as e:
                print(f"Stream error: {e}")
                time.sleep(5)
    return Response(generate(), mimetype='text/event-stream')

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'bot_configured': bool(BOT_TOKEN and ADMIN_CHAT_ID),
        'vapid_configured': VAPID_PUBLIC_KEY != 'YOUR_PUBLIC_KEY'
    })

@app.route('/set_webhook')
def set_webhook_route():
    webhook_url = f"{BASE_URL}/telegram/webhook"
    result = set_webhook(webhook_url)
    return jsonify({'webhook_url': webhook_url, 'result': result})

@app.route('/info')
def info():
    return jsonify({
        'service': 'Simple Notifier',
        'version': '1.0',
        'bot_configured': bool(BOT_TOKEN and ADMIN_CHAT_ID),
        'vapid_configured': VAPID_PUBLIC_KEY != 'YOUR_PUBLIC_KEY'
    })

# ==================== مسیرهای Push ====================

@app.route('/api/vapid-public-key', methods=['GET'])
def get_vapid_public_key():
    return jsonify({'publicKey': VAPID_PUBLIC_KEY})

@app.route('/api/save-subscription', methods=['POST'])
def save_subscription():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data'}), 400
    
    if subscription_manager.add(data):
        return jsonify({'status': 'success'}), 200
    return jsonify({'status': 'exists'}), 200

@app.route('/api/remove-subscription', methods=['POST'])
def remove_subscription():
    data = request.get_json()
    endpoint = data.get('endpoint')
    if subscription_manager.remove(endpoint):
        return jsonify({'status': 'success'}), 200
    return jsonify({'status': 'not_found'}), 404

@app.route('/api/send-test-push', methods=['POST'])
def send_test_push():
    data = request.get_json()
    title = data.get('title', '📢 تست اعلان')
    message = data.get('message', 'این یک پیام تست است')
    count = send_push_to_all(title, message)
    return jsonify({'status': 'sent', 'count': count}), 200

# ==================== تابع ارسال Push ====================

def send_push_to_all(title, message, notif_id=None):
    count = 0
    subscriptions = subscription_manager.get_all()
    
    if not subscriptions:
        print("⚠️ No push subscriptions found")
        return 0
    
    try:
        import webpush
        for subscription in subscriptions:
            try:
                webpush.send_notification(
                    endpoint=subscription.get('endpoint'),
                    keys={
                        'auth': subscription.get('keys', {}).get('auth'),
                        'p256dh': subscription.get('keys', {}).get('p256dh')
                    },
                    payload=json.dumps({
                        'title': title,
                        'message': message,
                        'id': notif_id,
                        'icon': '/static/icon-192.png',
                        'url': '/'
                    }),
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={'sub': VAPID_SUBJECT}
                )
                count += 1
            except Exception as e:
                print(f"❌ Push error: {e}")
                if 'expired' in str(e).lower() or 'invalid' in str(e).lower():
                    subscription_manager.remove(subscription.get('endpoint'))
    except ImportError:
        print("⚠️ webpush library not installed")
        count = len(subscriptions)
    
    return count

# ==================== اجرا ====================

if __name__ == '__main__':
    print(f"🚀 Starting server on port {PORT}")
    print(f"🤖 Bot: {'✅' if BOT_TOKEN else '❌'}")
    print(f"👤 Admin: {'✅' if ADMIN_CHAT_ID else '❌'}")
    print(f"🔑 VAPID: {'✅' if VAPID_PUBLIC_KEY != 'YOUR_PUBLIC_KEY' else '❌'}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
