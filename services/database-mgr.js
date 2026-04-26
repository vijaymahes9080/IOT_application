const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// MS Access Database Configuration
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// 1. Prioritize project-local database if it exists (for development visibility)
const projectLocalDb = path.join(__dirname, '..', config.database.filename);
let dbPath;

if (fs.existsSync(projectLocalDb)) {
    dbPath = projectLocalDb;
    console.log('[DB] Using project-local database:', dbPath);
} else {
    // 2. Fallback to AppData (standard for packaged Electron apps)
    const electron = require('electron');
    const appDataRoot = (electron.app || electron.remote?.app) ? (electron.app || electron.remote.app).getPath('userData') : path.join(process.env.APPDATA || process.env.USERPROFILE, 'Orbit-X');
    
    if (!fs.existsSync(appDataRoot)) {
        fs.mkdirSync(appDataRoot, { recursive: true });
    }
    dbPath = path.join(appDataRoot, config.database.filename);
    console.log('[DB] Using AppData database:', dbPath);
}

/**
 * CUSTOM ROBUST ADODB IMPLEMENTATION
 * The original node-adodb uses inconsistent encoding and architecture detection leading to 'Spawn error'.
 * For Jet 4.0 (MDB), we ALWAYS need the 32-bit engine (SysWOW64) on 64-bit Windows.
 */
class RobustADODB {
    constructor(dbPath) {
        this.dbPath = dbPath;
        const isX64 = process.arch === 'x64' || process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
        const sysRoot = process.env.SystemRoot || 'C:\\Windows';
        this.cscript = path.join(sysRoot, isX64 ? 'SysWOW64' : 'System32', 'cscript.exe');

        let proxyPath = path.join(__dirname, '..', 'node_modules', 'node-adodb', 'lib', 'adodb.js');
        // CRITICAL: cscript.exe cannot read files inside the app.asar. 
        // We MUST point it to the unpacked version created by electron-builder.
        if (proxyPath.includes('app.asar')) {
            proxyPath = proxyPath.replace('app.asar', 'app.asar.unpacked');
        }
        this.proxyScript = proxyPath;

        this.connectionString = `Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${dbPath.replace(/\\/g, '/')};`;

        console.log(`[DB] Robust Engine Initialized: ${this.cscript}`);
        console.log(`[DB] Proxy Script: ${this.proxyScript}`);
    }

    async exec(command, sql) {
        return new Promise((resolve, reject) => {
            const params = JSON.stringify({
                connection: this.connectionString,
                sql: sql
            });

            // Use //B (batch) and //E:JScript to ensure stable execution
            const args = [this.proxyScript, '//E:JScript', '//Nologo', '//B', command];

            const child = spawn(this.cscript, args, { windowsHide: true });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => { stdout += data.toString('utf8'); });
            child.stderr.on('data', (data) => { stderr += data.toString('utf8'); });

            child.on('error', (err) => {
                reject(new Error(`Spawn Error: ${err.message}`));
            });

            child.on('close', (code) => {
                if (stderr.trim()) {
                    try {
                        const errObj = JSON.parse(stderr);
                        return reject(new Error(errObj.message || stderr));
                    } catch (e) {
                        return reject(new Error(stderr));
                    }
                }

                if (stdout.trim()) {
                    try {
                        const result = JSON.parse(stdout);
                        return resolve(result);
                    } catch (e) {
                        // If it's not JSON but code is 0, it might be a successful execute with no return
                        if (code === 0) return resolve([]);
                        return reject(new Error(`Parse Error: ${stdout}`));
                    }
                }

                resolve([]);
            });

            // Listen for error events on child.stdin specifically to prevent fatal EPIPE crashes
            child.stdin.on('error', (err) => {
                if (err.code !== 'EPIPE' && err.code !== 'EOF') {
                    console.error(`[DB-STDIN] Error: ${err.message}`);
                }
                // We don't necessarily reject here because child.on('close') will handle it.
            });

            // CRITICAL: Writing to stdin and closing it immediately is the most stable way for cscript
            try {
                if (child.stdin.writable) {
                    child.stdin.write(params);
                    child.stdin.end();
                } else {
                    reject(new Error('Child stdin not writable'));
                }
            } catch (err) {
                if (err.code !== 'EPIPE' && err.code !== 'EOF') {
                    reject(new Error(`Write Error: ${err.message}`));
                }
            }
        });
    }

    async query(sql) { return this.exec('query', sql); }
    async execute(sql) { return this.exec('execute', sql); }
}

const connection = new RobustADODB(dbPath);

// Initialize database if it doesn't exist
if (!fs.existsSync(dbPath)) {
    console.log('[DB] MS Access database not found, creating new one...');
    const vbsPath = path.join(__dirname, '..', 'create_mdb.vbs');
    const vbsScript = `
        On Error Resume Next
        Dim fso, catalog, connStr
        Set fso = CreateObject("Scripting.FileSystemObject")
        If Not fso.FileExists("${dbPath.replace(/\\/g, '\\\\')}") Then
            Set catalog = CreateObject("ADOX.Catalog")
            connStr = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=${dbPath.replace(/\\/g, '\\\\')};"
            catalog.Create connStr
        End If
        WScript.Quit 0
    `;
    fs.writeFileSync(vbsPath, vbsScript, 'utf8');

    try {
        const isX64 = process.arch === 'x64' || process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
        const cscriptDir = isX64 ? 'SysWOW64' : 'System32';
        const syswowCscript = path.join(process.env.windir || 'C:\\Windows', cscriptDir, 'cscript.exe');
        if (fs.existsSync(syswowCscript)) {
            execSync(`"${syswowCscript}" //nologo "${vbsPath}"`);
        } else {
            execSync(`cscript.exe //nologo "${vbsPath}"`);
        }
        console.log('[DB] MS Access database successfully created.');
    } catch (err) {
        console.error('[DB] Failed to create MS Access DB via VBScript:', err.message);
    }

    if (fs.existsSync(vbsPath)) {
        fs.unlinkSync(vbsPath);
    }
}

// --- Optimization: In-Memory Caching ---
class CacheManager {
    constructor() { this.store = new Map(); }
    set(key, val, ttlSeconds) { this.store.set(key, { val, expiry: Date.now() + (ttlSeconds * 1000) }); }
    get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) { this.store.delete(key); return null; }
        return item.val;
    }
    clear(pattern) {
        if (!pattern) { this.store.clear(); return; }
        for (const key of this.store.keys()) {
            if (key.includes(pattern)) this.store.delete(key);
        }
    }
}
const globalCache = new CacheManager();

async function initializeTables() {
    try {
        const tableQueries = [
            `CREATE TABLE telemetry_logs (
                id AUTOINCREMENT PRIMARY KEY,
                timestamp_log DATETIME DEFAULT NOW(),
                farm_id INTEGER,
                crop_type TEXT(50),
                satellite_lat DOUBLE,
                satellite_lon DOUBLE,
                satellite_distance_km DOUBLE,
                satellite_velocity_kms DOUBLE,
                temp1 DOUBLE,
                temp2 DOUBLE,
                batt_voltage DOUBLE,
                current_amps DOUBLE,
                solar_power_w DOUBLE,
                gyro_x DOUBLE,
                gyro_y DOUBLE,
                gyro_z DOUBLE,
                soil_moisture DOUBLE,
                soil_temp DOUBLE,
                ldr_sensor INTEGER,
                humidity DOUBLE,
                ultrasonic_dist DOUBLE,
                integrity_check YESNO
            )`,
            `CREATE TABLE ai_predictions (
                id AUTOINCREMENT PRIMARY KEY,
                timestamp_log DATETIME DEFAULT NOW(),
                farm_id INTEGER,
                model_name TEXT(100),
                input_features MEMO,
                predicted_value DOUBLE,
                confidence_score DOUBLE,
                prediction_label TEXT(100),
                actual_value DOUBLE,
                error_delta DOUBLE
            )`,
            `CREATE TABLE anomaly_events (
                id AUTOINCREMENT PRIMARY KEY,
                timestamp_log DATETIME DEFAULT NOW(),
                severity TEXT(20),
                farm_id INTEGER,
                sensor_id TEXT(100),
                source_sensor TEXT(100),
                description MEMO,
                threat_score DOUBLE,
                system_state TEXT(20),
                resolved YESNO,
                resolved_at DATETIME
            )`,
            `CREATE TABLE mission_sessions (
                id AUTOINCREMENT PRIMARY KEY,
                session_start DATETIME DEFAULT NOW(),
                session_end DATETIME,
                operator_name TEXT(100),
                total_packets_received INTEGER,
                total_anomalies INTEGER,
                session_notes MEMO
            )`,
            `CREATE TABLE model_training_snapshots (
                id AUTOINCREMENT PRIMARY KEY,
                timestamp_log DATETIME DEFAULT NOW(),
                model_name TEXT(100),
                epoch_count INTEGER,
                training_loss DOUBLE,
                validation_loss DOUBLE,
                accuracy DOUBLE,
                model_weights_json MEMO
            )`
        ];

        for (const query of tableQueries) {
            try {
                await connection.execute(query);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    console.error(`[DB] Table creation failed: ${query.split('(')[0]} -> ${e.message}`);
                }
            }
        }

        const alterQueries = [
            `ALTER TABLE telemetry_logs ADD COLUMN farm_id INTEGER`,
            `ALTER TABLE telemetry_logs ADD COLUMN crop_type TEXT(50)`,
            `ALTER TABLE ai_predictions ADD COLUMN farm_id INTEGER`,
            `ALTER TABLE anomaly_events ADD COLUMN farm_id INTEGER`,
            `ALTER TABLE anomaly_events ADD COLUMN sensor_id TEXT(100)`,
            `ALTER TABLE telemetry_logs ADD COLUMN humidity DOUBLE`,
            `ALTER TABLE telemetry_logs ADD COLUMN ultrasonic_dist DOUBLE`
        ];
        for (const aq of alterQueries) {
            try {
                await connection.execute(aq);
            } catch (e) {
                // Ignore errors if columns already exist
                if (!e.message.includes('already exists') && !e.message.includes('Duplicate column')) {
                    console.error(`[DB] Column alteration failed: ${aq} -> ${e.message}`);
                }
            }
        }

        const indexQueries = [
            `CREATE INDEX idx_telemetry_ts ON telemetry_logs (timestamp_log DESC)`,
            `CREATE INDEX idx_telemetry_farm ON telemetry_logs (farm_id)`,
            `CREATE INDEX idx_telemetry_crop ON telemetry_logs (crop_type)`,
            `CREATE INDEX idx_anomaly_ts ON anomaly_events (timestamp_log DESC)`,
            `CREATE INDEX idx_anomaly_sensor ON anomaly_events (sensor_id)`,
            `CREATE INDEX idx_predict_ts ON ai_predictions (timestamp_log DESC)`,
            `CREATE INDEX idx_predict_farm ON ai_predictions (farm_id)`
        ];
        for (const query of indexQueries) {
            try {
                await connection.execute(query);
            } catch (e) {
                if (!e.message.includes('already exists') && !e.message.includes('already has an index')) {
                    console.error(`[DB] Index creation failed: ${query.split(' ')[2]} -> ${e.message}`);
                }
            }
        }

        // Schema Validation: Check if core tables exist
        try {
            const tables = ['telemetry_logs', 'ai_predictions', 'anomaly_events'];
            for (const table of tables) {
                await connection.query(`SELECT TOP 1 * FROM ${table}`);
            }
            console.log('[DB] MS Access tables verified and indexed effectively.');
        } catch (vErr) {
            console.error('[DB] Schema Verification FAILED:', vErr.message);
        }
    } catch (e) {
        console.error('[DB] Init Error:', e.message || e);
    }
}

// Background initialization to avoid blocking the main thread
setTimeout(() => {
    initializeTables().then(async () => {
        console.log('[DB] Initialization complete in background.');
        try {
            // Initialize totalTelemetryLogged from actual DB count for adaptive throttling
            totalTelemetryLogged = await module.exports.getDbRecordCount();
            console.log(`[DB] Resuming with ${totalTelemetryLogged} records. Adaptive throttling active.`);
        } catch (e) {
            console.error('[DB] Initial count error:', e.message);
        }
    });
}, 5000);

/**
 * SECURE SANITIZATION ENGINE
 * Prevents SQL Injection while handling NULLs gracefully for MS Access Jet Engine.
 */
const sanitize = (val) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') {
        if (!isFinite(val)) return 'NULL';
        return val;
    }
    // Deep sanitization: Strip null bytes, semicolons, and escape single quotes
    const strVal = String(val)
        .replace(/\x00/g, "")
        .replace(/;/g, "")
        .trim();
    return `'${strVal.replace(/'/g, "''")}'`;
};

const sanitizeNum = (val) => {
    if (val === null || val === undefined) return 'NULL';
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return 'NULL';
    return num;
};

// --- Performance: Write-Batching for High-Frequency Telemetry ---
let telemetryBatch = [];
const BATCH_SIZE_LIMIT = 5; // Process 5 records in one cscript spawn to save CPU
const BATCH_TIMEOUT_MS = 2000;
let batchTimer = null;

let isProcessingDb = false;
const dbQueue = [];
let lastTelemetryLogTime = 0;
let totalTelemetryLogged = 0;

// Adaptive interval: fast writes (2s) until 60 records are in DB, then slow (5s)
// This ensures the AI model can train on real sensor data ASAP
function getTelemetryInterval() {
    return totalTelemetryLogged < config.database.throttling.threshold_records ?
        config.database.throttling.initial_interval_ms :
        config.database.throttling.standard_interval_ms;
}

async function processBatch() {
    if (telemetryBatch.length === 0) return;
    const batch = [...telemetryBatch];
    telemetryBatch = [];
    batchTimer = null;

    try {
        for (const sql of batch) {
            await safeExecute(sql);
            console.log('[DB] Batch Executed OK:', sql);
        }
    } catch (e) {
        console.error('[DB] Batch Process Error:', e.message);
    }
}

async function processDbQueue() {
    if (isProcessingDb || dbQueue.length === 0) return;
    isProcessingDb = true;

    const task = dbQueue.shift();
    try {
        const res = await connection[task.type](task.sql);
        task.resolve(res);
    } catch (e) {
        task.reject(e);
    } finally {
        isProcessingDb = false;
        setTimeout(processDbQueue, 20);
    }
}

function safeExecute(sql) { return new Promise((resolve, reject) => { dbQueue.push({ type: 'execute', sql, resolve, reject }); processDbQueue(); }); }
function safeQuery(sql) { return new Promise((resolve, reject) => { dbQueue.push({ type: 'query', sql, resolve, reject }); processDbQueue(); }); }

let isResettingDb = false;

module.exports = {
    logTelemetry: async (payload) => {
        if (isResettingDb) return;

        try {
            const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const sat = data.satellite || {};
            const sys = data.sys || sat.sys || {};
            const esp32 = data.esp32 || {};

            const values = [
                sanitizeNum(data.farm_id) || 1,
                sanitize(data.crop_type || 'Wheat'),
                sanitizeNum(sat.latitude || sat.lat),
                sanitizeNum(sat.longitude || sat.lon),
                sanitizeNum(sat.distance || sat.distance_km),
                sanitizeNum(sat.velocity || sat.velocity_kms),
                sanitizeNum(sys.temp1 || sat.temp1),
                sanitizeNum(sys.temp2 || sat.temp2),
                sanitizeNum(sys.battv || sat.batt_voltage),
                sanitizeNum(sys.current || sat.current_amps),
                sanitizeNum(sys.solarp || sat.solar_power_w),
                sanitizeNum(sys.gyrox || sat.gyro_x),
                sanitizeNum(sys.gyroy || sat.gyro_y),
                sanitizeNum(sys.gyroz || sat.gyro_z),
                sanitizeNum(esp32.soilMoisture || data.environment?.soil_moisture),
                sanitizeNum(esp32.soilTemp || data.environment?.soil_temp),
                sanitizeNum(esp32.ldrSensor || data.environment?.ldr_sensor),
                sanitizeNum(esp32.humidity || data.environment?.humidity),
                sanitizeNum(esp32.ultrasonic || data.environment?.ultrasonic),
                (data.integrity_check !== false && (sat.latitude || Object.keys(sat).length > 0)) ? -1 : 0
            ];
            
            const sql = `INSERT INTO telemetry_logs (farm_id, crop_type, satellite_lat, satellite_lon, satellite_distance_km, satellite_velocity_kms, temp1, temp2, batt_voltage, current_amps, solar_power_w, gyro_x, gyro_y, gyro_z, soil_moisture, soil_temp, ldr_sensor, humidity, ultrasonic_dist, integrity_check) VALUES (${values.join(', ')})`;

            // Push to batch instead of direct execute to save massive CPU on cscript spawning
            telemetryBatch.push(sql);

            if (telemetryBatch.length >= BATCH_SIZE_LIMIT) {
                if (batchTimer) clearTimeout(batchTimer);
                processBatch();
            } else if (!batchTimer) {
                batchTimer = setTimeout(processBatch, BATCH_TIMEOUT_MS);
            }

            totalTelemetryLogged++;
            globalCache.clear('recentTelemetry');
            globalCache.clear('db_record_count');
        } catch (e) {
            console.error('[DB] Error queuing telemetry:', e.message);
        }
    },

    logPrediction: async (modelName, inputs, prediction, confidence, label, actualValue = null) => {
        try {
            const inputsStr = typeof inputs === 'string' ? inputs : JSON.stringify(inputs);
            let errorDelta = 'NULL';
            let formattedActual = 'NULL';
            if (actualValue !== null && actualValue !== undefined) {
                formattedActual = sanitizeNum(actualValue);
                if (prediction !== null && prediction !== undefined) errorDelta = sanitizeNum(Math.abs(prediction - actualValue));
            }
            const sql = `INSERT INTO ai_predictions (farm_id, model_name, input_features, predicted_value, confidence_score, prediction_label, actual_value, error_delta) VALUES (1, ${sanitize(modelName)}, ${sanitize(inputsStr)}, ${sanitizeNum(prediction)}, ${sanitizeNum(confidence)}, ${sanitize(label)}, ${formattedActual}, ${errorDelta})`;
            await safeExecute(sql);
            globalCache.clear();
        } catch (e) {
            console.error('[DB] Error logging AI prediction:', e.message);
        }
    },

    logAnomaly: async (severity, sensor, description, threatScore, systemState) => {
        try {
            const sql = `INSERT INTO anomaly_events (severity, source_sensor, description, threat_score, system_state, resolved) VALUES (${sanitize(severity)}, ${sanitize(sensor)}, ${sanitize(description)}, ${sanitizeNum(threatScore)}, ${sanitize(systemState)}, 0)`;
            await safeExecute(sql);
            globalCache.clear();
        } catch (e) {
            console.error('[DB] Error logging anomaly event:', e.message);
        }
    },

    startSession: async (operatorName) => {
        try {
            const op = operatorName || 'Ground Control 1';
            await safeExecute(`INSERT INTO mission_sessions (operator_name, total_packets_received, total_anomalies) VALUES (${sanitize(op)}, 0, 0)`);
            globalCache.clear();
            return Date.now();
        } catch (e) {
            console.error('[DB] Error starting mission session:', e.message);
            return null;
        }
    },

    endSession: async (sessionId, stats) => {
        try {
            if (!sessionId) return;
            const pkts = sanitizeNum(stats ? stats.packets : 0);
            const anoms = sanitizeNum(stats ? stats.anomalies : 0);
            const sql = `UPDATE mission_sessions SET session_end = NOW(), total_packets_received = ${pkts}, total_anomalies = ${anoms} WHERE session_end IS NULL`;
            await safeExecute(sql);
            globalCache.clear();
        } catch (e) {
            console.error('[DB] Error ending mission session:', e.message);
        }
    },

    saveModelSnapshot: async (modelName, epochCount, loss, valLoss, accuracy, weightsJson) => {
        try {
            const weights = typeof weightsJson === 'string' ? weightsJson : JSON.stringify(weightsJson);
            const sql = `INSERT INTO model_training_snapshots (model_name, epoch_count, training_loss, validation_loss, accuracy, model_weights_json) VALUES (${sanitize(modelName)}, ${sanitizeNum(epochCount)}, ${sanitizeNum(loss)}, ${sanitizeNum(valLoss)}, ${sanitizeNum(accuracy)}, ${sanitize(weights)})`;
            await safeExecute(sql);
            globalCache.clear();
        } catch (e) {
            console.error('[DB] Error saving model snapshot:', e.message);
        }
    },

    getRecentTelemetry: async (limitRows) => {
        try {
            const limit = sanitizeNum(limitRows) || 100;
            const cacheKey = `recentTelemetry_${limit}`;
            const cached = globalCache.get(cacheKey);
            if (cached) return cached;
            // Return ALL columns needed by the AI feature-extraction pipeline
            const sql = `SELECT TOP ${limit} id, timestamp_log, farm_id, crop_type,
                satellite_lat, satellite_lon, satellite_distance_km, satellite_velocity_kms,
                temp1, temp2, batt_voltage, current_amps, solar_power_w,
                gyro_x, gyro_y, gyro_z, soil_moisture, soil_temp, ldr_sensor
                FROM telemetry_logs ORDER BY id DESC`;
            const results = await safeQuery(sql);
            // Reverse so data is chronological for sequence training
            const sorted = Array.isArray(results) ? results.reverse() : [];
            globalCache.set(cacheKey, sorted, 30); // Cache 30s only — data grows fast
            return sorted;
        } catch (e) {
            console.error('[DB] Error getting recent telemetry:', e.message);
            return [];
        }
    },

    getDbRecordCount: async () => {
        try {
            const cacheKey = 'db_record_count';
            const cached = globalCache.get(cacheKey);
            if (cached !== null && cached !== undefined) return Number(cached);

            const sql = `SELECT COUNT(*) AS total FROM telemetry_logs`;
            const result = await safeQuery(sql);
            // Robust extraction: Handle nulls, empty results, or different key names mapping (cnt, CNT, Expr1000, total)
            const firstRow = result && result[0] ? result[0] : null;
            const count = firstRow ? (Number(firstRow.total) || Number(firstRow.TOTAL) || Number(Object.values(firstRow)[0]) || 0) : 0;

            globalCache.set(cacheKey, count, 15); // Cache for 15s to save CPU
            return count;
        } catch (e) {
            return 0;
        }
    },

    getAnomalyHistory: async (days) => {
        try {
            const d = sanitizeNum(days) || 7;
            const cacheKey = `anomaly_${d}`;
            const cached = globalCache.get(cacheKey);
            if (cached) return cached;
            const sql = `SELECT id, timestamp_log, severity, farm_id, sensor_id, description, threat_score FROM anomaly_events WHERE timestamp_log >= DateAdd('d', -${d}, NOW()) ORDER BY timestamp_log DESC`;
            const results = await safeQuery(sql);
            globalCache.set(cacheKey, results, 300);
            return results;
        } catch (e) {
            console.error('[DB] Error getting anomaly history:', e.message);
            return [];
        }
    },

    resetDatabase: async () => {
        if (isResettingDb) return { success: false, error: 'Reset already in progress.' };
        isResettingDb = true;
        try {
            console.log('[DB] Executing FULL DATABASE RESET. Clearing all tables and resetting AutoIncrement keys...');
            const tables = ['telemetry_logs', 'ai_predictions', 'anomaly_events', 'mission_sessions', 'model_training_snapshots'];
            for (const table of tables) {
                try {
                    await safeExecute(`DELETE FROM ${table}`);
                    await safeExecute(`ALTER TABLE ${table} ALTER COLUMN id COUNTER(1,1)`);
                } catch (err) {
                    console.error(`[DB] Warning: Failed to reset table ${table}:`, err.message);
                }
            }
            globalCache.clear();
            console.log('[DB] Database Reset Complete.');
            return { success: true };
        } catch (e) {
            console.error('[DB] Error performing database reset:', e.message);
            return { success: false, error: e.message };
        } finally {
            isResettingDb = false;
        }
    }
};
