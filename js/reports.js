/**
 * Sylcat Farms POS - Daily Sales Report Controller
 * Computes daily revenue, whole crates sold by size, payment method totals,
 * and allows reprinting past sale receipts.
 */

import { store } from './store.js';

export class ReportsController {
  constructor(onReprintRequested) {
    this.container = null;
    this.selectedDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    this.onReprintRequested = onReprintRequested;
  }

  init(container, onReprintRequested) {
    this.container = container;
    if (onReprintRequested) this.onReprintRequested = onReprintRequested;
    this.render();

    store.subscribe((event) => {
      if (['SALE_RECORDED', 'SETTINGS_UPDATED', 'STATE_RESET'].includes(event)) {
        this.render();
      }
    });
  }

  render() {
    if (!this.container) return;

    const settings = store.getSettings();
    const currency = settings.currencySymbol || 'GH₵';
    const sales = store.getSales(this.selectedDate);

    // Compute metrics
    let totalRevenue = 0;
    let totalCratesSold = 0;
    let totalDiscountGiven = 0;
    const cratesBySize = {};
    const paymentTotals = {
      Cash: 0,
      'Mobile Money': 0,
      Card: 0,
      'Pay Later (Credit)': 0,
      'Split Payment': 0
    };

    // Initialize sizes from products
    store.getProducts(true).forEach(p => {
      cratesBySize[p.name] = { crates: 0, revenue: 0, sizeLabel: p.sizeLabel };
    });

    sales.forEach(sale => {
      totalRevenue += sale.grandTotal;
      totalCratesSold += sale.totalCrates;
      totalDiscountGiven += (sale.discountAmount || 0);

      // Crate breakdown
      sale.items.forEach(item => {
        if (!cratesBySize[item.name]) {
          cratesBySize[item.name] = { crates: 0, revenue: 0, sizeLabel: item.sizeLabel || item.name };
        }
        cratesBySize[item.name].crates += item.crates;
        cratesBySize[item.name].revenue += item.lineTotal;
      });

      // Payment breakdown
      const method = sale.paymentDetails?.method || sale.paymentMethod;
      if (paymentTotals[method] !== undefined) {
        paymentTotals[method] += sale.grandTotal;
      } else {
        paymentTotals[method] = (paymentTotals[method] || 0) + sale.grandTotal;
      }
    });

    const isToday = this.selectedDate === new Date().toISOString().slice(0, 10);

    this.container.innerHTML = `
      <div class="reports-view-layout">
        <!-- Date Header & Filter -->
        <div class="reports-header-card">
          <div class="header-titles">
            <h2>Daily Sales Summary</h2>
            <p class="section-sub">Detailed breakdown of revenue, crates sold per size, and payment collections for ${this.selectedDate}.</p>
          </div>
          <div class="reports-date-picker">
            <label for="reports-date-input" class="form-label-inline">Select Date:</label>
            <input type="date" id="reports-date-input" class="form-control" value="${this.selectedDate}">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-reports-today">Today</button>
            <button type="button" class="btn btn-primary btn-sm no-print" id="btn-print-report">🖨️ Print Report</button>
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="reports-stats-grid">
          <div class="stat-card">
            <span class="stat-icon">💰</span>
            <div class="stat-details">
              <span class="stat-title">Total Revenue</span>
              <span class="stat-number"><strong>${currency}${totalRevenue.toFixed(2)}</strong></span>
              <span class="stat-hint">${sales.length} sale transaction${sales.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-icon">📦</span>
            <div class="stat-details">
              <span class="stat-title">Total Crates Sold</span>
              <span class="stat-number"><strong>${totalCratesSold}</strong> Crates</span>
              <span class="stat-hint">(${totalCratesSold * 30} eggs sold)</span>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-icon">🏷️</span>
            <div class="stat-details">
              <span class="stat-title">Bulk Discounts Given</span>
              <span class="stat-number"><strong>${currency}${totalDiscountGiven.toFixed(2)}</strong></span>
              <span class="stat-hint">From wholesale/bulk orders</span>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-icon">⏳</span>
            <div class="stat-details">
              <span class="stat-title">Outstanding Credit (Pay Later)</span>
              <span class="stat-number text-warning"><strong>${currency}${paymentTotals['Pay Later (Credit)'].toFixed(2)}</strong></span>
              <span class="stat-hint">Customer credit to collect</span>
            </div>
          </div>
        </div>

        <!-- Two Column Breakdown: Crates by Size & Payment Method Breakdown -->
        <div class="reports-breakdown-grid">
          <!-- Crates Sold by Size -->
          <div class="breakdown-card">
            <div class="breakdown-header">
              <h3>🥚 Crates Sold by Egg Size</h3>
              <span class="badge-total">${totalCratesSold} Total Crates</span>
            </div>
            <div class="size-breakdown-list">
              ${Object.keys(cratesBySize).length === 0 ? `
                <p class="py-3 text-muted">No sales recorded for this date.</p>
              ` : Object.entries(cratesBySize).map(([sizeName, data]) => {
                const percent = totalCratesSold > 0 ? Math.round((data.crates / totalCratesSold) * 100) : 0;
                return `
                  <div class="size-progress-item">
                    <div class="size-progress-labels">
                      <span class="size-prog-name"><strong>${sizeName}</strong></span>
                      <span class="size-prog-vals">
                        <strong>${data.crates} crates</strong> (${percent}%) — ${currency}${data.revenue.toFixed(2)}
                      </span>
                    </div>
                    <div class="progress-bar-bg">
                      <div class="progress-bar-fill" style="width: ${percent}%;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Payment Method Totals -->
          <div class="breakdown-card">
            <div class="breakdown-header">
              <h3>💳 Collections by Payment Method</h3>
              <span class="badge-total">${currency}${totalRevenue.toFixed(2)} Total</span>
            </div>
            <div class="payment-method-list">
              <div class="pay-method-row">
                <span class="pay-method-name">💵 Cash</span>
                <span class="pay-method-amount"><strong>${currency}${paymentTotals['Cash'].toFixed(2)}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">📱 Mobile Money</span>
                <span class="pay-method-amount"><strong>${currency}${paymentTotals['Mobile Money'].toFixed(2)}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">💳 Card</span>
                <span class="pay-method-amount"><strong>${currency}${paymentTotals['Card'].toFixed(2)}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">⏳ Pay Later (Credit)</span>
                <span class="pay-method-amount text-warning"><strong>${currency}${paymentTotals['Pay Later (Credit)'].toFixed(2)}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">🔀 Split Payment</span>
                <span class="pay-method-amount"><strong>${currency}${paymentTotals['Split Payment'].toFixed(2)}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sales Transaction History for Selected Date -->
        <div class="reports-sales-section">
          <div class="section-header">
            <div>
              <h3>Completed Sales Log (${sales.length})</h3>
              <p class="section-sub">Click "View / Reprint" to inspect or print the receipt for any transaction.</p>
            </div>
          </div>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Sale #</th>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Mode</th>
                  <th>Egg Sizes & Crates</th>
                  <th>Total Crates</th>
                  <th>Payment</th>
                  <th>Grand Total</th>
                  <th class="text-right no-print">Receipt</th>
                </tr>
              </thead>
              <tbody>
                ${sales.length === 0 ? `
                  <tr>
                    <td colspan="9" class="text-center py-4">No completed sales on ${this.selectedDate}.</td>
                  </tr>
                ` : sales.map(s => {
                  const itemsSummary = s.items.map(i => `${i.crates}× ${i.name}`).join(', ');
                  const method = s.paymentDetails?.method || s.paymentMethod;

                  return `
                    <tr>
                      <td><strong>${s.saleNumber}</strong></td>
                      <td>${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>${s.customerName ? s.customerName : '<span class="text-muted">Walk-in</span>'}</td>
                      <td><span class="badge-price-type ${s.priceType}">${s.priceType.toUpperCase()}</span></td>
                      <td class="td-items-summary" title="${itemsSummary}">${itemsSummary}</td>
                      <td><strong>${s.totalCrates} cr</strong></td>
                      <td><span class="status-badge status-ok">${method}</span></td>
                      <td><strong>${currency}${s.grandTotal.toFixed(2)}</strong></td>
                      <td class="text-right no-print">
                        <button type="button" class="btn btn-sm btn-secondary btn-reprint-receipt" data-salenum="${s.saleNumber}">
                          Reprint Receipt
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Date input change
    const dateInput = this.container.querySelector('#reports-date-input');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        this.selectedDate = e.target.value;
        this.render();
      });
    }

    // Today button
    const btnToday = this.container.querySelector('#btn-reports-today');
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        this.selectedDate = new Date().toISOString().slice(0, 10);
        this.render();
      });
    }

    // Print Report
    const btnPrint = this.container.querySelector('#btn-print-report');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }

    // Reprint receipt buttons
    this.container.querySelectorAll('.btn-reprint-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const saleNum = btn.getAttribute('data-salenum');
        const sale = store.getSaleByNumber(saleNum);
        if (sale && typeof this.onReprintRequested === 'function') {
          this.onReprintRequested(sale);
        }
      });
    });
  }
}
