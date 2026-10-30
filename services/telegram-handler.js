// services/telegram-handler.js
// Intent handling + application data retrieval for the Telegram bot.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'mission_logs.mdb');

function classifyIntent(text) {
  const t = (text || '').toLowerCase().trim();
  if (/^\/start(\s.*)?$/i.test(t)) return 'start';
  if (/soil/.test(t)) return 'soil';
  if (/temp/.test(t)) return 'temp';
  if (/humid/.test(t)) return 'humidity';
  if (/online|device/.test(t)) return 'device';
  if (/status|health|alive/.test(t)) return 'status';
  if (/alert/.test(t)) return 'alerts';
  if (/histor|previous|past/.test(t)) return 'history';
  if (/summar/.test(t)) return 'summary';
  if (/latest|recent|current|show/.test(t)) return 'latest';
  if (/help/.test(t)) return 'help';
  return 'unknown';
}

let dbMgr = null, serialClient = null, tbConnector = null;
try { dbMgr = require('./database-mgr'); } catch (e) { console.warn('[Telegram] dbMgr unavailable:', e.message); }
try { serialClient = require('./serial-client'); } catch (e) { console.warn('[Telegram] serialClient unavailable:', e.message); }
try { tbConnector = require('./thingsboard-connector'); } catch (e) { console.warn('[Telegram] tbConnector unavailable:', e.message); }

async function getAppStatus() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    let dbCount = null;
    if (dbMgr && typeof dbMgr.getDbRecordCount === 'function') {
      try { dbCount = await dbMgr.getDbRecordCount(); } catch (e) {}
    }
    return {
      name: cfg.app_name || 'ORBIT-X',
      version: cfg.version || '1.0.0',
      dbRecords: dbCount,
      lastUpdated: new Date().toISOString()
    };
  } catch (e) {
    return { name: 'ORBIT-X', error: e.message };
  }
}

async function getLatestData() {
  // Try serial snapshot first (live hardware), then DB
  try {
    if (serialClient && typeof serialClient.getLatestSnapshot === 'function') {
      const snap = serialClient.getLatestSnapshot();
      if (snap) return { data: snap, source: 'serial hardware', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(1);
      if (rows && rows.length) return { data: rows[0], source: 'mission_logs.mdb', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { data: null, note: 'No telemetry available (hardware offline or no records).', source: 'application backend', timestamp: new Date().toISOString() };
}

async function getAlerts() {
  try {
    if (dbMgr && typeof dbMgr.getAnomalyHistory === 'function') {
      const rows = await dbMgr.getAnomalyHistory(10);
      return { alerts: rows || [], source: 'mission_logs.mdb', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { alerts: [], source: 'application backend', timestamp: new Date().toISOString() };
}

async function getHistory() {
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(20);
      return { records: rows || [], source: 'mission_logs.mdb', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { records: [], source: 'mission_logs.mdb', timestamp: new Date().toISOString() };
}

async function getSensorSummary() {
  const latest = await getLatestData();
  if (!latest.data) return 'No sensor data available.';
  const d = latest.data;
  const esp = d.esp32 || d;
  const sat = d.satellite || {};
  const lines = [];
  if (esp.soilMoisture !== undefined) lines.push(`Soil moisture: ${esp.soilMoisture}%`);
  if (esp.temp1 !== undefined) lines.push(`Temp1: ${esp.temp1}°C`);
  if (esp.temp2 !== undefined) lines.push(`Temp2: ${esp.temp2}°C`);
  if (esp.humidity !== undefined) lines.push(`Humidity: ${esp.humidity}%`);
  if (sat.sys && sat.sys.battv !== undefined) lines.push(`Battery: ${sat.sys.battv}V`);
  return lines.length ? lines.join('\n') : JSON.stringify(d).slice(0, 500);
}

const PENDING_FILE = path.join(__dirname, '..', 'telegram_pending.json');

function loadPending() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    }
    return [];
  } catch (e) {
    return [];
  }
}

function savePending(list) {
  try {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[Telegram] Failed to persist pending chat ID:', e.message);
  }
}

async function handle({ text, chatId, fromId }) {
  const intent = classifyIntent(text);
  const numericChatId = String(chatId);

  // Exact Phase 3 Workflow for /start:
  if (intent === 'start') {
    const pending = loadPending();
    if (!pending.includes(numericChatId)) {
      pending.push(numericChatId);
      savePending(pending);
      console.log(`[Telegram] [REGISTRATION_SAVED] Added Chat ID ${numericChatId} (From ID: ${fromId || numericChatId}) to telegram_pending.json`);
    } else {
      console.log(`[Telegram] [REGISTRATION_EXISTS] Chat ID ${numericChatId} already present in telegram_pending.json`);
    }

    return [
      "AGRI LINK AI Telegram Registration",
      "",
      `Your Chat ID: ${numericChatId}`,
      "",
      "Status: Pending Authorization",
      "",
      "Your account has been registered for administrator approval.",
      "",
      "Application data access is disabled until authorization."
    ].join('\n');
  }

  switch (intent) {
    case 'status': {
      const s = await getAppStatus();
      return `Application Status\n- Name: ${s.name}\n- Version: ${s.version}\n- Last updated: ${s.lastUpdated}`;
    }
    case 'soil':
    case 'temp':
    case 'humidity': {
      const s = await getSensorSummary();
      return `Sensor Readings\n${s}\n\nSource: application backend\nTime: ${new Date().toISOString()}`;
    }
    case 'device': {
      const d = await getLatestData();
      return d.data ? `Device Status\nOnline (last data received).\nSource: ${d.source}` : `Device Status\nOffline / no recent data.\nSource: ${d.source}`;
    }
    case 'latest': {
      const d = await getLatestData();
      if (!d.data) return `Latest Data\n${d.note}\nSource: ${d.source}\nTime: ${d.timestamp}`;
      return `Latest Data\n${JSON.stringify(d.data, null, 2).slice(0, 1500)}\n\nSource: ${d.source}\nTime: ${d.timestamp}`;
    }
    case 'alerts': {
      const a = await getAlerts();
      if (!a.alerts.length) return `Recent Alerts\nNo anomalies recorded.\nSource: ${a.source}\nTime: ${a.timestamp}`;
      return `Recent Alerts (${a.alerts.length})\n${a.alerts.map((x,i)=>`${i+1}. ${JSON.stringify(x).slice(0,200)}`).join('\n')}\nSource: ${a.source}\nTime: ${a.timestamp}`;
    }
    case 'history': {
      const h = await getHistory();
      return `Historical Records\n- Count: ${h.records.length}\n- Source: ${h.source}\n- Time: ${h.timestamp}`;
    }
    case 'summary': {
      const s = await getAppStatus();
      const a = await getAlerts();
      return `Summary\n- Status: ${s.name} v${s.version}\n- Alerts: ${a.alerts.length}\n- Updated: ${s.lastUpdated}`;
    }
    case 'help':
      return 'Commands: /status, /latest, /alerts, /history, /summary. Or ask in natural language.';
    default:
      return "I didn't understand that. Try /help.";
  }
}

module.exports = { handle, classifyIntent };
