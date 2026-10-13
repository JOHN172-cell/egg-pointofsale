# Sylcat Farms - Point of Sale (POS) System

> **Full Crates Only Policy**: Exclusively sells eggs in whole crates of 30 eggs each. No loose eggs, half crates, or single trays.

A fast, lightweight, and modern web-based Point of Sale (POS) and inventory tracking application built for **Sylcat Farms**. Shared operational data is stored in Supabase so authorized staff can use the same sales and stock data from multiple PCs.

---

## 🌟 Version 1 Features

### 🛒 Sales Terminal (Cashier Interface)
- **Full Crates Enforcement**: Strictly whole-number quantities (`step="1"`, `min="1"`).
- **Egg Size Cards**: Instant selection for Small, Medium, Large, and Jumbo crates.
- **Dual Pricing**: Instant toggle between **Retail Price** and **Wholesale Price**.
- **Automatic Bulk Discount**: Automatic 10% discount on orders of 10 or more crates (customizable in Settings).
- **Real-time Stock Guard**: Prevents adding more crates than currently in inventory.
- **Large Touch Controls**: Optimized for touchscreens, mobile phones, tablets, and POS terminals.

### 💳 Payment & Checkout
- **Cash**: Instant change calculation and quick denomination buttons; partial payments record the named client's remaining balance.
- **Mobile Money (MoMo)**: Supports MTN MoMo, Telecel Cash, and AirtelTigo with transaction references.
- **Card**: POS terminal slip reference recording.
- **Pay Later (Credit)**: Allows recording credit sales with customer name, promise date, and balance due.
- **Split Payment**: Split a single bill across two payment methods (e.g. Cash + MoMo), or record the second part as a named client's balance due.

### 🧾 Receipts
- **Header**: Sylcat Farms branding, phone number `0244606689`, and optional farm address.
- **Details**: Sale ID, date/time, cashier name, customer name, crate breakdown, totals, amount paid, and balance due.
- **Client balance**: Shows all unpaid invoices and the client's total outstanding balance on receipts.
- **Actions**:
  - 🖨️ Thermal printer-ready print formatting (`@media print`).
  - 📲 Share via WhatsApp with pre-formatted message.
  - 💬 Share via SMS.
  - 📋 Copy plain text receipt to clipboard.
  - 🔄 Reprint any past transaction from reports.

### 📦 Whole-Crate Stock Management
- **Inventory Tracking**: Stock counted strictly in whole crates.
- **Farm Deliveries**: Record new stock inflows with supplier/harvest batch notes.
- **Low-Stock Alerts**: Visual warning badges when stock falls below configured threshold.
- **Manual Stock Adjustments**: Owner override with mandatory reason logging.
- **Audit Log**: Full chronological history of every stock movement.

### 📊 Daily Sales Reports
- **Daily Summary**: Total revenue, total collections, total crates sold, discounts given, and all outstanding client balances.
- **Size Breakdown**: Progress bars and percentages of crates sold per egg size.
- **Payment Breakdown**: Total collections for Cash, MoMo, Card, Credit, and Split payments.
- **Sales History**: Filter transactions by date and reprint receipts anytime.

### ⚙️ Settings & Theme
- Automatic Light and Dark modes respecting device preferences, plus manual toggle (saved per device).
- Off-white (`#F8F7F2`) and off-black (`#141412`) backgrounds with egg-yolk gold accents (`#B45309` light, `#F5A524` dark).
- Configurable business name, phone, address, and bulk discount thresholds.
- JSON backup export and demo data reset.

---

## ☁️ Configure Shared Supabase Storage

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates the POS tables, stock/sale transaction functions, public row-level-security policies, and live-change publication. If you ran an earlier authenticated-only version of this schema, run this updated SQL again to remove the sign-in restriction.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project's API settings. The publishable/anon key is intended for browser use; never use a service-role/secret key here.
4. Start the app. It initializes the shared database on first load. If deploying to a new site/domain, first export the existing POS backup from **Settings → Export Data (JSON)** in the old app, then open the new app and import it using **Settings → Import Backup to Shared POS**. Import replaces the shared data for everyone.
5. For Vercel, set the same two environment variables in the project's Environment Variables settings and redeploy. Keep `.env.local` out of source control.

Sales, products, stock movements, and business settings are shared. Theme and cashier preferences remain per-device. The first visit bootstraps the database only once; it will not overwrite an existing shared database. If Supabase variables are not configured, the app uses browser-local storage and shows a local-mode warning; local-mode data does not sync between computers. **Access is public and has no sign-in:** anyone who can reach the app can view or modify all POS data, including importing a replacement backup or resetting shared data. Do not use this mode for sensitive records or expose the URL publicly.

## 🚀 Running Locally

1. Configure Supabase as above, then open a terminal in this directory:
   ```bash
   npm run dev
   ```
2. Open the displayed local URL (e.g. `http://localhost:5173`) in your browser.
3. Use the POS directly without a sign-in.
