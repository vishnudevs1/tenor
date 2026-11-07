import type { Metadata } from "next";
import { Badge, Card, Dot, Stat } from "@/components/ui";
import { IS_DEMO, coverage, firm, recentPayouts } from "@/lib/data";
import { arc, txUrl } from "@/lib/arc";
import { pct, shortHash, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Transparency | Tenor" };

export default function TransparencyPage() {
  const required = firm.liveMaxLoss * firm.bufferTarget;
  const healthy = firm.reserveAssets >= required;
  // Scale bars against whichever is larger so both always fit.
  const scale = Math.max(firm.reserveAssets, required);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="up"><Dot /> Live on {arc.name}</Badge>
        {IS_DEMO && <Badge tone="warn">Demo data</Badge>}
      </div>
      <h1 className="mt-5 font-display text-5xl leading-[1.02] sm:text-6xl">We publish our liabilities.</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Reserves alone say nothing. What matters is whether they cover the worst case of every funded trader at once. Here's that number, read straight from the RiskReserve contract.
      </p>

      {/* Coverage hero */}
      <Card className="mt-10 p-6 sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <div className="text-sm text-muted">Coverage ratio</div>
            <div className={`num mt-2 text-7xl font-medium sm:text-8xl ${healthy ? "text-up" : "text-down"}`}>{coverage.toFixed(2)}×</div>
            <p className="mt-3 text-sm text-muted">
              Target ≥ {firm.bufferTarget}×. New funded accounts are <span className="text-fg">blocked by contract</span> below it.
            </p>
          </div>
          <div className="space-y-6">
            {[
              { label: "Reserve assets (USDC on Arc)", value: firm.reserveAssets, color: "bg-up" },
              { label: `Required (live max loss × ${firm.bufferTarget})`, value: required, color: "bg-accent" },
              { label: "Live max loss of all funded accounts", value: firm.liveMaxLoss, color: "bg-white/30" },
            ].map((b) => (
              <div key={b.label}>
                <div className="flex justify-between gap-4 text-sm">
                  <span className="text-muted">{b.label}</span>
                  <span className="num">{usd(b.value)}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${b.color}`} style={{ width: `${(b.value / scale) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "A-book share of funded volume", value: pct(firm.aBookShare), hint: "Always 100%" },
          { label: "Median payout time", value: `${firm.medianPayoutMinutes} min`, hint: "Target < 15 min" },
          { label: "Pass rate · trailing 90d", value: pct(firm.passRate90d), hint: "Feeds the PricingEngine" },
          { label: "Breach → flatten · p95", value: `${firm.breachToFlattenP95Ms} ms`, hint: "Target < 1 s" },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <Stat label={k.label} value={k.value} hint={k.hint} />
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Venue exposure */}
        <Card className="p-6">
          <h2 className="font-semibold">Funded capital by venue</h2>
          <p className="mt-1 text-sm text-muted">No venue may hold more than {pct(firm.venueCap)} of funded capital.</p>
          <div className="mt-6 space-y-5">
            {firm.venues.map((v) => (
              <div key={v.name}>
                <div className="flex justify-between text-sm">
                  <span>
                    {v.name} <span className="text-muted">· {v.role}</span>
                  </span>
                  <span className="num">{pct(v.share)}</span>
                </div>
                <div className="relative mt-2 h-2.5 rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${v.share * 100}%` }} />
                  <div className="absolute inset-y-[-4px] w-px bg-warn" style={{ left: `${firm.venueCap * 100}%` }} title="Venue cap" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Payouts */}
        <Card className="p-6">
          <h2 className="font-semibold">Recent payouts</h2>
          <p className="mt-1 text-sm text-muted">Every payout is a transaction you can open on the Arc explorer.</p>
          <ul className="mt-4 divide-y divide-line">
            {recentPayouts.map((p) => (
              <li key={p.hash} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <div className="num text-sm">{p.trader}</div>
                  <a href={txUrl(p.hash)} target="_blank" rel="noreferrer" className="num text-xs text-faint hover:text-accent">
                    {shortHash(p.hash)} ↗
                  </a>
                </div>
                <div className="text-right">
                  <div className="num text-sm">
                    {usd(p.amount, true)} <span className="text-muted">→ {p.currency}</span>
                  </div>
                  <div className="text-xs text-faint">{p.minutes} min after request</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
