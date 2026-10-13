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
    this.initialized = false;
    this.enteringApp = null;
  }

  async start() {
    try {
      await this.enterApp();
    } catch (error) {
      console.error('Unable to open shared POS:', error);
      this.showAppError(`Unable to connect to the shared database: ${error.message}`);
    }
  }

  showAppError(message) {
    const errorBox = document.getElementById('app-error-banner');
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  async enterApp() {
    if (this.initialized) {
      return;
    }
    if (this.enteringApp) return this.enteringApp;
    this.enteringApp = this.initializeApp();
    try {
      await this.enteringApp;
    } finally {
      this.enteringApp = null;
    }
  }

  async initializeApp() {
    const isShared = await store.connectToSharedDatabase();
    this.initialized = true;
    if (!isShared) {
      this.showAppError('Local mode: Supabase is not configured. Stock and sales work on this browser only and will not sync to other PCs.');
    }
    store.applyTheme(store.getTheme());

    const paymentModalEl = document.getElementById('modal-payment');
    const receiptModalEl = document.getElementById('modal-receipt');
    this.paymentModal = new PaymentModal(paymentModalEl, (completedSale) => {
      this.receiptModal.open(completedSale);
      this.pos.clearCart();
      this.updateHeaderStats();
    });
    this.receiptModal = new ReceiptModal(receiptModalEl);

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

    this.bindNavigation();
    this.bindThemeToggle();
    this.updateHeaderStats();

    store.subscribe((event) => {
      if (['STOCK_UPDATED', 'SALE_RECORDED', 'SETTINGS_UPDATED', 'STATE_RESET', 'REMOTE_STATE_UPDATED'].includes(event)) {
        this.updateHeaderStats();
      }
      if (event === 'SYNC_ERROR') this.showAppError('Live shared-data updates were interrupted. Reload the page to reconnect.');
      if (event === 'REMOTE_STATE_UPDATED') this.showAppError('');
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
