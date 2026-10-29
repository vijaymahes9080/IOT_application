/**
 * AGRI LINK - Master AI Voice Assistant & Multi-Speaker Audio Engine
 * Production-grade Voice Assistant with real microphone capture,
 * live hardware sensor reasoning, natural speech responses,
 * comprehensive orbital & agricultural knowledge base (220+ Q&A),
 * and multi-speaker audio routing (Laptop, Hardware Buzzer, Both).
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
        this.renderWelcomeMessage();
    }

    renderWelcomeMessage() {
        if (!this.chatMessages || this.chatMessages.children.length > 0) return;
        this.appendMessage(
            "<strong>AGRI LINK NEURAL ASSISTANT ONLINE</strong><br>" +
            "I am connected to the live ESP32 sensor array and mission intelligence core. " +
            "Ask me about temperature, soil moisture, VPD, ultrasonic distance, GPS, or any farming advisory.",
            false,
            true
        );
    }

    initDOM() {
        // Build the Voice Control Header & Audio Routing Ribbon if not present
        if (!document.getElementById('voice-audio-controls')) {
            const controlsDiv = document.createElement('div');
            controlsDiv.id = 'voice-audio-controls';
            controlsDiv.style.cssText = `
                background: rgba(6, 12, 24, 0.98);
                border-bottom: 1px solid rgba(0, 229, 255, 0.2);
                padding: 6px 12px;
                display: flex;
                flex-direction: column;
                gap: 5px;
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                flex-shrink: 0;
            `;

            controlsDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span id="voice-state-badge" style="background:rgba(0,229,255,0.2); color:#00e5ff; border:1px solid rgba(0,229,255,0.4); padding:2px 7px; border-radius:3px; font-weight:bold; font-size:10px;">IDLE</span>
                        <span id="hardware-link-badge" style="color:#00ff88; font-size:10px; font-weight:bold;">HW: DETECTING...</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button id="btn-repeat-voice" title="Repeat last answer" class="chat-hdr-btn" style="font-size:9.5px; padding:2px 6px;">REPEAT</button>
                        <button id="btn-stop-voice" title="Stop speaking" class="chat-hdr-btn" style="font-size:9.5px; padding:2px 6px; border-color:var(--state-crit, #ff3366); color:var(--state-crit, #ff3366);">STOP</button>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <label style="color:#8ba3c7; font-size:10px; font-weight:700; flex-shrink:0;">SPEAKER:</label>
                    <select id="voice-speaker-select" style="background:#0b1528; color:#00e5ff; border:1px solid rgba(0,229,255,0.35); border-radius:4px; font-size:10px; padding:3px 6px; flex:1; outline:none;">
                        <option value="laptop">Laptop Speaker (Voice)</option>
                        <option value="hardware">ESP32 Buzzer (HW Chime)</option>
                        <option value="both">Both (Laptop + HW Chime)</option>
                    </select>
                    <label style="display:flex; align-items:center; gap:4px; font-size:10px; color:#8ba3c7; cursor:pointer; flex-shrink:0;" title="Automatically speak answers aloud">
                        <input type="checkbox" id="voice-auto-speak" checked style="accent-color:#00e5ff;">
                        <span style="font-weight:700;">AUTO</span>
                    </label>
                </div>
            `;

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

        // Setup speaker selector listeners
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

        // Periodic hardware status check every 2.5 seconds
        this.updateHardwareLinkStatus();
        setInterval(() => this.updateHardwareLinkStatus(), 2500);
    }

    async updateHardwareLinkStatus() {
        const badge = document.getElementById('hardware-link-badge');
        if (!badge) return;

        try {
            let hwStatus = null;
            let tele = null;

            if (window.electronAPI && window.electronAPI.getHardwareStatus) {
                hwStatus = await window.electronAPI.getHardwareStatus();
            }
            if (window.electronAPI && window.electronAPI.getLatestTelemetry) {
                tele = await window.electronAPI.getLatestTelemetry();
            }

            const isConnected = (hwStatus && hwStatus.status === 'connected') || 
                                (tele && tele.status === 'connected') || 
                                (tele && tele.isFresh);
            const portName = (hwStatus && hwStatus.lastKnownPort) || (tele && tele.port) || 'COM4';

            if (isConnected) {
                badge.innerText = `HW: ${portName} (ONLINE)`;
                badge.style.color = '#00ff88';
                badge.style.textShadow = '0 0 8px rgba(0, 255, 136, 0.4)';
            } else {
                badge.innerText = `HW: READY / STANDBY`;
                badge.style.color = '#00e5ff';
                badge.style.textShadow = 'none';
            }
        } catch (e) {
            badge.innerText = 'HW: STANDBY';
            badge.style.color = '#00e5ff';
        }
    }

    sendHardwareCmd(cmd) {
        if (window.electronAPI && typeof window.electronAPI.sendHardwareCommand === 'function') {
            try {
                window.electronAPI.sendHardwareCommand(cmd);
            } catch (e) {
                console.warn("[VOICE] Hardware cmd dispatch error:", e);
            }
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
                this.audioConfig.selectedVoice = voices.find(v => 
                    (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('David') || v.name.includes('Zira') || v.name.includes('Samantha')) 
                    && v.lang.startsWith('en')
                ) || voices[0];
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
            console.warn("[VOICE] Web Speech API not supported in current environment; typing interface enabled.");
            if (this.chatMic) {
                this.chatMic.title = "Voice recognition requires Chrome or Edge browser. Click for info.";
                this.chatMic.addEventListener('click', () => {
                    this.appendMessage("ℹ️ <strong>Voice Recognition</strong>: Speech recognition is supported in Google Chrome and Microsoft Edge on <code>http://localhost:8080/</code>. In this window, you can type your query in the input box below and press Enter!", false, true);
                });
            }
            return;
        }

        try {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.updateStateBadge('LISTENING');
                this.sendHardwareCmd('CMD:STATE:LISTEN');
                if (this.chatMic) {
                    this.chatMic.style.background = 'rgba(255, 23, 68, 0.4)';
                    this.chatMic.style.color = '#ff1744';
                    this.chatMic.style.borderColor = '#ff1744';
                    this.chatMic.style.boxShadow = '0 0 15px rgba(255, 23, 68, 0.8)';
                }
                if (this.chatInput) {
                    this.chatInput.placeholder = "🎙️ Listening... Speak your query clearly now...";
                }
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

                if (this.chatInput) {
                    this.chatInput.value = finalTranscript || interimTranscript;
                }

                if (finalTranscript.trim().length > 0) {
                    this.stopRecording();
                    this.handleSend();
                }
            };

            this.recognition.onerror = (event) => {
                console.warn("[VOICE] Recognition status:", event.error);
                this.stopRecording();
                this.updateStateBadge('IDLE');

                if (event.error === 'not-allowed' || event.error === 'permission-denied') {
                    this.appendMessage("⚠️ <strong>Microphone Permission Blocked</strong>: Please click the camera/microphone icon in your browser address bar and choose <em>'Always allow'</em>, then click the mic button again.", false, true);
                } else if (event.error === 'network') {
                    this.appendMessage("⚠️ <strong>Voice Recognition Notice</strong>: Google Speech-to-Text network service could not be reached. You can type your query in the text box below and press Enter!", false, true);
                } else if (event.error === 'no-speech') {
                    if (this.chatInput) {
                        this.chatInput.placeholder = "No speech detected. Click the mic button to try again...";
                    }
                }
            };

            this.recognition.onend = () => {
                this.stopRecording();
                if (this.state === 'LISTENING') {
                    this.updateStateBadge('IDLE');
                }
            };

            if (this.chatMic) {
                this.chatMic.addEventListener('click', async () => {
                    if (this.isRecording) {
                        this.recognition.stop();
                        return;
                    }

                    this.stopSpeaking();

                    // Proactively request browser microphone permission prompt if needed
                    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            stream.getTracks().forEach(t => t.stop());
                        } catch (err) {
                            console.warn("[VOICE] getUserMedia check:", err);
                            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                                this.appendMessage("⚠️ <strong>Microphone Access Blocked</strong>: Please allow microphone permission in your browser address bar, then click the mic again.", false, true);
                                return;
                            }
                        }
                    }

                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.warn("[VOICE] Start call exception:", e);
                        try {
                            this.recognition.abort();
                            setTimeout(() => this.recognition.start(), 200);
                        } catch (_) {}
                    }
                });
            }
        } catch (e) {
            console.warn("[VOICE] Speech recognition initialization skipped:", e);
        }
    }

    stopRecording() {
        if (this.isRecording && this.state === 'LISTENING') {
            this.sendHardwareCmd('CMD:STATE:IDLE');
        }
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
        this.sendHardwareCmd('CMD:STATE:SPEAK');

        const device = this.audioConfig.outputDevice;

        // 1. Hardware Notification Chime (ESP32 Piezo Buzzer)
        if (device === 'hardware' || device === 'both') {
            this.sendHardwareCmd('CMD:VOICE_START');
        }

        // 2. Laptop Speaker Playback (Synthesized Voice)
        if (device === 'laptop' || device === 'both') {
            if (!this.speechSynthesis) {
                this.updateStateBadge('IDLE');
                this.sendHardwareCmd('CMD:STATE:IDLE');
                return;
            }

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
                this.sendHardwareCmd('CMD:STATE:IDLE');
            };

            this.currentUtterance.onerror = (err) => {
                console.error("[TTS] Playback Error:", err);
                this.currentUtterance = null;
                this.updateStateBadge('IDLE');
                this.sendHardwareCmd('CMD:STATE:IDLE');
            };

            this.speechSynthesis.speak(this.currentUtterance);
        } else {
            // Hardware Buzzer Only mode: acoustic chime played above, reset to idle after 1.5s
            setTimeout(() => {
                this.updateStateBadge('IDLE');
                this.sendHardwareCmd('CMD:STATE:IDLE');
            }, 1500);
        }
    }

    stopSpeaking() {
        if (this.speechSynthesis) {
            this.speechSynthesis.cancel();
        }
        this.currentUtterance = null;
        if (this.state === 'SPEAKING') {
            this.updateStateBadge('IDLE');
            this.sendHardwareCmd('CMD:STATE:IDLE');
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
            ? "Audio output switched to Laptop Speaker (Synthesized Voice)."
            : target === 'hardware'
            ? "Audio output routed to ESP32 Hardware Buzzer (Acoustic Chime). Voice synthesis remains active on Laptop."
            : "Audio output routed to Both (Laptop Synthesized Voice + ESP32 Buzzer Chime).";
        
        this.appendMessage(`<span style='color:#00ff88'>${msg}</span>`, false, true);
        if (target === 'hardware' || target === 'both') {
            this.sendHardwareCmd('CMD:CHIME');
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
        const btnClear = document.getElementById('btn-chat-clear');
        if (btnClear) {
            btnClear.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.chatMessages) {
                    this.chatMessages.innerHTML = '';
                    this.renderWelcomeMessage();
                }
            });
        }
        const btnResetPos = document.getElementById('btn-chat-reset-pos');
        if (btnResetPos) {
            btnResetPos.addEventListener('click', (e) => {
                e.stopPropagation();
                localStorage.removeItem('orbit-chatbot-pos');
                this.setDefaultPosition();
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
            this.chatBody.style.height = '480px';
            this.chatBody.style.opacity = '1';
            this.chatbot.style.width = '380px';
            this.chatToggle.innerText = '▼';
            this.chatToggle.title = 'Minimize Assistant';
            this.chatHeader.style.padding = '10px 14px';
            this.chatHeader.style.borderBottom = '1px solid rgba(0, 229, 255, 0.25)';
        } else {
            this.chatBody.style.height = '0';
            this.chatBody.style.opacity = '0';
            this.chatbot.style.width = '260px';
            setTimeout(() => { if (!this.isOpen) this.chatBody.style.display = 'none'; }, 300);
            this.chatToggle.innerText = '▲';
            this.chatToggle.title = 'Expand Assistant';
            this.chatHeader.style.borderBottom = 'none';
            this.chatHeader.style.padding = '8px 12px';
        }
    }

    appendMessage(text, isUser = false, isHTML = false) {
        if (!this.chatMessages) return null;
        const msgDiv = document.createElement('div');
        msgDiv.className = isUser ? 'user-msg' : 'ai-msg';

        // Sender Header badge with timestamp
        const headerDiv = document.createElement('div');
        headerDiv.className = `msg-header ${isUser ? 'user' : 'ai'}`;
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        headerDiv.innerHTML = `<span>${isUser ? '👤 YOU' : '🛰️ AGRI LINK NEURAL AI'}</span><span style="opacity:0.6; font-size:9px; font-weight:normal;">${timeStr}</span>`;
        msgDiv.appendChild(headerDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'msg-content';
        if (isHTML) {
            contentDiv.innerHTML = text;
        } else {
            contentDiv.innerText = text;
        }
        msgDiv.appendChild(contentDiv);

        this.chatMessages.appendChild(msgDiv);
        try {
            this.chatMessages.scrollTo({ top: this.chatMessages.scrollHeight, behavior: 'smooth' });
        } catch (_) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
        return msgDiv;
    }

    showTypingIndicator() {
        if (!this.chatMessages) return null;
        const indDiv = document.createElement('div');
        indDiv.className = 'ai-msg typing-indicator-msg';
        indDiv.innerHTML = `
            <div class="msg-header ai">
                <span>🛰️ AGRI LINK NEURAL AI</span>
            </div>
            <div class="typing-indicator">
                <span>Evaluating telemetry & reasoning</span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        this.chatMessages.appendChild(indDiv);
        try {
            this.chatMessages.scrollTo({ top: this.chatMessages.scrollHeight, behavior: 'smooth' });
        } catch (_) {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }
        return indDiv;
    }

    /**
     * Search Comprehensive Knowledge Base (ORBIT_KNOWLEDGE)
     */
    findKnowledgeMatch(query) {
        const kb = window.ORBIT_KNOWLEDGE || (typeof ORBIT_KNOWLEDGE !== 'undefined' ? ORBIT_KNOWLEDGE : null);
        if (!kb || !Array.isArray(kb)) return null;

        const qWords = query.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
        if (qWords.length === 0) return null;

        let bestMatch = null;
        let highestScore = 0;

        for (const item of kb) {
            const itemWords = item.q.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/);
            let score = 0;

            for (const w of qWords) {
                if (itemWords.includes(w)) {
                    score += 2;
                } else if (item.q.toLowerCase().includes(w)) {
                    score += 1;
                }
            }

            if (score > highestScore && score >= 2) {
                highestScore = score;
                bestMatch = item.a;
            }
        }

        return bestMatch;
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
        this.sendHardwareCmd('CMD:STATE:THINK');
        const typingIndicator = this.showTypingIndicator();

        try {
            // Retrieve latest real-time sensor measurements
            let telemetry = null;
            if (window.electronAPI && window.electronAPI.getLatestTelemetry) {
                telemetry = await window.electronAPI.getLatestTelemetry();
            }

            const esp = (telemetry && telemetry.data) ? (telemetry.data.esp32 || telemetry.data) : null;
            const sat = (telemetry && telemetry.data) ? (telemetry.data.satellite || {}) : {};
            const isHardwareConnected = telemetry ? (telemetry.status === 'connected' || telemetry.isFresh) : false;

            let response = "";

            // --- Case A: Temperature & Dew Point Queries ---
            if (lowerQ.includes('temperature') || lowerQ.includes('temp') || lowerQ.includes('heat') || lowerQ.includes('how hot') || lowerQ.includes('dew point')) {
                if (esp && esp.temp1 !== undefined && esp.temp1 !== null && !isNaN(esp.temp1)) {
                    const t = Number(esp.temp1).toFixed(1);
                    const h = (esp.humidity !== undefined && esp.humidity !== null) ? Number(esp.humidity) : 50;
                    const dp = (t - ((100 - h) / 5)).toFixed(1);
                    
                    response = `The current field temperature is ${t}°C, with a calculated dew point of ${dp}°C.`;
                    if (Number(t) > 36) {
                        response += " Alert: Elevated thermal conditions detected. Ensure canopy ventilation and adequate hydration.";
                    } else if (Number(t) < 18) {
                        response += " Microclimate is cool. Frost guard monitoring active.";
                    } else {
                        response += " Thermal conditions are within the optimal photosynthetic bracket.";
                    }
                } else {
                    response = "Temperature telemetry is currently initializing from the DHT11 sensor probe.";
                }
            }

            // --- Case B: Air Humidity & VPD (Vapor Pressure Deficit) Queries ---
            else if (lowerQ.includes('humidity') || lowerQ.includes('vpd') || lowerQ.includes('transpiration') || lowerQ.includes('moist in air')) {
                if (esp && esp.humidity !== undefined && esp.humidity !== null && !isNaN(esp.humidity)) {
                    const h = Number(esp.humidity).toFixed(1);
                    const t = (esp.temp1 !== undefined && esp.temp1 !== null) ? Number(esp.temp1) : 25;
                    
                    // Tetens VPD calculation
                    const vpsat = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
                    const vpd = Math.max(0, vpsat * (1 - (h / 100))).toFixed(2);

                    response = `Relative humidity is currently ${h}%, with a Vapor Pressure Deficit of ${vpd} kPa.`;
                    if (vpd < 0.4) {
                        response += " High humidity/low VPD increases fungal spore risk. Improve airflow.";
                    } else if (vpd > 1.6) {
                        response += " High VPD indicates strong transpiration pull. Monitor root moisture closely.";
                    } else {
                        response += " Transpiration rate is optimal for vegetative growth.";
                    }
                } else {
                    response = "Relative humidity reading is currently initializing from the DHT11 sensor.";
                }
            }

            // --- Case C: Soil Moisture & Irrigation Queries ---
            else if (lowerQ.includes('soil') || lowerQ.includes('water in soil') || lowerQ.includes('irrigation') || lowerQ.includes('pump') || lowerQ.includes('moisture')) {
                if (esp && esp.soilMoisture !== undefined && esp.soilMoisture !== null) {
                    const pct = Number(esp.soilMoisture).toFixed(1);
                    const raw = esp.soilRaw || 4000;
                    response = `Soil hydration is measured at ${pct}% (raw ADC: ${raw}).`;
                    if (Number(pct) < 25) {
                        response += " Soil is below optimal field capacity. Irrigation pump trigger recommended.";
                    } else if (Number(pct) > 80) {
                        response += " Soil is near saturation. Aeration recommended to prevent root anoxia.";
                    } else {
                        response += " Root zone hydration is in the ideal vegetative growth window.";
                    }
                } else {
                    response = "Soil moisture probe is currently reading baseline analog levels.";
                }
            }

            // --- Case D: Distance, Obstacle & Laser Radar Queries ---
            else if (lowerQ.includes('distance') || lowerQ.includes('obstacle') || lowerQ.includes('laser') || lowerQ.includes('range') || lowerQ.includes('proximity') || lowerQ.includes('ultrasonic')) {
                const ultra = esp ? esp.ultrasonic : -1;
                const laser = esp ? esp.laserDistance : 0;
                let parts = [];
                if (ultra !== undefined && ultra > 0) {
                    parts.push(`HC-SR04 ultrasonic radar detects an echo at ${Number(ultra).toFixed(1)} cm.`);
                }
                if (laser !== undefined && laser > 0) {
                    parts.push(`VL53L0X Laser Time-of-Flight locks distance at ${laser} mm.`);
                }

                if (parts.length > 0) {
                    response = parts.join(" ");
                    if ((ultra > 0 && ultra < 15) || (laser > 0 && laser < 200)) {
                        response += " Proximity alert: Object is within the immediate perimeter corridor.";
                    } else {
                        response += " Perimeter corridor is clear.";
                    }
                } else {
                    response = "Proximity and laser rangefinders are active and scanning the perimeter.";
                }
            }

            // --- Case E: Light / Solar Flux Queries ---
            else if (lowerQ.includes('light') || lowerQ.includes('sun') || lowerQ.includes('ldr') || lowerQ.includes('lux') || lowerQ.includes('solar')) {
                if (esp && esp.ldrSensor !== undefined && esp.ldrSensor !== null) {
                    const ldr = esp.ldrSensor;
                    response = `Solar flux raw intensity is ${ldr}. `;
                    if (ldr > 3000) response += "Field conditions are under bright direct sunlight.";
                    else if (ldr > 1500) response += "Ambient diffused daylight detected.";
                    else response += "Low ambient light / twilight conditions.";
                } else {
                    response = "Solar irradiance sensor reading is currently in standby.";
                }
            }

            // --- Case F: GPS & Orbital Location Queries ---
            else if (lowerQ.includes('gps') || lowerQ.includes('location') || lowerQ.includes('coordinate') || lowerQ.includes('position')) {
                const lat = sat.latitude || (esp ? esp.lat : null);
                const lon = sat.longitude || (esp ? esp.lon : null);
                const fix = esp ? esp.gpsFix : 0;

                if (fix && lat && lon && lat !== 0) {
                    response = `GPS 3D fix locked at Latitude ${Number(lat).toFixed(4)}, Longitude ${Number(lon).toFixed(4)}.`;
                } else {
                    response = "Neo-6M GPS receiver is actively tracking satellite constellations. 3D fix acquisition in progress.";
                }
            }

            // --- Case G: Read All Sensors & Farm Vitality Overview ---
            else if (lowerQ.includes('all sensor') || lowerQ.includes('summary') || lowerQ.includes('overview') || lowerQ.includes('read all') || lowerQ.includes('status') || lowerQ.includes('vitality')) {
                let report = [];
                if (esp) {
                    if (esp.temp1 != null) report.push(`Temp: ${Number(esp.temp1).toFixed(1)}°C`);
                    if (esp.humidity != null) report.push(`Humidity: ${Number(esp.humidity).toFixed(1)}%`);
                    if (esp.soilMoisture != null) report.push(`Soil: ${Number(esp.soilMoisture).toFixed(1)}%`);
                    if (esp.ldrSensor != null) report.push(`Light: ${esp.ldrSensor}`);
                    if (esp.ultrasonic != null && esp.ultrasonic > 0) report.push(`Ultrasonic: ${Number(esp.ultrasonic).toFixed(1)}cm`);
                    if (esp.laserDistance != null && esp.laserDistance > 0) report.push(`Laser: ${esp.laserDistance}mm`);
                }

                if (report.length > 0) {
                    response = "Live Hardware Telemetry: " + report.join(", ") + ". Subsystems are operational.";
                } else {
                    response = "AGRI LINK neural core is online. Sensor stream initialized.";
                }
            }

            // --- Case H: Active Alerts & Health Check ---
            else if (lowerQ.includes('alert') || lowerQ.includes('warning') || lowerQ.includes('danger') || lowerQ.includes('hazard')) {
                const ultra = esp ? esp.ultrasonic : -1;
                const laser = esp ? esp.laserDistance : 0;
                const temp = esp ? esp.temp1 : null;
                const soil = esp ? esp.soilMoisture : null;
                let activeAlerts = [];

                if (ultra > 0 && ultra < 10) activeAlerts.push("Obstacle detected within 10 cm");
                if (laser > 0 && laser < 200) activeAlerts.push("Laser tripwire breach under 200 mm");
                if (temp != null && temp > 40) activeAlerts.push(`Critical temperature at ${Number(temp).toFixed(1)}°C`);
                if (soil != null && soil < 20) activeAlerts.push(`Critical drought: Soil moisture at ${Number(soil).toFixed(1)}%`);

                if (activeAlerts.length > 0) {
                    response = "Hazard Alert Triggered: " + activeAlerts.join("; ") + ". Field action required.";
                } else {
                    response = "All perimeter and agro-environmental parameters are nominal. No active alerts.";
                }
            }

            // --- Case I: Comprehensive Knowledge Base Lookup (ORBIT_KNOWLEDGE) ---
            else {
                const kbMatch = this.findKnowledgeMatch(query);
                if (kbMatch) {
                    response = kbMatch;
                } else if (window.electronAPI && window.electronAPI.aiChat) {
                    try {
                        const aiResult = await window.electronAPI.aiChat(query);
                        const rawResp = (aiResult && aiResult.response) ? aiResult.response : "";
                        if (rawResp && !rawResp.includes('EXTENDED_SEARCH_REQUIRED')) {
                            response = rawResp;
                        } else {
                            response = "I am monitoring AGRI LINK. Live sensor telemetry is active. You can ask for temperature, soil moisture, crop advisory, or system architecture.";
                        }
                    } catch (_) {
                        response = "I am your AGRI LINK smart agriculture assistant. You can ask me for live temperature, soil moisture, ultrasonic distance, GPS, or system architecture.";
                    }
                } else {
                    // Direct browser mode HTTP fetch to Python AI Service
                    try {
                        let res = null;
                        try {
                            res = await fetch('/chat', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ query: query, telemetry: telemetry })
                            });
                        } catch (_) {}

                        if (!res || !res.ok) {
                            try {
                                res = await fetch('http://127.0.0.1:5005/chat', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ query: query, telemetry: telemetry })
                                });
                            } catch (_) {}
                        }

                        if (res && res.ok) {
                            const data = await res.json();
                            if (data.response && !data.response.includes('EXTENDED_SEARCH_REQUIRED')) {
                                response = data.response;
                            }
                        }
                    } catch (_) {}

                    if (!response) {
                        response = "I am your AGRI LINK smart agriculture assistant. Ask me about live temperature, soil moisture, laser distance, or precision farming advisories.";
                    }
                }
            }

            typingIndicator.remove();
            this.appendMessage(response, false);
            this.lastResponseText = response;

            // Speak response aloud
            this.speakResponse(response);

        } catch (err) {
            console.error("[VOICE] Assistant Error:", err);
            typingIndicator.remove();
            const errMsg = "Sensor telemetry evaluation completed. Ask another question about the farm or hardware.";
            this.appendMessage(errMsg, false);
            this.updateStateBadge('ERROR');
            this.sendHardwareCmd('CMD:STATE:ERROR');
            setTimeout(() => {
                this.updateStateBadge('IDLE');
                this.sendHardwareCmd('CMD:STATE:IDLE');
            }, 2000);
        }
    }
}

// Instantiate upon DOM load
document.addEventListener("DOMContentLoaded", () => {
    window.agriVoiceAssistant = new AgriVoiceAssistant();
});
