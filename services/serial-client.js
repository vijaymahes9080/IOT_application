let SerialPort, ReadlineParser;
try {
    SerialPort = require('serialport').SerialPort;
    ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (e) {
    console.warn("[SERIAL] Native serialport module failed to load. Hardware link disabled. Simulation mode will be used.");
    setTimeout(() => {
        emitter.emit('status', { status: 'error', message: `Serial driver failed: ${e.message}. Hardware connection unavailable.` });
    }, 1000);
}
const dbMgr = require('./database-mgr');
const EventEmitter = require('events');

class SerialEmitter extends EventEmitter { }
const emitter = new SerialEmitter();
emitter.hardwareStatus = 'simulated';
emitter.lastConnectedPort = null;

let port = null;
let parser = null;

// Brute-force probe COM ports when list() returns empty (Windows driver timing issue)
async function probeCOMPorts() {
    if (process.platform !== 'win32') return null;
    console.log('[SERIAL] list() returned empty. Probing COM1–COM20 directly...');
    for (let i = 1; i <= 20; i++) {
        const comPath = `COM${i}`;
        try {
            const testPort = new SerialPort({ path: comPath, baudRate: 115200, autoOpen: false });
            const result = await new Promise((resolve) => {
                testPort.open((err) => {
                    if (!err) {
                        testPort.close();
                        resolve(comPath);
                    } else {
                        resolve(null);
                    }
                });
                setTimeout(() => resolve(null), 500);
            });
            if (result) {
                console.log(`[SERIAL] Probe found active port: ${result}`);
                return { path: result, friendlyName: result, manufacturer: 'Unknown' };
            }
        } catch(_) {}
    }
    return null;
}


async function findAndOpenPort() {
    let target = null;
    if (!SerialPort) {
        console.warn("[SERIAL] Skipping discovery: SerialPort module unavailable.");
        if (!simInterval) startSimulation(emitter);
        return;
    }

    // Clean up old port if it exists to prevent 'Access Denied' on reconnect
    if (port) {
        if (port.isOpen) {
            try { port.close(); } catch (e) { }
        }
        port.removeAllListeners();
        port = null;
    }
    if (parser) {
        parser.removeAllListeners();
        parser = null;
    }
    try {
        const ports = await SerialPort.list();
        console.log(`[SERIAL] Discovered ports: ${JSON.stringify(ports.map(p => ({ path: p.path, mfr: p.manufacturer, name: p.friendlyName })))}`);

        // Priority 1: Exact manufacturer match (most reliable)
        target = ports.find(p => {
            const mfr = (p.manufacturer || '').toLowerCase();
            const name = (p.friendlyName || '').toLowerCase();
            return (
                mfr.includes('silicon labs') ||
                mfr.includes('arduino') ||
                mfr.includes('espressif') ||
                mfr.includes('wch')        ||   // CH340 / CH341
                mfr.includes('wch.cn')     ||   // CH9102
                mfr.includes('qinheng')    ||   // CH340 alternative
                mfr.includes('ftdi')       ||   // FTDI USB-Serial
                mfr.includes('prolific')   ||   // PL2303
                mfr.includes('stm')        ||   // STM32
                mfr.includes('microchip')  ||
                name.includes('ch340')     ||
                name.includes('ch910')     ||   // CH9102
                name.includes('cp210')     ||   // CP2102 / CP2104
                name.includes('usb-serial')||   // Generic descriptors
                name.includes('usb serial')||
                name.includes('uart')      ||
                name.includes('arduino')   ||
                name.includes('esp32')     ||
                name.includes('esp8266')   ||
                mfr.includes('usb')        ||   // Generic USB manufacturer
                name.includes('usb')           // Generic USB name
            );
        });

        // Priority 2: Any COM port on Windows (fallback — include all ports)
        if (!target && ports.length > 0) {
            // Take the highest-numbered COM port (most likely to be USB device)
            const sorted = [...ports].sort((a, b) => {
                const na = parseInt((a.path || '').replace(/[^0-9]/g, ''), 10) || 0;
                const nb = parseInt((b.path || '').replace(/[^0-9]/g, ''), 10) || 0;
                return nb - na;
            });
            target = sorted[0];
            console.log(`[SERIAL] Fallback: taking highest COM port: ${target.path}`);
        }

        // Priority 3: list() returned empty — brute-force probe (Windows driver timing issue)
        if (!target) {
            target = await probeCOMPorts();
        }
    } catch (err) {
        console.error('[SERIAL] Discovery Error:', err.message);
    }

    if (!target) {
        console.log("[SERIAL] No hardware found on any port. Simulation mode active.");
        if (!simInterval) startSimulation(emitter);
        // Retry hardware discovery every 5 seconds (more aggressive)
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(findAndOpenPort, 5000);
        return;
    }

    try {
        console.log(`[SERIAL] Attempting to connect to: ${target.path} (${target.friendlyName || 'Unknown Device'})`);

        // Force close existing port object if it exists
        if (port) {
            try { 
                if (port.isOpen) port.close(); 
                port.removeAllListeners();
            } catch (e) { }
            port = null;
        }

        port = new SerialPort({
            path: target.path,
            baudRate: 115200,
            autoOpen: false // Open manually to catch errors better
        });

        // Use a more resilient parser that handles both \n and \r\n
        parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

        port.on('open', () => {
            console.log(`[SERIAL] ✅ PORT OPEN: ${target.path}`);
            if (simInterval) {
                clearInterval(simInterval);
                simInterval = null;
            }
            emitter.hardwareStatus = 'connected';
            emitter.lastConnectedPort = target.path;
            emitter.emit('status', { status: 'connected', port: target.path, device: target.friendlyName || target.path });
            startWatchdog();
        });

        port.on('error', (err) => {
            const isLocked = err.message.toLowerCase().includes('access denied');
            console.error('[SERIAL] Port Error:', err.message);
            
            if (isLocked) {
                console.warn(`[SERIAL] PORT ${target.path} IS LOCKED. Close other serial monitors (Arduino IDE, etc).`);
                emitter.emit('status', { status: 'error', message: `Port ${target.path} is BUSY/LOCKED. Please close other serial monitors.` });
            }

            stopWatchdog();
            emitter.hardwareStatus = 'simulated';
            emitter.lastConnectedPort = null;
            emitter.emit('status', { status: 'simulated' });
            if (!simInterval) startSimulation(emitter);
            
            if (retryTimeout) clearTimeout(retryTimeout);
            retryTimeout = setTimeout(findAndOpenPort, isLocked ? 15000 : 10000);
        });

        port.open((err) => {
            if (err) {
                // Handled by 'error' listener usually, but for some versions we catch here
                if (err.message.toLowerCase().includes('access denied')) {
                     emitter.emit('status', { status: 'error', message: `Port ${target.path} is BUSY. Close Arduino IDE!` });
                }
            }
        });

        let watchdogTimer = null;
        function startWatchdog() {
            stopWatchdog();
            watchdogTimer = setInterval(() => {
                const now = Date.now();
                if (lastDataTime && (now - lastDataTime > 15000)) { // 15s silence = failure
                    console.log("[SERIAL] Watchdog: No data received for 15s. Restarting port...");
                    emitter.stop();
                    findAndOpenPort();
                }
            }, 5000);
        }

        function stopWatchdog() {
            if (watchdogTimer) clearInterval(watchdogTimer);
            watchdogTimer = null;
        }

        let lastDataTime = Date.now();
        let buffer = {};
        let emitTimer = null;

        parser.on('data', (data) => {
            try {
                // Clean data: remove non-printable characters except space and common delimiters
                const cleanData = data.toString().replace(/[^\x20-\x7E]/g, '').trim();
                if (!cleanData) return;
                lastDataTime = Date.now(); 

                let dataUpdated = false;

                // 1. Line-by-line Standard Arduino/ESP32 format
                // Handles: "Temperature: 24.5", "Temp1=24.5", "TEMP1: 24.5", "Soil-M (%): 45.2"
                if (cleanData.includes(':') || cleanData.includes('=')) {
                    const separator = cleanData.includes(':') ? ':' : '=';
                    const parts = cleanData.split(separator);
                    if (parts.length >= 2) {
                        const rawKey = parts[0].trim().toLowerCase();
                        const val = parseFloat(parts.slice(1).join(separator).trim());
                        if (!isNaN(val)) {
                            // Map incoming labels to buffer keys
                            if (/temp.?2|t2|temperature2|ambienttemp/.test(rawKey)) buffer.temp2       = val;
                            else if (/soiltemp|soiltemperature/.test(rawKey))       buffer.temp1       = val;
                            else if (/temp.?1|t1|temp|temperature/.test(rawKey))    buffer.temp1       = val;
                            else if (/hum|humidity|rh|h1/.test(rawKey))             buffer.humidity    = val;
                            else if (/soil|moist|moisture|sm|s1/.test(rawKey))      buffer.soilMoisture= val;
                            else if (/ldr|light|l1|lux|photo/.test(rawKey))         buffer.ldrSensor   = val;
                            else if (/dist|ultrasonic|us|d1|cm|range/.test(rawKey)) buffer.ultrasonic  = val;
                            else if (/gyrox|gyro.?x|gx|accelx/.test(rawKey))       buffer.gyrox       = val;
                            else if (/gyroy|gyro.?y|gy|accely/.test(rawKey))        buffer.gyroy       = val;
                            else if (/gyroz|gyro.?z|gz|accelz/.test(rawKey))        buffer.gyroz       = val;
                            else if (/batt|volt|voltage|v1|vbat/.test(rawKey))      buffer.battv       = val;
                            else if (/curr|current|amps|amp|i1/.test(rawKey))       buffer.current     = val;
                            else if (/solar|solarp|power|watt|pw/.test(rawKey))     buffer.solarp      = val;
                            dataUpdated = true;
                        }
                    }
                }

                // 2. Compact inline format fallback (e.g. "T1:24.5 H:62.1 S:45" space-separated)
                const matches = cleanData.match(/([a-zA-Z0-9\-]{2,})[:\s=]+([-+]?[0-9]*\.?[0-9]+)/g);
                if (matches) {
                    matches.forEach(m => {
                        const p = m.match(/([a-zA-Z0-9\-]{2,})[:\s=]+([-+]?[0-9]*\.?[0-9]+)/);
                        if (!p) return;
                        const k = p[1].toLowerCase();
                        const v = parseFloat(p[2]);
                        if (/temp2|t2/.test(k))              buffer.temp2        = v;
                        else if (/temp1?|tmp/.test(k))       buffer.temp1        = v;
                        else if (/hum|rh/.test(k))           buffer.humidity     = v;
                        else if (/soil|moist|sm/.test(k))    buffer.soilMoisture = v;
                        else if (/ldr|light|lux/.test(k))    buffer.ldrSensor    = v;
                        else if (/dist|ultra|us/.test(k))    buffer.ultrasonic   = v;
                        else if (/gx|gyrx/.test(k))          buffer.gyrox        = v;
                        else if (/gy|gyry/.test(k))          buffer.gyroy        = v;
                        else if (/gz|gyrz/.test(k))          buffer.gyroz        = v;
                        else if (/batt|volt|vbat/.test(k))   buffer.battv        = v;
                        else if (/curr|amp/.test(k))         buffer.current      = v;
                        else if (/solar|solr|pw/.test(k))    buffer.solarp       = v;
                        dataUpdated = true;
                    });
                }

                // 3. Raw JSON format
                try {
                    const telemetry = JSON.parse(cleanData);
                    const e32 = telemetry.esp32 || telemetry.sensors || telemetry;
                    const pick = (...keys) => {
                        for (const k of keys) { if (e32[k] !== undefined) return e32[k]; }
                        return undefined;
                    };
                    const p_temp1 = pick('temp1', 'temperature1', 'temp', 'temperature', 'soilTemp');
                    const p_temp2 = pick('temp2', 'temperature2', 'ambientTemp');
                    if (p_temp1 !== undefined) buffer.temp1 = p_temp1;
                    if (p_temp2 !== undefined) buffer.temp2 = p_temp2;
                    if (pick('humidity','hum') !== undefined) buffer.humidity = pick('humidity','hum');
                    if (pick('soilMoisture','moisture','sm') !== undefined) buffer.soilMoisture = pick('soilMoisture','moisture','sm');
                    if (pick('ldrSensor','ldr','light') !== undefined) buffer.ldrSensor = pick('ldrSensor','ldr','light');
                    if (pick('dist','distance','ultrasonic') !== undefined) buffer.ultrasonic = pick('dist','distance','ultrasonic');
                    if (pick('battv','batt','volt') !== undefined) buffer.battv = pick('battv','batt','volt');
                    if (pick('current','curr','amp') !== undefined) buffer.current = pick('current','curr','amp');
                    if (pick('solarp','solar','power') !== undefined) buffer.solarp = pick('solarp','solar','power');
                    if (pick('gyrox','gyro_x','gx') !== undefined) buffer.gyrox = pick('gyrox','gyro_x','gx');
                    if (pick('gyroy','gyro_y','gy') !== undefined) buffer.gyroy = pick('gyroy','gyro_y','gy');
                    if (pick('gyroz','gyro_z','gz') !== undefined) buffer.gyroz = pick('gyroz','gyro_z','gz');
                    dataUpdated = true;
                } catch (e) { }

                // Flush buffer to the frontend (with 300ms throttle to collect multi-line packets)
                if (dataUpdated) {
                    if (!emitTimer) {
                        emitTimer = setTimeout(() => {
                            // Snapshot buffer before clearing
                            const snap = { ...buffer };
                            const standardized = {
                                satellite: {
                                    latitude:  snap.lat || 10.362,
                                    longitude: snap.lon || 77.969,
                                    distance:  snap.ultrasonic || 0,
                                    velocity:  snap.velocity || 0,
                                    sys: { ...snap } // ALL parsed keys go here for dashboard
                                },
                                esp32: {
                                    // Full sensor set — matches all telemetrySources ids in dashboard
                                    temp1:        snap.temp1,
                                    temp2:        snap.temp2,
                                    soilMoisture: snap.soilMoisture,
                                    soilTemp:     snap.temp1,
                                    humidity:     snap.humidity,
                                    ldrSensor:    snap.ldrSensor,
                                    ultrasonic:   snap.ultrasonic,
                                    battv:        snap.battv,
                                    current:      snap.current,
                                    solarp:       snap.solarp,
                                    gyrox:        snap.gyrox,
                                    gyroy:        snap.gyroy,
                                    gyroz:        snap.gyroz
                                },
                                timestamp: Date.now()
                            };

                            console.log(`[SERIAL] ✅ Data Emitted: ${JSON.stringify(snap)}`);
                            emitter.emit('raw', JSON.stringify(snap));
                            dbMgr.logTelemetry(standardized);
                            emitter.emit('telemetry', standardized);

                            buffer = {};
                            emitTimer = null;
                        }, 300);
                    }
                }
            } catch (err) { }
        });

        port.on('close', () => {
            console.log('[SERIAL] Port closed.');
            emitter.hardwareStatus = 'simulated';
            emitter.lastConnectedPort = null;
            emitter.emit('status', { status: 'simulated' });
            if (retryTimeout) clearTimeout(retryTimeout);
            retryTimeout = setTimeout(findAndOpenPort, 5000);
        });

    } catch (err) {
        console.error('[SERIAL] Init Error:', err.message);
        if (!simInterval) startSimulation(emitter);
    }
}

let retryTimeout = null;
let simInterval = null;
function startSimulation(emitter) {
    if (simInterval) return; // Already running
    emitter.hardwareStatus = 'simulated';
    emitter.emit('status', { status: 'simulated' });
    simInterval = setInterval(() => {
        const fakeData = {
            satellite: {
                latitude: 10.362 + (Math.random() - 0.5) * 0.01,
                longitude: 77.969 + (Math.random() - 0.5) * 0.01,
                distance: 395 + Math.random() * 10,
                velocity: 7.6 + Math.random() * 0.1,
                sys: {
                    temp1: 22 + Math.random() * 5,
                    temp2: 20 + Math.random() * 4,
                    battv: 14.1 + Math.random() * 0.5,
                    current: 2.5 + Math.random() * 1,
                    solarp: 85 + Math.random() * 20,
                    gyrox: (Math.random() - 0.5) * 0.1,
                    gyroy: (Math.random() - 0.5) * 0.1,
                    gyroz: (Math.random() - 0.5) * 0.1,
                    humidity: 55 + Math.random() * 10,
                    soilMoisture: 45 + Math.random() * 15,
                    ldrSensor: 600 + Math.random() * 200,
                    ultrasonic: 100 + Math.random() * 50
                }
            },
            esp32: {
                soilMoisture: 45 + Math.random() * 15,
                soilTemp: 22 + Math.random() * 5,
                ldrSensor: 600 + Math.random() * 200,
                humidity: 55 + Math.random() * 10,
                ultrasonic: 100 + Math.random() * 50
            },
            timestamp: Date.now()
        };
        dbMgr.logTelemetry(fakeData);
        emitter.emit('telemetry', fakeData);
    }, 2000);
}

try {
    findAndOpenPort();
} catch (err) {
    console.error('[SERIAL] Global Failure:', err.message);
    startSimulation(emitter);
}

emitter.stop = () => {
    if (simInterval) { clearInterval(simInterval); simInterval = null; }
    if (retryTimeout) { clearTimeout(retryTimeout); retryTimeout = null; }
    if (port && port.isOpen) port.close();
};

module.exports = emitter;
