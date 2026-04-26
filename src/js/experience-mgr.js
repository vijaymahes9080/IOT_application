/**
 * EXPERIENCE MANAGER | ORBIT-X
 * Handles page transitions, kinetic energy, and ambient animations.
 */

class ExperienceManager {
    constructor() {
        this.initPortal();
        this.initAmbience();
        this.initAgriFX();
        this.initParallax();
        this.injectSmoothing();
        this.handleEntranceTransition();
        this.launchSequence();
        console.log('[Experience] Master-Level Animation System Active.');
    }

    launchSequence() {
        // Staggered reveal of all key panels for that "Mission Start" feel
        const panels = document.querySelectorAll('.glass-panel, .ai-domain-panel, .str-card');
        panels.forEach((p, idx) => {
            p.style.opacity = '0';
            p.style.transform = 'translateY(20px) scale(0.98)';
            setTimeout(() => {
                p.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                p.style.opacity = '1';
                p.style.transform = 'translateY(0) scale(1)';
            }, 300 + (idx * 60));
        });
    }

    injectSmoothing() {
        // Master-Level Visual Smoothing Injection
        const style = document.createElement('style');
        style.innerText = `
            .glass-panel { opacity: 0; animation: agri-slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
            .glass-panel:nth-child(2) { animation-delay: 0.1s; }
            .glass-panel:nth-child(3) { animation-delay: 0.2s; }
            
            #orbit-chatbot {
                bottom: 20px !important;
                right: 20px !important;
                top: auto !important;
                left: auto !important;
                max-height: 400px;
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
                z-index: 99999 !important;
            }
            #orbit-chatbot.collapsed { transform: translateY(calc(100% - 40px)); }
        `;
        document.head.appendChild(style);
    }

    /**
     * 2. WARP-PORTAL PAGE TRANSITIONS
     */
    initPortal() {
        // Create Portal Overlay elements if they don't exist
        if (!document.getElementById('transition-canvas-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'transition-canvas-overlay';
            document.body.appendChild(overlay);
        }

        if (!document.getElementById('transition-image-container')) {
            const imgContainer = document.createElement('div');
            imgContainer.id = 'transition-image-container';
            document.body.appendChild(imgContainer);
        }

        // Optimized Link Delegation: Reduced impact on system
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.hostname === window.location.hostname && !link.hash && !link.target && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                const target = link.href;
                const types = ['orbital', 'crop', 'zoom', 'grid', 'signal'];
                const chosenType = types[Math.floor(Math.random() * types.length)];
                this.triggerCreativeTransition(target, chosenType);
            }
        });
    }

    handleEntranceTransition() {
        const type = sessionStorage.getItem('orbit_transition_type');
        if (!type) {
            document.body.classList.add('mission-theme');
            return;
        }

        sessionStorage.removeItem('orbit_transition_type');
        document.body.classList.add('transition-active');
        
        const imgContainer = document.getElementById('transition-image-container');
        const main = document.querySelector('.main-container') || document.body;
        
        // Add the discrete cinematic image over the application
        let imagePath = '';
        switch(type) {
            case 'orbital': imagePath = 'img/trans_sat.png'; break;
            case 'crop': imagePath = 'img/trans_crop.png'; break;
            case 'zoom': imagePath = 'img/trans_sat.png'; break;
            case 'grid': imagePath = 'img/trans_signal.png'; break;
            case 'signal': imagePath = 'img/trans_signal.png'; break;
        }

        if (imagePath && imgContainer) {
            imgContainer.innerHTML = '';
            const img = document.createElement('img');
            img.src = imagePath;
            img.className = 'transition-image-out'; // Pops out to reveal new page
            imgContainer.appendChild(img);
        }

        switch(type) {
            case 'crop':
                main.classList.add('crop-morph-in');
                break;
            case 'zoom':
                main.classList.add('camera-zoom-in');
                break;
            case 'orbital':
            case 'grid':
            case 'signal':
                main.style.filter = 'blur(10px)';
                setTimeout(() => main.style.filter = 'blur(0)', 100);
                break;
        }

        // Synchronized handover: Purge all transition states for peak performance
        setTimeout(() => {
            document.body.classList.remove('transition-active');
            document.documentElement.classList.remove('transition-active');
            if (imgContainer) imgContainer.innerHTML = '';
        }, 800);

        // Add cinematic noise temporarily
        const noise = document.createElement('div');
        noise.className = 'cinematic-noise';
        document.body.appendChild(noise);
        setTimeout(() => noise.remove(), 800);
    }

    async triggerCreativeTransition(targetUrl, type) {
        // IMMEDIATE FEEDBACK: Trigger digital interference instantly to eliminate click lag
        document.body.classList.add('transition-active');
        document.documentElement.classList.add('transition-active');
        
        const overlay = document.getElementById('transition-canvas-overlay');
        const imgContainer = document.getElementById('transition-image-container');
        const main = document.querySelector('.main-container') || document.body;

        // Determine image path based on type
        let imagePath = '';
        switch(type) {
            case 'orbital': imagePath = 'img/trans_sat.png'; break;
            case 'crop': imagePath = 'img/trans_crop.png'; break;
            case 'zoom': imagePath = 'img/trans_sat.png'; break;
            case 'grid': imagePath = 'img/trans_signal.png'; break;
            case 'signal': imagePath = 'img/trans_signal.png'; break;
        }

        // PRE-LOADER: Ensure the high-impact image is ready before we reveal it
        const preLoadImage = (path) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = path;
            });
        };

        try {
            const loadedImg = await preLoadImage(imagePath);
            
            // Peak Sync: Inject image once cached
            requestAnimationFrame(() => {
                sessionStorage.setItem('orbit_transition_type', type);

                if (imgContainer) {
                    imgContainer.innerHTML = '';
                    loadedImg.className = 'transition-image';
                    imgContainer.appendChild(loadedImg);
                }

                // Apply logic-specific overlays
                this.applyTransitionFX(type, overlay, main);

                // peak sync for redirect
                setTimeout(() => {
                    window.location.href = targetUrl;
                }, 550); 
            });
        } catch (e) {
            // Safe Fallback: Direct redirect if loading fails
            window.location.href = targetUrl;
        }
    }

    applyTransitionFX(type, overlay, main) {
        switch(type) {
            case 'orbital':
                const scanLine = document.createElement('div');
                scanLine.className = 'orbital-scan-line';
                overlay.appendChild(scanLine);
                main.style.transition = 'filter 0.8s ease'; // Re-added from original
                main.style.filter = 'brightness(2) blur(10px)'; // Re-added from original
                break;
            case 'crop':
                main.classList.add('crop-morph-out');
                break;
            case 'zoom':
                main.classList.add('camera-zoom-out');
                break;
            case 'grid':
                const grid = document.createElement('div');
                grid.className = 'grid-reveal-wave';
                overlay.appendChild(grid);
                break;
            case 'signal':
                const ripple = document.createElement('div');
                ripple.className = 'signal-ripple';
                overlay.appendChild(ripple);
                main.style.transition = 'transform 0.8s ease, filter 0.8s ease'; // Re-added from original
                main.style.transform = 'scale(0.92)'; // Re-added from original
                main.style.filter = 'blur(12px)'; // Re-added from original
                break;
        }
    }

    /**
     * 5. AMBIENT SYSTEM BREATH
     */
    initAmbience() {
        const panels = document.querySelectorAll('.glass-panel');
        panels.forEach((p, i) => {
            // Stagger the breathing animations so they aren't perfectly synced
            setTimeout(() => {
                p.classList.add('breathing');
            }, i * 400);
        });
    }

    /**
     * 4. KINETIC MOMENTUM (ELASTIC NUMBER TWEEN)
     * Animates a number with an elastic easing feel.
     */
    animateNumber(elementId, targetValue, duration = 1000) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const startValue = parseFloat(el.innerText) || 0;
        const startTime = performance.now();

        const update = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Elastic Out Easing (Overshoot effect)
            const elasticProgress = 1 - Math.pow(1 - progress, 3) * (1 - progress * Math.sin(progress * Math.PI * 2.5));
            
            const current = startValue + (targetValue - startValue) * elasticProgress;
            
            if (el.tagName === 'SPAN' || el.tagName === 'DIV') {
                el.innerText = current.toFixed(el.innerText.includes('.') ? 2 : 0);
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.innerText = targetValue.toString();
            }
        };

        requestAnimationFrame(update);
    }

    /**
     * 3. NEURAL PIPELINE (DATA PARTICLES)
     * Fires particles between two elements.
     */
    fireDataBurst(sourceId, targetId) {
        const source = document.getElementById(sourceId);
        const target = document.getElementById(targetId);
        if (!source || !target) return;

        const sRect = source.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();

        for (let i = 0; i < 8; i++) {
            const p = document.createElement('div');
            p.className = 'growth-cell';
            p.style.width = '4px';
            p.style.height = '4px';
            p.style.boxShadow = '0 0 10px var(--accent-primary)';
            p.style.left = `${sRect.left + sRect.width / 2}px`;
            p.style.top = `${sRect.top + sRect.height / 2}px`;
            p.style.position = 'fixed';
            p.style.transition = `all ${0.5 + Math.random() * 0.5}s cubic-bezier(0.34, 1.56, 0.64, 1)`;
            
            document.body.appendChild(p);

            // Animate to target
            requestAnimationFrame(() => {
                p.style.left = `${tRect.left + tRect.width / 2}px`;
                p.style.top = `${tRect.top + tRect.height / 2}px`;
                p.style.opacity = '0';
                p.style.transform = 'scale(2)';
            });

            setTimeout(() => p.remove(), 1000);
        }
    }

    /**
     * PARALLAX DEPTH EFFECT: GPU-Optimized with Throttling
     */
    initParallax() {
        let mouseX = 0, mouseY = 0;
        let currentX = 0, currentY = 0;
        let rafId = null;
        let lastMoveTime = 0;
        let isLooping = false;
        const panels = Array.from(document.querySelectorAll('.glass-panel, .ai-domain-panel, .metric-card'));
        
        if (panels.length === 0) return;

        const startLoop = () => {
            if (isLooping) return;
            isLooping = true;
            const update = () => {
                // Smooth interpolation (lerp) for friction effect
                currentX += (mouseX - currentX) * 0.08;
                currentY += (mouseY - currentY) * 0.08;

                panels.forEach((p, i) => {
                    const depth = (i % 3 + 1) * 0.2;
                    p.style.transform = `translate3d(${currentX * depth}px, ${currentY * depth}px, 0)`;
                });

                // Stop loop if mouse has been idle for 2 seconds and motion has settled
                const settled = Math.abs(mouseX - currentX) < 0.01 && Math.abs(mouseY - currentY) < 0.01;
                if (settled && (Date.now() - lastMoveTime > 2000)) {
                    isLooping = false;
                    return; // exit rAF loop
                }
                rafId = requestAnimationFrame(update);
            };
            rafId = requestAnimationFrame(update);
        };

        document.addEventListener('mousemove', (e) => {
            mouseX = (e.clientX - window.innerWidth / 2) / 55;
            mouseY = (e.clientY - window.innerHeight / 2) / 55;
            lastMoveTime = Date.now();
            startLoop(); // kick-start loop only when mouse moves
        }, { passive: true });
    }

    /**
     * AGRICULTURE SPECIFIC FX
     */
    initAgriFX() {
        // Find panels related to agriculture and add the "Photosynthesis" class
        const agriKeywords = ['agri', 'soil', 'pest', 'yield', 'irrig', 'clim'];
        document.querySelectorAll('.glass-panel').forEach(p => {
            const text = p.innerText.toLowerCase();
            const id = p.id.toLowerCase();
            if (agriKeywords.some(key => text.includes(key) || id.includes(key))) {
                p.classList.add('photo-glow');
            }
        });
    }
}

// Initialize globally
window.experienceMgr = new ExperienceManager();

