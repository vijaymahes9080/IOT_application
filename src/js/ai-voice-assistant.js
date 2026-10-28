/**
 * AGRI LINK - Live AI Voice Assistant & Multi-Speaker Audio Engine
 * Production-grade Voice Assistant with real microphone capture,
 * live hardware sensor reasoning, natural speech responses,
 * and multi-speaker audio routing (Laptop, Hardware Buzzer/Speaker, Both).
 */

class AgriVoiceAssistant {
    constructor() {
        this.chatbot = document.getElementById('orbit-chatbot');
        this.chatHeader = document.getElementById('chat-header');
        this.chatBody = document.getElementById('chat-body');
        this.chatToggle = document.getElementById('chat-toggle');
        this.chatInput = document.getElementById('chat-input');
        this.chatSend = document.getElementById('chat-send');
        this.chatMic = document.getElementById('chat-mic');
        this.chatMessages = document.getElementById('chat-messages');

        // Voice & Audio Configuration
        this.audioConfig = {
            outputDevice: 'laptop',      // 'laptop', 'hardware', 'both'
            autoSpeak: true,
            speechRate: 1.0,
            speechVolume: 1.0,
            selectedVoice: null
        };

        // State variables
        this.state = 'IDLE'; // 'IDLE', 'LISTENING', 'PROCESSING', 'SPEAKING', 'ERROR'
        this.isOpen = true;
        this.lastResponseText = "Welcome to AGRI LINK. I am your Smart Agriculture AI Assistant.";
        this.recognition = null;
        this.speechSynthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.isRecording = false;

        this.initDOM();
        this.initEvents();
        this.initSpeechRecognition();
        this.initTTSVoices();
        this.initDraggable();
        this.syncUIState();
        this.updateStateBadge('IDLE');
    }

    initDOM() {
        // Build the Voice Control Header & Audio Routing Ribbon if not present
        if (!document.getElementById('voice-audio-controls')) {
            const controlsDiv = document.createElement('div');
            controlsDiv.id = 'voice-audio-controls';
            controlsDiv.style.cssText = `
                background: rgba(4, 9, 20, 0.9);
                border-bottom: 1px solid rgba(0, 229, 255, 0.2);
                padding: 8px 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-family: var(--font-mono, monospace);
                font-size: 11px;
            `;

            controlsDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span id="voice-state-badge" style="background:rgba(0,229,255,0.2); color:#00e5ff; padding:2px 6px; border-radius:3px; font-weight:bold; font-size:10px;">IDLE</span>
                        <span id="hardware-link-badge" style="color:var(--text-muted); font-size:10px;">HW: CHECKING...</span>
                    </div>
                    <div style="display:flex; gap:4px;">
                        <button id="btn-repeat-voice" title="Repeat last answer" class="action-btn small" style="padding:2px 8px; font-size:10px;">REPEAT</button>
                        <button id="btn-stop-voice" title="Stop speaking" class="action-btn small" style="padding:2px 8px; font-size:10px; border-color:var(--state-crit); color:var(--state-crit);">STOP</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <label style="color:var(--text-muted); font-size:10px;">SPEAKER:</label>
                    <select id="voice-speaker-select" style="background:#0a1224; color:#00e5ff; border:1px solid rgba(0,229,255,0.3); border-radius:3px; font-size:10px; padding:2px 6px; flex:1;">
                        <option value="laptop">Laptop Speaker</option>
                        <option value="hardware">Hardware Speaker / Buzzer</option>
                        <option value="both">Both Speakers (Laptop + HW)</option>
                    </select>
                    <label style="display:flex; align-items:center; gap:3px; font-size:10px; cursor:pointer;" title="Automatically speak answers aloud">
                        <input type="checkbox" id="voice-auto-speak" checked>
                        <span>AUTO</span>
                    </label>
                </div>
            `;

            // Insert at the top of chat-body
            if (this.chatBody) {
                this.chatBody.insertBefore(controlsDiv, this.chatBody.firstChild);
            }
        }

        // Add mic button into chat-input-wrapper if missing
        const inputWrapper = document.querySelector('.chat-input-wrapper');
        if (inputWrapper && !document.getElementById('chat-mic')) {
            const micBtn = document.createElement('button');
            micBtn.id = 'chat-mic';
            micBtn.innerHTML = '🎤';
            micBtn.title = 'Speak to Assistant (Hold or Click)';
            micBtn.style.cssText = `
                background: rgba(0, 229, 255, 0.15);
                border: 1px solid var(--accent-primary);
                color: #00e5ff;
                border-radius: 4px;
                padding: 0 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 15px;
            `;
            inputWrapper.insertBefore(micBtn, this.chatSend);
            this.chatMic = micBtn;
        }

        // Setup speaker selector & controls listeners
        const speakerSelect = document.getElementById('voice-speaker-select');
        if (speakerSelect) {
            speakerSelect.addEventListener('change', (e) => {
                this.audioConfig.outputDevice = e.target.value;
                this.announceDeviceSwitch(e.target.value);
            });
        }

        const autoSpeakCheckbox = document.getElementById('voice-auto-speak');
        if (autoSpeakCheckbox) {
            autoSpeakCheckbox.addEventListener('change', (e) => {
                this.audioConfig.autoSpeak = e.target.checked;
            });
        }

        const stopBtn = document.getElementById('btn-stop-voice');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopSpeaking());
        }

        const repeatBtn = document.getElementById('btn-repeat-voice');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => this.repeatLastResponse());
        }

        // Periodic hardware status check
        this.updateHardwareLinkStatus();
        setInterval(() => this.updateHardwareLinkStatus(), 3000);
    }

    async updateHardwareLinkStatus() {
        const badge = document.getElementById('hardware-link-badge');
        if (!badge || !window.electronAPI) return;
        try {
            const status = await window.electronAPI.getHardwareStatus();
            if (status && status.status === 'connected') {
                badge.innerText = `HW: ${status.lastKnownPort || 'ONLINE'}`;
                badge.style.color = '#00ff88';
            } else {
                badge.innerText = `HW: SIMULATION`;
                badge.style.color = '#ffb300';
            }
        } catch (e) {
            badge.innerText = 'HW: OFFLINE';
            badge.style.color = 'var(--state-crit)';
        }
    }

    updateStateBadge(newState) {
        this.state = newState;
        const badge = document.getElementById('voice-state-badge');
        if (!badge) return;

        badge.innerText = newState;
        if (newState === 'IDLE') {
            badge.style.background = 'rgba(0, 229, 255, 0.15)';
            badge.style.color = '#00e5ff';
        } else if (newState === 'LISTENING') {
            badge.style.background = 'rgba(255, 23, 68, 0.25)';
            badge.style.color = '#ff1744';
        } else if (newState === 'PROCESSING') {
            badge.style.background = 'rgba(255, 179, 0, 0.25)';
            badge.style.color = '#ffb300';
        } else if (newState === 'SPEAKING') {
            badge.style.background = 'rgba(0, 255, 136, 0.25)';
            badge.style.color = '#00ff88';
        } else if (newState === 'ERROR') {
            badge.style.background = 'rgba(255, 23, 68, 0.3)';
            badge.style.color = '#ff5252';
        }
    }

    initTTSVoices() {
        if (!this.speechSynthesis) return;
        const loadVoices = () => {
            const voices = this.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
                // Prefer high-quality English voice
                this.audioConfig.selectedVoice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Zira')) && v.lang.startsWith('en')) || voices[0];
            }
        };
        loadVoices();
        if (this.speechSynthesis.onvoiceschanged !== undefined) {
            this.speechSynthesis.onvoiceschanged = loadVoices;
        }
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("[VOICE] Web Speech API not supported in this runtime.");
            if (this.chatMic) {
                this.chatMic.title = "Microphone not supported in current environment";
                this.chatMic.style.opacity = "0.5";
            }
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isRecording = true;
            this.updateStateBadge('LISTENING');
            if (this.chatMic) {
                this.chatMic.style.background = '#ff1744';
                this.chatMic.style.color = '#ffffff';
                this.chatMic.style.boxShadow = '0 0 15px rgba(255,23,68,0.8)';
            }
            this.chatInput.placeholder = "Listening to your voice... Speak now!";
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript.trim()) {
                this.chatInput.value = finalTranscript.trim();
                this.handleSend();
            } else if (interimTranscript.trim()) {
                this.chatInput.value = interimTranscript.trim();
            }
        };

        this.recognition.onerror = (event) => {
            console.error("[VOICE] Recognition Error:", event.error);
            this.stopRecording();
            this.updateStateBadge('ERROR');
            setTimeout(() => this.updateStateBadge('IDLE'), 3000);
            if (event.error === 'not-allowed') {
                this.appendMessage("<span style='color:var(--state-crit)'>Microphone permission was denied. Please allow microphone access in system settings.</span>", false, true);
            }
        };

        this.recognition.onend = () => {
            this.stopRecording();
            if (this.state === 'LISTENING') {
                this.updateStateBadge('IDLE');
            }
        };

        if (this.chatMic) {
            this.chatMic.addEventListener('click', () => {
                if (this.isRecording) {
                    this.recognition.stop();
                } else {
                    // Stop speaking if currently talking
                    this.stopSpeaking();
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.warn("[VOICE] Start call exception:", e);
                    }
                }
            });
        }
    }

    stopRecording() {
        this.isRecording = false;
        if (this.chatMic) {
            this.chatMic.style.background = 'rgba(0, 229, 255, 0.15)';
            this.chatMic.style.color = '#00e5ff';
            this.chatMic.style.boxShadow = 'none';
        }
        if (this.chatInput) {
            this.chatInput.placeholder = "Ask about live sensor data or farming advice...";
        }
    }

    async speakResponse(text) {
        if (!text || !this.audioConfig.autoSpeak) return;

        this.stopSpeaking();
        this.updateStateBadge('SPEAKING');

        const device = this.audioConfig.outputDevice;

        // 1. Hardware Notification / Buzzer Chime Command
        if (device === 'hardware' || device === 'both') {
            if (window.electronAPI && window.electronAPI.sendHardwareCommand) {
                // Trigger ESP32 acknowledgment / voice playback melody
                window.electronAPI.sendHardwareCommand('CMD:VOICE_START');
            }
        }

        // 2. Laptop Speaker Playback (SpeechSynthesis)
        if (device === 'laptop' || device === 'both') {
            if (!this.speechSynthesis) {
                this.updateStateBadge('IDLE');
                return;
            }

            // Strip HTML tags for clean spoken pronunciation
            const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

            this.currentUtterance = new SpeechSynthesisUtterance(cleanText);
            this.currentUtterance.rate = this.audioConfig.speechRate;
            this.currentUtterance.volume = this.audioConfig.speechVolume;
            if (this.audioConfig.selectedVoice) {
                this.currentUtterance.voice = this.audioConfig.selectedVoice;
            }

            this.currentUtterance.onend = () => {
                this.currentUtterance = null;
                this.updateStateBadge('IDLE');
            };

            this.currentUtterance.onerror = (err) => {
                console.error("[TTS] Playback Error:", err);
                this.currentUtterance = null;
                this.updateStateBadge('IDLE');
            };

            this.speechSynthesis.speak(this.currentUtterance);
        } else {
            // Hardware-only mode completed trigger
            setTimeout(() => {
                this.updateStateBadge('IDLE');
            }, 1000);
        }
    }

    stopSpeaking() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
        }
        this.currentUtterance = null;
        if (this.state === 'SPEAKING') {
            this.updateStateBadge('IDLE');
        }
    }

    repeatLastResponse() {
        if (this.lastResponseText) {
            this.appendMessage("Repeating last answer...", false);
            this.speakResponse(this.lastResponseText);
        }
    }

    announceDeviceSwitch(target) {
        const msg = target === 'laptop' 
            ? "Audio output switched to Laptop Speaker."
            : target === 'hardware'
            ? "Audio output routed to ESP32 Hardware Speaker/Buzzer."
            : "Audio output routed to Both Speakers (Laptop + Hardware).";
        
        this.appendMessage(`<span style='color:#00ff88'>${msg}</span>`, false, true);
        if (target === 'hardware' || target === 'both') {
            if (window.electronAPI && window.electronAPI.sendHardwareCommand) {
                window.electronAPI.sendHardwareCommand('CMD:CHIME');
            }
        }
    }

    initEvents() {
        if (this.chatHeader) {
            this.chatHeader.addEventListener('click', (e) => {
                if (!e.target.closest('button') && !e.target.closest('select') && !e.target.closest('input')) {
                    this.toggleChat();
                }
            });
        }
        if (this.chatToggle) {
            this.chatToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleChat();
            });
        }
        if (this.chatSend) {
            this.chatSend.addEventListener('click', () => this.handleSend());
        }
        if (this.chatInput) {
            this.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSend();
            });
        }
    }

    initDraggable() {
        if (!this.chatbot || !this.chatHeader) return;
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        const savedPos = localStorage.getItem('orbit-chatbot-pos');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                Object.assign(this.chatbot.style, {
                    left: pos.left || 'auto',
                    top: pos.top || 'auto',
                    right: pos.right || 'auto',
                    bottom: pos.bottom || 'auto'
                });
            } catch (e) { this.setDefaultPosition(); }
        } else {
            this.setDefaultPosition();
        }

        const dragMouseDown = (e) => {
            if (e.target.closest('#chat-toggle') || e.target.closest('#chat-mic') || e.target.closest('select') || e.target.closest('button')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            this.chatbot.style.transition = 'none';
            this.chatbot.style.cursor = 'grabbing';
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        const elementDrag = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            const rect = this.chatbot.getBoundingClientRect();
            let newTop = rect.top - pos2;
            let newLeft = rect.left - pos1;

            const finalTop = Math.max(0, Math.min(newTop, window.innerHeight - this.chatbot.offsetHeight));
            const finalLeft = Math.max(0, Math.min(newLeft, window.innerWidth - this.chatbot.offsetWidth));

            Object.assign(this.chatbot.style, {
                top: finalTop + "px",
                left: finalLeft + "px",
                bottom: 'auto',
                right: 'auto'
            });
        };

        const closeDragElement = () => {
            document.onmouseup = null;
            document.onmousemove = null;
            this.chatbot.style.transition = 'all 0.3s ease';
            this.chatbot.style.cursor = 'default';
            const rect = this.chatbot.getBoundingClientRect();
            const pos = {
                top: rect.top + 'px',
                left: rect.left + 'px',
                right: 'auto',
                bottom: 'auto'
            };
            localStorage.setItem('orbit-chatbot-pos', JSON.stringify(pos));
            Object.assign(this.chatbot.style, pos);
        };

        this.chatHeader.onmousedown = dragMouseDown;
        this.chatHeader.style.cursor = 'grab';
    }

    setDefaultPosition() {
        Object.assign(this.chatbot.style, {
            bottom: '24px',
            right: '24px',
            top: 'auto',
            left: 'auto'
        });
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        this.syncUIState();
    }

    syncUIState() {
        if (!this.chatBody || !this.chatbot || !this.chatToggle) return;
        if (this.isOpen) {
            this.chatBody.style.display = 'flex';
            this.chatBody.style.height = '420px';
            this.chatBody.style.opacity = '1';
            this.chatbot.style.width = '360px';
            this.chatToggle.innerText = '▼';
            this.chatHeader.style.padding = '10px 16px';
            this.chatHeader.style.borderBottom = '1px solid rgba(0, 229, 255, 0.2)';
        } else {
            this.chatBody.style.height = '0';
            this.chatBody.style.opacity = '0';
            this.chatbot.style.width = '240px';
            setTimeout(() => { if (!this.isOpen) this.chatBody.style.display = 'none'; }, 300);
            this.chatToggle.innerText = '▲';
            this.chatHeader.style.borderBottom = 'none';
            this.chatHeader.style.padding = '8px 12px';
        }
    }

    appendMessage(text, isUser = false, isHTML = false) {
        if (!this.chatMessages) return null;
        const msgDiv = document.createElement('div');
        msgDiv.className = isUser ? 'user-msg' : 'ai-msg';
        msgDiv.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
        msgDiv.style.background = isUser ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
        msgDiv.style.border = isUser ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)';
        msgDiv.style.padding = '10px 14px';
        msgDiv.style.borderRadius = isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px';
        msgDiv.style.color = '#fff';
        msgDiv.style.maxWidth = '88%';
        msgDiv.style.fontSize = '12px';
        msgDiv.style.lineHeight = '1.45';
        msgDiv.style.wordBreak = 'break-word';
        msgDiv.style.marginBottom = '8px';

        if (isHTML) {
            msgDiv.innerHTML = text;
        } else {
            msgDiv.innerText = text;
        }

        this.chatMessages.appendChild(msgDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        return msgDiv;
    }

    /**
     * Reasoning Engine: Live Hardware Sensor & Natural Agricultural Knowledge
     */
    async handleSend() {
        const query = this.chatInput.value.trim();
        if (!query) return;

        this.appendMessage(query, true);
        this.chatInput.value = '';

        const lowerQ = query.toLowerCase();

        // 1. Direct Control Commands
        if (lowerQ.includes('stop speaking') || lowerQ.includes('shut up') || lowerQ.includes('be quiet') || lowerQ === 'stop') {
            this.stopSpeaking();
            this.appendMessage("Speech playback stopped.", false);
            return;
        }

        if (lowerQ.includes('repeat') || lowerQ.includes('say that again')) {
            this.repeatLastResponse();
            return;
        }

        this.updateStateBadge('PROCESSING');
        const typingIndicator = this.appendMessage('<span style="font-style:italic; opacity:0.8;">Processing agriculture query...</span>', false, true);

        try {
            // Retrieve latest real-time sensor measurements
            let telemetry = null;
            if (window.electronAPI && window.electronAPI.getLatestTelemetry) {
                telemetry = await window.electronAPI.getLatestTelemetry();
            }

            const esp = (telemetry && telemetry.data) ? (telemetry.data.esp32 || telemetry.data) : null;
            const isFresh = telemetry ? telemetry.isFresh : false;
            const isHardwareConnected = telemetry ? (telemetry.status === 'connected') : false;

            let response = "";

            // --- Case A: Temperature Queries ---
            if (lowerQ.includes('temperature') || lowerQ.includes('temp') || lowerQ.includes('heat') || lowerQ.includes('how hot')) {
                if (esp && esp.temp1 !== undefined && esp.temp1 !== null && !isNaN(esp.temp1)) {
                    response = `The current temperature measured by the sensor is ${Number(esp.temp1).toFixed(1)}° Celsius.`;
                    if (esp.temp1 > 38) {
                        response += " Alert: High field temperature detected. Check crop shade and ventilation.";
                    }
                } else {
                    response = isHardwareConnected 
                        ? "Temperature reading is currently unavailable or initializing on the DHT11 sensor."
                        : "ESP32 hardware is not currently streaming live temperature data.";
                }
            }

            // --- Case B: Humidity Queries ---
            else if (lowerQ.includes('humidity') || lowerQ.includes('moist in air')) {
                if (esp && esp.humidity !== undefined && esp.humidity !== null && !isNaN(esp.humidity)) {
                    response = `Current relative humidity is ${Number(esp.humidity).toFixed(1)}%.`;
                } else {
                    response = "Humidity measurement is currently unavailable from the DHT11 sensor.";
                }
            }

            // --- Case C: Soil Moisture Queries ---
            else if (lowerQ.includes('soil') || lowerQ.includes('water in soil') || lowerQ.includes('irrigation')) {
                if (esp && esp.soilMoisture !== undefined && esp.soilMoisture !== null) {
                    const pct = Number(esp.soilMoisture).toFixed(1);
                    response = `The soil moisture level is currently at ${pct}%.`;
                    if (Number(pct) < 30) {
                        response += " The soil is dry. Irrigation is recommended.";
                    } else if (Number(pct) > 75) {
                        response += " The soil has sufficient moisture.";
                    }
                } else {
                    response = "Soil moisture data is currently unavailable on the analog probe.";
                }
            }

            // --- Case D: Distance / Obstacle Queries (HC-SR04 & VL53L0X) ---
            else if (lowerQ.includes('distance') || lowerQ.includes('obstacle') || lowerQ.includes('laser') || lowerQ.includes('close') || lowerQ.includes('near')) {
                const ultra = esp ? esp.ultrasonic : -1;
                const laser = esp ? esp.laserDistance : 0;
                let parts = [];
                if (ultra !== undefined && ultra > 0) {
                    parts.push(`Ultrasonic proximity is ${Number(ultra).toFixed(1)} cm.`);
                }
                if (laser !== undefined && laser > 0) {
                    parts.push(`VL53L0X Laser distance is ${laser} mm.`);
                }

                if (parts.length > 0) {
                    response = parts.join(" ");
                    if ((ultra > 0 && ultra < 15) || (laser > 0 && laser < 200)) {
                        response += " Warning: An object is in close proximity to the model.";
                    }
                } else {
                    response = "Proximity and laser distance sensors are currently reading out-of-range or offline.";
                }
            }

            // --- Case E: Light / Sunlight Queries (LDR) ---
            else if (lowerQ.includes('light') || lowerQ.includes('sun') || lowerQ.includes('ldr') || lowerQ.includes('lux')) {
                if (esp && esp.ldrSensor !== undefined && esp.ldrSensor !== null) {
                    response = `Light intensity raw reading is ${esp.ldrSensor}. `;
                    response += (esp.ldrSensor > 2500) ? "Field conditions are currently bright." : "Field lighting is low.";
                } else {
                    response = "Light sensor measurement is currently unavailable.";
                }
            }

            // --- Case F: GPS Status & Coordinates ---
            else if (lowerQ.includes('gps') || lowerQ.includes('location') || lowerQ.includes('coordinate')) {
                const sys = telemetry && telemetry.data && telemetry.data.satellite ? telemetry.data.satellite : {};
                const lat = sys.latitude || (esp ? esp.lat : null);
                const lon = sys.longitude || (esp ? esp.lon : null);
                if (lat && lon && lat !== 0) {
                    response = `GPS location fixed at Latitude ${Number(lat).toFixed(4)}, Longitude ${Number(lon).toFixed(4)}.`;
                } else {
                    response = "GPS is active and searching for satellite fix. Coordinates will update once locked.";
                }
            }

            // --- Case G: Read All Available Sensor Values Aloud ---
            else if (lowerQ.includes('all sensor') || lowerQ.includes('summary') || lowerQ.includes('read everything') || lowerQ.includes('overview') || lowerQ.includes('read all')) {
                let report = [];
                if (esp) {
                    if (esp.temp1 != null) report.push(`Temperature: ${Number(esp.temp1).toFixed(1)}°C`);
                    if (esp.humidity != null) report.push(`Humidity: ${Number(esp.humidity).toFixed(1)}%`);
                    if (esp.soilMoisture != null) report.push(`Soil Moisture: ${Number(esp.soilMoisture).toFixed(1)}%`);
                    if (esp.ldrSensor != null) report.push(`Light: ${esp.ldrSensor}`);
                    if (esp.ultrasonic != null && esp.ultrasonic > 0) report.push(`Obstacle Distance: ${Number(esp.ultrasonic).toFixed(1)} cm`);
                }

                if (report.length > 0) {
                    response = "Here is the live sensor report: " + report.join(", ") + ".";
                } else {
                    response = "Telemetry array is initializing. No fresh sensor packets have arrived yet.";
                }
            }

            // --- Case H: Active Alerts ---
            else if (lowerQ.includes('alert') || lowerQ.includes('warning') || lowerQ.includes('danger')) {
                const ultra = esp ? esp.ultrasonic : -1;
                const temp = esp ? esp.temp1 : null;
                const soil = esp ? esp.soilMoisture : null;
                let activeAlerts = [];

                if (ultra > 0 && ultra < 15) activeAlerts.push("Object proximity detected under 15 cm");
                if (temp != null && temp > 38) activeAlerts.push(`High field temperature at ${temp.toFixed(1)}°C`);
                if (soil != null && soil < 25) activeAlerts.push(`Critical low soil moisture at ${soil.toFixed(1)}%`);

                if (activeAlerts.length > 0) {
                    response = "Active field alerts: " + activeAlerts.join("; ") + ".";
                } else {
                    response = "All systems nominal. No active hazard or proximity alerts.";
                }
            }

            // --- Case I: Fallback to General AI / Neural Core ---
            else {
                if (window.electronAPI && window.electronAPI.aiChat) {
                    const aiResult = await window.electronAPI.aiChat(query);
                    response = aiResult.response || "I am monitoring the AGRI LINK system. Ask me about temperature, soil moisture, proximity, or active alerts.";
                } else {
                    response = "I am your AGRI LINK smart agriculture assistant. You can ask me for temperature, soil moisture, ultrasonic distance, GPS, or a full sensor summary.";
                }
            }

            typingIndicator.remove();
            this.appendMessage(response, false);
            this.lastResponseText = response;

            // Speak response through selected speaker(s)
            this.speakResponse(response);

        } catch (err) {
            console.error("[VOICE] Synthesis Error:", err);
            typingIndicator.remove();
            const errMsg = "An error occurred while evaluating the sensor telemetry.";
            this.appendMessage(errMsg, false);
            this.updateStateBadge('ERROR');
            setTimeout(() => this.updateStateBadge('IDLE'), 2000);
        }
    }
}

// Instantiate upon DOM load
document.addEventListener("DOMContentLoaded", () => {
    window.agriVoiceAssistant = new AgriVoiceAssistant();
});

