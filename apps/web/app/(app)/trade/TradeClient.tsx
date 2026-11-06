"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountView, FillRow } from "@/lib/server/engine";
import { INTERVALS, MARKETS, MARKET_BY_SYMBOL, displayPair, formatPrice, type IntervalKey, type MarketStats } from "@/lib/markets";
import { OrderBook } from "@/components/trade/OrderBook";
import { OrderForm } from "@/components/trade/OrderForm";
import { Positions } from "@/components/trade/Positions";
import { PriceChart, type ChartLine } from "@/components/trade/PriceChart";
import { Badge, Dot, Meter, cx } from "@/components/ui";
import { usePoll } from "@/lib/client";
import { pct, short, signedUsd, usd } from "@/lib/format";

const Panel = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <section className={cx("min-w-0 rounded-2xl border border-line bg-surface", className)}>{children}</section>
);

function MarketPicker({ value, stats, onChange }: { value: string; stats: Record<string, MarketStats>; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const m = MARKET_BY_SYMBOL[value];
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white/5">
        <span className="text-lg font-semibold">{displayPair(m)}</span>
        <Badge tone="neutral">{m.maxLeverage}×</Badge>
        <span className="text-muted" aria-hidden>⌄</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 top-12 z-40 w-72 rounded-2xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl shadow-black/60">
          {MARKETS.map((x) => {
            const s = stats[x.symbol];
            return (
              <li key={x.symbol}>
                <button
                  role="option"
                  aria-selected={x.symbol === value}
                  onClick={() => {
                    onChange(x.symbol);
                    setOpen(false);
                  }}
                  className={cx("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-white/5", x.symbol === value && "bg-white/[0.06]")}
                >
                  <span>
                    <span className="font-medium">{displayPair(x)}</span> <span className="text-xs text-muted">{x.name}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block">{s ? formatPrice(s.mark, x) : "—"}</span>
                    {s && <span className={cx("num text-xs", s.change24h >= 0 ? "text-up" : "text-down")}>{pct(s.change24h, 2)}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function TradeClient({ accounts, initialAccountId, initialMarket }: { accounts: AccountView[]; initialAccountId: string | null; initialMarket: string }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(initialMarket);
  const [interval, setInterval_] = useState<IntervalKey>("5m");
  const [accountId, setAccountId] = useState(initialAccountId);
  const market = MARKET_BY_SYMBOL[symbol];

  const markets = usePoll<{ stats: Record<string, MarketStats>; at: number }>("/api/markets", 2_000);
  const acct = usePoll<{ account: AccountView; fills: FillRow[] }>(accountId ? `/api/account?id=${accountId}` : null, 2_000);
  const account = acct.data?.account ?? accounts.find((a) => a.id === accountId) ?? null;
  const stats = markets.data?.stats[symbol];

  // Keep the URL shareable without a navigation.
  useEffect(() => {
    const q = new URLSearchParams();
    if (accountId) q.set("account", accountId);
    q.set("market", symbol);
    router.replace(`/trade?${q}`, { scroll: false });
  }, [accountId, symbol, router]);

  const position = account?.positions.find((p) => p.market === symbol);
  const lines = useMemo<ChartLine[]>(() => {
    if (!position) return [];
    const l: ChartLine[] = [{ price: position.entry, title: position.qty > 0 ? "Long" : "Short", tone: "entry" }];
    if (position.tp) l.push({ price: position.tp, title: "TP", tone: "tp" });
    if (position.sl) l.push({ price: position.sl, title: "SL", tone: "sl" });
    return l;
  }, [position]);

  const onAccount = (a: AccountView) => acct.setData((d) => ({ account: a, fills: d?.fills ?? [] }));
  const live = !!markets.data && !markets.error && Date.now() - markets.data.at < 15_000;

  return (
    <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_280px_320px]">
      {/* Market header */}
      <Panel className="flex items-center gap-6 overflow-x-auto px-3 py-2 lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <MarketPicker value={symbol} stats={markets.data?.stats ?? {}} onChange={setSymbol} />
        <dl className="flex shrink-0 gap-6 text-xs">
          {[
            ["Mark", stats ? formatPrice(stats.mark, market) : "—", null],
            ["Index", stats ? formatPrice(stats.index, market) : "—", null],
            ["24h change", stats ? pct(stats.change24h, 2) : "—", stats ? (stats.change24h >= 0 ? "text-up" : "text-down") : null],
            ["24h volume", stats ? `$${short(stats.volume24h)}` : "—", null],
            ["Open interest", stats ? `$${short(stats.openInterest)}` : "—", null],
            ["Funding / 1h", stats ? pct(stats.funding, 4) : "—", null],
          ].map(([k, v, tone]) => (
            <div key={k}>
              <dt className="text-faint">{k}</dt>
              <dd className={cx("num mt-0.5 text-sm", tone ?? undefined)}>{v}</dd>
            </div>
          ))}
        </dl>
        {stats && !stats.open && <Badge tone="warn">Market closed</Badge>}
      </Panel>

      {/* Chart */}
      <Panel className="flex h-[440px] flex-col lg:col-start-1 lg:row-start-2 lg:h-[520px]">
        <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
          {(Object.keys(INTERVALS) as IntervalKey[]).map((k) => (
            <button key={k} onClick={() => setInterval_(k)} className={cx("rounded-lg px-2.5 py-1 text-xs", interval === k ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}>
              {k}
            </button>
          ))}
          <span className="ml-auto pr-2 text-[11px] text-faint">{displayPair(market)} · Extended</span>
        </div>
        <div className="flex-1">
          <PriceChart symbol={symbol} interval={interval} mark={stats?.mark} decimals={market.priceDecimals} lines={lines} />
        </div>
      </Panel>

      {/* Order form + account (right column on desktop, right after the chart on mobile) */}
      <div className="space-y-2 lg:col-start-3 lg:row-span-3 lg:row-start-1">
        <Panel>
          <div className="border-b border-line p-3">
            <label htmlFor="acct" className="text-xs text-muted">Account</label>
            {accounts.length > 0 ? (
              <select
                id="acct"
                value={accountId ?? ""}
                onChange={(e) => setAccountId(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-accent"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.id}
                    {a.status !== "active" ? ` (${a.status})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm">No accounts yet — <Link href="/challenges" className="text-accent">buy a challenge</Link> or start a free demo.</p>
            )}
          </div>
          <OrderForm account={account} market={market} stats={stats} onPlaced={onAccount} />
        </Panel>

        {account && (
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Account summary</h2>
              <Badge tone={account.status === "active" ? (account.demo ? "neutral" : "warn") : account.status === "passed" ? "up" : "down"}>
                {account.status === "active" ? (account.demo ? "Demo" : `Simulated · phase ${account.step}/${account.steps}`) : account.status}
              </Badge>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {[
                ["Equity", usd(account.equity, true)],
                ["Balance", usd(account.balance, true)],
                ["Unrealized P&L", signedUsd(account.upnl)],
                ["Today", signedUsd(account.todayPnl)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
            {account.status === "active" && (
              <div className="mt-4 space-y-3 text-xs">
                {[
                  { label: `Profit target ${pct(account.rules.profitTarget)}`, o: account.objectives.profit, kind: "target" as const, right: `${usd(account.objectives.profit.remaining)} to go` },
                  { label: `Daily loss ${pct(account.rules.dailyLoss)}`, o: account.objectives.dailyLoss, kind: "loss" as const, right: `${usd(account.objectives.dailyLoss.remaining)} left` },
                  { label: `Max drawdown ${pct(account.rules.maxDrawdown)}`, o: account.objectives.drawdown, kind: "loss" as const, right: `${usd(account.objectives.drawdown.remaining)} left` },
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
            )}
            {account.status === "breached" && (
              <p className="mt-3 text-xs text-down">This account was closed: {account.breachReason === "daily_loss" ? "daily loss limit" : "max drawdown"} reached.</p>
            )}
            {account.status === "passed" && <p className="mt-3 text-xs text-up">Target reached — {account.demo ? "nice practice run." : "next: KYC, then your funded account."}</p>}
          </Panel>
        )}
      </div>

      {/* Order book */}
      <Panel className="h-[440px] overflow-hidden lg:col-start-2 lg:row-start-2 lg:h-[520px]">
        <OrderBook market={market} />
      </Panel>

      {/* Positions + history */}
      <Panel className="lg:col-span-2 lg:col-start-1 lg:row-start-3">
        <Positions account={account} fills={acct.data?.fills ?? []} onChange={onAccount} />
      </Panel>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-2 text-[11px] text-faint lg:col-span-3">
        <span className="flex items-center gap-1.5">
          <Dot tone={live ? "up" : "warn"} /> {live ? "Extended live" : "Prices delayed"}
        </span>
        <span>Evaluation fills walk the venue&apos;s real order book · taker fee 0.05%</span>
      </div>
    </div>
  );
}
