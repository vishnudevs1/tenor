"use client";

import { useState } from "react";
import { unrealized } from "@tenor/rules";
import type { AccountView, ClosedTrade, TicketView } from "@/lib/server/engine";
import { MARKET_BY_SYMBOL, displayPair, formatPrice } from "@/lib/markets";
import { api } from "@/lib/client";
import { signedUsd, usd } from "@/lib/format";
import { cx } from "../ui";

const REASONS: Record<string, string> = { close: "Closed", partial: "Partial close", tp: "Take profit", sl: "Stop loss", breach: "Breach", pass: "Target reached" };
const CLOSE_SIZES = [
  { label: "25%", f: 0.25 },
  { label: "50%", f: 0.5 },
  { label: "75%", f: 0.75 },
  { label: "All", f: 1 },
];
const fmt = (n: number | null | undefined, market: string) => {
  const m = MARKET_BY_SYMBOL[market];
  return n == null ? "—" : m ? formatPrice(n, m) : String(n);
};
const age = (ts: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

function TpSlEditor({ t, onSave, onCancel }: { t: TicketView; onSave: (tp: string, sl: string) => Promise<void>; onCancel: () => void }) {
  const [tp, setTp] = useState(t.tp ? String(t.tp) : "");
  const [sl, setSl] = useState(t.sl ? String(t.sl) : "");
  const [busy, setBusy] = useState(false);
  const f = "num h-7 w-24 rounded-lg border border-line bg-bg px-2 text-xs outline-none focus:border-accent";
  return (
    <form
      className="flex items-center justify-end gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(tp, sl);
        setBusy(false);
      }}
    >
      <input aria-label="Take profit" placeholder="TP" inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ""))} className={f} autoFocus />
      <input aria-label="Stop loss" placeholder="SL" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ""))} className={f} />
      <button type="submit" disabled={busy} className="rounded-full bg-fg px-2.5 py-1 text-bg disabled:opacity-50">{busy ? "…" : "Save"}</button>
      <button type="button" onClick={onCancel} className="px-1 text-muted hover:text-fg">✕</button>
    </form>
  );
}

export function Positions({ account, history, marks, onChange }: { account: AccountView | null; history: ClosedTrade[]; marks: Record<string, number>; onChange: (a: AccountView) => void }) {
  const [tab, setTab] = useState<"open" | "history">("open");
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null); // row whose close-size options are showing
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tickets = account?.positions ?? [];
  const canTrade = account?.status === "active";

  async function run(key: number | "all", fn: () => Promise<{ account: AccountView }>) {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      onChange((await fn()).account);
      if (key === editing) setEditing(null);
    } catch (e) {
      setErrors((x) => ({ ...x, [key]: (e as Error).message }));
    } finally {
      setBusy(null);
    }
  }
  const close = (ticketId: number | "all", fraction = 1) => {
    setChoosing(null);
    return run(ticketId, () => api("/api/orders/close", { body: { accountId: account!.id, ticketId, fraction } }));
  };
  const save = (t: TicketView, tp: string, sl: string) => run(t.id, () => api("/api/orders/update", { body: { accountId: account!.id, ticketId: t.id, tp, sl } }));

  const live = tickets.map((t) => {
    const mark = marks[t.market] ?? t.mark;
    return { ...t, mark, upnl: unrealized(t, mark), notional: Math.abs(t.qty) * mark };
  });
  const totalUpnl = live.reduce((s, t) => s + t.upnl, 0);

  return (
    <div>
      <div className="flex items-center border-b border-line text-sm">
        {(["open", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("px-4 py-2.5", tab === t ? "border-b-2 border-fg font-medium" : "text-muted hover:text-fg")}>
            {t === "open" ? `Open trades (${tickets.length})` : `Trade history (${history.length})`}
          </button>
        ))}
        {tab === "open" && tickets.length > 0 && (
          <div className="ml-auto flex items-center gap-3 pr-3 text-xs">
            <span className={cx("num", totalUpnl >= 0 ? "text-up" : "text-down")}>{signedUsd(totalUpnl)}</span>
            <button onClick={() => close("all")} disabled={busy !== null || !canTrade} className="rounded-full border border-line px-3 py-1 hover:border-down hover:text-down disabled:opacity-40">
              {busy === "all" ? "Closing…" : "Close all"}
            </button>
          </div>
        )}
      </div>
      {errors.all && <p role="alert" className="border-b border-line bg-down/10 px-4 py-2 text-xs text-down">{errors.all}</p>}

      {tab === "open" ? (
        live.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No open trades</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-xs">
              <thead className="text-left text-faint">
                <tr>
                  {["Trade", "Market", "Size", "Value", "Entry", "Mark", "P&L", "TP / SL", ""].map((h, i) => (
                    <th key={i} className={cx("px-3 py-2.5 font-normal", i >= 2 && i <= 7 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {live.map((t) => {
                  const m = MARKET_BY_SYMBOL[t.market];
                  const pct = (t.upnl / (Math.abs(t.qty) * t.entry)) * 100;
                  return (
                    <tr key={t.id} className="align-middle">
                      <td className="num px-3 py-3 text-muted">
                        #{t.id} <span className="text-faint">· {age(t.openedAt)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium">{m ? displayPair(m) : t.market}</span>{" "}
                        <span className={t.qty > 0 ? "text-up" : "text-down"}>{t.qty > 0 ? "Long" : "Short"}</span>
                      </td>
                      <td className="num px-3 py-3 text-right">{Math.abs(t.qty).toPrecision(4)} {m?.base}</td>
                      <td className="num px-3 py-3 text-right">{usd(t.notional, true)}</td>
                      <td className="num px-3 py-3 text-right">{fmt(t.entry, t.market)}</td>
                      <td className="num px-3 py-3 text-right">{fmt(t.mark, t.market)}</td>
                      <td className={cx("num px-3 py-3 text-right", t.upnl >= 0 ? "text-up" : "text-down")}>
                        {signedUsd(t.upnl)} <span className="text-[10px] opacity-70">{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {editing === t.id ? (
                          <TpSlEditor t={t} onSave={(tp, sl) => save(t, tp, sl)} onCancel={() => setEditing(null)} />
                        ) : (
                          <button onClick={() => setEditing(t.id)} disabled={!canTrade} className="num rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-fg disabled:opacity-40" title="Edit TP / SL">
                            <span className={t.tp ? "text-up" : ""}>{fmt(t.tp, t.market)}</span> / <span className={t.sl ? "text-down" : ""}>{fmt(t.sl, t.market)}</span> ✎
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {busy === t.id && editing !== t.id ? (
                          <span className="text-muted">Closing…</span>
                        ) : choosing === t.id ? (
                          <span role="group" aria-label={`Close trade #${t.id}`} className="inline-flex items-center gap-1">
                            {CLOSE_SIZES.map((c) => (
                              <button
                                key={c.label}
                                onClick={() => close(t.id, c.f)}
                                className={cx("rounded-full border px-2.5 py-1", c.f === 1 ? "border-down/50 text-down hover:bg-down/10" : "border-line hover:border-line-strong")}
                              >
                                {c.label}
                              </button>
                            ))}
                            <button onClick={() => setChoosing(null)} aria-label="Cancel" className="px-1 text-muted hover:text-fg">✕</button>
                          </span>
                        ) : (
                          <button onClick={() => setChoosing(t.id)} disabled={busy !== null || !canTrade} className="rounded-full border border-line px-3 py-1 hover:border-line-strong disabled:opacity-40">
                            Close
                          </button>
                        )}
                        {errors[t.id] && <div role="alert" className="mt-1 max-w-56 text-right text-[11px] text-down">{errors[t.id]}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : history.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No closed trades yet</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 bg-surface text-left text-faint">
              <tr>
                {["Trade", "Market", "Size", "Entry", "Exit", "P&L", "Fees", "Net", "Duration", "Closed by"].map((h, i) => (
                  <th key={h} className={cx("px-3 py-2.5 font-normal", i >= 2 && i <= 8 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {history.map((h, i) => {
                const m = MARKET_BY_SYMBOL[h.market];
                return (
                  <tr key={`${h.ticketId ?? "x"}-${h.closedAt}-${i}`}>
                    <td className="num px-3 py-2.5 text-muted">{h.ticketId ? `#${h.ticketId}` : "—"}</td>
                    <td className="px-3 py-2.5">
                      {m ? displayPair(m) : h.market} <span className={h.side === "long" ? "text-up" : "text-down"}>{h.side === "long" ? "Long" : "Short"}</span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{h.qty.toPrecision(4)}</td>
                    <td className="num px-3 py-2.5 text-right">{fmt(h.entry, h.market)}</td>
                    <td className="num px-3 py-2.5 text-right">{fmt(h.exit, h.market)}</td>
                    <td className={cx("num px-3 py-2.5 text-right", h.pnl >= 0 ? "text-up" : "text-down")}>{signedUsd(h.pnl)}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">−{usd(h.fees, true)}</td>
                    <td className={cx("num px-3 py-2.5 text-right font-medium", h.net >= 0 ? "text-up" : "text-down")}>{signedUsd(h.net)}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{h.openedAt ? duration(h.closedAt - h.openedAt) : "—"}</td>
                    <td className="px-3 py-2.5 text-muted">{REASONS[h.reason] ?? h.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function duration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
