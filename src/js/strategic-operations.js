/**
 * MASTER STRATEGIC OPERATIONS ENGINE (v2.0)
 * Deep AI Integration for Agriculture, Space Safety, and Geospatial Mapping.
 */

class MasterStrategicEngine {
    constructor() {
        this.data = {
            // Theme 3
            soilMoisture: 45,
            soilTemp: 22,
            soilEC: 1.2,
            soilPh: 6.5,
            weatherPred: 0.8, // 80% rain prob
            ldr: 650,
            cropType: 'WHEAT',
            
            // Theme 5
            orbitDist: 400.1,
            velocity: 7.6,
            debrisCount: 14,
            
            // Theme 6
            gps: { lat: 10.279, lon: 77.934 },
            ndvi: 0.73,
            evi: 0.68,
            ndwi: -0.1
        };

        this.initDOM();
        this.hookTelemetry();
        
        setInterval(() => this.processOperations(), 2000);
        this.processOperations();
        this.startClock();
        
        // Update global HW status if it exists
        const hw = document.getElementById('hw-status');
        if (hw) {
            hw.innerText = 'HW: INTEL UNIT ACTIVE';
            hw.style.color = 'var(--state-safe)';
        }
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

    initDOM() {
        const rightPanel = document.querySelector('.right-panel');
        if (!rightPanel) return;

        // Clear any old content and inject directly into the right-panel grid cell
        rightPanel.innerHTML = '';
        rightPanel.style.padding = '20px';
        rightPanel.style.boxSizing = 'border-box';
        rightPanel.style.display = 'flex';
        rightPanel.style.flexDirection = 'column';
        rightPanel.style.gap = '0';
        rightPanel.style.overflow = 'auto';
        rightPanel.style.animation = 'fadeInUp 0.5s ease-out';
        rightPanel.classList.add('glass-panel'); 

        rightPanel.innerHTML = `
            <div class="intelligence-mesh"></div>
            <!-- Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-shrink:0; position:relative; z-index:2;">
                <span class="mono spaced" style="font-size:13px; font-weight:900; color:#fff; letter-spacing:2px; text-shadow:0 0 10px rgba(0,229,255,0.4);">⬤ MASTER AI ENGINE HUB</span>
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--accent-primary); box-shadow:0 0 8px var(--accent-primary); animation:pulse 1.5s infinite;"></span>
            </div>

            <!-- Cards Grid — fills remaining height equally -->
            <div style="display:flex; flex-direction:column; gap:20px; flex:1; overflow:hidden; position:relative; z-index:2;">

                <!-- TH-03/06: AGRI & GIS -->
                <div class="str-card str-agri" style="flex:1;">
                    <div class="str-header">
                        <span class="str-title" style="color:var(--state-safe); font-size:10px;">[TH-03/06] AGRI-INTELLIGENCE &amp; GIS</span>
                        <span class="str-badge" style="color:var(--state-safe); border:1px solid var(--state-safe);">SYNC OK</span>
                    </div>
                    <div class="str-row" style="margin-bottom: 2px;"><span class="str-label">SOIL (M/T/EC/pH)</span></div>
                    <div id="agri-soil" class="str-val" style="text-align: left; font-size: 11px; margin-bottom: 8px;">--</div>
                    
                    <div class="str-grid-2">
                        <div>
                            <div class="str-row"><span class="str-label">IRRIG SCORE</span><span id="agri-irrig" class="str-val cyan">--</span></div>
                            <div class="str-bar-bg"><div id="bar-irrig" class="str-bar-fg" style="background:var(--accent-primary); width:0%;"></div></div>
                        </div>
                        <div>
                            <div class="str-row"><span class="str-label">PEI INDEX</span><span id="agri-pei" class="str-val green">--</span></div>
                            <div class="str-bar-bg"><div id="bar-pei" class="str-bar-fg" style="background:var(--state-safe); width:0%;"></div></div>
                        </div>
                    </div>
                    <div style="margin-top: 8px;">
                        <div class="str-row"><span class="str-label">GIS NDVI/EVI</span><span id="agri-gis" class="str-val amber">--</span></div>
                    </div>
                    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed rgba(255,255,255,0.08);">
                        <div class="str-row"><span class="str-label">AI YIELD EST.</span><span id="agri-yield" class="str-val" style="color:#fff; font-size:11px;">--</span></div>
                        <div class="str-row"><span class="str-label">ACTION PLAN</span><span id="agri-action" class="str-val cyan" style="font-size:10px;">--</span></div>
                    </div>
                </div>

                <!-- TH-05: SPACE DISASTER RESILIENCE -->
                <div class="str-card str-space" style="flex:1;">
                    <div class="str-header">
                        <span class="str-title" style="color:var(--state-crit); font-size:10px;">[TH-05] SPACE DISASTER RESILIENCE</span>
                        <span id="space-risk-badge" class="str-badge" style="color:var(--state-warn); border:1px solid var(--state-warn);">TRACKING</span>
                    </div>
                    <div class="str-row">
                        <span class="str-label">CONJUNCTION PROB</span>
                        <span id="space-prob" class="str-val red" style="font-size:16px; font-weight:900;">0.0000</span>
                    </div>
                    <div class="str-grid-2" style="margin-top:6px;">
                        <div>
                            <div class="str-row"><span class="str-label">ALTITUDE</span><span id="space-alt" class="str-val">--</span></div>
                            <div class="str-row"><span class="str-label">TTC (MINS)</span><span id="space-ttc" class="str-val amber">--</span></div>
                        </div>
                        <div>
                            <div class="str-row"><span class="str-label">DEBRIS CAT</span><span id="space-cat" class="str-val">--</span></div>
                            <div class="str-row"><span class="str-label">AI MANEUVER</span><span id="space-man" class="str-val cyan">--</span></div>
                        </div>
                    </div>
                    <div style="margin-top:8px; padding:8px 10px; background:rgba(255,23,68,0.05); border:1px solid rgba(255,23,68,0.2); border-radius:4px;">
                        <div class="str-row" style="margin:0;"><span class="str-label">AUTO CORRECTION</span><span id="space-path" class="str-val red">STANDBY</span></div>
                    </div>
                </div>

                <!-- TH-06: SPATIAL AI ANALYTICS -->
                <div class="str-card str-geo" style="flex:1;">
                    <div class="str-header">
                        <span class="str-title" style="color:var(--accent-primary); font-size:10px;">[TH-06] SPATIAL AI ANALYTICS</span>
                        <span class="str-badge" style="color:var(--accent-primary); border:1px solid var(--accent-primary);">GIS SYNC</span>
                    </div>
                    <div class="str-row"><span class="str-label">GANDHIGRAM, DINDIGUL</span><span id="geo-loc" class="str-val cyan">--</span></div>
                    <div class="str-grid-2" style="margin-top:6px;">
                        <div>
                            <div class="str-row"><span class="str-label">DISEASE PRED</span><span id="geo-dis" class="str-val">--</span></div>
                            <div class="str-bar-bg"><div id="bar-dis" class="str-bar-fg" style="background:#ff9800; width:0%;"></div></div>
                        </div>
                        <div>
                            <div class="str-row"><span class="str-label">DROUGHT MON</span><span id="geo-drt" class="str-val">--</span></div>
                            <div class="str-bar-bg"><div id="bar-drt" class="str-bar-fg" style="background:#f44336; width:0%;"></div></div>
                        </div>
                    </div>
                    <div class="str-row" style="margin-top:8px;">
                        <span class="str-label">AI FIELD HEALTH SCORE</span>
                        <span id="geo-health" class="str-val green" style="font-size:13px; font-weight:900;">--</span>
                    </div>
                </div>

            </div>
        `;
    }

    hookTelemetry() {
        if (window.electronAPI && window.electronAPI.onTelemetryData) {
            window.electronAPI.onTelemetryData((data) => {
                if(data.esp32) {
                    if(data.esp32.soilMoisture !== undefined) this.data.soilMoisture = data.esp32.soilMoisture;
                    if(data.esp32.soilTemp !== undefined) this.data.soilTemp = data.esp32.soilTemp;
                    if(data.esp32.ldrSensor !== undefined) this.data.ldr = data.esp32.ldrSensor;
                }
                if(data.satellite) {
                    if(data.satellite.latitude) this.data.gps.lat = data.satellite.latitude;
                    if(data.satellite.longitude) this.data.gps.lon = data.satellite.longitude;
                    if(data.satellite.distance) this.data.orbitDist = data.satellite.distance;
                    if(data.satellite.velocity) this.data.velocity = data.satellite.velocity;
                }
            });
        }
    }

    processOperations() {
        this.data.weatherPred = Math.sin(Date.now() / 10000) * 0.5 + 0.5;
        this.data.soilEC = (this.data.soilMoisture / 100) * 2;
        
        // --- 1. THEME 3: ADVANCED AGRICULTURE (Multi-Layer Soil) ---
        let irrigScore = (0.4 * this.data.soilMoisture) + (0.2 * this.data.soilTemp) + (0.2 * (this.data.soilEC * 10)) + (0.2 * (this.data.weatherPred * 100));
        
        let irrigAction = "IRRIG. DELAY (RAIN EXPECTED)";
        let actionCol = "var(--accent-primary)";
        if (irrigScore < 40 && this.data.weatherPred < 0.4) {
            irrigAction = "IRRIGATION ON (PRECISION DRIP)";
            actionCol = "var(--state-safe)";
        } else if (irrigScore > 75) {
            irrigAction = "WATER CONSERVATION MODE";
            actionCol = "var(--state-warn)";
        }

        this.updateEl('agri-soil', `${this.data.soilMoisture.toFixed(0)}% / ${this.data.soilTemp.toFixed(1)}C / ${this.data.soilEC.toFixed(1)} / ${this.data.soilPh}`);
        this.updateEl('agri-irrig', irrigScore.toFixed(1));
        this.updateEl('agri-action', irrigAction, actionCol);
        if(document.getElementById('bar-irrig')) document.getElementById('bar-irrig').style.width = `${Math.min(100, Math.max(0, irrigScore))}%`;

        // Crop Growth Intelligence (PEI)
        let tempEff = 1 - Math.abs(this.data.soilTemp - 24) / 24;
        let moistFactor = this.data.soilMoisture / 100;
        let pei = (this.data.ldr / 1000) * Math.max(0, tempEff) * Math.max(0.1, moistFactor);
        
        this.updateEl('agri-pei', pei.toFixed(3));
        if(document.getElementById('bar-pei')) document.getElementById('bar-pei').style.width = `${Math.min(100, Math.max(0, pei * 100))}%`;

        // GIS Vegetation Index
        this.data.ndvi = 0.5 + (pei * 0.4);
        this.data.evi = this.data.ndvi - 0.05;
        this.updateEl('agri-gis', `NDVI:${this.data.ndvi.toFixed(2)} EVI:${this.data.evi.toFixed(2)}`);

        // AI Crop Yield Prediction
        let yieldTons = 2.0 + (pei * 4.0) + (this.data.soilMoisture * 0.05);
        let conf = 85 + (pei * 10);
        let harvestWin = Math.max(0, 21 - (this.data.soilTemp - 20));
        this.updateEl('agri-yield', `${yieldTons.toFixed(2)} T/HA | CONF: ${conf.toFixed(1)}% | HARVEST: ${Math.round(harvestWin)}D`);


        // --- 2. THEME 5: SPACE DISASTER RISK REDUCTION ---
        let prob = 0.0001;
        let ttc = "--";
        let riskLvl = "LOW";
        let rColor = "var(--state-safe)";
        let pathMsg = "STANDBY";
        let manMsg = "NONE REQ";

        if (this.data.orbitDist < 395) {
            prob = (400 - this.data.orbitDist) * 0.005; 
            ttc = Math.max((this.data.orbitDist - 380) * 1.5, 0);
            if (ttc < 15) { riskLvl = "CRITICAL"; rColor = "var(--state-crit)"; }
            else { riskLvl = "MEDIUM"; rColor = "var(--state-warn)"; }
        }

        this.updateEl('space-prob', prob.toFixed(4), rColor);
        if (document.getElementById('space-risk-badge')) {
            document.getElementById('space-risk-badge').innerText = `RISK: ${riskLvl}`;
            document.getElementById('space-risk-badge').style.color = rColor;
            document.getElementById('space-risk-badge').style.borderColor = rColor;
        }

        this.updateEl('space-alt', `${this.data.orbitDist.toFixed(1)} KM`);
        this.updateEl('space-ttc', typeof ttc === 'number' ? ttc.toFixed(1) : ttc);
        this.updateEl('space-cat', `OBJ: ${this.data.debrisCount + Math.floor(prob*100)} (LEO)`);

        if (riskLvl === "CRITICAL") {
            pathMsg = `BURN: 3.2s | DIR: +Z | ΔV: 0.45 m/s`;
            manMsg = "EVASIVE ΔV";
            this.updateEl('space-path', pathMsg, "var(--state-crit)");
        } else if (riskLvl === "MEDIUM") {
            pathMsg = "CALCULATING SAFE ORBIT...";
            manMsg = "PLANNING...";
            this.updateEl('space-path', pathMsg, "var(--state-warn)");
        } else {
            this.updateEl('space-path', "NOMINAL TRAJECTORY", "var(--state-safe)");
        }
        this.updateEl('space-man', manMsg);


        // --- 3. THEME 6: GEOSPATIAL AI & ANALYTICS ---
        this.updateEl('geo-loc', `LAT ${this.data.gps.lat.toFixed(3)} | LON ${this.data.gps.lon.toFixed(3)}`);

        let droughtRisk = Math.max(0, 100 - (this.data.soilMoisture * 1.5));
        let diseaseRisk = (this.data.soilMoisture > 70 && this.data.soilTemp > 25) ? 65 + Math.random()*10 : 15 + Math.random()*5;

        this.updateEl('geo-dis', `${diseaseRisk.toFixed(1)}% PROB`);
        if(document.getElementById('bar-dis')) document.getElementById('bar-dis').style.width = `${diseaseRisk}%`;

        this.updateEl('geo-drt', `${droughtRisk.toFixed(1)}% RISK`);
        if(document.getElementById('bar-drt')) document.getElementById('bar-drt').style.width = `${Math.min(100, Math.max(0, droughtRisk))}%`;

        let healthScore = ((100 - diseaseRisk) + (100 - droughtRisk) + conf) / 3;
        let hsCol = healthScore > 75 ? "var(--state-safe)" : (healthScore > 50 ? "var(--state-warn)" : "var(--state-crit)");
        this.updateEl('geo-health', `${(healthScore / 100).toFixed(2)} (0.00-1.00)`, hsCol);

        // --- 4. GLOBAL OPERATION SUMMARY UPDATES ---
        this.updateEl('sum-space', riskLvl, rColor);
        this.updateEl('sum-agri', `${conf.toFixed(1)}%`, "var(--accent-primary)");
        this.updateEl('sum-geo', (healthScore / 100).toFixed(2), hsCol);

        // --- 5. COMPUTER VISION TRIGGER COORDINATION ---
        if (window.dispatchCVAnalysis) {
            window.dispatchCVAnalysis({
                ndvi: this.data.ndvi,
                yield: yieldTons,
                health: healthScore / 100,
                status: diseaseRisk > 50 ? 'PEST DETECTED' : 'HEALTHY CROP'
            });
        }
    }

    updateEl(id, text, color) {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = text;
            if (color) el.style.color = color;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.strategicOpsData = new MasterStrategicEngine();
    }, 500);
});
