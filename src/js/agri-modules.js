/**
 * AGRI-INTELLIGENCE AUTO-ENGINE
 * Zero-button, fully autonomous agricultural AI prediction system.
 * Predictions update automatically as live sensor data flows in.
 * Models continuously upgrade from synthetic → real telemetry knowledge.
 */

class AgriAIModules {
    constructor() {
        // Throttle: prevent hammering backend with requests
        this._lastRun = {};
        this._MIN_INTERVAL = 5000; // Reduced from 15s to 5s (#15 fix) to allow faster telemetry triggers after staggered startup.

        // Live telemetry snapshot (populated by IPC stream)
        this.liveTele = {};
        this.predictionHistory = {}; // track last N predictions per module for trend

        this.initDOM();
        console.log('[Agri-AI] Module system initialized.');
    }

    initDOM() {
        console.log('[Agri-AI] Checking for module placeholders...');
        const btnPest = document.getElementById('btn-agri-pest');
        if (!btnPest) {
            console.log('[Agri-AI] Module placeholders not found (likely on Mission Dashboard). Skipping initialization.');
            return;
        }

        // Manual button overrides still work
        document.getElementById('btn-agri-pest')?.addEventListener('click', () => this.runPestDetection());
        document.getElementById('btn-agri-yield')?.addEventListener('click', () => this.runYieldEstimation());
        document.getElementById('btn-agri-irrig')?.addEventListener('click', () => this.runIrrigationScheduling());
        document.getElementById('btn-agri-soil')?.addEventListener('click', () => this.runSoilMonitoring());
        document.getElementById('btn-agri-map')?.addEventListener('click', () => this.runPrescriptionMap());
        document.getElementById('btn-agri-adv')?.addEventListener('click', () => this.runDecisionSupport());
        document.getElementById('btn-agri-clim')?.addEventListener('click', () => this.runClimateGuard());

        // Subscribe to live telemetry — predictions auto-update when sensor data changes
        if (window.electronAPI?.onTelemetryData) {
            window.electronAPI.onTelemetryData((data) => {
                this._onTelemetry(data);
            });
        }

        // Initial auto-scan: stagger modules so they don't all hit the backend at once
        this._staggeredStartup();
    }

    // Live telemetry handler — triggers targeted predictions when key values change
    _onTelemetry(data) {
        if (!data) return;
        const tele = {
            soilMoisture: data.esp32?.soilMoisture ?? this.liveTele.soilMoisture ?? 40,
            soilTemp: data.esp32?.soilTemp ?? this.liveTele.soilTemp ?? 25,
            ldrSensor: data.esp32?.ldrSensor ?? this.liveTele.ldrSensor ?? 700,
            velocity: data.satellite?.velocity ?? this.liveTele.velocity ?? 7.6,
            temp1: data.satellite?.sys?.temp1 ?? this.liveTele.temp1 ?? 24,
            batt: data.satellite?.sys?.battv ?? this.liveTele.batt ?? 14.0,
            solar: data.satellite?.sys?.solarp ?? this.liveTele.solar ?? 85,
        };

        const prev = this.liveTele;
        this.liveTele = tele;

        // Smart trigger: only re-predict the modules that CARE about what changed
        const soilChanged = Math.abs((tele.soilMoisture - (prev.soilMoisture || 0))) > 2;
        const tempChanged = Math.abs((tele.soilTemp - (prev.soilTemp || 0))) > 1;
        const lightChanged = Math.abs((tele.ldrSensor - (prev.ldrSensor || 0))) > 50;
        const satChanged = Math.abs((tele.velocity - (prev.velocity || 0))) > 0.05;

        if (soilChanged || tempChanged) {
            this.runSoilMonitoring();
            this.runYieldEstimation();
            this.runIrrigationScheduling();
        }
        if (lightChanged) {
            this.runClimateGuard();
        }
        if (soilChanged && tempChanged) {
            this.runPestDetection();
        }
        if (satChanged) {
            this.runDecisionSupport();
            this.runPrescriptionMap();
        }

        // 3. Neural Pipeline: Fire particles from sensors to core
        if (soilChanged || tempChanged || lightChanged) {
            if (window.experienceMgr) {
                window.experienceMgr.fireDataBurst('st-soil', 'backend-status-badge');
            }
        }
    }

    // Startup: stagger the 7 modules over 20 seconds so they initialize gently
    _staggeredStartup() {
        const modules = [
            () => this.runPestDetection(),
            () => this.runYieldEstimation(),
            () => this.runSoilMonitoring(),
            () => this.runClimateGuard(),
            () => this.runDecisionSupport(),
            () => this.runIrrigationScheduling(),
            () => this.runPrescriptionMap(),
        ];
        modules.forEach((fn, i) => setTimeout(fn, 3000 + i * 3000));

        // Fallback: periodic refresh every 45s for any module that didn't trigger via telemetry
        setInterval(() => {
            this.runPrescriptionMap();   // map rarely changes via telemetry trigger
            this.runDecisionSupport();
        }, 45000);

        console.log('[Agri-AI] Auto-prediction active. Modules will update on sensor change.');
    }

    // Throttle guard — prevents duplicate rapid calls per module
    _canRun(key) {
        const now = Date.now();
        if (this._lastRun[key] && (now - this._lastRun[key]) < this._MIN_INTERVAL) return false;
        this._lastRun[key] = now;
        return true;
    }

    // Returns live payload built from current sensor snapshot
    _buildPayload(extras = {}) {
        return {
            soil_moisture: this.liveTele.soilMoisture ?? 40,
            soil_temp: this.liveTele.soilTemp ?? 25,
            ldr_sensor: this.liveTele.ldrSensor ?? 700,
            temp1: this.liveTele.temp1 ?? 24,
            batt_voltage: this.liveTele.batt ?? 14.0,
            solar_power: this.liveTele.solar ?? 85,
            velocity: this.liveTele.velocity ?? 7.6,
            timestamp: Date.now(),
            ...extras
        };
    }

    async runPestDetection() {
        if (!this._canRun('pest')) return;
        this.updateStatus('pest', '⟳ Scanning...');
        try {
            const result = await window.electronAPI?.aiPredict('pest', this._buildPayload({ image: 'LIVE_SENSOR_FEED' }));
            if (result) { 
                this.updateUI('pest', result); 
                this.logToDB('Pest Detection', result); 
                if (window.CloudMgr) window.CloudMgr.updateModelSource(result.cloud_active, result.model_used);
            }
        } catch (e) { this.updateStatus('pest', 'ERR'); }
    }

    async runYieldEstimation() {
        if (!this._canRun('yield')) return;
        this.updateStatus('yield', '⟳ Estimating...');
        try {
            const result = await window.electronAPI?.aiPredict('yield', this._buildPayload({ weather: 0.85, humidity: 60 }));
            if (result) { 
                this.updateUI('yield', result); 
                this.logToDB('Yield Estimation', result); 
                if (window.CloudMgr) window.CloudMgr.updateModelSource(result.cloud_active, result.model_used);
            }
        } catch (e) { this.updateStatus('yield', 'ERR'); }
    }

    async runIrrigationScheduling() {
        if (!this._canRun('irrig')) return;
        this.updateStatus('irrig', '⟳ Scheduling...');
        try {
            const result = await window.electronAPI?.aiPredict('irrigation', this._buildPayload({ humidity: 35 }));
            if (result) { 
                this.updateUI('irrig', result); 
                if (window.CloudMgr) window.CloudMgr.updateModelSource(result.cloud_active, result.model_used);
            }
        } catch (e) { this.updateStatus('irrig', 'ERR'); }
    }

    async runSoilMonitoring() {
        if (!this._canRun('soil')) return;
        this.updateStatus('soil', '⟳ Analyzing...');
        try {
            const result = await window.electronAPI?.aiPredict('soil', this._buildPayload({ n: 45, p: 30, k: 55, ph: 6.5 }));
            if (result) { 
                this.updateUI('soil', result); 
                if (window.CloudMgr) window.CloudMgr.updateModelSource(result.cloud_active, result.model_used);
            }
        } catch (e) { this.updateStatus('soil', 'ERR'); }
    }

    async runPrescriptionMap() {
        if (!this._canRun('map')) return;
        this.updateStatus('map', '⟳ Generating...');
        try {
            const result = await window.electronAPI?.aiPredict('maps', this._buildPayload({ zone_id: 'A1' }));
            if (result) { this.updateUI('map', result); }
        } catch (e) { this.updateStatus('map', 'ERR'); }
    }

    async runDecisionSupport() {
        if (!this._canRun('adv')) return;
        this.updateStatus('adv', '⟳ Compiling...');
        try {
            const result = await window.electronAPI?.aiPredict('advisory', this._buildPayload({ mission: 'Titan-1' }));
            if (result) { this.updateUI('adv', result); }
        } catch (e) { this.updateStatus('adv', 'ERR'); }
    }

    async runClimateGuard() {
        if (!this._canRun('clim')) return;
        this.updateStatus('clim', '⟳ Assessing...');
        try {
            const result = await window.electronAPI?.aiPredict('climate', this._buildPayload({ forecast_days: 7 }));
            if (result) { this.updateUI('clim', result); }
        } catch (e) { this.updateStatus('clim', 'ERR'); }
    }

    updateStatus(module, msg) {
        const el = document.getElementById(`agri-${module}-status`);
        if (el) el.innerText = msg;
    }

    updateUI(module, result) {
        const display = document.getElementById(`agri-${module}-result`);
        if (!display) return;
        if (result.error) {
            let errorMsg = result.error;
            if (errorMsg.includes('Neural Core Offline')) {
                errorMsg = "AI Engine Standby (Requires Python 3.10+)";
            }
            display.innerHTML = `<div class="glitch-error" style="font-size:10px; color:var(--state-warn); background:rgba(255,171,0,0.1); padding:5px; border-radius:4px; border:1px dashed var(--state-warn);">${errorMsg}</div>`;
            return;
        }

        // Apply Digital Sprout Animation
        display.classList.remove('agri-unfold');
        void display.offsetWidth; // Force reflow
        display.classList.add('agri-unfold');

        // Track prediction trend
        if (!this.predictionHistory[module]) this.predictionHistory[module] = [];
        const val = result.estimated_yield_kg_ha || result.soil_health_score || result.drought_risk_percentage || result.confidence_percentage || 0;
        this.predictionHistory[module].push(val);
        if (this.predictionHistory[module].length > 10) this.predictionHistory[module].shift();
        const trend = this.predictionHistory[module].length > 1
            ? (val > this.predictionHistory[module][this.predictionHistory[module].length - 2] ? '↑' : '↓')
            : '─';

        // build UI safely
        display.innerHTML = '';
        const itemsContainer = document.createElement('div');
        
        const addField = (label, val, color) => {
            const item = document.createElement('div');
            item.className = 'agri-item';
            item.innerHTML = `<span>${label}:</span> `;
            const valSpan = document.createElement('span');
            valSpan.innerText = val;
            if (color) valSpan.style.color = color;
            item.appendChild(valSpan);
            itemsContainer.appendChild(item);
        };

        if (module === 'pest') {
            const conf = result.confidence_percentage ?? 0;
            addField('DISEASE', result.disease_name || 'N/A');
            addField('CONF', `${conf}%`, conf > 80 ? '#4caf50' : '#ff9800');
            addField('ACTION', result.treatment_advisory || '—');
        } else if (module === 'yield') {
            addField('YIELD', `${result.estimated_yield_kg_ha ?? 0} kg/ha ${trend}`, 'var(--accent-primary)');
            addField('RISK', `${result.risk_percentage ?? '—'}%`);
        } else if (module === 'irrig') {
            addField('SCHEDULE', result.predict_irrigation_time || '—');
            addField('WATER', result.recommend_water_quantity || '—');
        } else if (module === 'soil') {
            const sc = result.soil_health_score ?? 0;
            addField('HEALTH', `${sc}/100 ${trend}`, sc > 80 ? '#4caf50' : '#ff9800');
            const fertilizer = document.createElement('div');
            fertilizer.className = 'agri-item';
            fertilizer.style.fontSize = '10px';
            fertilizer.innerText = result.fertilizer_recommendation || '—';
            itemsContainer.appendChild(fertilizer);
        } else if (module === 'map') {
            addField('ZONE', result.status || '—');
            addField('NDVI', result.geojson?.features?.[0]?.properties?.avg_ndvi ?? '—');
        } else if (module === 'adv') {
            const adv = document.createElement('div');
            adv.className = 'agri-item';
            adv.style.fontSize = '10px';
            adv.style.color = '#00e5ff';
            adv.innerText = result.advisory || 'Standby.';
            itemsContainer.appendChild(adv);
        } else if (module === 'clim') {
            const dr = result.drought_risk_percentage ?? 0;
            addField('DROUGHT', `${dr}%`, dr > 40 ? '#ff1744' : '#4caf50');
            addField('HEAT STRESS', result.heat_stress_alert || '—');
        }

        display.appendChild(itemsContainer);
        const ts = document.createElement('div');
        ts.style.cssText = 'font-size:9px;color:#555;margin-top:4px;';
        ts.innerText = `⟳ ${new Date().toLocaleTimeString()}`;
        display.appendChild(ts);

        const inf = result.inference_time;
        this.updateStatus(module, inf ? `✓ Live | ${inf}s` : '✓ Live');
    }

    logToDB(modelName, result) {
        if (window.electronAPI?.logPrediction) {
            window.electronAPI.logPrediction({
                modelName,
                inputs: JSON.stringify(this.liveTele),
                prediction: result.estimated_yield_kg_ha || result.soil_health_score || result.drought_risk_percentage || 0,
                confidence: (result.confidence_percentage / 100) || 0.95,
                label: result.disease_name || result.status || result.heat_stress_alert || 'NOMINAL'
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.agriModules = new AgriAIModules();
});
