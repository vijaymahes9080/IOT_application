/**
 * CLOUD & MODEL STATUS MANAGER
 * Monitors cloud synchronization and model failover status.
 */

const CloudMgr = {
    init: () => {
        console.log('[Cloud-Mgr] Initializing status monitor...');
        
        // Listen for cloud sync events (if we emit them from main)
        // For now, we'll simulate the "SYNCING..." text changing to "LIVE" when telemetry flows
        if (window.electronAPI && window.electronAPI.onTelemetryData) {
            window.electronAPI.onTelemetryData((data) => {
                const syncEl = document.getElementById('cloud-sync-status');
                if (syncEl) {
                    syncEl.innerText = 'CLOUD: LIVE';
                    syncEl.style.color = '#00e5ff'; // var(--accent-primary)
                    
                    // Reset to "SYNCING..." after a short delay if no data
                    if (this._syncTimeout) clearTimeout(this._syncTimeout);
                    this._syncTimeout = setTimeout(() => {
                        syncEl.innerText = 'CLOUD: STANDBY';
                        syncEl.style.color = 'rgba(255,255,255,0.4)';
                    }, 5000);
                }
            });
        }
    },

    /**
     * Update the model source status based on prediction results
     * @param {boolean} isCloud Whether the prediction came from cloud
     * @param {string} modelName Optional model name to display
     */
    updateModelSource: (isCloud, modelName) => {
        const sourceEl = document.getElementById('model-source-status');
        if (!sourceEl) return;

        if (isCloud) {
            sourceEl.innerText = modelName ? `MODEL: ${modelName.toUpperCase()}` : 'MODEL: CLOUD';
            sourceEl.style.color = '#4caf50'; // var(--state-safe)
        } else {
            sourceEl.innerText = modelName ? `MODEL: ${modelName.toUpperCase()}` : 'MODEL: LOCAL (FALLBACK)';
            sourceEl.style.color = '#ffab00'; // var(--state-warn)
            
            // Notification for fallback
            if (window.electronAPI && window.electronAPI.triggerAlert) {
                // window.electronAPI.triggerAlert('MODEL FAILOVER', 'Cloud model unavailable. Falling back to Local Neural Core.');
            }
        }
    },

    /**
     * Update the cloud sync status UI directly
     * @param {string} statusText The text to display
     */
    updateCloudSyncStatus: (statusText) => {
        const syncEl = document.getElementById('cloud-sync-status');
        if (syncEl) {
            syncEl.innerText = `CLOUD: ${statusText}`;
            syncEl.style.color = '#00e5ff'; // var(--accent-primary)
            
            // Revert after exactly 5 seconds unless overridden
            setTimeout(() => {
                if (syncEl.innerText === `CLOUD: ${statusText}`) {
                    syncEl.innerText = 'CLOUD: STANDBY';
                    syncEl.style.color = 'rgba(255,255,255,0.4)';
                }
            }, 5000);
        }
    }
};

// Global hook to intercept aiPredict calls if needed
// Actually, it's better to update it in agri-modules.js where the call happens.

document.addEventListener('DOMContentLoaded', () => {
    CloudMgr.init();
    window.CloudMgr = CloudMgr;
});
