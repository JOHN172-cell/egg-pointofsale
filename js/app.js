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
import { currentSession, login, logout } from './api.js';

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
    this.user = null;
    this.activityTimeout = null;
    this.refreshTimer = null;
  }

  async start() {
    this.bindAuthentication();
    store.applyTheme(store.getTheme());
    try {
      const user = await currentSession();
      if (user) await this.enterApp(user);
    } catch (error) {
      if (error.status !== 401) {
        this.showLoginError(error.message || 'Unable to connect. Check your internet connection and try again.');
      }
    }
  }

  bindAuthentication() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('login-error');
      const button = form.querySelector('button[type="submit"]');
      errorBox.hidden = true;
      button.disabled = true;
      try {
        const user = await login(
          document.getElementById('login-email').value.trim(),
          document.getElementById('login-password').value
        );
        document.getElementById('login-password').value = '';
        await this.enterApp(user);
      } catch (error) {
        this.showLoginError(error.message || 'Sign in failed. Please try again.');
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById('btn-logout').addEventListener('click', () => this.signOut());
    ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
      window.addEventListener(eventName, () => {
        if (this.user) this.resetActivityTimeout();
      }, { passive: true });
    });
  }

  showLoginError(message) {
    const errorBox = document.getElementById('login-error');
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  resetActivityTimeout() {
    window.clearTimeout(this.activityTimeout);
    this.activityTimeout = window.setTimeout(() => this.signOut(true), 30 * 60 * 1000);
  }

  async signOut(expired = false) {
    window.clearTimeout(this.activityTimeout);
    window.clearInterval(this.refreshTimer);
    this.user = null;
    document.documentElement.removeAttribute('data-role');
    document.getElementById('app-shell').hidden = true;
    document.getElementById('auth-screen').hidden = false;
    if (expired) this.showLoginError('You were signed out after 30 minutes of inactivity. Please sign in again.');
    try { await logout(); } catch (error) {
      console.error('Server sign out failed:', error);
    }
  }

  showAppError(message) {
    const errorBox = document.getElementById('app-error-banner');
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  async enterApp(user) {
    if (user) this.user = user;
    if (this.initialized) {
      this.resetActivityTimeout();
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
    const user = await store.refreshSharedData(false);
    if (!this.user) this.user = user;
    document.getElementById('auth-screen').hidden = true;
    document.getElementById('app-shell').hidden = false;
    document.documentElement.dataset.role = this.user.role;
    document.getElementById('staff-identity').textContent =
      `${this.user.name} · ${this.user.role}`;
    this.resetActivityTimeout();
    this.initialized = true;
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
      if (event === 'AUTH_EXPIRED') this.signOut(true);
      if (event === 'REMOTE_STATE_UPDATED') this.showAppError('');
    });
    this.refreshTimer = store.subscribeToSharedChanges();

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
