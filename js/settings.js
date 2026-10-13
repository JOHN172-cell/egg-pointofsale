/**
 * Sylcat Farms POS - Settings Controller
 * Manages farm business info, receipt header details,
 * bulk discount rules, and system data backups/resets.
 */

import { store } from './store.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export class SettingsController {
  constructor() {
    this.container = null;
  }

  init(container) {
    this.container = container;
    this.render();

    store.subscribe((event) => {
      if (event === 'SETTINGS_UPDATED') {
        this.render();
      }
    });
  }

  render() {
    if (!this.container) return;

    const s = store.getSettings();

    this.container.innerHTML = `
      <div class="settings-view-layout">
        <div class="settings-header">
          <h2>Business Settings & Configuration</h2>
          <p class="section-sub">Configure receipt headers, address, currency, and bulk discount rules.</p>
        </div>

        <form id="form-settings-update" class="settings-form-grid">
          <!-- Business & Receipts Card -->
          <div class="settings-card">
            <div class="settings-card-header">
              <h3>🌾 Business & Receipt Header</h3>
              <p>Appears at the top of every printed and shared receipt.</p>
            </div>

            <div class="form-group">
              <label for="set-biz-name" class="form-label">Business Name <span class="required-star">*</span></label>
              <input type="text" id="set-biz-name" class="form-control" value="${escapeHtml(s.businessName)}" required>
            </div>

            <div class="form-group">
              <label for="set-phone" class="form-label">Phone Number <span class="required-star">*</span></label>
              <input type="text" id="set-phone" class="form-control" value="${escapeHtml(s.phone)}" required>
            </div>

            <div class="form-group">
              <label for="set-address" class="form-label">Farm / Shop Address</label>
              <input type="text" id="set-address" class="form-control" placeholder="e.g. Accra, Ghana (Leave blank or fill in)" value="${escapeHtml(s.address || '')}">
              <small class="form-hint">Displayed on customer receipts if configured.</small>
            </div>

            <div class="form-row">
              <div class="form-group form-col">
                <label for="set-currency" class="form-label">Currency Code</label>
                <input type="text" id="set-currency" class="form-control" value="${escapeHtml(s.currency || 'GHS')}">
              </div>
              <div class="form-group form-col">
                <label for="set-curr-sym" class="form-label">Currency Symbol</label>
                <input type="text" id="set-curr-sym" class="form-control" value="${escapeHtml(s.currencySymbol || 'GH₵')}">
              </div>
            </div>

            <div class="form-group">
              <label for="set-cashier" class="form-label">Active Cashier Name</label>
              <input type="text" id="set-cashier" class="form-control" value="${escapeHtml(s.cashierName || 'Cashier 1')}">
            </div>
          </div>

          <!-- Egg Business Rules Card -->
          <div class="settings-card">
            <div class="settings-card-header">
              <h3>📦 Egg Packaging & Discount Rules</h3>
              <p>Strict rules for crate inventory and bulk discounts.</p>
            </div>

            <div class="form-group">
              <label class="form-label">Crate Packaging Rule</label>
              <div class="readonly-badge-box">
                <span class="badge-icon">📦</span>
                <div>
                  <strong>${Number(s.crateSize)} Eggs Per Crate</strong>
                  <p class="mb-0 text-muted">Full crates only policy strictly enforced across all sales and stock.</p>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-col">
                <label for="set-bulk-thresh" class="form-label">Bulk Discount Threshold (Crates)</label>
                <input type="number" id="set-bulk-thresh" class="form-control" min="1" step="1" value="${Number(s.bulkDiscountThreshold)}">
                <small class="form-hint">Minimum crates required to trigger discount (e.g. 10).</small>
              </div>
              <div class="form-group form-col">
                <label for="set-bulk-pct" class="form-label">Bulk Discount Percentage (%)</label>
                <input type="number" id="set-bulk-pct" class="form-control" min="0" max="100" step="any" value="${Number(s.bulkDiscountPercent)}">
                <small class="form-hint">Percentage off total (e.g. 10%).</small>
              </div>
            </div>

            <div class="settings-actions-top mt-4">
              <button type="submit" class="btn btn-primary btn-block">
                <span>💾 Save Settings Changes</span>
              </button>
            </div>

            <hr class="my-4">

            <!-- Local Data Management -->
            <div class="settings-card-header">
              <h3>💾 Local Data & Backup</h3>
            </div>
            <p class="form-hint">Products, stock, sales, and reports are saved only in this browser. They are not shared or synced to other computers. Export a backup regularly and keep it somewhere safe.</p>
            <div class="settings-backup-buttons">
              <button type="button" class="btn btn-secondary" id="btn-export-backup">
                <span>📥 Export Data (JSON)</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const form = this.container.querySelector('#form-settings-update');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bizName = this.container.querySelector('#set-biz-name').value.trim();
        const phone = this.container.querySelector('#set-phone').value.trim();
        const address = this.container.querySelector('#set-address').value.trim();
        const currency = this.container.querySelector('#set-currency').value.trim();
        const currencySymbol = this.container.querySelector('#set-curr-sym').value.trim();
        const cashierName = this.container.querySelector('#set-cashier').value.trim();
        const bulkThreshold = Number(this.container.querySelector('#set-bulk-thresh').value) || 10;
        const bulkPercent = Number(this.container.querySelector('#set-bulk-pct').value) || 10;

        try {
          await store.updateSettings({
            businessName: bizName,
            phone,
            address,
            currency,
            currencySymbol,
            cashierName,
            bulkDiscountThreshold: bulkThreshold,
            bulkDiscountPercent: bulkPercent
          });
          alert('Settings saved successfully!');
        } catch (error) {
          alert(error.message || 'Unable to save settings');
        }
      });
    }

    // Export Backup
    const btnExport = this.container.querySelector('#btn-export-backup');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const fullBackup = {
          settings: store.getSettings(),
          products: store.getProducts(true),
          sales: store.getSales(),
          stockLogs: store.getStockLogs(),
          exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sylcat-farms-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

  }
}
