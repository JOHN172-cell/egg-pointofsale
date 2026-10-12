/**
 * Sylcat Farms POS - Sales Terminal Controller
 * Manages cart, price types (retail/wholesale), bulk discounts,
 * and crate count adjustments (strictly whole numbers).
 */

import { store, formatMoney } from './store.js';

export class PosController {
  constructor() {
    this.cart = []; // Array of { productId, crates }
    this.priceType = 'retail'; // 'retail' | 'wholesale'
    this.customerName = '';
    this.customerPhone = '';
    this.onPaymentRequested = null; // Callback when cashier clicks Proceed to Payment
  }

  init(container, onPaymentRequested) {
    this.container = container;
    this.onPaymentRequested = onPaymentRequested;
    this.render();

    // Subscribe to store updates (e.g. stock changes, settings changes)
    store.subscribe((event) => {
      if (['PRODUCTS_UPDATED', 'STOCK_UPDATED', 'SETTINGS_UPDATED', 'STATE_RESET'].includes(event)) {
        this.syncCartWithProducts();
        this.render();
      }
    });
  }

  setPriceType(type) {
    if (this.priceType !== type) {
      this.priceType = type;
      this.render();
    }
  }

  syncCartWithProducts() {
    // Ensure cart quantities do not exceed updated stock
    this.cart = this.cart.filter(item => {
      const prod = store.getProductById(item.productId);
      return prod && prod.active && prod.stock > 0;
    }).map(item => {
      const prod = store.getProductById(item.productId);
      return {
        ...item,
        crates: Math.min(item.crates, prod.stock)
      };
    }).filter(item => item.crates > 0);
  }

  addToCart(productId, count = 1) {
    const prod = store.getProductById(productId);
    if (!prod || !prod.active) return;

    const wholeCount = Math.max(1, Math.floor(Number(count) || 1));
    const existing = this.cart.find(item => item.productId === productId);
    const currentInCart = existing ? existing.crates : 0;
    const requestedTotal = currentInCart + wholeCount;

    if (requestedTotal > prod.stock) {
      this.showToast(`Cannot add ${wholeCount} crate(s). Only ${prod.stock - currentInCart} more crate(s) available for ${prod.name}!`, 'warning');
      return;
    }

    if (existing) {
      existing.crates += wholeCount;
    } else {
      this.cart.push({ productId, crates: wholeCount });
    }

    this.render();
  }

  updateCartQuantity(productId, newCount) {
    const prod = store.getProductById(productId);
    if (!prod) return;

    const wholeCount = Math.floor(Number(newCount) || 0);
    if (wholeCount <= 0) {
      this.removeFromCart(productId);
      return;
    }

    if (wholeCount > prod.stock) {
      this.showToast(`Only ${prod.stock} crate(s) available in stock for ${prod.name}!`, 'warning');
      const item = this.cart.find(i => i.productId === productId);
      if (item) item.crates = prod.stock;
    } else {
      const item = this.cart.find(i => i.productId === productId);
      if (item) item.crates = wholeCount;
    }

    this.render();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.productId !== productId);
    this.render();
  }

  clearCart() {
    this.cart = [];
    this.customerName = '';
    this.customerPhone = '';
    this.render();
  }

  getCalculations() {
    const settings = store.getSettings();
    let subtotal = 0;
    let totalCrates = 0;

    const items = this.cart.map(cartItem => {
      const prod = store.getProductById(cartItem.productId);
      const unitPrice = this.priceType === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
      const lineTotal = unitPrice * cartItem.crates;
      subtotal += lineTotal;
      totalCrates += cartItem.crates;

      return {
        productId: prod.id,
        name: prod.name,
        sizeLabel: prod.sizeLabel,
        crates: cartItem.crates,
        unitPrice,
        lineTotal,
        stock: prod.stock
      };
    });

    // Automatic bulk discount logic
    const threshold = Number(settings.bulkDiscountThreshold) || 10;
    const discountPercent = Number(settings.bulkDiscountPercent) || 10;
    const qualifiesForBulk = totalCrates >= threshold && threshold > 0;
    const discountAmount = qualifiesForBulk ? Math.round((subtotal * (discountPercent / 100)) * 100) / 100 : 0;
    const grandTotal = Math.max(0, subtotal - discountAmount);

    return {
      items,
      totalCrates,
      subtotal,
      qualifiesForBulk,
      bulkThreshold: threshold,
      discountPercent: qualifiesForBulk ? discountPercent : 0,
      discountAmount,
      grandTotal,
      currencySymbol: settings.currencySymbol || 'GH₵',
      currency: settings.currency || 'GHS'
    };
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `pos-toast pos-toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('pos-toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  render() {
    if (!this.container) return;

    const products = store.getProducts(false); // Active only
    const calcs = this.getCalculations();
    const settings = store.getSettings();

    this.container.innerHTML = `
      <div class="pos-sales-layout">
        <!-- LEFT: Products Selection & Grid -->
        <section class="pos-products-column" aria-label="Egg Sizes Selection">
          <!-- Price Type Switcher & Notice -->
          <div class="pos-toolbar-card">
            <div class="pos-price-switch-group">
              <span class="pos-toolbar-label">PRICE TYPE:</span>
              <div class="pos-pill-group" role="radiogroup" aria-label="Price Type">
                <button type="button" 
                  class="pos-pill-btn ${this.priceType === 'retail' ? 'active' : ''}" 
                  id="btn-retail-mode"
                  aria-checked="${this.priceType === 'retail'}">
                  🛒 Retail Price
                </button>
                <button type="button" 
                  class="pos-pill-btn ${this.priceType === 'wholesale' ? 'active' : ''}" 
                  id="btn-wholesale-mode"
                  aria-checked="${this.priceType === 'wholesale'}">
                  🏷️ Wholesale Price
                </button>
              </div>
            </div>

            <div class="pos-crate-rule-badge" title="Sylcat Farms strictly sells full crates only">
              <span class="badge-icon">📦</span>
              <span><strong>Full Crates Only</strong> (30 Eggs/Crate)</span>
            </div>
          </div>

          <!-- Egg Size Products Grid -->
          <div class="pos-products-grid">
            ${products.length === 0 ? `
              <div class="pos-empty-state">
                <p>No active products configured.</p>
                <button type="button" class="btn btn-secondary" id="btn-goto-products">Go to Products</button>
              </div>
            ` : products.map(prod => {
              const inCartItem = this.cart.find(i => i.productId === prod.id);
              const inCartCount = inCartItem ? inCartItem.crates : 0;
              const unitPrice = this.priceType === 'wholesale' ? prod.wholesalePrice : prod.retailPrice;
              const isLowStock = prod.stock <= prod.lowStockLevel && prod.stock > 0;
              const isOutOfStock = prod.stock <= 0;
              const remainingAvailable = Math.max(0, prod.stock - inCartCount);

              return `
                <article class="pos-product-card ${isOutOfStock ? 'is-out-of-stock' : ''} ${inCartCount > 0 ? 'has-in-cart' : ''}" 
                  data-product-id="${prod.id}">
                  <div class="prod-card-header">
                    <div class="prod-title-wrap">
                      <h3 class="prod-name">${prod.name}</h3>
                      <span class="prod-badge-size">${prod.sizeLabel} Crate</span>
                    </div>
                    <div class="prod-stock-status">
                      ${isOutOfStock ? `
                        <span class="status-badge status-out">Out of Stock</span>
                      ` : isLowStock ? `
                        <span class="status-badge status-warning">Low Stock (${prod.stock} left)</span>
                      ` : `
                        <span class="status-badge status-ok">${prod.stock} crates in stock</span>
                      `}
                    </div>
                  </div>

                  <div class="prod-card-price-row">
                    <div class="prod-price-box">
                      <span class="prod-price-currency">${calcs.currencySymbol}</span>
                      <span class="prod-price-amount">${unitPrice.toFixed(2)}</span>
                      <span class="prod-price-unit">/ crate</span>
                    </div>
                    <div class="prod-sub-note">
                      ${this.priceType === 'retail' ? `Wholesale: ${formatMoney(prod.wholesalePrice)}` : `Retail: ${formatMoney(prod.retailPrice)}`}
                    </div>
                  </div>

                  <!-- Quick Action Buttons for Touch/Cashier -->
                  <div class="prod-card-actions">
                    <button type="button" 
                      class="btn btn-crate-add" 
                      data-action="add-1" 
                      data-id="${prod.id}"
                      ${isOutOfStock || remainingAvailable < 1 ? 'disabled' : ''}>
                      + 1 Crate
                    </button>
                    <button type="button" 
                      class="btn btn-crate-bulk" 
                      data-action="add-5" 
                      data-id="${prod.id}"
                      ${isOutOfStock || remainingAvailable < 5 ? 'disabled' : ''}>
                      + 5
                    </button>
                    <button type="button" 
                      class="btn btn-crate-bulk" 
                      data-action="add-10" 
                      data-id="${prod.id}"
                      ${isOutOfStock || remainingAvailable < 10 ? 'disabled' : ''}>
                      + 10
                    </button>
                  </div>

                  ${inCartCount > 0 ? `
                    <div class="prod-card-incart-banner">
                      <span>In Current Sale: <strong>${inCartCount} crate${inCartCount > 1 ? 's' : ''}</strong></span>
                      <span class="incart-avail">(${remainingAvailable} left)</span>
                    </div>
                  ` : ''}
                </article>
              `;
            }).join('')}
          </div>
        </section>

        <!-- RIGHT: Current Sale / Cart Sidebar -->
        <aside class="pos-cart-column" aria-label="Current Sale Details">
          <div class="pos-cart-panel">
            <div class="pos-cart-header">
              <div class="cart-header-title">
                <h2>Current Sale</h2>
                <span class="cart-mode-tag ${this.priceType}">
                  ${this.priceType === 'wholesale' ? 'Wholesale Pricing' : 'Retail Pricing'}
                </span>
              </div>
              ${this.cart.length > 0 ? `
                <button type="button" class="btn-text-danger" id="btn-clear-cart" title="Clear current sale items">
                  Clear
                </button>
              ` : ''}
            </div>

            <!-- Optional Customer Info -->
            <div class="pos-customer-input-box">
              <label for="pos-customer-name" class="visually-hidden">Customer Name (Optional)</label>
              <input type="text" 
                id="pos-customer-name" 
                class="form-control form-control-sm" 
                placeholder="Customer Name (Optional)" 
                value="${this.customerName || ''}">
            </div>

            <!-- Cart Items List -->
            <div class="pos-cart-items-wrap">
              ${this.cart.length === 0 ? `
                <div class="pos-cart-empty">
                  <div class="cart-empty-icon">🥚</div>
                  <p class="cart-empty-title">Sale is Empty</p>
                  <p class="cart-empty-desc">Tap an egg size card to add full crates to this sale</p>
                </div>
              ` : `
                <div class="pos-cart-list" role="list">
                  ${calcs.items.map(item => `
                    <div class="pos-cart-item" role="listitem">
                      <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-rates">
                          ${formatMoney(item.unitPrice)} × ${item.crates} crate${item.crates > 1 ? 's' : ''}
                        </div>
                      </div>

                      <!-- Stepper Controls (Whole Numbers Only) -->
                      <div class="cart-stepper-wrap">
                        <button type="button" 
                          class="btn-stepper btn-minus" 
                          data-action="decrement" 
                          data-id="${item.productId}"
                          aria-label="Decrease crate count">−</button>
                        
                        <input type="number" 
                          class="stepper-input" 
                          data-id="${item.productId}"
                          value="${item.crates}" 
                          min="1" 
                          max="${item.stock}" 
                          step="1"
                          aria-label="Whole crates for ${item.name}">
                        
                        <button type="button" 
                          class="btn-stepper btn-plus" 
                          data-action="increment" 
                          data-id="${item.productId}"
                          ${item.crates >= item.stock ? 'disabled' : ''}
                          aria-label="Increase crate count">+</button>
                      </div>

                      <div class="cart-item-total">
                        ${formatMoney(item.lineTotal)}
                      </div>

                      <button type="button" 
                        class="btn-item-remove" 
                        data-action="remove" 
                        data-id="${item.productId}"
                        title="Remove item" 
                        aria-label="Remove ${item.name} from sale">
                        ×
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Bulk Discount Notice / Badge -->
            ${calcs.totalCrates > 0 ? `
              <div class="pos-discount-notice ${calcs.qualifiesForBulk ? 'is-applied' : 'is-pending'}">
                ${calcs.qualifiesForBulk ? `
                  <div class="discount-notice-content">
                    <span class="disc-icon">🎉</span>
                    <span><strong>Bulk Discount Applied:</strong> ${calcs.discountPercent}% off on ${calcs.totalCrates} crates!</span>
                  </div>
                ` : `
                  <div class="discount-notice-content">
                    <span class="disc-icon">💡</span>
                    <span>Add <strong>${calcs.bulkThreshold - calcs.totalCrates} more crate${(calcs.bulkThreshold - calcs.totalCrates) > 1 ? 's' : ''}</strong> for an automatic <strong>${settings.bulkDiscountPercent}% bulk discount</strong>!</span>
                  </div>
                `}
              </div>
            ` : ''}

            <!-- Summary Calculations -->
            <div class="pos-cart-summary">
              <div class="summary-line">
                <span>Total Crates Sold</span>
                <span class="summary-val-bold">${calcs.totalCrates} Crate${calcs.totalCrates !== 1 ? 's' : ''}</span>
              </div>
              <div class="summary-line">
                <span>Subtotal</span>
                <span>${formatMoney(calcs.subtotal)}</span>
              </div>
              ${calcs.discountAmount > 0 ? `
                <div class="summary-line discount-line">
                  <span>Bulk Discount (${calcs.discountPercent}%)</span>
                  <span class="discount-val">− ${formatMoney(calcs.discountAmount)}</span>
                </div>
              ` : ''}
              <div class="summary-line grand-total-line">
                <span>Grand Total</span>
                <span class="grand-total-amount">${formatMoney(calcs.grandTotal)}</span>
              </div>
            </div>

            <!-- Action Button -->
            <div class="pos-cart-footer">
              <button type="button" 
                class="btn btn-primary btn-checkout" 
                id="btn-proceed-payment"
                ${this.cart.length === 0 ? 'disabled' : ''}>
                <span class="checkout-icon">💳</span>
                <span>Proceed to Payment</span>
                <span class="checkout-total">(${formatMoney(calcs.grandTotal)})</span>
              </button>
            </div>
          </div>
        </aside>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Mode Switcher
    const btnRetail = this.container.querySelector('#btn-retail-mode');
    const btnWholesale = this.container.querySelector('#btn-wholesale-mode');
    if (btnRetail) btnRetail.addEventListener('click', () => this.setPriceType('retail'));
    if (btnWholesale) btnWholesale.addEventListener('click', () => this.setPriceType('wholesale'));

    // Customer Name Input
    const custInput = this.container.querySelector('#pos-customer-name');
    if (custInput) {
      custInput.addEventListener('input', (e) => {
        this.customerName = e.target.value;
      });
    }

    // Clear Cart
    const btnClear = this.container.querySelector('#btn-clear-cart');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        if (confirm('Clear current sale?')) {
          this.clearCart();
        }
      });
    }

    // Add to cart from Product Cards
    this.container.querySelectorAll('.btn-crate-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.addToCart(id, 1);
      });
    });

    this.container.querySelectorAll('.btn-crate-bulk').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const count = btn.getAttribute('data-action') === 'add-5' ? 5 : 10;
        this.addToCart(id, count);
      });
    });

    // Steppers inside Cart
    this.container.querySelectorAll('.btn-stepper').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const action = btn.getAttribute('data-action');
        const item = this.cart.find(i => i.productId === id);
        if (!item) return;

        if (action === 'increment') {
          this.updateCartQuantity(id, item.crates + 1);
        } else if (action === 'decrement') {
          this.updateCartQuantity(id, item.crates - 1);
        }
      });
    });

    // Direct input on stepper input
    this.container.querySelectorAll('.stepper-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = input.getAttribute('data-id');
        const val = Math.floor(Number(e.target.value) || 1);
        this.updateCartQuantity(id, val);
      });
    });

    // Remove item
    this.container.querySelectorAll('.btn-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.removeFromCart(id);
      });
    });

    // Proceed to Payment
    const btnProceed = this.container.querySelector('#btn-proceed-payment');
    if (btnProceed) {
      btnProceed.addEventListener('click', () => {
        if (this.cart.length === 0) return;
        const calcs = this.getCalculations();
        if (typeof this.onPaymentRequested === 'function') {
          this.onPaymentRequested({
            customerName: this.customerName,
            priceType: this.priceType,
            ...calcs
          });
        }
      });
    }

    // Go to products button if empty
    const btnGotoProd = this.container.querySelector('#btn-goto-products');
    if (btnGotoProd) {
      btnGotoProd.addEventListener('click', () => {
        const tabProd = document.querySelector('[data-tab="products"]');
        if (tabProd) tabProd.click();
      });
    }
  }
}
