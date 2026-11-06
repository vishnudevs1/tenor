"use client";

import { useState } from "react";
import type { BookLevel, Market } from "@/lib/markets";
import { formatPrice } from "@/lib/markets";
import { usePoll } from "@/lib/client";
import { cx } from "../ui";

interface BookResponse {
  bids: BookLevel[];
  asks: BookLevel[];
  trades: { price: number; qty: number; side: "buy" | "sell"; ts: number }[];
}

const ROWS = 9;
const qtyFmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

export function OrderBook({ market }: { market: Market }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  const { data, error } = usePoll<BookResponse>(`/api/book?symbol=${market.symbol}`, 2_000);

  const asks = (data?.asks ?? []).slice(0, ROWS);
  const bids = (data?.bids ?? []).slice(0, ROWS);
  let acc = 0;
  const askRows = asks.map((l) => ({ ...l, total: (acc += l.qty) })).reverse();
  acc = 0;
  const bidRows = bids.map((l) => ({ ...l, total: (acc += l.qty) }));
  const maxTotal = Math.max(askRows[0]?.total ?? 0, bidRows.at(-1)?.total ?? 0, 1e-12);
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : null;

  const Row = ({ l, side }: { l: BookLevel & { total: number }; side: "bid" | "ask" }) => (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-xs">
      <div className={cx("absolute inset-y-0 right-0", side === "bid" ? "bg-up/10" : "bg-down/10")} style={{ width: `${(l.total / maxTotal) * 100}%` }} />
      <span className={cx("num relative", side === "bid" ? "text-up" : "text-down")}>{formatPrice(l.price, market)}</span>
      <span className="num relative text-right">{qtyFmt(l.qty)}</span>
      <span className="num relative text-right text-muted">{qtyFmt(l.total)}</span>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line text-sm">
        {(["book", "trades"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("px-4 py-2.5", tab === t ? "border-b-2 border-fg font-medium text-fg" : "text-muted hover:text-fg")}>
            {t === "book" ? "Order book" : "Trades"}
          </button>
        ))}
      </div>
      {!data ? (
        <div className="grid flex-1 place-items-center p-6 text-sm text-muted">{error ? "Order book unavailable" : "Loading…"}</div>
      ) : tab === "book" ? (
        <div className="flex-1 py-1">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-faint">
            <span>Price</span>
            <span className="text-right">Size ({market.base})</span>
            <span className="text-right">Total</span>
          </div>
          {askRows.map((l) => <Row key={`a${l.price}`} l={l} side="ask" />)}
          <div className="my-1 flex justify-between border-y border-line px-3 py-1.5 text-xs">
            <span className="text-muted">Spread</span>
            <span className="num">{spread != null ? formatPrice(spread, market) : "—"}</span>
          </div>
          {bidRows.map((l) => <Row key={`b${l.price}`} l={l} side="bid" />)}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-faint">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Time</span>
          </div>
          {data.trades.map((t, i) => (
            <div key={i} className="grid grid-cols-3 px-3 py-[3px] text-xs">
              <span className={cx("num", t.side === "buy" ? "text-up" : "text-down")}>{formatPrice(t.price, market)}</span>
              <span className="num text-right">{qtyFmt(t.qty)}</span>
              <span className="num text-right text-muted">{new Date(t.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-line px-3 py-2 text-[11px] text-faint">Live book from Extended (Arc venue)</div>
    </div>
  );
}
