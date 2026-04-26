// --- Global State ---
let pendingTelemetryUpdate = null;
window.globalSystemState = 'norm';

// System Clock Updater
function updateClocks() {
    const now = new Date();
    const utcEl = document.getElementById('utc-time');
    if (utcEl) utcEl.innerText = now.toISOString().substr(11, 8);
}

setInterval(updateClocks, 1000);
updateClocks();

// App Version Fetcher
async function initAppVersion() {
    const versionEl = document.getElementById('app-version');
    if (!versionEl || !window.electronAPI?.getAppVersion) return;
    try {
        const ver = await window.electronAPI.getAppVersion();
        versionEl.innerText = `v${ver}`;
    } catch (e) {
        console.error('[DASHBOARD] Failed to fetch version:', e);
    }
}
initAppVersion();

// Global Hardware Linkage
async function initHWStatus() {
    const hwEl = document.getElementById('hw-status');
    const hwRibbon = document.getElementById('hw-status-ribbon');
    if (!hwEl && !hwRibbon) return;

    try {
        // Mock hardware check or real TF check if available
        const statusText = "HW: " + (typeof tf !== 'undefined' ? "GPU ACTIVE" : "CPU ONLY");
        const statusColor = typeof tf !== 'undefined' ? "var(--state-safe)" : "var(--state-warn)";
        
        if (hwEl) {
            hwEl.innerText = statusText;
            hwEl.style.color = statusColor;
        }
        if (hwRibbon) {
            hwRibbon.innerText = "STATUS: " + (typeof tf !== 'undefined' ? "NOMINAL" : "EMULATED");
            hwRibbon.style.color = statusColor;
        }
    } catch(e) {}
}
setTimeout(initHWStatus, 1500);

// Hook up terminal button
const termBtn = document.getElementById('btn-open-terminal');
if (termBtn) {
    termBtn.addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openTerminal) {
            window.electronAPI.openTerminal();
        }
    });
}

// Telemetry Data Simulation & Management
const telemetrySources = [
    { id: 'temp1', label: 'TEMP-1 (C)', initial: 24.5, history: [], minLimit: 10, maxLimit: 35 },
    { id: 'temp2', label: 'TEMP-2 (C)', initial: 22.1, history: [], minLimit: -5, maxLimit: 40 },
    { id: 'humidity', label: 'HUMIDITY (%)', initial: 60.0, history: [], minLimit: 20, maxLimit: 80 },
    { id: 'soilMoisture', label: 'SOIL-M (%)', initial: 50.0, history: [], minLimit: 30, maxLimit: 80 },
    { id: 'ldrSensor', label: 'LIGHT', initial: 500, history: [], minLimit: 100, maxLimit: 900 },
    { id: 'ultrasonic', label: 'DISTANCE (CM)', initial: 100.0, history: [], minLimit: 10, maxLimit: 400 },
    { id: 'battv', label: 'BATT-V (V)', initial: 14.1, history: [], minLimit: 11.5, maxLimit: 15.0 },
    { id: 'current', label: 'CURRENT (A)', initial: 2.54, history: [], minLimit: 0, maxLimit: 5.0 },
    { id: 'solarp', label: 'SOLAR-P (W)', initial: 85.0, history: [], minLimit: 0, maxLimit: 120.0 },
    { id: 'gyrox', label: 'GYRO-X', initial: 0.02, history: [], minLimit: -1, maxLimit: 1 },
    { id: 'gyroy', label: 'GYRO-Y', initial: 0.00, history: [], minLimit: -1, maxLimit: 1 },
    { id: 'gyroz', label: 'GYRO-Z', initial: -0.01, history: [], minLimit: -1, maxLimit: 1 }
];
// Expose globally so analytics.js can read the live history arrays
window.telemetrySources = telemetrySources;





// --- Global HUD Particles (Cyber-BG) ---
function initCyberBG() {
    const canvas = document.getElementById('cyber-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    for (let i = 0; i < 30; i++) { // Reduced from 50 for CPU headroom
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            size: Math.random() * 1.5
        });
    }

    let cybBgRafId = null;
    let cybBgVisible = true;
    const observer = new IntersectionObserver(entries => {
        cybBgVisible = entries.some(e => e.isIntersecting);
        if (cybBgVisible && !cybBgRafId) {
            cybBgRafId = requestAnimationFrame(animate);
        }
    }, { threshold: 0.01 });
    observer.observe(canvas);

    function animate() {
        if (!cybBgVisible) { cybBgRafId = null; return; }
        cybBgRafId = requestAnimationFrame(animate);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
            if (p.y < 0) p.y = canvas.height;
            if (p.y > canvas.height) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    cybBgRafId = requestAnimationFrame(animate);
}

function render2DStarfieldFallback() {
    const containers = ['orbit-3d-canvas', 'satellite-3d-canvas', 'path-3d-canvas'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = el.clientWidth;
        canvas.height = el.clientHeight;
        el.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        const stars = [];
        for (let i = 0; i < 100; i++) stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, s: Math.random() * 1.5 });

        function draw() {
            ctx.fillStyle = '#05050a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
            stars.forEach(s => {
                s.x -= 0.2; if (s.x < 0) s.x = canvas.width;
                ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2); ctx.fill();
            });

            // Draw a simple 2D "Planet" wireframe loop to show it's active
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.15)';
            ctx.lineWidth = 1;
            const cx = canvas.width / 2; const cy = canvas.height / 2;
            ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.ellipse(cx, cy, 120, 40, Math.PI / 6, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#00e5ff';
            ctx.font = '10px monospace';
            ctx.fillText("3D FALLBACK: 2D ENGINE ACTIVE", 10, 20);

            requestAnimationFrame(draw);
        }
        draw();
    });
}

function initTelemetry() {
    try {
        const grids = document.querySelectorAll('.telemetry-grid');
        if (grids.length === 0) {
            console.warn('[DASHBOARD] No telemetry-grid found in DOM.');
            return;
        }

        grids.forEach((grid, index) => {
            grid.innerHTML = '';
            telemetrySources.forEach((src) => {
                if (index === 0) src.history = Array(20).fill(src.initial);
                const card = document.createElement('div');
                card.className = 'tel-card';
                card.innerHTML = `
                    <div class="tel-card-content">
                        <span class="label">${src.label}</span>
                        <div class="tel-main-val">
                            <span class="value" id="val-${src.id}-${index}">--.--</span>
                            <span class="trend-arrow" id="trend-${src.id}-${index}"></span>
                        </div>
                    </div>
                    <div class="tel-stats" id="tt-${src.id}-${index}">
                        MIN: -- | MAX: --
                    </div>
                    <canvas class="sparkline-canvas" id="spark-${src.id}-${index}"></canvas>
                `;
                grid.appendChild(card);

                // Draw initial flat sparkline
                setTimeout(() => drawSparkline(`spark-${src.id}-${index}`, src.history, 'cyan'), 50);
            });
        });
    } catch (err) {
        console.error('[DASHBOARD] Failed to initialize telemetry UI:', err);
    }

    if (window.electronAPI && window.electronAPI.onTelemetryData) {
        window.electronAPI.onTelemetryData((data) => {
            // Priority 1: Check for satellite.sys structure (Standard format)
            if (data && data.satellite && data.satellite.sys) {
                pendingTelemetryUpdate = { ...data.satellite.sys };
            }
            // Priority 2: Check for top-level sys (Fallback format)
            else if (data && data.sys) {
                pendingTelemetryUpdate = { ...data.sys };
            }
            // Priority 3: Check for satellite-only (Alternative format)
            else if (data && data.satellite) {
                pendingTelemetryUpdate = { ...data.satellite };
            }

            // MERGE ALL ESP32 SENSOR DATA FOR UI DISPLAY
            if (data && data.esp32) {
                if (!pendingTelemetryUpdate) pendingTelemetryUpdate = {};

                const safeAssign = (key, ...vals) => {
                    for (const v of vals) {
                        if (v !== undefined && v !== null) {
                            pendingTelemetryUpdate[key] = v;
                            return;
                        }
                    }
                };

                // Core sensors
                safeAssign('temp1',       data.esp32.temp1,       data.esp32.soilTemp,     data.esp32.soil_temp);
                safeAssign('temp2',       data.esp32.temp2,       data.esp32.ambientTemp);
                safeAssign('humidity',    data.esp32.humidity,    data.esp32.hum);
                safeAssign('soilMoisture',data.esp32.soilMoisture,data.esp32.soil_moisture);
                safeAssign('ldrSensor',   data.esp32.ldrSensor,   data.esp32.ldr_sensor,   data.esp32.ldr);
                safeAssign('ultrasonic',  data.esp32.ultrasonic,  data.esp32.distance);
                // Power sensors
                safeAssign('battv',       data.esp32.battv,       data.esp32.batt,         data.esp32.volt);
                safeAssign('current',     data.esp32.current,     data.esp32.curr,         data.esp32.amp);
                safeAssign('solarp',      data.esp32.solarp,      data.esp32.solar,        data.esp32.power);
                // IMU sensors
                safeAssign('gyrox',       data.esp32.gyrox,       data.esp32.gyro_x,       data.esp32.gx);
                safeAssign('gyroy',       data.esp32.gyroy,       data.esp32.gyro_y,       data.esp32.gy);
                safeAssign('gyroz',       data.esp32.gyroz,       data.esp32.gyro_z,       data.esp32.gz);
            }

            // Sync AI page elements if they exist
            if (data && data.esp32) {
                ['soil', 'tmp', 'ldr'].forEach(key => {
                    const el = document.getElementById(`st-${key}`);
                    if (!el) return;
                    if (key === 'soil') el.innerText = `${(data.esp32.soilMoisture || data.esp32.soil_moisture || 0).toFixed(0)}%`;
                    if (key === 'tmp') el.innerText = `${(data.esp32.soilTemp || data.esp32.soil_temp || 0).toFixed(1)}C`;
                    if (key === 'ldr') {
                        const val = data.esp32.ldrSensor || data.esp32.ldr_sensor || 0;
                        el.innerText = val;
                        // Performance: apply immediate color shift if abnormal
                        el.style.color = val > 800 ? 'var(--state-crit)' : 'var(--accent-primary)';
                    }
                });
            }

            if (data && data.satellite) {
                ['gps', 'dist', 'vel'].forEach(key => {
                    const el = document.getElementById(`st-${key}`);
                    if (!el) return;
                    if (key === 'gps') el.innerText = `${data.satellite.latitude?.toFixed(2)}, ${data.satellite.longitude?.toFixed(2)}`;
                    if (key === 'dist') el.innerText = `${data.satellite.distance?.toFixed(1)}KM`;
                    if (key === 'vel') el.innerText = `${data.satellite.velocity?.toFixed(1)}KM/s`;
                });
            }
        });
    }

    // Animation loop for smooth UI updates
    function rAF_Loop() {
        if (pendingTelemetryUpdate) {
            updateTelemetryWithRealData(pendingTelemetryUpdate);

            // Mirror to large modal if open
            const modal = document.getElementById('telemetry-modal');
            if (modal && modal.style.display === 'flex') {
                updateLargeModalData(pendingTelemetryUpdate);
            }

            pendingTelemetryUpdate = null;
        }

        // Premium touch: CSS-class crit flicker (GPU-composited, no layout thrashing)
        if (window.globalSystemState === 'crit') {
            document.body.classList.add('crit-flicker');
        } else {
            document.body.classList.remove('crit-flicker');
        }

        requestAnimationFrame(rAF_Loop);
    }
    requestAnimationFrame(rAF_Loop);
}

function updateLargeModalData(sysData) {
    telemetrySources.forEach(src => {
        const newVal = sysData[src.id] || sysData[src.label.split(' ')[0].toLowerCase()];
        if (newVal === undefined) return;
        const valEl = document.getElementById(`val-large-${src.id}`);
        if (valEl) valEl.innerText = newVal.toFixed(2);
        drawSparkline(`spark-large-${src.id}`, src.history, newVal > src.maxLimit ? 'red' : 'cyan');
    });

    // Add to raw stream log
    const stream = document.getElementById('raw-stream');
    if (stream) {
        const entry = document.createElement('div');
        entry.className = 'mono x-small';
        entry.style.color = 'rgba(0,229,255,0.5)';
        entry.innerText = `> RX [${new Date().toISOString()}] HEX: ${Math.random().toString(16).substr(2, 8)}... SEQ: ${Math.floor(Math.random() * 999)}`;
        stream.prepend(entry);
        if (stream.children.length > 50) stream.lastChild.remove();
    }
}

function updateTelemetryWithRealData(sysData) {
    if (!sysData) return;

    telemetrySources.forEach(src => {
        // Find newVal with fallback support (supporting 0 as a valid value)
        const getVal = (k1, k2) => {
            if (sysData[k1] !== undefined && sysData[k1] !== null) return sysData[k1];
            if (sysData[k2] !== undefined && sysData[k2] !== null) return sysData[k2];
            return undefined;
        };

        const labelKey = src.label.split(' ')[0].toLowerCase().replace('-', '');
        const newVal = getVal(src.id, labelKey);
        
        if (newVal === undefined || newVal === null) return;

        // Ensure history exists
        if (!src.history) src.history = [];
        const oldVal = src.history.length > 0 ? src.history[src.history.length - 1] : newVal;
        const delta = newVal - oldVal;

        src.history.push(newVal);
        if (src.history.length > 20) src.history.shift();

        const grids = document.querySelectorAll('.telemetry-grid');
        grids.forEach((_, index) => {
            // Find by indexed ID (ribbon) or large modal ID
            const valEl = document.getElementById(`val-${src.id}-${index}`) || document.getElementById(`val-large-${src.id}`);
            const trendEl = document.getElementById(`trend-${src.id}-${index}`);
            const ttEl = document.getElementById(`tt-${src.id}-${index}`) || document.getElementById(`tt-large-${src.id}`);
            
            if (!valEl) return;

            valEl.innerText = newVal.toFixed(2);
            if (trendEl) trendEl.innerText = delta > 0 ? "↑" : (delta < 0 ? "↓" : "-");

            // Resolve target color based on limits
            let colorVar = '--accent-primary'; 
            if (newVal < src.minLimit || newVal > src.maxLimit) colorVar = '--state-crit';
            else if (newVal < src.minLimit * 1.2 || newVal > src.maxLimit * 0.8) colorVar = '--state-warn';

            const colorHex = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim() || '#00e5ff';

            valEl.style.color = colorHex;
            if (trendEl) trendEl.style.color = colorHex;

            const minH = Math.min(...src.history).toFixed(2);
            const maxH = Math.max(...src.history).toFixed(2);
            if (ttEl) ttEl.innerHTML = `<span class="muted" style="font-size:9px">MIN:</span> ${minH} <span class="muted" style="margin-left:5px; font-size:9px">MAX:</span> ${maxH}`;

            // Draw sparkline for both ribbon and large modal
            const sparkId = (index === 0) ? `spark-${src.id}-${index}` : `spark-large-${src.id}`;
            drawSparkline(sparkId, src.history, colorHex);
        });
    });
}

function drawSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width || 180;
    canvas.height = 35;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = (max - min) || 1;

    // Gradient Fill
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * canvas.width;
        const y = canvas.height - ((val - min) / range) * (canvas.height - 15) - 5;
        ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);

    // Convert hex to semi-transparent rgba for the fill
    let r = 255, g = 171, b = 0;
    if (color.startsWith('#')) {
        r = parseInt(color.slice(1, 3), 16);
        g = parseInt(color.slice(3, 5), 16);
        b = parseInt(color.slice(5, 7), 16);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.2)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fill();

    // Sharp Path
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * canvas.width;
        const y = canvas.height - ((val - min) / range) * (canvas.height - 15) - 5;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function animateRadarWaveform() {
    const canvas = document.getElementById('radar-waveform');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let offset = 0;

    function draw() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x++) {
            const y = canvas.height / 2 + Math.sin(x * 0.05 + offset) * 8 + (Math.random() - 0.5) * 3;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        offset += 0.1;
        requestAnimationFrame(draw);
    }
    draw();
}
animateRadarWaveform();

// UI Trigger hooks for Live Monitoring Modal overlay
window.openTelemetryModal = () => {
    const el = document.getElementById('telemetry-modal');
    if (el) el.style.display = 'flex';
};

window.closeTelemetryModal = () => {
    const el = document.getElementById('telemetry-modal');
    if (el) el.style.display = 'none';
};

// --- System Diagnostics & Health ---
window.openDiagModal = () => {
    document.getElementById('diag-modal').style.display = 'flex';
    runSystemDiagnostics();
};

window.closeDiagModal = () => {
    document.getElementById('diag-modal').style.display = 'none';
};

async function runSystemDiagnostics() {
    const setStatus = (id, text, color) => {
        const el = document.getElementById(`diag-status-${id}`);
        if (el) {
            el.innerText = text.toUpperCase();
            el.style.color = color;
        }
    };

    // 1. Python Check (via Health API)
    setStatus('python', 'SCANNING...', 'var(--state-warn)');
    try {
        const health = await window.electronAPI?.aiHealth();
        if (health && health.status !== 'offline') {
            setStatus('python', 'OPERATIONAL', 'var(--state-safe)');
        } else {
            setStatus('python', 'OFFLINE / NOT FOUND', 'var(--state-crit)');
        }
    } catch (e) {
        setStatus('python', 'CONNECTION ERROR', 'var(--state-crit)');
    }

    // 2. Database Check
    setStatus('db', 'SCANNING...', 'var(--state-warn)');
    try {
        const count = await window.electronAPI?.getDbRecordCount();
        if (count !== undefined) {
            setStatus('db', `CONNECTED (${count} RECS)`, 'var(--state-safe)');
        } else {
            setStatus('db', 'ACCESS DENIED', 'var(--state-crit)');
        }
    } catch (e) {
        setStatus('db', 'SPAWN ERROR (JET 4.0)', 'var(--state-crit)');
    }

    // 3. Serial / Simulation Check
    setStatus('serial', 'SCANNING...', 'var(--state-warn)');
    const hasHardware = window.telemetrySources.some(s => s.history.length > 5 && s.history[s.history.length - 1] !== s.initial);
    if (hasHardware) {
        setStatus('serial', 'LINK ACTIVE', 'var(--state-safe)');
    } else {
        setStatus('serial', 'SIMULATION ENABLED', 'var(--state-warn)');
    }
}

// Wire up the OPEN RAW TERMINAL button inside the modal (the one without an ID)
document.addEventListener('DOMContentLoaded', () => {
    initTeleGridLarge(); // Initialize the large grid in the modal
    // Find the terminal button inside the modal specifically
    const modal = document.getElementById('telemetry-modal');
    if (modal) {
        const termBtnModal = modal.querySelector('.action-btn');
        if (termBtnModal) termBtnModal.addEventListener('click', () => window.electronAPI?.openTerminal());
    }
});

function initTeleGridLarge() {
    const grid = document.getElementById('telemetry-grid-large');
    if (!grid) return;
    grid.innerHTML = '';
    telemetrySources.forEach((src) => {
        const card = document.createElement('div');
        card.className = 'tel-card';
        card.innerHTML = `
            <div class="tel-card-content">
                <span class="label">${src.label}</span>
                <div class="tel-main-val">
                    <span class="value cyan" id="val-large-${src.id}">${src.initial.toFixed(2)}</span>
                </div>
                <div class="tel-stats" id="tt-large-${src.id}" style="margin-bottom:10px;">
                    MIN: -- | MAX: --
                </div>
                <canvas class="sparkline-canvas" id="spark-large-${src.id}" style="height:60px;"></canvas>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- Enhanced Global System State ---
window.setSystemState = function (state) {
    const body = document.body;
    body.className = `theme-${state}`; // 'safe', 'warn', 'crit'

    const badge = document.getElementById('global-risk-badge');
    const ring = document.getElementById('ai-confidence-ring');
    const aiPulse = document.getElementById('ai-pulse');
    const aiSeverity = document.getElementById('ai-severity-badge');

    // Risk Meter Elements (optional — may not be present in all layouts)
    const riskMeter = document.querySelector('#collision-risk-meter .risk-circle');
    const riskVal = document.getElementById('collision-risk-value');
    const riskLabel = document.getElementById('collision-risk-label');

    // Remove all classes (null-safe)
    if (riskMeter) riskMeter.classList.remove('safe', 'warn', 'crit');
    if (aiSeverity) aiSeverity.classList.remove('badge-safe', 'badge-warn', 'badge-crit');

    if (state === 'safe') {
        window.globalSystemState = 'safe';
        if (badge) {
            badge.innerText = 'SYS: NOMINAL';
            badge.style.borderColor = 'var(--state-safe)';
            badge.style.color = 'var(--state-safe)';
        }
        if (ring) ring.style.stroke = 'var(--state-safe)';
        if (aiPulse) aiPulse.style.background = 'var(--state-safe)';
        if (aiSeverity) { aiSeverity.classList.add('badge-safe'); aiSeverity.innerText = 'SEVERITY: LOW'; }

        if (riskMeter) {
            riskMeter.classList.add('safe');
            if (riskVal) { riskVal.innerText = (Math.random() * 10 + 5).toFixed(1) + '%'; riskVal.style.color = 'var(--state-safe)'; }
            if (riskLabel) riskLabel.innerText = 'SAFE ZONE';
        }
    } else if (state === 'warn') {
        window.globalSystemState = 'warn';
        if (badge) {
            badge.innerText = 'SYS: WARNING';
            badge.style.borderColor = 'var(--state-warn)';
            badge.style.color = 'var(--state-warn)';
        }
        if (ring) ring.style.stroke = 'var(--state-warn)';
        if (aiPulse) aiPulse.style.background = 'var(--state-warn)';
        if (aiSeverity) { aiSeverity.classList.add('badge-warn'); aiSeverity.innerText = 'SEVERITY: MODERATE'; }

        if (riskMeter) {
            riskMeter.classList.add('warn');
            if (riskVal) { riskVal.innerText = (Math.random() * 20 + 30).toFixed(1) + '%'; riskVal.style.color = 'var(--state-warn)'; }
            if (riskLabel) riskLabel.innerText = 'ELEVATED RISK';
        }
    } else if (state === 'crit') {
        window.globalSystemState = 'crit';
        if (badge) {
            badge.innerText = 'SYS: CRITICAL';
            badge.style.borderColor = 'var(--state-crit)';
            badge.style.color = 'var(--state-crit)';
        }
        if (ring) ring.style.stroke = 'var(--state-crit)';
        if (aiPulse) aiPulse.style.background = 'var(--state-crit)';
        if (aiSeverity) { aiSeverity.classList.add('badge-crit'); aiSeverity.innerText = 'SEVERITY: CRITICAL'; }

        if (riskMeter) {
            riskMeter.classList.add('crit');
            if (riskVal) { riskVal.innerText = (Math.random() * 10 + 85).toFixed(1) + '%'; riskVal.style.color = 'var(--state-crit)'; }
            if (riskLabel) riskLabel.innerText = 'COLLISION IMMINENT';
        }

        // Trigger OS alert
        if (window.electronAPI && window.electronAPI.triggerAlert) {
            window.electronAPI.triggerAlert('CRITICAL SYSTEM FAILURE', 'Immediate admin intervention required in module TEMP-1');
        }
    }

    // Trigger pulse
    if (aiPulse) {
        aiPulse.classList.add('pulsing');
        setTimeout(() => aiPulse.classList.remove('pulsing'), 3000);
    }
};

window.triggerCinematicCrisis = function () {
    const rdss = document.getElementById('rdss-panel');
    if (rdss) {
        rdss.style.flex = "1.5";
        rdss.style.boxShadow = "0 0 40px rgba(255,23,68,0.2)";
    }
    const center = document.querySelector('.center-panel');
    if (center) {
        center.style.boxShadow = "inset 0 0 50px rgba(255,23,68,0.4)";
    }
    const rText = document.getElementById('xai-reasoning-text');
    if (rText) rText.style.display = 'block';
    const xaiBtn = document.getElementById('btn-xai-toggle');
    if (xaiBtn) xaiBtn.textContent = 'SIMPLE MODE';
};

window.resetCinematicCrisis = function () {
    const rdss = document.getElementById('rdss-panel');
    if (rdss) {
        rdss.style.flex = "1";
        rdss.style.boxShadow = "none";
    }
    const center = document.querySelector('.center-panel');
    if (center) {
        center.style.boxShadow = "none";
    }
};

// --- Optimized Drag and Drop (Fix for "Buttons Not Working") ---
function initHardwareLink() {
    const hwStatusEl = document.getElementById('hw-status');
    const hwRibbonEl = document.getElementById('hw-status-ribbon');
    if (!hwStatusEl && !hwRibbonEl) return;

    function updateUI(info) {
        if (info.status === 'connected') {
            const statusText = info.device ? `HW: ${info.device.toUpperCase()}` : 'HW: CONNECTED';
            if (hwStatusEl) {
                hwStatusEl.innerText = statusText;
                hwStatusEl.style.color = 'var(--state-safe)';
                hwStatusEl.title = `Connected via ${info.port}`;
            }
            if (hwRibbonEl) {
                hwRibbonEl.innerText = 'STATUS: HARDWARE CONNECTED';
                hwRibbonEl.style.color = 'var(--state-safe)';
                hwRibbonEl.style.borderColor = 'var(--state-safe)';
                hwRibbonEl.style.background = 'rgba(0, 230, 118, 0.1)';
            }
            console.log("[DASHBOARD] Hardware Link Established.");
        } else {
            if (hwStatusEl) {
                hwStatusEl.innerText = 'HW: DISCONNECTED';
                hwStatusEl.style.color = 'var(--state-warn)';
                hwStatusEl.title = 'No hardware detected. Running in simulation mode.';
            }
            if (hwRibbonEl) {
                hwRibbonEl.innerText = 'STATUS: HARDWARE NOT CONNECTED';
                hwRibbonEl.style.color = 'var(--state-warn)';
                hwRibbonEl.style.borderColor = 'var(--state-warn)';
                hwRibbonEl.style.background = 'rgba(255, 171, 0, 0.05)';
            }
        }
    }

    // Initial check
    if (window.electronAPI && window.electronAPI.getHardwareStatus) {
        window.electronAPI.getHardwareStatus().then(updateUI);
    }

    // Live updates
    if (window.electronAPI && window.electronAPI.onHardwareStatusUpdate) {
        window.electronAPI.onHardwareStatusUpdate(updateUI);
    }
}

// Example IPC Receiver if active
if (window.electronAPI && window.electronAPI.onRiskLevelChange) {
    window.electronAPI.onRiskLevelChange((level) => {
        window.setSystemState(level);
    });
}

// --- Optimized Drag and Drop (Fix for "Buttons Not Working") ---
function initDraggableLayout() {
    const panels = document.querySelectorAll('.glass-panel');
    let draggedItem = null;

    panels.forEach(panel => {
        panel.setAttribute('draggable', 'true');

        // Use capture: true only for drag events to avoid blocking clicks
        panel.addEventListener('dragstart', (e) => {
            // ONLY start drag if clicking a "header" or empty space, not an input/button
            if (['BUTTON', 'INPUT', 'SELECT', 'A'].includes(e.target.tagName)) {
                e.preventDefault();
                return;
            }
            draggedItem = panel;
            panel.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        }, false);

        panel.addEventListener('dragend', () => {
            panel.style.opacity = '1';
            draggedItem = null;
        });

        panel.addEventListener('dragover', (e) => {
            e.preventDefault(); // Required to allow drop
            return false;
        });

        panel.addEventListener('drop', function (e) {
            e.preventDefault();
            if (draggedItem && draggedItem !== this) {
                const parent = this.parentNode;
                const all = Array.from(parent.children);
                const fromIdx = all.indexOf(draggedItem);
                const toIdx = all.indexOf(this);

                if (fromIdx < toIdx) parent.insertBefore(draggedItem, this.nextSibling);
                else parent.insertBefore(draggedItem, this);
            }
            return false;
        });
    });
}
document.addEventListener('DOMContentLoaded', () => {
    initTelemetry();
    initCyberBG();
    initHardwareLink();

    // Check for library failures (from handleLibError in index.html)
    if (window.THREE_FAILED) {
        console.warn("[Resilience] Three.js missing. Rendering 2D Simulation Fallback.");
        render2DStarfieldFallback();
    }
});

// --- MOCK TELEMETRY ENGINE (For Browser / Non-Electron Deployment) ---
function startMockDataEngine() {
    if (window.electronAPI) return; 

    console.log("[MOCK] Starting Neural Data Simulation...");
    setInterval(() => {
        try {
            const mockData = {
                temp1: 18 + Math.random() * 5,
                temp2: 17 + Math.random() * 5,
                humidity: 45 + Math.random() * 10,
                soilMoisture: 35 + Math.random() * 10,
                soilTemp: 22 + (Math.random() - 0.5),
                ldrSensor: 700 + Math.floor(Math.random() * 100),
                ultrasonic: 395 + Math.random() * 5,
                battv: 14.2,
                current: 2.5,
                solarp: 88,
                gyrox: 0.01,
                gyroy: 0.02,
                gyroz: 0.01,
                gps: "12.97, 77.59",
                distance: 12.4 + (Math.random() * 0.1),
                velocity: 7.6 + (Math.random() * 0.01)
            };

            // Force update globals
            pendingTelemetryUpdate = mockData;

            // Immediate manual update for common HUD elements
            const hud = {
                'st-soil': `${mockData.soilMoisture.toFixed(1)}%`,
                'st-tmp': `${mockData.soilTemp.toFixed(1)}°C`,
                'st-ldr': Math.floor(mockData.ldrSensor),
                'st-dist': `${mockData.distance.toFixed(1)} KM`,
                'st-vel': `${mockData.velocity.toFixed(2)} KM/s`,
                'st-gps': mockData.gps
            };
            for(let id in hud) {
                const el = document.getElementById(id);
                if(el) el.innerText = hud[id];
            }

            // Sync with terminal
            window.dispatchEvent(new CustomEvent('telemetry-update', { 
                detail: { satellite: { sys: mockData, distance: mockData.distance, velocity: mockData.velocity, latitude: 12.97, longitude: 77.59 }, esp32: mockData } 
            }));
        } catch(e) { console.error("Mock Engine Error:", e); }
    }, 1000);
}
startMockDataEngine();
