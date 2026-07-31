import sqlite3
from datetime import datetime
import os

class Database:
    def __init__(self, db_path='notifications.db'):
        # در Railway از مسیر /tmp استفاده کن
        if os.environ.get('RAILWAY_ENVIRONMENT'):
            db_path = '/tmp/notifications.db'
        self.db_path = db_path
        self.init_db()
    
    def init_db(self):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                sender TEXT,
                chat_id TEXT,
                is_read BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_notification(self, message, sender='مدیر', chat_id=None):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''
            INSERT INTO notifications (message, sender, chat_id)
            VALUES (?, ?, ?)
        ''', (message, sender, chat_id))
        
        notif_id = c.lastrowid
        conn.commit()
        conn.close()
        return notif_id
    
    def get_all_notifications(self, limit=50):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''
            SELECT * FROM notifications 
            ORDER BY created_at DESC 
            LIMIT ?
        ''', (limit,))
        
        results = c.fetchall()
        conn.close()
        
        return [{
            'id': r[0],
            'message': r[1],
            'sender': r[2],
            'chat_id': r[3],
            'is_read': bool(r[4]),
            'created_at': r[5]
        } for r in results]
    
    def get_notifications_after(self, last_id):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        
        c.execute('''
            SELECT * FROM notifications 
            WHERE id > ?
            ORDER BY created_at DESC
        ''', (last_id,))
        
        results = c.fetchall()
        conn.close()
        
        return [{
            'id': r[0],
            'message': r[1],
            'sender': r[2],
            'chat_id': r[3],
            'is_read': bool(r[4]),
            'created_at': r[5]
        } for r in results]
    
    def get_last_id(self):
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute('SELECT MAX(id) FROM notifications')
        result = c.fetchone()
        conn.close()
        return result[0] or 0