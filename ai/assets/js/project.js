document.addEventListener("DOMContentLoaded", async () => {
    let demoStep = 0;
    let maleVoice = null;
    let mediaRecorder;
    let audioChunks = [];
    
    // --- Scripted Conversation for Call Mode (Step 5) ---
    let scriptIndex = 0;
    const voiceScript = [
        "That's right, I'm here to chat with you in real-time. You can ask me anything, and I'll do my best to provide helpful and accurate information.",
    ];

    // --- Automated Chat Sequence for Demo Step 4 ---
    let sequenceIndex = 0;
    const chatSequence = [
        { user: "hello! I am mark espinosa.", ai: "Hey Mark! It's great to meet you. How can I help you today?" },
        { user: "can you solve this complex equation? ∫(-∞ to ∞) [e^(ixt) / (1 + x^2)] dx = πe^(-t)", ai: "Sure! The integral of e^(ixt) / (1 + x^2) from negative infinity to positive infinity is equal to πe^(-t) for t > 0. This result can be derived using contour integration in complex analysis or by recognizing it as the Fourier transform of the Lorentz or Cauchy distribution." },
        { user: "Okay, nice chatting with you!", ai: "It was great chatting with you too! If you want to explore more math or physics topics, I'm here to help. Have a great day!" }
    ];

    const elements = {
        chatBody: document.getElementById("chatBody"),
        aiInput: document.getElementById("aiInput"),
        sendMsg: document.getElementById("sendMsg"),
        modelOptions: document.getElementById("modelOptions"),
        modelSelector: document.getElementById("modelSelector"),
        voiceOverlay: document.getElementById("voiceOverlay"),
        voiceOrb: document.getElementById("voiceOrb"),
        statusLabel: document.getElementById("statusLabel"),
        startCallBtn: document.getElementById("startCallBtn"),
        closeCallBtn: document.getElementById("closeCallBtn"),
        logos: document.querySelectorAll(".logo-item"),
        branding: document.getElementById("branding")
    };

    // --- Voice Setup ---
    function setupVoices() {
        const voices = window.speechSynthesis.getVoices();
        maleVoice = voices.find(v => v.name.includes("David") || v.name.includes("Male") || v.name.includes("Guy") || v.name.includes("Google US English"));
    }
    window.speechSynthesis.onvoiceschanged = setupVoices;
    setupVoices();

    function speak(text) {
        window.speechSynthesis.cancel();
        const ut = new SpeechSynthesisUtterance(text);
        if (maleVoice) ut.voice = maleVoice;
        ut.pitch = 0.9;
        ut.onstart = () => elements.voiceOrb.classList.add("speaking");
        ut.onend = () => elements.voiceOrb.classList.remove("speaking");
        window.speechSynthesis.speak(ut);
    }

    // --- Automated Chat Logic (Step 4) ---
    function startAutomatedChat() {
        if (sequenceIndex >= chatSequence.length) return;

        const currentPair = chatSequence[sequenceIndex];
        elements.aiInput.value = "";
        let i = 0;

        // Simulate User Typing
        const userTyper = setInterval(() => {
            elements.aiInput.value += currentPair.user.charAt(i++);
            if (i === currentPair.user.length) {
                clearInterval(userTyper);
                
                // Pause briefly before "sending"
                setTimeout(() => {
                    handlePresentationResponse(currentPair.user, currentPair.ai);
                }, 600);
            }
        }, 40);
    }

    function handlePresentationResponse(userText, aiText) {
        if (elements.branding) elements.branding.style.display = "none";
        
        renderMsg(userText, "user");
        elements.aiInput.value = "";
        
        const aiDiv = renderMsg("", "ai");
        const container = aiDiv.querySelector(".ai-text");
        let j = 0;

        // Simulate AI "Thinking" and then Typing
        const aiTyper = setInterval(() => {
            container.textContent += aiText.charAt(j++);
            if (j === aiText.length) {
                clearInterval(aiTyper);
                
                sequenceIndex++;
                // If there are more messages, wait 1.5s then start next user message
                if (sequenceIndex < chatSequence.length) {
                    setTimeout(startAutomatedChat, 1500);
                }
            }
        }, 30);
    }

    function renderMsg(text, role) {
        const div = document.createElement("div");
        div.className = `message ${role}-message`;
        div.innerHTML = role === "ai" ? `<div class="ai-text"></div>` : text;
        
        const inner = elements.chatBody.querySelector(".chat-content-inner");
        inner.appendChild(div);
        
        // Auto-scroll
        elements.chatBody.scrollTop = elements.chatBody.scrollHeight;
        return div;
    }

    // --- Presentation Step Logic ---
    window.addEventListener("keydown", async (e) => {
        if (e.key === "ArrowRight") {
            demoStep++;
            if (demoStep === 1) {
                elements.modelOptions.classList.add("active");
            } else if (demoStep === 2) {
                elements.logos.forEach(l => l.classList.add("active"));
            } else if (demoStep === 3) {
                elements.logos.forEach(l => l.classList.remove("active"));
                elements.modelOptions.classList.remove("active");
            } else if (demoStep === 4) {
                // Trigger the 5-message sequence
                startAutomatedChat();
            } else if (demoStep === 5) {
                elements.startCallBtn.click();
            }
        }

        // PTT (Left Arrow) for Voice Mode
        if (e.key === "ArrowLeft" && elements.voiceOverlay.style.display === "flex") {
            if (mediaRecorder && mediaRecorder.state === "inactive") {
                audioChunks = [];
                mediaRecorder.start();
                elements.voiceOrb.classList.add("listening");
                elements.statusLabel.innerText = "Listening...";
                window.speechSynthesis.cancel();
            }
        }
    });

    window.addEventListener("keyup", (e) => {
        if (e.key === "ArrowLeft" && mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            elements.voiceOrb.classList.remove("listening");
            elements.statusLabel.innerText = "Processing...";
            
            setTimeout(() => {
                const reply = voiceScript[scriptIndex];
                elements.statusLabel.innerText = "Speaking...";
                speak(reply);
                scriptIndex = (scriptIndex + 1) % voiceScript.length;
            }, 800);
        }
    });

    // --- Mic & UI Init ---
    async function initMic() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        } catch (e) { console.error("Mic access denied or error:", e); }
    }

    elements.modelSelector.onclick = () => elements.modelOptions.classList.toggle("active");
    
    elements.startCallBtn.onclick = () => { 
        elements.voiceOverlay.style.display = "flex"; 
        initMic(); 
    };

    elements.closeCallBtn.onclick = () => { 
        elements.voiceOverlay.style.display = "none"; 
        window.speechSynthesis.cancel();
        scriptIndex = 0; 
    };

    elements.aiInput.oninput = () => elements.sendMsg.disabled = !elements.aiInput.value.trim();
});