// services/hardware-monitor.js
// AGRI LINK AI — Centralized Hardware Connectivity Engine
// Independently tracks physical ESP32 connectivity, data arrival, and communication methods.

const EventEmitter = require('events');

class HardwareMonitor extends EventEmitter {
  constructor() {
    super();
    this.serialClient = null;
    this.lastHardwareUpdateTime = null;
    this.lastError = null;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    // Default timeouts derived from firmware (500ms reporting interval)
    this.DELAYED_THRESHOLD_MS = 5000;    // 5 seconds without packets = DELAYED
    this.DISCONNECTED_THRESHOLD_MS = 15000; // 15 seconds without packets = DISCONNECTED

    try {
      this.serialClient = require('./serial-client');
      this._wireSerialEvents();
    } catch (e) {
      console.warn('[HardwareMonitor] serialClient unavailable:', e.message);
    }
  }

  _wireSerialEvents() {
    if (!this.serialClient) return;

    this.serialClient.on('telemetry', (payload) => {
      // Check if this payload came from a genuine physical port vs simulation
      if (this.serialClient.hardwareStatus === 'connected' && this.serialClient.lastConnectedPort) {
        this.lastHardwareUpdateTime = Date.now();
        this.isReconnecting = false;
        this.emit('hardware-packet', payload);
      }
    });

    this.serialClient.on('status', (st) => {
      if (st.status === 'connected') {
        this.lastHardwareUpdateTime = Date.now();
        this.isReconnecting = false;
        this.emit('hardware-online', st);
      } else if (st.status === 'reconnecting') {
        this.isReconnecting = true;
        this.reconnectAttempts++;
        this.emit('hardware-reconnecting', st);
      } else if (st.status === 'error') {
        this.lastError = st.message;
        this.emit('hardware-error', st);
      }
    });
  }

  /**
   * Determine exact hardware connectivity state:
   * ONLINE | DELAYED | DISCONNECTED | RECONNECTING | UNKNOWN
   */
  getHardwareState() {
    if (!this.serialClient) {
      return {
        state: 'UNKNOWN',
        connected: false,
        port: null,
        method: 'Serial / USB (Driver Unavailable)',
        lastUpdate: null,
        lastUpdateAgeSec: null,
        error: this.lastError
      };
    }

    const port = this.serialClient.lastConnectedPort;
    const isPortConnected = this.serialClient.hardwareStatus === 'connected';
    const lastDataTime = this.serialClient.lastDataTime || this.lastHardwareUpdateTime;
    const now = Date.now();

    // If port is not even connected
    if (!isPortConnected || !port) {
      if (this.isReconnecting || (this.serialClient.retryTimeout !== undefined && this.serialClient.retryTimeout !== null)) {
        return {
          state: 'RECONNECTING',
          connected: false,
          port: null,
          method: 'Serial / USB (COM Auto-Discovery)',
          lastUpdate: lastDataTime ? new Date(lastDataTime).toISOString() : null,
          lastUpdateAgeSec: lastDataTime ? Math.floor((now - lastDataTime) / 1000) : null,
          error: this.lastError || 'No physical ESP32 detected on serial ports'
        };
      }
      return {
        state: 'DISCONNECTED',
        connected: false,
        port: null,
        method: 'Serial / USB (No hardware device attached)',
        lastUpdate: lastDataTime ? new Date(lastDataTime).toISOString() : null,
        lastUpdateAgeSec: lastDataTime ? Math.floor((now - lastDataTime) / 1000) : null,
        error: this.lastError || 'ESP32 is unplugged or port closed'
      };
    }

    // Port is connected: verify that packets are actually arriving
    if (!lastDataTime) {
      return {
        state: 'RECONNECTING',
        connected: true,
        port: port,
        method: `Serial / USB (${port})`,
        lastUpdate: null,
        lastUpdateAgeSec: null,
        error: 'Port open; waiting for initial sensor frame'
      };
    }

    const elapsedMs = now - lastDataTime;
    const ageSec = Math.floor(elapsedMs / 1000);

    if (elapsedMs < this.DELAYED_THRESHOLD_MS) {
      return {
        state: 'ONLINE',
        connected: true,
        port: port,
        method: `Serial / USB (${port} @ 115200 baud)`,
        lastUpdate: new Date(lastDataTime).toISOString(),
        lastUpdateAgeSec: ageSec,
        error: null
      };
    } else if (elapsedMs < this.DISCONNECTED_THRESHOLD_MS) {
      return {
        state: 'DELAYED',
        connected: true,
        port: port,
        method: `Serial / USB (${port} @ 115200 baud)`,
        lastUpdate: new Date(lastDataTime).toISOString(),
        lastUpdateAgeSec: ageSec,
        error: `No packets received for ${ageSec}s`
      };
    } else {
      return {
        state: 'DISCONNECTED',
        connected: false,
        port: port,
        method: `Serial / USB (${port})`,
        lastUpdate: new Date(lastDataTime).toISOString(),
        lastUpdateAgeSec: ageSec,
        error: `Hardware timeout: silence for ${ageSec}s`
      };
    }
  }

  /**
   * Get latest live snapshot if available and physically fresh
   */
  getLiveSnapshot() {
    if (!this.serialClient || typeof this.serialClient.getLatestSnapshot !== 'function') {
      return null;
    }
    const snap = this.serialClient.getLatestSnapshot();
    if (snap && snap.data && snap.status === 'connected' && snap.isFresh) {
      return snap;
    }
    return null;
  }
}

const hardwareMonitorInstance = new HardwareMonitor();
module.exports = hardwareMonitorInstance;
