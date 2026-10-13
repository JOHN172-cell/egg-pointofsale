# Sylcat Farms Point of Sale

Web POS for whole egg crates (30 eggs per crate), with cash, mobile-money, card-terminal-reference and credit recording, client balances, stock tracking, receipts and sales reports.

## Security and data model

- The browser talks only to same-origin Vercel API functions for POS data. No Supabase service-role key is included in the Vite/browser bundle.
- Supabase Auth uses email and password. Public signup must be disabled; an administrator creates staff accounts.
- PostgreSQL stores prices and all money amounts as integer pesewas/cents. The sale function recalculates prices, discounts and totals from database product/settings rows.
- Sale rows, sale items, payment entries and inventory deductions are committed in one database transaction. Product rows and stock are locked while a sale is completed; stock cannot go below zero. The request UUID prevents a retried request from charging stock twice.
- RLS limits cashier sales reads to their own sales; managers/admins can read all sales. Stock and product/settings edits, refunds, voids and user-management operations require manager/admin privileges (user account creation is restricted by role).
- Sales are never deleted by this application. Refunds and voids are recorded as adjustments, and voids restore all sold crates in the same transaction.
- The app records card as a payment method/reference only; it does not collect or store card numbers or process a card payment.
- Browser-local history remains on that browser until deliberately migrated. The migration routines stop if normalized shared products/sales already exist and do not clear local or legacy rows.

## Setup (non-expert)

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com). Save the database password somewhere safe; this app does not need that password.
2. In **Authentication → Settings**, turn off public sign-ups. Staff accounts are created by an administrator.
3. Open **SQL Editor → New query**. Copy all of [`supabase/schema.sql`](./supabase/schema.sql) into the editor and click **Run**. It creates normalized products, inventory, sales, sale items, payments, profiles, categories, stock movements, refund adjustments, settings and audit tables, with RLS and transactional functions.
4. The schema does not delete old `pos_*` records. It disables their old public access. Use the **Migrate Older Shared Database** action after creating the first admin to copy the old shared JSON data into the new tables. If this is a new project, skip that action.

### 2. Configure local development

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local`.
3. In Supabase **Project Settings → API**, set the values in `.env.local`:

   | Name | Supabase value | Secret? |
   |---|---|---|
   | `SUPABASE_URL` | Project URL | No |
   | `SUPABASE_ANON_KEY` | Publishable/anon key | No |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret/service-role key | **Yes — server only** |

   Never put the service-role key in a `VITE_` variable, browser code, source control, or a message. `.env.local` is git-ignored.
4. In a terminal in the project folder, run:

   ```sh
   npm install
   npm install --global vercel
   vercel login
   vercel link
   npm run create-admin
   ```

   Enter the first administrator's email and name. The password prompt is hidden; use at least 12 characters. The script refuses to create another first admin once one exists.
5. Start the application and its API functions:

   ```sh
   npm run dev
   ```

   Open the local URL printed by Vercel and sign in. Do not use `vite preview` for API testing; it serves static files only.
6. On the first administrator's device, open **Settings** and select either **Migrate This Browser's Local Data** (the prior browser's localStorage data) or **Migrate Older Shared Database** (the previous shared `pos_*` tables). Each is a one-time import into an empty normalized database. Back up important local data before migrating; the browser's original localStorage is kept unchanged.
7. Create cashier/manager accounts from **Settings → Staff Accounts**. Share temporary passwords securely. Administrators can reset a password in Supabase **Authentication → Users**.

### 3. Deploy to Vercel

1. Import the repository into Vercel. Use the Vite preset, `npm run build` as the build command and `dist` as the output directory.
2. In **Vercel → Project → Settings → Environment Variables**, add all three server variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Add them to Production (and Preview if those deployments should access the same database). Mark `SUPABASE_SERVICE_ROLE_KEY` sensitive.
3. Redeploy after saving the variables. Confirm login and API calls on the deployed URL.
4. Keep the service-role key only in Vercel's server environment and your private local `.env.local`. If it is ever exposed, rotate it in Supabase immediately.

The first-admin script runs once from a trusted local terminal. Do not add the service key to Vercel's browser/build variables with a `VITE_` prefix.

## Features

- Whole-crate-only inventory and checkout, retail/wholesale rates and configurable bulk discounts.
- Partial cash, split payments, mobile money, card-terminal references and named credit balances.
- Receipts show paid amounts and remaining client balance; reports include revenue owed and collections.
- Manager/admin stock deliveries, reason-required adjustments, audited price/settings changes, refunds and voids.
- Cashiers can sell, view stock/products and see their own sales. Managers/admins can access all sales and management screens.
- Local theme preference, print/share receipts, JSON data export and stock-movement audit history.

## Deployment configuration

The exact Vercel environment variable names are `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. The matching local template is [`.env.example`](./.env.example). No Supabase key is exposed through a `VITE_` browser variable.

## Checklist after setup

- [ ] Sign in with the first administrator; confirm sign-out and the 30-minute inactivity timeout.
- [ ] Create a cashier and manager; verify the cashier cannot edit prices, adjust stock, issue refunds, see other cashiers' sales or manage accounts.
- [ ] Complete a sale on one PC; attempt a sale for the final available crate from another PC at the same time; confirm stock never becomes negative and only successful sales reduce it.
- [ ] Confirm the receipt's cashier, client, amount paid and balance due, and confirm the revenue-owed report shows the client.
- [ ] Record a delivery and reasoned stock adjustment; confirm movement and audit history.
- [ ] Issue a partial refund and a full void as a manager; confirm audit entries, stock restoration for voids and updated net reports.
- [ ] Confirm sales, balances, stock and reports refresh from the shared database on a second PC.
- [ ] Confirm no card number is requested or stored; only the card/terminal reference is recorded.
