const consoleOutput = document.getElementById('console-output');
const pingMsReadout = document.getElementById('ping-ms');

function appendLog(rawText, type = 'rx') {
    const line = document.createElement('div');
    line.className = `log-line log-${type}`; // rx, tx, err

    const timestamp = new Date().toISOString();
    line.innerText = `[${timestamp}] ${rawText}`;

    consoleOutput.appendChild(line);

    // Auto scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;

    // Manage memory by removing elements over 500 lines
    if (consoleOutput.childElementCount > 500) {
        consoleOutput.removeChild(consoleOutput.firstChild);
    }
}

// Simulate network ping jitter
setInterval(() => {
    let base = 14;
    let jitter = (Math.random() * 4 - 2).toFixed(1);
    pingMsReadout.innerText = (base + parseFloat(jitter)).toFixed(1);
}, 1000);
// Listen for real telemetry packets
if (window.electronAPI && window.electronAPI.onTelemetryData) {
    window.electronAPI.onTelemetryData((data) => {
        // We can skip logging processed data to keep terminal clean if raw is available,
        // but for now let's keep it as an object view.
        const msg = JSON.stringify(data);
        // appendLog(`PROC: ${msg}`, 'rx'); 
    });
}

if (window.electronAPI && window.electronAPI.onRawData) {
    window.electronAPI.onRawData((raw) => {
        appendLog(`RAW RX >> ${raw}`, 'rx');
    });
}

// Fallback for browser MockDataEngine
if (!window.electronAPI) {
    setInterval(() => {
        const mockData = {
            timestamp: new Date().toISOString(),
            type: "TELEMETRY",
            payload: {
                temp1: (20 + Math.random() * 5).toFixed(2),
                soil: (40 + Math.random() * 10).toFixed(1),
                dist: (399 + Math.random()).toFixed(2)
            }
        };
        appendLog(`RCV (MOCK): ${JSON.stringify(mockData)}`, 'rx');
    }, 2000);
}

// Wire up Hardware Status
if (window.electronAPI && window.electronAPI.onHardwareStatusUpdate) {
    const hwStatusEl = document.getElementById('hw-status');
    const updateHWUI = (info) => {
        if (info.status === 'connected') {
            if (hwStatusEl) {
                hwStatusEl.innerText = '[HW:LINK]';
                hwStatusEl.style.color = 'var(--term-fg)';
            }
            appendLog(`SYSTEM: Hardware Link Established via ${info.port} (${info.device})`, 'tx');
        } else {
            if (hwStatusEl) {
                hwStatusEl.innerText = '[SIM]';
                hwStatusEl.style.color = 'var(--term-warn)';
            }
            appendLog("SYSTEM: Hardware Disconnected. Simulation active.", "err");
        }
    };
    window.electronAPI.onHardwareStatusUpdate(updateHWUI);
    window.electronAPI.getHardwareStatus().then(updateHWUI);
}

