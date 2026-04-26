process.noDeprecation = true;
const electronModule = require('electron');
const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, dialog } = electronModule;
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const http = require('http');

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// Cluster logic removed

// Deprecation suppressed at top of file

const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Robust Cache Cleanup and GPU Stability for Windows (especially AMD systems)
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-direct-composition'); // Fixes AMD VideoProcessor errors
app.commandLine.appendSwitch('disable-accelerated-video-decode'); // Prevents D3D11 device removal during high load
app.commandLine.appendSwitch('disable-gpu-memory-buffer-video-frames'); // Stabilizes AMD buffers
app.commandLine.appendSwitch('disable-features', 'D3D11VideoDecoder'); // Kills the specific failing extension
app.commandLine.appendSwitch('limit-fps', config.hardware.fps_cap.toString()); // EMERGENCY CPU SAVER
app.commandLine.appendSwitch('disable-restore-session-state'); // Prevents Infinite Reload Loop on Startup
app.commandLine.appendSwitch('enable-webgl2-compute-context');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// --- Optimized Logging (Anti-Clogging & Pipe-Broken Protection) ---
const originalLog = console.log;
const originalError = console.error;

/**
 * Robust wrapper to intercept synchronous console crashes due to EPIPE/EOF in Windows.
 */
function safeConsole(originalFn, streamName) {
  const stream = process[streamName];
  return function (...args) {
    try {
      if (stream && stream.writable && !stream.destroyed) {
        originalFn.apply(console, [`[${streamName.toUpperCase().slice(-3)}]`, ...args]);
      }
    } catch (err) {
      // Swallowing EPIPE/EOF to prevent fatal crashes
    }
  };
}

console.log = safeConsole(originalLog, 'stdout');
console.error = safeConsole(originalError, 'stderr');

// Global event handlers to catch errors emitted directly by the streams (prevents uncaughtException)
if (process.stdout) process.stdout.on('error', (err) => { if (err.code === 'EPIPE' || err.code === 'EOF') return; });
if (process.stderr) process.stderr.on('error', (err) => { if (err.code === 'EPIPE' || err.code === 'EOF') return; });

// --- MISSION CRITICAL: GLOBAL STABILITY HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err.stack || err);
  // Do not exit, keep the mission alive. Log to a potential crash file if needed.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Problem 2 Fix: Child Process Management ---
const { spawn, execSync } = require('child_process');
let aiProcess = null;
const AI_SERVICE_URL = config.ai_service.url;
let aiRestartCount = 0;

function findPython3() {
  const cmds = process.platform === 'win32' ? ['python', 'py -3', 'python3'] : ['python3', 'python'];
  for (const cmd of cmds) {
    try {
      const out = execSync(`${cmd} -c "import sys; print(sys.version_info.major)"`, { encoding: 'utf8', stdio: 'pipe' });
      if (out.trim() === '3') return cmd;
    } catch (e) {}
  }
  return null;
}

function isPythonInstalled() {
  return findPython3() !== null;
}

let isStartingAI = false;
function startAIService() {
  if (aiProcess || isStartingAI) return;
  isStartingAI = true;

  console.log('--- ORBIT-ASSISTANT DIAGNOSTICS ---');
  console.log(`[DB] MS Access Link: ${dbMgr ? 'INITIALIZED' : 'FAILED'}`);
  console.log(`[MQTT] Remote Stream: ${mqttClient ? 'READY' : 'OFFLINE'}`);
  console.log(`[SERIAL] Hardware Link: ${serialClient ? 'READY' : 'OFFLINE'}`);

  const pyCmd = findPython3();
  console.log(`[AI] Neural Core (Python 3): ${pyCmd ? 'DETECTED' : 'MISSING'}`);
  console.log('------------------------------------');

  if (!pyCmd) {
    console.error('[MAIN] [AI] Python 3 not found in system PATH. Advanced Neural Core features will be disabled.');
    isStartingAI = false;
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ai-status-update', { status: 'MISSING_PYTHON' });
    }, 5000);
    return;
  }

  const parts = pyCmd.split(' ');
  const executable = parts[0];
  const pyArgs = [...parts.slice(1)];

  let scriptPath = path.join(__dirname, 'ai_service', 'app.py');
  if (scriptPath.includes('app.asar')) {
    scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
  }

  if (!fs.existsSync(scriptPath)) {
    console.error(`[MAIN] [AI] Missing script at ${scriptPath}. Check installation.`);
    isStartingAI = false;
    return;
  }

  aiProcess = spawn(executable, [...pyArgs, scriptPath], {
    stdio: 'pipe',
    windowsHide: true
  });

  aiProcess.stdout.on('data', (data) => console.log(`[AI-STDOUT] ${data.toString().trim()}`));
  aiProcess.stderr.on('data', (data) => {
    const errStr = data.toString();
    if (errStr.includes('Error') || errStr.includes('Exception')) {
      console.error(`[AI-STDERR] ${errStr.trim()}`);
    }
  });

  aiProcess.on('spawn', () => { isStartingAI = false; });
  aiProcess.on('error', () => { isStartingAI = false; });

  aiProcess.on('close', (code) => {
    aiProcess = null;
    isStartingAI = false;
    if (!app.isQuitting && aiRestartCount < 5) {
      aiRestartCount++;
      const delay = 2000 * aiRestartCount;
      setTimeout(startAIService, delay);
    }
  });
}

function stopAIService() {
  if (aiProcess) {
    try {
      console.log(`[MAIN] Terminating AI Process (PID: ${aiProcess.pid})...`);
      // Cleanest way: Send a shutdown signal to the REST endpoint
      fetch(`${AI_SERVICE_URL}/shutdown`, { method: 'POST' }).catch(() => { });

      // Fallback robust kill in mostly-synchronous situations or if unresponsive
      const pid = aiProcess.pid;
      if (process.platform === 'win32') {
        const { spawnSync } = require('child_process');
        spawnSync('taskkill', ['/pid', pid, '/f', '/t']);
      } else {
        process.kill(pid, 'SIGKILL');
      }
    } catch (e) {
      console.error('[MAIN] Failed to kill AI process:', e.message);
    }
    aiProcess = null;
  }
}

// Security: Enable Content Security Policy (CSP) to mitigate XSS
app.on('web-contents-created', (event, contents) => {
  contents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:5005 http://127.0.0.1:5000 ws://localhost:1883 data: blob:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; " +
          "font-src 'self' https://fonts.gstatic.com; " +
          "connect-src 'self' http://127.0.0.1:5005 http://127.0.0.1:5000 ws://localhost:1883 mqtt://localhost:1883 https://en.wikipedia.org https://*.wikipedia.org https://*.thingsboard.cloud https://demo.thingsboard.io; " +
          "img-src 'self' data: https: https://unpkg.com https://*.wikipedia.org;"
        ]
      }
    });
  });
});

let mainWindow;
let terminalWindow;
let tray;

// Boot up background services — wrapped in try/catch so native module
// failures (e.g. sqlite3 ABI mismatch) don't crash the whole app.
// --- Service Initialization (Locked-Handle Prevention) ---
let dbMgr = null;
try {
  dbMgr = require('./services/database-mgr');
} catch (e) {
  console.error('[DB-Init] FAILED:', e.message);
}

let thingsboardConnector = null;
try {
  thingsboardConnector = require('./services/thingsboard-connector');
} catch (e) {
  console.error('[ThingsBoard-Init] FAILED:', e.message);
}

let mqttClient = null;
try {
  mqttClient = require('./services/mqtt-client');
} catch (e) {
  console.error('[MQTT-Init] FAILED:', e.message);
}

let serialClient = null;
try {
  serialClient = require('./services/serial-client');
} catch (e) {
  console.error('[SERIAL-Init] FAILED:', e.message);
}

let lastMoistureAlertTime = 0;
let isPumpActive = false;

function broadcastTelemetry(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('telemetry-update', data);
  }
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.webContents.send('telemetry-update', data);
  }

  // --- AUTOMATION LOGIC: Process ESP32 data in real-time ---
  if (data && data.esp32) {
    const moisture = data.esp32.soilMoisture || data.esp32.soil_moisture;

    // Threshold Checking & Automated Notifications
    if (moisture < 30.0) { // Critical low moisture
      const now = Date.now();
      // Debounce: Only alert once every 60 seconds
      if (now - lastMoistureAlertTime > 60000) {
        lastMoistureAlertTime = now;

        // Trigger OS Notification natively integrated in main.js
        new Notification({
          title: 'CRITICAL: Low Soil Moisture',
          body: `Moisture level dropped to ${moisture?.toFixed?.(1) || '0.0'}%. Automated watering sequence initiated.`,
          icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
        }).show();

        // Database Logging (Custom Anomaly Logging)
        if (dbMgr && dbMgr.logAnomaly) {
          dbMgr.logAnomaly('High', 'SOIL_MOISTURE', 'Soil moisture dropped below acceptable 30% threshold.', 85, 'WARNING');
        }
      }

      // Trigger output back to Hardware (Simulation logic)
      if (!isPumpActive) {
        isPumpActive = true;
        console.log(`[AUTOMATION] Critical Moisture (${moisture.toFixed(1)}%). Water pump set to: ON`);
      }
    } else if (moisture >= 40.0 && isPumpActive) {
      // Stop watering if healthy
      isPumpActive = false;
    }

    // --- CLOUD SYNC: Push to ThingsBoard IoT platform ---
    if (thingsboardConnector) {
      thingsboardConnector.uploadTelemetry(data);
    }
  }
}

function broadcastRawData(raw) {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    terminalWindow.webContents.send('raw-data-update', raw);
  }
}

// Setup Event Listeners
mqttClient?.on('telemetry', broadcastTelemetry);
serialClient?.on('telemetry', broadcastTelemetry);
serialClient?.on('raw', broadcastRawData);

serialClient?.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hardware-status-update', status);
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920, height: 1080,
    minWidth: 1280, minHeight: 720,
    show: false,
    backgroundColor: '#09090b',
    icon: path.join(__dirname, 'assets', 'icons', 'icon.png'),
    webPreferences: {
      partition: 'persist:mission_control',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html')).catch(console.error);
  mainWindow.autoHideMenuBar = true; // Hide default windows menu for Mission Control feel, but allow ALT key access

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] Level ${level}: ${message} (${sourceId}:${line})`);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    // If we are quitting, let the window close completely.
    // We removed preventDefault here since there's no tray to restore it from.
  });
}

function createTerminalWindow() {
  if (terminalWindow) {
    terminalWindow.focus();
    return;
  }

  terminalWindow = new BrowserWindow({
    width: 900, height: 600,
    backgroundColor: '#050510',
    title: 'Live Receiving Terminal',
    frame: false, // Frameless for a hardware terminal feel
    webPreferences: {
      partition: 'persist:mission_control',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  terminalWindow.loadFile(path.join(__dirname, 'src', 'terminal.html'));
  terminalWindow.on('closed', () => {
    terminalWindow = null;
  });
}

app.whenReady().then(() => {
  app.on('before-quit', () => { app.isQuitting = true; });

  app.on('will-quit', () => {
    stopAIService();
    mqttClient?.stop?.();
    serialClient?.stop?.();
  });

  startAIService();
  createWindow();

  // Background Global AI Synchronization (Cloud -> Local Enhancement)
  setInterval(async () => {
    if (thingsboardConnector && config.thingsboard.cloud_prediction_enabled) {
      try {
        const update = await thingsboardConnector.downloadGlobalModelWeights();
        if (update && mainWindow) {
          mainWindow.webContents.send('ai-model-sync', update);
          console.log(`[CLOUD-AI] Global knowledge sync complete: v${update.version}`);
        }
      } catch (err) {
        // Silent fail on sync
      }
    }
  }, 45000); // Global intelligence sync every 45 seconds

  // IPC Handlers
  ipcMain.on('open-terminal', () => createTerminalWindow());
  ipcMain.on('open-sensor-verify', () => {
    const sv = new BrowserWindow({
      width: 1400, height: 820,
      backgroundColor: '#04050f',
      title: 'ESP32 Sensor Verification',
      frame: false,
      webPreferences: {
        partition: 'persist:mission_control',
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true
      }
    });
    sv.loadFile(path.join(__dirname, 'src', 'sensor-verify.html'));
  });
  ipcMain.handle('get-app-version', () => app.getVersion());
  
  ipcMain.on('update-cloud-code', (event, code) => {
    // Security: Validate token format before passing to service
    if (typeof code === 'string' && code.length > 5 && code.length < 128 && /^[A-Za-z0-9_-]+$/.test(code)) {
      if (thingsboardConnector && typeof thingsboardConnector.updateToken === 'function') {
        thingsboardConnector.updateToken(code);
      }
    } else {
      console.warn('[SECURITY] Denied malformed cloud access token update.');
    }
  });

  ipcMain.handle('ai-predict', async (event, { module, data }) => {
    // Security: Module whitelist verification
    const validModules = ['pest', 'yield', 'irrigation', 'soil', 'maps', 'advisory', 'climate', 'universal'];
    if (!validModules.includes(module)) {
      return { error: 'Invalid prediction module requested.' };
    }

    if (thingsboardConnector && config.thingsboard.cloud_prediction_enabled) {
      try {
        const cloudRes = await thingsboardConnector.predictCloud(module, data);
        return { ...cloudRes, cloud_active: true };
      } catch (err) {
        console.warn(`[PREDICT] Cloud Model Failed: ${err.message}. Falling back to Local Neural Core.`);
      }
    }

    // Phase 2: Fallback to Local System Model (Python Flask)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const response = await fetch(`${AI_SERVICE_URL}/predict/${module}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const localRes = await response.json();
      return { ...localRes, cloud_active: false, fallback: true };
    } catch (error) {
      return { error: 'Both Cloud and Local Models Unavailable', fallback: true };
    }
  });

  ipcMain.handle('ai-chat', async (event, query) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`${AI_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error("[MAIN] [AI-CHAT] ERROR:", error.message);
      if (!isPythonInstalled()) {
        return { response: "The Neural Core requires Python to be installed on this system. Please install Python 3 and restart ORBIT-X." };
      }
      return { response: "I'm having trouble connecting to the Neural Core. Please verify service status." };
    }
  });

  ipcMain.handle('ai-health', async () => {
    try {
      const response = await fetch(`${AI_SERVICE_URL}/health`);
      return await response.json();
    } catch (error) {
      return { status: 'offline' };
    }
  });

  // DB Proxies & Logging
  ipcMain.handle('get-recent-telemetry', async (e, limit) => dbMgr?.getRecentTelemetry?.(limit) || []);
  ipcMain.handle('get-anomaly-history', async (e, days) => dbMgr?.getAnomalyHistory?.(days) || []);
  ipcMain.handle('get-training-data', async (e, limit) => dbMgr?.getRecentTelemetry?.(limit) || []);
  ipcMain.handle('get-db-record-count', async () => dbMgr?.getDbRecordCount?.() || 0);
  ipcMain.handle('reset-database', async () => dbMgr?.resetDatabase?.());

  // Session Management
  ipcMain.handle('start-session', async (e, name) => dbMgr?.startSession?.(name));
  ipcMain.handle('end-session', async (e, data) => dbMgr?.endSession?.(data.id, data.stats));

  // Async Logging (No-wait)
  ipcMain.on('log-anomaly', (e, data) => dbMgr?.logAnomaly?.(data.severity, data.sensor, data.description, data.threatScore, data.systemState));
  ipcMain.on('log-prediction', (e, data) => {
    dbMgr?.logPrediction?.(
      data.model || data.modelName,
      data.inputs,
      data.prediction,
      data.confidence,
      data.label,
      data.actual || data.actualValue
    );
  });
  ipcMain.on('save-model-snapshot', (e, data) => dbMgr?.saveModelSnapshot?.(data.model, data.epochs, data.loss, data.valLoss, data.accuracy, data.weights));
  ipcMain.on('trigger-alert', (e, { title, body }) => {
    new Notification({ title, body, icon: path.join(__dirname, 'assets', 'icons', 'icon.png') }).show();
  });

  ipcMain.handle('get-hardware-status', () => {
    return { 
      status: serialClient?.hardwareStatus || 'simulated',
      lastKnownPort: serialClient?.lastConnectedPort || null
    };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
});

let gpuCrashCount = 0;
// Detect and log GPU crashes for hardware audit (especially on AMD/Intel unstable drivers)
app.on('gpu-process-crashed', (event, killed) => {
  gpuCrashCount++;
  console.error(`[MAIN] [GPU] Process crashed (${gpuCrashCount}/3). Killed: ${killed}.`);

  if (gpuCrashCount >= 3) {
    console.error("[MAIN] [GPU] FATAL: Too many GPU crashes. Persisting Software Mode for next launch.");
    
    // PERSISTENCE: Save flag to config.json so we can call disableHardwareAcceleration on next boot
    try {
      const liveConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!liveConfig.hardware) liveConfig.hardware = {};
      liveConfig.hardware.disable_acceleration = true;
      fs.writeFileSync(configPath, JSON.stringify(liveConfig, null, 2), 'utf8');
    } catch (e) {
      console.error('[MAIN] [GPU] Failed to save stability flag.');
    }

    if (mainWindow) {
      mainWindow.webContents.send('hardware-alarm', 'GPU_FAILURE_LOCKOUT');
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    app.quit();
  }
});
