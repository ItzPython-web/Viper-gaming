const VIPER = (() => {
  const BASE = window.VIPER_BASE || "";

  function asset(path) {
    if (!path) return "";
    return BASE + path.replace(/^\/+/, "");
  }

  async function loadProducts() {
    const data = window.VIPER_PRODUCTS;
    if (!data) throw new Error("Could not load product data.");
    return data.products || [];
  }

  function lockIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="5" y="11" width="14" height="9" rx="1.5"></rect>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
    </svg>`;
  }

  function productCard(product) {
    return `
      <a class="card" href="${asset("products/index.html?id=" + product.id)}">
        <div class="card__media">
          <img src="${asset(product.thumbnail)}" alt="${product.name}" loading="lazy">
        </div>
        <div class="card__body">
          <p class="card__name">${product.name}</p>
          <p class="card__price">$${Number(product.price).toFixed(2)}</p>
        </div>
      </a>
    `;
  }

  function lockedCard(label) {
    return `
      <div class="card card--locked">
        <div class="card__media">${lockIcon()}</div>
        <div class="card__body">
          <p class="card__name">${label}</p>
          <p class="card__price">Coming Soon</p>
        </div>
      </div>
    `;
  }

  async function renderHome() {
    const catalog = document.getElementById("catalog");
    if (!catalog) return;

    let products = [];
    try {
      products = await loadProducts();
    } catch (e) {
      return;
    }

    const grids = {
      mousepads: document.querySelector('[data-grid="mousepads"]'),
      keyboards: document.querySelector('[data-grid="keyboards"]'),
      mice: document.querySelector('[data-grid="mice"]'),
      "coming-soon": document.querySelector('[data-grid="coming-soon"]')
    };

    ["mousepads", "keyboards", "mice"].forEach((category) => {
      const grid = grids[category];
      if (!grid) return;
      const items = products.filter((p) => p.category === category);
      grid.innerHTML = items.length
        ? items.map(productCard).join("")
        : `<p class="search__empty">No products yet.</p>`;
    });

    if (grids["coming-soon"]) {
      const comingSoonLabels = ["Wireless Headset", "Controller", "Streaming Deck"];
      grids["coming-soon"].innerHTML = comingSoonLabels.map(lockedCard).join("");
    }
  }

  function swatchesHtml(colors) {
    return (colors || [])
      .map((c) => `<span class="swatch">${c}</span>`)
      .join("");
  }

  function detailRow(label, value) {
    if (!value) return "";
    return `
      <div class="detail__row">
        <p class="detail__row-label">${label}</p>
        <p class="detail__row-value">${value}</p>
      </div>
    `;
  }

  async function renderProductDetail() {
    const mount = document.getElementById("productDetail");
    if (!mount) return;

    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("id"));

    let products = [];
    try {
      products = await loadProducts();
    } catch (e) {
      mount.innerHTML = `<p class="product-page__missing">Could not load product data.</p>`;
      return;
    }

    const product = products.find((p) => p.id === id);
    if (!product) {
      mount.innerHTML = `<p class="product-page__missing">Product not found.</p>`;
      return;
    }

    const images = product.images && product.images.length ? product.images : [product.thumbnail];

    mount.innerHTML = `
      <div class="product-detail">
        <div class="gallery">
          <div class="gallery__main" id="galleryMainWrap">
            <img id="galleryMain" src="${asset(images[0])}" alt="${product.name}">
            <div class="gallery__zoom-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              Zoom
            </div>
          </div>
          <div class="gallery__thumbs">
            ${images
              .map(
                (img, i) => `
              <button class="gallery__thumb${i === 0 ? " is-active" : ""}" data-src="${asset(img)}" type="button">
                <img src="${asset(img)}" alt="${product.name} view ${i + 1}">
              </button>
            `
              )
              .join("")}
          </div>
        </div>
        <div class="detail">
          <p class="detail__type">${product.type || ""}</p>
          <h1 class="detail__name">${product.name}</h1>
          <p class="detail__desc">${product.description || ""}</p>
          <div class="detail__theme">
            <p class="detail__label">Theme</p>
            <div class="detail__swatches">
              ${swatchesHtml(product.colors)}
            </div>
            <p class="detail__theme-name">${product.theme || ""}</p>
          </div>
          <div class="detail__specs">
            ${detailRow("Maker", product.maker)}
            ${detailRow("Origin", product.origin)}
            ${detailRow("Material", product.material)}
          </div>
          <div class="detail__buy">
            <span class="detail__price">$${Number(product.price).toFixed(2)}</span>
            <button class="btn-buy" type="button" id="buyNowBtn">Buy Now</button>
          </div>
        </div>
      </div>
      <div class="lightbox" id="lightbox">
        <button class="lightbox__close" id="lightboxClose" type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <img id="lightboxImg" src="" alt="${product.name}">
      </div>
    `;

    const mainImg = document.getElementById("galleryMain");
    const mainWrap = document.getElementById("galleryMainWrap");
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightboxImg");
    const lightboxClose = document.getElementById("lightboxClose");

    function openLightbox() {
      lightboxImg.src = mainImg.src;
      lightbox.classList.add("is-open");
    }

    function closeLightbox() {
      lightbox.classList.remove("is-open");
    }

    if (mainWrap) mainWrap.addEventListener("click", openLightbox);
    if (lightboxClose) lightboxClose.addEventListener("click", (e) => { e.stopPropagation(); closeLightbox(); });
    if (lightbox) {
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
      });
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLightbox();
    });

    mount.querySelectorAll(".gallery__thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        mount.querySelectorAll(".gallery__thumb").forEach((t) => t.classList.remove("is-active"));
        thumb.classList.add("is-active");
        mainImg.src = thumb.dataset.src;
      });
    });

    const buyBtn = document.getElementById("buyNowBtn");
    if (buyBtn) buyBtn.addEventListener("click", () => {});
  }

  return { loadProducts, asset, renderHome, renderProductDetail };
})();

document.addEventListener("DOMContentLoaded", () => {
  VIPER.renderHome();
  VIPER.renderProductDetail();
});