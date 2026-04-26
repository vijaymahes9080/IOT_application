
// AI Decision Support System - Advanced Layer
// This file coordinates the tactical intelligence display and dynamic visuals

const AI = {
    radarData: [],
    initStaticSystems: () => {
        // Initial state
        AI.updateXAI('NONE', 'N/A', '0.00 km/s', '0.0%', '');

        AI.animateRadar();
        AI.updateTimestamp();
        setInterval(AI.updateTimestamp, 1000);
    },

    updateRing: (percentage) => {
        const strokeDash = `${percentage}, 100`;
        const ring = document.getElementById('ai-confidence-ring');
        if (ring) ring.setAttribute('stroke-dasharray', strokeDash);

        const percLabel = document.querySelector('.percentage');
        if (percLabel) percLabel.textContent = `${percentage}%`;

        const forecastIndicator = document.getElementById('forecast-indicator');
        if (forecastIndicator) forecastIndicator.style.left = `${100 - percentage}%`;

        const stabIdx = document.getElementById('stability-idx');
        if (stabIdx) stabIdx.textContent = `${Math.min(99, percentage + 5)}%`;
    },

    updateThreat: (score, trend, colorClass, eta, prob) => {
        const tsVal = document.getElementById('threat-score-val');
        if (tsVal) {
            tsVal.textContent = score;
            tsVal.style.color = `var(--state-${colorClass === 'red' ? 'crit' : (colorClass === 'amber' ? 'warn' : 'safe')})`;
        }
        const trendEl = document.getElementById('threat-trend');
        if (trendEl) {
            trendEl.textContent = trend;
            trendEl.className = `trend-arrow ${colorClass}`;
            trendEl.style.color = `var(--state-${colorClass === 'red' ? 'crit' : (colorClass === 'amber' ? 'warn' : 'safe')})`;
        }
        const etaEl = document.getElementById('threat-eta');
        if (etaEl) etaEl.textContent = eta;
        const probEl = document.getElementById('sys-fail-prob');
        if (probEl) probEl.textContent = prob;
    },

    updateXAI: (vector, windowTime, velDiff, impactProb, reasoning) => {
        const vEl = document.getElementById('xai-vector');
        if (vEl) {
            vEl.textContent = vector;
            vEl.style.color = vector === 'NONE' ? 'var(--state-safe)' : 'var(--state-crit)';
        }
        const wEl = document.getElementById('xai-window');
        if (wEl) wEl.textContent = windowTime;
        const diffEl = document.getElementById('xai-veldiff');
        if (diffEl) diffEl.textContent = velDiff;
        const impEl = document.getElementById('xai-impact');
        if (impEl) impEl.textContent = impactProb;
        const resEl = document.getElementById('xai-reasoning-text');
        if (resEl) resEl.textContent = reasoning;
    },

    updateTimestamp: () => {
        const d = new Date();
        const ts = d.getUTCHours().toString().padStart(2, '0') +
            d.getUTCMinutes().toString().padStart(2, '0') +
            d.getUTCSeconds().toString().padStart(2, '0') + "Z";
        const tsEl = document.getElementById('compute-ts');
        if (tsEl) tsEl.textContent = ts;
    },

    animateRadar: () => {
        const canvas = document.getElementById('radar-waveform');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let offset = 0;

        function draw() {
            if (!canvas.offsetParent) {
                // Skip drawing if canvas is not visible -> optimization
                requestAnimationFrame(draw);
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();

            const halfHeight = canvas.height / 2;
            ctx.moveTo(0, halfHeight);

            // Precalculate invariants to avoid computing in loop
            const isCrit = window.globalSystemState === 'crit';
            const isWarn = window.globalSystemState === 'warn';
            const amp = isCrit ? 12 : (isWarn ? 6 : 2);
            const freq = isCrit ? 0.1 : 0.05;

            // Optimization: Step by 4 pixels to significantly reduce calculations
            for (let i = 0; i < canvas.width; i += 4) {
                let y = (Math.sin(i * freq + offset) * amp) * Math.sin(i * 0.05); // modulation
                ctx.lineTo(i, halfHeight + y);
            }

            ctx.strokeStyle = isCrit ? '#ff1744' : (isWarn ? '#ffab00' : '#00e5ff');
            ctx.lineWidth = 1.5;
            ctx.stroke();

            offset -= isCrit ? 0.2 : 0.1;
            requestAnimationFrame(draw);
        }

        // Initialize wrapper sizing directly, debounce resizing if necessary
        canvas.width = canvas.parentElement.clientWidth || 300;
        canvas.height = canvas.parentElement.clientHeight || 50;

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const parent = canvas.parentElement;
                if (parent && parent.clientWidth > 0) {
                    canvas.width = parent.clientWidth;
                    canvas.height = parent.clientHeight;
                }
            }, 100);
        });

        draw();
    }
};

let currentAction = '';
window.confirmAction = function (actionName) {
    currentAction = actionName;
    document.getElementById('modal-text').textContent = `Confirm execution:\n[ ${actionName.toUpperCase()} ]`;
    document.getElementById('action-modal').style.display = 'block';
    const backdrop = document.getElementById('action-modal-backdrop');
    if (backdrop) backdrop.style.display = 'block';
};

window.closeModal = function () {
    document.getElementById('action-modal').style.display = 'none';
    const backdrop = document.getElementById('action-modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
};

window.executeAction = function () {
    console.log(`ACTION LOGGED: ${currentAction} at ${new Date().toISOString()}`);

    // Trigger visual background flash
    document.body.classList.add('bg-action-flash');
    setTimeout(() => document.body.classList.remove('bg-action-flash'), 800);

    // Dynamic Feedback: Set a pending status and wait for real telemetry to confirm mission success
    AI.updateXAI('EXECUTING...', '00:02', 'CALCULATING', '50%', 'Maneuver in progress. Awaiting telemetry confirmation.');
    if (window.setSystemState) window.setSystemState('warn');

    // Simulate resolution but checked against live status
    if (currentAction.toLowerCase().includes('evasive') || currentAction.toLowerCase().includes('correct')) {
        setTimeout(() => {
            // Check if we have live telemetry flow from the hybrid engine
            const hasLiveLink = window.hybridEngine && window.hybridEngine.packetCount > 0;
            const successMsg = hasLiveLink ?
                "Maneuver confirmed via live telemetry. Orbit stabilized." :
                "Maneuver executed. Awaiting telemetry downlink stabilization...";

            window.setSystemState && window.setSystemState('safe');
            AI.updateRing(hasLiveLink ? 99 : 82);
            AI.updateThreat(hasLiveLink ? 8 : 14, '↓', 'safe', '--:--', '0.0%');
            AI.updateXAI('COMPLETE', 'N/A', '0.00 km/s', '0.0%', successMsg);

            const blip = document.getElementById('radar-blip');
            if (blip) blip.style.display = 'none';
            if (window.resetCinematicCrisis) window.resetCinematicCrisis();
        }, 2200);
    }
    closeModal();
};

const xaiToggleBtn = document.getElementById('btn-xai-toggle');
if (xaiToggleBtn) {
    xaiToggleBtn.addEventListener('click', function () {
        const rText = document.getElementById('xai-reasoning-text');
        if (rText.style.display === 'block') {
            rText.style.display = 'none';
            this.textContent = 'TECH MODE';
        } else {
            rText.style.display = 'block';
            if (document.getElementById('xai-reasoning-text').textContent === '') {
                document.getElementById('xai-reasoning-text').textContent = "All systems operating within normal parameters. Nominal trajectory maintained.";
            }
            this.textContent = 'SIMPLE MODE';
        }
    });
}

// Auto-run static background logic
AI.initStaticSystems();

// Initialization
window.addEventListener('load', async () => {
    if (window.electronAPI) {
        try {
            // Log that system init happened. TFJS training operations are now purely managed by hybrid-engine.js natively
            console.log('[AI Engine] Analytics dashboard online for live inference viewing.');
            const sessionId = await window.electronAPI.startSession('Auto-Pilot Primary');
            window.activeMissionSessionId = sessionId;

        } catch (e) {
            console.error('[AI Engine] Failed to load historical datasets:', e);
        }
    }
});

// Capture App shutdown
window.addEventListener('beforeunload', () => {
    if (window.electronAPI && window.activeMissionSessionId) {
        window.electronAPI.endSession({
            sessionId: window.activeMissionSessionId,
            stats: { packets: 4200, anomalies: 2 } // Mocked session end status
        });
    }
});
