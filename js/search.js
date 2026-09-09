document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("searchForm");
  const input = document.getElementById("searchInput");
  const statusEl = document.getElementById("searchStatus");
  const resultsEl = document.getElementById("searchResults");

  if (!form || !input || !resultsEl) return;

  const GROQ_API_KEY = "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";
  const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
  const VISION_MODEL = "qwen/qwen3.6-27b";

  const SEARCH_SYSTEM_PROMPT =
    "You are the product search engine for Viper Gaming, a store that sells gaming mice, keyboards, and mousepads. " +
    "You will be shown a shopper's search query, followed by a catalog of products, each with its id, name, category, type, theme, color palette, description, price, and an image of the product. " +
    "Look at each product's details and its image, then decide which products are relevant to the shopper's query. " +
    "Respond with ONLY a JSON array of the matching product id numbers, ordered from most to least relevant, with no other text, no explanation, and no markdown formatting. " +
    "If nothing matches, respond with an empty array: []";

  let isSearching = false;

  const MAX_IMAGE_DIMENSION = 220;
  const IMAGE_JPEG_QUALITY = 0.6;

  function imageToDataUrl(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = path;
    });
  }

  function setStatus(text, state) {
    statusEl.textContent = text || "";
    statusEl.classList.remove("is-active", "is-error");
    if (state) statusEl.classList.add(state);
  }

  function closeResults() {
    resultsEl.classList.remove("is-open");
    resultsEl.innerHTML = "";
  }

  function renderResults(products) {
    if (!products.length) {
      resultsEl.innerHTML = `<p class="search__empty">No matching products found.</p>`;
      resultsEl.classList.add("is-open");
      return;
    }

    resultsEl.innerHTML = products
      .map(
        (p) => `
        <a class="search__result" href="${VIPER.asset("products/index.html?id=" + p.id)}">
          <img src="${VIPER.asset(p.thumbnail)}" alt="${p.name}">
          <div>
            <p class="search__result-name">${p.name}</p>
            <p class="search__result-type">${p.type || p.category}</p>
          </div>
        </a>
      `
      )
      .join("");
    resultsEl.classList.add("is-open");
  }

  function parseIdList(raw) {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    const jsonText = match ? match[0] : cleaned;
    const ids = JSON.parse(jsonText);
    if (!Array.isArray(ids)) throw new Error("Unexpected response shape");
    return ids.map(Number);
  }

  async function runSearch(query) {
    const products = await VIPER.loadProducts();
    if (!products.length) {
      setStatus("No products available to search.", "is-error");
      return;
    }

    setStatus("Scanning the catalog...", "is-active");

    const content = [
      {
        type: "text",
        text: `Shopper query: "${query}"\n\nCatalog:`
      }
    ];

    let imagesSent = 0;
    const MAX_IMAGES = 2;

    for (const p of products) {
      content.push({
        type: "text",
        text: `id: ${p.id}\nname: ${p.name}\ncategory: ${p.category}\ntype: ${p.type}\ntheme: ${p.theme}\ncolors: ${(p.colors || []).join(", ")}\ndescription: ${p.description}\nprice: $${p.price}`
      });
      if (imagesSent >= MAX_IMAGES) continue;
      try {
        const dataUrl = await imageToDataUrl(VIPER.asset(p.thumbnail));
        content.push({
          type: "image_url",
          image_url: { url: dataUrl }
        });
        imagesSent += 1;
      } catch (e) {
        // skip image if it can't be loaded
      }
    }

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: SEARCH_SYSTEM_PROMPT },
          { role: "user", content }
        ]
      })
    });

    if (res.status === 429) {
      throw new Error("rate_limited");
    }
    if (!res.ok) throw new Error("Search request failed");

    const data = await res.json();
    const raw = data.choices && data.choices[0] && data.choices[0].message.content;
    if (!raw) throw new Error("Empty response");

    const ids = parseIdList(raw);
    const matched = ids
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean);

    setStatus(matched.length ? `${matched.length} product${matched.length === 1 ? "" : "s"} found` : "No matches found", "is-active");
    renderResults(matched);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (!query || isSearching) return;

    isSearching = true;
    closeResults();
    setStatus("Scanning the catalog...", "is-active");

    try {
      await runSearch(query);
    } catch (err) {
      if (err && err.message === "rate_limited") {
        setStatus("Search is busy right now. Wait a moment and try again.", "is-error");
      } else {
        setStatus("Search failed. Try again.", "is-error");
      }
      closeResults();
    } finally {
      isSearching = false;
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search")) closeResults();
  });
});
