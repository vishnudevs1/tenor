# Tenor

A 100% A book prop firm built entirely on Circle's Arc: every funded trade is a real fill, every possible loss is pre-funded on-chain.

```
apps/web/                Next.js 16 app (Tailwind v4)
  app/(site)/            Public: landing, /transparency
  app/(app)/             Signed-in app (top nav; bottom tabs on mobile)
    dashboard/           Home: total equity, today's P&L, challenge cards (live)
    challenges/          Buy Challenge: sizes Demo–200K, 1/2-step, Classic/Turbo/Pro, cart
    checkout/            Pay USDC on Arc → server verifies on-chain → accounts open
    trade/               Chart, live order book, order form, positions, history
    payouts/             Payout status (funded accounts not live yet)
  app/api/               JSON API (all fixed paths, auth checked per route)
  lib/server/
    venue.ts             Extended (Arc venue) market data: stats, order book, candles, trades
    engine.ts            Evaluation engine: fills, marking, TP/SL, breaches, phase progression
    checkout.ts          Order pricing + USDC payment verification on Arc
    db.ts                SQLite (node:sqlite) schema — swap for Postgres here
  lib/data.ts            Transparency DEMO data only (badged "Demo data" in the UI)
  test/                  Integration tests (live venue data + Arc testnet RPC)
packages/rules/          Shared, pure: rules, pricing, product catalog, execution math (+ unit tests)
contracts/               Solidity: RiskReserve (coverage invariant), PricingEngine, interfaces
```

## Setup

1. `npm install`
2. Google sign-in (Auth.js): create an OAuth client (Web) in Google Cloud Console with redirect URI
   `http://localhost:3000/api/auth/callback/google`; put `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `apps/web/.env.local`.
3. Checkout: set `TENOR_TREASURY_ADDRESS` in `apps/web/.env.local` to a wallet you control. On testnet, get USDC at https://faucet.circle.com.
4. `npm run dev` → http://localhost:3000

All variables are documented in `apps/web/.env.example`.

```bash
npm test                                   # unit tests (rules, pricing, catalog, execution)
cd apps/web && npm run test:engine         # engine + checkout integration (live data, throwaway DB)
```

## How the evaluation works
- **Prices:** Extended's public API (mark, index, book, candles). Pyth's Hermes API now requires a key, so it isn't used.
- **Fills:** market orders walk the venue's real order book (VWAP), plus a 0.05% taker fee. Orders larger than the visible book are rejected.
- **Rules:** enforced server-side by `@tenor/rules` on every read, order and risk sweep:
  TP/SL → UTC daily rollover → breach (closes everything) → pass (2-step moves to phase 2).
- **Staleness guard:** with prices older than 15 s, nothing is enforced and no orders fill (no breaches from bad data).
- **Risk sweep:** `GET /api/cron/risk` with `Authorization: Bearer $CRON_SECRET` checks every active account. **Schedule it every minute in production.** Without it, rules are only enforced when the trader has the app open.

## Payments
Cart is priced on the server → the wallet signs an order message (proves ownership) → USDC `transfer` to the treasury →
the server checks the receipt on Arc (USDC Transfer log, from the signed wallet, to the treasury, ≥ total, after the order was created, tx hash never reused) → accounts open.
If the tab closes mid-payment, checkout offers **Verify now** on return.

## Arc notes (from docs.arc.io)
- Testnet chain ID `5042002`, mainnet `5042`.
- USDC is the gas token: **native = 18 decimals, ERC-20 = 6 decimals.** Everything here uses the ERC-20 view.
- Set `maxFeePerGas ≥ 20 gwei` or transactions are silently dropped (checkout enforces this).
- Finality is one block; order events by block number, not timestamp.

## Not built yet
- **Funded accounts and payouts:** need venue sub-accounts + trade-only keys (edgeX/Extended/Hibachi) and `PayoutModule`.
- **KYC** (Sumsub/Socure) before funding.
- **Contracts on testnet:** RiskReserve/PricingEngine aren't deployed; `/transparency` shows demo data until they are.
- Limit orders, Analytics, Competitions, Leaderboard, Points.
- Production DB (Postgres) and a hosted cron for the risk sweep.
