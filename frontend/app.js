/**
 * O.D.I.N. — Operational Defense & Intelligence Network
 * ═══════════════════════════════════════════════════════
 * Client Controller v2 — Gungnir Core Dome Animation System
 *
 * Dome State Trigger Map:
 *   Boot              → Bifrost (#4) + Yggdrasil (#6) + Eye idle (#1 ambient)
 *   Message submit    → Aegis (#2) → Valknut (#7) → Mimir's Well (#9 if slow)
 *   Answer rendering  → Odin's Eye (#3) → text appears → Ravens (#5 if citations)
 *   History switch    → Sleipnir (#8)
 *   Error/gated       → Valknut decline → Odin's Wrath
 *   Connection drop   → Brooding Allfather → Bifrost on reconnect
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ── DOM References ── */
    const htmlElem           = document.documentElement;
    const themeToggleBtn     = document.getElementById('theme-toggle-btn');
    const hamburgerBtn       = document.getElementById('hamburger-btn');
    const sidebar            = document.getElementById('sidebar');
    const sidebarBackdrop    = document.getElementById('sidebar-backdrop');
    const newChatBtn         = document.getElementById('new-chat-btn');
    const chatForm           = document.getElementById('chat-form');
    const userInput          = document.getElementById('user-input');
    const sendBtn            = document.getElementById('send-btn');
    const micBtn             = document.getElementById('mic-btn');
    const chatMessages       = document.getElementById('chat-messages');
    const latencyMetric      = document.getElementById('latency-metric');
    const confidenceMetric   = document.getElementById('confidence-metric');

    /* History DOM */
    const historyTodayList   = document.getElementById('history-today-list');
    const historyEarlierList = document.getElementById('history-earlier-list');
    const groupToday         = document.getElementById('group-today');
    const groupEarlier       = document.getElementById('group-earlier');
    const historyEmpty       = document.getElementById('history-empty');

    /* Dome state DOM */
    const allSeeingEye       = document.getElementById('all-seeing-eye');
    const gungnirBootBar     = document.getElementById('gungnir-boot-bar');
    const binaryCrow         = document.getElementById('binary-crow');
    const odinWrathOverlay   = document.getElementById('odin-wrath-overlay');
    const mainPanel          = document.querySelector('.main-panel');
    const domeOrbitLayer     = document.getElementById('dome-orbit-layer');
    const ravenOrbitContainer= document.getElementById('raven-orbit-container');
    const ravenHuginn        = document.getElementById('raven-huginn');
    const ravenMuninn        = document.getElementById('raven-muninn');
    const valknutReticle     = document.getElementById('valknut-reticle');
    const yggdrasilLattice   = document.getElementById('yggdrasil-lattice');
    const bifrostPortal      = document.getElementById('bifrost-portal');
    const sleipnirOverlay    = document.getElementById('sleipnir-overlay');
    const mimirsWellOverlay  = document.getElementById('mimirs-well-overlay');
    const mimir_iris         = document.getElementById('mimir-iris');
    const odinsEyeCanvas     = document.getElementById('odins-eye-canvas');
    const odinsEyeIris       = document.getElementById('odins-eye-iris');
    const aegisShieldCanvas  = document.getElementById('aegis-shield-canvas');

    /* Detect reduced motion preference */
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* State */
    let isProcessing     = false;
    let speechRecognition= null;
    let isListening      = false;
    let mimirTimer       = null;
    let ravenResumeTimer = null;
    let currentSessionId = null;


    /* ════════════════════════════════════════════════════════════════════════
       1. REAL-TIME CHAT HISTORY PERSISTENCE
       ════════════════════════════════════════════════════════════════════════ */

    function getStoredSessions() {
        try { return JSON.parse(localStorage.getItem('odin_sessions') || '[]'); }
        catch { return []; }
    }

    function saveStoredSessions(sessions) {
        localStorage.setItem('odin_sessions', JSON.stringify(sessions));
    }

    function formatTime(ts) {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function isToday(ts) {
        const t = new Date(ts), n = new Date();
        return t.getDate() === n.getDate() &&
               t.getMonth() === n.getMonth() &&
               t.getFullYear() === n.getFullYear();
    }

    function renderHistoryPanel() {
        historyTodayList.innerHTML   = '';
        historyEarlierList.innerHTML = '';
        const sessions = getStoredSessions();

        if (sessions.length === 0) {
            groupToday.style.display   = 'none';
            groupEarlier.style.display = 'none';
            historyEmpty.style.display = 'block';
            return;
        }

        historyEmpty.style.display = 'none';
        let todayCt = 0, earlierCt = 0;

        sessions.sort((a, b) => b.timestamp - a.timestamp).forEach(session => {
            const li = document.createElement('li');
            li.className = `history-item${session.id === currentSessionId ? ' active' : ''}`;
            li.setAttribute('data-id', session.id);

            const content = document.createElement('div');
            content.className = 'history-item-content';

            const title = document.createElement('span');
            title.className = 'history-title';
            title.textContent = session.title || 'Untitled Query';

            const time = document.createElement('span');
            time.className = 'history-time';
            time.textContent = formatTime(session.timestamp);

            content.appendChild(title);
            content.appendChild(time);

            const del = document.createElement('button');
            del.className = 'delete-history-btn';
            del.innerHTML = '✕';
            del.title = 'Delete session';
            del.addEventListener('click', e => {
                e.stopPropagation();
                deleteSession(session.id);
            });

            li.appendChild(content);
            li.appendChild(del);

            li.addEventListener('click', () => loadSession(session.id));

            if (isToday(session.timestamp)) {
                historyTodayList.appendChild(li);
                todayCt++;
            } else {
                historyEarlierList.appendChild(li);
                earlierCt++;
            }
        });

        groupToday.style.display   = todayCt   > 0 ? 'block' : 'none';
        groupEarlier.style.display = earlierCt > 0 ? 'block' : 'none';
    }

    function startNewSession(fireBifrost = false) {
        currentSessionId = 'session_' + Date.now();
        chatMessages.innerHTML = '';
        const emptyClone = buildEmptyState();
        chatMessages.appendChild(emptyClone);
        latencyMetric.textContent    = 'Latency: -- ms';
        confidenceMetric.textContent = 'Grounding: --';
        renderHistoryPanel();
        if (fireBifrost) triggerBifrostPortal();
        else             triggerSleipnirStreak();
    }

    function loadSession(sessionId) {
        if (sessionId === currentSessionId) return;
        const session = getStoredSessions().find(s => s.id === sessionId);
        if (!session) return;
        currentSessionId = sessionId;
        chatMessages.innerHTML = '';
        session.messages.forEach(msg => {
            if (msg.role === 'user') appendMessage('user', msg.text);
            else appendAssistantMessage(msg.text, msg.is_confident, msg.sources || []);
        });
        renderHistoryPanel();
        triggerSleipnirStreak();   /* State #8 on history switch */
    }

    function deleteSession(sessionId) {
        let sessions = getStoredSessions().filter(s => s.id !== sessionId);
        saveStoredSessions(sessions);
        if (currentSessionId === sessionId) startNewSession(false);
        else renderHistoryPanel();
    }

    function saveMessageToSession(role, text, isConfident = true, sources = []) {
        if (!currentSessionId) currentSessionId = 'session_' + Date.now();
        let sessions = getStoredSessions();
        let session  = sessions.find(s => s.id === currentSessionId);

        if (!session) {
            const rawTitle = role === 'user' ? text : 'Defense Query';
            session = {
                id: currentSessionId,
                title: rawTitle.length > 30 ? rawTitle.substring(0, 30) + '…' : rawTitle,
                timestamp: Date.now(),
                messages: []
            };
            sessions.push(session);
        }

        session.messages.push({ role, text, is_confident: isConfident, sources, timestamp: Date.now() });
        session.timestamp = Date.now();
        saveStoredSessions(sessions);
        renderHistoryPanel();
    }

    function buildEmptyState() {
        const wrap = document.createElement('div');
        wrap.id = 'empty-state';
        wrap.className = 'empty-state';
        wrap.innerHTML = `
            <div class="empty-wordmark">O.D.I.N.</div>
            <div class="empty-sub">OPERATIONAL DEFENSE &amp; INTELLIGENCE NETWORK</div>
            <p class="empty-desc">Access declassified defense reports, DRDO tech writeups, logistics specifications, and strategic records.</p>
            <div class="suggestion-grid">
                <button class="chip-btn" data-query="Summarize recent DRDO technology writeups and export products."><span>Summarize DRDO technology &amp; export products</span></button>
                <button class="chip-btn" data-query="What are the technical specifications for Parachute Systems for Directional Sonobuoy?"><span>Technical spec for Directional Sonobuoy</span></button>
                <button class="chip-btn" data-query="Explain the Fire Suppressing Gel specifications and NBC suit details."><span>Fire Suppressing Gel &amp; NBC Suit specs</span></button>
                <button class="chip-btn" data-query="What is the procedure for CEPTAM recruitment and helpline inquiries?"><span>CEPTAM recruitment procedure</span></button>
            </div>
        `;
        wrap.querySelectorAll('.chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                userInput.value = btn.getAttribute('data-query');
                chatForm.dispatchEvent(new Event('submit'));
            });
        });
        return wrap;
    }


    /* ════════════════════════════════════════════════════════════════════════
       2. BOOT SEQUENCE
       State #4 Bifrost fires ONCE on session start.
       State #6 Yggdrasil grows in behind the dome grid.
       Eye enters idle-pulsing ambient state (#1).
       ════════════════════════════════════════════════════════════════════════ */

    function runGungnirBootSequence() {
        /* Eye ambient idle */
        if (allSeeingEye) allSeeingEye.classList.add('idle-pulsing');

        /* Gungnir spearhead bar reveal */
        if (gungnirBootBar) gungnirBootBar.classList.add('active');

        /* Binary Crow fly-in */
        if (binaryCrow) setTimeout(() => binaryCrow.classList.add('fly-in'), 350);

        /* State #4: Bifrost (session start ONLY) */
        triggerBifrostPortal();

        /* State #6: Yggdrasil Root-Lock (session handshake) */
        setTimeout(() => triggerYggdrasilGrow(), 200);

        /* Load history or create new session */
        const sessions = getStoredSessions();
        if (sessions.length > 0) {
            currentSessionId = sessions.sort((a,b) => b.timestamp - a.timestamp)[0].id;
            loadSessionSilent(sessions[0]);
        } else {
            startNewSession(false); /* Bifrost already fired above */
        }

        renderHistoryPanel();
    }

    /** Load session without triggering Sleipnir (used on boot) */
    function loadSessionSilent(session) {
        chatMessages.innerHTML = '';
        session.messages.forEach(msg => {
            if (msg.role === 'user') appendMessage('user', msg.text);
            else appendAssistantMessage(msg.text, msg.is_confident, msg.sources || []);
        });
        if (session.messages.length === 0) chatMessages.appendChild(buildEmptyState());
    }

    runGungnirBootSequence();


    /* ════════════════════════════════════════════════════════════════════════
       3. THEME & NAVIGATION CONTROLS
       ════════════════════════════════════════════════════════════════════════ */

    themeToggleBtn.addEventListener('click', () => {
        const cur = htmlElem.getAttribute('data-theme') || 'light';
        const next = cur === 'light' ? 'dark' : 'light';
        htmlElem.setAttribute('data-theme', next);
        localStorage.setItem('odin_theme', next);
    });

    const savedTheme = localStorage.getItem('odin_theme');
    if (savedTheme) htmlElem.setAttribute('data-theme', savedTheme);

    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarBackdrop.classList.toggle('active');
    });

    sidebarBackdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
    });

    newChatBtn.addEventListener('click', () => startNewSession(false));


    /* ════════════════════════════════════════════════════════════════════════
       4. VOICE ASSISTANT
       ════════════════════════════════════════════════════════════════════════ */

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SR();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;

        speechRecognition.onresult = e => {
            userInput.value = e.results[0][0].transcript;
            micBtn.classList.remove('listening');
            isListening = false;
        };
        speechRecognition.onerror = speechRecognition.onend = () => {
            micBtn.classList.remove('listening');
            isListening = false;
        };

        micBtn.addEventListener('click', () => {
            if (isListening) { speechRecognition.stop(); micBtn.classList.remove('listening'); isListening = false; }
            else             { speechRecognition.start(); micBtn.classList.add('listening');    isListening = true; }
        });
    } else {
        micBtn.style.display = 'none';
    }

    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const clean = text.replace(/\[source:[^\]]+\]/g, '').replace(/^[•*\-]\s*/gm, '');
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
    }


    /* ════════════════════════════════════════════════════════════════════════
       5. DOME ANIMATION TRIGGER FUNCTIONS
       ════════════════════════════════════════════════════════════════════════ */

    /* ── State #1: Huginn & Muninn Radar (ambient — managed via CSS class) ── */
    function setThinkingMode(active) {
        if (!domeOrbitLayer) return;
        if (active) domeOrbitLayer.classList.add('thinking');
        else        domeOrbitLayer.classList.remove('thinking');
    }

    /* ── State #2: Aegis Shield Deployment ── */
    /**
     * Generates 14 hex tile divs distributed in concentric rings around the
     * dome centre. Each tile gets a distance class (near/mid/far) for toolkit-#3
     * rim falloff, and a staggered animation-delay.
     */
    function triggerAegisShield() {
        if (!aegisShieldCanvas || prefersReducedMotion) return;
        aegisShieldCanvas.innerHTML = '';
        aegisShieldCanvas.classList.remove('hidden');
        aegisShieldCanvas.classList.add('deploying');

        const canvasW = aegisShieldCanvas.offsetWidth  || 600;
        const canvasH = aegisShieldCanvas.offsetHeight || 400;
        const cx = canvasW / 2;
        const cy = canvasH / 2;

        const rings = [
            { r: 0.12,  count: 1,  distClass: 'near', baseDelay: 0 },
            { r: 0.25,  count: 4,  distClass: 'near', baseDelay: 0.04 },
            { r: 0.40,  count: 6,  distClass: 'mid',  baseDelay: 0.09 },
            { r: 0.55,  count: 9,  distClass: 'far',  baseDelay: 0.15 },
        ];

        rings.forEach(ring => {
            for (let i = 0; i < ring.count; i++) {
                const angle = (i / ring.count) * Math.PI * 2;
                const rx    = cx * ring.r;
                const ry    = cy * ring.r;
                const x     = cx + rx * Math.cos(angle) - 17;
                const y     = cy + ry * Math.sin(angle) - 17;

                const tile = document.createElement('div');
                tile.className = `aegis-hex-tile ${ring.distClass}`;
                tile.style.left   = `${x}px`;
                tile.style.top    = `${y}px`;
                tile.style.animationDelay = `${ring.baseDelay + i * 0.025}s`;
                aegisShieldCanvas.appendChild(tile);
            }
        });

        /* Auto-clear after animation completes */
        setTimeout(() => {
            aegisShieldCanvas.classList.add('hidden');
            aegisShieldCanvas.classList.remove('deploying');
            aegisShieldCanvas.innerHTML = '';
        }, 900);
    }

    /* ── State #3: Odin's Eye Data Convergence ── */
    /**
     * 10 parabolic streams emanate from outer positions toward the centre iris.
     * Each stream gets a --stream-angle CSS variable so CSS keyframes can
     * rotate + translate along a unique angular path.
     * Returns a Promise that resolves when the iris convergence completes,
     * so the caller can start rendering text immediately after.
     */
    function triggerOdinsEyeConvergence() {
        return new Promise(resolve => {
            if (!odinsEyeCanvas) { resolve(); return; }

            odinsEyeCanvas.classList.remove('hidden');
            /* Remove old streams but keep the iris div */
            odinsEyeCanvas.querySelectorAll('.odins-eye-stream').forEach(el => el.remove());
            if (odinsEyeIris) {
                odinsEyeIris.style.animation = 'none';
                odinsEyeIris.offsetHeight; /* reflow to restart */
                odinsEyeIris.style.animation = '';
            }

            const streamCount = 10;
            const canvasW = odinsEyeCanvas.offsetWidth  || 600;
            const canvasH = odinsEyeCanvas.offsetHeight || 400;
            const cx = canvasW / 2;
            const cy = canvasH / 2;

            for (let i = 0; i < streamCount; i++) {
                const angle  = (i / streamCount) * 360; /* degrees */
                const stream = document.createElement('div');
                stream.className = 'odins-eye-stream';

                /* Stream length: radius from center to near rim */
                const streamLen = Math.min(canvasW, canvasH) * 0.48;
                stream.style.height = `${streamLen}px`;

                /* Position at centre, rotate to angle, push start outward */
                stream.style.left             = `${cx}px`;
                stream.style.top              = `${cy}px`;
                stream.style.transformOrigin  = '0 0';
                stream.style.setProperty('--stream-angle', `${angle}deg`);
                stream.style.setProperty('--stream-delay', `${i * 0.025}s`);
                stream.style.transform        = `rotate(${angle}deg) translateY(-${streamLen}px)`;

                odinsEyeCanvas.appendChild(stream);
            }

            /* Resolve when iris convergence animation ends (~0.8s total) */
            if (prefersReducedMotion) {
                /* Just brighten iris once and resolve immediately */
                if (odinsEyeIris) odinsEyeIris.style.opacity = '0.8';
                setTimeout(() => {
                    if (odinsEyeIris) odinsEyeIris.style.opacity = '0';
                    odinsEyeCanvas.classList.add('hidden');
                    resolve();
                }, 80);
            } else {
                setTimeout(() => {
                    odinsEyeCanvas.classList.add('hidden');
                    odinsEyeCanvas.querySelectorAll('.odins-eye-stream').forEach(el => el.remove());
                    resolve();
                }, 820); /* iris animation: 0.3s delay + 0.5s duration */
            }
        });
    }

    /* ── State #4: Bifrost Quantum Bridge (session-start / reconnect ONLY) ── */
    function triggerBifrostPortal() {
        if (!bifrostPortal) return;
        bifrostPortal.classList.remove('hidden');
        /* Reset animation by reflow */
        bifrostPortal.style.animation = 'none';
        bifrostPortal.offsetHeight;
        bifrostPortal.style.animation = '';

        const rainbow = document.getElementById('bifrost-rainbow');
        if (rainbow) {
            rainbow.style.animation = 'none';
            rainbow.offsetHeight;
            rainbow.style.animation = '';
        }

        setTimeout(() => bifrostPortal.classList.add('hidden'), 720);
    }

    /* ── State #5: Ravens' Report ── */
    /**
     * Pauses the orbital raven animations and plays a convergence arc
     * toward the citation block. After 500ms resumes orbit.
     */
    function triggerRavensDebrief(bubbleDiv) {
        if (!ravenOrbitContainer) return;

        /* Break formation */
        ravenOrbitContainer.classList.add('breaking-formation');

        /* Small perch icon on the bubble */
        const icon = document.createElement('div');
        icon.className = 'ravens-debrief-icon';
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <polygon points="12,2 20,10 16,14 12,10 8,14 4,10"/>
            <polygon points="12,10 18,22 12,18 6,22" opacity="0.8"/>
        </svg>`;
        bubbleDiv.appendChild(icon);
        setTimeout(() => icon.remove(), 600);

        /* Resume orbit after debrief */
        clearTimeout(ravenResumeTimer);
        ravenResumeTimer = setTimeout(() => {
            ravenOrbitContainer.classList.remove('breaking-formation');
        }, 550);
    }

    /* ── State #6: Yggdrasil Root-Lock ── */
    function triggerYggdrasilGrow() {
        if (!yggdrasilLattice) return;
        yggdrasilLattice.classList.remove('hidden');
        /* Restart animation */
        yggdrasilLattice.classList.remove('active');
        yggdrasilLattice.offsetHeight;
        yggdrasilLattice.classList.add('active');
    }

    /* ── State #7: Valknut Lock-On ── */
    /**
     * Shows the reticle, waits for snap animation to complete, then
     * calls onProceed() or onDecline() depending on the confidence result.
     */
    function triggerValknutLockOn() {
        return new Promise(resolve => {
            if (!valknutReticle) { resolve(); return; }

            /* Remove any lingering state classes */
            valknutReticle.classList.remove('hidden', 'valknut-decline', 'valknut-dissolve');

            /* Restart tri animations by reflow */
            valknutReticle.querySelectorAll('.v-tri').forEach(tri => {
                tri.style.animation = 'none';
                tri.offsetHeight;
                tri.style.animation = '';
            });

            /* Resolve after snap completes (~340ms) */
            setTimeout(resolve, 340);
        });
    }

    function resolveValknut(isConfident) {
        if (!valknutReticle) return;

        if (!isConfident) {
            /* Decline: red tint hold for 200ms */
            valknutReticle.classList.add('valknut-decline');
            setTimeout(() => {
                valknutReticle.classList.remove('valknut-decline');
                valknutReticle.classList.add('valknut-dissolve', 'hidden');
                valknutReticle.classList.remove('valknut-dissolve');
            }, 220);
        } else {
            /* Proceed: dissolve straight into Odin's Eye */
            valknutReticle.classList.add('valknut-dissolve');
            setTimeout(() => {
                valknutReticle.classList.add('hidden');
                valknutReticle.classList.remove('valknut-dissolve');
            }, 260);
        }
    }

    /* ── State #8: Sleipnir Streak (history switch) ── */
    function triggerSleipnirStreak() {
        if (!sleipnirOverlay || prefersReducedMotion) return;
        sleipnirOverlay.classList.remove('hidden');

        /* Restart streak animations by toggling hidden */
        sleipnirOverlay.querySelectorAll('.sleipnir-streak').forEach(s => {
            s.style.animation = 'none';
            s.offsetHeight;
            s.style.animation = '';
        });

        setTimeout(() => sleipnirOverlay.classList.add('hidden'), 320);
    }

    /* ── State #9: Mimir's Well ── */
    function startMimirWellTimer() {
        clearTimeout(mimirTimer);
        mimirTimer = setTimeout(() => {
            if (!mimirsWellOverlay) return;
            mimirsWellOverlay.classList.remove('hidden');
            mimirsWellOverlay.classList.add('active');
        }, 2500);
    }

    function stopMimirWell() {
        clearTimeout(mimirTimer);
        if (!mimirsWellOverlay) return;
        mimirsWellOverlay.classList.add('resolved');
        setTimeout(() => {
            mimirsWellOverlay.classList.add('hidden');
            mimirsWellOverlay.classList.remove('active', 'resolved');
        }, 400);
    }

    /* ── Bonus: Odin's Wrath ── */
    function triggerOdinsWrath() {
        if (odinWrathOverlay) {
            odinWrathOverlay.classList.remove('hidden');
            odinWrathOverlay.style.animation = 'none';
            odinWrathOverlay.offsetHeight;
            odinWrathOverlay.style.animation = '';
        }
        if (mainPanel) mainPanel.classList.add('wrath-jitter');
        setTimeout(() => {
            if (odinWrathOverlay) odinWrathOverlay.classList.add('hidden');
            if (mainPanel) mainPanel.classList.remove('wrath-jitter');
        }, 420);
    }

    /* ── Brooding Allfather ── */
    function setBroodingAllfather(active) {
        if (!allSeeingEye) return;
        if (active) {
            allSeeingEye.classList.remove('idle-pulsing');
            allSeeingEye.classList.add('brooding-closed');
        } else {
            allSeeingEye.classList.remove('brooding-closed');
            allSeeingEye.classList.add('idle-pulsing');
        }
    }


    /* ════════════════════════════════════════════════════════════════════════
       6. CHAT SUBMISSION & STREAMING RESPONSE CONSUMER
       Dome sequence per query:
         1. Remove empty state
         2. Submit-narrow eye
         3. Thinking mode (intensify #1)
         4. triggerAegisShield()          — confidence gate validation moment
         5. await triggerValknutLockOn()  — targeting lock
         6. startMimirWellTimer()         — escalation if slow
         7. Stream response tokens into bubble
         8. stopMimirWell()
         9. resolveValknut(isConfident)
        10. await triggerOdinsEyeConvergence() — then text handoff
        11. If citations: triggerRavensDebrief()
       ════════════════════════════════════════════════════════════════════════ */

    chatForm.addEventListener('submit', async e => {
        e.preventDefault();
        const message = userInput.value.trim();
        if (!message || isProcessing) return;
        isProcessing = true;
        userInput.value = '';

        /* Remove empty state */
        const es = document.getElementById('empty-state');
        if (es) es.remove();

        /* Eye submit-narrow */
        if (allSeeingEye) {
            allSeeingEye.classList.add('submit-narrow');
            setTimeout(() => allSeeingEye.classList.remove('submit-narrow'), 280);
        }

        /* Thinking mode on (#1 intensifies) */
        setThinkingMode(true);

        /* Append user message + save */
        appendMessage('user', message);
        saveMessageToSession('user', message);

        /* ──────────────────────────────────────────────────────────────────
           DOME SEQUENCE START: Aegis → Valknut → Mimir
        ────────────────────────────────────────────────────────────────── */

        /* State #2: Aegis Shield (confidence gate check moment) */
        triggerAegisShield();

        /* State #7: Valknut Lock-On (targeting) */
        await triggerValknutLockOn();

        /* State #9: Mimir's Well timer (escalation if no response in 2.5s) */
        startMimirWellTimer();

        /* Build loading bubble */
        const { contentDiv, bubbleDiv } = appendAssistantLoadingBubble();
        const startTime = Date.now();

        try {
            const response = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            stopMimirWell();
            setThinkingMode(false);

            if (!response.ok) {
                /* Error path */
                resolveValknut(false);
                triggerOdinsWrath();
                contentDiv.textContent = response.status === 403 || response.status === 429
                    ? '[SECURITY PROTOCOL] Request blocked or rate-limited.'
                    : 'Error communicating with O.D.I.N. backend.';
                isProcessing = false;
                return;
            }

            /* Remove loading ripple */
            const ripple = bubbleDiv.querySelector('.wisdom-well-ripple');
            if (ripple) ripple.remove();

            /* Read the SSE stream */
            const reader  = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            let isConfident = true;
            let sources     = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const lines = decoder.decode(value).split('\n\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.replace('data: ', '').trim();
                    if (!raw) continue;

                    try {
                        const data = JSON.parse(raw);

                        if (data.type === 'meta') {
                            isConfident = data.is_confident;
                            latencyMetric.textContent    = `TTFT: ${data.ttft_ms} ms`;
                            confidenceMetric.textContent = `Grounding: ${isConfident
                                ? 'High (' + data.confidence_score + ')' : 'Gated'}`;

                            /* Valknut resolution (confident → proceed, not → decline) */
                            resolveValknut(isConfident);

                            if (!isConfident) {
                                triggerOdinsWrath();
                                bubbleDiv.classList.add('shield-wall-hex');
                                const badge = document.createElement('div');
                                badge.className = 'gated-badge';
                                badge.innerHTML = '🛡️ CONFIDENCE GATE · ZERO HALLUCINATION';
                                bubbleDiv.insertBefore(badge, contentDiv);
                            }
                        } else if (data.type === 'token') {
                            accumulated += data.token;
                            contentDiv.textContent = accumulated;
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                        } else if (data.type === 'done') {
                            sources = data.sources || [];
                        }
                    } catch (err) {
                        console.warn('SSE parse error:', err);
                    }
                }
            }

            /* Stream complete — update latency */
            latencyMetric.textContent = `Latency: ${Date.now() - startTime} ms`;

            /* ── State #3: Odin's Eye convergence → text already in bubble,
               iris fires as the answer finalises visually ── */
            if (isConfident) {
                await triggerOdinsEyeConvergence();
            }

            /* Citations render + Ravens' Report */
            if (isConfident && accumulated.includes('[source:')) {
                renderCitationsBlock(bubbleDiv, accumulated);
                triggerRavensDebrief(bubbleDiv);   /* State #5 */
            }

            /* Read-aloud button */
            const ttsBtn = document.createElement('button');
            ttsBtn.className = 'speech-btn';
            ttsBtn.innerHTML = '🔊 Read Aloud';
            ttsBtn.onclick   = () => speakText(accumulated);
            bubbleDiv.appendChild(ttsBtn);

            /* Persist to history */
            saveMessageToSession('assistant', accumulated, isConfident, sources);
            setBroodingAllfather(false);

        } catch (err) {
            console.error('Fetch/stream failure:', err);
            stopMimirWell();
            setThinkingMode(false);
            resolveValknut(false);
            setBroodingAllfather(true);
            contentDiv.textContent = 'Connection to O.D.I.N. backend lost. Retrying…';
            /* Bifrost fires on reconnect (Brooding Allfather → reconnect path) */
            setTimeout(() => {
                triggerBifrostPortal();    /* State #4 on reconnect */
                triggerYggdrasilGrow();   /* State #6 on reconnect */
                setBroodingAllfather(false);
            }, 3000);
        } finally {
            isProcessing = false;
        }
    });


    /* ════════════════════════════════════════════════════════════════════════
       7. UI RENDER HELPERS
       ════════════════════════════════════════════════════════════════════════ */

    function appendMessage(role, text) {
        const row    = document.createElement('div');
        row.className = `message-row ${role}`;
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        bubble.appendChild(content);
        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return { row, bubble, content };
    }

    function appendAssistantMessage(text, isConfident = true, sources = []) {
        const row = document.createElement('div');
        row.className = 'message-row assistant';
        const bubble = document.createElement('div');
        bubble.className = `message-bubble${!isConfident ? ' shield-wall-hex' : ''}`;

        if (!isConfident) {
            const badge = document.createElement('div');
            badge.className = 'gated-badge';
            badge.innerHTML = '🛡️ CONFIDENCE GATE · ZERO HALLUCINATION';
            bubble.appendChild(badge);
        }

        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = text;
        bubble.appendChild(content);

        if (isConfident && text.includes('[source:')) renderCitationsBlock(bubble, text);

        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'speech-btn';
        ttsBtn.innerHTML = '🔊 Read Aloud';
        ttsBtn.onclick   = () => speakText(text);
        bubble.appendChild(ttsBtn);

        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendAssistantLoadingBubble() {
        const row = document.createElement('div');
        row.className = 'message-row assistant';
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble wisdom-well-container';
        const ripple = document.createElement('div');
        ripple.className = 'wisdom-well-ripple';
        const content = document.createElement('div');
        content.className = 'message-content';
        content.textContent = 'Querying O.D.I.N. vector index…';
        bubble.appendChild(ripple);
        bubble.appendChild(content);
        row.appendChild(bubble);
        chatMessages.appendChild(row);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return { messageRow: row, contentDiv: content, bubbleDiv: bubble };
    }

    function renderCitationsBlock(bubbleDiv, text) {
        const matches = text.match(/\[source:\s*[^\]]+\]/g);
        if (!matches) return;
        const block = document.createElement('div');
        block.className = 'citations-block';
        [...new Set(matches)].forEach(cite => {
            const item = document.createElement('div');
            item.className = 'citation-item';
            item.innerHTML = `<span class="citation-marker">◆</span><span>${cite}</span>`;
            block.appendChild(item);
        });
        bubbleDiv.appendChild(block);
    }

});
