// services/telegram-bot.js
// Telegram Bot integration for ORBIT-X (AGRILINKSAT)
// Uses the standard Telegram Bot HTTP API. Token is read from TELEGRAM_BOT_TOKEN env var.

const https = require('https');
const { EventEmitter } = require('events');

const TELEGRAM_API = 'https://api.telegram.org';

class TelegramBot extends EventEmitter {
  constructor(opts = {}) {
    super();
    // Load .env file if present (simple parser, no dependency)
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
          if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        }
      }
    } catch (e) { /* ignore */ }
    this.token = opts.token || process.env.TELEGRAM_BOT_TOKEN;
    this.polling = false;
    this.offset = 0;
    this.allowedChats = (opts.allowedChats || (process.env.TELEGRAM_ALLOWED_CHATS || '').split(',').filter(Boolean)).map(String);
    this.lastUpdate = 0;
    if (!this.token) {
      console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN not set; bot disabled.');
    }
  }

  _request(method, body) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const url = `${TELEGRAM_API}/bot${this.token}/${method}`;
      const req = https.request(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
      }, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(buf);
            if (!json.ok) reject(new Error(json.description || 'Telegram API error'));
            else resolve(json.result);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
      if (body) req.write(data);
      req.end();
    });
  }

  async sendMessage(chatId, text, extra = {}) {
    // Telegram 4096 char limit per message
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) chunks.push(text.slice(i, i + 4000));
    const results = [];
    for (const c of chunks) {
      results.push(await this._request('sendMessage', { chat_id: chatId, text: c, parse_mode: 'Markdown', ...extra }));
    }
    return results;
  }

  async getMe() { return this._request('getMe'); }

  async startPolling(handler) {
    if (!this.token || this.polling) return;
    this.polling = true;
    const loop = async () => {
      while (this.polling) {
        try {
          const updates = await this._request('getUpdates', { offset: this.offset, timeout: 25 });
          for (const u of updates) {
            this.offset = u.update_id + 1;
            if (u.message) await this._handleMessage(u.message, handler);
          }
        } catch (e) {
          console.error('[TelegramBot] polling error:', e.message);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    };
    loop();
  }

  stopPolling() { this.polling = false; }

  _isAuthorized(chatId) {
    if (this.allowedChats.length === 0) return true; // open mode (not recommended)
    return this.allowedChats.includes(String(chatId));
  }

  async _handleMessage(msg, handler) {
    const chatId = msg.chat.id;
    // Allow /start for first-contact registration even for unknown users
    if (!this._isAuthorized(chatId) && !/^\/start/i.test(text)) {
      await this.sendMessage(chatId, '⛔ Unauthorized. Your chat ID is not allowed.');
      return;
    }
    try {
      const reply = await handler({ chatId, text, msg });
      if (reply) await this.sendMessage(chatId, reply);
    } catch (e) {
      console.error('[TelegramBot] handler error:', e);
      await this.sendMessage(chatId, '⚠️ Error processing your request: ' + e.message);
    }
  }

  async sendNotification(chatIds, text) {
    const targets = Array.isArray(chatIds) ? chatIds : [chatIds];
    const out = [];
    for (const c of targets) {
      try { out.push(await this.sendMessage(c, text)); }
      catch (e) { console.error('[TelegramBot] notify error:', e.message); }
    }
    return out;
  }
}

module.exports = TelegramBot;