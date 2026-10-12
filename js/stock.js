/**
 * Sylcat Farms POS - Stock Controller
 * Manages inventory strictly in whole crates, logs movements,
 * handles deliveries, low-stock alerts, and manual adjustments.
 */

import { store } from './store.js';

export class StockController {
  constructor() {
    this.container = null;
    this.selectedSizeFilter = 'all';
  }

  init(container) {
    this.container = container;
    this.render();

    store.subscribe((event) => {
      if (['STOCK_UPDATED', 'STOCK_LOGS_UPDATED', 'PRODUCTS_UPDATED', 'STATE_RESET'].includes(event)) {
        this.render();
      }
    });
  }

  render() {
    if (!this.container) return;

    const products = store.getProducts(true);
    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';
    const allLogs = store.getStockLogs();

    // Summary counters
    let totalCratesInStock = 0;
    let totalStockValue = 0;
    let lowStockCount = 0;

    products.forEach(p => {
      if (p.active) {
        totalCratesInStock += p.stock;
        totalStockValue += p.stock * p.retailPrice;
        if (p.stock <= p.lowStockLevel) {
          lowStockCount++;
        }
      }
    });

    // Filtered logs
    const filteredLogs = this.selectedSizeFilter === 'all'
      ? allLogs
      : allLogs.filter(l => l.productId === this.selectedSizeFilter);

    this.container.innerHTML = `
      <div class="stock-view-layout">
        <!-- Stock Top Overview Banner -->
        <div class="stock-overview-grid">
          <div class="stock-stat-card">
            <span class="stat-icon">📦</span>
            <div class="stat-info">
              <span class="stat-label">Total Crates in Stock</span>
              <span class="stat-value"><strong>${totalCratesInStock}</strong> Crates</span>
              <span class="stat-sub">(${totalCratesInStock * 30} eggs total)</span>
            </div>
          </div>

          <div class="stock-stat-card">
            <span class="stat-icon">💰</span>
            <div class="stat-info">
              <span class="stat-label">Estimated Stock Value (Retail)</span>
              <span class="stat-value"><strong>${currency}${totalStockValue.toFixed(2)}</strong></span>
              <span class="stat-sub">Across ${products.filter(p=>p.active).length} egg sizes</span>
            </div>
          </div>

          <div class="stock-stat-card ${lowStockCount > 0 ? 'card-alert' : ''}">
            <span class="stat-icon">${lowStockCount > 0 ? '⚠️' : '✅'}</span>
            <div class="stat-info">
              <span class="stat-label">Stock Health Status</span>
              <span class="stat-value">${lowStockCount > 0 ? `${lowStockCount} Sizes Low Stock` : 'All Stock Healthy'}</span>
              <span class="stat-sub">${lowStockCount > 0 ? 'Requires farm delivery' : 'Adequate supply'}</span>
            </div>
          </div>

          <div class="stock-action-card">
            <button type="button" class="btn btn-primary btn-block" id="btn-open-delivery-modal">
              <span>📥 Receive Farm Delivery</span>
            </button>
            <button type="button" class="btn btn-secondary btn-block" id="btn-open-adjust-modal">
              <span>⚙️ Manual Adjustment</span>
            </button>
          </div>
        </div>

        <!-- Crate Inventory Cards Per Size -->
        <div class="stock-cards-section">
          <div class="section-header">
            <h2>Current Egg Crates by Size</h2>
            <div class="stock-rule-pill">Strictly Whole Crates Only</div>
          </div>

          <div class="stock-sizes-grid">
            ${products.map(prod => {
              const isLow = prod.stock <= prod.lowStockLevel && prod.stock > 0;
              const isOut = prod.stock <= 0;
              const statusLabel = isOut ? 'Out of Stock' : (isLow ? 'Low Stock' : 'Good Stock');
              const statusClass = isOut ? 'status-out' : (isLow ? 'status-warning' : 'status-ok');

              return `
                <div class="stock-size-card ${isOut ? 'card-out' : isLow ? 'card-warning' : ''}">
                  <div class="size-card-header">
                    <div>
                      <h3 class="size-name">${prod.name}</h3>
                      <span class="size-badge">${prod.sizeLabel} Crate (30 eggs)</span>
                    </div>
                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                  </div>

                  <div class="size-crate-display">
                    <span class="crate-number">${prod.stock}</span>
                    <span class="crate-unit">Full Crates</span>
                  </div>

                  <div class="size-details-grid">
                    <div>
                      <span class="detail-label">Low Stock Alert:</span>
                      <span class="detail-val">≤ ${prod.lowStockLevel} crates</span>
                    </div>
                    <div>
                      <span class="detail-label">Total Eggs:</span>
                      <span class="detail-val">${prod.stock * 30} eggs</span>
                    </div>
                    <div>
                      <span class="detail-label">Retail / Crate:</span>
                      <span class="detail-val">${currency}${prod.retailPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span class="detail-label">Wholesale / Crate:</span>
                      <span class="detail-val">${currency}${prod.wholesalePrice.toFixed(2)}</span>
                    </div>
                  </div>

                  <div class="size-card-footer">
                    <button type="button" class="btn btn-sm btn-secondary btn-quick-delivery" data-id="${prod.id}">
                      + Add Delivery
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary btn-quick-adjust" data-id="${prod.id}">
                      Adjust
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Stock Movement History Table -->
        <div class="stock-history-section">
          <div class="section-header">
            <div>
              <h2>Stock Movement Audit Log</h2>
              <p class="section-sub">Every delivery, sale, and adjustment tracked with previous and new stock levels.</p>
            </div>
            <div class="stock-filter-wrap">
              <label for="stock-size-filter" class="form-label-inline">Filter Size:</label>
              <select id="stock-size-filter" class="form-control form-control-sm">
                <option value="all">All Egg Sizes</option>
                ${products.map(p => `<option value="${p.id}" ${this.selectedSizeFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Egg Size</th>
                  <th>Movement Type</th>
                  <th>Crates Delta</th>
                  <th>Prev Stock</th>
                  <th>New Stock</th>
                  <th>Reason / Reference</th>
                  <th>Cashier</th>
                </tr>
              </thead>
              <tbody>
                ${filteredLogs.length === 0 ? `
                  <tr>
                    <td colspan="8" class="text-center py-4">No stock movements recorded yet.</td>
                  </tr>
                ` : filteredLogs.slice(0, 50).map(log => {
                  const isPositive = log.cratesChanged > 0;
                  const typeBadgeClass = log.type === 'DELIVERY' ? 'badge-delivery' : (log.type === 'SALE' ? 'badge-sale' : 'badge-adjust');

                  return `
                    <tr>
                      <td>${new Date(log.timestamp).toLocaleString('en-GB')}</td>
                      <td><strong>${log.productName}</strong></td>
                      <td><span class="status-badge ${typeBadgeClass}">${log.type}</span></td>
                      <td class="${isPositive ? 'text-success font-bold' : 'text-danger font-bold'}">
                        ${isPositive ? '+' : ''}${log.cratesChanged} crates
                      </td>
                      <td>${log.previousStock}</td>
                      <td><strong>${log.newStock}</strong></td>
                      <td>${log.reason}</td>
                      <td>${log.cashier || 'System'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal: Receive Delivery -->
      <dialog id="modal-receive-delivery" class="app-dialog">
        <form method="dialog" class="dialog-content" id="form-receive-delivery">
          <div class="dialog-header">
            <h3>📥 Record Egg Delivery (Farm Inflow)</h3>
            <button type="button" class="modal-close-btn" data-close="modal-receive-delivery">×</button>
          </div>
          <div class="dialog-body">
            <p class="dialog-note">Record new full egg crates received into inventory from farm or supplier.</p>
            
            <div class="form-group">
              <label for="delivery-product-select" class="form-label">Egg Size <span class="required-star">*</span></label>
              <select id="delivery-product-select" class="form-control" required>
                ${products.filter(p=>p.active).map(p => `<option value="${p.id}">${p.name} (Current: ${p.stock} crates)</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="delivery-crates-input" class="form-label">Number of Whole Crates Received <span class="required-star">*</span></label>
              <input type="number" id="delivery-crates-input" class="form-control" min="1" step="1" placeholder="e.g. 50" required>
              <small class="form-hint">Strictly whole crates (30 eggs each). No fractions or loose trays.</small>
            </div>

            <div class="form-group">
              <label for="delivery-supplier-input" class="form-label">Farm / Supplier Name</label>
              <input type="text" id="delivery-supplier-input" class="form-control" placeholder="e.g. Sylcat Main Poultry Farm" value="Sylcat Farm Internal">
            </div>

            <div class="form-group">
              <label for="delivery-notes-input" class="form-label">Batch Notes / Reference</label>
              <input type="text" id="delivery-notes-input" class="form-control" placeholder="e.g. Morning harvest Batch #A4">
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn btn-secondary" data-close="modal-receive-delivery">Cancel</button>
            <button type="submit" class="btn btn-primary">Confirm & Update Stock</button>
          </div>
        </form>
      </dialog>

      <!-- Modal: Manual Adjustment -->
      <dialog id="modal-stock-adjust" class="app-dialog">
        <form method="dialog" class="dialog-content" id="form-stock-adjust">
          <div class="dialog-header">
            <h3>⚙️ Manual Stock Adjustment (Whole Crates)</h3>
            <button type="button" class="modal-close-btn" data-close="modal-stock-adjust">×</button>
          </div>
          <div class="dialog-body">
            <div class="alert alert-warning">
              <span>A <strong>mandatory reason</strong> is required for any manual stock overwrite.</span>
            </div>

            <div class="form-group">
              <label for="adjust-product-select" class="form-label">Egg Size <span class="required-star">*</span></label>
              <select id="adjust-product-select" class="form-control" required>
                ${products.map(p => `<option value="${p.id}">${p.name} (Current: ${p.stock} crates)</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="adjust-new-stock" class="form-label">Correct Whole Crate Count <span class="required-star">*</span></label>
              <input type="number" id="adjust-new-stock" class="form-control" min="0" step="1" placeholder="New accurate total in crates" required>
            </div>

            <div class="form-group">
              <label for="adjust-reason-input" class="form-label">Mandatory Reason for Adjustment <span class="required-star">*</span></label>
              <textarea id="adjust-reason-input" class="form-control" rows="2" placeholder="e.g. Physical inventory count discrepancy reconciliation" required></textarea>
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn btn-secondary" data-close="modal-stock-adjust">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Adjustment</button>
          </div>
        </form>
      </dialog>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Filter
    const filterSelect = this.container.querySelector('#stock-size-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', (e) => {
        this.selectedSizeFilter = e.target.value;
        this.render();
      });
    }

    // Modal triggers
    const deliveryModal = this.container.querySelector('#modal-receive-delivery');
    const adjustModal = this.container.querySelector('#modal-stock-adjust');

    const btnOpenDelivery = this.container.querySelector('#btn-open-delivery-modal');
    if (btnOpenDelivery && deliveryModal) {
      btnOpenDelivery.addEventListener('click', () => deliveryModal.showModal());
    }

    const btnOpenAdjust = this.container.querySelector('#btn-open-adjust-modal');
    if (btnOpenAdjust && adjustModal) {
      btnOpenAdjust.addEventListener('click', () => adjustModal.showModal());
    }

    // Quick buttons from cards
    this.container.querySelectorAll('.btn-quick-delivery').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const sel = this.container.querySelector('#delivery-product-select');
        if (sel) sel.value = id;
        if (deliveryModal) deliveryModal.showModal();
      });
    });

    this.container.querySelectorAll('.btn-quick-adjust').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const sel = this.container.querySelector('#adjust-product-select');
        if (sel) {
          sel.value = id;
          const prod = store.getProductById(id);
          const inp = this.container.querySelector('#adjust-new-stock');
          if (inp && prod) inp.value = prod.stock;
        }
        if (adjustModal) adjustModal.showModal();
      });
    });

    // Close buttons
    this.container.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mId = btn.getAttribute('data-close');
        const m = this.container.querySelector(`#${mId}`);
        if (m) m.close();
      });
    });

    // Form: Delivery Submit
    const formDelivery = this.container.querySelector('#form-receive-delivery');
    if (formDelivery) {
      formDelivery.addEventListener('submit', (e) => {
        e.preventDefault();
        const pId = this.container.querySelector('#delivery-product-select').value;
        const crates = this.container.querySelector('#delivery-crates-input').value;
        const supplier = this.container.querySelector('#delivery-supplier-input').value;
        const notes = this.container.querySelector('#delivery-notes-input').value;

        try {
          store.recordDelivery({
            productId: pId,
            cratesReceived: crates,
            supplierName: supplier,
            notes
          });
          deliveryModal.close();
          formDelivery.reset();
        } catch (err) {
          alert(err.message || 'Error recording delivery');
        }
      });
    }

    // Form: Adjust Submit
    const formAdjust = this.container.querySelector('#form-stock-adjust');
    if (formAdjust) {
      formAdjust.addEventListener('submit', (e) => {
        e.preventDefault();
        const pId = this.container.querySelector('#adjust-product-select').value;
        const targetStock = this.container.querySelector('#adjust-new-stock').value;
        const reason = this.container.querySelector('#adjust-reason-input').value;

        try {
          store.adjustStock({
            productId: pId,
            newStockCount: targetStock,
            reason
          });
          adjustModal.close();
          formAdjust.reset();
        } catch (err) {
          alert(err.message || 'Error saving adjustment');
        }
      });
    }
  }
}
