/**
 * Sylcat Farms POS - Main Application Entrypoint
 * Orchestrates views, modals, theme toggles, and navigation.
 */

import { store } from './store.js';
import { PosController } from './pos.js';
import { PaymentModal } from './payment.js';
import { ReceiptModal } from './receipt.js';
import { StockController } from './stock.js';
import { ProductsController } from './products.js';
import { ReportsController } from './reports.js';
import { SettingsController } from './settings.js';

class App {
  constructor() {
    this.currentTab = 'pos';
    this.pos = new PosController();
    this.stock = new StockController();
    this.products = new ProductsController();
    this.reports = new ReportsController();
    this.settings = new SettingsController();
  }

  start() {
    // 1. Initialize Theme
    store.applyTheme(store.getTheme());

    // 2. Initialize Seed Data for demo if brand new
    this.seedDemoSalesIfEmpty();

    // 3. Initialize Modals
    const paymentModalEl = document.getElementById('modal-payment');
    const receiptModalEl = document.getElementById('modal-receipt');
    this.paymentModal = new PaymentModal(paymentModalEl, (completedSale) => {
      this.receiptModal.open(completedSale);
      this.pos.clearCart();
      this.updateHeaderStats();
    });
    this.receiptModal = new ReceiptModal(receiptModalEl);

    // 4. Initialize Controllers with Containers
    this.pos.init(
      document.getElementById('view-pos'),
      (saleData) => this.paymentModal.open(saleData)
    );

    this.stock.init(document.getElementById('view-stock'));
    this.products.init(document.getElementById('view-products'));
    this.reports.init(
      document.getElementById('view-reports'),
      (sale) => this.receiptModal.open(sale)
    );
    this.settings.init(document.getElementById('view-settings'));

    // 5. Global Bindings
    this.bindNavigation();
    this.bindThemeToggle();
    this.updateHeaderStats();

    // 6. Store subscriptions for header stats
    store.subscribe((event) => {
      if (['STOCK_UPDATED', 'SALE_RECORDED', 'SETTINGS_UPDATED', 'STATE_RESET'].includes(event)) {
        this.updateHeaderStats();
      }
    });

    // Listen to system dark mode change
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (store.getTheme() === 'auto') {
          store.applyTheme('auto');
        }
      });
    }
  }

  seedDemoSalesIfEmpty() {
    // Only seed if zero sales exist so cashier sees realistic daily report right away
    if (store.getSales().length === 0) {
      try {
        // Record a starter retail sale
        const sale1 = store.recordSale({
          customerName: 'Kofi Mensah',
          customerPhone: '0244123456',
          priceType: 'retail',
          items: [
            { productId: 'prod-medium', name: 'Medium Eggs', sizeLabel: 'Medium', crates: 3, unitPrice: 56, lineTotal: 168 },
            { productId: 'prod-large', name: 'Large Eggs', sizeLabel: 'Large', crates: 2, unitPrice: 64, lineTotal: 128 }
          ],
          totalCrates: 5,
          subtotal: 296,
          discountPercent: 0,
          discountAmount: 0,
          grandTotal: 296,
          paymentMethod: 'cash',
          paymentDetails: {
            method: 'Cash',
            amountTendered: 300,
            change: 4,
            amountPaid: 296,
            balanceDue: 0
          }
        });

        // Record a wholesale bulk order with 10% discount
        const sale2 = store.recordSale({
          customerName: 'Aba Bakery Ltd',
          customerPhone: '0555987654',
          priceType: 'wholesale',
          items: [
            { productId: 'prod-large', name: 'Large Eggs', sizeLabel: 'Large', crates: 8, unitPrice: 60, lineTotal: 480 },
            { productId: 'prod-medium', name: 'Medium Eggs', sizeLabel: 'Medium', crates: 4, unitPrice: 52, lineTotal: 208 }
          ],
          totalCrates: 12,
          subtotal: 688,
          discountPercent: 10,
          discountAmount: 68.80,
          grandTotal: 619.20,
          paymentMethod: 'momo',
          paymentDetails: {
            method: 'Mobile Money',
            network: 'MTN Mobile Money',
            reference: 'MM2819034',
            amountPaid: 619.20,
            balanceDue: 0
          }
        });
      } catch (e) {
        console.warn('Initial seed sales skipped:', e);
      }
    }
  }

  bindNavigation() {
    const navButtons = document.querySelectorAll('.app-nav-btn');
    const views = document.querySelectorAll('.app-view-tab');

    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        if (!targetTab) return;

        this.switchTab(targetTab);
      });
    });
  }

  switchTab(targetTab) {
    this.currentTab = targetTab;
    const navButtons = document.querySelectorAll('.app-nav-btn');
    const views = document.querySelectorAll('.app-view-tab');

    navButtons.forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === targetTab;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    views.forEach(view => {
      const isTarget = view.id === `view-${targetTab}`;
      view.classList.toggle('active', isTarget);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  bindThemeToggle() {
    const themeSelect = document.getElementById('select-theme-mode');
    if (themeSelect) {
      themeSelect.value = store.getTheme();
      themeSelect.addEventListener('change', (e) => {
        store.setTheme(e.target.value);
      });
    }
  }

  updateHeaderStats() {
    const settings = store.getSettings();
    const products = store.getProducts(true);

    // Total crates in stock
    const totalCrates = products.filter(p => p.active).reduce((sum, p) => sum + p.stock, 0);
    const crateBadge = document.getElementById('header-stock-counter');
    if (crateBadge) {
      crateBadge.textContent = `${totalCrates} Crates Available`;
    }

    // Business name
    const bizNameEls = document.querySelectorAll('.header-biz-name');
    bizNameEls.forEach(el => el.textContent = settings.businessName);

    // Business phone
    const phoneEl = document.getElementById('header-phone-display');
    if (phoneEl) {
      phoneEl.textContent = settings.phone;
    }
  }
}

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.start();
  window.__sylcatPosApp = app;
});
