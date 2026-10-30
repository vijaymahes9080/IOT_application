// services/telegram-handler.js
// AGRI LINK AI — Hybrid Telemetry Intelligence Engine
// Integrates historical/latest database records and independent live hardware monitoring.

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
  if (/online|device|hardware/.test(t)) return 'device';
  if (/^\/alerts(\s.*)?$/i.test(t) || /alert/.test(t)) return 'alerts';
  if (/^\/history(\s.*)?$/i.test(t) || /histor|previous|past/.test(t)) return 'history';
  if (/^\/summary(\s.*)?$/i.test(t) || /summar/.test(t)) return 'summary';
  if (/^\/latest(\s.*)?$/i.test(t) || /latest|recent|current|show/.test(t)) return 'latest';
  return 'unknown';
}

let dbMgr = null, hardwareMonitor = null;
try { dbMgr = require('./database-mgr'); } catch (e) { console.warn('[Telegram] dbMgr unavailable:', e.message); }
try { hardwareMonitor = require('./hardware-monitor'); } catch (e) { console.warn('[Telegram] hardwareMonitor unavailable:', e.message); }

function formatAge(ageSec) {
  if (ageSec === null || ageSec === undefined || isNaN(ageSec)) return 'N/A';
  if (ageSec < 60) return `${ageSec}s ago`;
  const mins = Math.floor(ageSec / 60);
  const secs = ageSec % 60;
  return `${mins}m ${secs}s ago`;
}

/**
 * Determine database data freshness classification:
 * - Under 30 seconds: FRESH
 * - 30 seconds – 2 minutes: RECENT
 * - 2 – 5 minutes: DELAYED
 * - Over 5 minutes: STALE
 */
function calculateFreshness(timestampStr) {
  if (!timestampStr) {
    return { status: 'STALE', ageSec: null, ageLabel: 'N/A' };
  }
  const recTime = new Date(timestampStr).getTime();
  if (isNaN(recTime)) {
    return { status: 'STALE', ageSec: null, ageLabel: 'Invalid date' };
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

/**
 * Formats values safely with units and handles missing/nulls gracefully.
 */
function formatVal(v, unit = '', decimals = 1) {
  if (v === null || v === undefined) return 'N/A';
  if (typeof v === 'number') {
    return isFinite(v) ? `${v.toFixed(decimals)}${unit}` : 'N/A';
  }
  const num = parseFloat(v);
  return isNaN(num) ? `${v}${unit}` : `${num.toFixed(decimals)}${unit}`;
}

/**
 * Retrieve Hybrid Telemetry Data:
 * Evaluates both Database and Live Hardware independently and unifies them.
 */
async function getHybridTelemetry() {
  const hwState = hardwareMonitor ? hardwareMonitor.getHardwareState() : {
    state: 'UNKNOWN',
    connected: false,
    port: null,
    method: 'Not configured',
    lastUpdate: null,
    lastUpdateAgeSec: null,
    error: 'Hardware monitor not loaded'
  };

  // 1. Check if live physical hardware snapshot is fresh
  const liveSnap = hardwareMonitor ? hardwareMonitor.getLiveSnapshot() : null;

  // 2. Query newest record from mission_logs.mdb with 2.5s timeout
  let dbRecord = null;
  let dbError = null;

  try {
    if (dbMgr) {
      const queryPromise = (typeof dbMgr.getLatestTelemetryRecord === 'function')
        ? dbMgr.getLatestTelemetryRecord()
        : dbMgr.getRecentTelemetry(1).then(r => (Array.isArray(r) && r.length) ? r[0] : null);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timed out (> 2500ms)')), 2500)
      );

      dbRecord = await Promise.race([queryPromise, timeoutPromise]);
    } else {
      dbError = 'Database manager module unavailable';
    }
  } catch (err) {
    dbError = err.message;
    console.warn('[Telegram] DB query warning:', err.message);
  }

  // 3. Hybrid Source Resolution
  let activeData = null;
  let dataSource = '';
  let dataTimestamp = null;
  let isHardwareDirect = false;

  if (liveSnap && liveSnap.data && hwState.state === 'ONLINE') {
    // Live physical hardware stream is available and newer
    activeData = liveSnap.data;
    dataSource = `Live ESP32 Stream (${hwState.port || 'Serial'})`;
    dataTimestamp = liveSnap.data.timestamp ? new Date(liveSnap.data.timestamp).toISOString() : new Date().toISOString();
    isHardwareDirect = true;
  } else if (dbRecord) {
    // Database record is selected
    activeData = dbRecord;
    dataSource = 'mission_logs.mdb (telemetry_logs)';
    dataTimestamp = dbRecord.timestamp_log || new Date().toISOString();
    isHardwareDirect = false;
  }

  const dataFreshness = dataTimestamp ? calculateFreshness(dataTimestamp) : { status: 'STALE', ageSec: null, ageLabel: 'N/A' };

  return {
    activeData,
    dataSource,
    dataTimestamp,
    isHardwareDirect,
    dataFreshness,
    hardware: hwState,
    database: {
      connected: !dbError && dbRecord !== null,
      error: dbError,
      latestTimestamp: dbRecord ? dbRecord.timestamp_log : null,
      recordCount: null
    }
  };
}

/**
 * Standard Professional Message Layout according to Section 8 Specification:
 * 
 * 🌱 AGRI LINK AI — AGRICULTURAL TELEMETRY
 * 
 * 📊 SENSOR READINGS
 * • Soil Moisture: ...
 * ...
 * 🌾 AGRICULTURAL CONTEXT
 * • Crop: ...
 * • Satellite Orbit Distance: ...
 * 
 * 🔌 HARDWARE CONNECTIVITY
 * • ESP32: ...
 * • Last Hardware Update: ...
 * • Communication: ...
 * 
 * 💾 DATABASE STATUS
 * • Database: mission_logs.mdb
 * • Latest Record: ...
 * • Data Age: ...
 * • Data Freshness: FRESH / RECENT / DELAYED / STALE
 * 
 * ⚠️ WARNING
 * ...
 */
async function formatStandardTelemetryResponse() {
  const hybrid = await getHybridTelemetry();
  const d = hybrid.activeData;
  const hw = hybrid.hardware;
  const db = hybrid.database;

  // Handle case where NO data exists in DB and Hardware is offline
  if (!d) {
    const lines = [
      "🌱 AGRI LINK AI — AGRICULTURAL TELEMETRY",
      "",
      "⚠️ SENSOR READINGS UNAVAILABLE",
      db.error ? `• Database Error: ${db.error}` : "• No telemetry records found in mission_logs.mdb.",
      "",
      "🔌 HARDWARE CONNECTIVITY",
      `• ESP32: ${hw.state}`,
      `• Last Hardware Update: ${hw.lastUpdate || 'Never'}`,
      `• Communication: ${hw.method}`,
      "",
      "💾 DATABASE STATUS",
      "• Database: mission_logs.mdb",
      "• Status: " + (db.error ? "Unavailable" : "No Records"),
      "",
      "⚠️ WARNING",
      "Both physical ESP32 sensor hardware and historical database records are currently unavailable. Application is in standby mode."
    ];
    return lines.join('\n');
  }

  // Normalize single snapshot fields
  const esp = d.esp32 || d;
  const sat = d.satellite || d;

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
    "🌱 AGRI LINK AI — AGRICULTURAL TELEMETRY",
    "",
    "📊 SENSOR READINGS",
    "",
    `• Soil Moisture: ${formatVal(soilMoisture, '%', 1)}`,
    `• Soil Temperature: ${formatVal(soilTemp, '°C', 1)}`,
    `• Ambient Temperature (T1): ${formatVal(temp1, '°C', 1)}`,
    `• Secondary Temperature (T2): ${formatVal(temp2, '°C', 1)}`,
    `• Solar Irradiance (LDR): ${formatVal(ldr, ' lux', 0)}`,
    `• Battery Voltage: ${formatVal(batt, 'V', 2)}`,
    `• Power Draw: ${formatVal(current, ' A', 2)}`
  ];

  if (solarp !== undefined && solarp !== null) {
    lines.push(`• Solar Power: ${formatVal(solarp, ' W', 1)}`);
  }

  lines.push("");
  lines.push("🌾 AGRICULTURAL CONTEXT");
  lines.push("");
  lines.push(`• Crop: ${crop}`);
  if (orbitDist !== undefined && orbitDist !== null) {
    lines.push(`• Satellite Orbit Distance: ${formatVal(orbitDist, ' km', 1)}`);
  }

  lines.push("");
  lines.push("🔌 HARDWARE CONNECTIVITY");
  lines.push("");
  lines.push(`• ESP32: ${hw.state}`);
  lines.push(`• Last Hardware Update: ${hw.lastUpdate || 'None detected'}`);
  lines.push(`• Communication: ${hw.method}`);

  lines.push("");
  lines.push("💾 DATABASE STATUS");
  lines.push("");
  lines.push("• Database: mission_logs.mdb");
  lines.push(`• Latest Record: ${hybrid.dataTimestamp || 'N/A'}`);
  lines.push(`• Data Age: ${hybrid.dataFreshness.ageLabel}`);
  lines.push(`• Data Freshness: ${hybrid.dataFreshness.status}`);

  // Warning logic per Section 8:
  // "ESP32 hardware is currently disconnected. The readings above are the latest available database records, not fresh hardware measurements."
  const showDisconnectedWarning = (hw.state === 'DISCONNECTED' || hw.state === 'RECONNECTING');
  const showStaleWarning = (hybrid.dataFreshness.status === 'STALE');

  if (showDisconnectedWarning || showStaleWarning) {
    lines.push("");
    lines.push("⚠️ WARNING");
    if (showDisconnectedWarning && !showStaleWarning) {
      lines.push("ESP32 hardware is currently disconnected. The readings above are the latest available database records, not fresh hardware measurements.");
    } else if (showDisconnectedWarning && showStaleWarning) {
      lines.push("ESP32 hardware is currently disconnected and the newest database records are STALE (> 5 minutes old). Readings reflect historical conditions.");
    } else if (showStaleWarning) {
      lines.push("Database telemetry is STALE (> 5 minutes old). Sensor ingestion may be paused.");
    }
  }

  return lines.join('\n');
}

async function getAppStatus(isAuthorized = false, chatId = '') {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    let dbCount = null;
    if (dbMgr && typeof dbMgr.getDbRecordCount === 'function') {
      try { dbCount = await dbMgr.getDbRecordCount(); } catch (e) {}
    }
    const hw = hardwareMonitor ? hardwareMonitor.getHardwareState() : { state: 'UNKNOWN' };
    const hybrid = await getHybridTelemetry();

    return [
      "📊 AGRI LINK AI — System & Account Status",
      `• Application: ${cfg.app_name || 'ORBIT-X'} (v${cfg.version || '1.0.0'})`,
      `• Mission ID: ${cfg.mission ? cfg.mission.id : 'TITAN-1'}`,
      `• Your Chat ID: ${chatId}`,
      `• Authorization: ${isAuthorized ? '✅ Authorized (Active)' : '⛔ Pending Authorization'}`,
      `• Database Records: ${dbCount !== null ? dbCount : 'Connected'}`,
      `• Hardware State: ${hw.state}`,
      `• Telemetry Source: ${hybrid.dataSource}`,
      `• Telemetry Freshness: ${hybrid.dataFreshness.status} (${hybrid.dataFreshness.ageLabel})`,
      `• System Clock: ${new Date().toISOString()}`
    ].join('\n');
  } catch (e) {
    return `📊 AGRI LINK AI — Status Error: ${e.message}`;
  }
}

async function getAlerts() {
  try {
    if (dbMgr && typeof dbMgr.getAnomalyHistory === 'function') {
      const rows = await dbMgr.getAnomalyHistory(10);
      return { alerts: rows || [], source: 'mission_logs.mdb (anomaly_events)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { alerts: [], source: 'Application Backend', timestamp: new Date().toISOString() };
}

async function getHistory() {
  try {
    if (dbMgr && typeof dbMgr.getRecentTelemetry === 'function') {
      const rows = await dbMgr.getRecentTelemetry(10);
      return { records: rows || [], source: 'mission_logs.mdb (telemetry_logs)', timestamp: new Date().toISOString() };
    }
  } catch (e) {}
  return { records: [], source: 'Application Backend', timestamp: new Date().toISOString() };
}

const PENDING_FILE = path.join(__dirname, '..', 'telegram_pending.json');

function loadPending() {
  try {
    if (fs.existsSync(PENDING_FILE)) return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
    return [];
  } catch (e) { return []; }
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

  // Security: Remove authorized user from pending queue automatically
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

    const pending = loadPending();
    if (!pending.includes(numericChatId)) {
      pending.push(numericChatId);
      savePending(pending);
      console.log(`[Telegram] [REGISTRATION_SAVED] Added Chat ID ${numericChatId} to telegram_pending.json`);
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
      "• /sensors - Show latest hybrid telemetry (Sensors, Hardware & Database status)",
      "• /status  - Show system status, database health, and hardware connection",
      "• /history - Retrieve recent telemetry batch records from mission_logs.mdb",
      "• /alerts  - Show recent system and crop stress anomaly events",
      "• /latest  - Show raw JSON snapshot of latest telemetry record",
      "• /summary - Show comprehensive mission summary and sensor digest",
      "",
      "Natural language queries are also supported (e.g. 'soil moisture', 'temperature', 'device status')."
    ].join('\n');
  }

  // --- 3. /status command ---
  if (intent === 'status') {
    return await getAppStatus(isAuthorized, numericChatId);
  }

  // --- 4. /sensors command & sensor queries ---
  if (intent === 'sensors' || intent === 'soil' || intent === 'temp' || intent === 'humidity') {
    return await formatStandardTelemetryResponse();
  }

  // --- 5. /device command ---
  if (intent === 'device') {
    const hw = hardwareMonitor ? hardwareMonitor.getHardwareState() : { state: 'UNKNOWN' };
    const hybrid = await getHybridTelemetry();
    return [
      "📡 AGRI LINK AI — Hardware & Device Status",
      `• Hardware State: ${hw.state}`,
      `• Connection Method: ${hw.method}`,
      `• Last Hardware Update: ${hw.lastUpdate || 'None'}`,
      `• Data Source: ${hybrid.dataSource}`,
      `• Data Freshness: ${hybrid.dataFreshness.status} (${hybrid.dataFreshness.ageLabel})`,
      hw.error ? `• Notice: ${hw.error}` : "• Channel: Nominal"
    ].join('\n');
  }

  // --- 6. /latest command ---
  if (intent === 'latest') {
    const hybrid = await getHybridTelemetry();
    if (!hybrid.activeData) {
      return `📡 Latest Telemetry Snapshot\nNo valid telemetry records available.\nSource: ${hybrid.dataSource}\nTimestamp: ${hybrid.dataTimestamp || 'N/A'}`;
    }
    return [
      "📡 Latest Telemetry Snapshot",
      `Source: ${hybrid.dataSource}`,
      `Hardware: ${hybrid.hardware.state} | Freshness: ${hybrid.dataFreshness.status} (${hybrid.dataFreshness.ageLabel})`,
      "```json",
      JSON.stringify(hybrid.activeData, null, 2).slice(0, 1500),
      "```",
      `Timestamp: ${hybrid.dataTimestamp}`
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
    const sensorText = await formatStandardTelemetryResponse();
    return [
      `📋 AGRI LINK AI — Operational Summary`,
      s,
      `• Logged Alerts: ${a.alerts.length}`,
      "",
      sensorText
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
  getHybridTelemetry,
  formatStandardTelemetryResponse,
  calculateFreshness
};
