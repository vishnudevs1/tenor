"use client";

import Link from "next/link";
import type { AccountView } from "@/lib/server/engine";
import { Badge, ButtonLink, Meter, cx } from "@/components/ui";
import { usePoll } from "@/lib/client";
import { pct, signedUsd, usd } from "@/lib/format";

function Money({ n }: { n: number }) {
  const [whole, cents] = usd(n, true).split(".");
  return (
    <span className="num">
      {whole}
      <span className="text-muted">.{cents}</span>
    </span>
  );
}

function StatusBadge({ a }: { a: AccountView }) {
  if (a.status === "breached") return <Badge tone="down">Breached</Badge>;
  if (a.status === "passed") return <Badge tone="up">{a.demo ? "Demo passed" : "Passed"}</Badge>;
  if (a.steps === 2) return <Badge tone="accent">Phase {a.step} of 2</Badge>;
  return <Badge tone={a.demo ? "neutral" : "warn"}>{a.demo ? "Demo" : "Evaluation"}</Badge>;
}

function AccountCard({ a }: { a: AccountView }) {
  const pnl = a.equity - a.size;
  const o = a.objectives;
  return (
    <Link
      href={`/trade?account=${a.id}`}
      className={cx(
        "group block rounded-card border bg-surface p-5 transition-colors hover:border-line-strong",
        a.status === "active" ? "border-line" : "border-line opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{a.name}</div>
          <div className="num text-xs text-faint">{a.id}</div>
        </div>
        <StatusBadge a={a} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted">Equity</div>
          <div className="text-2xl font-medium"><Money n={a.equity} /></div>
        </div>
        <div className={cx("num text-sm", pnl >= 0 ? "text-up" : "text-down")}>
          {signedUsd(pnl)} · {pct(pnl / a.size, 2)}
        </div>
      </div>
      {a.status === "active" ? (
        <div className="mt-5 space-y-3 text-xs">
          {[
            { label: "Profit target", o: o.profit, kind: "target" as const, right: `${usd(o.profit.remaining)} to go` },
            { label: "Daily loss", o: o.dailyLoss, kind: "loss" as const, right: `${usd(o.dailyLoss.remaining)} left today` },
            { label: "Max drawdown", o: o.drawdown, kind: "loss" as const, right: `${usd(o.drawdown.remaining)} left` },
          ].map((r) => (
            <div key={r.label}>
              <div className="mb-1.5 flex justify-between text-muted">
                <span>{r.label}</span>
                <span className="num">{r.right}</span>
              </div>
              <Meter value={r.o.progress} kind={r.kind} label={r.label} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-xs text-muted">
          {a.status === "breached"
            ? `Ended: ${a.breachReason === "daily_loss" ? "daily loss limit" : "max drawdown"} reached.`
            : a.demo
              ? "Target reached. Buy a challenge to get funded."
              : "Target reached. Complete KYC to receive your funded account."}
        </p>
      )}
    </Link>
  );
}

export function HomeClient({ initial, firstName }: { initial: AccountView[]; firstName: string | null }) {
  const { data, error } = usePoll<{ accounts: AccountView[] }>("/api/accounts", 4_000, { accounts: initial });
  const accounts = data?.accounts ?? initial;
  const active = accounts.filter((a) => a.status === "active");
  const ended = accounts.filter((a) => a.status !== "active");
  const total = active.reduce((s, a) => s + a.equity, 0);
  const today = active.reduce((s, a) => s + a.todayPnl, 0);
  const stale = active.some((a) => a.priceStale) || !!error;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="text-center">
        {firstName && <div className="text-sm text-muted">Welcome back, {firstName}</div>}
        <div className="mt-2 text-5xl font-medium tracking-tight sm:text-6xl"><Money n={total} /></div>
        <div className={cx("num mt-2 text-sm", today >= 0 ? "text-up" : "text-down")}>
          {signedUsd(today)} <span className="text-muted">today</span>
        </div>
        {stale && <div className="mt-2 text-xs text-warn">Live prices are delayed. Values may be out of date.</div>}

        <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-3">
          <ButtonLink href={active[0] ? `/trade?account=${active[0].id}` : "/trade"} size="lg">Trade</ButtonLink>
          <ButtonLink href="/challenges" size="lg" variant="secondary">Buy Challenge</ButtonLink>
        </div>
        <div className="mx-auto mt-5 flex max-w-md items-center justify-between rounded-full border border-line px-4 py-2.5 text-sm">
          <span className="text-muted">
            Available for withdrawal: <span className="num text-up">$0.00</span>
          </span>
          <Link href="/payouts" className="text-muted hover:text-fg">Payouts →</Link>
        </div>
      </div>

      <section className="mt-14">
        <h2 className="text-sm text-muted">Challenges ({active.length})</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((a) => <AccountCard key={a.id} a={a} />)}
          <Link href="/challenges" className="grid min-h-40 place-items-center rounded-card border border-dashed border-line-strong text-muted transition-colors hover:border-fg/40 hover:text-fg">
            <span className="text-center">
              <span className="block text-2xl" aria-hidden>+</span>
              <span className="text-sm">Buy Challenge</span>
            </span>
          </Link>
        </div>
      </section>

      {ended.length > 0 && (
        <section className="mt-12">
          <h2 className="text-sm text-muted">History ({ended.length})</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ended.map((a) => <AccountCard key={a.id} a={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
