/**
 * ORBIT-X Advanced AI Systems Implementation
 * 1. Conjunction Assessment Radar (Collision Avoidance)
 * 2. Computer Vision Sat-Crop (Deep Learning Visualizer)
 * 3. Deployment Map (Geo-Location Analysis)
 */

document.addEventListener('DOMContentLoaded', () => {
    initRadar();
    initCV();
    initMap();
});

// --- 1. CONJUNCTION ASSESSMENT RADAR ---
function initRadar() {
    const canvas = document.getElementById('radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let objects = [
        { angle: 45, dist: 0.2, type: 'sat', size: 4, color: '#00e5ff' }, // Our Sat
        { angle: 120, dist: 0.15, type: 'threat', size: 3, color: '#ff1744' }, // High Risk
        { angle: 280, dist: 0.6, type: 'warning', size: 3, color: '#ff9800' }, // Warning
        { angle: 10, dist: 0.8, type: 'tracked', size: 2, color: '#888' },
        { angle: 190, dist: 0.5, type: 'tracked', size: 2, color: '#888' },
        { angle: 220, dist: 0.7, type: 'tracked', size: 2, color: '#888' }
    ];

    let sweepAngle = 0;
    const eventCountEl = document.getElementById('radar-event-count');

    function draw() {
        const w = canvas.width = canvas.parentElement.clientWidth;
        const h = canvas.height = canvas.parentElement.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        const maxR = Math.min(w, h) * 0.45;

        ctx.clearRect(0, 0, w, h);

        // Draw Rings
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.1)';
        ctx.setLineDash([]);
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw Crosshair
        ctx.beginPath();
        ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
        ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
        ctx.stroke();

        // Draw Sweep
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(sweepAngle);
        let gradient = ctx.createLinearGradient(0, 0, maxR, 0);
        gradient.addColorStop(0, 'rgba(0, 229, 255, 0)');
        gradient.addColorStop(1, 'rgba(0, 229, 255, 0.4)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, maxR, -0.2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw Objects
        objects.forEach(obj => {
            const rad = obj.angle * (Math.PI / 180);
            const x = cx + Math.cos(rad) * maxR * obj.dist;
            const y = cy + Math.sin(rad) * maxR * obj.dist;

            ctx.fillStyle = obj.color;
            ctx.beginPath();
            ctx.arc(x, y, obj.size, 0, Math.PI * 2);
            ctx.fill();

            // Glow for active threats
            if (obj.type === 'threat' || obj.type === 'sat') {
                ctx.shadowBlur = 10;
                ctx.shadowColor = obj.color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Update positions slightly (orbital drift)
            obj.angle += 0.05;
        });

        sweepAngle += 0.03;

        // Update Event Count
        if (eventCountEl) {
            const threats = objects.filter(o => o.type === 'threat' || o.type === 'warning').length;
            eventCountEl.innerText = `${threats} CA EVENTS`;
        }

        requestAnimationFrame(draw);
    }
    draw();
}

// --- 2. COMPUTER VISION CROP ANALYSIS ---
// Global dispatcher for strategic data flow
window.dispatchCVAnalysis = (data) => {
    if (window._updateCV) window._updateCV(data);
};

function initCV() {
    const viewport = document.getElementById('cv-viewport');
    const bbox = document.getElementById('cv-bbox-target');
    const label = bbox?.querySelector('.cv-label');
    const overlay = document.getElementById('cv-analysis-overlay');

    if (!viewport || !bbox) return;

    // Internal update function exposed via global dispatcher
    window._updateCV = (data) => {
        if (!data || !bbox || !label) return;
        
        const status = data.status || "ANALYZING...";
        const health = data.health || 0.85;
        const color = health > 0.8 ? "var(--state-safe)" : (health > 0.6 ? "var(--accent-primary)" : "var(--state-warn)");
        
        // Multi-frame comparison / processing flash
        if (overlay) {
            overlay.style.opacity = '1';
            setTimeout(() => overlay.style.opacity = '0', 250);
        }

        // Fix: Reliable ROI Centering (Relative to Image)
        const x = 10 + Math.random() * 20; 
        const y = 10 + Math.random() * 20;
        const w = 60 + Math.random() * 15; // Width in %
        const h = 50 + Math.random() * 15; // Height in %

        bbox.style.opacity = '1';
        bbox.style.left = x + '%';
        bbox.style.top = y + '%';
        bbox.style.width = w + '%';
        bbox.style.height = h + '%';

        label.innerText = `${status}`;
        if (data.yield !== undefined) {
            label.innerText += ` | EST:${Number(data.yield).toFixed(1)}T`;
        }
        
        bbox.style.borderColor = color;
        label.style.background = color;

        // Scan Laser Reset/Boost
        const laser = viewport.querySelector('.scan-laser');
        if (laser) {
            laser.style.animation = 'none';
            laser.offsetHeight; // trigger reflow
            laser.style.animation = 'scanLaserAnim 4s ease-in-out infinite';
        }
    };

    // Manual Re-analysis Trigger on Clickable Overlay
    const clickZone = document.getElementById('cv-click-overlay');
    if (clickZone) {
        clickZone.addEventListener('click', () => {
            if (window.strategicOpsData) {
                bbox.style.opacity = '1';
                label.innerText = "REFRESHING SATELLITE CORE...";
                label.style.background = "var(--state-crit)";
                
                setTimeout(() => {
                    window.strategicOpsData.processOperations();
                }, 400);
            }
        });
    }

    // Initial Trigger for coordinated analysis
    setTimeout(() => {
        if (window.strategicOpsData) window.strategicOpsData.processOperations();
    }, 2000);
}

// --- 3. DEPLOYMENT MAP (GEO-ANALYSIS) ---
function initMap() {
    const mapContainer = document.getElementById('deployment-map');
    if (!mapContainer) return;

    if (typeof L === 'undefined') {
        console.warn('[Resilience] Leaflet failed to load. Map interface disabled.');
        mapContainer.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:var(--state-warn); font-family:monospace; font-size:10px; border:1px dashed var(--state-warn); background:rgba(255,171,0,0.05);">
            MAP ENGINE OFFLINE: CHECK CSP/NETWORK
        </div>`;
        return;
    }

    // Precise Tactical View: Gandhigram Core + Sirumalai Foothills
    const gandhigram = [10.279, 77.934];
    const map = L.map('deployment-map', {
        zoomControl: false,
        attributionControl: false
    }).setView(gandhigram, 14);

    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
    }).addTo(map);

    const points = [
        { loc: [10.279, 77.934], label: "GANDHIGRAM MISSION HQ", color: "#00e5ff", permanent: true },
        { loc: [10.282, 77.940], label: "KODAGANAR RIVER BASIN", color: "#00e676", permanent: false },
        { loc: [10.275, 77.925], label: "SIRUMALAI MTS RANGE", color: "#ffab00", permanent: true },
        { loc: [10.285, 77.930], label: "CROP EXPERIMENT ZONE", color: "#00e5ff", permanent: false }
    ];

    points.forEach(pt => {
        const marker = L.circleMarker(pt.loc, {
            radius: 8,
            fillColor: pt.color,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map);
        
        marker.bindTooltip(pt.label, {
            permanent: pt.permanent,
            direction: 'top',
            className: 'tactical-tooltip'
        });
    });

    // Dark Mode Refresh for Flex Layout
    setTimeout(() => {
        map.invalidateSize();
    }, 800);
}
