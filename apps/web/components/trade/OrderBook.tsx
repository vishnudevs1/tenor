"use client";

import { useState } from "react";
import type { BookLevel, Market } from "@/lib/markets";
import { formatPrice } from "@/lib/markets";
import { useOrderBook, useTrades } from "@/lib/stream";
import { cx } from "../ui";

const ROWS = 10;
const qtyFmt = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

function BookView({ market }: { market: Market }) {
  const { book, live } = useOrderBook(market.symbol, ROWS);
  if (!book) return <div className="grid flex-1 place-items-center p-6 text-sm text-muted">{live ? "Loading…" : "Connecting…"}</div>;

  let acc = 0;
  const askRows = book.asks.map((l) => ({ ...l, total: (acc += l.qty) })).reverse();
  acc = 0;
  const bidRows = book.bids.map((l) => ({ ...l, total: (acc += l.qty) }));
  const maxTotal = Math.max(askRows[0]?.total ?? 0, bidRows.at(-1)?.total ?? 0, 1e-12);
  const spread = book.asks[0] && book.bids[0] ? book.asks[0].price - book.bids[0].price : null;
  const mid = book.asks[0] && book.bids[0] ? (book.asks[0].price + book.bids[0].price) / 2 : null;

  const Row = ({ l, side }: { l: BookLevel & { total: number }; side: "bid" | "ask" }) => (
    <div className="relative grid grid-cols-3 px-3 py-[3px] text-xs">
      <div className={cx("absolute inset-y-0 right-0 transition-[width] duration-100", side === "bid" ? "bg-up/10" : "bg-down/10")} style={{ width: `${(l.total / maxTotal) * 100}%` }} />
      <span className={cx("num relative", side === "bid" ? "text-up" : "text-down")}>{formatPrice(l.price, market)}</span>
      <span className="num relative text-right">{qtyFmt(l.qty)}</span>
      <span className="num relative text-right text-muted">{qtyFmt(l.total)}</span>
    </div>
  );

  return (
    <div className="flex-1 py-1">
      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-faint">
        <span>Price</span>
        <span className="text-right">Size ({market.base})</span>
        <span className="text-right">Total</span>
      </div>
      {askRows.map((l) => <Row key={`a${l.price}`} l={l} side="ask" />)}
      <div className="my-1 flex items-center justify-between border-y border-line px-3 py-1.5 text-xs">
        <span className="num text-sm font-medium">{mid != null ? formatPrice(mid, market) : "--"}</span>
        <span className="text-muted">
          Spread <span className="num text-fg">{spread != null ? formatPrice(spread, market) : "--"}</span>
        </span>
      </div>
      {bidRows.map((l) => <Row key={`b${l.price}`} l={l} side="bid" />)}
    </div>
  );
}

function TradesView({ market }: { market: Market }) {
  const { trades, live } = useTrades(market.symbol, 30);
  if (trades.length === 0) return <div className="grid flex-1 place-items-center p-6 text-sm text-muted">{live ? "Waiting for trades…" : "Connecting…"}</div>;
  return (
    <div className="flex-1 overflow-y-auto py-1">
      <div className="grid grid-cols-3 px-3 py-1.5 text-[11px] text-faint">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {trades.map((t, i) => (
        <div key={`${t.ts}-${i}`} className="grid grid-cols-3 px-3 py-[3px] text-xs">
          <span className={cx("num", t.side === "buy" ? "text-up" : "text-down")}>{formatPrice(t.price, market)}</span>
          <span className="num text-right">{qtyFmt(t.qty)}</span>
          <span className="num text-right text-muted">{new Date(t.ts).toLocaleTimeString("en-GB", { hour12: false })}</span>
        </div>
      ))}
    </div>
  );
}

export function OrderBook({ market }: { market: Market }) {
  const [tab, setTab] = useState<"book" | "trades">("book");
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line text-sm">
        {(["book", "trades"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx("px-4 py-2.5", tab === t ? "border-b-2 border-fg font-medium text-fg" : "text-muted hover:text-fg")}>
            {t === "book" ? "Order book" : "Trades"}
          </button>
        ))}
      </div>
      {tab === "book" ? <BookView market={market} /> : <TradesView market={market} />}
      <div className="border-t border-line px-3 py-2 text-[11px] text-faint">Streaming live from Extended (Arc venue)</div>
    </div>
  );
}
