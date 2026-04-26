class OrbitAssistant {
    constructor() {
        this.chatbot = document.getElementById('orbit-chatbot');
        this.chatHeader = document.getElementById('chat-header');
        this.chatBody = document.getElementById('chat-body');
        this.chatToggle = document.getElementById('chat-toggle');
        this.chatInput = document.getElementById('chat-input');
        this.chatSend = document.getElementById('chat-send');
        this.chatMic = document.getElementById('chat-mic');
        this.chatMessages = document.getElementById('chat-messages');

        this.isOpen = false;
        this.initEvents();
        this.initSpeechRecognition();
        this.initDraggable();
        this.syncUIState();
    }

    initDraggable() {
        if (!this.chatbot || !this.chatHeader) return;

        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        // Load saved position or default to Top-Right
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
            // Only allow drag from header, but not on toggle button or mic
            if (e.target.closest('#chat-toggle') || e.target.closest('#chat-mic')) return;

            e.preventDefault();
            // Get current mouse position
            pos3 = e.clientX;
            pos4 = e.clientY;

            // Disable animations and set cursor
            this.chatbot.style.transition = 'none';
            this.chatbot.style.cursor = 'grabbing';

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        const elementDrag = (e) => {
            e.preventDefault();
            // Calculate delta
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            // Use getBoundingClientRect for precision tracking
            const rect = this.chatbot.getBoundingClientRect();
            let newTop = rect.top - pos2;
            let newLeft = rect.left - pos1;

            // Strict Boundary Checks (Keep wholly on screen)
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

    initSpeechRecognition() {
        // Use Web Speech API for voice commands
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Web Speech API not supported in this browser.");
            if (this.chatMic) this.chatMic.style.display = 'none';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.isRecording = false;

        this.recognition.onstart = () => {
            this.isRecording = true;
            if (this.chatMic) {
                this.chatMic.style.background = '#ff1744';
                this.chatMic.style.color = '#fff';
            }
            this.chatInput.placeholder = "Listening for command...";
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            this.chatInput.value = transcript;
            this.handleSend(); // Send it through the chat naturally
        };

        this.recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            this.stopRecording();
        };

        this.recognition.onend = () => {
            this.stopRecording();
        };

        if (this.chatMic) {
            this.chatMic.addEventListener('click', () => {
                if (this.isRecording) {
                    this.recognition.stop();
                } else {
                    this.recognition.start();
                }
            });
        }
    }

    stopRecording() {
        this.isRecording = false;
        if (this.chatMic) {
            this.chatMic.style.background = 'rgba(0,229,255,0.1)';
            this.chatMic.style.color = '#00e5ff';
        }
        this.chatInput.placeholder = "Ask about sensor data or query NLP...";
    }

    parseVoiceCommand(transcript) {
        const lowerT = transcript.toLowerCase();

        // Command Routing Logic
        if (lowerT.includes('evasive maneuver')) {
            this.appendMessage("Voice Command Received: EVASIVE MANEUVER.", false, true);
            setTimeout(() => { if (window.confirmAction) window.confirmAction('Execute Evasive Maneuver'); }, 800);
            return true;
        } else if (lowerT.includes('telemetry') && (lowerT.includes('show') || lowerT.includes('open'))) {
            this.appendMessage("Voice Command Received: OPEN TELEMETRY MODAL.", false, true);
            setTimeout(() => { if (window.openTelemetryModal) window.openTelemetryModal(); }, 800);
            return true;
        } else if (lowerT.includes('report') && lowerT.includes('generate')) {
            this.appendMessage("Voice Command Received: GENERATE MISSION REPORT.", false, true);
            setTimeout(() => {
                const btn = document.getElementById('btn-generate-report');
                if (btn) btn.click();
            }, 800);
            return true;
        } else if (lowerT.includes('close') && lowerT.includes('telemetry')) {
            this.appendMessage("<span style='color:var(--text-muted)'>Voice Command Received: CLOSE TELEMETRY MODAL.</span>");
            setTimeout(() => { if (window.closeTelemetryModal) window.closeTelemetryModal(); }, 800);
            return true;
        }

        return false;
    }

    initEvents() {
        if (!this.chatbot) return;

        this.chatHeader.addEventListener('click', () => this.toggleChat());
        this.chatSend.addEventListener('click', () => this.handleSend());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSend();
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
            this.chatBody.style.height = '380px';
            this.chatBody.style.opacity = '1';
            this.chatbot.style.width = '320px';
            this.chatToggle.innerText = '▼';
            this.chatHeader.style.padding = '10px 16px'; // Original padding
            this.chatHeader.style.borderBottom = '1px solid rgba(0, 229, 255, 0.2)';
            this.chatbot.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.8)';
        } else {
            this.chatBody.style.height = '0';
            this.chatBody.style.opacity = '0';
            this.chatbot.style.width = '200px'; // Much slimmer when closed
            // Use 500ms timeout for display:none to allow transition
            setTimeout(() => { if (!this.isOpen) this.chatBody.style.display = 'none'; }, 300);
            this.chatToggle.innerText = '▲';
            this.chatHeader.style.borderBottom = 'none';
            this.chatHeader.style.padding = '8px 12px'; // Tighter padding
            this.chatbot.style.boxShadow = '0 5px 15px rgba(0, 0, 0, 0.4)';
        }
    }

    appendMessage(text, isUser = false, isHTML = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = isUser ? 'user-msg' : 'ai-msg';

        // Dynamic styling for bubbles
        msgDiv.style.alignSelf = isUser ? 'flex-end' : 'flex-start';
        msgDiv.style.background = isUser ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
        msgDiv.style.border = isUser ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)';
        msgDiv.style.padding = '10px 15px';
        msgDiv.style.borderRadius = isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px';
        msgDiv.style.color = '#fff';
        msgDiv.style.maxWidth = '85%';
        msgDiv.style.fontSize = '13px';
        msgDiv.style.lineHeight = '1.4';
        msgDiv.style.wordBreak = 'break-word';
        msgDiv.style.opacity = '0';
        msgDiv.style.transform = 'translateY(10px)';
        msgDiv.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        
        if (isHTML) {
            msgDiv.innerHTML = text;
        } else {
            msgDiv.innerText = text;
        }

        this.chatMessages.appendChild(msgDiv);

        // Micro-animation for appearance
        setTimeout(() => {
            msgDiv.style.opacity = '1';
            msgDiv.style.transform = 'translateY(0)';
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 50);

        return msgDiv;
    }

    async handleSend() {
        const query = this.chatInput.value.trim();
        if (!query) return;

        this.appendMessage(query, true);
        this.chatInput.value = '';

        // 1. Intercept UI Voice/Text Commands First
        const isCommand = this.parseVoiceCommand(query);
        if (isCommand) return;

        // 2. Typing Indicator
        const typingIndicator = this.appendMessage('<span class="muted" style="font-style:italic; opacity: 0.8; animation: pulse 1.5s infinite;">Synthesizing response... </span>');

        try {
            const lowerQ = query.toLowerCase();
            let responseText = "";

            // 1. DYNAMIC SYSTEM STATUS QUERIES (Priority)
            if (lowerQ.includes('status') || lowerQ.includes('connection') || lowerQ.includes('hardware')) {
                if (window.electronAPI && window.electronAPI.getHardwareStatus) {
                    const info = await window.electronAPI.getHardwareStatus();
                    if (info.status === 'connected') {
                        responseText = `System Status: [ONLINE]. Hardware is successfully linked via ${info.lastKnownPort || 'Auto-Port'}. Data integrity is nominal.`;
                    } else if (info.status === 'error') {
                        responseText = `System Status: [ERROR]. ${info.message || 'The serial port is currently locked or inaccessible.'} Please ensure no other apps (like Arduino IDE) are using the port.`;
                    } else {
                        responseText = "System Status: [SIMULATION]. No physical hardware detected. The engine is running on synthetic data streams.";
                    }
                    typingIndicator.remove();
                    this.appendMessage(responseText);
                    return;
                }
            }

            // 2. INTERNAL KNOWLEDGE BASE SEARCH (Static fallback)
            const internalResult = this.findBestAnswer(lowerQ);
            if (internalResult) {
                typingIndicator.remove();
                this.appendMessage(internalResult);
                return;
            }

            // 3. Fallback to LLM / External Knowledge
            if (lowerQ.includes('temperature') || lowerQ.includes('moisture') || lowerQ.includes('soil')) {
                // Try to get real-time values from dashboard telemetry if available
                const soilSrc = window.telemetrySources ? window.telemetrySources.find(s => s.id === 'soilMoisture') : null;
                const tempSrc = window.telemetrySources ? window.telemetrySources.find(s => s.id === 'temp1') : null;
                
                if (soilSrc && soilSrc.history.length > 0) {
                    responseText = `Current LIVE Telemetry: Soil Moisture is ${soilSrc.history[soilSrc.history.length-1].toFixed(1)}%. Temperature-1 is ${tempSrc ? tempSrc.history[tempSrc.history.length-1].toFixed(1) : 'N/A'}°C.`;
                } else {
                    responseText = "I'm monitoring the sensor array. Telemetry is currently being gathered for analysis.";
                }
            } else {
                // Route to Python Neural Core
                if (window.electronAPI && window.electronAPI.aiChat) {
                    const result = await window.electronAPI.aiChat(query);
                    responseText = result.response || "Neural link established, but response was empty.";
                } else {
                    responseText = "Neural Core is offline. I can answer technical questions about the system, but my advanced NLP is limited.";
                }
            }

            typingIndicator.remove();
            this.appendMessage(responseText);

        } catch (err) {
            console.error("Chat Error:", err);
            typingIndicator.remove();
            this.appendMessage("<span style='color:var(--state-crit)'>Critical link failure during neural synthesis.</span>");
        }
    }

    async queryKnowledgeBase(query) {
        try {
            // Expanded bounds: 2000% more context and detail fetched from Wikipedia API
            const baseUrl = 'https://en.wikipedia.org/w/api.php?origin=*&format=json';
            const res = await fetch(`${baseUrl}&action=query&prop=extracts&exsentences=6&exlimit=1&titles=${encodeURIComponent(query)}&explaintext=1`);

            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();

            if (!data.query || !data.query.pages) {
                this.appendMessage("I couldn't find real-time knowledge matching that query. Try asking something else.");
                return;
            }

            const pages = data.query.pages;
            const pageId = Object.keys(pages)[0];

            if (pageId === "-1" || !pages[pageId].extract) {
                // Try a search if direct title match fails
                const searchRes = await fetch(`${baseUrl}&action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=`);
                if (!searchRes.ok) throw new Error(`Search HTTP error! status: ${searchRes.status}`);

                const searchData = await searchRes.json();

                if (searchData && searchData.query && searchData.query.search && searchData.query.search.length > 0) {
                    const firstMatch = searchData.query.search[0].title;
                    const secondRes = await fetch(`${baseUrl}&action=query&prop=extracts&exsentences=7&exlimit=1&titles=${encodeURIComponent(firstMatch)}&explaintext=1`);
                    const secondData = await secondRes.json();

                    if (secondData && secondData.query && secondData.query.pages) {
                        const sPageId = Object.keys(secondData.query.pages)[0];
                        if (sPageId !== "-1" && secondData.query.pages[sPageId].extract) {
                            const resultText = secondData.query.pages[sPageId].extract;
                            this.appendMessage(`${firstMatch.toUpperCase()}: ${resultText}`);
                            return;
                        }
                    }
                }

                this.appendMessage("I couldn't find real-time knowledge matching that query. Ask me about our system telemetry or general knowledge facts!");
            } else {
                const resultText = pages[pageId].extract;
                this.appendMessage(`${pages[pageId].title.toUpperCase()}: ${resultText}`);
            }
        } catch (err) {
            console.error("Wikipedia API Error:", err);
            this.appendMessage("<span style='color:#ff1744'>Error connecting to Knowledge Base.</span>");
        }
    }

    findBestAnswer(query) {
        if (!window.ORBIT_KNOWLEDGE) return null;

        const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (words.length === 0) return null;

        let bestMatch = null;
        let highestScore = 0;

        for (const item of window.ORBIT_KNOWLEDGE) {
            let score = 0;
            const qLower = item.q.toLowerCase();

            // Direct phrase match is high score
            if (qLower.includes(query)) score += 10;

            // Individual word matches
            for (const word of words) {
                if (qLower.includes(word)) score += 2;
            }

            if (score > highestScore) {
                highestScore = score;
                bestMatch = item;
            }
        }

        // Only return if confidence is high enough (e.g., at least 2 points)
        return (highestScore >= 4) ? bestMatch.a : null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.assistant = new OrbitAssistant();
});
