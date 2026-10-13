/**
 * Sylcat Farms POS - Daily Sales Report Controller
 * Computes daily revenue, whole crates sold by size, payment method totals,
 * and allows reprinting past sale receipts.
 */

import { store, formatMoney } from './store.js';

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
      if (['SALE_RECORDED', 'SETTINGS_UPDATED', 'STATE_RESET', 'REMOTE_STATE_UPDATED'].includes(event)) {
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
    let totalCollected = 0;
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
      const amountPaid = Number.isFinite(Number(sale.paymentDetails?.amountPaid))
        ? Number(sale.paymentDetails.amountPaid)
        : (method === 'Pay Later (Credit)' ? 0 : sale.grandTotal);
      totalCollected += amountPaid;
      if (paymentTotals[method] !== undefined) {
        paymentTotals[method] += amountPaid;
      } else {
        paymentTotals[method] = (paymentTotals[method] || 0) + amountPaid;
      }
    });

    const isToday = this.selectedDate === new Date().toISOString().slice(0, 10);

    // Compute ALL outstanding credits (across all dates, not just selected)
    const outstandingClients = store.getAllOutstandingCredits();
    const totalOutstandingAll = outstandingClients.reduce((sum, c) => sum + c.totalOwed, 0);

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
              <span class="stat-number"><strong>${formatMoney(totalRevenue)}</strong></span>
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
              <span class="stat-number"><strong>${formatMoney(totalDiscountGiven)}</strong></span>
              <span class="stat-hint">From wholesale/bulk orders</span>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-icon">⏳</span>
            <div class="stat-details">
              <span class="stat-title">Total Revenue Owed</span>
              <span class="stat-number text-warning"><strong>${formatMoney(totalOutstandingAll)}</strong></span>
              <span class="stat-hint">${outstandingClients.length} client${outstandingClients.length !== 1 ? 's' : ''} with an unpaid balance</span>
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
                        <strong>${data.crates} crates</strong> (${percent}%) — ${formatMoney(data.revenue)}
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
              <span class="badge-total">${formatMoney(totalCollected)} Collected</span>
            </div>
            <div class="payment-method-list">
              <div class="pay-method-row">
                <span class="pay-method-name">💵 Cash</span>
                <span class="pay-method-amount"><strong>${formatMoney(paymentTotals['Cash'])}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">📱 Mobile Money</span>
                <span class="pay-method-amount"><strong>${formatMoney(paymentTotals['Mobile Money'])}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">💳 Card</span>
                <span class="pay-method-amount"><strong>${formatMoney(paymentTotals['Card'])}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">⏳ Pay Later (Credit)</span>
                <span class="pay-method-amount text-warning"><strong>${formatMoney(paymentTotals['Pay Later (Credit)'])}</strong></span>
              </div>
              <div class="pay-method-row">
                <span class="pay-method-name">🔀 Split Payment</span>
                <span class="pay-method-amount"><strong>${formatMoney(paymentTotals['Split Payment'])}</strong></span>
              </div>
            </div>
          </div>
        </div>

        <!-- ======== REVENUE OWED — OUTSTANDING CREDITS SECTION ======== -->
        <div class="reports-outstanding-section">
          <div class="section-header">
            <div>
              <h3>💸 Revenue Owed — Outstanding Client Balances</h3>
              <p class="section-sub">All unpaid balances across all dates. Shows each client, the amount still owed, and when payment is due.</p>
            </div>
            <span class="badge-total-warning">${formatMoney(totalOutstandingAll)} Total Owed</span>
          </div>

          ${outstandingClients.length === 0 ? `
            <div class="empty-outstanding-box">
              <span class="empty-icon">✅</span>
              <p><strong>No outstanding balances!</strong></p>
              <p class="text-muted">All client balances have been settled. Great job!</p>
            </div>
          ` : `
            <div class="outstanding-clients-grid">
              ${outstandingClients.map(client => `
                <div class="outstanding-client-card">
                  <div class="client-card-header">
                    <div class="client-identity">
                      <span class="client-avatar">👤</span>
                      <div>
                        <strong class="client-name">${client.clientName}</strong>
                        ${client.clientPhone ? `<span class="client-phone">📞 ${client.clientPhone}</span>` : ''}
                      </div>
                    </div>
                    <div class="client-owed-badge">
                      <span class="owed-label">OWES</span>
                      <span class="owed-amount">${formatMoney(client.totalOwed)}</span>
                    </div>
                  </div>

                  <div class="client-invoices-table">
                    <table class="mini-table">
                      <thead>
                        <tr>
                          <th>Invoice #</th>
                          <th>Date</th>
                          <th>Owed</th>
                          <th>Due Date</th>
                          <th class="no-print">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${client.sales.map(cs => `
                          <tr>
                            <td><strong>${cs.saleNumber}</strong></td>
                            <td>${new Date(cs.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td><strong>${formatMoney(cs.amount)}</strong></td>
                            <td>${cs.dueDate || '<span class="text-muted">Not set</span>'}</td>
                            <td class="no-print">
                              <button type="button" class="btn btn-sm btn-success btn-mark-paid" data-salenum="${cs.saleNumber}" title="Mark this balance as paid">
                                ✅ Mark Paid
                              </button>
                            </td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
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
                  const balanceDue = store.getSaleBalanceDue(s);
                  const isOwed = balanceDue > 0;

                  return `
                    <tr class="${isOwed ? 'row-credit-owed' : ''}">
                      <td><strong>${s.saleNumber}</strong></td>
                      <td>${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>${s.customerName ? s.customerName : '<span class="text-muted">Walk-in</span>'}</td>
                      <td><span class="badge-price-type ${s.priceType}">${s.priceType.toUpperCase()}</span></td>
                      <td class="td-items-summary" title="${itemsSummary}">${itemsSummary}</td>
                      <td><strong>${s.totalCrates} cr</strong></td>
                      <td>
                        <span class="status-badge ${isOwed ? 'status-warning' : 'status-ok'}">${method}</span>
                        ${isOwed ? `<div class="text-warning">Owes ${formatMoney(balanceDue)}</div>` : ''}
                        ${s.status === 'PAID' ? '<span class="badge-paid">PAID</span>' : ''}
                      </td>
                      <td><strong>${formatMoney(s.grandTotal)}</strong></td>
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

    // Mark outstanding balances as paid
    this.container.querySelectorAll('.btn-mark-paid').forEach(btn => {
      btn.addEventListener('click', async () => {
        const saleNum = btn.getAttribute('data-salenum');
        if (saleNum) {
          const confirmed = confirm(`Mark invoice ${saleNum} as PAID?\nThis will remove it from outstanding credits.`);
          if (confirmed) {
            try {
              await store.markCreditPaid(saleNum);
              this.render();
            } catch (error) {
              alert(error.message || 'Unable to mark balance as paid');
            }
          }
        }
      });
    });

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
