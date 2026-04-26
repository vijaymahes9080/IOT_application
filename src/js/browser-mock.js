/**
 * BROWSER MOCK API for ORBIT-X
 * Automatically injects a simulated Electron API if the app is opened in a normal web browser.
 */
if (!window.electronAPI) {
    console.warn("[BROWSER MODE] Electron API not found. Injecting mock API for browser compatibility.");

    // Generate mock telemetry data
    let mockDistance = 400.0;
    let mockVelocity = 7.66;
    let mockTemp = 18.5;
    let mockRoll = 1.0;

    window.electronAPI = {
        isBrowserMode: true,

        // Mock SQL Database Methods
        getDbRecordCount: async () => {
            return 120; // Enough to skip training wait
        },
        getTrainingData: async (limit) => {
            const data = [];
            for (let i = 0; i < (limit || 100); i++) {
                data.push({
                    temp1: 15 + Math.random() * 10,
                    temp2: 12 + Math.random() * 8,
                    batt_voltage: 11.5 + Math.random() * 1,
                    solar_power_w: 40 + Math.random() * 20,
                    satellite_velocity_kms: 7.6 + Math.random() * 0.1,
                    satellite_distance_km: 400 + Math.random() * 10,
                    current_amps: 2.5 + Math.random() * 1,
                    gyro_x: Math.random() - 0.5,
                    gyro_y: Math.random() - 0.5,
                    gyro_z: Math.random() - 0.5
                });
            }
            return data;
        },
        getRecentTelemetry: async (limit) => {
            return window.electronAPI.getTrainingData(limit);
        },

        // Mock Real-time Streams
        onTelemetryData: (callback) => {
            setInterval(() => {
                mockDistance += (Math.random() - 0.5) * 0.1;
                mockVelocity += (Math.random() - 0.5) * 0.01;
                mockTemp += (Math.random() - 0.5) * 0.5;
                mockRoll += (Math.random() - 0.5) * 0.2;

                callback({
                    satellite: {
                        latitude: 10.279 + (Math.random() - 0.5) * 0.01,
                        longitude: 77.934 + (Math.random() - 0.5) * 0.01,
                        altitude: mockDistance,
                        velocity: mockVelocity,
                        distance: mockDistance
                    },
                    sensor: {
                        temperature: mockTemp,
                        pressure: Math.random() * 10 + 1000,
                        humidity: Math.random() * 20 + 40,
                        sys_risk: "NOMINAL"
                    },
                    attitude: {
                        roll: mockRoll,
                        pitch: -4.3,
                        yaw: 60.4
                    },
                    power: {
                        batteryInfo: { batt_v: "12.4", soc: "98%" }
                    }
                });
            }, 1000);
        },
        onAIStatusUpdate: (callback) => {
            setTimeout(() => callback({ status: "ONLINE_MOCK" }), 1000);
        },

        // Mock Backend Actions
        startBackend: async () => console.log("Mock backend started"),
        stopBackend: () => console.log("Mock backend stopped"),
        resetDatabase: async () => console.log("Mock DB reset"),
        clearCache: async () => console.log("Mock cache cleared"),
        logAnomaly: (data) => console.log("[MOCK ANOMALY LOG]", data),
        triggerAlert: (title, desc) => console.warn("[MOCK ALERT]", title, desc),
        aiPredict: async (module, data) => {
            console.log(`[MOCK AI PREDICT] Invoked for ${module}`);
            if (module === 'maps') {
                return {
                    status: "Optimized (MOCK)",
                    geojson: {
                        features: [{ properties: { avg_ndvi: 0.82 } }]
                    },
                    inference_time: 0.1
                };
            }
            return { error: 'Mock response only' };
        },
        openTerminal: () => {
            alert("MOCK: Terminal Window Opened.\n(In Electron, this would open a separate hardware-style terminal window.)");
        },
        startSession: (config) => {
            console.log("[MOCK] Mission Session Started", config);
            return true;
        },
        aiHealth: async () => {
            return { status: 'online_mock' };
        }
    };
}
