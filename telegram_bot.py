import requests
import json

class TelegramBot:
    def __init__(self, bot_token):
        self.bot_token = bot_token
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
    
    def send_message(self, chat_id, text, parse_mode='HTML'):
        if not self.bot_token or not chat_id:
            return None
        
        url = f"{self.base_url}/sendMessage"
        payload = {
            'chat_id': chat_id,
            'text': text,
            'parse_mode': parse_mode
        }
        
        try:
            response = requests.post(url, data=payload, timeout=5)
            return response.json()
        except Exception as e:
            print(f"Telegram error: {e}")
            return None
    
    def set_webhook(self, webhook_url):
        url = f"{self.base_url}/setWebhook"
        payload = {'url': webhook_url}
        
        try:
            response = requests.post(url, data=payload, timeout=5)
            return response.json()
        except Exception as e:
            print(f"Webhook error: {e}")
            return {'ok': False, 'error': str(e)}