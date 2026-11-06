"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { evaluate, unrealized } from "@tenor/rules";
import type { AccountView, ClosedTrade } from "@/lib/server/engine";
import { CHART_INTERVALS, MARKETS, MARKET_BY_SYMBOL, displayPair, formatPrice, type ChartInterval, type MarketStats } from "@/lib/markets";
import { OrderBook } from "@/components/trade/OrderBook";
import { OrderForm } from "@/components/trade/OrderForm";
import { Positions } from "@/components/trade/Positions";
import { PriceChart, type ChartLine } from "@/components/trade/PriceChart";
import { Badge, Dot, Meter, cx } from "@/components/ui";
import { usePoll } from "@/lib/client";
import { useMarks, useTrades } from "@/lib/stream";
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
                    {s && !s.open && <span className="ml-1.5 text-[10px] text-warn">closed</span>}
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
  const [interval, setInterval_] = useState<ChartInterval>("1m");
  const [accountId, setAccountId] = useState(initialAccountId);
  const market = MARKET_BY_SYMBOL[symbol];

  // Slow-moving stats (24h volume, OI, funding, open/closed) over REST; prices stream live below.
  const markets = usePoll<{ stats: Record<string, MarketStats>; at: number }>("/api/markets", 5_000);
  const acct = usePoll<{ account: AccountView; history: ClosedTrade[] }>(accountId ? `/api/account?id=${accountId}` : null, 3_000);
  const account = acct.data?.account ?? accounts.find((a) => a.id === accountId) ?? null;
  const stats = markets.data?.stats[symbol];

  // Live marks for the selected market and every market with an open trade.
  const marks = useMarks([symbol, ...(account?.positions.map((p) => p.market) ?? [])]);
  const { last, live: streamLive } = useTrades(symbol, 1);
  const mark = marks[symbol] ?? stats?.mark ?? 0;

  // Live equity/objectives between server polls (display only — the server is authoritative).
  const liveAccount = useMemo(() => {
    if (!account) return null;
    const upnl = account.positions.reduce((s, p) => s + unrealized(p, marks[p.market] ?? p.mark), 0);
    const equity = account.balance + upnl;
    const objectives = evaluate({ phase: "evaluation", initialBalance: account.size, dayStartEquity: account.dayStartEquity, equity }, account.rules);
    return { ...account, upnl, equity, todayPnl: account.status === "active" ? equity - account.dayStartEquity : 0, objectives };
  }, [account, marks]);

  useEffect(() => {
    const q = new URLSearchParams();
    if (accountId) q.set("account", accountId);
    q.set("market", symbol);
    router.replace(`/trade?${q}`, { scroll: false });
  }, [accountId, symbol, router]);

  const lines = useMemo<ChartLine[]>(() => {
    const here = (account?.positions ?? []).filter((p) => p.market === symbol).slice(-12);
    return here.flatMap((p) => {
      const l: ChartLine[] = [{ price: p.entry, title: `#${p.id} ${p.qty > 0 ? "Long" : "Short"}`, tone: p.qty > 0 ? "entry-long" : "entry-short" }];
      if (p.tp) l.push({ price: p.tp, title: `#${p.id} TP`, tone: "tp" });
      if (p.sl) l.push({ price: p.sl, title: `#${p.id} SL`, tone: "sl" });
      return l;
    });
  }, [account, symbol]);

  const onAccount = (a: AccountView) => {
    acct.setData((d) => ({ account: a, history: d?.history ?? [] }));
    acct.refresh(); // pull the new trade-history row right away
  };

  const a = liveAccount;
  return (
    <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_280px_320px]">
      {/* Market header */}
      <Panel className="flex items-center gap-6 overflow-x-auto px-3 py-2 lg:col-span-2 lg:col-start-1 lg:row-start-1">
        <MarketPicker value={symbol} stats={markets.data?.stats ?? {}} onChange={setSymbol} />
        <div className="shrink-0">
          <div className="num text-xl font-semibold">{last ? formatPrice(last, market) : mark ? formatPrice(mark, market) : "—"}</div>
          <div className="text-[11px] text-faint">Last trade</div>
        </div>
        <dl className="flex shrink-0 gap-6 text-xs">
          {[
            ["Mark", mark ? formatPrice(mark, market) : "—", null],
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
        {stats && !stats.open && <Badge tone="warn">Market closed · closing trades still allowed</Badge>}
      </Panel>

      {/* Chart */}
      <Panel className="flex h-[440px] flex-col lg:col-start-1 lg:row-start-2 lg:h-[520px]">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {CHART_INTERVALS.map((k) => (
            <button key={k} onClick={() => setInterval_(k)} className={cx("shrink-0 rounded-lg px-2.5 py-1 text-xs", interval === k ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}>
              {k}
            </button>
          ))}
          <span className="ml-auto shrink-0 pr-2 text-[11px] text-faint">{displayPair(market)} · Extended · TradingView</span>
        </div>
        <div className="flex-1">
          <PriceChart symbol={symbol} interval={interval} decimals={market.priceDecimals} lines={lines} />
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
                {accounts.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.id}
                    {x.status !== "active" ? ` (${x.status})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="mt-1 text-sm">No accounts yet — <Link href="/challenges" className="text-accent">buy a challenge</Link> or start a free demo.</p>
            )}
          </div>
          <OrderForm account={a} market={market} stats={stats} mark={mark} equity={a?.equity ?? 0} onPlaced={onAccount} />
        </Panel>

        {a && (
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Account summary</h2>
              <Badge tone={a.status === "active" ? (a.demo ? "neutral" : "warn") : a.status === "passed" ? "up" : "down"}>
                {a.status === "active" ? (a.demo ? "Demo" : `Simulated · phase ${a.step}/${a.steps}`) : a.status}
              </Badge>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              {[
                ["Equity", usd(a.equity, true)],
                ["Balance", usd(a.balance, true)],
                ["Unrealized P&L", signedUsd(a.upnl)],
                ["Today", signedUsd(a.todayPnl)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
            {a.status === "active" && (
              <div className="mt-4 space-y-3 text-xs">
                {[
                  { label: `Profit target ${pct(a.rules.profitTarget)}`, o: a.objectives.profit, kind: "target" as const, right: `${usd(a.objectives.profit.remaining)} to go` },
                  { label: `Daily loss ${pct(a.rules.dailyLoss)}`, o: a.objectives.dailyLoss, kind: "loss" as const, right: `${usd(a.objectives.dailyLoss.remaining)} left` },
                  { label: `Max drawdown ${pct(a.rules.maxDrawdown)}`, o: a.objectives.drawdown, kind: "loss" as const, right: `${usd(a.objectives.drawdown.remaining)} left` },
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
            {a.status === "breached" && <p className="mt-3 text-xs text-down">This account was closed: {a.breachReason === "daily_loss" ? "daily loss limit" : "max drawdown"} reached.</p>}
            {a.status === "passed" && <p className="mt-3 text-xs text-up">Target reached — {a.demo ? "nice practice run." : "next: KYC, then your funded account."}</p>}
          </Panel>
        )}
      </div>

      {/* Order book */}
      <Panel className="h-[440px] overflow-hidden lg:col-start-2 lg:row-start-2 lg:h-[520px]">
        <OrderBook market={market} />
      </Panel>

      {/* Open trades + history */}
      <Panel className="lg:col-span-2 lg:col-start-1 lg:row-start-3">
        <Positions account={account} history={acct.data?.history ?? []} marks={marks} onChange={onAccount} />
      </Panel>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-4 px-2 text-[11px] text-faint lg:col-span-3">
        <span className="flex items-center gap-1.5">
          <Dot tone={streamLive ? "up" : "warn"} /> {streamLive ? "Streaming live" : "Reconnecting…"}
        </span>
        <span>Every order is its own trade · fills walk Extended&apos;s real order book · taker fee 0.05%</span>
      </div>
    </div>
  );
}
