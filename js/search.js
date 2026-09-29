#!/usr/bin/env node
"use strict";

const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="A transparent, consent-based public IP sharing page.">
  <title>Network Check-in</title>
  <style>
    :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#070b12;color:#f8fafc}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -20%,#164e6355,transparent 46%),linear-gradient(160deg,#080d16,#06080d);display:grid;place-items:center;padding:24px}
    .card{width:min(560px,100%);padding:36px;border:1px solid #ffffff1a;border-radius:28px;background:#121823e8;box-shadow:0 30px 80px #0007;backdrop-filter:blur(18px)}
    .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:30px}.mark{width:48px;height:48px;border-radius:16px;background:#67e8f9;color:#071018;display:grid;place-items:center;font-size:22px;font-weight:900}.pill{border:1px solid #ffffff1a;border-radius:999px;padding:7px 12px;color:#cbd5e1;font-size:14px}
    .eyebrow{margin:0 0 12px;color:#67e8f9;font-size:14px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;max-width:480px;font-size:clamp(38px,8vw,50px);line-height:1.05;letter-spacing:-.045em}p{line-height:1.7}.intro{color:#cbd5e1;margin:20px 0 26px}
    .facts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}.fact{min-height:96px;padding:16px;border:1px solid #ffffff14;border-radius:16px;background:#ffffff09}.fact b{display:block;margin-bottom:7px}.fact span{color:#94a3b8;font-size:14px;line-height:1.45}
    .consent{display:flex;gap:12px;padding:16px;border:1px solid #ffffff1a;border-radius:16px;background:#0003}.consent input{width:20px;height:20px;margin:2px 0 0;accent-color:#67e8f9}.consent label{cursor:pointer;color:#e2e8f0;font-size:14px;line-height:1.6}
    button{width:100%;height:50px;margin-top:16px;border:0;border-radius:12px;background:#67e8f9;color:#071018;font:inherit;font-weight:750;cursor:pointer}button:hover{background:#a5f3fc}button:disabled{background:#334155;color:#94a3b8;cursor:not-allowed}.status{min-height:24px;margin:10px 0 0;text-align:center;color:#a5f3fc;font-size:14px}.status.error{color:#fda4af}
    @media(max-width:520px){.card{padding:24px}.facts{grid-template-columns:1fr}.pill{font-size:12px}}
  </style>
</head>
<body>
  <main class="card">
    <div class="top"><div class="mark" aria-hidden="true">◎</div><div class="pill">🔒 Consent required</div></div>
    <p class="eyebrow">Network check-in</p>
    <h1>Share your public IP address</h1>
    <p class="intro">If you continue, this site will send the public IP address used for this connection to the site owner through Discord. Nothing is sent until you confirm below.</p>
    <div class="facts">
      <div class="fact"><b>Data shared</b><span>Public IP address and submission time</span></div>
      <div class="fact"><b>Your choice</b><span>You can leave without sharing anything</span></div>
    </div>
    <div class="consent">
      <input id="consent" type="checkbox">
      <label for="consent">I understand that my public IP address will be sent to the site owner, and I agree to share it.</label>
    </div>
    <button id="share" type="button" disabled>Share my IP</button>
    <p id="status" class="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    const consent = document.querySelector("#consent");
    const button = document.querySelector("#share");
    const status = document.querySelector("#status");
    consent.addEventListener("change", () => { button.disabled = !consent.checked; status.textContent = ""; status.className = "status"; });
    button.addEventListener("click", async () => {
      if (!consent.checked) return;
      button.disabled = true; button.textContent = "Sharing securely…"; status.textContent = "";
      try {
        const response = await fetch("/share-ip", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({consent:true}) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to share your IP.");
        button.textContent = "IP shared"; status.textContent = "Your IP address was shared successfully.";
      } catch (error) {
        status.className = "status error"; status.textContent = error.message || "Unable to share your IP.";
        button.disabled = false; button.textContent = "Share my IP";
      }
    });
  </script>
</body>
</html>`;

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024) request.destroy();
    });
    request.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
    request.on("error", reject);
  });
}

function getClientIp(request) {
  if (TRUST_PROXY) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
    return response.end(page);
  }

  if (request.method === "POST" && url.pathname === "/share-ip") {
    if (request.headers["content-type"] !== "application/json") return sendJson(response, 415, { message: "JSON is required." });
    let data;
    try { data = await readJson(request); } catch { return sendJson(response, 400, { message: "Invalid request." }); }
    if (data?.consent !== true) return sendJson(response, 400, { message: "Consent is required." });
    if (!WEBHOOK_URL) return sendJson(response, 503, { message: "The Discord delivery channel is not configured." });

    const ip = getClientIp(request);
    try {
      const delivery = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: `Consent-based IP submission\nIP: ${ip}\nSubmitted: ${new Date().toISOString()}`, allowed_mentions: { parse: [] } }),
      });
      if (!delivery.ok) return sendJson(response, 502, { message: "The IP could not be delivered." });
      return sendJson(response, 200, { ok: true });
    } catch {
      return sendJson(response, 502, { message: "The IP could not be delivered." });
    }
  }

  sendJson(response, 404, { message: "Not found." });
});

server.listen(PORT, HOST, () => {
  console.log(`Network Check-in is running at http://${HOST}:${PORT}`);
  if (!WEBHOOK_URL) console.warn("DISCORD_WEBHOOK_URL is not set; submissions are disabled.");
});
