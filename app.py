from flask import Flask, request, jsonify, render_template, Response
import os
import json
import time
from datetime import datetime
from database import Database
from telegram_bot import TelegramBot

app = Flask(__name__)

# تنظیمات از متغیرهای محیطی Railway
BOT_TOKEN = os.environ.get('BOT_TOKEN')
ADMIN_CHAT_ID = os.environ.get('ADMIN_CHAT_ID')
PORT = int(os.environ.get('PORT', 5000))
BASE_URL = os.environ.get('BASE_URL', f'https://{os.environ.get("RAILWAY_STATIC_URL", "localhost")}')

# راه‌اندازی
db = Database()
bot = TelegramBot(BOT_TOKEN)

print(f"🚀 Starting Simple Notifier on {BASE_URL}")
print(f"🤖 Bot Token: {'✅ Set' if BOT_TOKEN else '❌ Not Set'}")
print(f"👤 Admin Chat ID: {'✅ Set' if ADMIN_CHAT_ID else '❌ Not Set'}")

# ==================== صفحه اصلی ====================

@app.route('/')
def dashboard():
    notifications = db.get_all_notifications(limit=50)
    return render_template('dashboard.html', notifications=notifications)

# ==================== API ها ====================

@app.route('/api/notifications')
def get_notifications():
    last_id = request.args.get('last_id', 0, type=int)
    notifications = db.get_notifications_after(last_id)
    return jsonify(notifications)

@app.route('/api/notifications/all')
def get_all_notifications():
    notifications = db.get_all_notifications(limit=100)
    return jsonify(notifications)

# ==================== وب‌هوک تلگرام ====================

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
    
    print(f"📩 دریافت پیام از {username} (Chat ID: {chat_id})")
    print(f"📝 متن: {text}")
    
    # فقط مدیر اجازه دارد
    if chat_id != ADMIN_CHAT_ID:
        bot.send_message(chat_id, "⛔ شما دسترسی به این ربات ندارید!")
        return jsonify({'status': 'ok'}), 200
    
    if text:
        # ذخیره در دیتابیس
        notification_id = db.add_notification(
            message=text,
            sender=username or first_name or 'مدیر',
            chat_id=chat_id
        )
        
        # تأیید به مدیر
        bot.send_message(chat_id, f"✅ پیام شما ارسال شد!\n\n📝 {text}")
        
        print(f"✅ پیام با ID {notification_id} ذخیره شد")
    
    return jsonify({'status': 'ok'}), 200

# ==================== SSE برای نوتیفیکیشن ====================

@app.route('/stream')
def stream():
    def generate():
        last_id = db.get_last_id()
        while True:
            new_notifs = db.get_notifications_after(last_id)
            for notif in new_notifs:
                yield f"data: {json.dumps(notif)}\n\n"
                last_id = notif['id']
            time.sleep(1)
    
    return Response(generate(), mimetype='text/event-stream')

# ==================== راه‌اندازی ====================

@app.route('/health')
def health():
    """بررسی سلامت"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'bot_configured': bool(BOT_TOKEN and ADMIN_CHAT_ID)
    })

@app.route('/info')
def info():
    """اطلاعات سیستم"""
    return jsonify({
        'service': 'Simple Notifier',
        'version': '1.0',
        'base_url': BASE_URL,
        'webhook_url': f'{BASE_URL}/telegram/webhook',
        'bot_configured': bool(BOT_TOKEN and ADMIN_CHAT_ID)
    })

@app.route('/set_webhook')
def set_webhook():
    """تنظیم وب‌هوک"""
    if not BOT_TOKEN:
        return jsonify({'error': 'BOT_TOKEN not configured'}), 400
    
    webhook_url = f"{BASE_URL}/telegram/webhook"
    result = bot.set_webhook(webhook_url)
    
    return jsonify({
        'status': 'success' if result.get('ok') else 'error',
        'webhook_url': webhook_url,
        'result': result
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)