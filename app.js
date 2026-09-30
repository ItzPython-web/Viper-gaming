const products = {
  fang: {
    number: "01 / 03",
    type: "Wireless gaming mouse",
    name: "Fang MK-I",
    price: "$59.99",
    image: "./assets/fang.png",
    description: "A lightweight wireless mouse built for clean flicks and confident tracking. The Fang MK-I keeps the shell focused and the response immediate.",
    specs: [["Connection", "2.4 GHz wireless"], ["Response", "Sub-1ms"], ["Weight", "62 grams"], ["Sensor", "26K optical"]]
  },
  strike: {
    number: "02 / 03",
    type: "Mechanical keyboard",
    name: "Strike TKL",
    price: "$89.99",
    image: "./assets/strike.png",
    description: "A compact tenkeyless board with a rigid frame, fast switches, and the room your mouse hand needs when the match gets serious.",
    specs: [["Layout", "Tenkeyless"], ["Switches", "Linear mechanical"], ["Polling", "1000 Hz"], ["Lighting", "Viper green"]]
  },
  coilbed: {
    number: "03 / 03",
    type: "Gaming mousepad",
    name: "Coilbed XL",
    price: "$24.99",
    image: "./assets/coilbed.png",
    description: "A balanced control surface with the space to play low sensitivity. Smooth enough to glide, textured enough to stop exactly where you intend.",
    specs: [["Size", "900 × 400 mm"], ["Surface", "Control weave"], ["Base", "Natural rubber"], ["Edge", "Low-profile stitch"]]
  }
};

const cards = [...document.querySelectorAll(".product-card")];
const dialog = document.querySelector("#product-dialog");
const searchInput = document.querySelector("#search");
const results = document.querySelector("#search-results");
const resultList = document.querySelector("#result-list");
const emptyState = document.querySelector(".empty-state");
const toast = document.querySelector(".toast");

function animateCount(element) {
  const target = Number(element.dataset.count || 0);
  const duration = 1100;
  const start = performance.now();
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const typedWord = document.querySelector(".typed-word");
const typeWords = ["STRIKE.", "WIN.", "ENDURE."];
let wordIndex = 0;
let letterIndex = typeWords[0].length;
let deleting = true;

function runTypeCycle() {
  if (!typedWord || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const word = typeWords[wordIndex];
  if (deleting) {
    letterIndex -= 1;
    typedWord.textContent = word.slice(0, Math.max(letterIndex, 0));
    if (letterIndex <= 0) {
      deleting = false;
      wordIndex = (wordIndex + 1) % typeWords.length;
      setTimeout(runTypeCycle, 330);
      return;
    }
    setTimeout(runTypeCycle, 68);
    return;
  }
  const nextWord = typeWords[wordIndex];
  letterIndex += 1;
  typedWord.textContent = nextWord.slice(0, letterIndex);
  if (letterIndex >= nextWord.length) {
    deleting = true;
    setTimeout(runTypeCycle, 1450);
    return;
  }
  setTimeout(runTypeCycle, 105);
}

setTimeout(() => {
  document.querySelectorAll(".count-up").forEach(animateCount);
  runTypeCycle();
}, 700);

function openProduct(id) {
  const product = products[id];
  if (!product) return;
  dialog.querySelector(".dialog-number").textContent = product.number;
  dialog.querySelector(".dialog-type").textContent = product.type;
  dialog.querySelector("h2").textContent = product.name;
  dialog.querySelector(".dialog-description").textContent = product.description;
  dialog.querySelector(".dialog-buy strong").textContent = product.price;
  const image = dialog.querySelector(".dialog-visual img");
  image.src = product.image;
  image.alt = product.name;
  dialog.querySelector(".specs").innerHTML = product.specs.map(([label, value]) => `<div class="spec"><span>${label}</span><strong>${value}</strong></div>`).join("");
  dialog.showModal();
}

document.querySelectorAll("[data-product]").forEach((element) => {
  element.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    openProduct(element.dataset.product);
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openProduct(element.dataset.product);
  });
});

dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.querySelector(".dialog-buy button").addEventListener("click", () => {
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
});

function applySearch(query) {
  const needle = query.trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const match = !needle || card.dataset.search.includes(needle);
    card.classList.toggle("is-hidden", !match);
    if (match) visible += 1;
  });
  emptyState.hidden = visible !== 0;
  if (needle) document.querySelector("#gear").scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateQuickResults(query) {
  const needle = query.trim().toLowerCase();
  const matches = Object.entries(products).filter(([, product]) => !needle || `${product.name} ${product.type}`.toLowerCase().includes(needle));
  resultList.innerHTML = matches.map(([id, product]) => `<button class="result-item" data-result="${id}"><img src="${product.image}" alt=""><span><strong>${product.name}</strong><small>${product.type}</small></span><b>${product.price}</b></button>`).join("");
  results.hidden = !needle;
  document.querySelectorAll("[data-result]").forEach((button) => button.addEventListener("click", () => {
    results.hidden = true;
    openProduct(button.dataset.result);
  }));
}

searchInput.addEventListener("input", (event) => updateQuickResults(event.target.value));
searchInput.addEventListener("focus", () => updateQuickResults(searchInput.value));
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  results.hidden = true;
  applySearch(searchInput.value);
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && !dialog.open) results.hidden = true;
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-dock")) results.hidden = true;
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    const filter = button.dataset.filter;
    let visible = 0;
    cards.forEach((card) => {
      const match = filter === "all" || card.dataset.category === filter;
      card.classList.toggle("is-hidden", !match);
      if (match) visible += 1;
    });
    emptyState.hidden = visible !== 0;
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

window.addEventListener("scroll", () => {
  document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 30);
}, { passive: true });
