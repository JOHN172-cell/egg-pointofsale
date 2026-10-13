# Sylcat Farms Point of Sale

Browser-based POS for whole egg crates (30 eggs per crate), including sales, inventory, receipts, client balances, refunds and reports.

## Local-only mode

The POS currently works without Supabase, an account or a server database. It saves products, stock, sales and settings in the browser's local storage.

- No sign-in is required. The cashier name is configurable in **Settings**.
- Data is private to the browser profile and website address being used. A different PC, browser profile, or website address starts with its own data and will not see or update this computer's records.
- Hosting the site on Vercel makes the page accessible from other PCs, but does not share their browser data.
- Use **Settings → Export Data (JSON)** regularly to keep a backup. Clearing browser data or using private/incognito browsing may remove local records.

## Run locally

1. Install Node.js 20 or newer.
2. From this project folder, run:

   ```sh
   npm install
   npm run dev
   ```

3. Open the local URL printed by Vite (usually `http://localhost:5173`).

## Host on Vercel

Deploy the project using the Vite preset, `npm run build` as the build command, and `dist` as the output directory. No Supabase environment variables are needed for the current local-only POS experience.

Each person can open the hosted site, but each browser keeps a separate copy of the data. To share stock, sales, and balances across PCs, a shared database and server connection will be required later.

## Features

- Whole-crate inventory, retail and wholesale prices, and bulk discounts.
- Cash, split payments, mobile money, card-terminal references, and credit sales.
- Receipts with paid amounts and outstanding client balances.
- Stock deliveries, adjustments, sales reports, refunds and voids.
- Theme selection, receipt printing/sharing, stock history and JSON export.

## Local verification checklist

- [ ] Open the POS without a sign-in prompt.
- [ ] Add a sale and confirm stock decreases and the receipt is shown.
- [ ] Reload the same browser and confirm the sale and stock remain.
- [ ] Record a delivery or stock adjustment and confirm the stock log updates.
- [ ] Record a credit sale and verify its client and amount owed appear in reports and the receipt.
- [ ] Export a JSON backup from Settings.
- [ ] Open the hosted site in another browser or PC and confirm it has separate local data.
