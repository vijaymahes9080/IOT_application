const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- ORBIT-X (AGRILINKSAT) SYSTEM HEALTH CHECK ---');
console.log('Timestamp:', new Date().toISOString());
console.log('------------------------------------\n');

// 1. Dependency Check
console.log('[1/4] Checking Dependencies...');
try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    console.log('✅ package.json detected (Version:', pkg.version + ')');
    if (fs.existsSync('node_modules')) {
        console.log('✅ node_modules folder exists.');
    } else {
        console.warn('❌ node_modules MISSING! Run npm install.');
    }
} catch (e) {
    console.error('❌ Error reading package.json:', e.message);
}

// 2. Environment Check
console.log('\n[2/4] Checking Runtimes...');
try {
    const nodeV = execSync('node -v', { encoding: 'utf8' }).trim();
    console.log('✅ Node.js:', nodeV);
} catch (e) { console.error('❌ Node.js NOT FOUND'); }

try {
    const pyV = execSync('python --version', { encoding: 'utf8' }).trim();
    console.log('✅ Python:', pyV);
} catch (e) {
    try {
        const py3V = execSync('python3 --version', { encoding: 'utf8' }).trim();
        console.log('✅ Python3:', py3V);
    } catch (ee) { console.error('❌ Python NOT FOUND'); }
}

// 3. File Integrity
console.log('\n[3/4] Verifying Critical Files...');
const criticalFiles = [
    'main.js',
    'config.json',
    'ai_service/app.py',
    'services/database-mgr.js',
    'services/serial-client.js',
    'mission_logs.mdb'
];

criticalFiles.forEach(f => {
    if (fs.existsSync(f)) {
        console.log(`✅ ${f} - OK`);
    } else {
        console.warn(`❌ ${f} - MISSING!`);
    }
});

// 4. Config Validation
console.log('\n[4/4] Validating Configuration...');
try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    console.log('✅ config.json is valid JSON.');
    console.log('   Mission ID:', config.mission.id);
    console.log('   AI Port:', config.ai_service.port);
    console.log('   Cloud Host:', config.thingsboard.host);
} catch (e) {
    console.error('❌ config.json error:', e.message);
}

console.log('\n------------------------------------');
console.log('HEALTH CHECK COMPLETE.');
