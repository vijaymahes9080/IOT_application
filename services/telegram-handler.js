// services/telegram-handler.js
// Intent handling + optimized application telemetry retrieval for the Telegram bot.

const fs = require('fs');
const path = require('path');

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

/**
 * Format age in human-readable and standard duration form.
 */
function formatAge(ageSec) {
  if (ageSec < 60) return `${ageSec}s ago`;
  const mins = Math.floor(ageSec / 60);
  const secs = ageSec % 60;
  return `${mins}m ${secs}s ago`;
}

/**
 * Determine freshness classification according to specification:
 * - Under 30 seconds: FRESH
 * - 30 seconds – 2 minutes: RECENT
 * - 2 – 5 minutes: DELAYED
 * - Above 5 minutes: STALE
 */
function calculateFreshness(timestampStr) {
  if (!timestampStr) {
    return { status: 'UNKNOWN', ageSec: null, ageLabel: 'N/A' };
  }
  const recTime = new Date(timestampStr).getTime();
  if (isNaN(recTime)) {
    return { status: 'UNKNOWN', ageSec: null, ageLabel: 'Invalid date' };
  }
  const now = Date.now();
  const diffMs = Math.max(0, now - recTime);
  const ageSec = Math.floor(diffMs / 1000);

  let status = 'STALE';
  if (ageSec < 30) {
    status = 'FRESH';
  } else if (ageSec <= 120) {
    status = 'RECENT';
  } else if (ageSec <= 300) {
    status = 'DELAYED';
  } else {
    status = 'STALE';
  }

  return {
    status,
    ageSec,
    ageLabel: formatAge(ageSec)
  };
}

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

/**
 * Retrieve the newest valid telemetry record with zero combination from multiple timestamps.
 * 1. Checks physical serial hardware (live feed if connected)
 * 2. Queries newest record from telemetry_logs table in mission_logs.mdb
 */
async function getLatestData() {
  // 1. Try physical serial hardware snapshot if connected
  try {
    if (serialClient && typeof serialClient.getLatestSnapshot === 'function') {
      const snap = serialClient.getLatestSnapshot();
      if (snap && snap.data && serialClient.hardwareStatus === 'connected') {
        const ts = snap.timestamp ? new Date(snap.timestamp).toISOString() : new Date().toISOString();
        const freshness = calculateFreshness(ts);
        return {
          data: snap.data,
          source: `ESP32 Physical Hardware (${serialClient.lastConnectedPort || 'Serial'})`,
          timestamp: ts,
          freshness
        };
      }
    }
  } catch (e) {}

  // 2. Query newest record from mission_logs.mdb with explicit timeout (2.5s)
  try {
    if (dbMgr) {
      const queryPromise = (typeof dbMgr.getLatestTelemetryRecord === 'function')
        ? dbMgr.getLatestTelemetryRecord()
        : dbMgr.getRecentTelemetry(1).then(r => (Array.isArray(r) && r.length) ? r[0] : null);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timed out')), 2500)
      );

      const record = await Promise.race([queryPromise, timeoutPromise]);
      if (record) {
        const ts = record.timestamp_log || new Date().toISOString();
        const freshness = calculateFreshness(ts);
        return {
          data: record,
          source: 'Local Database (mission_logs.mdb - telemetry_logs)',
          timestamp: ts,
          freshness
        };
      }
    }
  } catch (e) {
    console.warn('[Telegram] DB query error / timeout:', e.message);
  }

  return {
    data: null,
    note: 'No valid telemetry record currently available (Hardware and Database offline).',
    source: 'Application Backend',
    timestamp: new Date().toISOString(),
    freshness: { status: 'STALE', ageSec: null, ageLabel: 'N/A' }
  };
}

/**
 * Formats sensor readings into the master specification layout:
 * AGRI LINK AI — Agricultural Telemetry
 * ...
 * Data Status: FRESH / RECENT / DELAYED / STALE
 * Source: ...
 * Last Updated: ...
 * Data Age: ...
 */
async function formatTelemetryResponse() {
  const latest = await getLatestData();
  if (!latest.data) {
    return [
      "AGRI LINK AI — Agricultural Telemetry",
      "",
      "⚠️ Sensor readings unavailable (no active sensor feed or database record).",
      "",
      `Data Status: ${latest.freshness.status}`,
      `Source: ${latest.source}`,
      `Last Updated: ${latest.timestamp}`,
      `Data Age: ${latest.freshness.ageLabel}`
    ].join('\n');
  }

  const d = latest.data;
  const esp = d.esp32 || d;
  const sat = d.satellite || d;

  // Helper for numeric extraction and graceful missing/null handling
  const val = (v, unit = '', decimals = 1) => {
    if (v === null || v === undefined) return 'N/A';
    if (typeof v === 'number') {
      return isFinite(v) ? `${v.toFixed(decimals)}${unit}` : 'N/A';
    }
    const num = parseFloat(v);
    return isNaN(num) ? `${v}${unit}` : `${num.toFixed(decimals)}${unit}`;
  };

  const soilMoisture = esp.soil_moisture !== undefined ? esp.soil_moisture : esp.soilMoisture;
  const soilTemp = esp.soil_temp !== undefined ? esp.soil_temp : esp.soilTemp;
  const temp1 = esp.temp1 !== undefined ? esp.temp1 : sat.temp1;
  const temp2 = esp.temp2 !== undefined ? esp.temp2 : sat.temp2;
  const ldr = esp.ldr_sensor !== undefined ? esp.ldr_sensor : esp.ldrSensor;
  const batt = esp.batt_voltage !== undefined ? esp.batt_voltage : (sat.battv || sat.batt_voltage);
  const current = esp.current_amps !== undefined ? esp.current_amps : (sat.current || sat.current_amps);
  const solarp = esp.solar_power_w !== undefined ? esp.solar_power_w : (sat.solarp || sat.solar_power_w);
  const crop = d.crop_type || 'Wheat';
  const orbitDist = sat.satellite_distance_km !== undefined ? sat.satellite_distance_km : sat.distance;

  const lines = [
    "AGRI LINK AI — Agricultural Telemetry",
    "",
    `Soil Moisture: ${val(soilMoisture, '%', 1)}`,
    `Soil Temperature: ${val(soilTemp, '°C', 1)}`,
    `Ambient Temperature: ${val(temp1, '°C', 1)}`,
    `Secondary Temperature: ${val(temp2, '°C', 1)}`,
    `Solar Irradiance: ${val(ldr, ' lux', 0)}`,
    `Battery Voltage: ${val(batt, 'V', 2)}`,
    `Power Draw: ${val(current, ' A', 2)}`
  ];

  if (solarp !== undefined && solarp !== null) {
    lines.push(`Solar Power: ${val(solarp, ' W', 1)}`);
  }
  if (crop) {
    lines.push(`Crop: ${crop}`);
  }
  if (orbitDist !== undefined && orbitDist !== null) {
    lines.push(`Satellite Orbit Distance: ${val(orbitDist, ' km', 1)}`);
  }

  lines.push("");
  lines.push(`Data Status: ${latest.freshness.status}`);
  lines.push(`Source: ${latest.source}`);
  lines.push(`Last Updated: ${latest.timestamp}`);
  lines.push(`Data Age: ${latest.freshness.ageLabel}`);

  return lines.join('\n');
}

async function getAlerts() {
  try {
    if (dbMgr && typeof dbMgr.getAnomalyHistory === 'function') {
      const rows = await dbMgr.getAnomalyHistory(10);
      return { alerts: rows || [], source: 'Local Database (mission_logs.mdb)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { alerts: [], source: 'Application Backend', timestamp: new Date().toISOString() };
}

async function getHistory() {
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(10);
      return { records: rows || [], source: 'Local Database (mission_logs.mdb)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { records: [], source: 'Application Backend', timestamp: new Date().toISOString() };
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
      "• /status  - Show application, database, and telemetry freshness status",
      "• /sensors - Show live agricultural telemetry (Moisture, Temp, Irradiance, Battery)",
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
    const latest = await getLatestData();
    return [
      "📊 AGRI LINK AI — System & Account Status",
      `• Application: ${s.name} (v${s.version})`,
      `• Mission ID: ${s.missionId}`,
      `• Your Chat ID: ${numericChatId}`,
      `• Authorization: ${isAuthorized ? '✅ Authorized (Active)' : '⛔ Pending Authorization'}`,
      `• Database Records: ${s.dbRecords !== null ? s.dbRecords : 'Connected'}`,
      `• Telemetry Source: ${latest.source}`,
      `• Telemetry Freshness: ${latest.freshness.status} (${latest.freshness.ageLabel})`,
      `• System Clock: ${s.lastUpdated}`
    ].join('\n');
  }

  // --- 4. /sensors command & specific sensor queries ---
  if (intent === 'sensors' || intent === 'soil' || intent === 'temp' || intent === 'humidity') {
    return await formatTelemetryResponse();
  }

  // --- 5. /device command ---
  if (intent === 'device') {
    const d = await getLatestData();
    return d.data 
      ? `📡 Device & Hardware Status\n• State: Online (active data stream)\n• Source: ${d.source}\n• Data Status: ${d.freshness.status} (${d.freshness.ageLabel})\n• Timestamp: ${d.timestamp}`
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
      `Data Status: ${d.freshness.status} (${d.freshness.ageLabel})`,
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
    const sensorText = await formatTelemetryResponse();
    return [
      `📋 AGRI LINK AI — Operational Summary`,
      `• Application: ${s.name} v${s.version}`,
      `• Logged Alerts: ${a.alerts.length}`,
      `• Database Telemetry Digest:`,
      sensorText,
      `• Updated: ${s.lastUpdated}`
    ].join('\n');
  }

  return "I didn't recognize that command. Type /help to see all available commands.";
}

module.exports = {
  handle,
  classifyIntent,
  loadPending,
  savePending,
  removePending,
  getLatestData,
  calculateFreshness,
  formatTelemetryResponse
};
