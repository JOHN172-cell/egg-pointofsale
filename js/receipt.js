/**
 * Sylcat Farms POS - Receipt & A4 Invoice Generator
 * Generates official A4 Invoices and thermal slips with Manager & Client
 * signature sections, print formatting, WhatsApp, and SMS sharing.
 */

import { store, formatMoney } from './store.js';

export class ReceiptModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentSale = null;
    this.printFormat = 'a4'; // Default to 'a4' invoice, toggleable to 'thermal'
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
    lines.push('     * OFFICIAL INVOICE / RECEIPT *');
    lines.push('       FULL CRATES ONLY (30 EGGS)');
    lines.push(`Phone: ${settings.phone}`);
    lines.push('MoMo:  0552955360');
    if (settings.address && settings.address.trim()) {
      lines.push(`Address: ${settings.address}`);
    }
    lines.push('================================');
    lines.push(`Invoice/Sale #: ${sale.saleNumber}`);
    lines.push(`Date & Time:    ${this.formatDate(sale.timestamp)}`);
    lines.push(`Cashier:        ${sale.cashier}`);
    if (sale.customerName) {
      lines.push(`Client / Name:  ${sale.customerName}`);
    }
    lines.push(`Pricing Mode:   ${sale.priceType.toUpperCase()}`);
    lines.push('--------------------------------');
    lines.push('SIZE        QTY     RATE    TOTAL');
    lines.push('--------------------------------');

    sale.items.forEach(i => {
      const name = (i.name.length > 10 ? i.name.substring(0, 10) : i.name).padEnd(11);
      const qty = `${i.crates}cr`.padEnd(7);
      const rate = `${sym} ${i.unitPrice.toFixed(0)}`.padEnd(9);
      const tot = `${sym} ${i.lineTotal.toFixed(2)}`;
      lines.push(`${name} ${qty} ${rate} ${tot}`);
    });

    lines.push('--------------------------------');
    lines.push(`Total Crates:   ${sale.totalCrates} Crates`);
    lines.push(`Subtotal:       ${sym} ${sale.subtotal.toFixed(2)}`);
    if (sale.discountAmount > 0) {
      lines.push(`Bulk Discount: -${sym} ${sale.discountAmount.toFixed(2)} (${sale.discountPercent}%)`);
    }
    lines.push(`GRAND TOTAL:    ${sym} ${sale.grandTotal.toFixed(2)}`);
    lines.push('--------------------------------');

    if (sale.paymentDetails) {
      const p = sale.paymentDetails;
      lines.push(`Payment Method: ${p.method}`);
      if (p.method === 'Cash') {
        lines.push(`Tendered:       ${sym} ${Number(p.amountTendered).toFixed(2)}`);
        lines.push(`Change:         ${sym} ${Number(p.change).toFixed(2)}`);
      } else if (p.method === 'Mobile Money') {
        lines.push(`Network:        ${p.network}`);
        if (p.reference) lines.push(`Ref:            ${p.reference}`);
      } else if (p.method === 'Pay Later (Credit)') {
        lines.push(`Balance Due:    ${sym} ${Number(p.balanceDue).toFixed(2)}`);
        if (p.dueDate) lines.push(`Due Date:       ${p.dueDate}`);
      } else if (p.method === 'Split Payment') {
        lines.push(`Part 1:         ${p.split1.method} (${sym} ${p.split1.amount.toFixed(2)})`);
        lines.push(`Part 2:         ${p.split2.method} (${sym} ${p.split2.amount.toFixed(2)})`);
      }
    }

    lines.push('================================');
    lines.push('SIGNATURES / ACKNOWLEDGMENT:');
    lines.push('Manager Signature: __________________');
    lines.push('Client Signature:  __________________');
    lines.push('Date:              __________________');
    lines.push('================================');
    lines.push('Thank you for doing business with Sylcat Farms!');
    lines.push('================================');

    return lines.join('\n');
  }

  render() {
    const sale = this.currentSale;
    if (!sale) return;

    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';
    const modalBody = this.modal.querySelector('.modal-body');
    const isA4 = this.printFormat === 'a4';

    modalBody.innerHTML = `
      <div class="receipt-container">
        <!-- Actions & Format Selection Bar -->
        <div class="receipt-action-buttons no-print">
          <div class="receipt-format-switcher">
            <span class="switcher-label">Format:</span>
            <button type="button" class="btn btn-sm ${isA4 ? 'btn-primary' : 'btn-secondary'}" id="btn-format-a4" title="Optimized for printing on standard A4 paper with signature lines">
              📄 A4 Invoice
            </button>
            <button type="button" class="btn btn-sm ${!isA4 ? 'btn-primary' : 'btn-secondary'}" id="btn-format-thermal" title="Compact thermal slip receipt">
              🧾 Thermal Slip
            </button>
          </div>

          <div class="receipt-share-group">
            <button type="button" class="btn btn-primary" id="btn-print-receipt">
              <span class="icon">🖨️</span> Print ${isA4 ? 'A4 Invoice' : 'Slip'}
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
        </div>

        <!-- Printable Document Area (A4 Invoice or Thermal Slip) -->
        <div class="receipt-paper ${isA4 ? 'a4-mode' : 'thermal-mode'}" id="printable-receipt-slip">
          <!-- Document Header -->
          <div class="receipt-header">
            <div class="receipt-header-branding">
              <div class="receipt-logo">🥚</div>
              <div>
                <h1 class="receipt-business-name">${settings.businessName}</h1>
                <div class="receipt-tagline">POULTRY & COMMERCIAL EGG FARMS</div>
              </div>
            </div>

            <div class="receipt-doc-badge">
              <span class="doc-badge-title">${isA4 ? 'OFFICIAL SALES INVOICE' : 'SALES RECEIPT'}</span>
              <span class="receipt-crate-rule-pill">FULL CRATES ONLY (30 EGGS / CRATE)</span>
            </div>

            <div class="receipt-contact">
              <div><strong>Phone:</strong> ${settings.phone}</div>
              <div><strong>MoMo:</strong> 0552955360</div>
              ${settings.address && settings.address.trim() ? `<div><strong>Farm Address:</strong> ${settings.address}</div>` : ''}
            </div>
          </div>

          <div class="receipt-divider"></div>

          <!-- Metadata Grid: Two Columns in A4 Mode -->
          <div class="receipt-meta-grid ${isA4 ? 'a4-meta-grid' : ''}">
            <div class="meta-col">
              <div class="meta-row">
                <span class="meta-label">Invoice / Sale #:</span>
                <span class="meta-val"><strong>${sale.saleNumber}</strong></span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Date & Time:</span>
                <span class="meta-val">${this.formatDate(sale.timestamp)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Issued By (Cashier):</span>
                <span class="meta-val">${sale.cashier}</span>
              </div>
            </div>

            <div class="meta-col">
              <div class="meta-row">
                <span class="meta-label">Client / Customer:</span>
                <span class="meta-val"><strong>${sale.customerName ? sale.customerName : 'Walk-in Retail Client'}</strong></span>
              </div>
              ${sale.customerPhone ? `
                <div class="meta-row">
                  <span class="meta-label">Client Phone:</span>
                  <span class="meta-val">${sale.customerPhone}</span>
                </div>
              ` : ''}
              <div class="meta-row">
                <span class="meta-label">Pricing Applied:</span>
                <span class="meta-val"><strong>${sale.priceType.toUpperCase()} PRICING</strong></span>
              </div>
            </div>
          </div>

          <div class="receipt-divider"></div>

          <!-- Items Table -->
          <table class="receipt-items-table ${isA4 ? 'a4-table' : ''}">
            <thead>
              <tr>
                <th class="col-item">Egg Size & Description</th>
                <th class="col-qty">Quantity</th>
                <th class="col-price">Rate / Crate</th>
                <th class="col-total">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${sale.items.map(item => `
                <tr>
                  <td class="col-item">
                    <strong>${item.name}</strong>
                    <div class="item-sub-desc">Full 30-egg crate (${item.crates * 30} eggs total)</div>
                  </td>
                  <td class="col-qty"><strong>${item.crates}</strong> Crates</td>
                  <td class="col-price">${formatMoney(item.unitPrice)}</td>
                  <td class="col-total">${formatMoney(item.lineTotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="receipt-divider"></div>

          <!-- Totals Breakdown -->
          <div class="receipt-totals-wrapper ${isA4 ? 'a4-totals-wrapper' : ''}">
            <div class="totals-notes-box ${isA4 ? 'a4-notes' : ''}">
              <div class="packaging-guarantee">
                <span class="icon">📦</span>
                <div>
                  <strong>Crate Packaging Guarantee:</strong>
                  <p>All eggs inspected and packed in full, standard 30-egg farm crates.</p>
                </div>
              </div>
            </div>

            <div class="receipt-totals">
              <div class="total-row">
                <span>Total Crates:</span>
                <span><strong>${sale.totalCrates} Crates</strong></span>
              </div>
              <div class="total-row">
                <span>Subtotal:</span>
                <span>${formatMoney(sale.subtotal)}</span>
              </div>
              ${sale.discountAmount > 0 ? `
                <div class="total-row discount-row">
                  <span>Bulk Discount (${sale.discountPercent}%):</span>
                  <span>− ${formatMoney(sale.discountAmount)}</span>
                </div>
              ` : ''}
              <div class="total-row grand-total-row">
                <span>TOTAL AMOUNT:</span>
                <span class="total-grand-number">${formatMoney(sale.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div class="receipt-divider"></div>

          <!-- Payment Details -->
          <div class="receipt-payment-info ${isA4 ? 'a4-payment' : ''}">
            <div class="payment-title">PAYMENT STATUS & SETTLEMENT</div>
            <div class="payment-grid-row">
              <div class="payment-method-row">
                <span>Payment Method:</span>
                <span><strong>${sale.paymentDetails ? sale.paymentDetails.method : sale.paymentMethod}</strong></span>
              </div>

              ${sale.paymentDetails && sale.paymentDetails.method === 'Cash' ? `
                <div class="payment-detail-row">
                  <span>Amount Tendered:</span>
                  <span>${formatMoney(sale.paymentDetails.amountTendered)}</span>
                </div>
                <div class="payment-detail-row highlight-change">
                  <span>Change Returned:</span>
                  <span><strong>${formatMoney(sale.paymentDetails.change)}</strong></span>
                </div>
              ` : ''}

              ${sale.paymentDetails && sale.paymentDetails.method === 'Mobile Money' ? `
                <div class="payment-detail-row">
                  <span>Network:</span>
                  <span><strong>${sale.paymentDetails.network}</strong></span>
                </div>
                ${sale.paymentDetails.reference ? `
                  <div class="payment-detail-row">
                    <span>Reference / Transaction ID:</span>
                    <span>${sale.paymentDetails.reference}</span>
                  </div>
                ` : ''}
                <div class="payment-detail-row">
                  <span>Amount Settled:</span>
                  <span>${formatMoney(sale.grandTotal)}</span>
                </div>
              ` : ''}

              ${sale.paymentDetails && sale.paymentDetails.method === 'Pay Later (Credit)' ? `
                <div class="payment-detail-row highlight-due">
                  <span>Outstanding Balance:</span>
                  <span><strong>${formatMoney(sale.grandTotal)}</strong></span>
                </div>
                ${sale.paymentDetails.dueDate ? `
                  <div class="payment-detail-row">
                    <span>Expected Payment Date:</span>
                    <span>${sale.paymentDetails.dueDate}</span>
                  </div>
                ` : ''}
              ` : ''}

              ${sale.paymentDetails && sale.paymentDetails.method === 'Split Payment' ? `
                <div class="payment-detail-row">
                  <span>Part 1 (${sale.paymentDetails.split1.method}):</span>
                  <span>${formatMoney(sale.paymentDetails.split1.amount)}</span>
                </div>
                <div class="payment-detail-row">
                  <span>Part 2 (${sale.paymentDetails.split2.method}):</span>
                  <span>${formatMoney(sale.paymentDetails.split2.amount)}</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- DEDICATED SIGNATURE SECTION FOR MANAGER AND CLIENT -->
          <div class="receipt-divider signature-divider"></div>

          <div class="invoice-signatures-block">
            <!-- Left: Manager / Authorized Representative -->
            <div class="sig-column sig-manager">
              <div class="sig-header">
                <span class="sig-badge">FARM ISSUER</span>
                <span class="sig-title">MANAGER / AUTHORIZED SIGNATURE</span>
              </div>
              <div class="sig-box">
                <div class="sig-space-area">
                  <!-- Empty signing space for handwriting/stamp -->
                </div>
                <div class="sig-line"></div>
                <div class="sig-meta">
                  <div class="sig-name-line">
                    <strong>Sylcat Farms Management</strong>
                  </div>
                  <div class="sig-date-line">
                    Date: ________________________
                  </div>
                </div>
                <div class="sig-stamp-note">[ Official Stamp & Signature ]</div>
              </div>
            </div>

            <!-- Right: Client / Received By -->
            <div class="sig-column sig-client">
              <div class="sig-header">
                <span class="sig-badge">RECEIVER</span>
                <span class="sig-title">CLIENT / RECEIVED BY</span>
              </div>
              <div class="sig-box">
                <div class="sig-space-area">
                  <!-- Empty signing space for handwriting -->
                </div>
                <div class="sig-line"></div>
                <div class="sig-meta">
                  <div class="sig-name-line">
                    <strong>${sale.customerName ? sale.customerName : 'Client Name: _______________________'}</strong>
                  </div>
                  <div class="sig-date-line">
                    Date: ________________________
                  </div>
                </div>
                <div class="sig-stamp-note">Goods received in good condition in full crates.</div>
              </div>
            </div>
          </div>

          <div class="receipt-footer">
            <p>Thank you for choosing <strong>Sylcat Farms</strong>!</p>
            <p class="receipt-small">Quality farm-fresh eggs supplied strictly in full crates of 30 eggs.</p>
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
    // Format switcher: A4 vs Thermal
    const btnA4 = this.modal.querySelector('#btn-format-a4');
    const btnThermal = this.modal.querySelector('#btn-format-thermal');
    if (btnA4 && btnThermal) {
      btnA4.addEventListener('click', () => {
        this.printFormat = 'a4';
        this.render();
      });
      btnThermal.addEventListener('click', () => {
        this.printFormat = 'thermal';
        this.render();
      });
    }

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
