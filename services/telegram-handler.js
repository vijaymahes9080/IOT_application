// services/telegram-handler.js
// Intent handling + application data retrieval for the Telegram bot.

const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '..', 'mission_logs.mdb');

function classifyIntent(text) {
  const t = (text || '').toLowerCase().trim();
  if (/^\/start(\s.*)?$/i.test(t)) return 'start';
  if (/^\/help(\s.*)?$/i.test(t) || t === 'help') return 'help';
  if (/^\/status(\s.*)?$/i.test(t) || /status|health|alive/.test(t)) return 'status';
  if (/^\/sensors(\s.*)?$/i.test(t) || /sensors|sensor/.test(t)) return 'sensors';
  if (/soil/.test(t)) return 'soil';
  if (/temp/.test(t)) return 'temp';
  if (/humid/.test(t)) return 'humidity';
  if (/online|device/.test(t)) return 'device';
  if (/^\/alerts(\s.*)?$/i.test(t) || /alert/.test(t)) return 'alerts';
  if (/^\/history(\s.*)?$/i.test(t) || /histor|previous|past/.test(t)) return 'history';
  if (/^\/summary(\s.*)?$/i.test(t) || /summar/.test(t)) return 'summary';
  if (/^\/latest(\s.*)?$/i.test(t) || /latest|recent|current|show/.test(t)) return 'latest';
  return 'unknown';
}

let dbMgr = null, serialClient = null, tbConnector = null;
try { dbMgr = require('./database-mgr'); } catch (e) { console.warn('[Telegram] dbMgr unavailable:', e.message); }
try { serialClient = require('./serial-client'); } catch (e) { console.warn('[Telegram] serialClient unavailable:', e.message); }
try { tbConnector = require('./thingsboard-connector'); } catch (e) { console.warn('[Telegram] tbConnector unavailable:', e.message); }

async function getAppStatus(isAuthorized = false, chatId = '') {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    let dbCount = null;
    if (dbMgr && typeof dbMgr.getDbRecordCount === 'function') {
      try { dbCount = await dbMgr.getDbRecordCount(); } catch (e) {}
    }
    return {
      name: cfg.app_name || 'ORBIT-X / AGRI LINK AI',
      missionId: cfg.mission ? cfg.mission.id : 'TITAN-1',
      version: cfg.version || '1.0.0',
      authorized: isAuthorized,
      chatId: chatId,
      dbRecords: dbCount,
      lastUpdated: new Date().toISOString()
    };
  } catch (e) {
    return { name: 'ORBIT-X', error: e.message };
  }
}

async function getLatestData() {
  // 1. Try serial snapshot first (live physical hardware)
  try {
    if (serialClient && typeof serialClient.getLatestSnapshot === 'function') {
      const snap = serialClient.getLatestSnapshot();
      if (snap && snap.data) {
        return { data: snap.data, source: 'ESP32 Serial Hardware (' + (snap.port || 'Live') + ')', timestamp: new Date().toISOString() };
      }
    }
  } catch (e) {}

  // 2. Try DB telemetry logs (telemetry_logs table)
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(1);
      if (rows && rows.length) {
        return { data: rows[0], source: 'Local Database (mission_logs.mdb)', timestamp: rows[0].timestamp_log || new Date().toISOString() };
      }
    }
  } catch (e) {}

  return { data: null, note: 'No telemetry data currently available. (Hardware and Database offline).', source: 'application backend', timestamp: new Date().toISOString() };
}

async function getAlerts() {
  try {
    if (dbMgr && typeof dbMgr.getAnomalyHistory === 'function') {
      const rows = await dbMgr.getAnomalyHistory(10);
      return { alerts: rows || [], source: 'Local Database (mission_logs.mdb)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { alerts: [], source: 'application backend', timestamp: new Date().toISOString() };
}

async function getHistory() {
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(10);
      return { records: rows || [], source: 'Local Database (mission_logs.mdb)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { records: [], source: 'application backend', timestamp: new Date().toISOString() };
}

async function getSensorSummary() {
  const latest = await getLatestData();
  if (!latest.data) {
    return '⚠️ Sensor readings unavailable (no active sensor feed or database record).';
  }
  const d = latest.data;
  const esp = d.esp32 || d;
  const sat = d.satellite || {};
  const lines = [];

  if (esp.soil_moisture !== undefined || esp.soilMoisture !== undefined) {
    const sm = esp.soil_moisture !== undefined ? esp.soil_moisture : esp.soilMoisture;
    lines.push(`• Soil Moisture: ${typeof sm === 'number' ? sm.toFixed(1) : sm}%`);
  }
  if (esp.soil_temp !== undefined) {
    lines.push(`• Soil Temp: ${typeof esp.soil_temp === 'number' ? esp.soil_temp.toFixed(1) : esp.soil_temp}°C`);
  }
  if (esp.temp1 !== undefined) {
    lines.push(`• Ambient Temp (T1): ${typeof esp.temp1 === 'number' ? esp.temp1.toFixed(1) : esp.temp1}°C`);
  }
  if (esp.temp2 !== undefined) {
    lines.push(`• Secondary Temp (T2): ${typeof esp.temp2 === 'number' ? esp.temp2.toFixed(1) : esp.temp2}°C`);
  }
  if (esp.humidity !== undefined) {
    lines.push(`• Relative Humidity: ${typeof esp.humidity === 'number' ? esp.humidity.toFixed(1) : esp.humidity}%`);
  }
  if (esp.ldr_sensor !== undefined || esp.ldrSensor !== undefined) {
    const ldr = esp.ldr_sensor !== undefined ? esp.ldr_sensor : esp.ldrSensor;
    lines.push(`• Solar Irradiance (LDR): ${ldr}`);
  }
  if (esp.ultrasonic_dist !== undefined || esp.ultrasonic !== undefined) {
    const u = esp.ultrasonic_dist !== undefined ? esp.ultrasonic_dist : esp.ultrasonic;
    lines.push(`• Ultrasonic Distance: ${typeof u === 'number' ? u.toFixed(1) : u} cm`);
  }
  if (esp.laserDistance !== undefined) {
    lines.push(`• Laser ToF Distance: ${esp.laserDistance} mm`);
  }
  if (esp.batt_voltage !== undefined || (sat.sys && sat.sys.battv !== undefined)) {
    const bv = esp.batt_voltage !== undefined ? esp.batt_voltage : sat.sys.battv;
    lines.push(`• Battery Voltage: ${typeof bv === 'number' ? bv.toFixed(2) : bv}V`);
  }
  if (esp.current_amps !== undefined) {
    lines.push(`• Power Draw: ${typeof esp.current_amps === 'number' ? esp.current_amps.toFixed(2) : esp.current_amps} A`);
  }

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

function removePending(chatId) {
  try {
    const list = loadPending();
    const strId = String(chatId);
    if (list.includes(strId)) {
      const updated = list.filter(id => id !== strId);
      savePending(updated);
      console.log(`[Telegram] [PENDING_CLEARED] Chat ID ${strId} transitioned from pending to authorized.`);
    }
  } catch (e) {
    console.warn('[Telegram] removePending notice:', e.message);
  }
}

async function handle({ text, chatId, fromId, isAuthorized }) {
  const intent = classifyIntent(text);
  const numericChatId = String(chatId);

  // When an authorized user interacts, update pending registry so they are not kept as pending
  if (isAuthorized) {
    removePending(numericChatId);
  }

  // --- 1. /start command ---
  if (intent === 'start') {
    if (isAuthorized) {
      return [
        "🌱 AGRI LINK AI — Satellite & IoT Command Console",
        "",
        `Your Chat ID: ${numericChatId}`,
        "Status: ✅ Authorized Administrator",
        "",
        "You have full access to mission telemetry and crop intelligence.",
        "Type /help to inspect available telemetry and control commands."
      ].join('\n');
    }

    // Pending registration path for unapproved accounts
    const pending = loadPending();
    if (!pending.includes(numericChatId)) {
      pending.push(numericChatId);
      savePending(pending);
      console.log(`[Telegram] [REGISTRATION_SAVED] Added Chat ID ${numericChatId} (From ID: ${fromId || numericChatId}) to telegram_pending.json`);
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

  // --- 2. /help command ---
  if (intent === 'help') {
    return [
      "🛰️ AGRI LINK AI — Available Telegram Commands:",
      "",
      "• /status  - Show application & authorized account status",
      "• /sensors - Show live sensor readings (Soil, Temp, Humidity, Light, Power)",
      "• /latest  - Show raw latest telemetry payload snapshot",
      "• /alerts  - Show recent system and crop stress anomalies",
      "• /history - Show recent telemetry record timestamps and counts",
      "• /summary - Show overall system health and sensor digest",
      "",
      "Natural language queries are also supported (e.g. 'soil moisture', 'temperature', 'device status')."
    ].join('\n');
  }

  // --- 3. /status command ---
  if (intent === 'status') {
    const s = await getAppStatus(isAuthorized, numericChatId);
    return [
      "📊 AGRI LINK AI — System & Account Status",
      `• Application: ${s.name} (v${s.version})`,
      `• Mission ID: ${s.missionId}`,
      `• Your Chat ID: ${numericChatId}`,
      `• Authorization: ${isAuthorized ? '✅ Authorized (Active)' : '⛔ Pending Authorization'}`,
      `• Database Records: ${s.dbRecords !== null ? s.dbRecords : 'Connected'}`,
      `• System Clock: ${s.lastUpdated}`
    ].join('\n');
  }

  // --- 4. /sensors command & specific sensor queries ---
  if (intent === 'sensors' || intent === 'soil' || intent === 'temp' || intent === 'humidity') {
    const s = await getSensorSummary();
    const latest = await getLatestData();
    return [
      "🌱 Live Agricultural Sensor Readings",
      s,
      "",
      `Source: ${latest.source}`,
      `Timestamp: ${latest.timestamp}`
    ].join('\n');
  }

  // --- 5. /device command ---
  if (intent === 'device') {
    const d = await getLatestData();
    return d.data 
      ? `📡 Device & Hardware Status\n• State: Online (active data stream)\n• Source: ${d.source}\n• Timestamp: ${d.timestamp}`
      : `📡 Device & Hardware Status\n• State: Offline / Standby (no live stream)\n• Source: ${d.source}\n• Timestamp: ${d.timestamp}`;
  }

  // --- 6. /latest command ---
  if (intent === 'latest') {
    const d = await getLatestData();
    if (!d.data) {
      return `📡 Latest Telemetry Snapshot\n${d.note}\nSource: ${d.source}\nTimestamp: ${d.timestamp}`;
    }
    return [
      "📡 Latest Telemetry Snapshot",
      "```json",
      JSON.stringify(d.data, null, 2).slice(0, 1500),
      "```",
      `Source: ${d.source}`,
      `Timestamp: ${d.timestamp}`
    ].join('\n');
  }

  // --- 7. /alerts command ---
  if (intent === 'alerts') {
    const a = await getAlerts();
    if (!a.alerts || !a.alerts.length) {
      return `⚠️ Mission Anomalies & Alerts\nNo critical anomalies or threshold violations recorded.\nSource: ${a.source}\nTimestamp: ${a.timestamp}`;
    }
    const alertList = a.alerts.slice(0, 5).map((x, i) => `${i + 1}. [${x.severity || 'WARN'}] ${x.description || JSON.stringify(x).slice(0, 100)}`);
    return [
      `⚠️ Mission Anomalies & Alerts (${a.alerts.length} total)`,
      alertList.join('\n'),
      "",
      `Source: ${a.source}`,
      `Timestamp: ${a.timestamp}`
    ].join('\n');
  }

  // --- 8. /history command ---
  if (intent === 'history') {
    const h = await getHistory();
    if (!h.records || !h.records.length) {
      return `📜 Historical Telemetry\nNo historical records found in mission logs.\nSource: ${h.source}\nTimestamp: ${h.timestamp}`;
    }
    return [
      `📜 Historical Telemetry`,
      `• Records Retrieved: ${h.records.length}`,
      `• Latest Record ID: ${h.records[0].id || 'N/A'} (${h.records[0].timestamp_log || 'N/A'})`,
      `• Earliest in Batch ID: ${h.records[h.records.length - 1].id || 'N/A'}`,
      `• Source: ${h.source}`,
      `• Timestamp: ${h.timestamp}`
    ].join('\n');
  }

  // --- 9. /summary command ---
  if (intent === 'summary') {
    const s = await getAppStatus(isAuthorized, numericChatId);
    const a = await getAlerts();
    const sensorText = await getSensorSummary();
    return [
      `📋 AGRI LINK AI — Operational Summary`,
      `• Application: ${s.name} v${s.version}`,
      `• Logged Alerts: ${a.alerts.length}`,
      `• Active Readings:`,
      sensorText,
      `• Updated: ${s.lastUpdated}`
    ].join('\n');
  }

  return "I didn't recognize that command. Type /help to see all available commands.";
}

module.exports = { handle, classifyIntent, loadPending, savePending, removePending };
