/**
 * Sylcat Farms POS - Central Store & State Management
 * Handles settings, products, stock movements, and sales history.
 * Strictly enforces full-crates-only inventory (integers >= 1).
 */

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
  phone: '022606689',
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
    id: 'prod-small',
    sizeKey: 'small',
    name: 'Small Eggs',
    sizeLabel: 'Small',
    retailPrice: 50,
    wholesalePrice: 46,
    stock: 45,
    lowStockLevel: 10,
    active: true,
    description: 'Fresh farm-graded Small egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-medium',
    sizeKey: 'medium',
    name: 'Medium Eggs',
    sizeLabel: 'Medium',
    retailPrice: 56,
    wholesalePrice: 52,
    stock: 80,
    lowStockLevel: 15,
    active: true,
    description: 'Standard farm-fresh Medium egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-large',
    sizeKey: 'large',
    name: 'Large Eggs',
    sizeLabel: 'Large',
    retailPrice: 64,
    wholesalePrice: 60,
    stock: 60,
    lowStockLevel: 15,
    active: true,
    description: 'Select Large golden egg crates (30 eggs/crate)'
  },
  {
    id: 'prod-jumbo',
    sizeKey: 'jumbo',
    name: 'Jumbo Eggs',
    sizeLabel: 'Jumbo',
    retailPrice: 72,
    wholesalePrice: 66,
    stock: 35,
    lowStockLevel: 8,
    active: true,
    description: 'Premium Jumbo size egg crates (30 eggs/crate)'
  }
];

class Store {
  constructor() {
    this.listeners = new Set();
    this.init();
  }

  init() {
    this.settings = this.load(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
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
    this.settings = { ...this.settings, ...newSettings };
    this.save(STORAGE_KEYS.SETTINGS, this.settings);
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

    this.products[idx] = { ...this.products[idx], ...updates };
    this.save(STORAGE_KEYS.PRODUCTS, this.products);
    this.notify('PRODUCTS_UPDATED', this.products);
    return true;
  }

  addProduct(productData) {
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

    this.products.push(newProd);
    this.save(STORAGE_KEYS.PRODUCTS, this.products);

    if (newProd.stock > 0) {
      this.logStockMovement({
        productId: newProd.id,
        productName: newProd.name,
        type: 'INITIAL_STOCK',
        cratesChanged: newProd.stock,
        previousStock: 0,
        newStock: newProd.stock,
        reason: 'New Product Added',
        cashier: this.activeCashier
      });
    }

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

    const previousStock = prod.stock;
    const newStock = previousStock + wholeCrates;

    this.updateProduct(productId, { stock: newStock });

    this.logStockMovement({
      productId,
      productName: prod.name,
      type: 'DELIVERY',
      cratesChanged: wholeCrates,
      previousStock,
      newStock,
      reason: supplierName ? `Delivery from ${supplierName}${notes ? ' - ' + notes : ''}` : (notes || 'Stock delivery received'),
      cashier: this.activeCashier
    });

    this.notify('STOCK_UPDATED', { productId, newStock });
    return { previousStock, newStock, cratesReceived: wholeCrates };
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

    const previousStock = prod.stock;
    const difference = targetStock - previousStock;
    if (difference === 0) return { previousStock, newStock: targetStock, difference: 0 };

    this.updateProduct(productId, { stock: targetStock });

    this.logStockMovement({
      productId,
      productName: prod.name,
      type: 'ADJUSTMENT',
      cratesChanged: difference,
      previousStock,
      newStock: targetStock,
      reason: reason.trim(),
      cashier: this.activeCashier
    });

    this.notify('STOCK_UPDATED', { productId, newStock: targetStock });
    return { previousStock, newStock: targetStock, difference };
  }

  logStockMovement(entry) {
    const logItem = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      ...entry
    };
    this.stockLogs.unshift(logItem); // Latest first
    this.save(STORAGE_KEYS.STOCK_LOGS, this.stockLogs);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
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
      if (prod.stock < requestedCrates) {
        throw new Error(`Insufficient stock for ${prod.name}: only ${prod.stock} crate(s) available, but ${requestedCrates} requested`);
      }
    }

    // 2. Decrement stock for each item & log movement
    const saleId = 'SALE-' + Date.now();
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const dailySeq = (this.sales.filter(s => s.timestamp.startsWith(new Date().toISOString().slice(0, 10))).length + 1).toString().padStart(3, '0');
    const saleNumber = `SF-${todayStr}-${dailySeq}`;

    for (const item of saleData.items) {
      const prod = this.getProductById(item.productId);
      const previousStock = prod.stock;
      const cratesDeducted = Math.floor(Number(item.crates));
      const newStock = previousStock - cratesDeducted;

      this.updateProduct(prod.id, { stock: newStock });

      this.logStockMovement({
        productId: prod.id,
        productName: prod.name,
        type: 'SALE',
        cratesChanged: -cratesDeducted,
        previousStock,
        newStock,
        reason: `Sale #${saleNumber}`,
        refId: saleNumber,
        cashier: this.activeCashier
      });
    }

    // 3. Assemble and persist the completed sale
    const completedSale = {
      id: saleId,
      saleNumber,
      timestamp: new Date().toISOString(),
      cashier: this.activeCashier,
      customerName: (saleData.customerName || '').trim(),
      customerPhone: (saleData.customerPhone || '').trim(),
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

    this.sales.unshift(completedSale);
    this.save(STORAGE_KEYS.SALES, this.sales);
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

  // Reset or seed demo data
  resetDemoData() {
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    localStorage.removeItem(STORAGE_KEYS.SALES);
    localStorage.removeItem(STORAGE_KEYS.STOCK_LOGS);
    this.init();
    this.notify('STATE_RESET', null);
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
