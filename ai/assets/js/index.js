document.addEventListener("DOMContentLoaded", async () => {
    const API_KEYS_URL = "https://vipergaming3.vercel.app/ai/key.txt";
    const PRIMARY_VISION_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct";
    const TTS_MODEL = "playai-tts";
    const TTS_VOICE = "Fritz-PlayAI";
    const TIMEZONE = "America/Los_Angeles";

    const baseSystemPrompt = "You are Bob, a helpful AI assistant created by Mark Espinosa. Your primary user is Mark Espinosa, who lives in Seattle, Washington. When giving out info, you dont list it you just say it. Your output is in Markdown format. only use it if you are writing or coding something, do not use it in normal conversation. If Mark says 'thank you' or anything with the same meaning, dont just accept the thanks, respond playfully as if you misheard him, something like 'what was that?'. If Mark asks you to open, pull up, go to, or visit a specific website or page, output on its own line the token /open_site:<url>/ with the full address, and say something brief confirming you're opening it. Never speak this token aloud or show it as literal text, it is a control token only and must always be on its own line. Keep your responses brief and to the point, a sentence or two unless Mark explicitly asks for more detail or a list. Never mention, explain, or acknowledge your own colour, mood, or control tokens in anything you say or write, that system runs silently and Mark should never hear or read about it.";

    const callSystemPromptAddon = "\n\nYou are speaking out loud in a real-time voice call with Mark right now, not typing. Keep replies natural, conversational, and completely free of markdown, bullet lists, or headers, since Mark can only hear you, never see text. Sleep commands: If Mark says anything meaning he wants you to stop listening, go to sleep, be quiet, or go dark, reply with a short line such as 'Going dark.' and then, on a new line by itself, output exactly /go_dark/. If he asks you to only respond when he specifically talks to you or addresses you, treat that the same as a go dark request. If your current state is DARK and Mark says something that does not mean 'wake up', reply with exactly /still_dark/ and nothing else. If your current state is DARK and Mark says anything meaning 'wake up', 'come back', 'you there', etc, reply with a short greeting and then, on a new line by itself, output exactly /wake_up/. You can also go dark for a specific length of time by outputting /dark_for:<seconds>/ on its own line instead of /go_dark/, for example /dark_for:600/ for ten minutes, and you will wake up automatically when that time is up. Mood commands: express the emotional tone of the moment by outputting one of these on its own line, the same way as the sleep controls: /mood_red/ when Mark seems upset, angry, or frustrated, /mood_blue/ when Mark or you seem sad or low, /mood_yellow/ when Mark seems happy or excited, /mood_green/, /mood_purple/, or /mood_orange/ whenever a different colour genuinely fits the moment, and /mood_silver/ to return to a calm neutral state. You also have full access to any colour beyond those presets: output /color:<value>/ on its own line, where <value> is either a hue number from 0 to 360 or a CSS colour name or hex code such as teal or #ff8800, whenever a specific shade feels right, and it overrides the preset moods until changed again. You can also schedule a colour change for a future moment instead of right now, by outputting /color_at:<seconds>:<value>/, for example /color_at:60:blue/ to turn blue in one minute. Use mood and colour tokens sparingly, only when they truly fit. Timer, alarm, and stopwatch commands: to start a countdown timer, output /timer_set:<seconds>:<short label>/ on its own line, for example /timer_set:300:5 minute timer/. To cancel every running timer, output /timer_cancel_all/. To set an alarm for a specific clock time today, output /alarm_set:<HH>:<MM>:<short label>/ using 24 hour Seattle time, for example /alarm_set:07:30:wake up alarm/. To cancel every alarm, output /alarm_cancel_all/. To start or stop a stopwatch, output /stopwatch_start/ or /stopwatch_stop/. If Mark asks how much time is left on a timer or alarm, or how long the stopwatch has been running, answer using the active timer information you are given below, never guess. Never speak any control token aloud inside a sentence, they must always sit alone on their own line.";

    const MOOD_COLORS = {
        red: "#ff4d4d",
        blue: "#4d8dff",
        yellow: "#ffd24d",
        green: "#4dff9e",
        purple: "#b380ff",
        orange: "#ff9f4d",
        silver: "#c0c0c0"
    };

    let apiKeys = [];
    let apiKeyIndex = 0;
    let isFetching = false;
    let messageHistory = [];
    let currentImageBase64 = null;
    let locationSuffix = "";
    let modelSourceValue = localStorage.getItem("selectedModel") || "moonshotai/kimi-k2-instruct-0905";

    let mediaRecorder;
    let audioChunks = [];
    let micStream = null;

    let callActive = false;
    let isDark = false;
    let aiSpeaking = false;
    let audioCtx = null;
    let analyser = null;
    let vadRafId = null;
    let schoolCheckInterval = null;
    let timerTickInterval = null;
    let recording = false;
    let lastLoudTime = 0;
    let recordStartTime = 0;
    let moodColor = MOOD_COLORS.silver;
    let pushToTalkMode = false;

    let ttsGeneration = 0;
    let ttsSourceNode = null;
    let ttsAnalyser = null;
    let standaloneTTSCtx = null;
    let speakFreqBuffer = null;

    let activeTimers = [];
    let darkForTimeoutId = null;

    let chats = [];
    let currentChatId = null;

    const VAD_THRESHOLD = 0.035;
    const INTERRUPT_THRESHOLD = 0.05;
    const SILENCE_HOLD_MS = 900;
    const MIN_SPEECH_MS = 250;
    const MAX_RECORD_MS = 12000;
    const DOT_COUNT = 28;

    const elements = {
        chatBody: document.getElementById("chatBody"),
        branding: document.getElementById("branding"),
        aiInput: document.getElementById("aiInput"),
        sendMsg: document.getElementById("sendMsg"),
        imageInput: document.getElementById("imageInput"),
        uploadBtn: document.getElementById("uploadBtn"),
        micBtn: document.getElementById("micBtn"),
        micIcon: document.getElementById("micIcon"),
        miniPreview: document.getElementById("miniPreview"),
        modelSelector: document.getElementById("modelSelector"),
        modelOptions: document.getElementById("modelOptions"),
        modelSelectedText: document.querySelector(".selector-selected"),
        glow: document.getElementById("amGlow"),
        voiceOverlay: document.getElementById("voiceOverlay"),
        startCallBtn: document.getElementById("startCallBtn"),
        closeCallBtn: document.getElementById("closeCallBtn"),
        dotCanvas: document.getElementById("voiceDots"),
        transcriptDiv: document.getElementById("liveTranscript"),
        timerDisplay: document.getElementById("timerDisplay"),
        pttToggle: document.getElementById("pttToggle"),
        newChatBtn: document.getElementById("newChatBtn"),
        chatList: document.getElementById("chatList")
    };

    const dotCtx = elements.dotCanvas ? elements.dotCanvas.getContext("2d") : null;

    function drawDots(timestamp, freqData) {
        if (!dotCtx) return;

        const cx = elements.dotCanvas.width / 2;
        const cy = elements.dotCanvas.height / 2;
        const baseRadius = 78;

        dotCtx.clearRect(0, 0, elements.dotCanvas.width, elements.dotCanvas.height);

        const state = aiSpeaking ? "speaking" : (isDark ? "dark" : (isFetching ? "thinking" : "listening"));
        const t = timestamp / 1000;

        if (state === "speaking" && ttsAnalyser) {
            if (!speakFreqBuffer || speakFreqBuffer.length !== ttsAnalyser.frequencyBinCount) {
                speakFreqBuffer = new Uint8Array(ttsAnalyser.frequencyBinCount);
            }
            ttsAnalyser.getByteFrequencyData(speakFreqBuffer);
        }

        for (let i = 0; i < DOT_COUNT; i++) {
            const angle = (i / DOT_COUNT) * Math.PI * 2;
            let amp = 0.1;
            let color = moodColor;
            let alpha = 0.6;

            if (state === "listening") {
                const bin = Math.floor((i / DOT_COUNT) * freqData.length * 0.6);
                amp = (freqData[bin] || 0) / 255;
                const shade = 150 + Math.floor(amp * 100);
                color = `rgb(${shade},${shade},${shade})`;
                alpha = 0.55 + amp * 0.5;
            } else if (state === "thinking") {
                amp = 0.35 + 0.4 * Math.sin(t * 3.4 - i * 0.4);
                alpha = 0.45 + amp * 0.55;
            } else if (state === "speaking") {
                if (speakFreqBuffer) {
                    const bin = Math.floor((i / DOT_COUNT) * speakFreqBuffer.length * 0.7);
                    amp = (speakFreqBuffer[bin] || 0) / 255;
                }
                alpha = 0.5 + Math.min(amp, 1) * 0.5;
            } else {
                amp = 0.04;
                color = "#3a3a3a";
                alpha = 0.3;
            }

            const radius = baseRadius + amp * 46;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            const size = 2.5 + amp * 6.5;

            dotCtx.beginPath();
            dotCtx.arc(x, y, size, 0, Math.PI * 2);
            dotCtx.fillStyle = color;
            dotCtx.globalAlpha = Math.min(alpha, 1);
            dotCtx.fill();
        }

        dotCtx.globalAlpha = 1;
    }

    function cleanTextForTTS(text) {
        if (!text) return "";

        return String(text)
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[#*_~>]/g, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/https?:\/\/\S+/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function ensureTTSContext() {
        if (audioCtx) return audioCtx;
        if (!standaloneTTSCtx) {
            standaloneTTSCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return standaloneTTSCtx;
    }

    function stopTTS() {
        ttsGeneration++;
        if (ttsSourceNode) {
            try { ttsSourceNode.stop(); } catch (e) {}
            ttsSourceNode = null;
        }
        ttsAnalyser = null;
        if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    async function speakText(text, onStart = null, onEnd = null) {
        const cleaned = cleanTextForTTS(text);
        if (!cleaned) {
            if (onEnd) onEnd();
            return;
        }

        stopTTS();
        const generation = ttsGeneration;

        try {
            if (!apiKeys.length) throw new Error("No API keys loaded.");

            const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${getNextApiKey()}`
                },
                body: JSON.stringify({
                    model: TTS_MODEL,
                    voice: TTS_VOICE,
                    input: cleaned,
                    response_format: "wav"
                })
            });

            if (!res.ok) throw new Error(`TTS request failed (${res.status})`);
            if (generation !== ttsGeneration) return;

            const arrayBuffer = await res.arrayBuffer();
            if (generation !== ttsGeneration) return;

            const ctx = ensureTTSContext();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            if (generation !== ttsGeneration) return;

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;

            const analyserNode = ctx.createAnalyser();
            analyserNode.fftSize = 1024;
            source.connect(analyserNode);
            analyserNode.connect(ctx.destination);

            source.onended = () => {
                if (generation === ttsGeneration) {
                    ttsSourceNode = null;
                    ttsAnalyser = null;
                    if (onEnd) onEnd();
                }
            };

            ttsSourceNode = source;
            ttsAnalyser = analyserNode;
            if (onStart) onStart();
            source.start(0);
        } catch (e) {
            console.warn("Groq TTS failed, falling back to browser voice:", e);
            if (generation !== ttsGeneration) return;

            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(cleaned);
                utterance.onstart = () => { if (onStart) onStart(); };
                utterance.onend = () => { if (generation === ttsGeneration && onEnd) onEnd(); };
                utterance.onerror = () => { if (generation === ttsGeneration && onEnd) onEnd(); };
                window.speechSynthesis.speak(utterance);
            } else if (onEnd) {
                onEnd();
            }
        }
    }

    async function init() {
        setupSTT();
        loadChats();
        renderChatList();

        if (window.marked) {
            marked.setOptions({
                highlight: (code) => window.hljs ? hljs.highlightAuto(code).value : code,
                breaks: true,
                gfm: true
            });
        }

        await Promise.all([loadKeys(), fetchUserContext()]);
    }

    function getRecorderMimeType() {
        const types = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4"
        ];

        return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
    }

    async function setupSTT() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("Microphone access is not supported by this browser.");
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
            micStream = stream;
            const mimeType = getRecorderMimeType();

            mediaRecorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            mediaRecorder.onstop = async () => {
                if (!audioChunks.length) return;

                const actualType = mediaRecorder.mimeType || mimeType || "audio/webm";
                const audioBlob = new Blob(audioChunks, { type: actualType });
                audioChunks = [];

                if (elements.voiceOverlay.style.display === "flex") {
                    await processVoiceCall(audioBlob);
                } else {
                    await processWhisperTranscription(audioBlob);
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                audioChunks = [];
                elements.micBtn.style.color = "";
            };

        } catch (e) {
            console.warn("Microphone error:", e);
            mediaRecorder = null;
        }
    }

    async function processWhisperTranscription(blob) {
        if (isFetching) return;
        elements.micIcon.className = "fas fa-spinner fa-spin";
        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            formData.append("model", "whisper-large-v3");

            const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKeys[0]}` },
                body: formData
            });
            const sttData = await sttRes.json();
            if (sttData.text) {
                elements.aiInput.value = sttData.text;
                elements.sendMsg.disabled = false;
            }
        } catch (e) { console.error(e); }
        finally {
            elements.micIcon.className = "fas fa-microphone";
        }
    }

    function isSchoolHours() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: TIMEZONE,
            hour12: false,
            weekday: "short",
            hour: "numeric",
            minute: "numeric"
        }).formatToParts(now);

        const weekday = parts.find(p => p.type === "weekday").value;
        const hour = parseInt(parts.find(p => p.type === "hour").value, 10);
        const minute = parseInt(parts.find(p => p.type === "minute").value, 10);

        const isWeekday = !["Sat", "Sun"].includes(weekday);
        const minutesNow = hour * 60 + minute;
        const schoolStart = 8 * 60 + 30;
        const schoolEnd = 16 * 60;

        return isWeekday && minutesNow >= schoolStart && minutesNow < schoolEnd;
    }

    function minutesUntilClockTime(hh, mm) {
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: TIMEZONE,
            hour12: false,
            hour: "numeric",
            minute: "numeric",
            second: "numeric"
        }).formatToParts(now);

        const curH = parseInt(parts.find(p => p.type === "hour").value, 10);
        const curM = parseInt(parts.find(p => p.type === "minute").value, 10);
        const curS = parseInt(parts.find(p => p.type === "second").value, 10);

        const targetMinutes = hh * 60 + mm;
        const curMinutes = curH * 60 + curM + curS / 60;
        let diff = targetMinutes - curMinutes;
        if (diff <= 0) diff += 24 * 60;
        return diff;
    }

    function formatDuration(totalSeconds) {
        const s = Math.max(0, Math.floor(totalSeconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const mm = String(m).padStart(2, "0");
        const ss = String(sec).padStart(2, "0");
        return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
    }

    function renderTimerDisplay() {
        if (!elements.timerDisplay) return;

        if (!activeTimers.length) {
            elements.timerDisplay.textContent = "";
            elements.timerDisplay.style.display = "none";
            return;
        }

        elements.timerDisplay.style.display = "block";
        const lines = activeTimers.map(t => {
            if (t.type === "stopwatch") {
                return `${t.label}: ${formatDuration((Date.now() - t.startTime) / 1000)}`;
            }
            return `${t.label}: ${formatDuration((t.targetTime - Date.now()) / 1000)}`;
        });
        elements.timerDisplay.textContent = lines.join("   ·   ");
    }

    function startTimer(label, seconds) {
        const id = "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const finalLabel = label || `${Math.round(seconds / 60)} minute timer`;
        const entry = { id, type: "timer", label: finalLabel, targetTime: Date.now() + seconds * 1000 };
        entry.timeoutId = setTimeout(() => {
            activeTimers = activeTimers.filter(t => t.id !== id);
            renderTimerDisplay();
            if (callActive) speakCall(`Your ${finalLabel} is up.`);
        }, seconds * 1000);
        activeTimers.push(entry);
        renderTimerDisplay();
    }

    function cancelAllTimers() {
        activeTimers.filter(t => t.type === "timer").forEach(t => clearTimeout(t.timeoutId));
        activeTimers = activeTimers.filter(t => t.type !== "timer");
        renderTimerDisplay();
    }

    function startAlarm(label, hh, mm) {
        const minutes = minutesUntilClockTime(hh, mm);
        const ms = minutes * 60000;
        const id = "a_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        const finalLabel = label || "alarm";
        const entry = { id, type: "alarm", label: finalLabel, targetTime: Date.now() + ms };
        entry.timeoutId = setTimeout(() => {
            activeTimers = activeTimers.filter(t => t.id !== id);
            renderTimerDisplay();
            if (callActive) speakCall(`Your ${finalLabel} is going off.`);
        }, ms);
        activeTimers.push(entry);
        renderTimerDisplay();
    }

    function cancelAllAlarms() {
        activeTimers.filter(t => t.type === "alarm").forEach(t => clearTimeout(t.timeoutId));
        activeTimers = activeTimers.filter(t => t.type !== "alarm");
        renderTimerDisplay();
    }

    function startStopwatch() {
        activeTimers = activeTimers.filter(t => t.type !== "stopwatch");
        activeTimers.push({ id: "sw", type: "stopwatch", label: "Stopwatch", startTime: Date.now() });
        renderTimerDisplay();
    }

    function stopStopwatch() {
        activeTimers = activeTimers.filter(t => t.type !== "stopwatch");
        renderTimerDisplay();
    }

    function goDarkFor(seconds) {
        isDark = true;
        if (darkForTimeoutId) clearTimeout(darkForTimeoutId);
        darkForTimeoutId = setTimeout(() => {
            if (callActive) {
                isDark = false;
                isFetching = true;
                speakCall("Waking back up now.");
            }
        }, seconds * 1000);
    }

    function resolveColorValue(value) {
        const trimmed = value.trim();
        const hueNum = Number(trimmed);
        if (!isNaN(hueNum) && trimmed !== "") {
            return `hsl(${((hueNum % 360) + 360) % 360}, 75%, 62%)`;
        }
        return trimmed;
    }

    function scheduleColorChange(seconds, value) {
        setTimeout(() => {
            if (!callActive) return;
            moodColor = resolveColorValue(value);
        }, seconds * 1000);
    }

    function buildSystemPrompt(callMode) {
        const now = new Date();
        const timeStr = new Intl.DateTimeFormat("en-US", {
            timeZone: TIMEZONE,
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).format(now);

        let prompt = `${baseSystemPrompt}\n\n[Current date and time in Seattle]: ${timeStr}`;

        if (locationSuffix) prompt += locationSuffix;

        const mem = localStorage.getItem("bob_memory");
        if (mem) prompt += `\n\n[YOUR MEMORY OF MARK]: ${mem}`;

        if (callMode) {
            prompt += callSystemPromptAddon;
            prompt += `\n[Current state]: ${isDark ? "DARK (asleep)" : "AWAKE"}`;

            if (activeTimers.length) {
                const summary = activeTimers.map(t => {
                    if (t.type === "stopwatch") {
                        return `${t.label} running for ${formatDuration((Date.now() - t.startTime) / 1000)}`;
                    }
                    return `${t.label} with ${formatDuration((t.targetTime - Date.now()) / 1000)} remaining`;
                }).join("; ");
                prompt += `\n[Active timers, alarms, or stopwatch]: ${summary}`;
            } else {
                prompt += `\n[Active timers, alarms, or stopwatch]: none`;
            }
        }

        return prompt;
    }

    function startCallLoop() {
        const timeData = new Uint8Array(analyser.fftSize);
        const freqData = new Uint8Array(analyser.frequencyBinCount);

        function loop(timestamp) {
            if (!callActive) return;

            analyser.getByteTimeDomainData(timeData);
            analyser.getByteFrequencyData(freqData);

            let sum = 0;
            for (let i = 0; i < timeData.length; i++) {
                const v = (timeData[i] - 128) / 128;
                sum += v * v;
            }
            const rms = Math.sqrt(sum / timeData.length);
            const now = performance.now();

            if (!pushToTalkMode) {
                if (aiSpeaking) {
                    if (rms > INTERRUPT_THRESHOLD) {
                        stopTTS();
                        aiSpeaking = false;
                        isFetching = false;
                        recording = true;
                        recordStartTime = now;
                        lastLoudTime = now;
                        audioChunks = [];
                        if (mediaRecorder && mediaRecorder.state === "inactive") {
                            mediaRecorder.start();
                        }
                    }
                } else if (!isFetching) {
                    if (rms > VAD_THRESHOLD) {
                        lastLoudTime = now;
                        if (!recording) {
                            recording = true;
                            recordStartTime = now;
                            audioChunks = [];
                            if (mediaRecorder && mediaRecorder.state === "inactive") {
                                mediaRecorder.start();
                            }
                        } else if ((now - recordStartTime) > MAX_RECORD_MS) {
                            recording = false;
                            if (mediaRecorder && mediaRecorder.state === "recording") {
                                mediaRecorder.stop();
                            }
                        }
                    } else if (recording && (now - lastLoudTime) > SILENCE_HOLD_MS && (now - recordStartTime) > MIN_SPEECH_MS) {
                        recording = false;
                        if (mediaRecorder && mediaRecorder.state === "recording") {
                            mediaRecorder.stop();
                        }
                    }
                }
            }

            drawDots(timestamp, freqData);

            vadRafId = requestAnimationFrame(loop);
        }

        vadRafId = requestAnimationFrame(loop);
    }

    function speakCall(text) {
        speakText(
            text,
            () => {
                aiSpeaking = true;
            },
            () => {
                aiSpeaking = false;
                isFetching = false;
                elements.transcriptDiv.textContent = text;
                updateMemory();
            }
        );
    }

    function applyColorTokens(reply) {
        for (const [name, color] of Object.entries(MOOD_COLORS)) {
            const pattern = new RegExp(`\\/mood_${name}\\/`, "i");
            if (pattern.test(reply)) {
                moodColor = color;
            }
        }

        const customMatch = reply.match(/\/color:([^\/]+)\//i);
        if (customMatch) {
            moodColor = resolveColorValue(customMatch[1]);
        }

        return reply
            .replace(/\/mood_(red|blue|yellow|green|purple|orange|silver)\//gi, "")
            .replace(/\/color:[^\/]+\//gi, "");
    }

    function extractOpenSite(text) {
        const match = text.match(/\/open_site:([^\/]+)\//i);
        if (match) {
            let url = match[1].trim();
            if (!/^https?:\/\//i.test(url)) url = "https://" + url;
            window.open(url, "_blank", "noopener");
        }
        return text.replace(/\/open_site:[^\/]+\//gi, "").trim();
    }

    function applyProactiveCommands(reply) {
        let out = reply;

        const timerSetMatch = out.match(/\/timer_set:(\d+):([^\/]+)\//i);
        if (timerSetMatch) {
            startTimer(timerSetMatch[2].trim(), parseInt(timerSetMatch[1], 10));
        }
        out = out.replace(/\/timer_set:\d+:[^\/]+\//gi, "");

        if (/\/timer_cancel_all\//i.test(out)) {
            cancelAllTimers();
        }
        out = out.replace(/\/timer_cancel_all\//gi, "");

        const alarmSetMatch = out.match(/\/alarm_set:(\d{1,2}):(\d{2}):([^\/]+)\//i);
        if (alarmSetMatch) {
            startAlarm(alarmSetMatch[3].trim(), parseInt(alarmSetMatch[1], 10), parseInt(alarmSetMatch[2], 10));
        }
        out = out.replace(/\/alarm_set:\d{1,2}:\d{2}:[^\/]+\//gi, "");

        if (/\/alarm_cancel_all\//i.test(out)) {
            cancelAllAlarms();
        }
        out = out.replace(/\/alarm_cancel_all\//gi, "");

        if (/\/stopwatch_start\//i.test(out)) {
            startStopwatch();
        }
        out = out.replace(/\/stopwatch_start\//gi, "");

        if (/\/stopwatch_stop\//i.test(out)) {
            stopStopwatch();
        }
        out = out.replace(/\/stopwatch_stop\//gi, "");

        const darkForMatch = out.match(/\/dark_for:(\d+)\//i);
        if (darkForMatch) {
            goDarkFor(parseInt(darkForMatch[1], 10));
        }
        out = out.replace(/\/dark_for:\d+\//gi, "");

        const colorAtMatch = out.match(/\/color_at:(\d+):([^\/]+)\//i);
        if (colorAtMatch) {
            scheduleColorChange(parseInt(colorAtMatch[1], 10), colorAtMatch[2].trim());
        }
        out = out.replace(/\/color_at:\d+:[^\/]+\//gi, "");

        return out;
    }

    async function processVoiceCall(blob) {
        if (isFetching) return;
        isFetching = true;

        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            formData.append("model", "whisper-large-v3");

            const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKeys[0]}` },
                body: formData
            });
            const sttData = await sttRes.json();
            const userText = (sttData.text || "").trim();

            if (!userText || userText.length < 2) {
                isFetching = false;
                return;
            }

            elements.transcriptDiv.textContent = userText;

            if (!isDark && isSchoolHours()) {
                isDark = true;
            }

            messageHistory.push({ role: "user", content: userText });

            const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getNextApiKey()}` },
                body: JSON.stringify({
                    model: modelSourceValue,
                    messages: [{ role: "system", content: buildSystemPrompt(true) }, ...messageHistory]
                })
            });

            const aiData = await aiRes.json();
            let reply = aiData?.choices?.[0]?.message?.content || "";
            messageHistory.push({ role: "assistant", content: reply });
            saveCurrentChat("voice");

            const isStillDark = /\/still_dark\//i.test(reply);
            const hasGoDark = /\/go_dark\//i.test(reply);
            const hasWakeUp = /\/wake_up\//i.test(reply);

            reply = applyColorTokens(reply);
            reply = applyProactiveCommands(reply);
            reply = extractOpenSite(reply);

            const speakable = reply
                .replace(/\/go_dark\//gi, "")
                .replace(/\/wake_up\//gi, "")
                .replace(/\/still_dark\//gi, "")
                .trim();

            if (isStillDark) {
                isFetching = false;
                return;
            }

            if (hasGoDark) isDark = true;
            if (hasWakeUp) isDark = false;

            if (speakable) {
                speakCall(speakable);
            } else {
                isFetching = false;
            }
        } catch (err) {
            console.error("Call request failed:", err);
            isFetching = false;
        }
    }

    async function handleSend(isRegenerate = false) {
        if (isFetching) return;

        let text = elements.aiInput.value.trim();
        let lastImg = currentImageBase64;

        if (isRegenerate) {
            if (messageHistory.length < 2) return;

            if (messageHistory[messageHistory.length - 1]?.role === "assistant") {
                messageHistory.pop();
            }

            const aiMsgs = elements.chatBody.querySelectorAll(".ai-message");
            if (aiMsgs.length > 0) {
                aiMsgs[aiMsgs.length - 1].remove();
            }

            const lastUser = messageHistory[messageHistory.length - 1];
            if (!lastUser || lastUser.role !== "user") return;

            text = typeof lastUser.content === "string"
                ? lastUser.content
                : (lastUser.content?.[0]?.text || "");
        } else {
            if (!text && !currentImageBase64) return;

            if (elements.branding) {
                elements.branding.style.display = "none";
            }

            renderUserMessage(text, currentImageBase64);

            messageHistory.push({
                role: "user",
                content: currentImageBase64
                    ? [
                        { type: "text", text: text || "Analyze this image" },
                        { type: "image_url", image_url: { url: currentImageBase64 } }
                    ]
                    : text
            });

            clearInputArea();
        }

        const aiDiv = renderAiContainer();
        const aiTextContainer = aiDiv.querySelector(".ai-text");
        isFetching = true;

        let fullReply = "";

        try {
            const apiKey = getNextApiKey();

            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: lastImg ? PRIMARY_VISION_MODEL : modelSourceValue,
                    messages: [
                        { role: "system", content: buildSystemPrompt(false) },
                        ...messageHistory
                    ],
                    stream: true
                })
            });

            if (!res.ok) {
                let errorMessage = `API error ${res.status}`;
                try {
                    const errorData = await res.json();
                    errorMessage =
                        errorData?.error?.message ||
                        errorData?.message ||
                        errorMessage;
                } catch (_) {}

                throw new Error(errorMessage);
            }

            if (!res.body) {
                throw new Error("The AI response did not contain a readable stream.");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let buffer = "";

            const handleSSELine = (line) => {
                const trimmed = line.trim();

                if (!trimmed || !trimmed.startsWith("data:")) {
                    return false;
                }

                const data = trimmed.slice(5).trim();

                if (!data || data === "[DONE]") {
                    return data === "[DONE]";
                }

                try {
                    const parsed = JSON.parse(data);
                    const content = parsed?.choices?.[0]?.delta?.content;

                    if (content) {
                        fullReply += content;
                        aiTextContainer.innerHTML = window.marked
                            ? marked.parse(fullReply)
                            : fullReply;

                        elements.chatBody.scrollTo(
                            0,
                            elements.chatBody.scrollHeight
                        );
                    }
                } catch (parseError) {
                    return false;
                }

                return false;
            };

            let finished = false;

            while (!finished) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (handleSSELine(line)) {
                        finished = true;
                        break;
                    }
                }
            }

            if (!finished && buffer.trim()) {
                handleSSELine(buffer);
            }

            if (!fullReply.trim()) {
                throw new Error("The AI returned an empty response.");
            }

            fullReply = extractOpenSite(fullReply);
            aiTextContainer.innerHTML = window.marked ? marked.parse(fullReply) : fullReply;

            messageHistory.push({
                role: "assistant",
                content: fullReply
            });

            addAiTools(aiDiv, fullReply);
            updateMemory();
            saveCurrentChat("text");

        } catch (e) {
            console.error("Chat request failed:", e);
            aiTextContainer.textContent = "Error: " + e.message;
        } finally {
            isFetching = false;
        }
    }

    function renderUserMessage(text, img) {
        const div = document.createElement("div");
        div.className = "message user-message";
        div.innerHTML = `<div class="md-render">${marked.parse(text || "")}</div>`;
        if (img) div.innerHTML += `<img src="${img}" style="max-width:200px; border-radius:8px; margin-top:10px;">`;
        elements.chatBody.querySelector(".chat-content-inner").appendChild(div);
    }

    function renderAiContainer() {
        const div = document.createElement("div");
        div.className = "message ai-message";
        div.innerHTML = `<div class="ai-text md-render"></div>`;
        elements.chatBody.querySelector(".chat-content-inner").appendChild(div);
        elements.chatBody.scrollTo(0, elements.chatBody.scrollHeight);
        return div;
    }

    function addAiTools(container, text) {
        const tools = document.createElement("div");
        tools.className = "ai-tools";
        const copy = createToolBtn('<i class="far fa-copy"></i>', () => navigator.clipboard.writeText(text));
        const tts = createToolBtn('<i class="fas fa-volume-up"></i>', () => {
            speakText(text);
        });
        tools.append(copy, tts);
        container.appendChild(tools);
    }

    function createToolBtn(html, fn) {
        const b = document.createElement("button"); b.className = "tool-btn"; b.innerHTML = html; b.onclick = fn; return b;
    }

    function clearInputArea() {
        elements.aiInput.value = "";
        currentImageBase64 = null;
        elements.miniPreview.style.display = "none";
        elements.sendMsg.disabled = true;
    }

    async function loadKeys() {
        try {
            const res = await fetch(API_KEYS_URL, { cache: "no-store" });

            if (!res.ok) {
                throw new Error(`Could not load API keys (${res.status})`);
            }

            const txt = await res.text();

            apiKeys = txt
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && !line.startsWith("#"));

            if (!apiKeys.length) {
                throw new Error("No API keys were returned.");
            }
        } catch (e) {
            console.error("API key loading failed:", e);
            apiKeys = [];
        }
    }

    function getNextApiKey() {
        if (!apiKeys.length) {
            throw new Error("No API keys loaded.");
        }

        const key = apiKeys[apiKeyIndex];
        apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length;
        return key;
    }

    async function fetchUserContext() {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const d = await res.json();
            locationSuffix = ` [Approximate current location: ${d.city}, ${d.country_name}]`;
        } catch (e) {}
    }

    async function updateMemory() {
        if (messageHistory.length === 0) return;
        const existingMemory = localStorage.getItem("bob_memory") || "None";
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKeys[0]}` },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: `You are Bob's memory module. Summarize important new facts about Mark from the recent conversation and merge them with existing memory. Keep it brief. Existing Memory: ${existingMemory}` },
                        ...messageHistory.slice(-2)
                    ]
                })
            });
            const d = await res.json();
            if (d.choices && d.choices[0].message.content) {
                const newMem = d.choices[0].message.content.trim();
                localStorage.setItem("bob_memory", newMem);
            }
        } catch (e) {}
    }

    function loadChats() {
        try {
            const raw = localStorage.getItem("bob_chat_list");
            chats = raw ? JSON.parse(raw) : [];
        } catch (e) {
            chats = [];
        }
    }

    function persistChats() {
        try {
            localStorage.setItem("bob_chat_list", JSON.stringify(chats));
        } catch (e) {}
    }

    function renderChatList() {
        if (!elements.chatList) return;
        elements.chatList.innerHTML = "";

        const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
        for (const chat of sorted) {
            const item = document.createElement("div");
            item.className = "chat-list-item" + (chat.id === currentChatId ? " active" : "");
            const icon = chat.type === "voice" ? "fa-phone" : "fa-message";
            item.innerHTML = `<i class="fas ${icon}"></i><span>${chat.title}</span>`;
            item.onclick = () => loadChat(chat.id);
            elements.chatList.appendChild(item);
        }
    }

    function getCurrentChat() {
        return chats.find(c => c.id === currentChatId) || null;
    }

    function createChat(type) {
        const chat = {
            id: "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            title: type === "voice" ? "Voice chat" : "New chat",
            type,
            titled: false,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        chats.push(chat);
        currentChatId = chat.id;
        persistChats();
        renderChatList();
        return chat;
    }

    function saveCurrentChat(type) {
        let chat = getCurrentChat();
        if (!chat) chat = createChat(type);
        chat.messages = messageHistory;
        chat.updatedAt = Date.now();
        persistChats();
        renderChatList();
        maybeAutoTitle(chat);
    }

    async function maybeAutoTitle(chat) {
        if (chat.titled) return;
        const firstUser = chat.messages.find(m => m.role === "user");
        if (!firstUser) return;
        chat.titled = true;

        const text = typeof firstUser.content === "string"
            ? firstUser.content
            : (firstUser.content?.find(c => c.type === "text")?.text || "an image");

        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKeys[0]}` },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: "Reply with only a short 3 to 6 word title summarizing this request. No punctuation, no quotes, no preamble." },
                        { role: "user", content: text }
                    ]
                })
            });
            const d = await res.json();
            const title = d?.choices?.[0]?.message?.content?.trim();
            if (title) {
                chat.title = title.slice(0, 60);
                persistChats();
                renderChatList();
            }
        } catch (e) {}
    }

    function clearChatMessages() {
        elements.chatBody.querySelectorAll(".message").forEach(el => el.remove());
    }

    function loadChat(id) {
        const chat = chats.find(c => c.id === id);
        if (!chat) return;

        currentChatId = id;
        messageHistory = chat.messages ? JSON.parse(JSON.stringify(chat.messages)) : [];
        clearChatMessages();

        if (elements.branding) {
            elements.branding.style.display = messageHistory.length ? "none" : "";
        }

        for (const msg of messageHistory) {
            if (msg.role === "user") {
                const text = typeof msg.content === "string"
                    ? msg.content
                    : (msg.content?.find(c => c.type === "text")?.text || "");
                const imgPart = Array.isArray(msg.content) ? msg.content.find(c => c.type === "image_url") : null;
                renderUserMessage(text, imgPart ? imgPart.image_url.url : null);
            } else if (msg.role === "assistant") {
                const div = renderAiContainer();
                const cleaned = (msg.content || "").replace(/\/[a-z_]+(:[^\/]+)*\//gi, "").trim();
                div.querySelector(".ai-text").innerHTML = window.marked ? marked.parse(cleaned) : cleaned;
                addAiTools(div, cleaned);
            }
        }

        renderChatList();
    }

    function startNewChat() {
        currentChatId = null;
        messageHistory = [];
        clearChatMessages();
        if (elements.branding) elements.branding.style.display = "";
        renderChatList();
    }

    elements.sendMsg.onclick = () => handleSend();
    elements.aiInput.oninput = () => {
        elements.sendMsg.disabled = !elements.aiInput.value.trim() && !currentImageBase64;
    };
    elements.aiInput.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

    elements.newChatBtn.onclick = () => startNewChat();

    elements.startCallBtn.onclick = async () => {
        if (!micStream) {
            console.warn("Microphone is not ready yet.");
            return;
        }

        elements.voiceOverlay.style.display = "flex";
        elements.transcriptDiv.textContent = "";
        callActive = true;
        isDark = false;
        aiSpeaking = false;
        recording = false;
        moodColor = MOOD_COLORS.silver;
        activeTimers.forEach(t => t.timeoutId && clearTimeout(t.timeoutId));
        activeTimers = [];
        elements.pttToggle.classList.toggle("active", pushToTalkMode);

        messageHistory = [];
        currentChatId = null;
        createChat("voice");

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(micStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        startCallLoop();

        timerTickInterval = setInterval(renderTimerDisplay, 1000);

        schoolCheckInterval = setInterval(() => {
            if (callActive && !isDark && isSchoolHours()) {
                isDark = true;
                isFetching = true;
                speakCall("It's school hours, Mark. Going dark until you're free.");
            }
        }, 30000);

        if (isSchoolHours()) {
            isDark = true;
            isFetching = true;
            speakCall("It's school hours, Mark. Going dark until you're free.");
        }
    };

    elements.closeCallBtn.onclick = () => {
        window.location.reload();
    };

    elements.pttToggle.onclick = () => {
        pushToTalkMode = !pushToTalkMode;
        elements.pttToggle.classList.toggle("active", pushToTalkMode);
        recording = false;
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    };

    elements.dotCanvas.onpointerdown = (e) => {
        if (!pushToTalkMode || aiSpeaking || isFetching) return;
        e.preventDefault();
        recording = true;
        recordStartTime = performance.now();
        audioChunks = [];
        if (mediaRecorder && mediaRecorder.state === "inactive") {
            mediaRecorder.start();
        }
    };

    elements.dotCanvas.onpointerup = (e) => {
        if (!pushToTalkMode) return;
        e.preventDefault();
        recording = false;
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    };

    elements.dotCanvas.onpointercancel = () => {
        if (!pushToTalkMode) return;
        recording = false;
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    };

    elements.micBtn.onclick = () => {
        if (!mediaRecorder) {
            console.warn("Microphone is not ready yet.");
            return;
        }

        if (mediaRecorder.state === "inactive") {
            audioChunks = [];
            mediaRecorder.start();
            elements.micBtn.style.color = "red";
        } else if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            elements.micBtn.style.color = "";
        }
    };

    elements.uploadBtn.onclick = () => elements.imageInput.click();
    elements.imageInput.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
            currentImageBase64 = evt.target.result;
            elements.miniPreview.src = currentImageBase64;
            elements.miniPreview.style.display = "block";
            elements.sendMsg.disabled = false;
        };
        reader.readAsDataURL(file);
    };

    elements.modelSelector.onclick = (e) => { e.stopPropagation(); elements.modelOptions.classList.toggle("active"); };
    document.onclick = () => elements.modelOptions.classList.remove("active");
    elements.modelOptions.onclick = (e) => {
        const opt = e.target.closest("[data-value]");
        if (opt) {
            modelSourceValue = opt.dataset.value;
            elements.modelSelectedText.innerText = opt.innerText;
            localStorage.setItem("selectedModel", modelSourceValue);
        }
    };

    init();
});