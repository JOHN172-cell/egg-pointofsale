/**
 * Sylcat Farms POS - Payment Controller
 * Handles Cash (with change calc), Mobile Money, Card, Pay Later (Credit),
 * and Split Payments across two methods.
 */

import { store, formatMoney } from './store.js';

export class PaymentModal {
  constructor(modalElement, onSaleCompleted) {
    this.modal = modalElement;
    this.onSaleCompleted = onSaleCompleted;
    this.currentSaleData = null;
    this.activeMethod = 'cash'; // 'cash', 'momo', 'card', 'credit', 'split'

    // Cash state
    this.amountTendered = 0;

    // MoMo state
    this.momoNetwork = 'MTN Mobile Money';
    this.momoRef = '';
    this.momoPhone = '';

    // Card state
    this.cardRef = '';

    // Credit state
    this.creditDueDate = '';
    this.creditNotes = '';

    // Split state
    this.splitMethod1 = 'cash';
    this.splitAmount1 = 0;
    this.splitMethod2 = 'momo';
    this.splitAmount2 = 0;
    this.splitMomoNetwork = 'MTN Mobile Money';

    this.init();
  }

  init() {
    // Light dismiss / backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    const closeBtn = this.modal.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  open(saleData) {
    this.currentSaleData = { ...saleData, idempotencyKey: crypto.randomUUID() };
    this.activeMethod = 'cash';
    this.amountTendered = saleData.grandTotal;

    // Reset split amounts
    const half = Math.round((saleData.grandTotal / 2) * 100) / 100;
    this.splitAmount1 = half;
    this.splitAmount2 = Math.round((saleData.grandTotal - half) * 100) / 100;

    this.render();
    this.modal.showModal();
  }

  close() {
    this.modal.close();
  }

  render() {
    const data = this.currentSaleData;
    if (!data) return;

    const modalBody = this.modal.querySelector('.modal-body');
    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';
    const total = data.grandTotal;

    modalBody.innerHTML = `
      <div class="payment-modal-layout">
        <!-- Header Total Display -->
        <div class="payment-total-banner">
          <span class="payment-total-label">AMOUNT PAYABLE</span>
          <div class="payment-total-figure">
            <span class="currency-sym">${currency}</span>
            <span class="total-digits">${total.toFixed(2)}</span>
          </div>
          <div class="payment-crate-count">
            Total Crates: <strong>${data.totalCrates} Crate${data.totalCrates > 1 ? 's' : ''}</strong> (${data.priceType.toUpperCase()} PRICE)
          </div>
        </div>

        <!-- Method Tabs -->
        <div class="payment-method-tabs" role="tablist" aria-label="Payment Methods">
          <button type="button" class="pay-method-tab ${this.activeMethod === 'cash' ? 'active' : ''}" data-method="cash">
            <span class="method-icon">💵</span>
            <span class="method-text">Cash</span>
          </button>
          <button type="button" class="pay-method-tab ${this.activeMethod === 'momo' ? 'active' : ''}" data-method="momo">
            <span class="method-icon">📱</span>
            <span class="method-text">Mobile Money</span>
          </button>
          <button type="button" class="pay-method-tab ${this.activeMethod === 'card' ? 'active' : ''}" data-method="card">
            <span class="method-icon">💳</span>
            <span class="method-text">Card</span>
          </button>
          <button type="button" class="pay-method-tab ${this.activeMethod === 'credit' ? 'active' : ''}" data-method="credit">
            <span class="method-icon">⏳</span>
            <span class="method-text">Pay Later (Credit)</span>
          </button>
          <button type="button" class="pay-method-tab ${this.activeMethod === 'split' ? 'active' : ''}" data-method="split">
            <span class="method-icon">🔀</span>
            <span class="method-text">Split</span>
          </button>
        </div>

        <!-- Method Detail Panels -->
        <div class="payment-method-content">
          ${this.renderMethodForm(total, currency)}
        </div>

        <!-- Error display -->
        <div class="payment-error-msg" id="payment-error-box" style="display: none;"></div>

        <!-- Confirm Action -->
        <div class="payment-modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-payment">Cancel</button>
          <button type="button" class="btn btn-primary btn-complete-sale" id="btn-confirm-payment">
            <span>Complete Sale & Print Receipt</span>
            <span class="arrow-icon">→</span>
          </button>
        </div>
      </div>
    `;

    this.bindEvents(total);
  }

  renderMethodForm(total, currency) {
    if (this.activeMethod === 'cash') {
      const change = Math.max(0, this.amountTendered - total);
      const underpaid = this.amountTendered < total;

      return `
        <div class="pay-panel-cash">
          <div class="cash-input-row">
            <label for="cash-tendered-input" class="form-label">Amount Tendered (${currency})</label>
            <div class="input-with-symbol">
              <span class="input-sym">${currency}</span>
              <input type="number" 
                id="cash-tendered-input" 
                class="form-control form-control-lg cash-input" 
                value="${this.amountTendered}" 
                min="0" 
                step="any">
            </div>
          </div>

          <!-- Quick Cash Denominations -->
          <div class="cash-quick-buttons">
            <button type="button" class="btn-denom" data-amount="${total}">Exact (${formatMoney(total)})</button>
            <button type="button" class="btn-denom" data-amount="${Math.ceil(total / 50) * 50}">${formatMoney(Math.ceil(total / 50) * 50)}</button>
            <button type="button" class="btn-denom" data-amount="${Math.ceil(total / 100) * 100}">${formatMoney(Math.ceil(total / 100) * 100)}</button>
            <button type="button" class="btn-denom" data-amount="${Math.ceil(total / 200) * 200 || 200}">${formatMoney(Math.ceil(total / 200) * 200 || 200)}</button>
            <button type="button" class="btn-denom" data-add="50">+50</button>
            <button type="button" class="btn-denom" data-add="100">+100</button>
          </div>

          <!-- Change Box -->
          <div class="cash-change-display ${underpaid ? 'is-underpaid' : 'is-sufficient'}">
            <div class="change-label">${underpaid ? 'Amount Short (Remaining Due)' : 'Change to Customer'}</div>
            <div class="change-amount">
              ${underpaid ? formatMoney(total - this.amountTendered) : formatMoney(change)}
            </div>
            <div class="change-status-tag">
              ${underpaid ? '<span class="status-badge status-out">Underpaid</span>' : '<span class="status-badge status-ok">Sufficient Cash</span>'}
            </div>
          </div>
          <div class="form-group cash-customer-field" id="cash-customer-wrap" ${underpaid ? '' : 'hidden'}>
            <label for="cash-customer-name" class="form-label">Customer Name <span class="required-star">*</span></label>
            <input type="text" id="cash-customer-name" class="form-control"
              placeholder="Full Customer or Business Name"
              value="${this.currentSaleData.customerName || ''}" ${underpaid ? 'required' : ''}>
          </div>
        </div>
      `;
    }

    if (this.activeMethod === 'momo') {
      return `
        <div class="pay-panel-momo">
          <div class="form-group">
            <label class="form-label">Mobile Money Network</label>
            <div class="pos-momo-network-options">
              <label class="momo-radio-pill ${this.momoNetwork === 'MTN Mobile Money' ? 'selected' : ''}">
                <input type="radio" name="momo-net" value="MTN Mobile Money" ${this.momoNetwork === 'MTN Mobile Money' ? 'checked' : ''}>
                <span>🟡 MTN MoMo</span>
              </label>
              <label class="momo-radio-pill ${this.momoNetwork === 'Telecel Cash' ? 'selected' : ''}">
                <input type="radio" name="momo-net" value="Telecel Cash" ${this.momoNetwork === 'Telecel Cash' ? 'checked' : ''}>
                <span>🔴 Telecel Cash</span>
              </label>
              <label class="momo-radio-pill ${this.momoNetwork === 'AirtelTigo Money' ? 'selected' : ''}">
                <input type="radio" name="momo-net" value="AirtelTigo Money" ${this.momoNetwork === 'AirtelTigo Money' ? 'checked' : ''}>
                <span>🔵 AT Money</span>
              </label>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group form-col">
              <label for="momo-phone" class="form-label">Customer MoMo Number (Optional)</label>
              <input type="tel" id="momo-phone" class="form-control" placeholder="e.g. 0244123456" value="${this.momoPhone}">
            </div>
            <div class="form-group form-col">
              <label for="momo-ref" class="form-label">Transaction ID / Reference (Optional)</label>
              <input type="text" id="momo-ref" class="form-control" placeholder="e.g. 1982736452" value="${this.momoRef}">
            </div>
          </div>

          <div class="momo-summary-box">
            <span>Direct prompt: Ensure customer has confirmed transaction of <strong>${formatMoney(total)}</strong> to Sylcat Farms.</span>
          </div>
        </div>
      `;
    }

    if (this.activeMethod === 'card') {
      return `
        <div class="pay-panel-card">
          <div class="card-prompt-box">
            <div class="card-icon-big">💳</div>
            <p>Insert or Tap customer card on POS terminal for <strong>${formatMoney(total)}</strong></p>
          </div>
          <div class="form-group">
            <label for="card-ref" class="form-label">Approval Code / Slip Ref (Optional)</label>
            <input type="text" id="card-ref" class="form-control" placeholder="e.g. APP-8849" value="${this.cardRef}">
          </div>
        </div>
      `;
    }

    if (this.activeMethod === 'credit') {
      return `
        <div class="pay-panel-credit">
          <div class="alert alert-warning">
            <span class="alert-icon">⚠️</span>
            <span><strong>Pay Later (Credit Sale):</strong> This transaction will be recorded with an outstanding balance of <strong>${formatMoney(total)}</strong>.</span>
          </div>

          <div class="form-group">
            <label for="credit-customer-name" class="form-label">Customer Name <span class="required-star">*</span></label>
            <input type="text" 
              id="credit-customer-name" 
              class="form-control" 
              placeholder="Full Customer or Business Name" 
              value="${this.currentSaleData.customerName || ''}" required>
          </div>

          <div class="form-row">
            <div class="form-group form-col">
              <label for="credit-due-date" class="form-label">Expected Payment Due Date</label>
              <input type="date" id="credit-due-date" class="form-control" value="${this.creditDueDate}">
            </div>
            <div class="form-group form-col">
              <label for="credit-notes" class="form-label">Credit Notes / Agreement</label>
              <input type="text" id="credit-notes" class="form-control" placeholder="e.g. Agreed to pay next Friday" value="${this.creditNotes}">
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeMethod === 'split') {
      return `
        <div class="pay-panel-split">
          <p class="split-instruction">Divide the total payment of <strong>${formatMoney(total)}</strong> across two payment methods.</p>
          ${this.splitMethod2 === 'credit' ? `
            <div class="alert alert-warning">
              <span class="alert-icon">⚠️</span>
              <span>Part 2 is the amount the named customer will still owe.</span>
            </div>
          ` : ''}

          <!-- Split Part 1 -->
          <div class="split-row-box">
            <div class="split-header">Part 1</div>
            <div class="split-controls">
              <select id="split-method-1" class="form-control">
                <option value="cash" ${this.splitMethod1 === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="momo" ${this.splitMethod1 === 'momo' ? 'selected' : ''}>Mobile Money</option>
                <option value="card" ${this.splitMethod1 === 'card' ? 'selected' : ''}>Card</option>
              </select>
              <div class="input-with-symbol">
                <span class="input-sym">${currency}</span>
                <input type="number" id="split-amount-1" class="form-control" value="${this.splitAmount1}" step="any">
              </div>
            </div>
          </div>

          <!-- Split Part 2 -->
          <div class="split-row-box">
            <div class="split-header">Part 2</div>
            <div class="split-controls">
              <select id="split-method-2" class="form-control">
                <option value="momo" ${this.splitMethod2 === 'momo' ? 'selected' : ''}>Mobile Money</option>
                <option value="cash" ${this.splitMethod2 === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="card" ${this.splitMethod2 === 'card' ? 'selected' : ''}>Card</option>
                <option value="credit" ${this.splitMethod2 === 'credit' ? 'selected' : ''}>Pay Later (Credit)</option>
              </select>
              <div class="input-with-symbol">
                <span class="input-sym">${currency}</span>
                <input type="number" id="split-amount-2" class="form-control" value="${this.splitAmount2}" step="any">
              </div>
            </div>
          </div>

          <div class="split-balance-bar">
            <span>Total Combined: <strong>${formatMoney(Number(this.splitAmount1) + Number(this.splitAmount2))}</strong></span>
            <span>Difference: <strong>${formatMoney(total - (Number(this.splitAmount1) + Number(this.splitAmount2)))}</strong></span>
          </div>
          ${this.splitMethod2 === 'credit' ? `
            <div class="form-group">
              <label for="split-credit-customer-name" class="form-label">Customer Name <span class="required-star">*</span></label>
              <input type="text" id="split-credit-customer-name" class="form-control"
                placeholder="Full Customer or Business Name"
                value="${this.currentSaleData.customerName || ''}" required>
            </div>
          ` : ''}
        </div>
      `;
    }

    return '';
  }

  bindEvents(total) {
    // Switch payment tabs
    this.modal.querySelectorAll('.pay-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeMethod = tab.getAttribute('data-method');
        this.render();
      });
    });

    // Cash Handlers
    const cashInput = this.modal.querySelector('#cash-tendered-input');
    if (cashInput) {
      cashInput.addEventListener('input', (e) => {
        this.amountTendered = Math.max(0, Number(e.target.value) || 0);
        this.updateCashChange(total);
      });
    }

    this.modal.querySelectorAll('.btn-denom').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('data-amount')) {
          this.amountTendered = Number(btn.getAttribute('data-amount'));
        } else if (btn.hasAttribute('data-add')) {
          this.amountTendered = (Number(this.amountTendered) || total) + Number(btn.getAttribute('data-add'));
        }
        this.render();
      });
    });

    // MoMo Radio buttons
    this.modal.querySelectorAll('input[name="momo-net"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.momoNetwork = e.target.value;
      });
    });

    const momoPhoneInput = this.modal.querySelector('#momo-phone');
    if (momoPhoneInput) {
      momoPhoneInput.addEventListener('input', (e) => {
        this.momoPhone = e.target.value;
      });
    }

    const momoRefInput = this.modal.querySelector('#momo-ref');
    if (momoRefInput) {
      momoRefInput.addEventListener('input', (e) => {
        this.momoRef = e.target.value;
      });
    }

    // Split amount syncing
    const splitAmt1 = this.modal.querySelector('#split-amount-1');
    const splitAmt2 = this.modal.querySelector('#split-amount-2');
    if (splitAmt1 && splitAmt2) {
      splitAmt1.addEventListener('input', (e) => {
        this.splitAmount1 = Number(e.target.value) || 0;
        this.splitAmount2 = Math.max(0, Math.round((total - this.splitAmount1) * 100) / 100);
        splitAmt2.value = this.splitAmount2;
      });
      splitAmt2.addEventListener('input', (e) => {
        this.splitAmount2 = Number(e.target.value) || 0;
      });
      const splitM1 = this.modal.querySelector('#split-method-1');
      if (splitM1) splitM1.addEventListener('change', (e) => this.splitMethod1 = e.target.value);
      const splitM2 = this.modal.querySelector('#split-method-2');
      if (splitM2) splitM2.addEventListener('change', (e) => {
        this.splitMethod2 = e.target.value;
        this.render();
      });
    }

    // Cancel Button
    const cancelBtn = this.modal.querySelector('#btn-cancel-payment');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Confirm Payment
    const confirmBtn = this.modal.querySelector('#btn-confirm-payment');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.processSale());
    }
  }

  updateCashChange(total) {
    const changeBox = this.modal.querySelector('.cash-change-display');
    if (!changeBox) return;

    const underpaid = this.amountTendered < total;
    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';

    changeBox.className = `cash-change-display ${underpaid ? 'is-underpaid' : 'is-sufficient'}`;
    changeBox.querySelector('.change-label').textContent = underpaid ? 'Amount Short (Remaining Due)' : 'Change to Customer';
    changeBox.querySelector('.change-amount').textContent = underpaid ? formatMoney(total - this.amountTendered) : formatMoney(this.amountTendered - total);
    changeBox.querySelector('.change-status-tag').innerHTML = underpaid ? '<span class="status-badge status-out">Underpaid</span>' : '<span class="status-badge status-ok">Sufficient Cash</span>';
    const customerField = this.modal.querySelector('#cash-customer-wrap');
    const customerName = this.modal.querySelector('#cash-customer-name');
    if (customerField && customerName) {
      customerField.hidden = !underpaid;
      customerName.required = underpaid;
    }
  }

  showError(msg) {
    const errBox = this.modal.querySelector('#payment-error-box');
    if (errBox) {
      errBox.textContent = msg;
      errBox.style.display = 'block';
    }
  }

  async processSale() {
    if (this.processingSale) return;
    const data = this.currentSaleData;
    const total = data.grandTotal;
    let paymentDetails = {};
    let customerName = data.customerName;

    // Validate based on active payment method
    if (this.activeMethod === 'cash') {
      const balanceDue = Math.round(Math.max(0, total - this.amountTendered) * 100) / 100;
      if (balanceDue > 0) {
        const customerInput = this.modal.querySelector('#cash-customer-name');
        customerName = customerInput ? customerInput.value.trim() : '';
        if (!customerName) {
          this.showError('Customer Name is required when a balance is due.');
          return;
        }
      }
      paymentDetails = {
        method: 'Cash',
        amountTendered: this.amountTendered,
        change: Math.round(Math.max(0, this.amountTendered - total) * 100) / 100,
        amountPaid: Math.min(total, this.amountTendered),
        balanceDue
      };
    } else if (this.activeMethod === 'momo') {
      paymentDetails = {
        method: 'Mobile Money',
        network: this.momoNetwork,
        phone: this.momoPhone,
        reference: this.momoRef,
        amountPaid: total,
        balanceDue: 0
      };
    } else if (this.activeMethod === 'card') {
      paymentDetails = {
        method: 'Card',
        reference: this.cardRef,
        amountPaid: total,
        balanceDue: 0
      };
    } else if (this.activeMethod === 'credit') {
      const creditCust = this.modal.querySelector('#credit-customer-name');
      const custVal = creditCust ? creditCust.value.trim() : '';
      if (!custVal) {
        this.showError('Customer Name is required for Credit / Pay Later sales.');
        return;
      }
      customerName = custVal;
      const dueDateInput = this.modal.querySelector('#credit-due-date');
      const notesInput = this.modal.querySelector('#credit-notes');

      paymentDetails = {
        method: 'Pay Later (Credit)',
        dueDate: dueDateInput ? dueDateInput.value : '',
        notes: notesInput ? notesInput.value : '',
        amountPaid: 0,
        balanceDue: total
      };
    } else if (this.activeMethod === 'split') {
      const sum = Math.round((Number(this.splitAmount1) + Number(this.splitAmount2)) * 100) / 100;
      if (sum < total) {
        this.showError(`Split amounts sum to ${sum}, which is less than total ${total}.`);
        return;
      }
      if (this.splitMethod2 === 'credit') {
        if (sum !== Math.round(total * 100) / 100) {
          this.showError('For a split credit sale, the two amounts must add up exactly to the total.');
          return;
        }
        const creditCust = this.modal.querySelector('#split-credit-customer-name');
        const custVal = creditCust ? creditCust.value.trim() : '';
        if (!custVal) {
          this.showError('Customer Name is required when a split payment leaves a balance due.');
          return;
        }
        customerName = custVal;
      }
      const balanceDue = this.splitMethod2 === 'credit' ? Number(this.splitAmount2) : 0;
      paymentDetails = {
        method: 'Split Payment',
        split1: { method: this.splitMethod1, amount: Number(this.splitAmount1) },
        split2: { method: this.splitMethod2, amount: Number(this.splitAmount2) },
        amountPaid: Math.max(0, total - balanceDue),
        balanceDue
      };
    }

    this.processingSale = true;
    const confirmButton = this.modal.querySelector('#btn-confirm-payment');
    if (confirmButton) confirmButton.disabled = true;
    try {
      // Record completed sale in Store
      const completedSale = await store.recordSale({
        ...data,
        customerName,
        paymentMethod: this.activeMethod,
        paymentDetails
      });

      this.close();

      if (typeof this.onSaleCompleted === 'function') {
        this.onSaleCompleted(completedSale);
      }
    } catch (err) {
      this.showError(err.message || 'Failed to complete sale');
    } finally {
      this.processingSale = false;
      if (confirmButton?.isConnected) confirmButton.disabled = false;
    }
  }
}
