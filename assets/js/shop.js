(function () {
  var CART_KEY = "smirglpapir_cart";
  var ORDER_KEY = "smirglpapir_last_order";
  var INVENTORY_OVERRIDES_KEY = "smirglpapir_inventory_overrides";
  var IMAGE_ASSET_VERSION = "20260714b";
  var SHIPPING_PRICE = 89;
  var FREE_SHIPPING_THRESHOLD = 1000;
  var SOLD_OUT_PREVIEW_SKUS = Array.isArray(window.SHOP_CONFIG && window.SHOP_CONFIG.soldOutPreviewSkus)
    ? window.SHOP_CONFIG.soldOutPreviewSkus
        .map(function (sku) {
          return String(sku || "").trim();
        })
        .filter(Boolean)
    : [];

  function formatPrice(value) {
    return Number(value).toLocaleString("cs-CZ") + " CZK";
  }

  function getCart() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function cartQuantity(cart) {
    return cart.reduce(function (sum, line) {
      return sum + (Number(line.qty) || 0);
    }, 0);
  }

  function getLineQty(sku, variant) {
    var match = getCart().find(function (line) {
      return line.sku === sku && (line.variant || "") === (variant || "");
    });
    return match ? Number(match.qty) || 0 : 0;
  }

  function getSkuQty(sku) {
    return getCart().reduce(function (sum, line) {
      return line.sku === sku ? sum + (Number(line.qty) || 0) : sum;
    }, 0);
  }

  function getVariantQty(sku, variant) {
    return getCart().reduce(function (sum, line) {
      return line.sku === sku && (line.variant || "") === (variant || "") ? sum + (Number(line.qty) || 0) : sum;
    }, 0);
  }

  function getProductStock(product) {
    var parsed = Number(product && product.stock);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(0, Math.floor(parsed));
  }

  function getVariantStock(product, variantId) {
    if (!product || !Array.isArray(product.variants) || !variantId) {
      return null;
    }

    var variant = product.variants.find(function (item) {
      return item.id === variantId;
    });

    var parsed = Number(variant && variant.stock);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.max(0, Math.floor(parsed));
  }

  function hasOnlySoldOutVariants(product) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) {
      return false;
    }

    var allVariantsHaveStock = product.variants.every(function (variant) {
      return Number.isFinite(Number(variant && variant.stock));
    });

    if (!allVariantsHaveStock) {
      return false;
    }

    return product.variants.every(function (variant) {
      return Number(variant.stock) <= 0;
    });
  }

  function isProductSoldOut(product) {
    var stock = getProductStock(product);
    if (stock !== null) {
      return stock <= 0;
    }
    return hasOnlySoldOutVariants(product);
  }

  function getFirstAvailableVariantId(product) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) {
      return "";
    }

    var found = product.variants.find(function (variant) {
      var stock = getVariantStock(product, variant.id);
      return stock === null || stock > 0;
    });

    return found ? found.id : product.variants[0].id;
  }

  function getVariantMaxQty(product, variant) {
    var stock = getProductStock(product);
    var totalForSku = getSkuQty(product.sku);
    var currentLineQty = getLineQty(product.sku, variant);
    var variantStock = getVariantStock(product, variant);
    var totalForVariant = getVariantQty(product.sku, variant);

    var overallLimit = stock === null ? Number.POSITIVE_INFINITY : stock - (totalForSku - currentLineQty);
    var variantLimit = variantStock === null ? Number.POSITIVE_INFINITY : variantStock - (totalForVariant - currentLineQty);
    var limit = Math.min(overallLimit, variantLimit);

    if (!Number.isFinite(limit)) {
      return null;
    }

    return Math.max(0, Math.floor(limit));
  }

  function getInventoryOverrides() {
    try {
      var parsed = JSON.parse(localStorage.getItem(INVENTORY_OVERRIDES_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveInventoryOverrides(overrides) {
    localStorage.setItem(INVENTORY_OVERRIDES_KEY, JSON.stringify(overrides));
  }

  function applyPurchaseToLocalStock(items, productsBySku) {
    if (!Array.isArray(items) || !productsBySku) {
      return;
    }

    var overrides = getInventoryOverrides();
    var nextStateBySku = {};

    items.forEach(function (item) {
      var sku = item && item.sku;
      if (!sku || !productsBySku[sku]) {
        return;
      }

      if (!nextStateBySku[sku]) {
        var product = productsBySku[sku];
        var baseState = {
          stock: getProductStock(product),
          variants: {}
        };

        if (Array.isArray(product.variants)) {
          product.variants.forEach(function (variant) {
            baseState.variants[variant.id] = getVariantStock(product, variant.id);
          });
        }

        nextStateBySku[sku] = baseState;
      }

      var qty = Math.max(0, Math.floor(Number(item.qty) || 0));
      var variantId = item.variantId || item.variant || "";
      var state = nextStateBySku[sku];

      if (Number.isFinite(state.stock)) {
        state.stock = Math.max(0, state.stock - qty);
      }

      if (variantId && Number.isFinite(state.variants[variantId])) {
        state.variants[variantId] = Math.max(0, state.variants[variantId] - qty);
      }
    });

    Object.keys(nextStateBySku).forEach(function (sku) {
      var state = nextStateBySku[sku];
      if (!overrides[sku] || typeof overrides[sku] !== "object") {
        overrides[sku] = {};
      }

      if (Number.isFinite(state.stock)) {
        overrides[sku].stock = state.stock;
      }

      if (!overrides[sku].variants || typeof overrides[sku].variants !== "object") {
        overrides[sku].variants = {};
      }

      Object.keys(state.variants).forEach(function (variantId) {
        if (Number.isFinite(state.variants[variantId])) {
          overrides[sku].variants[variantId] = state.variants[variantId];
        }
      });
    });

    saveInventoryOverrides(overrides);
  }

  function normalizeCart(productsBySku) {
    var cart = getCart();
    var nextCart = [];
    var remainingBySku = {};
    var remainingByVariant = {};
    var changed = false;

    cart.forEach(function (line) {
      var product = productsBySku[line.sku];
      var qty = Math.floor(Number(line.qty) || 0);

      if (!product || qty <= 0) {
        changed = true;
        return;
      }

      var stock = getProductStock(product);
      if (stock === null) {
        nextCart.push({ sku: line.sku, variant: line.variant || "", qty: qty });
        return;
      }

      if (typeof remainingBySku[line.sku] === "undefined") {
        remainingBySku[line.sku] = stock;
      }

      var variantKey = line.sku + "::" + (line.variant || "");
      var variantStock = getVariantStock(product, line.variant || "");
      if (typeof remainingByVariant[variantKey] === "undefined") {
        remainingByVariant[variantKey] = variantStock;
      }

      var allowedQty = qty;
      if (remainingBySku[line.sku] !== null) {
        allowedQty = Math.min(allowedQty, remainingBySku[line.sku]);
      }
      if (remainingByVariant[variantKey] !== null) {
        allowedQty = Math.min(allowedQty, remainingByVariant[variantKey]);
      }
      if (allowedQty <= 0) {
        changed = true;
        return;
      }

      if (allowedQty !== qty) {
        changed = true;
      }

      nextCart.push({ sku: line.sku, variant: line.variant || "", qty: allowedQty });
      if (remainingBySku[line.sku] !== null) {
        remainingBySku[line.sku] -= allowedQty;
      }
      if (remainingByVariant[variantKey] !== null) {
        remainingByVariant[variantKey] -= allowedQty;
      }
    });

    if (changed || nextCart.length !== cart.length) {
      saveCart(nextCart);
    }
  }

  function findVariantLabel(product, variantId) {
    if (!variantId || !Array.isArray(product.variants)) {
      return "";
    }
    var found = product.variants.find(function (variant) {
      return variant.id === variantId;
    });
    return found ? found.label : "";
  }

  function calculateTotals(items) {
    var subtotal = items.reduce(function (sum, item) {
      return sum + item.lineTotal;
    }, 0);
    var shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_PRICE;
    return {
      subtotal: subtotal,
      shipping: shipping,
      total: subtotal + shipping
    };
  }

  function createOrderFallback(orderPayload) {
    var now = new Date();
    var year = now.getFullYear();
    var suffix = String(now.getTime()).slice(-4);
    return {
      orderNumber: "SP-" + year + "-" + suffix,
      variableSymbol: String(year) + suffix,
      bankAccount: "2301234567/2010",
      total: orderPayload.total
    };
  }

  function normalizeQrImageSrc(value) {
    if (!value) {
      return "";
    }

    var trimmed = String(value).trim();
    if (!trimmed) {
      return "";
    }

    if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed) || trimmed.charAt(0) === "/") {
      return trimmed;
    }

    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
      return "data:image/png;base64," + trimmed.replace(/\s+/g, "");
    }

    return trimmed;
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () {
        resolve(reader.result || "");
      };
      reader.onerror = function () {
        reject(new Error("Could not read webhook image response."));
      };
      reader.readAsDataURL(blob);
    });
  }

  async function loadProducts() {
    var response = await fetch("assets/data/products.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load products.json");
    }

    var rawProducts = await response.json();
    if (!Array.isArray(rawProducts)) {
      throw new Error("products.json must contain an array");
    }

    function toImagePath(path, base) {
      if (!path) {
        return "";
      }

      if (/^(https?:)?\//.test(path)) {
        return path;
      }

      if (!base) {
        return path;
      }

      return base.replace(/\/?$/, "/") + path.replace(/^\//, "");
    }

    function withImageAssetVersion(path) {
      if (!path || /^data:/i.test(path)) {
        return path;
      }

      if (/[?&]v=/.test(path)) {
        return path;
      }

      return path + (path.indexOf("?") === -1 ? "?v=" : "&v=") + IMAGE_ASSET_VERSION;
    }

    var products = rawProducts.map(function (raw) {
      var base = typeof raw.galleryPath === "string" ? raw.galleryPath : "";
      var rawImages = Array.isArray(raw.images) ? raw.images : [];
      var normalizedImages = rawImages
        .map(function (img) {
          return withImageAssetVersion(toImagePath(img, base));
        })
        .filter(Boolean);

      var primaryImage = withImageAssetVersion(toImagePath(raw.image || normalizedImages[0] || "", base));
      if (normalizedImages.length === 0 && primaryImage) {
        normalizedImages = [primaryImage];
      }

      var normalizedVariants = Array.isArray(raw.variants)
        ? raw.variants.map(function (variant) {
            var variantStock = Number(variant && variant.stock);
            variantStock = Number.isFinite(variantStock) ? Math.max(0, Math.floor(variantStock)) : null;
            return {
              id: variant.id,
              label: variant.label,
              stock: variantStock
            };
          })
        : [];

      var allVariantStocksKnown = normalizedVariants.length > 0 && normalizedVariants.every(function (variant) {
        return Number.isFinite(variant.stock);
      });

      var normalizedStock = Number(raw.stock);
      normalizedStock = Number.isFinite(normalizedStock) ? Math.max(0, Math.floor(normalizedStock)) : null;
      if (allVariantStocksKnown) {
        normalizedStock = normalizedVariants.reduce(function (sum, variant) {
          return sum + variant.stock;
        }, 0);
      }

      var overrides = getInventoryOverrides();
      var productOverride = overrides[raw.sku] || {};

      if (Array.isArray(normalizedVariants) && normalizedVariants.length > 0 && productOverride.variants && typeof productOverride.variants === "object") {
        normalizedVariants = normalizedVariants.map(function (variant) {
          var overrideStock = Number(productOverride.variants[variant.id]);
          if (Number.isFinite(overrideStock)) {
            return {
              id: variant.id,
              label: variant.label,
              stock: Math.max(0, Math.floor(overrideStock))
            };
          }
          return variant;
        });
      }

      if (Number.isFinite(Number(productOverride.stock))) {
        normalizedStock = Math.max(0, Math.floor(Number(productOverride.stock)));
      }

      allVariantStocksKnown = normalizedVariants.length > 0 && normalizedVariants.every(function (variant) {
        return Number.isFinite(variant.stock);
      });
      if (allVariantStocksKnown) {
        normalizedStock = normalizedVariants.reduce(function (sum, variant) {
          return sum + variant.stock;
        }, 0);
      }

      if (SOLD_OUT_PREVIEW_SKUS.indexOf(raw.sku) !== -1) {
        normalizedStock = 0;
        if (normalizedVariants.length > 0) {
          normalizedVariants = normalizedVariants.map(function (variant) {
            return {
              id: variant.id,
              label: variant.label,
              stock: 0
            };
          });
        }
      }

      return {
        sku: raw.sku,
        name: raw.name,
        description: raw.description || "",
        price: Number(raw.price) || 0,
        variants: normalizedVariants,
        stock: normalizedStock,
        image: primaryImage,
        images: normalizedImages
      };
    });

    var productsBySku = {};
    products.forEach(function (product) {
      productsBySku[product.sku] = product;
    });

    return {
      products: products,
      productsBySku: productsBySku
    };
  }

  function buildCartView(cart, productsBySku) {
    var itemList = [];

    cart.forEach(function (line) {
      var product = productsBySku[line.sku];
      if (!product) {
        return;
      }

      var qty = Number(line.qty) || 0;
      if (qty <= 0) {
        return;
      }

      var lineTotal = qty * Number(product.price);
      itemList.push({
        sku: line.sku,
        name: product.name,
        variantId: line.variant || "",
        variantLabel: findVariantLabel(product, line.variant || ""),
        qty: qty,
        unitPrice: Number(product.price),
        lineTotal: lineTotal
      });
    });

    return itemList;
  }

  function updateCartLine(sku, variant, action, qtyValue, productsBySku) {
    var cart = getCart();
    var index = cart.findIndex(function (line) {
      return line.sku === sku && (line.variant || "") === (variant || "");
    });

    if (index === -1) {
      return;
    }

    var product = productsBySku ? productsBySku[sku] : null;
    var maxQty = product ? getVariantMaxQty(product, variant) : null;

    if (action === "remove") {
      cart.splice(index, 1);
    } else if (action === "increase") {
      if (maxQty === null || cart[index].qty < maxQty) {
        cart[index].qty += 1;
      }
    } else if (action === "decrease") {
      cart[index].qty -= 1;
      if (cart[index].qty <= 0) {
        cart.splice(index, 1);
      }
    } else if (action === "set") {
      var parsedQty = Number(qtyValue);
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        cart.splice(index, 1);
      } else {
        var desiredQty = Math.floor(parsedQty);
        cart[index].qty = maxQty === null ? desiredQty : Math.min(desiredQty, maxQty);
      }
    }

    saveCart(cart);
  }

  function addToCart(sku, variant, productsBySku) {
    var cart = getCart();
    var product = productsBySku ? productsBySku[sku] : null;
    var maxQty = product ? getVariantMaxQty(product, variant) : null;
    var match = cart.find(function (line) {
      return line.sku === sku && (line.variant || "") === (variant || "");
    });

    if (match) {
      if (maxQty !== null && match.qty >= maxQty) {
        return false;
      }
      match.qty += 1;
    } else {
      if (maxQty !== null && maxQty <= 0) {
        return false;
      }
      cart.push({ sku: sku, variant: variant || "", qty: 1 });
    }

    saveCart(cart);
    return true;
  }

  function renderSummary(totals) {
    var subtotalEl = document.getElementById("summary-subtotal");
    var shippingEl = document.getElementById("summary-shipping");
    var totalEl = document.getElementById("summary-total");

    if (!subtotalEl || !shippingEl || !totalEl) {
      return;
    }

    subtotalEl.textContent = formatPrice(totals.subtotal);
    shippingEl.textContent = totals.shipping === 0 ? "Free" : formatPrice(totals.shipping);
    totalEl.textContent = formatPrice(totals.total);
  }

  function renderCartRows(containerId, cartItems, editable, productsBySku) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    if (cartItems.length === 0) {
      container.innerHTML = '<p class="shop-empty">Your cart is currently empty.</p>';
      return;
    }

    container.innerHTML = cartItems
      .map(function (item) {
        var product = productsBySku[item.sku];
        var variant = item.variantLabel ? "<small>Variant: " + item.variantLabel + "</small>" : "";

        if (!editable) {
          return (
            '<div class="shop-cart-item shop-cart-item-readonly">' +
            '<div class="shop-cart-main"><strong>' +
            item.name +
            "</strong>" +
            variant +
            "</div>" +
            '<div class="shop-cart-meta-row">' +
            '<span class="shop-cart-qty">Qty: ' +
            item.qty +
            "</span>" +
            '<div class="shop-cart-price">' +
            formatPrice(item.lineTotal) +
            "</div>" +
            "</div>" +
            "</div>"
          );
        }

        var stock = getProductStock(product);
        var maxQty = getVariantMaxQty(product, item.variantId);
        var maxAttr = stock === null ? "" : ' max="' + maxQty + '"';
        var disableIncrease = stock !== null && item.qty >= maxQty ? " disabled" : "";

        return (
          '<div class="shop-cart-item" data-sku="' +
          item.sku +
          '" data-variant="' +
          item.variantId +
          '">' +
          '<div class="shop-cart-main"><strong>' +
          item.name +
          "</strong>" +
          variant +
          "</div>" +
          '<div class="shop-cart-controls">' +
          '<div class="shop-qty-group">' +
          '<button type="button" class="shop-qty-btn" data-action="decrease" aria-label="Decrease quantity">-</button>' +
          '<input class="shop-qty-input" type="number" min="1" value="' +
          item.qty +
          '" aria-label="Quantity"' +
          maxAttr +
          ' />' +
          '<button type="button" class="shop-qty-btn" data-action="increase" aria-label="Increase quantity"' +
          disableIncrease +
          '>+</button>' +
          "</div>" +
          "</div>" +
          '<div class="shop-cart-price">' +
          formatPrice(item.lineTotal) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderProductCardControl(card, productsBySku) {
    var root = card.querySelector(".shop-card-cart-controls");
    if (!root) {
      return;
    }

    var sku = card.getAttribute("data-sku") || "";
    var product = productsBySku ? productsBySku[sku] : null;
    var select = card.querySelector(".shop-variant-select");
    var variant = select ? select.value : "";
    var qty = getLineQty(sku, variant);
    var stock = getProductStock(product);
    var productSoldOut = isProductSoldOut(product);
    var totalQty = product ? getSkuQty(sku) : 0;
    var maxQty = product ? getVariantMaxQty(product, variant) : null;
    var stockNote = "";

    if (select && product && Array.isArray(product.variants) && product.variants.length > 0) {
      var selectedVariantStock = getVariantStock(product, variant);
      if (selectedVariantStock === 0) {
        var firstAvailableVariant = getFirstAvailableVariantId(product);
        if (firstAvailableVariant) {
          select.value = firstAvailableVariant;
          variant = firstAvailableVariant;
          qty = getLineQty(sku, variant);
          maxQty = getVariantMaxQty(product, variant);
        }
      }
    }

    if (stock !== null) {
      stockNote =
        '<p class="shop-stock-note">Available: ' +
        stock +
        (totalQty >= stock ? ' <span class="is-muted">(max in cart)</span>' : "") +
        "</p>";
    }

    card.classList.toggle("is-sold-out", productSoldOut);

    var variantSoldOut = product ? getVariantStock(product, variant) === 0 : false;

    if (productSoldOut) {
      card.classList.remove("is-in-cart");
      root.innerHTML =
        '<div class="shop-card-control-stack">' +
        '<button type="button" class="button small fit shop-card-add" disabled>Sold Out</button>' +
        stockNote +
        "</div>";
      return;
    }

    if (qty > 0) {
      card.classList.add("is-in-cart");
      root.innerHTML =
        '<div class="shop-card-control-stack"><div class="shop-card-qty-controls">' +
        '<button type="button" class="shop-card-qty-btn" data-action="decrease" data-sku="' +
        sku +
        '" data-variant="' +
        variant +
        '">-</button>' +
        '<button type="button" class="shop-card-in-cart-btn" data-sku="' +
        sku +
        '" data-variant="' +
        variant +
        '">' +
        qty +
        (qty === 1 ? " loved piece in cart" : " loved pieces in cart") +
        "</button>" +
        '<button type="button" class="shop-card-qty-btn" data-action="increase" data-sku="' +
        sku +
        '" data-variant="' +
        variant +
        '"' +
        (maxQty !== null && qty >= maxQty ? " disabled" : "") +
        '>+</button>' +
        "</div>" +
        stockNote +
        "</div>";
    } else {
      card.classList.remove("is-in-cart");
      var disableAdd = variantSoldOut || (maxQty !== null && maxQty <= 0);
      root.innerHTML =
        '<div class="shop-card-control-stack"><button type="button" class="button primary small fit shop-card-add" data-sku="' +
        sku +
        '" data-variant="' +
        variant +
        '"' +
        (disableAdd ? " disabled" : "") +
        '>' +
        (disableAdd ? (variantSoldOut ? "Sold Out" : "Max Added") : "Add to Cart") +
        "</button>" +
        stockNote +
        "</div>";
    }
  }

  function updateProductCardStates(productsBySku) {
    document.querySelectorAll(".shop-product-card[data-sku]").forEach(function (card) {
      renderProductCardControl(card, productsBySku);
    });
  }

  function shiftProductCardImage(card, direction) {
    var raw = card.getAttribute("data-images") || "";
    var images = raw.split("||").filter(Boolean);
    if (images.length <= 1) {
      return;
    }

    var currentIndex = Number(card.getAttribute("data-image-index") || "0");
    var nextIndex = (currentIndex + direction + images.length) % images.length;
    card.setAttribute("data-image-index", String(nextIndex));

    var img = card.querySelector(".shop-product-image");
    if (img) {
      img.setAttribute("src", images[nextIndex]);
    }

    card.querySelectorAll(".shop-image-dot").forEach(function (dot, index) {
      dot.classList.toggle("is-active", index === nextIndex);
    });
  }

  function renderProducts(products) {
    var list = document.getElementById("products-list");
    if (!list) {
      return;
    }

    list.innerHTML = "";

    products.forEach(function (product) {
      var card = document.createElement("article");
      card.className = "shop-product-card";
      card.setAttribute("data-sku", product.sku);

      var images = Array.isArray(product.images) && product.images.length > 0 ? product.images : [product.image];
      card.setAttribute("data-images", images.join("||"));
      card.setAttribute("data-image-index", "0");

      var hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
      var variantSelect = "";

      if (hasVariants) {
        var defaultVariantId = getFirstAvailableVariantId(product);
        var options = product.variants
          .map(function (variant) {
            var variantStock = getVariantStock(product, variant.id);
            var soldOut = variantStock === 0;
            return (
              '<option value="' +
              variant.id +
              '"' +
              (variant.id === defaultVariantId ? " selected" : "") +
              (soldOut ? ' disabled class="is-sold-out"' : "") +
              '>' +
              variant.label +
              (soldOut ? " (Sold out)" : "") +
              "</option>"
            );
          })
          .join("");

        variantSelect =
          '<select id="variant-' +
          product.sku +
          '" class="shop-variant-select">' +
          options +
          "</select>";
      }

      var imageNav = "";
      var imageMarkup =
        '<img src="' +
        images[0] +
        '" alt="' +
        product.name +
        '" class="shop-product-image" />';

      if ((product.sku === "VASE-001" || product.sku === "GV-001") && images.length >= 2) {
        imageMarkup =
          '<div class="shop-product-image-split">' +
          '<div class="shop-product-image-tile">' +
          '<img src="' +
          images[0] +
          '" alt="' +
          product.name +
          '" class="shop-product-image" />' +
          '</div>' +
          '<div class="shop-product-image-tile">' +
          '<img src="' +
          images[1] +
          '" alt="' +
          product.name +
          '" class="shop-product-image" />' +
          '</div>' +
          "</div>";
      } else if (images.length > 1) {
        var dots = images
          .map(function (_, index) {
            return '<span class="shop-image-dot' + (index === 0 ? " is-active" : "") + '"></span>';
          })
          .join("");

        imageNav =
          '<button type="button" class="shop-image-nav is-prev" data-direction="prev" aria-label="Previous image">&#10094;</button>' +
          '<button type="button" class="shop-image-nav is-next" data-direction="next" aria-label="Next image">&#10095;</button>' +
          '<div class="shop-image-dots">' +
          dots +
          "</div>";
      }

      card.innerHTML =
        '<div class="shop-product-image-wrap">' +
        imageMarkup +
        imageNav +
        "</div>" +
        '<div class="shop-product-body">' +
        '<div class="shop-product-top">' +
        "<h3>" +
        product.name +
        "</h3>" +
        '<p class="shop-product-description">' +
        product.description +
        "</p>" +
        "</div>" +
        '<div class="shop-product-bottom">' +
        '<div class="shop-product-meta">' +
        '<div class="shop-variant-wrap">' +
        variantSelect +
        "</div>" +
        '<p class="shop-product-price">' +
        formatPrice(product.price) +
        "</p>" +
        "</div>" +
        '<div class="shop-card-cart-controls"></div>' +
        "</div>" +
        "</div>";

      list.appendChild(card);
    });
  }

  function validateCheckoutForm(form) {
    var email = form.email.value.trim();
    var phone = form.phone.value.trim();

    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var phoneRegex = /^(?:\+420\s?)?(?:\d\s?){9}$/;

    if (!emailRegex.test(email)) {
      return "Please enter a valid email address.";
    }

    if (!phoneRegex.test(phone)) {
      return "Please enter a valid Czech phone number.";
    }

    return "";
  }

  function updateCartCountDisplay() {
    var cartCountEls = document.querySelectorAll(".shop-cart-count");
    if (!cartCountEls.length) {
      return;
    }

    var count = cartQuantity(getCart());
    cartCountEls.forEach(function (node) {
      node.textContent = String(count);
      node.classList.toggle("is-visible", count > 0);
    });
  }

  function attachCartEditing(containerId, refreshFn, productsBySku) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.addEventListener("click", function (event) {
      var target = event.target;
      var row = target.closest(".shop-cart-item");
      if (!row) {
        return;
      }

      var sku = row.getAttribute("data-sku");
      var variant = row.getAttribute("data-variant") || "";

      if (target.matches(".shop-qty-btn")) {
        updateCartLine(sku, variant, target.getAttribute("data-action"), null, productsBySku);
        refreshFn();
        updateCartCountDisplay();
      }
    });

    container.addEventListener("change", function (event) {
      var target = event.target;
      if (!target.classList.contains("shop-qty-input")) {
        return;
      }

      var row = target.closest(".shop-cart-item");
      if (!row) {
        return;
      }

      updateCartLine(row.getAttribute("data-sku"), row.getAttribute("data-variant") || "", "set", target.value, productsBySku);
      refreshFn();
      updateCartCountDisplay();
    });
  }

  async function initProductsPage() {
    var productsList = document.getElementById("products-list");
    if (!productsList) {
      return;
    }

    try {
      var loaded = await loadProducts();
      normalizeCart(loaded.productsBySku);
      renderProducts(loaded.products);
      updateProductCardStates(loaded.productsBySku);

      productsList.addEventListener("click", function (event) {
        var target = event.target;

        if (target.classList.contains("shop-image-nav")) {
          var imageCard = target.closest(".shop-product-card");
          if (imageCard) {
            shiftProductCardImage(imageCard, target.getAttribute("data-direction") === "prev" ? -1 : 1);
          }
          return;
        }

        var isAdd = target.classList.contains("shop-card-add");
        var isQtyBtn = target.classList.contains("shop-card-qty-btn");
        if (!isAdd && !isQtyBtn) {
          return;
        }

        var sku = target.getAttribute("data-sku");
        var product = loaded.productsBySku[sku];
        if (!product) {
          return;
        }

        var variant = "";
        if (Array.isArray(product.variants) && product.variants.length > 0) {
          var select = document.getElementById("variant-" + sku);
          variant = select ? select.value : product.variants[0].id;
        }

        if (isAdd) {
          if (!addToCart(sku, variant, loaded.productsBySku)) {
            updateProductCardStates(loaded.productsBySku);
            return;
          }
        } else if (target.getAttribute("data-action") === "increase") {
          if (!addToCart(sku, variant, loaded.productsBySku)) {
            updateProductCardStates(loaded.productsBySku);
            return;
          }
        } else {
          updateCartLine(sku, variant, "decrease", null, loaded.productsBySku);
        }

        updateCartCountDisplay();
        updateProductCardStates(loaded.productsBySku);

        var card = target.closest(".shop-product-card");
        if (card && (isAdd || target.getAttribute("data-action") === "increase")) {
          card.classList.remove("just-added");
          void card.offsetWidth;
          card.classList.add("just-added");
          setTimeout(function () {
            card.classList.remove("just-added");
          }, 700);
        }
      });

      productsList.addEventListener("change", function (event) {
        var target = event.target;
        if (!target.classList.contains("shop-variant-select")) {
          return;
        }

        var card = target.closest(".shop-product-card");
        if (card) {
          renderProductCardControl(card, loaded.productsBySku);
        }
      });

      updateCartCountDisplay();
    } catch (error) {
      productsList.innerHTML = '<p class="shop-error">Products could not be loaded.</p>';
    }
  }

  async function initCartPage() {
    var cartContainer = document.getElementById("cart-items");
    if (!cartContainer) {
      return;
    }

    var proceedButton = document.getElementById("proceed-to-checkout");

    try {
      var loaded = await loadProducts();
      normalizeCart(loaded.productsBySku);

      function refreshCart() {
        var view = buildCartView(getCart(), loaded.productsBySku);
        var totals = calculateTotals(view);
        renderCartRows("cart-items", view, true, loaded.productsBySku);
        renderSummary(totals);
        if (proceedButton) {
          proceedButton.classList.toggle("disabled", view.length === 0);
          proceedButton.setAttribute("aria-disabled", view.length === 0 ? "true" : "false");
        }
      }

      attachCartEditing("cart-items", refreshCart, loaded.productsBySku);
      refreshCart();
      updateCartCountDisplay();
    } catch (error) {
      cartContainer.innerHTML = '<p class="shop-error">Cart could not be displayed.</p>';
    }
  }

  async function initCheckoutPage() {
    var checkoutForm = document.getElementById("checkout-form");
    if (!checkoutForm) {
      return;
    }

    var checkoutError = document.getElementById("checkout-error");

    try {
      var loaded = await loadProducts();
      normalizeCart(loaded.productsBySku);

      function cartSnapshot() {
        var view = buildCartView(getCart(), loaded.productsBySku);
        var totals = calculateTotals(view);
        renderCartRows("checkout-items", view, false, loaded.productsBySku);
        renderSummary(totals);
        return { view: view, totals: totals };
      }

      var initial = cartSnapshot();
      updateCartCountDisplay();
      if (initial.view.length === 0) {
        checkoutError.textContent = "Your cart is empty. Please add products before checkout.";
      }

      checkoutForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        checkoutError.textContent = "";

        var cartData = cartSnapshot();
        if (cartData.view.length === 0) {
          checkoutError.textContent = "Your cart is empty. Please add products before checkout.";
          return;
        }

        var validationError = validateCheckoutForm(checkoutForm);
        if (validationError) {
          checkoutError.textContent = validationError;
          return;
        }

        var payload = {
          customer: {
            firstName: checkoutForm.firstName.value.trim(),
            lastName: checkoutForm.lastName.value.trim(),
            email: checkoutForm.email.value.trim(),
            phone: checkoutForm.phone.value.trim(),
            street: checkoutForm.street.value.trim(),
            city: checkoutForm.city.value.trim(),
            zip: checkoutForm.zip.value.trim()
          },
          items: cartData.view.map(function (item) {
            return {
              sku: item.sku,
              name: item.name,
              variant: item.variantId,
              qty: item.qty,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal
            };
          }),
          subtotal: cartData.totals.subtotal,
          shipping: cartData.totals.shipping,
          total: cartData.totals.total
        };

        var webhookUrl = ((window.SHOP_CONFIG && window.SHOP_CONFIG.webhookUrl) || "").trim();
        if (!webhookUrl) {
          checkoutError.textContent = "Missing Make webhook URL in SHOP_CONFIG.";
          return;
        }

        var submitButton = document.getElementById("checkout-submit") || checkoutForm.querySelector('button[type="submit"]');
        if (!submitButton) {
          return;
        }
        submitButton.disabled = true;
        submitButton.textContent = "Submitting order...";

        try {
          var response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error("Webhook request failed with status " + response.status);
          }

          var contentType = String(response.headers.get("content-type") || "").toLowerCase();
          var responseBody = {};
          var paymentQrCode = "";

          if (contentType.indexOf("image/") !== -1) {
            var imageBlob = await response.blob();
            paymentQrCode = await blobToDataUrl(imageBlob);
          } else {
            var rawText = "";
            try {
              rawText = await response.text();
            } catch (e) {
              rawText = "";
            }

            if (rawText) {
              try {
                responseBody = JSON.parse(rawText);
              } catch (e) {
                // Non-JSON response, try treating response as QR value directly.
                paymentQrCode = rawText.trim();
              }
            }

            if (!paymentQrCode) {
              paymentQrCode =
                responseBody.paymentQrCode ||
                responseBody.paymentQr ||
                responseBody.qrCode ||
                responseBody.qrImage ||
                responseBody.qrUrl ||
                (responseBody.data &&
                  (responseBody.data.paymentQrCode || responseBody.data.qrCode || responseBody.data.qrImage || responseBody.data.qrUrl)) ||
                "";
            }
          }

          paymentQrCode = normalizeQrImageSrc(paymentQrCode);

          if (!paymentQrCode) {
            throw new Error(
              "Webhook returned no QR image. Ensure Make sends the QR as image/png or JSON field paymentQrCode/qrCode."
            );
          }

          var fallback = createOrderFallback(payload);
          var veeniOrderNumber = String(response.headers.get("x-veeni-order-number") || "").trim();
          var finalOrderNumber = veeniOrderNumber || responseBody.orderNumber || responseBody.orderId || fallback.orderNumber;
          var orderSummary = {
            orderNumber: finalOrderNumber,
            variableSymbol: finalOrderNumber,
            bankAccount: responseBody.bankAccount || (window.SHOP_CONFIG && window.SHOP_CONFIG.bankAccount) || fallback.bankAccount,
            total: payload.total,
            paymentQrCode: paymentQrCode,
            paymentConfirmed: false
          };

          localStorage.setItem(ORDER_KEY, JSON.stringify(orderSummary));
          applyPurchaseToLocalStock(cartData.view, loaded.productsBySku);
          saveCart([]);
          window.location.href = "payment.html";
        } catch (error) {
          var errorMessage = String((error && error.message) || "");
          var shouldShowDetails =
            (window.SHOP_CONFIG && window.SHOP_CONFIG.debug) ||
            errorMessage.indexOf("Webhook returned no QR image") !== -1;

          checkoutError.textContent =
            "Order submission failed. Please try again." + (shouldShowDetails ? " (" + errorMessage + ")" : "");
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = "Place Order";
        }
      });
    } catch (error) {
      checkoutError.textContent = "Checkout could not be initialized.";
    }
  }

  function initThankYouPage() {
    var orderNumberEl = document.getElementById("thankyou-order-number");
    if (!orderNumberEl) {
      return;
    }

    var raw = localStorage.getItem(ORDER_KEY);
    if (!raw) {
      return;
    }

    try {
      var order = JSON.parse(raw);
      if (!order.paymentConfirmed) {
        window.location.href = "payment.html";
        return;
      }
      var thankyouOrderNumberEl = document.getElementById("thankyou-order-number");
      var thankyouTotalEl = document.getElementById("thankyou-total");
      var thankyouBankAccountEl = document.getElementById("thankyou-bank-account");
      var thankyouVariableSymbolEl = document.getElementById("thankyou-variable-symbol");

      if (thankyouOrderNumberEl) {
        thankyouOrderNumberEl.textContent = order.orderNumber || "-";
      }
      if (thankyouTotalEl) {
        thankyouTotalEl.textContent = order.total ? formatPrice(order.total) : "-";
      }
      if (thankyouBankAccountEl) {
        thankyouBankAccountEl.textContent = order.bankAccount || "-";
      }
      if (thankyouVariableSymbolEl) {
        thankyouVariableSymbolEl.textContent = order.variableSymbol || "-";
      }
    } catch (error) {
      // Ignore invalid cached value.
    }
  }

  function initPaymentPage() {
    var qrImage = document.getElementById("payment-qr-image");
    var confirmButton = document.getElementById("payment-confirm");
    if (!qrImage && !confirmButton) {
      return;
    }

    var raw = localStorage.getItem(ORDER_KEY);
    var paymentError = document.getElementById("payment-error");
    var qrHint = document.getElementById("payment-qr-hint");
    var paymentOrderNumberEl = document.getElementById("payment-order-number");
    var paymentTotalEl = document.getElementById("payment-total");
    var paymentBankAccountEl = document.getElementById("payment-bank-account");
    var paymentVariableSymbolEl = document.getElementById("payment-variable-symbol");

    if (!raw) {
      if (paymentError) {
        paymentError.textContent = "No pending payment was found. Please place a new order.";
      }
      if (confirmButton) {
        confirmButton.disabled = true;
      }
      return;
    }

    try {
      var order = JSON.parse(raw);

      if (paymentOrderNumberEl) {
        paymentOrderNumberEl.textContent = order.orderNumber || "-";
      }
      if (paymentTotalEl) {
        paymentTotalEl.textContent = order.total ? formatPrice(order.total) : "-";
      }
      if (paymentBankAccountEl) {
        paymentBankAccountEl.textContent = order.bankAccount || "-";
      }
      if (paymentVariableSymbolEl) {
        paymentVariableSymbolEl.textContent = order.variableSymbol || "-";
      }

      var qrSrc = normalizeQrImageSrc(order.paymentQrCode || "");

      if (qrImage) {
        if (qrSrc) {
          qrImage.src = qrSrc;
          qrImage.hidden = false;
          if (qrHint) {
            qrHint.hidden = true;
          }
        } else {
          qrImage.hidden = true;
          if (qrHint) {
            qrHint.hidden = false;
          }
        }
      }

      if (!confirmButton) {
        return;
      }

      confirmButton.addEventListener("click", function () {
        order.paymentConfirmed = true;
        order.paidAt = new Date().toISOString();
        localStorage.setItem(ORDER_KEY, JSON.stringify(order));
        window.location.href = "thank-you.html";
      });
    } catch (error) {
      if (paymentError) {
        paymentError.textContent = "Payment details could not be loaded. Please place a new order.";
      }
      if (confirmButton) {
        confirmButton.disabled = true;
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    initProductsPage();
    initCartPage();
    initCheckoutPage();
    initPaymentPage();
    initThankYouPage();
  });
})();
