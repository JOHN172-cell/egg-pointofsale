/**
 * Sylcat Farms POS - Products & Pricing Controller
 * Allows owner to configure egg size products, retail and wholesale
 * prices per crate, low stock warning thresholds, and active status.
 */

import { store, formatMoneyHtml, escapeHtml } from './store.js';

export class ProductsController {
  constructor() {
    this.container = null;
    this.editingProductId = null;
  }

  init(container) {
    this.container = container;
    this.render();

    store.subscribe((event) => {
      if (['PRODUCTS_UPDATED', 'SETTINGS_UPDATED', 'STATE_RESET', 'REMOTE_STATE_UPDATED'].includes(event)) {
        this.render();
      }
    });
  }

  render() {
    if (!this.container) return;

    const products = store.getProducts(true); // include inactive
    const settings = store.getSettings();
    const currency = escapeHtml(settings.currencySymbol || 'GH₵');

    this.container.innerHTML = `
      <div class="products-view-layout">
        <!-- Top Toolbar -->
        <div class="products-toolbar">
          <div>
            <h2>Egg Products & Crate Pricing</h2>
            <p class="section-sub">Configure wholesale and retail rates per crate, minimum crate alert levels, and product availability.</p>
          </div>
          <button type="button" class="btn btn-primary" id="btn-add-product">
            <span>+ Add New Egg Size</span>
          </button>
        </div>

        <!-- Products Table -->
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Egg Size Product</th>
                <th>Retail Price / Crate</th>
                <th>Wholesale Price / Crate</th>
                <th>Current Stock</th>
                <th>Low-Stock Alert</th>
                <th>Packaging</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(prod => {
                return `
                  <tr class="${!prod.active ? 'row-inactive' : ''}">
                    <td>
                      <span class="status-badge ${prod.active ? 'status-ok' : 'status-out'}">
                        ${prod.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td>
                      <div class="prod-td-title">
                        <strong>${escapeHtml(prod.name)}</strong>
                        <small class="prod-td-desc">${escapeHtml(prod.description || `${prod.sizeLabel} crate`)}</small>
                      </div>
                    </td>
                    <td>
                      <strong class="price-val">${formatMoneyHtml(prod.retailPrice)}</strong>
                    </td>
                    <td>
                      <span class="price-val-wholesale">${formatMoneyHtml(prod.wholesalePrice)}</span>
                    </td>
                    <td>
                      <strong>${prod.stock}</strong> crates
                    </td>
                    <td>
                      ≤ ${prod.lowStockLevel} crates
                    </td>
                    <td>
                      <span class="packaging-pill">30 eggs/crate</span>
                    </td>
                    <td class="text-right">
                      <div class="btn-group-sm">
                        <button type="button" class="btn btn-sm btn-secondary btn-edit-product" data-id="${escapeHtml(prod.id)}">
                          Edit
                        </button>
                        <button type="button" class="btn btn-sm ${prod.active ? 'btn-outline-danger' : 'btn-outline-success'} btn-toggle-active" data-id="${escapeHtml(prod.id)}">
                          ${prod.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add/Edit Product Dialog -->
      <dialog id="modal-product-form" class="app-dialog">
        <form method="dialog" class="dialog-content" id="form-product-edit">
          <div class="dialog-header">
            <h3 id="modal-product-title">Edit Egg Size Product</h3>
            <button type="button" class="modal-close-btn" data-close="modal-product-form">×</button>
          </div>
          <div class="dialog-body">
            <input type="hidden" id="prod-form-id">

            <div class="form-row">
              <div class="form-group form-col">
                <label for="prod-form-name" class="form-label">Product Name <span class="required-star">*</span></label>
                <input type="text" id="prod-form-name" class="form-control" placeholder="e.g. Medium Eggs" required>
              </div>
              <div class="form-group form-col">
                <label for="prod-form-size" class="form-label">Size Label <span class="required-star">*</span></label>
                <input type="text" id="prod-form-size" class="form-control" placeholder="e.g. Medium, Extra Large" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-col">
                <label for="prod-form-retail" class="form-label">Retail Price / Crate (${currency}) <span class="required-star">*</span></label>
                <input type="number" id="prod-form-retail" class="form-control" min="0" step="any" required>
              </div>
              <div class="form-group form-col">
                <label for="prod-form-wholesale" class="form-label">Wholesale Price / Crate (${currency}) <span class="required-star">*</span></label>
                <input type="number" id="prod-form-wholesale" class="form-control" min="0" step="any" required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-col">
                <label for="prod-form-lowstock" class="form-label">Low Stock Alert Level (Crates) <span class="required-star">*</span></label>
                <input type="number" id="prod-form-lowstock" class="form-control" min="1" step="1" required>
                <small class="form-hint">Triggers warning when stock drops to or below this level.</small>
              </div>
              <div class="form-group form-col" id="prod-form-stock-group">
                <label for="prod-form-stock" class="form-label">Initial Whole Crates in Stock</label>
                <input type="number" id="prod-form-stock" class="form-control" min="0" step="1" value="0">
              </div>
            </div>

            <div class="form-group">
              <label for="prod-form-desc" class="form-label">Description / Packaging Notes</label>
              <input type="text" id="prod-form-desc" class="form-control" placeholder="e.g. Graded farm-fresh eggs in 30-egg crate">
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="btn btn-secondary" data-close="modal-product-form">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-save-product">Save Product</button>
          </div>
        </form>
      </dialog>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const modal = this.container.querySelector('#modal-product-form');
    const form = this.container.querySelector('#form-product-edit');
    const modalTitle = this.container.querySelector('#modal-product-title');

    // Add Product button
    const btnAdd = this.container.querySelector('#btn-add-product');
    if (btnAdd && modal) {
      btnAdd.addEventListener('click', () => {
        this.editingProductId = null;
        modalTitle.textContent = 'Add New Egg Size Product';
        form.reset();
        this.container.querySelector('#prod-form-id').value = '';
        this.container.querySelector('#prod-form-stock-group').style.display = 'block';
        modal.showModal();
      });
    }

    // Edit Product buttons
    this.container.querySelectorAll('.btn-edit-product').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const prod = store.getProductById(id);
        if (!prod) return;

        this.editingProductId = id;
        modalTitle.textContent = `Edit Product: ${prod.name}`;
        this.container.querySelector('#prod-form-id').value = prod.id;
        this.container.querySelector('#prod-form-name').value = prod.name;
        this.container.querySelector('#prod-form-size').value = prod.sizeLabel;
        this.container.querySelector('#prod-form-retail').value = prod.retailPrice;
        this.container.querySelector('#prod-form-wholesale').value = prod.wholesalePrice;
        this.container.querySelector('#prod-form-lowstock').value = prod.lowStockLevel;
        this.container.querySelector('#prod-form-desc').value = prod.description || '';
        this.container.querySelector('#prod-form-stock-group').style.display = 'none';

        modal.showModal();
      });
    });

    // Toggle Active / Deactivate
    this.container.querySelectorAll('.btn-toggle-active').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await store.toggleProductActive(id);
        } catch (err) {
          alert(err.message || 'Unable to update product');
        }
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

    // Save Form
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = this.container.querySelector('#prod-form-id').value;
        const name = this.container.querySelector('#prod-form-name').value.trim();
        const sizeLabel = this.container.querySelector('#prod-form-size').value.trim();
        const retailPrice = Number(this.container.querySelector('#prod-form-retail').value);
        const wholesalePrice = Number(this.container.querySelector('#prod-form-wholesale').value);
        const lowStockLevel = Number(this.container.querySelector('#prod-form-lowstock').value);
        const description = this.container.querySelector('#prod-form-desc').value.trim();

        try {
          if (id) {
            await store.updateProduct(id, {
              name,
              sizeLabel,
              retailPrice,
              wholesalePrice,
              lowStockLevel,
              description
            });
          } else {
            const initialStock = Number(this.container.querySelector('#prod-form-stock').value) || 0;
            await store.addProduct({
              name,
              sizeLabel,
              retailPrice,
              wholesalePrice,
              lowStockLevel,
              stock: initialStock,
              description
            });
          }
          modal.close();
        } catch (err) {
          alert(err.message || 'Unable to save product');
        }
      });
    }
  }
}
