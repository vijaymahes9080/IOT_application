let mqtt;
try {
    mqtt = require('mqtt');
} catch (e) {
    console.warn("[MQTT] Module not found. Remote link disabled.");
}

const dbMgr = require('./database-mgr');
const EventEmitter = require('events');

class TelemetryEmitter extends EventEmitter { }
const emitter = new TelemetryEmitter();

const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

// Connect to secure broker (Local or Remote)
let client = null;
if (mqtt) {
    try {
        client = mqtt.connect(config.mqtt.broker, {
            connectTimeout: config.mqtt.timeout,
            reconnectPeriod: config.mqtt.reconnect_period
        });
    } catch (e) {
        console.error("[MQTT] Connection init failed:", e.message);
    }
}

let msgCounter = 0;

if (client) {
    client.on('connect', function () {
        try { console.log("[MQTT] Connected to Telemetry Stream"); } catch (e) { }
        client.subscribe(config.mqtt.topics.telemetry, function (err) {
            if (!err) {
                try { console.log("[MQTT] Subscribed to TITAN-1 Telemetry"); } catch (e) { }
            }
        });
    });

    client.on('message', function (topic, message) {
        try {
            const payload = message.toString();
            let data;

            try {
                data = JSON.parse(payload);
            } catch (e) {
                try { console.error("[MQTT] Invalid JSON payload:", e.message); } catch (e) { }
                return; // Drop invalid payloads completely
            }

            // Validate integrity checks securely
            // FIX: Be more lenient with custom sensor data (e.g. ESP32 AgriNodes)
            const isValid = !!(data && (data.satellite || data.esp32));
            if (!data.timestamp) data.timestamp = Date.now();
            data.integrity_check = isValid;

            // Send to Local DB Edge Storage
            dbMgr.logTelemetry(data);

            // Emit for the frontend
            if (isValid) {
                emitter.emit('telemetry', data);
            }
        } catch (e) {
            try { console.error("[MQTT] Processing error:", e.message); } catch (err) { }
        }
    });
}

/**
 * Publish AI Results for sub-millisecond latency (Rule 1)
 */
emitter.publishAIResults = (results) => {
    if (client && client.connected) {
        const topic = config.mqtt.topics.ai_results || 'satellite/titan-1/ai_results';
        client.publish(topic, JSON.stringify(results), { qos: 1 });
        return true;
    }
    return false;
};

emitter.stop = () => {
    if (client) {
        client.end();
    }
};

module.exports = emitter;
