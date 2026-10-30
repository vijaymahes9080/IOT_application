// services/telegram-bot.js
// Telegram Bot integration for ORBIT-X / AGRI LINK AI
// Production-grade resilient polling engine with structured diagnostic logging
// and strict default-deny authorization policy.

const https = require('https');
const { EventEmitter } = require('events');

const TELEGRAM_API = 'https://api.telegram.org';

class TelegramBot extends EventEmitter {
  constructor(opts = {}) {
    super();

    // 1. Safe .env loading (supports quotes & strips accidental internal spaces in token)
    try {
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
          if (m && !process.env[m[1]]) {
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[m[1]] = val;
          }
        }
      }
    } catch (e) {
      console.warn('[TelegramBot] Notice: .env file read skipped:', e.message);
    }

    const rawToken = opts.token || process.env.TELEGRAM_BOT_TOKEN || '';
    // Sanitize token: remove any accidental internal spaces or carriage returns
    this.token = rawToken.replace(/\s+/g, '').trim();

    this.polling = false;
    this.offset = 0;
    this.botInfo = null;

    // Strict default-deny: Parse allowed chat IDs. Empty array means NO users are authorized by default.
    const rawAllowed = opts.allowedChats !== undefined 
      ? opts.allowedChats 
      : (process.env.TELEGRAM_ALLOWED_CHATS || '').split(',').map(s => s.trim()).filter(Boolean);
    this.allowedChats = rawAllowed.map(String);

    if (!this.token) {
      console.warn('[TelegramBot] [INIT] TELEGRAM_BOT_TOKEN not configured; bot disabled.');
    } else {
      console.log(`[TelegramBot] [INIT] Initialized. Allowed chat IDs configured: ${this.allowedChats.length} (Strict Default-Deny Active).`);
    }
  }

  /**
   * Internal sanitized HTTPS request wrapper. Never logs secrets or tokens.
   */
  _request(method, body = null) {
    return new Promise((resolve, reject) => {
      if (!this.token) {
        return reject(new Error('Bot token not configured'));
      }

      const data = body ? JSON.stringify(body) : '';
      const url = `${TELEGRAM_API}/bot${this.token}/${method}`;

      const req = https.request(url, {
        method: body ? 'POST' : 'GET',
        headers: body ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        } : {}
      }, (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(buf);
            if (!json.ok) {
              const errMsg = `[Telegram API Error] Method: ${method} | Status: ${res.statusCode} | Desc: ${json.description || 'Unknown error'}`;
              reject(new Error(errMsg));
            } else {
              resolve(json.result);
            }
          } catch (e) {
            reject(new Error(`[Telegram JSON Parse Error] Status: ${res.statusCode} | Raw: ${buf.slice(0, 150)}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`[Telegram Network Error] Method: ${method} | ${err.message}`));
      });

      req.setTimeout(35000, () => {
        req.destroy(new Error(`[Telegram Timeout] Method: ${method} exceeded 35s`));
      });

      if (body) req.write(data);
      req.end();
    });
  }

  async getMe() {
    const res = await this._request('getMe');
    this.botInfo = res;
    return res;
  }

  async getWebhookInfo() {
    return this._request('getWebhookInfo');
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this._request('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  async sendMessage(chatId, text, extra = {}) {
    if (!chatId) {
      console.error('[TelegramBot] [SEND_ERROR] Cannot send message: Missing chatId');
      return null;
    }

    const numericChatId = String(chatId);
    console.log(`[TelegramBot] [SEND_START] Delivering message to Chat ID: ${numericChatId} (Length: ${text.length} chars)`);

    // Telegram 4096 char limit per message chunk
    const chunks = [];
    for (let i = 0; i < text.length; i += 4000) {
      chunks.push(text.slice(i, i + 4000));
    }

    const results = [];
    for (const c of chunks) {
      try {
        const payload = {
          chat_id: numericChatId,
          text: c,
          ...extra
        };
        const res = await this._request('sendMessage', payload);
        console.log(`[TelegramBot] [SEND_SUCCESS] Message delivered to Chat ID: ${numericChatId} | Telegram Message ID: ${res.message_id}`);
        results.push(res);
      } catch (err) {
        console.error(`[TelegramBot] [SEND_FAILURE] Failed delivering to Chat ID: ${numericChatId}:`, err.message);
        // Fallback without parse_mode if formatting failed
        if (extra.parse_mode) {
          try {
            console.log(`[TelegramBot] [SEND_RETRY] Retrying without parse_mode for Chat ID: ${numericChatId}`);
            const plainRes = await this._request('sendMessage', { chat_id: numericChatId, text: c });
            results.push(plainRes);
          } catch (retryErr) {
            console.error(`[TelegramBot] [SEND_RETRY_FAILED] Retry failed for Chat ID: ${numericChatId}:`, retryErr.message);
            throw retryErr;
          }
        } else {
          throw err;
        }
      }
    }
    return results;
  }

  /**
   * Strict Default-Deny Authorization Check
   * Returns true ONLY if chatId is explicitly listed in allowedChats.
   */
  _isAuthorized(chatId) {
    if (!this.allowedChats || this.allowedChats.length === 0) {
      return false; // Default-deny: empty list grants access to NO ONE.
    }
    return this.allowedChats.includes(String(chatId));
  }

  /**
   * Process a single incoming update message safely.
   */
  async _handleMessage(msg, handler) {
    if (!msg || !msg.chat) return;

    const chatId = msg.chat.id;
    const fromId = msg.from ? msg.from.id : chatId;
    const text = (msg.text || '').trim();
    const messageType = msg.text ? 'text' : msg.photo ? 'photo' : msg.document ? 'document' : 'other';

    console.log(`[TelegramBot] [INCOMING] Update received | Type: ${messageType} | Chat ID: ${chatId} | From ID: ${fromId} | Text: "${text.slice(0, 40)}"`);

    const isStartCmd = /^\/start(\s.*)?$/i.test(text);
    const authorized = this._isAuthorized(chatId);

    // Security Gate:
    // If user is unauthorized, allow ONLY /start for pending registration.
    // Block all other commands and telemetry access with a clear unauthorized alert.
    if (!authorized && !isStartCmd) {
      console.warn(`[TelegramBot] [ACCESS_DENIED] Blocked unauthorized query from Chat ID: ${chatId} (Not in TELEGRAM_ALLOWED_CHATS)`);
      await this.sendMessage(chatId, '⛔ Access Denied: Your Telegram Chat ID is not authorized to access AGRI LINK AI telemetry or commands. Send /start to submit an authorization request.');
      return;
    }

    try {
      console.log(`[TelegramBot] [HANDLER_EXEC] Dispatching to intent handler for Chat ID: ${chatId} | Command/Text: "${text.slice(0, 30)}" | Authorized: ${authorized}`);
      const reply = await handler({ chatId, fromId, text, msg, isAuthorized: authorized });
      if (reply) {
        await this.sendMessage(chatId, reply);
      }
      console.log(`[TelegramBot] [HANDLER_COMPLETE] Successfully handled request for Chat ID: ${chatId}`);
    } catch (e) {
      console.error(`[TelegramBot] [HANDLER_ERROR] Error handling message for Chat ID: ${chatId}:`, e.message);
      await this.sendMessage(chatId, '⚠️ Error processing your request: ' + e.message);
    }
  }

  /**
   * Start getUpdates polling loop.
   */
  async startPolling(handler) {
    if (!this.token || this.polling) return;

    try {
      // Step 1: Check bot identity
      const me = await this.getMe();
      console.log(`[TelegramBot] [POLLING_START] Authenticated as @${me.username} (ID: ${me.id}). Checking webhook status...`);

      // Step 2: Ensure webhook is deleted so getUpdates does not conflict
      const wh = await this.getWebhookInfo();
      if (wh && wh.url) {
        console.log(`[TelegramBot] [POLLING_INIT] Found existing webhook: ${wh.url}. Removing to enable polling...`);
        await this.deleteWebhook(false);
        console.log('[TelegramBot] [POLLING_INIT] Webhook cleared successfully.');
      }
    } catch (err) {
      console.error('[TelegramBot] [INIT_ERROR] Failed during bot pre-polling handshake:', err.message);
    }

    this.polling = true;
    console.log('[TelegramBot] [POLLING_ACTIVE] getUpdates polling loop started.');

    const loop = async () => {
      while (this.polling) {
        try {
          const updates = await this._request('getUpdates', {
            offset: this.offset,
            timeout: 20,
            allowed_updates: ['message']
          });

          if (Array.isArray(updates) && updates.length > 0) {
            console.log(`[TelegramBot] [UPDATES_BATCH] Received batch of ${updates.length} update(s).`);
            for (const u of updates) {
              this.offset = u.update_id + 1;
              if (u.message) {
                await this._handleMessage(u.message, handler);
              }
            }
          }
        } catch (e) {
          // If polling was cancelled while awaiting, break cleanly
          if (!this.polling) break;
          console.error('[TelegramBot] [POLL_ERROR] Polling iteration failed:', e.message);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      console.log('[TelegramBot] [POLLING_STOPPED] Polling loop terminated.');
    };

    loop();
  }

  stopPolling() {
    if (this.polling) {
      console.log('[TelegramBot] [STOP] Halting bot polling loop...');
      this.polling = false;
    }
  }

  async sendNotification(chatIds, text) {
    const targets = Array.isArray(chatIds) ? chatIds : [chatIds];
    const out = [];
    for (const c of targets) {
      try {
        out.push(await this.sendMessage(c, text));
      } catch (e) {
        console.error(`[TelegramBot] [NOTIFY_ERROR] Failed notifying ${c}:`, e.message);
      }
    }
    return out;
  }
}

module.exports = TelegramBot;
