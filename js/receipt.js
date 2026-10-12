/**
 * Sylcat Farms POS - Receipt Generator & Modal
 * Generates thermal/standard receipt layouts, supports printing,
 * WhatsApp sharing, SMS sharing, and reprinting past receipts.
 */

import { store } from './store.js';

export class ReceiptModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentSale = null;
    this.init();
  }

  init() {
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

  open(sale) {
    this.currentSale = sale;
    this.render();
    this.modal.showModal();
  }

  close() {
    this.modal.close();
  }

  formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  generatePlainTextReceipt(sale, settings) {
    const sym = settings.currencySymbol || 'GH₵';
    let lines = [];
    lines.push('================================');
    lines.push(`       ${settings.businessName.toUpperCase()}`);
    lines.push('     * FULL CRATES ONLY *');
    lines.push(`Phone: ${settings.phone}`);
    if (settings.address && settings.address.trim()) {
      lines.push(`Address: ${settings.address}`);
    }
    lines.push('================================');
    lines.push(`Receipt #: ${sale.saleNumber}`);
    lines.push(`Date:      ${this.formatDate(sale.timestamp)}`);
    lines.push(`Cashier:   ${sale.cashier}`);
    if (sale.customerName) {
      lines.push(`Customer:  ${sale.customerName}`);
    }
    lines.push(`Pricing:   ${sale.priceType.toUpperCase()}`);
    lines.push('--------------------------------');
    lines.push('SIZE        QTY     RATE    TOTAL');
    lines.push('--------------------------------');

    sale.items.forEach(i => {
      const name = (i.name.length > 10 ? i.name.substring(0, 10) : i.name).padEnd(11);
      const qty = `${i.crates}cr`.padEnd(7);
      const rate = `${sym}${i.unitPrice.toFixed(0)}`.padEnd(7);
      const tot = `${sym}${i.lineTotal.toFixed(2)}`;
      lines.push(`${name} ${qty} ${rate} ${tot}`);
    });

    lines.push('--------------------------------');
    lines.push(`Total Crates:   ${sale.totalCrates} Crates`);
    lines.push(`Subtotal:       ${sym}${sale.subtotal.toFixed(2)}`);
    if (sale.discountAmount > 0) {
      lines.push(`Bulk Discount: -${sym}${sale.discountAmount.toFixed(2)} (${sale.discountPercent}%)`);
    }
    lines.push(`GRAND TOTAL:    ${sym}${sale.grandTotal.toFixed(2)}`);
    lines.push('--------------------------------');

    if (sale.paymentDetails) {
      const p = sale.paymentDetails;
      lines.push(`Payment:        ${p.method}`);
      if (p.method === 'Cash') {
        lines.push(`Tendered:       ${sym}${Number(p.amountTendered).toFixed(2)}`);
        lines.push(`Change:         ${sym}${Number(p.change).toFixed(2)}`);
      } else if (p.method === 'Mobile Money') {
        lines.push(`Network:        ${p.network}`);
        if (p.reference) lines.push(`Ref:            ${p.reference}`);
      } else if (p.method === 'Pay Later (Credit)') {
        lines.push(`Balance Due:    ${sym}${Number(p.balanceDue).toFixed(2)}`);
        if (p.dueDate) lines.push(`Due Date:       ${p.dueDate}`);
      } else if (p.method === 'Split Payment') {
        lines.push(`Part 1:         ${p.split1.method} (${sym}${p.split1.amount.toFixed(2)})`);
        lines.push(`Part 2:         ${p.split2.method} (${sym}${p.split2.amount.toFixed(2)})`);
      }
    }

    lines.push('================================');
    lines.push('Thank you for choosing Sylcat Farms!');
    lines.push('Eggs sold in full crates of 30 eggs.');
    lines.push('================================');

    return lines.join('\n');
  }

  render() {
    const sale = this.currentSale;
    if (!sale) return;

    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';
    const modalBody = this.modal.querySelector('.modal-body');

    modalBody.innerHTML = `
      <div class="receipt-container">
        <!-- Actions Bar -->
        <div class="receipt-action-buttons no-print">
          <button type="button" class="btn btn-primary" id="btn-print-receipt">
            <span class="icon">🖨️</span> Print Receipt
          </button>
          <button type="button" class="btn btn-secondary" id="btn-whatsapp-receipt">
            <span class="icon">📲</span> WhatsApp
          </button>
          <button type="button" class="btn btn-secondary" id="btn-sms-receipt">
            <span class="icon">💬</span> SMS
          </button>
          <button type="button" class="btn btn-secondary" id="btn-copy-receipt">
            <span class="icon">📋</span> Copy
          </button>
        </div>

        <!-- Printable Thermal Slip Area -->
        <div class="receipt-paper" id="printable-receipt-slip">
          <div class="receipt-header">
            <div class="receipt-logo">🥚</div>
            <h1 class="receipt-business-name">${settings.businessName}</h1>
            <div class="receipt-tagline">POULTRY & EGG FARMS</div>
            <div class="receipt-badge">FULL CRATES ONLY (30 EGGS/CRATE)</div>
            <div class="receipt-contact">
              <div><strong>Phone:</strong> ${settings.phone}</div>
              ${settings.address && settings.address.trim() ? `<div><strong>Address:</strong> ${settings.address}</div>` : ''}
            </div>
          </div>

          <div class="receipt-divider"></div>

          <div class="receipt-meta-grid">
            <div class="meta-row">
              <span class="meta-label">Sale #:</span>
              <span class="meta-val"><strong>${sale.saleNumber}</strong></span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Date & Time:</span>
              <span class="meta-val">${this.formatDate(sale.timestamp)}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Cashier:</span>
              <span class="meta-val">${sale.cashier}</span>
            </div>
            ${sale.customerName ? `
              <div class="meta-row">
                <span class="meta-label">Customer:</span>
                <span class="meta-val"><strong>${sale.customerName}</strong></span>
              </div>
            ` : ''}
            <div class="meta-row">
              <span class="meta-label">Price Mode:</span>
              <span class="meta-val">${sale.priceType.toUpperCase()}</span>
            </div>
          </div>

          <div class="receipt-divider"></div>

          <table class="receipt-items-table">
            <thead>
              <tr>
                <th class="col-item">Size</th>
                <th class="col-qty">Crates</th>
                <th class="col-price">Rate</th>
                <th class="col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              ${sale.items.map(item => `
                <tr>
                  <td class="col-item">
                    <strong>${item.name}</strong>
                  </td>
                  <td class="col-qty">${item.crates} cr</td>
                  <td class="col-price">${currency}${item.unitPrice.toFixed(2)}</td>
                  <td class="col-total">${currency}${item.lineTotal.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="receipt-divider"></div>

          <div class="receipt-totals">
            <div class="total-row">
              <span>Total Crates Sold:</span>
              <span><strong>${sale.totalCrates} Crates</strong></span>
            </div>
            <div class="total-row">
              <span>Subtotal:</span>
              <span>${currency}${sale.subtotal.toFixed(2)}</span>
            </div>
            ${sale.discountAmount > 0 ? `
              <div class="total-row discount-row">
                <span>Bulk Discount (${sale.discountPercent}%):</span>
                <span>−${currency}${sale.discountAmount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="total-row grand-total-row">
              <span>TOTAL DUE:</span>
              <span>${currency}${sale.grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div class="receipt-divider"></div>

          <!-- Payment Details -->
          <div class="receipt-payment-info">
            <div class="payment-title">PAYMENT DETAILS</div>
            <div class="payment-method-row">
              <span>Method:</span>
              <span><strong>${sale.paymentDetails ? sale.paymentDetails.method : sale.paymentMethod}</strong></span>
            </div>
            ${sale.paymentDetails && sale.paymentDetails.method === 'Cash' ? `
              <div class="payment-detail-row">
                <span>Amount Tendered:</span>
                <span>${currency}${Number(sale.paymentDetails.amountTendered).toFixed(2)}</span>
              </div>
              <div class="payment-detail-row highlight-change">
                <span>Change Returned:</span>
                <span><strong>${currency}${Number(sale.paymentDetails.change).toFixed(2)}</strong></span>
              </div>
            ` : ''}

            ${sale.paymentDetails && sale.paymentDetails.method === 'Mobile Money' ? `
              <div class="payment-detail-row">
                <span>Network:</span>
                <span>${sale.paymentDetails.network}</span>
              </div>
              ${sale.paymentDetails.reference ? `
                <div class="payment-detail-row">
                  <span>Ref #:</span>
                  <span>${sale.paymentDetails.reference}</span>
                </div>
              ` : ''}
              <div class="payment-detail-row">
                <span>Amount Paid:</span>
                <span>${currency}${sale.grandTotal.toFixed(2)}</span>
              </div>
            ` : ''}

            ${sale.paymentDetails && sale.paymentDetails.method === 'Pay Later (Credit)' ? `
              <div class="payment-detail-row highlight-due">
                <span>Balance Owed:</span>
                <span><strong>${currency}${sale.grandTotal.toFixed(2)}</strong></span>
              </div>
              ${sale.paymentDetails.dueDate ? `
                <div class="payment-detail-row">
                  <span>Payment Due:</span>
                  <span>${sale.paymentDetails.dueDate}</span>
                </div>
              ` : ''}
            ` : ''}

            ${sale.paymentDetails && sale.paymentDetails.method === 'Split Payment' ? `
              <div class="payment-detail-row">
                <span>Part 1 (${sale.paymentDetails.split1.method}):</span>
                <span>${currency}${sale.paymentDetails.split1.amount.toFixed(2)}</span>
              </div>
              <div class="payment-detail-row">
                <span>Part 2 (${sale.paymentDetails.split2.method}):</span>
                <span>${currency}${sale.paymentDetails.split2.amount.toFixed(2)}</span>
              </div>
            ` : ''}
          </div>

          <div class="receipt-divider"></div>

          <div class="receipt-footer">
            <p>Thank you for choosing <strong>Sylcat Farms</strong>!</p>
            <p class="receipt-small">Quality fresh eggs produced with care.</p>
            <p class="receipt-small">Eggs sold strictly in whole crates (30 eggs/crate).</p>
            <div class="receipt-barcode">||| | ||||| |||| | ||| || ||||</div>
          </div>
        </div>

        <div class="receipt-bottom-close no-print">
          <button type="button" class="btn btn-secondary btn-block" id="btn-close-receipt">Close & Start New Sale</button>
        </div>
      </div>
    `;

    this.bindEvents(sale, settings);
  }

  bindEvents(sale, settings) {
    // Print
    const btnPrint = this.modal.querySelector('#btn-print-receipt');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // WhatsApp
    const btnWhatsApp = this.modal.querySelector('#btn-whatsapp-receipt');
    if (btnWhatsApp) {
      btnWhatsApp.addEventListener('click', () => {
        const text = this.generatePlainTextReceipt(sale, settings);
        const encoded = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
      });
    }

    // SMS
    const btnSMS = this.modal.querySelector('#btn-sms-receipt');
    if (btnSMS) {
      btnSMS.addEventListener('click', () => {
        const text = this.generatePlainTextReceipt(sale, settings);
        const encoded = encodeURIComponent(text);
        window.location.href = `sms:?body=${encoded}`;
      });
    }

    // Copy
    const btnCopy = this.modal.querySelector('#btn-copy-receipt');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const text = this.generatePlainTextReceipt(sale, settings);
        navigator.clipboard.writeText(text).then(() => {
          btnCopy.innerHTML = '<span class="icon">✅</span> Copied!';
          setTimeout(() => {
            btnCopy.innerHTML = '<span class="icon">📋</span> Copy';
          }, 2000);
        });
      });
    }

    // Close
    const btnClose = this.modal.querySelector('#btn-close-receipt');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.close());
    }
  }
}
