const { contextBridge, ipcRenderer } = require('electron');

// Secure context bridge for exposing specific APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    openTerminal: () => ipcRenderer.send('open-terminal'),
    triggerAlert: (title, body) => ipcRenderer.send('trigger-alert', { title, body }),
    updateCloudCode: (code) => ipcRenderer.send('update-cloud-code', code),

    // Example listener for telemetry updates from background worker via main process
    onTelemetryData: (callback) => ipcRenderer.on('telemetry-update', (_event, value) => callback(value)),
    onRawData: (callback) => ipcRenderer.on('raw-data-update', (_event, value) => callback(value)),
    onRiskLevelChange: (callback) => ipcRenderer.on('risk-level-change', (_event, level) => callback(level)),

    // Database logging
    logAnomaly: (data) => ipcRenderer.send('log-anomaly', data),
    logPrediction: (data) => ipcRenderer.send('log-prediction', data),
    saveModelSnapshot: (data) => ipcRenderer.send('save-model-snapshot', data),
    startSession: (name) => ipcRenderer.invoke('start-session', name),
    endSession: (data) => ipcRenderer.invoke('end-session', data),

    getRecentTelemetry: (limit) => ipcRenderer.invoke('get-recent-telemetry', limit),
    getTrainingData: (limit) => ipcRenderer.invoke('get-training-data', limit),
    getDbRecordCount: () => ipcRenderer.invoke('get-db-record-count'),
    getAnomalyHistory: (days) => ipcRenderer.invoke('get-anomaly-history', days),
    aiPredict: (module, data) => ipcRenderer.invoke('ai-predict', { module, data }),
    aiChat: (query) => ipcRenderer.invoke('ai-chat', query),
    aiHealth: () => ipcRenderer.invoke('ai-health'),
    resetDatabase: () => ipcRenderer.invoke('reset-database'),
    onAIStatusUpdate: (callback) => ipcRenderer.on('ai-status-update', (_event, info) => callback(info)),
    onAIModelSync: (callback) => ipcRenderer.on('ai-model-sync', (_event, update) => callback(update)),
    onHardwareStatusUpdate: (callback) => ipcRenderer.on('hardware-status-update', (_event, info) => callback(info)),
    getHardwareStatus: () => ipcRenderer.invoke('get-hardware-status'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version')
});

