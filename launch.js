const { spawn } = require('child_process');
const path = require('path');

// Suppress deprecation warnings for a clean, stable boot
process.noDeprecation = true;

// Ensure ELECTRON_RUN_AS_NODE is strictly removed to prevent Chromium bypass crashes
delete process.env.ELECTRON_RUN_AS_NODE;

console.log('[SYSTEM] Booting ORBIT-X Electron via cross-platform launcher...');

const isWin = process.platform === 'win32';

// ---------------------------------------------------------
// FIX: DEP0190 - Insecure shell spawning
// We resolve the direct path to the Electron executable to avoid
// the 'shell: true' security warning and potential argument injection.
// ---------------------------------------------------------
let cmd;
let args = ['.'];

try {
    // try to get path from 'electron' dependency
    cmd = require('electron');
} catch (e) {
    // Fallback if not found in require (unlikely in this setup)
    cmd = isWin ? 'npx.cmd' : 'npx';
    args = ['electron', '.'];
}

const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
    shell: (typeof cmd === 'string' && (cmd.endsWith('.cmd') || cmd.endsWith('.bat')))
});

child.on('exit', (code) => {
    process.exit(code || 0);
});
