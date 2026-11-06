import type { Metadata } from "next";
import { PROFIT_SPLIT } from "@tenor/rules";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { CURRENCIES } from "@/lib/data";
import { listAccounts } from "@/lib/server/engine";
import { currentUser } from "@/lib/server/user";
import { pct } from "@/lib/format";

export const metadata: Metadata = { title: "Payouts — Tenor" };

export default async function PayoutsPage() {
  const user = (await currentUser())!;
  const passed = (await listAccounts(user.id)).filter((a) => a.status === "passed" && !a.demo);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
      <p className="mt-1 text-sm text-muted">Profit from funded accounts, paid on Arc in USDC or your local stablecoin.</p>

      <Card className="mt-8 p-6 text-center sm:p-10">
        <div className="text-sm text-muted">Available for withdrawal</div>
        <div className="num mt-2 text-5xl font-medium">$0<span className="text-muted">.00</span></div>
        <p className="mx-auto mt-4 max-w-md text-sm text-muted">
          Payouts come from real profit on a funded account. Pass an evaluation, complete KYC, and you&apos;ll keep {pct(PROFIT_SPLIT)} of what you make.
        </p>
        <ButtonLink href="/challenges" className="mt-6">Buy a challenge</ButtonLink>
      </Card>

      {passed.length > 0 && (
        <Card className="mt-4 divide-y divide-line">
          <div className="px-5 py-4 text-sm font-medium">Passed evaluations</div>
          {passed.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="num text-xs text-faint">{a.id}</div>
              </div>
              <Badge tone="warn">Awaiting KYC & funding</Badge>
            </div>
          ))}
        </Card>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["1. Pass", "Hit the profit target without breaching a loss limit."],
          ["2. Verify", "One-time KYC before your first funded account."],
          ["3. Get paid", "Request any time; settles on Arc in seconds."],
        ].map(([t, b]) => (
          <Card key={t} className="p-5">
            <div className="text-sm font-medium">{t}</div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{b}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <div className="text-sm font-medium">Payout currencies</div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CURRENCIES.map((c) => (
            <li key={c.code} className="rounded-full border border-line px-3 py-1.5 text-xs">
              <span className="font-medium">{c.code}</span> <span className="text-muted">{c.label}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
