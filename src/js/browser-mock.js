/**
 * BROWSER MOCK & HYBRID COMPATIBILITY API for AGRI LINK / ORBIT-X
 * Automatically injects the full electronAPI interface when the application
 * is served on localhost or loaded in standard web browsers.
 */
(function() {
    if (window.electronAPI) return;

    console.log("%c[AGRI LINK] Browser Mode Active — Initializing Web Bridge...", "color: #00e5ff; font-weight: bold;");

    // Dynamic Simulated Sensor State (reflecting realistic agricultural conditions)
    let mockTemp = 27.4;
    let mockHumidity = 61.2;
    let mockSoil = 52.8;
    let mockLdr = 2150;
    let mockUltrasonic = 28.4;
    let mockLaser = 285;
    let mockLat = 10.2791;
    let mockLon = 77.9344;
    let mockDistance = 408.2;
    let mockVelocity = 7.66;
    let mockRoll = 0.8;

    function calcVPD(t, h) {
        const vpsat = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
        return Math.max(0, vpsat * (1 - (h / 100)));
    }

    function calcDewPoint(t, h) {
        return t - ((100 - h) / 5);
    }

    function generateTelemetrySnapshot() {
        // Natural sensor jitter
        mockTemp = Math.max(16, Math.min(38, mockTemp + (Math.random() - 0.5) * 0.2));
        mockHumidity = Math.max(30, Math.min(95, mockHumidity + (Math.random() - 0.5) * 0.4));
        mockSoil = Math.max(15, Math.min(85, mockSoil + (Math.random() - 0.5) * 0.15));
        mockLdr = Math.max(300, Math.min(4000, Math.round(mockLdr + (Math.random() - 0.5) * 30)));
        mockUltrasonic = Math.max(4.0, Math.min(150.0, mockUltrasonic + (Math.random() - 0.5) * 0.5));
        mockLaser = Math.max(50, Math.min(1200, Math.round(mockLaser + (Math.random() - 0.5) * 8)));
        mockDistance += (Math.random() - 0.5) * 0.05;
        mockVelocity += (Math.random() - 0.5) * 0.005;
        mockRoll += (Math.random() - 0.5) * 0.1;

        const vpd = calcVPD(mockTemp, mockHumidity);
        const dew = calcDewPoint(mockTemp, mockHumidity);

        return {
            status: "connected",
            isFresh: true,
            port: "COM4 (Browser Emulation)",
            timestamp: Date.now(),
            data: {
                esp32: {
                    temp1: Number(mockTemp.toFixed(1)),
                    temp2: Number((mockTemp - 1.2).toFixed(1)),
                    humidity: Number(mockHumidity.toFixed(1)),
                    soilMoisture: Number(mockSoil.toFixed(1)),
                    soilRaw: Math.round(4095 - (mockSoil / 100) * 3000),
                    ldrSensor: mockLdr,
                    ultrasonic: Number(mockUltrasonic.toFixed(1)),
                    laserDistance: mockLaser,
                    gpsFix: 1,
                    lat: Number(mockLat.toFixed(5)),
                    lon: Number(mockLon.toFixed(5)),
                    vpd: Number(vpd.toFixed(2)),
                    dew_pt: Number(dew.toFixed(1)),
                    batt_v: "12.4",
                    current_amps: 2.1
                },
                satellite: {
                    latitude: Number((mockLat + 0.002).toFixed(5)),
                    longitude: Number((mockLon + 0.003).toFixed(5)),
                    altitude: Number(mockDistance.toFixed(1)),
                    velocity: Number(mockVelocity.toFixed(2)),
                    distance: Number(mockDistance.toFixed(1))
                },
                sensor: {
                    temperature: Number(mockTemp.toFixed(1)),
                    pressure: 1012.4,
                    humidity: Number(mockHumidity.toFixed(1)),
                    sys_risk: "NOMINAL"
                },
                attitude: {
                    roll: Number(mockRoll.toFixed(2)),
                    pitch: -4.3,
                    yaw: 60.4
                },
                power: {
                    batteryInfo: { batt_v: "12.4", soc: "98%" }
                }
            }
        };
    }

    const telemetryListeners = [];
    const rawListeners = [];
    const riskListeners = [];
    const statusListeners = [];

    // Continuous Telemetry Broadcasting Loop (1 second cadence)
    setInterval(() => {
        const snap = generateTelemetrySnapshot();
        telemetryListeners.forEach(cb => {
            try { cb(snap); } catch (e) { console.error(e); }
        });
        rawListeners.forEach(cb => {
            try {
                cb(`$AGRI,${snap.data.esp32.temp1},${snap.data.esp32.humidity},${snap.data.esp32.soilMoisture},${snap.data.esp32.ldrSensor},${snap.data.esp32.ultrasonic},${snap.data.esp32.laserDistance}*OK`);
            } catch (e) {}
        });
    }, 1000);

    window.electronAPI = {
        isBrowserMode: true,

        // Hardware & Telemetry
        getHardwareStatus: async () => ({
            status: 'connected',
            lastKnownPort: 'COM4 (Browser Emulation)',
            lastTelemetryTime: Date.now()
        }),

        getLatestTelemetry: async () => {
            // First attempt to poll local node server if available
            try {
                const res = await fetch('/api/telemetry');
                if (res.ok) return await res.json();
            } catch (_) {}
            return generateTelemetrySnapshot();
        },

        sendHardwareCommand: async (command) => {
            console.log(`%c[HW-CMD -> COM4] ${command}`, "color: #00ff88; font-weight: bold;");
            try {
                await fetch('/api/command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command })
                });
            } catch (_) {}
            return true;
        },

        // Stream Listeners
        onTelemetryData: (callback) => {
            if (typeof callback === 'function') telemetryListeners.push(callback);
        },
        onRawData: (callback) => {
            if (typeof callback === 'function') rawListeners.push(callback);
        },
        onRiskLevelChange: (callback) => {
            if (typeof callback === 'function') riskListeners.push(callback);
        },
        onHardwareStatusUpdate: (callback) => {
            if (typeof callback === 'function') {
                statusListeners.push(callback);
                callback({ status: 'connected', port: 'COM4' });
            }
        },

        // AI Chat & Reasoning
        aiChat: async (query) => {
            try {
                const snap = generateTelemetrySnapshot();
                const res = await fetch('http://127.0.0.1:5005/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, telemetry: snap })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.response && !data.response.includes('EXTENDED_SEARCH_REQUIRED')) {
                        return data;
                    }
                }
            } catch (_) {}

            // Graceful internal fallback
            return {
                response: `AGRI LINK is monitoring real-time telemetry. Field conditions are optimal. Current soil hydration is ${mockSoil.toFixed(1)}% and temperature is ${mockTemp.toFixed(1)}°C.`,
                status: 'nominal'
            };
        },

        aiPredict: async (module, data) => {
            try {
                const res = await fetch(`http://127.0.0.1:5005/predict/${module}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data || {})
                });
                if (res.ok) return await res.json();
            } catch (_) {}

            if (module === 'maps') {
                return {
                    status: "Optimized (Satellite Active)",
                    geojson: {
                        type: "FeatureCollection",
                        features: [{ type: "Feature", properties: { avg_ndvi: 0.78 }, geometry: { type: "Polygon", coordinates: [] } }]
                    },
                    inference_time: 0.12
                };
            }
            if (module === 'advisory') {
                return {
                    advisory: "Optimal vegetative window. Balance nitrogen feeding with soil moisture at 52%.",
                    cost_optimization_suggestion: "Schedule irrigation pulse for pre-dawn cycle.",
                    inference_time: 0.05
                };
            }
            if (module === 'climate') {
                return { drought_risk_percentage: 12.5, heat_stress_alert: "LOW", inference_time: 0.08 };
            }
            return { status: "success", inference_time: 0.05 };
        },

        aiHealth: async () => ({ status: 'online' }),
        onAIStatusUpdate: (callback) => {
            if (typeof callback === 'function') callback({ status: "ONLINE (Browser Bridge)" });
        },
        onAIModelSync: () => {},

        // Database and Training Mock Methods
        getDbRecordCount: async () => 145,
        getTrainingData: async (limit) => {
            const data = [];
            for (let i = 0; i < (limit || 50); i++) {
                data.push({
                    temp1: 22 + Math.random() * 8,
                    temp2: 20 + Math.random() * 6,
                    batt_voltage: 12.2 + Math.random() * 0.4,
                    solar_power_w: 45 + Math.random() * 15,
                    satellite_velocity_kms: 7.66,
                    satellite_distance_km: 408 + Math.random() * 4,
                    current_amps: 2.1,
                    gyro_x: 0.02,
                    gyro_y: -0.01,
                    gyro_z: 0.01
                });
            }
            return data;
        },
        getRecentTelemetry: async (limit) => window.electronAPI.getTrainingData(limit),
        getAnomalyHistory: async () => [],
        resetDatabase: async () => true,
        logAnomaly: () => {},
        logPrediction: () => {},
        saveModelSnapshot: () => {},
        startSession: () => true,
        endSession: () => true,
        triggerAlert: (title, body) => console.warn(`[ALERT] ${title}: ${body}`),
        openTerminal: () => alert("Raw Telemetry Terminal (In Electron or CLI via agy/serial)."),
        updateCloudCode: () => {},
        getAppVersion: async () => "1.0.0 (Web Browser Mode)"
    };
})();
