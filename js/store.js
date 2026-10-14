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
    this.activeCashier = this.load(STORAGE_KEYS.CASHIER, this.settings.cashierName || 'Cashier 1');
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
    this.settings = { ...this.settings, ...newSettings };
    if (newSettings.cashierName !== undefined) {
      this.activeCashier = newSettings.cashierName || 'Cashier 1';
      this.save(STORAGE_KEYS.CASHIER, this.activeCashier);
    }
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

    const product = { ...this.products[idx], ...updates };
    this.products[idx] = product;
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
      this.stockLogs.unshift({
        id: `log-${Date.now()}-${id}`,
        timestamp: new Date().toISOString(),
        productId: id,
        productName: newProd.name,
        type: 'INITIAL_STOCK',
        cratesChanged: newProd.stock,
        previousStock: 0,
        newStock: newProd.stock,
        reason: 'Initial product stock',
        cashier: this.activeCashier
      });
      this.save(STORAGE_KEYS.STOCK_LOGS, this.stockLogs);
    }
    this.notify('PRODUCTS_UPDATED', this.products);
    return newProd;
  }

  toggleProductActive(id) {
    const prod = this.getProductById(id);
    if (!prod) return false;
    return this.updateProduct(id, { active: !prod.active });
  }

  deleteProduct(id) {
    const index = this.products.findIndex(product => product.id === id);
    if (index === -1) return false;
    const product = this.products[index];
    if (product.stock > 0) {
      throw new Error('This product still has stock. Sell or adjust its stock to zero before deleting it.');
    }
    if (this.sales.some(sale => sale.items?.some(item => item.productId === id))) {
      throw new Error('This product is in sales history and cannot be deleted. Deactivate it to keep past receipts and reports intact.');
    }
    this.products.splice(index, 1);
    this.stockLogs = this.stockLogs.filter(log => log.productId !== id);
    this.persistInventory();
    this.notify('PRODUCTS_UPDATED', this.products);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
    return true;
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
    const { previousStock, newStock } = entry;
    const delta = newStock - previousStock;
    if (!delta) return;
    const product = this.getProductById(entry.productId);
    if (!product || newStock < 0) throw new Error('Invalid stock movement.');
    product.stock = newStock;
    this.stockLogs.unshift({
      id: `log-${Date.now()}-${product.id}`,
      timestamp: new Date().toISOString(),
      productId: product.id,
      productName: product.name,
      type: entry.type,
      cratesChanged: delta,
      previousStock,
      newStock,
      reason: entry.reason,
      cashier: this.activeCashier
    });
    this.persistInventory();
    this.notify('STOCK_UPDATED', null);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
  }

  recordStockChange({ productId, quantity, isTarget, type, reason }) {
    const product = this.getProductById(productId);
    if (!product) throw new Error('Product not found');
    const previousStock = product.stock;
    const newStock = isTarget ? quantity : previousStock + quantity;
    if (newStock < 0) throw new Error('Stock cannot be negative');
    const difference = newStock - previousStock;
    if (difference === 0) return { previousStock, newStock, difference };
    product.stock = newStock;
    this.stockLogs.unshift({
      id: `log-${Date.now()}-${productId}`,
      timestamp: new Date().toISOString(),
      productId,
      productName: product.name,
      type,
      cratesChanged: difference,
      previousStock,
      newStock,
      reason,
      cashier: this.activeCashier
    });
    this.persistInventory();
    this.notify('STOCK_UPDATED', null);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
    return {
      previousStock, newStock, difference
    };
  }

  persistInventory() {
    this.save(STORAGE_KEYS.PRODUCTS, this.products);
    this.save(STORAGE_KEYS.STOCK_LOGS, this.stockLogs);
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

    const items = saleData.items.map(item => {
      const product = this.getProductById(item.productId);
      if (!product || product.stock < item.crates) {
        throw new Error(`Not enough stock for ${product?.name || item.name}.`);
      }
      const unitPrice = saleData.priceType === 'wholesale' ? product.wholesalePrice : product.retailPrice;
      return {
        productId: product.id,
        name: product.name,
        sizeLabel: product.sizeLabel,
        crates: item.crates,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.crates * 100) / 100
      };
    });
    const totalCrates = items.reduce((sum, item) => sum + item.crates, 0);
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
    const discountPercent = totalCrates >= this.settings.bulkDiscountThreshold
      ? Number(this.settings.bulkDiscountPercent) || 0 : 0;
    const discountAmount = Math.round(subtotal * discountPercent) / 100;
    const grandTotal = Math.round((subtotal - discountAmount) * 100) / 100;
    const paymentDetails = saleData.paymentDetails || {};
    const amountPaid = Math.min(grandTotal, Math.max(0, Number(paymentDetails.amountPaid) || 0));
    const balanceDue = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
    if (balanceDue > 0 && !(saleData.customerName || '').trim()) {
      throw new Error('Customer name is required when a balance is due.');
    }
    const cashier = (saleData.cashierName || this.activeCashier || '').trim();
    if (!cashier) {
      throw new Error('Cashier name is required to complete the sale.');
    }
    const timestamp = new Date().toISOString();
    const dayPrefix = timestamp.slice(0, 10).replaceAll('-', '');
    const dayCount = this.sales.filter(sale => sale.timestamp?.startsWith(timestamp.slice(0, 10))).length + 1;
    const completedSale = {
      id: crypto.randomUUID(),
      saleNumber: `SF-${dayPrefix}-${String(dayCount).padStart(3, '0')}`,
      timestamp,
      cashier,
      customerName: (saleData.customerName || '').trim(),
      customerPhone: (saleData.customerPhone || '').trim(),
      priceType: saleData.priceType,
      items,
      totalCrates,
      subtotal,
      discountPercent,
      discountAmount,
      grandTotal,
      paymentMethod: saleData.paymentMethod,
      paymentDetails: { ...paymentDetails, amountPaid, balanceDue },
      status: balanceDue > 0 ? 'COMPLETED' : 'PAID'
    };
    for (const item of items) {
      const product = this.getProductById(item.productId);
      const previousStock = product.stock;
      product.stock -= item.crates;
      this.stockLogs.unshift({
        id: `log-${Date.now()}-${item.productId}`,
        timestamp,
        productId: item.productId,
        productName: product.name,
        type: 'SALE',
        cratesChanged: -item.crates,
        previousStock,
        newStock: product.stock,
        reason: `Sale ${completedSale.saleNumber}`,
        refId: completedSale.saleNumber,
        cashier
      });
    }
    this.sales.unshift(completedSale);
    this.persistInventory();
    this.save(STORAGE_KEYS.SALES, this.sales);
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
    if (['PAID', 'VOIDED', 'REFUNDED'].includes(sale.status)) return 0;
    const balanceDue = Number(sale.paymentDetails?.balanceDue);
    if (Number.isFinite(balanceDue)) return Math.max(0, balanceDue);

    const method = sale.paymentDetails?.method || sale.paymentMethod;
    return method === 'Pay Later (Credit)' ? sale.grandTotal : 0;
  }

  /**
   * Marks an outstanding sale as PAID (settled).
   */
  markCreditPaid(saleNumber) {
    const sale = this.getSaleByNumber(saleNumber);
    if (!sale) return false;
    sale.status = 'PAID';
    sale.paymentDetails = {
      ...sale.paymentDetails,
      amountPaid: sale.grandTotal,
      balanceDue: 0,
      debtCollectedAt: new Date().toISOString()
    };
    this.save(STORAGE_KEYS.SALES, this.sales);
    this.notify('SALE_RECORDED', sale);
    return true;
  }

  refundSale(sale, amount, reason, isVoid = false, returnItems = []) {
    const storedSale = this.getSaleByNumber(sale.saleNumber);
    if (!storedSale) throw new Error('Sale not found.');
    const alreadyRefunded = Number(storedSale.refundedAmount) || 0;
    const remainingRefundable = Math.max(0, storedSale.grandTotal - alreadyRefunded);
    const refundAmount = isVoid ? remainingRefundable : Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0
      || refundAmount > remainingRefundable) {
      throw new Error('Refund amount must be positive and cannot exceed the remaining sale amount.');
    }
    if (!reason?.trim()) throw new Error('A refund reason is required.');
    if (isVoid) {
      const cratesByProduct = new Map();
      storedSale.items.forEach(item => cratesByProduct.set(item.productId,
        (cratesByProduct.get(item.productId) || 0) + item.crates - (item.cratesReturned || 0)));
      returnItems = [...cratesByProduct].map(([productId, crates]) => ({ productId, crates }));
    }
    const collectedAmount = Number(storedSale.paymentDetails?.amountPaid);
    const refundableCollected = Number.isFinite(collectedAmount) ? collectedAmount : storedSale.grandTotal;
    if (!isVoid && refundAmount > Math.max(0, refundableCollected - alreadyRefunded)) {
      throw new Error('A refund cannot exceed the amount already collected for this sale.');
    }
    for (const returned of returnItems) {
      const saleItem = storedSale.items.find(item => item.productId === returned.productId);
      const previouslyReturned = storedSale.items
        .filter(item => item.productId === returned.productId)
        .reduce((sum, item) => sum + (item.cratesReturned || 0), 0);
      const quantity = Number(returned.crates);
      if (!saleItem || !Number.isInteger(quantity) || quantity < 0
        || quantity + previouslyReturned > storedSale.items
          .filter(item => item.productId === returned.productId)
          .reduce((sum, item) => sum + item.crates, 0)) {
        throw new Error('Returned crate quantities must be whole crates within the sale quantity.');
      }
      if (quantity > 0 && !this.getProductById(returned.productId)) {
        throw new Error('A returned product no longer exists in inventory.');
      }
    }
    const timestamp = new Date().toISOString();
    for (const returned of returnItems) {
      if (returned.crates === 0) continue;
      const product = this.getProductById(returned.productId);
      const previousStock = product.stock;
      product.stock += returned.crates;
      const saleItems = storedSale.items.filter(item => item.productId === returned.productId);
      let remaining = returned.crates;
      for (const item of saleItems) {
        const available = item.crates - (item.cratesReturned || 0);
        const applied = Math.min(available, remaining);
        item.cratesReturned = (item.cratesReturned || 0) + applied;
        remaining -= applied;
        if (!remaining) break;
      }
      this.stockLogs.unshift({
        id: `log-${Date.now()}-${returned.productId}`,
        timestamp,
        productId: product.id,
        productName: product.name,
        type: 'REFUND',
        cratesChanged: returned.crates,
        previousStock,
        newStock: product.stock,
        reason: reason.trim(),
        refId: storedSale.saleNumber,
        cashier: this.activeCashier
      });
    }
    storedSale.refundedAmount = alreadyRefunded + refundAmount;
    storedSale.netTotal = Math.max(0, storedSale.grandTotal - storedSale.refundedAmount);
    storedSale.netCrates = storedSale.items.reduce((sum, item) =>
      sum + item.crates - (item.cratesReturned || 0), 0);
    storedSale.refundReason = reason.trim();
    if (isVoid) {
      storedSale.status = 'VOIDED';
      storedSale.paymentDetails.balanceDue = 0;
    } else {
      storedSale.status = storedSale.refundedAmount >= storedSale.grandTotal ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }
    this.persistInventory();
    this.save(STORAGE_KEYS.SALES, this.sales);
    this.notify('PRODUCTS_UPDATED', this.products);
    this.notify('STOCK_UPDATED', null);
    this.notify('STOCK_LOGS_UPDATED', this.stockLogs);
    this.notify('SALE_RECORDED', storedSale);
  }

  getLocalUser() {
    return {
      id: 'local-user',
      name: this.activeCashier || this.settings.cashierName || 'Cashier 1',
      role: 'admin'
    };
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

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function formatMoneyHtml(amount, customSymbol = null) {
  return escapeHtml(formatMoney(amount, customSymbol));
}
