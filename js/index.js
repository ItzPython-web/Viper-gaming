javascript
const VIPER = (() => {

  const BASE = window.VIPER_BASE || "";

  let products = [];

  function asset(path) {
    if (!path) return "";

    return BASE + String(path).replace(/^\/+/, "");
  }

  async function loadProducts() {
    if (products.length) {
      return products;
    }

    const response = await fetch(
      asset("json/products.json"),
      {
        cache: "no-cache"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Could not load json/products.json (${response.status})`
      );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.products)) {
      throw new Error(
        "json/products.json must contain a products array."
      );
    }

    products = data.products;

    return products;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function lockIcon() {
    return `
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <rect
          x="5"
          y="11"
          width="14"
          height="9"
          rx="1.5"
        ></rect>

        <path
          d="M8 11V7a4 4 0 0 1 8 0v4"
        ></path>
      </svg>
    `;
  }

  function productCard(product) {
    const id = encodeURIComponent(product.id);

    return `
      <a
        class="card"
        href="${asset(`products/index.html?id=${id}`)}"
      >
        <div class="card__media">
          <img
            src="${asset(product.thumbnail)}"
            alt="${escapeHtml(product.name)}"
            loading="lazy"
          >
        </div>

        <div class="card__body">
          <p class="card__name">
            ${escapeHtml(product.name)}
          </p>

          <p class="card__price">
            $${Number(product.price).toFixed(2)}
          </p>
        </div>
      </a>
    `;
  }

  function lockedCard(label) {
    return `
      <div class="card card--locked">

        <div class="card__media">
          ${lockIcon()}
        </div>

        <div class="card__body">
          <p class="card__name">
            ${escapeHtml(label)}
          </p>

          <p class="card__price">
            Coming Soon
          </p>
        </div>

      </div>
    `;
  }

  async function renderHome() {
    const catalog = document.getElementById("catalog");

    if (!catalog) {
      return;
    }

    let allProducts;

    try {
      allProducts = await loadProducts();
    } catch (error) {
      console.error(error);

      catalog.innerHTML = `
        <p class="search__empty">
          Could not load products.
        </p>
      `;

      return;
    }

    const grids = {
      mousepads:
        document.querySelector('[data-grid="mousepads"]'),

      keyboards:
        document.querySelector('[data-grid="keyboards"]'),

      mice:
        document.querySelector('[data-grid="mice"]'),

      "coming-soon":
        document.querySelector('[data-grid="coming-soon"]')
    };

    [
      "mousepads",
      "keyboards",
      "mice"
    ].forEach(category => {

      const grid = grids[category];

      if (!grid) {
        return;
      }

      const categoryProducts =
        allProducts.filter(
          product =>
            String(product.category).toLowerCase() ===
            category.toLowerCase()
        );

      grid.innerHTML = categoryProducts.length
        ? categoryProducts.map(productCard).join("")
        : `
          <p class="search__empty">
            No products yet.
          </p>
        `;
    });

    if (grids["coming-soon"]) {

      const comingSoonLabels = [
        "Wireless Headset",
        "Controller",
        "Streaming Deck"
      ];

      grids["coming-soon"].innerHTML =
        comingSoonLabels
          .map(lockedCard)
          .join("");
    }
  }

  function getSearchText(product) {

    const values = [
      product.name,
      product.category,
      product.type,
      product.theme,
      product.maker,
      product.origin,
      product.material,
      product.description
    ];

    if (Array.isArray(product.colors)) {
      values.push(...product.colors);
    }

    return values
      .filter(value => value !== undefined && value !== null)
      .join(" ")
      .toLowerCase();
  }

  function searchProducts(query) {

    const keywords = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!keywords.length) {
      return [];
    }

    return products.filter(product => {

      const searchableText =
        getSearchText(product);

      return keywords.every(keyword =>
        searchableText.includes(keyword)
      );
    });
  }

  function renderSearchResults(matches, query) {

    const results =
      document.getElementById("searchResults");

    const status =
      document.getElementById("searchStatus");

    if (!results) {
      return;
    }

    if (!query.trim()) {

      results.innerHTML = "";

      if (status) {
        status.textContent = "";
      }

      return;
    }

    if (status) {
      status.textContent =
        `${matches.length} result${
          matches.length === 1 ? "" : "s"
        }`;
    }

    results.innerHTML = matches.length
      ? matches.map(productCard).join("")
      : `
        <p class="search__empty">
          No products found.
        </p>
      `;
  }

  async function setupSearch() {

    const form =
      document.getElementById("searchForm");

    const input =
      document.getElementById("searchInput");

    if (!form || !input) {
      return;
    }

    try {
      await loadProducts();
    } catch (error) {

      console.error(error);

      return;
    }

    form.addEventListener("submit", event => {

      event.preventDefault();

      const query = input.value;

      const matches =
        searchProducts(query);

      renderSearchResults(
        matches,
        query
      );
    });

    input.addEventListener("input", () => {

      if (!input.value.trim()) {

        renderSearchResults([], "");

        return;
      }

      const matches =
        searchProducts(input.value);

      renderSearchResults(
        matches,
        input.value
      );
    });
  }

  function swatchesHtml(colors) {

    if (!Array.isArray(colors)) {
      return "";
    }

    return colors
      .map(color => `
        <span class="swatch">
          ${escapeHtml(String(color).trim())}
        </span>
      `)
      .join("");
  }

  function detailRow(label, value) {

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      return "";
    }

    return `
      <div class="detail__row">

        <p class="detail__row-label">
          ${escapeHtml(label)}
        </p>

        <p class="detail__row-value">
          ${escapeHtml(value)}
        </p>

      </div>
    `;
  }

  async function renderProductDetail() {

    const mount =
      document.getElementById("productDetail");

    if (!mount) {
      return;
    }

    const params =
      new URLSearchParams(window.location.search);

    const id =
      Number(params.get("id"));

    let allProducts;

    try {
      allProducts =
        await loadProducts();
    } catch (error) {

      console.error(error);

      mount.innerHTML = `
        <p class="product-page__missing">
          Could not load product data.
        </p>
      `;

      return;
    }

    const product =
      allProducts.find(
        item => Number(item.id) === id
      );

    if (!product) {

      mount.innerHTML = `
        <p class="product-page__missing">
          Product not found.
        </p>
      `;

      return;
    }

    const images =
      Array.isArray(product.images) &&
      product.images.length
        ? product.images
        : [product.thumbnail];

    mount.innerHTML = `

      <div class="product-detail">

        <div class="gallery">

          <div
            class="gallery__main"
            id="galleryMainWrap"
          >
            <img
              id="galleryMain"
              src="${asset(images[0])}"
              alt="${escapeHtml(product.name)}"
            >

            <div class="gallery__zoom-hint">

              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle
                  cx="11"
                  cy="11"
                  r="7"
                ></circle>

                <line
                  x1="21"
                  y1="21"
                  x2="16.65"
                  y2="16.65"
                ></line>

                <line
                  x1="11"
                  y1="8"
                  x2="11"
                  y2="14"
                ></line>

                <line
                  x1="8"
                  y1="11"
                  x2="14"
                  y2="11"
                ></line>
              </svg>

              Zoom

            </div>
          </div>

          <div class="gallery__thumbs">

            ${images.map((image, index) => `
              <button
                class="gallery__thumb${
                  index === 0
                    ? " is-active"
                    : ""
                }"
                data-src="${asset(image)}"
                type="button"
                aria-label="View image ${index + 1}"
              >
                <img
                  src="${asset(image)}"
                  alt="${escapeHtml(product.name)} view ${index + 1}"
                  loading="lazy"
                >
              </button>
            `).join("")}

          </div>

        </div>

        <div class="detail">

          <p class="detail__type">
            ${escapeHtml(product.type || "")}
          </p>

          <h1 class="detail__name">
            ${escapeHtml(product.name)}
          </h1>

          <p class="detail__desc">
            ${escapeHtml(product.description || "")}
          </p>

          <div class="detail__theme">

            <p class="detail__label">
              Theme
            </p>

            <div class="detail__swatches">
              ${swatchesHtml(product.colors)}
            </div>

            <p class="detail__theme-name">
              ${escapeHtml(product.theme || "")}
            </p>

          </div>

          <div class="detail__specs">

            ${detailRow(
              "Maker",
              product.maker
            )}

            ${detailRow(
              "Origin",
              product.origin
            )}

            ${detailRow(
              "Material",
              product.material
            )}

          </div>

          <div class="detail__buy">

            <span class="detail__price">
              $${Number(product.price).toFixed(2)}
            </span>

            <button
              class="btn-buy"
              type="button"
              id="buyNowBtn"
            >
              Buy Now
            </button>

          </div>

        </div>

      </div>

      <div
        class="lightbox"
        id="lightbox"
        aria-hidden="true"
      >

        <button
          class="lightbox__close"
          id="lightboxClose"
          type="button"
          aria-label="Close"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
            ></line>

            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
            ></line>
          </svg>
        </button>

        <img
          id="lightboxImg"
          src=""
          alt="${escapeHtml(product.name)}"
        >

      </div>
    `;

    const mainImg =
      document.getElementById("galleryMain");

    const mainWrap =
      document.getElementById("galleryMainWrap");

    const lightbox =
      document.getElementById("lightbox");

    const lightboxImg =
      document.getElementById("lightboxImg");

    const lightboxClose =
      document.getElementById("lightboxClose");

    function openLightbox() {

      if (!lightbox || !lightboxImg || !mainImg) {
        return;
      }

      lightboxImg.src =
        mainImg.src;

      lightbox.classList.add("is-open");
      lightbox.setAttribute(
        "aria-hidden",
        "false"
      );
    }

    function closeLightbox() {

      if (!lightbox) {
        return;
      }

      lightbox.classList.remove("is-open");
      lightbox.setAttribute(
        "aria-hidden",
        "true"
      );
    }

    if (mainWrap) {
      mainWrap.addEventListener(
        "click",
        openLightbox
      );
    }

    if (lightboxClose) {
      lightboxClose.addEventListener(
        "click",
        event => {
          event.stopPropagation();
          closeLightbox();
        }
      );
    }

    if (lightbox) {
      lightbox.addEventListener(
        "click",
        event => {

          if (event.target === lightbox) {
            closeLightbox();
          }

        }
      );
    }

    document.addEventListener(
      "keydown",
      event => {

        if (event.key === "Escape") {
          closeLightbox();
        }

      }
    );

    mount
      .querySelectorAll(".gallery__thumb")
      .forEach(thumb => {

        thumb.addEventListener(
          "click",
          () => {

            mount
              .querySelectorAll(".gallery__thumb")
              .forEach(item =>
                item.classList.remove(
                  "is-active"
                )
              );

            thumb.classList.add(
              "is-active"
            );

            if (mainImg) {
              mainImg.src =
                thumb.dataset.src;
            }

          }
        );

      });

    const buyBtn =
      document.getElementById("buyNowBtn");

    if (buyBtn) {

      buyBtn.addEventListener(
        "click",
        () => {
          // Add your checkout/payment logic here.
        }
      );

    }
  }

  return {
    loadProducts,
    asset,
    searchProducts,
    renderHome,
    renderProductDetail,
    setupSearch
  };

})();


document.addEventListener(
  "DOMContentLoaded",
  async () => {

    await VIPER.renderHome();

    await VIPER.setupSearch();

    await VIPER.renderProductDetail();

  }
);

