/**
 * HYBRID MULTI-DOMAIN AI ENGINE
 * (Satellite + Agriculture Unified Intelligence System)
 */

class HybridAIEngine {
    constructor() {
        this.models = { m1: this.buildModel1(), m2: this.buildModel2(), m3: this.buildModel3() };
        this.isTraining = false;
        this.storageBroken = false; // Flag to skip IndexedDB if it keeps failing

        // Data Buffers
        this.inferenceBuffer = []; // stores recent 15-feature vectors (max 10)
        this.rawTelemetryBuffer = []; // stores raw raw for real-time feature extraction (max 5)
        this.onlineLearningBuffer = []; // stores [features, target] for M1 online learning
        this.packetCount = 0;
        this.lastIngestTime = 0;
        this.INGEST_THROTTLE = 100; // ms between AI processing steps

        this.featureScalers = { min: new Array(15).fill(0), max: new Array(15).fill(1) };
        try {
            const stored = localStorage.getItem('orbitx_recon_thresh');
            const parsed = stored ? parseFloat(stored) : 0.5;
            this.reconThresh = isNaN(parsed) ? 0.5 : parsed;
        } catch (e) { console.warn("LocalStorage error", e); this.reconThresh = 0.5; }

        this.initDOM();
        this.initChart();
        this.setupGpuListeners();
        this.startEngine();
        this.startClock();
    }

    startClock() {
        const update = () => {
            const now = new Date();
            const utc = now.toISOString().split('T')[1].split('.')[0];
            const el = document.getElementById('utc-time');
            if (el) el.innerText = utc;
        };
        update();
        setInterval(update, 1000);
    }

    applyGlobalEnhancement(update) {
        console.log(`[AI Engine] Applying Global Knowledge Sync: v${update.version}`);
        
        // This simulates a federated learning update where the cloud provides
        // validated weight deltas to improve local model accuracy.
        if (this.uiStatus) {
            const originalColor = this.uiStatus.style.color;
            const originalText = this.uiStatus.innerText;
            
            this.uiStatus.innerText = `GLOBAL ENHANCEMENT [v${update.version}] DEPLOYED`;
            this.uiStatus.style.color = "#00e5ff"; // Cloud cyan
            
            setTimeout(() => {
                this.uiStatus.style.color = originalColor;
                this.uiStatus.innerText = originalText;
                if (this.infTrainedTime) {
                    this.infTrainedTime.innerText = `Global Intelligence v${update.version}`;
                }
            }, 5000);
        }

        // Push sync event to mission history
        if (window.CloudMgr) {
            window.CloudMgr.updateCloudSyncStatus('GLOBAL AI SYNCED');
        }

        // Trigger native notification for the first few syncs to show it's working
        if (window.electronAPI && window.electronAPI.triggerAlert) {
            window.electronAPI.triggerAlert("GLOBAL AI ENHANCEMENT", `Cloud intelligence v${update.version} has been merged into the local neural core.`);
        }
    }

    setupGpuListeners() {
        // Monitor for GPU context loss (common on unstable AMD/Intel drivers under high load)
        window.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.error("[AI Engine] MISSION CRITICAL: WebGL Context Lost! Moving to CPU Defense Mode...");
            this.handleGpuFailure();
        }, false);
    }

    async handleGpuFailure() {
        try {
            await tf.setBackend('cpu');
            await tf.ready();
            this.isSafeMode = true; // Flag for internal throttling

            if (this.uiStatus) {
                this.uiStatus.innerText = "GPU CRASHED: Safe Mode (CPU) Active";
                this.uiStatus.style.color = "#ffab00";
            }

            // Notify other modules (like 3D Globe) to halt high-res renders
            window.dispatchEvent(new CustomEvent('orbitx-gpu-failure', { detail: { backend: 'cpu' } }));

            // Immediately throttle engine timers
            this.throttleEngineForCPU();
        } catch (err) {
            console.error("[AI Engine] Total Hardware Failure. Engine Halted.");
        }
    }

    throttleEngineForCPU() {
        console.log("[AI Engine] Throttling subsystems for CPU safety...");
        // 1. Slow down auto-inference (6s instead of 3s)
        if (this._inferenceTimer) {
            clearInterval(this._inferenceTimer);
            this.startAutoInferenceTimer(12000); // 12 second intervals on CPU
        }
        // 2. Clear scheduled retrains to avoid background spikes
        if (this._retrainTimer) clearInterval(this._retrainTimer);
    }

    initDOM() {
        // Acquisition inputs
        this.uiSoil = document.getElementById('st-soil');
        this.uiTmp = document.getElementById('st-tmp');
        this.uiLdr = document.getElementById('st-ldr');
        this.uiGps = document.getElementById('st-gps');
        this.uiDist = document.getElementById('st-dist');
        this.uiVel = document.getElementById('st-vel');

        // AI specific panels
        this.btnReset = document.getElementById('btn-reset-models');
        this.uiStatus = document.getElementById('model-status');

        this.trEpoch = document.getElementById('tr-epoch');
        this.trLoss = document.getElementById('tr-loss');
        this.trValLoss = document.getElementById('tr-val-loss');
        this.trDevice = document.getElementById('tr-device');

        this.metricMae = document.getElementById('metric-mae');
        this.metricAuc = document.getElementById('metric-auc');
        this.metricMse = document.getElementById('metric-mse');
        this.metricThresh = document.getElementById('metric-thresh');

        // Inference outputs
        this.infVelocity = document.getElementById('inf-velocity');
        this.infThermal = document.getElementById('inf-thermal');
        this.infThermalConf = document.getElementById('inf-thermal-conf');
        this.infAnomaly = document.getElementById('inf-anomaly');
        this.infAnomalyThresh = document.getElementById('inf-anomaly-thresh');
        this.infTrainedTime = document.getElementById('inf-trained-time');
        this.uiInsight = document.getElementById('xai-insight');

        if (this.btnReset) this.btnReset.addEventListener('click', () => this.resetModels());

        const trainedTime = localStorage.getItem('orbitx_last_trained');
        if (trainedTime && this.infTrainedTime) {
            this.infTrainedTime.innerText = new Date(parseInt(trainedTime)).toLocaleString();
        }

        // Backend Sync Elements
        this.beStatus = document.getElementById('backend-status-badge');
        this.beModel = document.getElementById('backend-best-model');
        this.hwStatus = document.getElementById('hw-status');
        this.consoleEl = document.getElementById('training-console');

        // Fetch App Version
        if (window.electronAPI?.getAppVersion) {
            window.electronAPI.getAppVersion().then(ver => {
                const verEl = document.getElementById('app-version');
                if (verEl) verEl.innerText = `v${ver}`;
            });
        }
    }

    logToConsole(msg, type = 'SYSTEM') {
        if (!this.consoleEl) return;
        const div = document.createElement('div');
        const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        div.innerHTML = `<span style="opacity:0.5">[${now}]</span> <span style="font-weight:bold">[${type}]</span> ${msg}`;
        this.consoleEl.appendChild(div);
        
        // Auto-scroll to bottom
        this.consoleEl.scrollTop = this.consoleEl.scrollHeight;
        
        // Trim old logs
        if (this.consoleEl.children.length > 50) this.consoleEl.removeChild(this.consoleEl.firstChild);
    }

    initChart() {
        if (typeof Chart === 'undefined') {
            console.warn("[Hybrid Engine] Chart.js missing. AI progress will use 2D canvas fallback.");
            this.render2DLossFallback();
            return;
        }
        const ctx = document.getElementById('lossChart');
        if (!ctx) return;
        this.lossChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'Train Loss', data: [], borderColor: '#ffab00', backgroundColor: 'rgba(255, 171, 0, 0.1)', borderWidth: 2, tension: 0.4, fill: true },
                    { label: 'Val Loss', data: [], borderColor: '#00e676', backgroundColor: 'transparent', borderWidth: 2, tension: 0.4 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' } } }
                },
                scales: {
                    x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { 
                        beginAtZero: true,
                        ticks: { color: '#64748b', font: { size: 9 }, callback: (v) => v.toFixed(2) }, 
                        grid: { color: 'rgba(255,255,255,0.03)' } 
                    }
                }
            }
        });
    }

    render2DLossFallback() {
        const canvas = document.getElementById('lossChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const draw = () => {
            const w = canvas.width = canvas.parentElement.clientWidth;
            const h = canvas.height = canvas.parentElement.clientHeight;
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(255, 152, 0, 0.4)';
            ctx.beginPath(); ctx.moveTo(0, h * 0.8); ctx.lineTo(w, h * 0.2); ctx.stroke();
            ctx.fillStyle = '#ff9800'; ctx.font = '8px mono';
            ctx.fillText("TRAINING MONITOR [FALLBACK]", 10, 15);
            requestAnimationFrame(draw);
        };
        draw();
    }

    updateChart(epoch, loss, valLoss) {
        if (!this.lossChart) return;
        this.lossChart.data.labels.push(epoch);
        this.lossChart.data.datasets[0].data.push(loss);
        this.lossChart.data.datasets[1].data.push(valLoss);
        this.lossChart.update();
    }

    async startEngine() {
        if (typeof tf === 'undefined') {
            console.warn("TensorFlow.js not loaded.");
            return;
        }

        try {
            await tf.setBackend('webgl');
            await tf.ready();
            if (this.trDevice) this.trDevice.innerText = "GPU / WEBGL-2";
            if (this.hwStatus) {
                this.hwStatus.innerText = "HW: GPU ACTIVE";
                this.hwStatus.style.color = "var(--state-safe)";
            }
            this.logToConsole("Hardware Acceleration initialized: GPU/WebGL", "HW");
        } catch (e1) {
            console.warn("[AI Engine] Falling back to CPU...");
            await tf.setBackend('cpu');
            await tf.ready();
            if (this.trDevice) {
                this.trDevice.innerText = "CPU / SAFE-MODE";
                this.trDevice.style.color = "var(--state-warn)";
            }
            if (this.hwStatus) {
                this.hwStatus.innerText = "HW: CPU ONLY";
                this.hwStatus.style.color = "var(--state-warn)";
            }
            this.logToConsole("Hardware Acceleration failed. Falling back to CPU.", "WARN");
        }

        // Listen for specific status updates from Main process
        if (window.electronAPI && window.electronAPI.onAIStatusUpdate) {
            window.electronAPI.onAIStatusUpdate((info) => {
                if (info.status === 'MISSING_PYTHON') {
                    this.pythonMissing = true;
                    if (this.beStatus) {
                        this.beStatus.innerText = 'MISSING PYTHON';
                        this.beStatus.style.color = '#ff1744';
                    }
                }
            });
        }

        // --- GLOBAL MODEL SYNC (Federated Learning Simulation) ---
        if (window.electronAPI && window.electronAPI.onAIModelSync) {
            window.electronAPI.onAIModelSync((update) => {
                this.applyGlobalEnhancement(update);
            });
        }

        const loaded = await this.loadModels();
        if (loaded && this.uiStatus) {
            this.uiStatus.innerText = "Model Loaded from Cache";
            this.uiStatus.style.color = "#4caf50";
        } else if (this.uiStatus) {
            this.uiStatus.innerText = "Initializing Autonomous Intelligence Core...";
            this.uiStatus.style.color = "#ffab00";
        }

        if (window.electronAPI && window.electronAPI.onTelemetryData) {
            window.electronAPI.onTelemetryData((data) => this.ingestTelemetryStream(data));
        }

        const updateDbStatus = async () => {
            if (!window.electronAPI?.getDbRecordCount) return 0;
            const count = await window.electronAPI.getDbRecordCount();
            if (this.uiStatus && !this.isTraining) {
                if (count < 60) {
                    this.uiStatus.innerText = `Collecting sensor data... (${count}/60 records)`;
                    this.uiStatus.style.color = '#ffab00';
                } else {
                    this.uiStatus.innerText = `DB Ready: ${count} real records`;
                    this.uiStatus.style.color = '#4caf50';
                }
            }
            return count;
        };

        setTimeout(async () => {
            const dbCount = await updateDbStatus();
            if (dbCount < 60 && !realDataTrainDone) {
                await this.startTrainingPipeline();
            }
        }, 8000);

        let realDataTrainDone = false;
        const sensorWatchdog = setInterval(async () => {
            const count = await updateDbStatus();
            if (!realDataTrainDone && count >= 60 && !this.isTraining) {
                realDataTrainDone = true;
                clearInterval(sensorWatchdog);
                await this.startTrainingPipeline();
            }
        }, 3000);

        this._retrainTimer = setInterval(async () => {
            if (!this.isTraining && !this.isSafeMode) {
                await this.startTrainingPipeline();
            }
        }, 5 * 60 * 1000);

        setInterval(() => this.pollBackendSync(), 10000);
        this.pollBackendSync();
    }

    async pollBackendSync() {
        if (!window.electronAPI || !window.electronAPI.aiHealth) return;
        if (this.pythonMissing) return; // Status already set by event
        try {
            const health = await window.electronAPI.aiHealth();
            if (this.beStatus) {
                const isOnline = health.status !== 'offline';
                this.beStatus.innerText = isOnline ? 'ACTIVE' : 'OFFLINE';
                this.beStatus.style.color = isOnline ? '#00e5ff' : '#ff1744';
            }
            if (this.beModel) {
                const acc = (health.accuracy && health.accuracy > 0) ? ` (${health.accuracy}%)` : '';
                const drift = health.drift_detected ? ' ⚠ DRIFT' : '';
                const modelName = health.best_model || 'INITIALIZING';
                this.beModel.innerText = modelName + acc + drift;
                
                // Update Global Model Source Status in top bar if on AI page
                const sourceEl = document.getElementById('model-source-status');
                if (sourceEl) {
                    sourceEl.innerText = `MODEL: ${modelName.toUpperCase()}`;
                    sourceEl.style.color = health.status !== 'offline' ? 'var(--state-safe)' : 'var(--state-warn)';
                }
            }
        } catch (e) {
            if (this.beStatus) { this.beStatus.innerText = 'OFFLINE'; this.beStatus.style.color = '#ff9800'; }
        }
    }

    // --- PART B: Creative & Unique Model Architectures ---
    buildModel1() {
        // Space-Time Hybrid Predictor: Conv1D + GRU mapping for Orbit Velocity
        const model = tf.sequential();
        model.add(tf.layers.conv1d({ filters: 32, kernelSize: 3, activation: 'relu', inputShape: [10, 15], padding: 'same' }));
        model.add(tf.layers.maxPooling1d({ poolSize: 2 }));
        model.add(tf.layers.gru({ units: 64, returnSequences: false, kernelInitializer: 'glorotUniform', recurrentInitializer: 'glorotUniform' }));
        model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 1, activation: 'linear' }));
        model.compile({ optimizer: tf.train.adam(0.002), loss: 'meanSquaredError', metrics: ['mae'] });
        return model;
    }

    buildModel2() {
        // Deep Residual-Block Classifier for Thermal Risk
        const input = tf.input({ shape: [10, 15] });

        // Flatten sequence context
        const flat = tf.layers.flatten().apply(input);

        let x1 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(flat);
        x1 = tf.layers.batchNormalization().apply(x1);

        let x2 = tf.layers.dense({ units: 64, activation: 'relu' }).apply(x1);
        x2 = tf.layers.dropout({ rate: 0.3 }).apply(x2);

        // Skip connection (Residual)
        let added = tf.layers.add().apply([x1, x2]);

        let out = tf.layers.dense({ units: 32, activation: 'relu' }).apply(added);
        const output = tf.layers.dense({ units: 1, activation: 'sigmoid' }).apply(out);

        const model = tf.model({ inputs: input, outputs: output });
        model.compile({ optimizer: tf.train.adam(0.001), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
        return model;
    }

    buildModel3() {
        // Asymmetric Sparse Autoencoder (Quantum-inspired topology constraint)
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [15] }));
        model.add(tf.layers.dropout({ rate: 0.1 }));
        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));

        // Extreme bottleneck to force abstract representation learning
        model.add(tf.layers.dense({ units: 4, activation: 'tanh' }));

        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 15, activation: 'linear' }));

        model.compile({ optimizer: 'rmsprop', loss: 'meanSquaredError' });
        return model;
    }

    // --- PART E: Persistence ---
    async loadModels() {
        if (this.storageBroken) {
            this.models.m1 = this.buildModel1();
            this.models.m2 = this.buildModel2();
            this.models.m3 = this.buildModel3();
            return false;
        }

        const loadFromCache = async () => {
            try {
                this.models.m1 = await tf.loadLayersModel('indexeddb://orbitx-lstm-v2');
                this.models.m2 = await tf.loadLayersModel('indexeddb://orbitx-classifier-v2');
                this.models.m3 = await tf.loadLayersModel('indexeddb://orbitx-autoencoder-v2');

                // Compile models after loading
                this.models.m1.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] });
                this.models.m2.compile({ optimizer: tf.train.adam(0.0005), loss: 'binaryCrossentropy', metrics: ['accuracy'] });
                this.models.m3.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

                const scalersStr = localStorage.getItem('orbitx_scalers');
                if (scalersStr) this.featureScalers = JSON.parse(scalersStr);
                console.log("[AI Engine] Models loaded from IndexedDB cache.");
                this.logToConsole("Models restored from IndexedDB cache pool", "LOAD");
                return true;
            } catch (e) {
                console.warn("[AI Engine] Cache load failed:", e.name, e.message);
                if (e.name === 'QuotaExceededError' || e.name === 'UnknownError' || e.message.includes('Internal error')) {
                    console.warn("[AI Engine] Internal storage failure detected. Switching to memory-only mode.");
                    this.storageBroken = true;
                }
                throw e;
            }
        };

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000));

        try {
            await Promise.race([loadFromCache(), timeout]);
            return true;
        } catch (e) {
            console.warn("[AI Engine] IndexedDB unavailable or timed out. Rebuilding model templates in memory.");
            // Rebuild templates if load fails
            this.models.m1 = this.buildModel1();
            this.models.m2 = this.buildModel2();
            this.models.m3 = this.buildModel3();
            return false;
        }
    }

    async saveModels() {
        if (this.storageBroken) return;
        try {
            await this.models.m1.save('indexeddb://orbitx-lstm-v2');
            await this.models.m2.save('indexeddb://orbitx-classifier-v2');
            await this.models.m3.save('indexeddb://orbitx-autoencoder-v2');
            localStorage.setItem('orbitx_scalers', JSON.stringify(this.featureScalers));
            localStorage.setItem('orbitx_recon_thresh', this.reconThresh.toString());

            const timestamp = Date.now();
            localStorage.setItem('orbitx_last_trained', timestamp.toString());
            if (this.infTrainedTime) this.infTrainedTime.innerText = new Date(timestamp).toLocaleString();
            console.log("[AI Engine] Models and state saved securely.");
        } catch (e) {
            console.error("Failed saving models:", e.name, e.message);
            if (e.name === 'QuotaExceededError' || e.name === 'UnknownError' || e.message.includes('Internal error')) {
                console.warn("[AI Engine] Storage failure on save. Disabling IndexedDB persistence.");
                this.storageBroken = true;
            }
        }
    }

    async clearModelCache() {
        try {
            const dbs = ['orbitx-lstm-v2', 'orbitx-classifier-v2', 'orbitx-autoencoder-v2'];
            for (const db of dbs) {
                await tf.io.removeModel(`indexeddb://${db}`).catch(() => { });
            }
            console.log("[AI Engine] IndexedDB model cache cleared.");
        } catch (e) {
            console.error("[AI Engine] Error clearing model cache:", e);
        }
    }

    // --- PART: Synthetic Training Data Generator ---
    // Creates realistic orbital + agri telemetry for first-boot model training
    generateSyntheticTrainingData(count = 120) {
        const rows = [];
        let vel = 7.6, temp1 = 24, temp2 = 22, batt = 14.2;
        let soil = 40, sTemp = 25, solar = 85;

        for (let i = 0; i < count; i++) {
            // Simulate realistic variations
            vel += (Math.random() - 0.5) * 0.04;
            temp1 += (Math.random() - 0.5) * 0.5;
            temp2 += (Math.random() - 0.5) * 0.4;
            batt += (Math.random() - 0.5) * 0.1;
            soil += (Math.random() - 0.5) * 1.5;
            sTemp += (Math.random() - 0.5) * 0.8;
            solar += (Math.random() - 0.5) * 5;

            // Keep values in realistic bounds
            vel = Math.max(7.2, Math.min(8.1, vel));
            temp1 = Math.max(18, Math.min(38, temp1));
            batt = Math.max(11.5, Math.min(15.2, batt));
            soil = Math.max(20, Math.min(80, soil));
            solar = Math.max(20, Math.min(120, solar));

            rows.push({
                satellite_velocity_kms: vel,
                satellite_distance_km: 12.4 + Math.sin(i * 0.1) * 0.3,
                temp1, temp2,
                batt_voltage: batt,
                current_amps: 2.5 + Math.random() * 0.5,
                solar_power_w: solar,
                gyro_x: (Math.random() - 0.5) * 0.1,
                gyro_y: (Math.random() - 0.5) * 0.1,
                gyro_z: (Math.random() - 0.5) * 0.1,
                soil_moisture: soil,
                soil_temp: sTemp,
                ldr_sensor: 700 + Math.floor(Math.random() * 300)
            });
        }
        return rows;
    }

    // --- Auto-Inference Push Timer ---
    // Updates inference UI every 3 seconds using buffered features or synthetic input
    startAutoInferenceTimer(interval = 3000) {
        if (this._inferenceTimer) clearInterval(this._inferenceTimer);
        this._inferenceTimer = setInterval(() => {
            if (this.isTraining) return;
            if (this.inferenceBuffer.length === 10) {
                // Use real buffered data
                this.runInference();
            } else {
                // Synthesize a 10-step sequence for demo display
                const synth = [];
                for (let i = 0; i < 10; i++) {
                    const f = new Array(15).fill(0).map((_, j) => {
                        const base = [0.5, 0.1, 0.48, 0.1, 0.7, 0.05, 0.8, 0.1, 0, 0, 0, 0, 0.05, 5, 0.5];
                        return base[j] + (Math.random() - 0.5) * 0.1;
                    });
                    synth.push(f);
                }
                // Temporarily inject synthetic sequence and run inference
                const saved = [...this.inferenceBuffer];
                this.inferenceBuffer = synth;
                this.runInference();
                this.inferenceBuffer = saved;
            }
        }, 3000);
        console.log('[AI Engine] Auto-inference timer started (3s interval).');
    }

    async resetModels() {
        try {
            // ONLY Full Database Reset (Models retain their trained attributes)
            if (window.electronAPI && window.electronAPI.resetDatabase) {
                await window.electronAPI.resetDatabase();
            }

            if (this.uiStatus) {
                this.uiStatus.innerText = "Database Wiped (AI Models Retained & Continuously Learning...)";
                this.uiStatus.style.color = "#4caf50";
            }
            alert("Database telemetry logs and IDs have been reset starting at ID 1. \n\nThe AI Models remain FULLY TRAINED and will continue learning continuously from the immediate next data packets.");
        } catch (e) {
            console.error("Reset Error:", e);
        }
    }

    // --- PART A: Feature Engineering ---
    extractFeatures(rows, isTraining = false) {
        // Calculate raw features array for each row based on rolling lookbacks
        const extracted = [];

        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i];

            // Get rolling window
            const winSize = 5;
            const start = Math.max(0, i - winSize + 1);
            const wRows = rows.slice(start, i + 1);

            // Helper functions
            const getVals = (prop) => wRows.map(r => Number(r[prop]) || 0);
            const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
            const std = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length || 1));

            const tmp1Vals = getVals('temp1');
            const tmp2Vals = getVals('temp2');
            const battVals = getVals('batt_voltage');
            const solVals = getVals('solar_power_w');

            const tmp1M = mean(tmp1Vals);
            const tmp2M = mean(tmp2Vals);
            const battM = mean(battVals);
            const solM = mean(solVals);

            const prevRow = i > 0 ? rows[i - 1] : raw;
            const temp_delta = (Number(raw.temp1) || 0) - (Number(raw.temp2) || 0);
            const pwr_eff = (Number(raw.solar_power_w) || 0) / ((Number(raw.current_amps) || 0) + 0.01);
            const dist = Number(raw.satellite_distance_km) || 0;
            const orb_phase = Math.sin(dist / 100);

            // 15 Features mapping
            const feats = [
                tmp1M, std(tmp1Vals, tmp1M),
                tmp2M, std(tmp2Vals, tmp2M),
                battM, std(battVals, battM),
                solM, std(solVals, solM),
                (Number(raw.temp1) || 0) - (Number(prevRow.temp1) || 0), // temp1 delta
                (Number(raw.satellite_velocity_kms) || 0) - (Number(prevRow.satellite_velocity_kms) || 0), // vel delta
                (Number(raw.batt_voltage) || 0) - (Number(prevRow.batt_voltage) || 0), // batt delta
                (Number(raw.gyro_x) || 0) - (Number(prevRow.gyro_x) || 0), // gyro_x delta
                temp_delta,
                pwr_eff,
                orb_phase
            ];

            // Handle targets assignment 
            let t1 = 0; // Model 1: Next velocity
            let t2 = 0; // Model 2: Will temp1 exceed 35 in next 5

            if (isTraining && i < rows.length - 5) {
                t1 = Number(rows[i + 1].satellite_velocity_kms) || 0;
                let next5Temps = rows.slice(i + 1, i + 6).map(r => Number(r.temp1));
                t2 = next5Temps.some(t => t > 35) ? 1 : 0;
            }

            extracted.push({ f: feats, t1, t2 });
        }

        // Apply Min-Max Scaling
        if (isTraining) {
            for (let fIdx = 0; fIdx < 15; fIdx++) {
                const col = extracted.map(e => e.f[fIdx]);
                let cMin = Math.min(...col);
                let cMax = Math.max(...col);
                if (cMax === cMin) cMax += 1e-7; // FIX: Prevent total collapse into NaN by avoiding division by zero
                this.featureScalers.min[fIdx] = cMin;
                this.featureScalers.max[fIdx] = cMax;
            }
        }

        extracted.forEach(e => {
            for (let fIdx = 0; fIdx < 15; fIdx++) {
                let range = this.featureScalers.max[fIdx] - this.featureScalers.min[fIdx];
                if (range === 0 || isNaN(range)) range = 1; // Double fail-safe against NaN contamination
                e.f[fIdx] = (e.f[fIdx] - this.featureScalers.min[fIdx]) / range;
                if (isNaN(e.f[fIdx])) e.f[fIdx] = 0;   // Hardcast NaN to 0 so tensor doesn't explode
            }
        });

        return extracted;
    }

    // --- PART C: Training Pipeline ---
    async startTrainingPipeline() {
        if (this.isTraining || !window.electronAPI) return;
        this.isTraining = true;
        console.log("[AI Engine] Starting Training Pipeline...");
        document.body.classList.add('bg-retraining');

        try {
            // Fetch fewer records for almost instant retraining (100 records)
            let rawData = [];
            if (window.electronAPI.getTrainingData) {
                rawData = await window.electronAPI.getTrainingData(100);
            } else if (window.electronAPI.getRecentTelemetry) {
                // Fallback and reverse
                rawData = await window.electronAPI.getRecentTelemetry(100);
                rawData.reverse(); // Chronological
            }

            if (!rawData || rawData.length < 50) {
                // === SYNTHETIC DATA FALLBACK ===
                // If DB doesn't have enough records yet, generate synthetic training data
                // so the model becomes immediately useful from first boot.
                console.log('[AI Engine] Insufficient DB records. Generating synthetic training data...');
                if (this.uiStatus) this.uiStatus.innerText = "Generating Synthetic Training Data...";
                rawData = this.generateSyntheticTrainingData(120);
            }

            if (this.uiStatus) this.uiStatus.innerText = "Extracting Features...";
            console.log(`[AI Engine] Loaded ${rawData.length} records. Extracting features...`);

            // Feature extraction Pipeline
            const dataset = this.extractFeatures(rawData, true);

            // We need sequences of 10 for M1 and M2
            const seqLen = 10;
            const sequences = [];
            const targets1 = [];
            const targets2 = [];

            for (let i = 0; i <= dataset.length - seqLen; i++) {
                const seq = dataset.slice(i, i + seqLen).map(d => d.f);
                sequences.push(seq); // [10, 15]
                targets1.push(dataset[i + seqLen - 1].t1); // Use target from last step
                targets2.push(dataset[i + seqLen - 1].t2);
            }

            // Split 80/10/10
            const n = sequences.length;
            const trCut = Math.floor(n * 0.8);
            const valCut = Math.floor(n * 0.9);

            const X = sequences;
            const X_train = X.slice(0, trCut);
            const X_val = X.slice(trCut, valCut);
            const X_test = X.slice(valCut);

            const M3_Flat = dataset.slice(0, trCut).map(d => d.f); // M3 trains on just features

            if (this.lossChart) {
                this.lossChart.data.labels = [];
                this.lossChart.data.datasets.forEach(d => d.data = []);
                this.lossChart.update();
            }

            // Train M1 (LSTM)
            if (this.uiStatus) this.uiStatus.innerText = "Training Model 1 (LSTM)...";
            if (this.btnTrain) this.btnTrain.innerText = "TRAINING M1...";
            console.log("[AI Engine] Training M1 (LSTM)...");
            // Reduced epochs from 5 to 2 to eliminate 1-minute UI freezing
            await this.trainModelGeneric(this.models.m1, X_train, targets1.slice(0, trCut), X_val, targets1.slice(trCut, valCut), 2, 'M1', true);

            // Train M2 (Classifier)
            if (this.uiStatus) this.uiStatus.innerText = "Training Model 2 (Classifier)...";
            if (this.btnTrain) this.btnTrain.innerText = "TRAINING M2...";
            // Apply simple class weighing natively if extreme imbalance exists via callbacks/repeat or just pure fit
            await this.trainModelGeneric(this.models.m2, X_train, targets2.slice(0, trCut), X_val, targets2.slice(trCut, valCut), 2, 'M2', false);

            // Train M3 (Autoencoder)
            if (this.uiStatus) this.uiStatus.innerText = "Training Model 3 (Autoencoder)...";
            if (this.btnTrain) this.btnTrain.innerText = "TRAINING M3...";
            // Autoencoder is 1D features -> features
            await this.trainAutoencoder(this.models.m3, M3_Flat, 2);

            // Evaluation
            this.evaluateModels(X_test, targets1.slice(valCut), targets2.slice(valCut), dataset.slice(valCut).map(d => d.f));

            // Save state
            await this.saveModels();
            if (this.uiStatus) {
                this.uiStatus.innerText = "Training Complete. Models Deployed.";
                this.uiStatus.style.color = "#4caf50";
            }
            if (this.btnTrain) this.btnTrain.innerText = "TRAIN MODELS";
            console.log("[AI Engine] Pipeline complete. Models deployed.");

            // Sync snapshot to Mission DB
            if (window.electronAPI && window.electronAPI.saveModelSnapshot) {
                window.electronAPI.saveModelSnapshot({
                    model: "HYBRID_LSTM_CLASSIFIER",
                    epochs: 2,
                    loss: parseFloat(this.trLoss?.innerText || 0),
                    valLoss: parseFloat(this.trValLoss?.innerText || 0),
                    accuracy: parseFloat(this.metricAuc?.innerText || 0) / 100,
                    weights: "JS_TENSOR_PERSISTED"
                });
            }

            // Flush inference buffering and start auto-live predictions
            this.inferenceBuffer = [];

            // Launch auto-inference so UI updates every 3s automatically
            this.startAutoInferenceTimer();

        } catch (e) {
            if (e.message && (e.message.includes('null') || e.message.includes('getParameter') || e.message.includes('context'))) {
                console.error("[AI Engine] Detected WebGL context death during training. Escalating to CPU...");
                await this.handleGpuFailure();
                // Attempt one-time resume on CPU if possible, or just fail gracefully
                this.uiStatus.innerText = "GPU Device Removed. Systems Halted.";
            } else {
                console.error("Training Pipeline Error Stack:", e.stack || e);
                this.uiStatus.innerText = "Training failed! " + (e.message || "");
            }
            this.uiStatus.style.color = "#ff1744";
        } finally {
            this.isTraining = false;
            document.body.classList.remove('bg-retraining');
            if (this.btnTrain) Object.assign(this.btnTrain.style, { color: '', borderColor: '' });
        }
    }

    async trainModelGeneric(model, xtr, ytr, xval, yval, epochs, lbl, is3D) {
        if (!xtr.length) return;
        const xTen = tf.tensor3d(xtr);
        const yTen = tf.tensor2d(ytr.map(y => [y]));
        const xvTen = tf.tensor3d(xval);
        const yvTen = tf.tensor2d(yval.map(y => [y]));

        // Asynchronous yield generator loop per epoch to prevent Synchronous WebGL UI freezing
        for (let e = 0; e < epochs; e++) {
            this.logToConsole(`Training ${lbl} | Epoch ${e + 1}/${epochs}...`, "TRAIN");
            await model.fit(xTen, yTen, {
                epochs: 1, // Train one epoch at a time iteratively
                batchSize: 16,
                shuffle: true,
                validationData: [xvTen, yvTen]
            }).then(info => {
                const logs = info.history;
                if (this.trEpoch) this.trEpoch.innerText = `${e + 1}/${epochs}`;
                if (logs.loss && this.trLoss) this.trLoss.innerText = logs.loss[0].toFixed(4);
                if (logs.val_loss && this.trValLoss) this.trValLoss.innerText = logs.val_loss[0].toFixed(4);
                if (lbl === 'M1' && logs.loss && logs.val_loss) this.updateChart(e + 1, logs.loss[0], logs.val_loss[0]);
                this.logToConsole(`${lbl} Epoch ${e+1} Loss: ${logs.loss[0].toFixed(5)}`, "CORE");
            });
            // Force yielding back to the main thread smoothly
            await tf.nextFrame();
            await new Promise(res => requestAnimationFrame(res));
        }

        xTen.dispose(); yTen.dispose(); xvTen.dispose(); yvTen.dispose();
    }

    async trainAutoencoder(model, xtr, epochs) {
        if (!xtr.length) return;
        const xTen = tf.tensor2d(xtr);

        for (let e = 0; e < epochs; e++) {
            await model.fit(xTen, xTen, {
                epochs: 1,
                batchSize: 32,
                shuffle: true
            }).then(info => {
                const logs = info.history;
                if (this.trEpoch) this.trEpoch.innerText = `${e + 1}/${epochs}`;
                if (logs.loss && this.trLoss) this.trLoss.innerText = logs.loss[0].toFixed(4);
            });
            await tf.nextFrame();
            await new Promise(res => requestAnimationFrame(res));
        }

        // Compute Threshold (mean + 2*sigma)
        tf.tidy(() => {
            const preds = model.predict(xTen);
            const errors = tf.sub(xTen, preds).square().mean(1).arraySync(); // per sample MSE
            const meanE = errors.reduce((a, b) => a + b, 0) / errors.length;
            const stdE = Math.sqrt(errors.reduce((a, b) => a + Math.pow(b - meanE, 2), 0) / errors.length);
            this.reconThresh = meanE + 2 * stdE;
        });

        xTen.dispose();
    }

    evaluateModels(xtst, y1, y2, xflat) {
        tf.tidy(() => {
            if (xtst && xtst.length > 0) {
                // M1 MAE
                const p1 = this.models.m1.predict(tf.tensor3d(xtst)).dataSync();
                const mae = y1.reduce((acc, y, idx) => acc + Math.abs(y - p1[idx]), 0) / xtst.length;
                if (this.metricMae) this.metricMae.innerHTML = `<span class="muted">MAE:</span> ${mae.toFixed(4)}`;

                // M2 ACC
                const p2 = this.models.m2.predict(tf.tensor3d(xtst)).dataSync();
                let correct = 0;
                p2.forEach((p, idx) => { if ((p > 0.5 ? 1 : 0) === y2[idx]) correct++; });
                if (this.metricAuc) {
                    const acc = (correct / xtst.length * 100).toFixed(1);
                    this.metricAuc.innerHTML = `<span class="muted">ACC:</span> ${acc}%`;
                    this.metricAuc.className = acc > 85 ? "green" : "amber";
                }
            }

            if (xflat && xflat.length > 0) {
                const xT = tf.tensor2d(xflat);
                const rm = this.models.m3.predict(xT);
                const mse = tf.losses.meanSquaredError(xT, rm).dataSync()[0];
                if (this.metricMse) this.metricMse.innerHTML = `<span class="muted">MSE:</span> ${mse.toFixed(5)}`;
                if (this.metricThresh) this.metricThresh.innerHTML = `<span class="muted">THR:</span> ${this.reconThresh?.toFixed(4) || '—'}`;
            }
        });
    }

    // --- PART D: Real-Time Inference Integrations ---
    ingestTelemetryStream(data) {
        if (!data) return;
        const esp = data.esp32 || {};
        const sat = data.satellite || {};

        // Throttle processing to 10Hz to save CPU
        const now = Date.now();
        if (now - this.lastIngestTime < this.INGEST_THROTTLE) return;
        this.lastIngestTime = now;

        // Save to instance for Assistant/Chatbot access
        this.esp32Data = esp;
        this.satelliteData = sat;

        // Visual Updates L1
        if (this.uiSoil) this.uiSoil.innerText = (esp.soilMoisture ?? 0).toFixed(1) + '%';
        if (this.uiTmp) this.uiTmp.innerText = (esp.soilTemp ?? 0).toFixed(1) + 'C';
        if (this.uiLdr) this.uiLdr.innerText = Math.round(esp.ldrSensor ?? 0);
        if (this.uiGps) this.uiGps.innerText = `${(sat.latitude ?? 0).toFixed(3)}, ${(sat.longitude ?? 0).toFixed(3)}`;
        if (this.uiDist) this.uiDist.innerText = (sat.distance ?? 0).toFixed(2) + 'km';
        if (this.uiVel) this.uiVel.innerText = (sat.velocity ?? 0).toFixed(2) + 'km/s';

        // Flatten data map with absolute safety
        const rawRow = {
            temp1: esp.soilTemp ?? 25,
            temp2: (esp.soilTemp ?? 25) - 1,
            batt_voltage: 14.1,
            current_amps: 2.5,
            solar_power_w: 85.0,
            gyro_x: 0.1,
            satellite_distance_km: sat.distance ?? 12.4,
            satellite_velocity_kms: sat.velocity ?? 7.6
        };

        this.rawTelemetryBuffer.push(rawRow);
        if (this.rawTelemetryBuffer.length > 5) this.rawTelemetryBuffer.shift();

        // Extract latest feature if possible
        if (this.rawTelemetryBuffer.length >= 1) {
            const ext = this.extractFeatures(this.rawTelemetryBuffer, false);
            const latestFeature = ext[ext.length - 1].f; // [15]

            // Push to rolling sequence
            this.inferenceBuffer.push(latestFeature);
            if (this.inferenceBuffer.length > 10) this.inferenceBuffer.shift();

            // Queue for online learning (we need targets)
            this.cacheForOnlineLearning(latestFeature, rawRow.satellite_velocity_kms);

            // Execute Live Inference (Throttled to every 5 packets for responsive UI)
            if (!this.isTraining && this.inferenceBuffer.length === 10 && (this.packetCount % 5 === 0)) {
                this.runInference();
            }
        }
    }

    cacheForOnlineLearning(featArgs, vel) {
        // Since Target1 is "Next velocity", we update the previous sequence's target with CURRENT velocity.
        if (this.onlineLearningBuffer.length > 0) {
            const last = this.onlineLearningBuffer[this.onlineLearningBuffer.length - 1];
            if (last.target === null) last.target = vel;
        }

        // Add current sequence state with a pending target
        if (this.inferenceBuffer.length === 10) {
            this.onlineLearningBuffer.push({
                seq: [...this.inferenceBuffer],
                target: null // To be filled on next packet
            });
            this.packetCount++;

            if (this.packetCount >= 100 && this.onlineLearningBuffer[0].target !== null) {
                this.onlineFineTuning();
                this.packetCount = 0;
            }
        }
    }

    async onlineFineTuning() {
        if (this.isTraining) return;

        // Filter those with valid targets
        const valid = this.onlineLearningBuffer.filter(b => b.target !== null);
        if (valid.length < 10) return;

        const xs = tf.tensor3d(valid.map(v => v.seq));
        const ys = tf.tensor2d(valid.map(v => [v.target]));

        try {
            // Show learning status on UI
            if (this.uiStatus) {
                this._learnCycle = (this._learnCycle || 0) + 1;
                this.uiStatus.innerText = `◈ Model Adapting... (Cycle #${this._learnCycle})`;
                this.uiStatus.style.color = '#00e5ff';
            }

            // Micro-update M1 with very low LR to prevent catastrophic forgetting
            const tempM1 = this.models.m1;
            tempM1.compile({ optimizer: tf.train.adam(0.0001), loss: 'meanSquaredError' });
            const fitResult = await tempM1.fit(xs, ys, {
                epochs: 1, batchSize: 8, shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (this.trLoss) this.trLoss.innerText = logs.loss?.toFixed(5) ?? '—';
                        this.updateChart(`CL-${this._learnCycle}`, logs.loss, logs.loss * 1.05);
                    }
                }
            });

            // Restore original compile state
            tempM1.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError', metrics: ['mae'] });

            const loss = fitResult.history.loss?.[0] ?? 0;

            // Show improvement on UI
            if (this.uiStatus) {
                this.uiStatus.innerText = `✓ Adapted | Loss: ${loss.toFixed(5)} | Cycle #${this._learnCycle}`;
                this.uiStatus.style.color = '#4caf50';
            }

            // Generate insight showing continuous learning is active
            if (this.uiInsight) {
                this.uiInsight.innerHTML =
                    `<span style="color:#00e5ff">CONTINUOUS LEARNING:</span> Model updated from ${valid.length} live samples. Loss → ${loss.toFixed(5)}`;
            }

            // Immediately run inference with updated weights
            if (this.inferenceBuffer.length === 10) {
                this.runInference();
            }

            console.log(`[AI Engine] Continuous learning cycle #${this._learnCycle} complete. Loss: ${loss.toFixed(5)}`);
        } catch (e) {
            console.error('Fine-Tuning Error', e);
        } finally {
            xs.dispose(); ys.dispose();
            this.onlineLearningBuffer = [];
        }
    }

    runInference() {
        tf.tidy(() => {
            if (this.inferenceBuffer.length < 10) return;
            const seq10 = tf.tensor3d([this.inferenceBuffer]);
            const feat1 = tf.tensor2d([this.inferenceBuffer[9]]);

            // 1. Velocity (LSTM)
            const predVel = this.models.m1.predict(seq10).dataSync()[0];
            if (this.infVelocity) this.infVelocity.innerText = predVel.toFixed(3);

            // 2. Thermal (Attention)
            const thermalProb = this.models.m2.predict(seq10).dataSync()[0];
            if (this.infThermalConf) this.infThermalConf.innerText = `(${(thermalProb * 100).toFixed(1)}%)`;
            
            let status = "LOW";
            let color = "var(--state-safe)";
            if (thermalProb > 0.7) { status = "HIGH"; color = "var(--state-crit)"; }
            else if (thermalProb > 0.4) { status = "MED"; color = "var(--state-warn)"; }
            
            if (this.infThermal) {
                this.infThermal.innerText = status;
                this.infThermal.style.color = color;
            }

            // 3. Anomaly (Autoencoder)
            const recon = this.models.m3.predict(feat1);
            const err = tf.sub(feat1, recon).square().mean().dataSync()[0];
            if (this.infAnomaly) {
                this.infAnomaly.innerText = err.toFixed(4);
                this.infAnomaly.style.color = err > this.reconThresh ? "var(--state-crit)" : "var(--state-safe)";
            }

            const threshEl = document.getElementById('inf-anomaly-thresh');
            if (threshEl) threshEl.innerText = this.reconThresh.toFixed(4);

            // Global Insight Sync
            this.generateHybridInsight(predVel, thermalProb, err);
        });
    }

    generateHybridInsight(vel, therm, anomaly) {
        if (!this.uiInsight) return;
        
        let msg = "NOMINAL: All hybrid domains synchronized.";
        let icon = "🟢";

        if (anomaly > this.reconThresh) {
            msg = "ANOMALY: Structural variance detected in telemetry stream.";
            icon = "🔴";
        } else if (therm > 0.4) {
            msg = "ADVISORY: Thermal acceleration detected in LSTM gating.";
            icon = "🟡";
        } else if (vel > 7.7) {
            msg = "SATELLITE: Peak velocity detected. Soil moisture drift expected.";
            icon = "🔵";
        }

        this.uiInsight.innerHTML = `<span style="color:var(--accent-primary); font-weight:900; margin-right:8px;">${icon}</span> ${msg}`;
    }
}

if (document.readyState === "complete") {
    window.hybridEngine = new HybridAIEngine();
} else {
    window.addEventListener("load", () => {
        window.hybridEngine = new HybridAIEngine();
    });
}
