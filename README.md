# The Bait — Agency Operating System

Client portal, projects & tasks, invoicing & payments, contracts, AI meeting summaries, built-in spreadsheets, team management, and a subscription-gated feature set — all in one NestJS + Next.js + MongoDB app.

## What's here

- **backend/** — NestJS API (MongoDB via Mongoose, JWT auth, Razorpay payments/subscriptions, Hugging Face AI summaries).
- **frontend/** — Next.js App Router (edge middleware route protection, dashboard for agency staff, client portal, marketing homepage).

## Roles

| Role | Scope |
|---|---|
| `superadmin` | The developer/operator. Cross-tenant access via `/admin`. |
| `agency_owner` | Created the agency, full control over it, only one who can manage billing. |
| `agency_member` | Invited staff inside an agency. |
| `client` | End-client of an agency, sees only their own data via `/portal`. |

## Running locally

### Backend
```bash
cd backend
npm install
cp .env.example .env   # fill in MongoDB URI, JWT secrets, Razorpay keys, Hugging Face token, Google OAuth
npm run start:dev
```
Generate JWT secrets with `openssl rand -hex 64`.

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local   # JWT_ACCESS_SECRET must match the backend exactly
npm run dev
```

## Feature map

| Feature | Free tier? | Notes |
|---|---|---|
| Client portal | ✅ | 1 client cap on free plan |
| Invoices & payments | ✅ | 1 invoice cap on free plan; Razorpay Checkout |
| Projects (status + deadline) | ✅ | Unlimited on any plan |
| Contracts + e-sign + PDF | Monthly/Yearly only | Lightweight e-sign (typed name + IP), not legally-binding-grade |
| AI meeting summaries | Monthly/Yearly only | Hugging Face free-tier inference (no uptime SLA) |
| Teams + task assignment | Monthly/Yearly only | Kanban board, staff-only |
| Accounts / spreadsheets | Monthly/Yearly only | Formulas (SUM/AVERAGE/MIN/MAX/COUNT + arithmetic), Excel import/export |
| Google OAuth | ✅ | Auto-links to existing password account by email |
| Forgot/reset/change password | ✅ | No email provider wired up — reset link returned directly in dev |

## Subscription plans

Restructured to **Free / Monthly / Yearly**. Free is simply the absence of a `Subscription` document (capped at 1 client + 1 invoice). Monthly and Yearly both unlock everything else; Yearly is priced as a discount vs. paying monthly for 12 months.

### Razorpay setup checklist
1. Add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (Dashboard → Settings → API Keys).
2. Create 2 Plans (Monthly, Yearly) in Dashboard → Subscriptions → Plans, paste their IDs into `RAZORPAY_PLAN_MONTHLY` / `RAZORPAY_PLAN_YEARLY`.
3. Add a webhook pointing to `https://your-api-domain.com/api/webhooks/razorpay`, subscribed to: `payment.captured`, `payment.failed`, `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
4. Locally, use ngrok or the Razorpay CLI to forward webhooks to `localhost:4000`.

## Google OAuth setup checklist
1. Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (Web application).
2. Authorized redirect URI: `http://localhost:4000/api/auth/google/callback` (update for production).
3. Paste `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` into backend `.env`.

## Spreadsheets & formulas

Cells starting with `=` are formulas: `=A1+B2`, `=SUM(A1:A10)`, `=AVERAGE(...)`, `=MIN`, `=MAX`, `=COUNT`, evaluated safely via `mathjs` (never `eval`), with circular-reference detection. Uploading an existing `.xlsx`/`.xls`/`.csv` preserves formulas from the file as live formulas rather than flattening them to static text; exporting writes real Excel formulas back out with a cached value alongside. Limitation: understands basic arithmetic + those 5 functions, not the full Excel formula language — complex imported formulas (VLOOKUP, IF, etc.) show `#ERROR!` in-app but their text still round-trips correctly on export.

## AI Meeting Summaries

Uses Hugging Face's free-tier routed inference (`meta-llama/Llama-3.1-8B-Instruct` via `router.huggingface.co`) — get a free token at huggingface.co/settings/tokens. Summarization runs as a fire-and-forget background job; the frontend polls every 3s until the summary completes or fails, with a manual retry button since free-tier inference can cold-start (503) under load.

## Payments + Invoices

`Invoice` + `Payment` schemas, `RazorpayService` (order creation + both signature verifications), idempotent webhook handling via a unique index on `razorpayPaymentId`, amounts stored in minor units (paise) everywhere. Receipt field capped at `inv_` + last 12 chars of the invoice ID (≤16 chars, well under Razorpay's 40-char limit).

## Authentication

Email/password (bcrypt, 12 rounds) and Google OAuth, both issuing the same JWT cookie pair. Refresh tokens are hashed at rest, rotated on every use, with the whole session chain revoked if a rotated-out token is replayed. Password reset tokens follow the same single-use, hashed, short-TTL pattern. Every route is protected by default (`JwtAuthGuard` is global) — opt a route **out** with `@Public()`, never opt one in.

## What's next (not yet built)

- Real transactional email (client invites and password resets currently just return a link)
- Richer admin cross-tenant analytics views
- A real e-sign provider if contracts need to be legally binding
- Formula language expansion (IF, VLOOKUP, etc.) if the built-in spreadsheet needs to go further
