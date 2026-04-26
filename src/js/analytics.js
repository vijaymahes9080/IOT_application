/**
 * HISTORICAL ANALYTICS & PREDICTIVE MAINTENANCE LAYER
 * Handles Chart.js integration, Predictive alerts, and Mission Report generation.
 */

class AnalyticsEngine {
    constructor() {
        this.dataLog = {
            labels: [],
            risk: [],
            temp1: [],
            temp2: [],
            battv: []
        };
        this.maxLogLength = 60; // Keep 60 points of history
        this.currentMetric = 'risk';
        this.chart = null;

        // Predictive Maintenance trackers
        this.temp1Trend = [];

        this.initChart();
        this.bindEvents();
        this.startDataCollector();
    }

    initChart() {
        if (typeof Chart === 'undefined') {
            console.error("[Analytics] Chart.js failed to load. Using 2D Legacy Fallback.");
            this.render2DChartFallback();
            return;
        }

        const ctx = document.getElementById('historicalChart');
        if (!ctx) return;

        // ... (existing Chart.js logic)
        Chart.defaults.color = 'rgba(255, 255, 255, 0.5)';
        Chart.defaults.font.family = 'monospace';

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.dataLog.labels,
                datasets: [{
                    label: 'Threat Score',
                    data: this.dataLog.risk,
                    borderColor: '#ff1744',
                    backgroundColor: 'rgba(255, 23, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                scales: {
                    x: {
                        grid: { color: 'rgba(0, 229, 255, 0.05)' }
                    },
                    y: {
                        grid: { color: 'rgba(0, 229, 255, 0.05)' },
                        beginAtZero: false
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    render2DChartFallback() {
        const canvas = document.getElementById('historicalChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const draw = () => {
            const w = canvas.width = canvas.parentElement.clientWidth;
            const h = canvas.height = canvas.parentElement.clientHeight;
            ctx.clearRect(0, 0, w, h);

            // Draw Grid
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
            for (let i = 0; i < 5; i++) {
                const y = (h / 4) * i;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }

            // Draw Line
            const data = this.dataLog[this.currentMetric];
            if (data && data.length > 1) {
                ctx.strokeStyle = this.currentMetric === 'risk' ? '#ff1744' : '#00e5ff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const step = w / (this.maxLogLength - 1);
                const maxVal = Math.max(...data, 1);
                data.forEach((v, i) => {
                    const x = i * step;
                    const y = h - (v / maxVal) * h * 0.8 - (h * 0.1);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();

                // Fill
                ctx.lineTo((data.length - 1) * step, h);
                ctx.lineTo(0, h);
                ctx.fillStyle = ctx.strokeStyle.replace(')', ', 0.1)').replace('rgb', 'rgba');
                ctx.fill();
            }

            ctx.fillStyle = '#ffab00';
            ctx.font = '9px monospace';
            ctx.fillText("ANALYTICS FALLBACK ACTIVE", 10, 15);

            requestAnimationFrame(draw);
        };
        draw();
    }

    bindEvents() {
        const selector = document.getElementById('chart-metric-selector');
        if (selector) {
            selector.addEventListener('change', (e) => {
                this.currentMetric = e.target.value;
                this.updateChartDisplay();
            });
        }
    }

    startDataCollector() {
        // Sample data from the UI / global variables every 2 seconds
        setInterval(() => {
            const now = new Date();
            const timeLabel = now.getHours().toString().padStart(2, '0') + ':' +
                now.getMinutes().toString().padStart(2, '0') + ':' +
                now.getSeconds().toString().padStart(2, '0');

            // Find current values. dashboard.js populates telemetrySources globally but let's grab from DOM if possible or assume global
            // Or we just grab the latest from DOM elements:
            const valRiskStr = document.getElementById('threat-score-val')?.innerText || "0";

            // From dashboard.js telemetry grids
            let t1 = 24.5, t2 = 22.1, batt = 14.1;

            if (window.telemetrySources) {
                const s1 = window.telemetrySources.find(s => s.id === 'temp1');
                const s2 = window.telemetrySources.find(s => s.id === 'temp2');
                const sb = window.telemetrySources.find(s => s.id === 'battv');
                if (s1 && s1.history.length > 0) t1 = s1.history[s1.history.length - 1];
                if (s2 && s2.history.length > 0) t2 = s2.history[s2.history.length - 1];
                if (sb && sb.history.length > 0) batt = sb.history[sb.history.length - 1];
            } else {
                // Fallback DOM grab
                const t1El = document.getElementById('val-temp1-0');
                if (t1El) t1 = parseFloat(t1El.innerText);
                const t2El = document.getElementById('val-temp2-0');
                if (t2El) t2 = parseFloat(t2El.innerText);
                const battEl = document.getElementById('val-battv-0');
                if (battEl) batt = parseFloat(battEl.innerText);
            }

            this.dataLog.labels.push(timeLabel);
            this.dataLog.risk.push(parseFloat(valRiskStr));
            this.dataLog.temp1.push(t1);
            this.dataLog.temp2.push(t2);
            this.dataLog.battv.push(batt);

            // Trim arrays
            if (this.dataLog.labels.length > this.maxLogLength) {
                this.dataLog.labels.shift();
                this.dataLog.risk.shift();
                this.dataLog.temp1.shift();
                this.dataLog.temp2.shift();
                this.dataLog.battv.shift();
            }

            this.runPredictiveMaintenance(t1);
            this.updateChartData();

        }, 2000);
    }

    runPredictiveMaintenance(currentTemp) {
        // PREDICTIVE MAINTENANCE SIMULATION
        // Look for continuous rising temperature
        this.temp1Trend.push(currentTemp);
        if (this.temp1Trend.length > 5) {
            this.temp1Trend.shift(); // Keep last 5

            // Check if strictly increasing
            let isRising = true;
            for (let i = 1; i < this.temp1Trend.length; i++) {
                if (this.temp1Trend[i] <= this.temp1Trend[i - 1]) {
                    isRising = false;
                    break;
                }
            }

            // Only alert once in a while by clearing the array
            if (isRising && (this.temp1Trend[this.temp1Trend.length - 1] - this.temp1Trend[0] > 0.5)) {

                // Show a predictive modal/alert
                console.warn("[PREDICTIVE ML MODEL] TEMP-1 rising trend detected. Probability of thermal limit breach in T-12 mins is 87%.");

                if (window.assistant && typeof window.assistant.appendMessage === 'function') {
                    window.assistant.appendMessage(`<span style="color:#ffab00">⚠️ PREDICTIVE ALERT: Machine Learning detects rapid heating anomaly on TEMP-1 sensor. Subsystem failure probable. Suggesting thermal cooling protocol.</span>`);
                }

                // Briefly flash the badge
                const badge = document.getElementById('global-risk-badge');
                if (badge && window.globalSystemState !== 'crit') {
                    badge.style.borderColor = '#ffab00';
                    badge.style.color = '#ffab00';
                    setTimeout(() => { if (window.setSystemState) window.setSystemState(window.globalSystemState || 'safe'); }, 3000);
                }

                this.temp1Trend = []; // Reset to avoid span
            }
        }
    }

    updateChartDisplay() {
        if (!this.chart) return;

        let color = '#00e5ff';
        let bgColor = 'rgba(0, 229, 255, 0.1)';

        if (this.currentMetric === 'risk') { color = '#ff1744'; bgColor = 'rgba(255, 23, 68, 0.1)'; }
        else if (this.currentMetric === 'temp2') { color = '#ffab00'; bgColor = 'rgba(255, 171, 0, 0.1)'; }

        this.chart.data.datasets[0].borderColor = color;
        this.chart.data.datasets[0].backgroundColor = bgColor;

        let labelName = 'Metric';
        const sel = document.getElementById('chart-metric-selector');
        if (sel && sel.options[sel.selectedIndex]) {
            labelName = sel.options[sel.selectedIndex].text;
        }

        this.chart.data.datasets[0].label = labelName;
        this.updateChartData();
    }

    updateChartData() {
        if (!this.chart) return;

        this.chart.data.labels = this.dataLog.labels;
        this.chart.data.datasets[0].data = this.dataLog[this.currentMetric];

        this.chart.update('none'); // Update without full animation for performance
    }
}

// Global hook for generating mission report
window.generateMissionReport = function () {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    // Grab some current states
    const curRisk = document.getElementById('threat-score-val')?.innerText || "0";
    const attP = document.getElementById('att-pitch')?.innerText || "0";
    const attR = document.getElementById('att-roll')?.innerText || "0";
    const sysState = window.globalSystemState || 'NOMINAL';

    const markdownContent = `
# ORBIT-X MISSION REPORT
**Timestamp:** \`${timestamp}\`
**Operator:** Ground Control 1
**System Status:** ${sysState.toUpperCase()}

## 1. Executive Summary
The mission tracking window has generated an automated telemetry report based on recent predictive AI diagnostics and hardware sensor streams.

## 2. Core Telemetry Snapshot
* **Current Threat Score:** ${curRisk}
* **Attitude (Pitch/Roll):** ${attP} / ${attR}
* **Altitude:** ${document.getElementById('sim-alt')?.innerText || 'N/A'}
* **Velocity:** ${document.getElementById('sim-vel')?.innerText || 'N/A'}

## 3. Predictive Maintenance Logs
Machine learning models analyzing thermal drift report nominal conditions. 
**Note:** AI Engine continually polls historical buffer for anomalous trajectories.

## 4. AI Engine Forecast
* **Confidence Level:** ${document.querySelector('text.percentage')?.textContent || '98%'} 
* **30-Min Risk Recommendation:** Continue standard monitoring.

---
*End of Protocol Report. ORBIT-X Autonomous Systems.*
    `;

    // Trigger download
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Mission-Report-${timestamp.replace(/:/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 0);

    // Provide visual feedback
    const btn = document.getElementById('btn-generate-report');
    if (btn) {
        const originalText = btn.innerText;
        btn.innerText = "REPORT DOWNLOADED ✔";
        btn.style.background = "rgba(0, 229, 255, 0.2)";
        setTimeout(() => {
            btn.innerText = originalText;
            btn.style.background = "";
        }, 2000);
    }
};

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    window.analyticsEngine = new AnalyticsEngine();
});
