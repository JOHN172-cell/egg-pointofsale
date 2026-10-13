/**
 * Sylcat Farms POS - Settings Controller
 * Manages farm business info, receipt header details,
 * bulk discount rules, and system data backups/resets.
 */

import { store } from './store.js';
import { api } from './api.js';

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
      if (['SETTINGS_UPDATED', 'STATE_RESET', 'REMOTE_STATE_UPDATED'].includes(event)) {
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

            <!-- Data Management -->
            <div class="settings-card-header">
              <h3>💾 Data Backup & Migration</h3>
            </div>
            <p class="form-hint">Export downloads a copy. Migration imports data only when the normalized shared database has no products or sales. It never clears existing local or shared records.</p>
            <div class="settings-backup-buttons">
              <button type="button" class="btn btn-secondary" id="btn-export-backup">
                <span>📥 Export Data (JSON)</span>
              </button>
              <button type="button" class="btn btn-secondary" id="btn-migrate-local">
                <span>📤 Migrate This Browser's Local Data</span>
              </button>
              <button type="button" class="btn btn-secondary" id="btn-migrate-legacy">
                <span>📤 Migrate Older Shared Database</span>
              </button>
            </div>

            <hr class="my-4">

            <div class="settings-card-header">
              <h3>👥 Staff Accounts</h3>
              <p>Only administrators can create accounts. Managers can view the staff list and manage cashier access.</p>
            </div>
            <div class="form-row">
              <div class="form-group form-col">
                <label for="staff-name" class="form-label">Staff Name</label>
                <input type="text" id="staff-name" class="form-control" autocomplete="name">
              </div>
              <div class="form-group form-col">
                <label for="staff-email" class="form-label">Email</label>
                <input type="email" id="staff-email" class="form-control" autocomplete="email">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group form-col">
                <label for="staff-password" class="form-label">Temporary Password (12+ characters)</label>
                <input type="password" id="staff-password" class="form-control" autocomplete="new-password" minlength="12">
              </div>
              <div class="form-group form-col">
                <label for="staff-role" class="form-label">Role</label>
                <select id="staff-role" class="form-control">
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
            <button type="button" class="btn btn-secondary" id="btn-create-staff">Create Staff Account</button>
            <div id="staff-account-list" class="staff-account-list" aria-live="polite"></div>

            <hr class="my-4">
            <div class="settings-card-header">
              <h3>🧾 Administrative Audit Log</h3>
              <p>Price, stock, settings, sale, refund and staff-account actions.</p>
            </div>
            <div id="audit-log-list" class="audit-log-list" aria-live="polite">Loading audit history…</div>
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

    const migrateButton = this.container.querySelector('#btn-migrate-local');
    if (migrateButton) {
      migrateButton.addEventListener('click', async () => {
        if (!confirm('Migrate this browser’s saved POS data into the shared database? The migration will stop without changing either copy if shared products or sales already exist.')) return;
        try {
          const result = await store.migrateLocalData();
          alert(result.message);
        } catch (error) {
          alert(error.message || 'Unable to migrate local data');
        }
        const legacyButton = this.container.querySelector('#btn-migrate-legacy');
        if (legacyButton) {
          if (document.documentElement.dataset.role !== 'admin') {
            legacyButton.hidden = true;
          } else {
            legacyButton.addEventListener('click', async () => {
              if (!confirm('Import the previous POS data tables into the new secure tables? The shared database must not yet contain normalized products or sales. Legacy rows will be retained, not deleted.')) return;
              try {
                const result = await api.post('/api/migrate-legacy', {});
                await store.refreshSharedData();
                alert(result.message);
              } catch (error) {
                alert(error.message || 'Unable to migrate the older shared database');
              }
            });
          }
        }
      });
    }

    this.bindStaffManagement();
    this.bindAuditLog();
  }

  async bindAuditLog() {
    const list = this.container.querySelector('#audit-log-list');
    if (!list) return;
    try {
      const { entries } = await api.get('/api/audit');
      list.innerHTML = entries.length ? entries.map(entry => `
        <div class="audit-log-row">
          <time>${escapeHtml(new Date(entry.created_at).toLocaleString())}</time>
          <strong>${escapeHtml(entry.action)}</strong>
          <span>${escapeHtml(entry.actor?.display_name || 'Staff')} · ${escapeHtml(entry.entity_type)} ${escapeHtml(entry.entity_id)}</span>
        </div>`).join('') : '<p>No administrative changes recorded.</p>';
    } catch (error) {
      list.textContent = error.message || 'Unable to load the audit log.';
    }
  }

  async bindStaffManagement() {
    const list = this.container.querySelector('#staff-account-list');
    const createButton = this.container.querySelector('#btn-create-staff');
    const role = document.documentElement.dataset.role;
    if (role === 'cashier') {
      this.container.querySelectorAll('#staff-name,#staff-email,#staff-password,#staff-role,#btn-create-staff')
        .forEach(element => element.closest('.form-group')?.setAttribute('hidden', ''));
      return;
    }
    if (role === 'manager') {
      const roleSelect = this.container.querySelector('#staff-role');
      roleSelect.innerHTML = '<option value="cashier">Cashier</option>';
      createButton.hidden = true;
      this.container.querySelector('#staff-password').closest('.form-group').hidden = true;
      this.container.querySelector('#staff-role').closest('.form-group').hidden = true;
    }
    const loadStaff = async () => {
      const result = await api.get('/api/users');
      list.innerHTML = result.users.map(staff => `
        <div class="staff-account-row">
          <span><strong>${escapeHtml(staff.display_name)}</strong> · ${escapeHtml(staff.role)}${staff.active ? '' : ' · Deactivated'}</span>
          ${staff.role !== 'admin' ? `<button type="button" class="btn btn-sm btn-secondary" data-staff-id="${escapeHtml(staff.id)}" data-active="${staff.active}">${staff.active ? 'Deactivate' : 'Reactivate'}</button>` : ''}
        </div>`).join('');
      list.querySelectorAll('[data-staff-id]').forEach(button => button.addEventListener('click', async () => {
        try {
          await api.patch('/api/users', { id: button.dataset.staffId, active: button.dataset.active !== 'true' });
          await loadStaff();
        } catch (error) { alert(error.message); }
      }));
    };
    try {
      await loadStaff();
    } catch (error) {
      list.textContent = error.message;
    }
    createButton.addEventListener('click', async () => {
      const body = {
        displayName: this.container.querySelector('#staff-name').value.trim(),
        email: this.container.querySelector('#staff-email').value.trim(),
        password: this.container.querySelector('#staff-password').value,
        role: this.container.querySelector('#staff-role').value
      };
      try {
        await api.post('/api/users', body);
        this.container.querySelector('#staff-password').value = '';
        await loadStaff();
        alert('Staff account created. Share the credentials with the staff member securely.');
      } catch (error) { alert(error.message); }
    });
  }
}
