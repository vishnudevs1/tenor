import type { Metadata } from "next";
import { currentUser } from "@/lib/server/user";
import { activeCapital } from "@/lib/server/checkout";
import { ChallengeShop } from "./ChallengeShop";

export const metadata: Metadata = { title: "Buy Challenge | Tenor" };

const STEPS = [
  ["Complete a challenge", "Hit the profit target on a simulated account using live venue prices."],
  ["Get verified", "One-time KYC. Takes about 5 minutes and unlocks payouts."],
  ["Become a funded trader", "Trade real capital on Arc-native venues and keep 80% of profits."],
  ["Receive your payouts", "Paid on Arc in USDC or your local stablecoin, on demand."],
];

const FAQ = [
  ["What is a prop firm?", "A proprietary trading firm gives traders capital to trade. You pay a one-time fee for an evaluation; pass it without breaking the loss limits and you trade the firm's real capital, keeping 80% of profits."],
  ["Is the evaluation live trading?", "No. Evaluations are simulated, but every fill walks the real order book of an Arc venue (Extended), so prices, spreads and slippage are what the market would have given you."],
  ["What counts as a breach?", "Equity touching the daily loss limit (measured from the day's starting equity, reset 00:00 UTC) or the static max drawdown (measured from the starting balance). Open positions are closed automatically."],
  ["How do 2-step challenges work?", "Phase 1 has an 8% target, phase 2 a 5% target, with the same loss limits. Passing phase 1 resets the balance and starts phase 2 on the same account."],
  ["How do I pay?", "In USDC on Arc. Connect a wallet at checkout, sign a message to prove it's yours, and send the payment. Accounts open as soon as the transaction is verified on-chain."],
  ["Why do prices differ from other firms?", "Fees are set from our trailing pass rate so that every funded account's worst-case loss is pre-funded, so we never need a B-book. Turbo is cheapest because its drawdown is tightest."],
];

export default async function ChallengesPage() {
  const user = (await currentUser())!;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="text-center">
        <h1 className="font-display text-5xl leading-[1.02] sm:text-6xl">Choose your next challenge</h1>
        <p className="mt-3 text-muted">Pick your path to funding, or practise risk-free with a demo account.</p>
      </div>

      <ChallengeShop activeCapital={await activeCapital(user.id)} />

      <section className="mt-24">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="rounded-card border border-line bg-surface p-6">
              <div className="font-display text-4xl text-muted">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-8 font-semibold">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-24 max-w-3xl">
        <div className="text-center text-sm text-muted">Knowledge</div>
        <h2 className="mt-2 text-center font-display text-4xl sm:text-5xl">Frequently asked questions</h2>
        <div className="mt-10 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                {q}
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-180" aria-hidden>
                  ⌄
                </span>
              </summary>
              <p className="mt-3 pr-10 text-[15px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
