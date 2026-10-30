/**
 * AGRI LINK / ORBIT-X - Localhost Development & Web Testing Server
 * Serves the Mission Dashboard on http://localhost:8080/
 * with automatic fallback to src/ and proxying to the Python AI service.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const SRC_DIR = path.join(__dirname, 'src');
const ROOT_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    // Enable CORS for local testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // API: Proxy Speech-to-Text Transcription to Python AI daemon if running
    if (pathname === '/transcribe' || pathname === '/api/transcribe') {
        if (req.method === 'POST') {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const proxyReq = http.request({
                    hostname: '127.0.0.1',
                    port: 5005,
                    path: '/transcribe',
                    method: 'POST',
                    headers: {
                        'Content-Type': req.headers['content-type'] || 'audio/wav',
                        'Content-Length': buffer.length
                    }
                }, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: "AI transcription service temporarily unavailable"
                    }));
                });
                proxyReq.write(buffer);
                proxyReq.end();
            });
            return;
        }
    }

    // API: Proxy Chat queries to Python AI daemon if running
    if (pathname === '/chat' || pathname === '/api/chat') {
        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const proxyReq = http.request({
                    hostname: '127.0.0.1',
                    port: 5005,
                    path: '/chat',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body)
                    }
                }, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
                    proxyRes.pipe(res);
                });
                proxyReq.on('error', () => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        response: "AGRI LINK local server is online. AI service is currently running in background resilience mode.",
                        status: "nominal"
                    }));
                });
                proxyReq.write(body);
                proxyReq.end();
            });
            return;
        }
    }

    // API: Return telemetry snapshot for browser clients
    if (pathname === '/api/telemetry') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: "connected",
            isFresh: true,
            port: "COM4 (Server Emulation)",
            timestamp: Date.now(),
            data: {
                esp32: {
                    temp1: 27.6,
                    humidity: 69.0,
                    soilMoisture: 52.0,
                    ldrSensor: 4080,
                    ultrasonic: 76.7,
                    laserDistance: 295,
                    batt_v: "12.4",
                    current_amps: 2.1
                }
            }
        }));
        return;
    }

    // API: Accept Hardware Command from Web Console
    if (pathname === '/api/command') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                console.log(`[WEB-CONSOLE] Command received: ${data.command}`);
            } catch (_) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
        return;
    }

    // Default route: load dashboard
    if (pathname === '/' || pathname === '/index.html') {
        pathname = '/index.html';
    }

    // Resolve file path: check in src/ first, then root
    let targetPath = path.join(SRC_DIR, pathname);
    if (!fs.existsSync(targetPath)) {
        targetPath = path.join(ROOT_DIR, pathname);
    }

    fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`404 Not Found: ${pathname}`);
            return;
        }

        const ext = path.extname(targetPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(targetPath);
        stream.pipe(res);
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER ERROR] Port ${PORT} is already in use. Please terminate the conflicting process or choose another port.`);
    } else {
        console.error(`[SERVER ERROR]`, err);
    }
});

server.listen(PORT, () => {
    console.log('===================================================');
    console.log(`[AGRI LINK] Local Web Console active!`);
    console.log(`-> URL: http://localhost:${PORT}/`);
    console.log(`-> Testing Mode: Browser Live Testing Enabled`);
    console.log('===================================================');

    // Start Telegram bot if configured
    try {
        const TelegramBot = require('./services/telegram-bot');
        const handler = require('./services/telegram-handler');
        const bot = new TelegramBot();
        if (bot.token) {
            bot.startPolling(async ({ text }) => handler.handle({ text }));
            console.log('[Telegram] Bot started (polling).');
            global.telegramBot = bot;
        } else {
            console.log('[Telegram] TELEGRAM_BOT_TOKEN not set; bot disabled.');
        }
    } catch (e) {
        console.error('[Telegram] Failed to start bot:', e.message);
    }
});
