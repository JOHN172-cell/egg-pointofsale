/**
 * Sylcat Farms POS - Central Store & State Management
 * Handles settings, products, stock movements, and sales history.
 * Strictly enforces full-crates-only inventory (integers >= 1).
 */

import { api } from './api.js';

const STORAGE_KEYS = {
  SETTINGS: 'sylcat_pos_settings_v1',
  PRODUCTS: 'sylcat_pos_products_v1',
  SALES: 'sylcat_pos_sales_v1',
  STOCK_LOGS: 'sylcat_pos_stock_logs_v1',
  CASHIER: 'sylcat_pos_cashier_v1',
  THEME: 'sylcat_pos_theme_v1'
};

const DEFAULT_SETTINGS = {
  businessName: 'Sylcat Farms',
  phone: '0244606689',
  address: '', // Blank initially as configured by user
  currency: 'GHS',
  currencySymbol: 'GH₵',
  crateSize: 30, // 30 eggs per crate
  bulkDiscountThreshold: 10, // 10 or more crates
  bulkDiscountPercent: 10, // 10%
  cashierName: 'Cashier 1'
};

const DEFAULT_PRODUCTS = [
  {
    id: 'prod-peoples',
    sizeKey: 'peoples',
    name: 'Peoples Size',
    sizeLabel: 'Peoples',
    retailPrice: 50,
    wholesalePrice: 46,
    stock: 45,
    lowStockLevel: 10,
    active: true,
    description: 'Peoples Size egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-indomie',
    sizeKey: 'indomie',
    name: 'Indomie Size',
    sizeLabel: 'Indomie',
    retailPrice: 56,
    wholesalePrice: 52,
    stock: 80,
    lowStockLevel: 15,
    active: true,
    description: 'Indomie Size egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-family',
    sizeKey: 'family',
    name: 'Family Size',
    sizeLabel: 'Family',
    retailPrice: 64,
    wholesalePrice: 60,
    stock: 60,
    lowStockLevel: 15,
    active: true,
    description: 'Family Size egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-promotion',
    sizeKey: 'promotion',
    name: 'Promotion Size',
    sizeLabel: 'Promotion',
    retailPrice: 72,
    wholesalePrice: 66,
    stock: 35,
    lowStockLevel: 8,
    active: true,
    description: 'Promotion Size egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-table',
    sizeKey: 'table',
    name: 'Table Size',
    sizeLabel: 'Table',
    retailPrice: 80,
    wholesalePrice: 74,
    stock: 25,
    lowStockLevel: 8,
    active: true,
    description: 'Table Size egg crates (30 eggs/crate)'
  }
];

class Store {
  constructor() {
    this.listeners = new Set();
    this.init();
  }

  init() {
    this.settings = this.load(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    if (this.settings.phone === '022606689') {
      this.settings.phone = DEFAULT_SETTINGS.phone;
      this.save(STORAGE_KEYS.SETTINGS, this.settings);
    }
    this.products = this.load(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
    this.sales = this.load(STORAGE_KEYS.SALES, []);
    this.stockLogs = this.load(STORAGE_KEYS.STOCK_LOGS, []);
    this.activeCashier = this.load(STORAGE_KEYS.CASHIER, 'Cashier 1');
    this.theme = this.load(STORAGE_KEYS.THEME, 'auto');

    // If first time initializing, create initial stock log entries
    if (this.stockLogs.length === 0) {
      this.products.forEach(prod => {
        this.stockLogs.push({
          id: 'log-' + Date.now() + '-' + prod.id,
          timestamp: new Date().toISOString(),
          productId: prod.id,
          productName: prod.name,
          type: 'INITIAL_STOCK',
          cratesChanged: prod.stock,
          previousStock: 0,
          newStock: prod.stock,
          reason: 'Initial Inventory Setup',
          cashier: this.activeCashier
        });
      });
      this.save(STORAGE_KEYS.STOCK_LOGS, this.stockLogs);
    }

    // Migrate old product names to new Sylcat Farms egg size names
    this.migrateProductNames();
  }

  migrateProductNames() {
    const MIGRATION_KEY = 'sylcat_product_names_v2';
    if (localStorage.getItem(MIGRATION_KEY)) return; // already migrated

    const nameMap = {
      'prod-small':  { sizeKey: 'peoples',   name: 'Peoples Size',   sizeLabel: 'Peoples',   description: 'Peoples Size egg crates (30 eggs/crate)' },
      'prod-medium': { sizeKey: 'indomie',   name: 'Indomie Size',   sizeLabel: 'Indomie',   description: 'Indomie Size egg crates (30 eggs/crate)' },
      'prod-large':  { sizeKey: 'family',    name: 'Family Size',    sizeLabel: 'Family',    description: 'Family Size egg crates (30 eggs/crate)' },
      'prod-jumbo':  { sizeKey: 'promotion', name: 'Promotion Size', sizeLabel: 'Promotion', description: 'Promotion Size egg crates (30 eggs/crate)' }
    };

    let changed = false;
    this.products.forEach(prod => {
      if (nameMap[prod.id]) {
        const m = nameMap[prod.id];
        const newId = 'prod-' + m.sizeKey;
        // Update stock logs to reference new id/name
        this.stockLogs.forEach(log => {
          if (log.productId === prod.id) {
            log.productId = newId;
            log.productName = m.name;
          }
        });
        // Update sales history items
        this.sales.forEach(sale => {
          if (sale.items) {
            sale.items.forEach(item => {
              if (item.productId === prod.id) {
                item.productId = newId;
                item.productName = m.name;
              }
            });
          }
        });
        prod.id = newId;
        prod.sizeKey = m.sizeKey;
        prod.name = m.name;
        prod.sizeLabel = m.sizeLabel;
        prod.description = m.description;
        changed = true;
      }
    });

    // Add Table Size if it doesn't exist yet
    if (!this.products.find(p => p.id === 'prod-table')) {
      this.products.push({
        id: 'prod-table',
        sizeKey: 'table',
        name: 'Table Size',
        sizeLabel: 'Table',
        retailPrice: 80,
        wholesalePrice: 74,
        stock: 25,
        lowStockLevel: 8,
        active: true,
        description: 'Table Size egg crates (30 eggs/crate)'
      });
      changed = true;
    }

    if (changed) {
      this.save(STORAGE_KEYS.PRODUCTS, this.products);
      this.save(STORAGE_KEYS.STOCK_LOGS, this.stockLogs);
      this.save(STORAGE_KEYS.SALES, this.sales);
    }
    localStorage.setItem(MIGRATION_KEY, '1');
  }

  load(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`Error loading ${key} from localStorage:`, e);
      return fallback;
    }
  }

  save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, payload) {
    this.listeners.forEach(fn => fn(event, payload));
  }

  // Settings
  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    return this.updateSettingsShared(newSettings);
  }

  async updateSettingsShared(newSettings) {
    const settings = { ...this.settings, ...newSettings };
    const result = await api.put('/api/pos/settings', settings);
    Object.assign(settings, result.settings);
    this.settings = settings;
    this.notify('SETTINGS_UPDATED', this.settings);
  }

  // Products
  getProducts(includeInactive = false) {
    if (includeInactive) {
      return [...this.products];
    }
    return this.products.filter(p => p.active);
  }

  getProductById(id) {
    return this.products.find(p => p.id === id);
  }

  updateProduct(id, updates) {
    return this.updateProductShared(id, updates);
  }

  async updateProductShared(id, updates) {
    const idx = this.products.findIndex(p => p.id === id);
    if (idx === -1) return false;

    // Enforce whole numbers for stock and low stock level
    if (updates.stock !== undefined) {
      updates.stock = Math.max(0, Math.floor(Number(updates.stock) || 0));
    }
    if (updates.lowStockLevel !== undefined) {
      updates.lowStockLevel = Math.max(0, Math.floor(Number(updates.lowStockLevel) || 0));
    }
    if (updates.retailPrice !== undefined) {
      updates.retailPrice = Math.max(0, Number(updates.retailPrice) || 0);
    }
    if (updates.wholesalePrice !== undefined) {
      updates.wholesalePrice = Math.max(0, Number(updates.wholesalePrice) || 0);
    }

    const product = { ...this.products[idx], ...updates };
    await api.patch('/api/pos/products', { ...product, id });
    await this.refreshSharedData(false);
    this.notify('PRODUCTS_UPDATED', this.products);
    return true;
  }

  addProduct(productData) {
    return this.addProductShared(productData);
  }

  async addProductShared(productData) {
    const id = 'prod-' + Date.now();
    const newProd = {
      id,
      sizeKey: productData.sizeLabel.toLowerCase().replace(/\s+/g, '-'),
      name: productData.name || `${productData.sizeLabel} Eggs`,
      sizeLabel: productData.sizeLabel,
      retailPrice: Math.max(0, Number(productData.retailPrice) || 0),
      wholesalePrice: Math.max(0, Number(productData.wholesalePrice) || 0),
      stock: Math.max(0, Math.floor(Number(productData.stock) || 0)),
      lowStockLevel: Math.max(0, Math.floor(Number(productData.lowStockLevel) || 5)),
      active: true,
      description: productData.description || `Fresh ${productData.sizeLabel} egg crates (30 eggs/crate)`
    };

    await api.post('/api/pos/products', newProd);
    await this.refreshSharedData(false);

    this.notify('PRODUCTS_UPDATED', this.products);
    return newProd;
  }

  toggleProductActive(id) {
    const prod = this.getProductById(id);
    if (!prod) return false;
    return this.updateProduct(id, { active: !prod.active });
  }

  // Stock
  recordDelivery({ productId, cratesReceived, supplierName, notes }) {
    const prod = this.getProductById(productId);
    if (!prod) throw new Error('Product not found');

    const wholeCrates = Math.floor(Number(cratesReceived));
    if (isNaN(wholeCrates) || wholeCrates <= 0) {
      throw new Error('Crate quantity must be a whole positive number');
    }

    return this.recordStockChange({
      productId,
      quantity: wholeCrates,
      isTarget: false,
      type: 'DELIVERY',
      reason: supplierName ? `Delivery from ${supplierName}${notes ? ' - ' + notes : ''}` : (notes || 'Stock delivery received')
    }).then(({ previousStock, newStock }) => ({
      previousStock, newStock, cratesReceived: wholeCrates
    }));
  }

  adjustStock({ productId, newStockCount, reason }) {
    const prod = this.getProductById(productId);
    if (!prod) throw new Error('Product not found');
    if (!reason || !reason.trim()) {
      throw new Error('A mandatory reason is required for manual stock adjustment');
    }

    const targetStock = Math.floor(Number(newStockCount));
    if (isNaN(targetStock) || targetStock < 0) {
      throw new Error('Target stock must be a non-negative whole number of crates');
    }

    return this.recordStockChange({
      productId,
      quantity: targetStock,
      isTarget: true,
      type: 'ADJUSTMENT',
      reason: reason.trim()
    });
  }

  logStockMovement(entry) {
    return this.logStockMovementShared(entry);
  }

  async logStockMovementShared(entry) {
    const { previousStock, newStock } = entry;
    const delta = newStock - previousStock;
    if (!delta) return;
    await api.post('/api/pos/stock', {
      productId: entry.productId,
      delta,
      reason: entry.reason,
      type: entry.type
    });
    await this.refreshSharedData();
  }

  async recordStockChange({ productId, quantity, isTarget, type, reason }) {
    const product = this.getProductById(productId);
    if (!product) throw new Error('Product not found');
    const previousStock = product.stock;
    const newStock = isTarget ? quantity : previousStock + quantity;
    if (newStock < 0) throw new Error('Stock cannot be negative');
    const difference = newStock - previousStock;
    if (difference === 0) return { previousStock, newStock, difference };
    await api.post('/api/pos/stock', { productId, delta: difference, reason, type });
    await this.refreshSharedData();
    return {
      previousStock, newStock, difference
    };
  }

  getStockLogs(productId = null) {
    if (productId) {
      return this.stockLogs.filter(l => l.productId === productId);
    }
    return [...this.stockLogs];
  }

  // Sales
  recordSale(saleData) {
    // 1. Strict validation of stock availability
    for (const item of saleData.items) {
      const prod = this.getProductById(item.productId);
      if (!prod) {
        throw new Error(`Product ${item.name} does not exist`);
      }
      const requestedCrates = Math.floor(Number(item.crates));
      if (requestedCrates <= 0 || !Number.isInteger(item.crates)) {
        throw new Error(`Quantity for ${prod.name} must be a whole number of crates`);
      }
    }

    const saleForDatabase = {
      customerName: (saleData.customerName || '').trim(),
      customerPhone: (saleData.customerPhone || '').trim(),
      idempotencyKey: saleData.idempotencyKey,
      priceType: saleData.priceType, // 'retail' or 'wholesale'
      items: saleData.items.map(i => ({
        productId: i.productId,
        name: i.name,
        sizeLabel: i.sizeLabel,
        crates: Math.floor(Number(i.crates)),
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal)
      })),
      totalCrates: saleData.totalCrates,
      subtotal: saleData.subtotal,
      discountPercent: saleData.discountPercent || 0,
      discountAmount: saleData.discountAmount || 0,
      grandTotal: saleData.grandTotal,
      paymentMethod: saleData.paymentMethod, // 'cash', 'momo', 'card', 'credit', 'split'
      paymentDetails: saleData.paymentDetails || {},
      status: 'COMPLETED'
    };

    return this.recordSaleShared(saleForDatabase);
  }

  async recordSaleShared(saleData) {
    const { sale: completedSale } = await api.post('/api/pos/sales', saleData);
    await this.refreshSharedData(false);
    this.notify('PRODUCTS_UPDATED', this.products);
    this.notify('STOCK_UPDATED', null);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
    this.notify('SALE_RECORDED', completedSale);
    return completedSale;
  }

  getSales(dateFilter = null) {
    if (!dateFilter) {
      return [...this.sales];
    }
    // Filter by ISO date string (YYYY-MM-DD)
    return this.sales.filter(s => s.timestamp.startsWith(dateFilter));
  }

  getSaleByNumber(saleNumber) {
    return this.sales.find(s => s.saleNumber === saleNumber);
  }

  /**
   * Returns all sales with an unpaid balance, grouped by customer name.
   */
  getAllOutstandingCredits() {
    const clientMap = {};
    this.sales.forEach(sale => {
      const balanceDue = this.getSaleBalanceDue(sale);
      if (balanceDue <= 0) return;

      const clientKey = (sale.customerName || 'Unknown Client').trim();
      const normKey = clientKey.toLowerCase();
      if (!clientMap[normKey]) {
        clientMap[normKey] = {
          clientName: clientKey,
          clientPhone: sale.customerPhone || '',
          totalOwed: 0,
          sales: []
        };
      }
      // Keep the most detailed name/phone
      if (sale.customerPhone && !clientMap[normKey].clientPhone) {
        clientMap[normKey].clientPhone = sale.customerPhone;
      }
      clientMap[normKey].totalOwed += balanceDue;
      clientMap[normKey].sales.push({
        saleNumber: sale.saleNumber,
        date: sale.timestamp,
        amount: balanceDue,
        totalAmount: sale.grandTotal,
        amountPaid: Math.max(0, sale.grandTotal - balanceDue),
        dueDate: sale.paymentDetails?.dueDate || null
      });
    });

    return Object.values(clientMap).sort((a, b) => b.totalOwed - a.totalOwed);
  }

  /**
   * Returns the total outstanding credit owed by a specific client name.
   */
  getClientTotalOwed(clientName) {
    if (!clientName || !clientName.trim()) return 0;
    const normName = clientName.trim().toLowerCase();
    return this.sales
      .filter(s => (s.customerName || '').trim().toLowerCase() === normName)
      .reduce((sum, sale) => sum + this.getSaleBalanceDue(sale), 0);
  }

  getSaleBalanceDue(sale) {
    if (sale.status === 'PAID') return 0;
    const balanceDue = Number(sale.paymentDetails?.balanceDue);
    if (Number.isFinite(balanceDue)) return Math.max(0, balanceDue);

    const method = sale.paymentDetails?.method || sale.paymentMethod;
    return method === 'Pay Later (Credit)' ? sale.grandTotal : 0;
  }

  /**
   * Marks an outstanding sale as PAID (settled).
   */
  markCreditPaid(saleNumber) {
    return this.markCreditPaidShared(saleNumber);
  }

  async markCreditPaidShared(saleNumber) {
    const sale = this.getSaleByNumber(saleNumber);
    if (!sale) return false;
    await api.post('/api/pos/debt-payment', {
      saleId: sale.id,
      amount: this.getSaleBalanceDue(sale),
      method: 'cash'
    });
    await this.refreshSharedData();
    return true;
  }

  async refundSale(sale, amount, reason, isVoid = false) {
    const returnItems = isVoid
      ? sale.items.map(item => ({ productId: item.productId, crates: item.crates }))
      : [];
    await api.post('/api/pos/refund', {
      saleId: sale.id,
      amount,
      reason,
      returnItems,
      void: isVoid
    });
    await this.refreshSharedData();
  }

  async connectToSharedDatabase() {
    await this.refreshSharedData(false);
    return true;
  }

  async refreshSharedData(notify = true) {
    const snapshot = await api.get('/api/pos');
    this.settings = snapshot.settings;
    this.products = snapshot.products;
    this.sales = snapshot.sales;
    this.stockLogs = snapshot.stockLogs;
    if (snapshot.user) {
      this.currentUser = snapshot.user;
      this.activeCashier = snapshot.user.name;
    }
    if (notify) this.notify('REMOTE_STATE_UPDATED', null);
    return snapshot.user;
  }

  subscribeToSharedChanges() {
    return window.setInterval(() => this.handleRemoteChange(), 15000);
  }

  async handleRemoteChange() {
    try {
      await this.refreshSharedData();
    } catch (error) {
      console.error('Unable to refresh shared POS data:', error);
      this.notify(error.status === 401 ? 'AUTH_EXPIRED' : 'SYNC_ERROR',
        'Could not refresh shared POS data. Check your connection and sign in again if needed.');
    }
  }

  // Theme
  getTheme() {
    return this.theme;
  }

  setTheme(theme) {
    this.theme = theme;
    this.save(STORAGE_KEYS.THEME, theme);
    this.applyTheme(theme);
    this.notify('THEME_CHANGED', theme);
  }

  applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      // Auto
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }
  }

  async migrateLocalData() {
    const { api } = await import('./api.js');
    const backup = {
      settings: this.load(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS),
      products: this.load(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS),
      sales: this.load(STORAGE_KEYS.SALES, []),
      stockLogs: this.load(STORAGE_KEYS.STOCK_LOGS, [])
    };
    const result = await api.post('/api/migrate-local', backup);
    await this.refreshSharedData(false);
    this.notify('REMOTE_STATE_UPDATED', null);
    return result;
  }
}

export const store = new Store();

/**
 * Formats a monetary number with a guaranteed space between currency symbol and digits
 * for high clarity and readability.
 */
export function formatMoney(amount, customSymbol = null) {
  const sym = customSymbol !== null ? customSymbol : (store.getSettings().currencySymbol || 'GH₵');
  const num = Number(amount) || 0;
  return `${sym} ${num.toFixed(2)}`;
}
