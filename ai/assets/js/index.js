document.addEventListener("DOMContentLoaded", async () => {
    // --- Configuration ---
    const API_KEYS_URL = "https://groq-api-keys.pages.dev/apikeys.txt";
    const PRIMARY_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"; 
    const baseSystemPrompt = "you are whizy, a helpful ai assistant, your creator is Mark Espinosa. When giving out info, you dont list it you just say it. Your output is in Markdown format. only use it if you are writing or coding something, do not use it in normal conversation.";
    
    // --- State ---
    let apiKeys = [];
    let apiKeyIndex = 0;
    let isFetching = false;
    let messageHistory = []; 
    let currentImageBase64 = null;
    let currentSystemPrompt = baseSystemPrompt;
    let modelSourceValue = localStorage.getItem("selectedModel") || "moonshotai/kimi-k2-instruct-0905";
    
    // Whisper State
    let mediaRecorder;
    let audioChunks = [];

    // --- Elements ---
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
        voiceOrb: document.getElementById("voiceOrb"),
        statusLabel: document.getElementById("statusLabel"),
        transcriptDiv: document.getElementById("liveTranscript")
    };

    // --- TTS Cleaning Helper ---
    function cleanTextForTTS(text) {
        return text
            .replace(/[#*`_~]/g, '') 
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') 
            .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '') 
            .trim();
    }

    // --- Voice Selection Helper ---
    function getMaleVoice() {
        const voices = window.speechSynthesis.getVoices();
        const maleVoice = voices.find(v => 
            v.name.includes("Google US English") || 
            v.name.includes("Microsoft David") || 
            v.name.includes("Male") ||
            v.name.includes("James") ||
            v.name.includes("Daniel")
        );
        return maleVoice || voices[0];
    }

    // --- Initialization ---
    async function init() {
        setupSTT();
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

        const savedText = localStorage.getItem("selectedModelText");
        if (savedText && elements.modelSelectedText) {
            elements.modelSelectedText.textContent = savedText;
        }

        const savedMemory = localStorage.getItem("ai_memory");
        if (savedMemory) {
            currentSystemPrompt = `${baseSystemPrompt}\n\n[YOUR MEMORY OF THE USER]: ${savedMemory}`;
        }

        if (window.marked) {
            marked.setOptions({
                highlight: (code) => window.hljs ? hljs.highlightAuto(code).value : code,
                breaks: true,
                gfm: true
            });
        }

        await Promise.all([loadKeys(), fetchUserContext()]);
    }

    // --- STT Setup ---
    async function setupSTT() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = []; 
                
                if (elements.voiceOverlay.style.display === "flex") {
                    await processVoiceCall(audioBlob);
                } else {
                    await processWhisperTranscription(audioBlob);
                }
            };
        } catch (e) {
            console.warn("Microphone error:", e);
        }
    }

    async function processWhisperTranscription(blob) {
        if (isFetching) return;
        elements.micIcon.className = "fas fa-spinner fa-spin";
        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            formData.append("model", "whisper-large-v3-turbo");

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

    async function processVoiceCall(blob) {
        if (isFetching) return;
        isFetching = true;
        elements.statusLabel.innerText = "";
        try {
            const formData = new FormData();
            formData.append("file", blob, "recording.webm");
            formData.append("model", "whisper-large-v3-turbo");

            const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKeys[0]}` },
                body: formData
            });
            const sttData = await sttRes.json();
            const userText = sttData.text;

            if (!userText || userText.length < 2) {
                isFetching = false;
                return;
            }

            elements.transcriptDiv.innerText = userText;
            messageHistory.push({ role: "user", content: userText });
            
            const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getNextApiKey()}` },
                body: JSON.stringify({
                    model: modelSourceValue,
                    messages: [{ role: "system", content: currentSystemPrompt }, ...messageHistory]
                })
            });

            const aiData = await aiRes.json();
            const reply = aiData.choices[0].message.content;
            messageHistory.push({ role: "assistant", content: reply });

            speakCall(reply);
        } catch (err) {
            elements.statusLabel.innerText = "Connection Error";
            isFetching = false;
        }
    }

    function speakCall(text) {
        window.speechSynthesis.cancel();
        const cleaned = cleanTextForTTS(text);
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.voice = getMaleVoice();

        utterance.onstart = () => elements.voiceOrb.classList.add("speaking");
        utterance.onend = () => {
            elements.voiceOrb.classList.remove("speaking");
            isFetching = false;
            updateMemory(); // Write to memory after speaking
        };
        window.speechSynthesis.speak(utterance);
    }

    // --- Chat Logic ---
    async function handleSend(isRegenerate = false) {
        if (isFetching) return;
        let text = elements.aiInput.value.trim();
        let lastImg = currentImageBase64;

        if (isRegenerate) {
            if (messageHistory.length < 2) return;
            messageHistory.pop();
            const aiMsgs = elements.chatBody.querySelectorAll(".ai-message");
            if (aiMsgs.length > 0) aiMsgs[aiMsgs.length - 1].remove();
            const lastUser = messageHistory[messageHistory.length - 1];
            text = typeof lastUser.content === 'string' ? lastUser.content : lastUser.content[0].text;
        } else {
            if (!text && !currentImageBase64) return;
            if (elements.branding) elements.branding.style.display = "none";
            renderUserMessage(text, currentImageBase64);
            messageHistory.push({ 
                role: "user", 
                content: currentImageBase64 ? [{type:"text", text: text || "Analyze this image"}, {type:"image_url", image_url:{url: currentImageBase64}}] : text 
            });
            clearInputArea();
        }

        const aiDiv = renderAiContainer();
        const aiTextContainer = aiDiv.querySelector(".ai-text");
        isFetching = true;
        let fullReply = "";

        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getNextApiKey()}` },
                body: JSON.stringify({ model: lastImg ? PRIMARY_VISION_MODEL : modelSourceValue, messages: [{ role: "system", content: currentSystemPrompt }, ...messageHistory], stream: true })
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const lines = decoder.decode(value).split("\n");
                for (const line of lines) {
                    const msg = line.replace(/^data: /, "").trim();
                    if (msg === "" || msg === "[DONE]") continue;
                    try {
                        const content = JSON.parse(msg).choices[0].delta.content;
                        if (content) {
                            fullReply += content;
                            aiTextContainer.innerHTML = marked.parse(fullReply);
                            elements.chatBody.scrollTo(0, elements.chatBody.scrollHeight);
                        }
                    } catch (e) {}
                }
            }
            messageHistory.push({ role: "assistant", content: fullReply });
            addAiTools(aiDiv, fullReply);
            updateMemory(); // Write to memory after text response
        } catch (e) { aiTextContainer.textContent = "Error: " + e.message; }
        finally { isFetching = false; }
    }

    // --- UI Helpers ---
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
            window.speechSynthesis.cancel();
            const cleaned = cleanTextForTTS(text);
            const utterance = new SpeechSynthesisUtterance(cleaned);
            utterance.voice = getMaleVoice();
            window.speechSynthesis.speak(utterance);
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
            const res = await fetch(API_KEYS_URL);
            const txt = await res.text();
            apiKeys = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        } catch (e) {}
    }

    function getNextApiKey() {
        const key = apiKeys[apiKeyIndex];
        apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length;
        return key;
    }

    async function fetchUserContext() {
        try {
            const res = await fetch('https://ipapi.co/json/');
            const d = await res.json();
            currentSystemPrompt += ` [Location: ${d.city}, ${d.country_name}]`;
        } catch (e) {}
    }

    async function updateMemory() {
        if (messageHistory.length === 0) return;
        const existingMemory = localStorage.getItem("ai_memory") || "None";
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKeys[0]}` },
                body: JSON.stringify({ 
                    model: "llama-3.1-8b-instant", 
                    messages: [
                        { role: "system", content: `You are whizy's memory module. Summarize important new facts about the user from the recent conversation and merge them with existing memory. Keep it brief. Existing Memory: ${existingMemory}` },
                        ...messageHistory.slice(-2)
                    ] 
                })
            });
            const d = await res.json();
            if (d.choices && d.choices[0].message.content) {
                const newMem = d.choices[0].message.content.trim();
                localStorage.setItem("ai_memory", newMem);
                currentSystemPrompt = `${baseSystemPrompt}\n\n[YOUR MEMORY OF THE USER]: ${newMem}`;
            }
        } catch (e) {}
    }

    // --- Listeners ---
    elements.sendMsg.onclick = () => handleSend();
    elements.aiInput.oninput = () => elements.sendMsg.disabled = !elements.aiInput.value.trim();
    elements.aiInput.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } };

    elements.startCallBtn.onclick = () => elements.voiceOverlay.style.display = "flex";
    elements.closeCallBtn.onclick = () => {
        elements.voiceOverlay.style.display = "none";
        window.speechSynthesis.cancel();
    };

    elements.voiceOrb.onmousedown = () => {
        if (!isFetching && mediaRecorder && mediaRecorder.state === "inactive") {
            window.speechSynthesis.cancel();
            audioChunks = [];
            mediaRecorder.start();
            elements.voiceOrb.classList.add("listening");
        }
    };
    window.onmouseup = () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            elements.voiceOrb.classList.remove("listening");
        }
    };

    elements.micBtn.onclick = () => {
        if (mediaRecorder.state === "inactive") {
            audioChunks = [];
            mediaRecorder.start();
            elements.micBtn.style.color = "red";
        } else {
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