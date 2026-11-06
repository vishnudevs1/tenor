"use client";

// Real-time market data straight from the venue's public WebSocket (Extended, an Arc venue).
// The browser connects directly — no hop through our servers — for the lowest possible latency.
// Display only: fills and rule enforcement always use the server's own fresh venue read.

import { useEffect, useRef, useState } from "react";
import type { BookLevel } from "./markets";

const BASE = process.env.NEXT_PUBLIC_EXTENDED_WS_URL ?? "wss://api.starknet.extended.exchange/stream.extended.exchange/v1";
const FLUSH_MS = 100; // max ~10 renders/s regardless of message rate

/** A WebSocket that reconnects with backoff until closed. */
function connect(path: string, onMessage: (msg: unknown) => void, onState?: (live: boolean) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let delay = 500;
  let timer: ReturnType<typeof setTimeout>;
  const open = () => {
    ws = new WebSocket(BASE + path);
    ws.onopen = () => {
      delay = 500;
      onState?.(true);
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data as string));
      } catch {}
    };
    ws.onclose = () => {
      onState?.(false);
      if (!closed) timer = setTimeout(open, (delay = Math.min(delay * 2, 8_000)));
    };
    ws.onerror = () => ws?.close();
  };
  open();
  return {
    reconnect: () => ws?.close(), // onclose schedules a fresh connection (and a fresh snapshot)
    close: () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    },
  };
}

// ── Trades: one shared connection per market, many listeners ──────────────

export interface StreamTrade {
  price: number;
  qty: number;
  side: "buy" | "sell";
  ts: number;
}

type TradeListener = (trades: StreamTrade[]) => void;
const tradeHubs = new Map<string, { listeners: Set<TradeListener>; conn: ReturnType<typeof connect>; live: boolean; stateListeners: Set<(l: boolean) => void> }>();

export function subscribeTrades(symbol: string, fn: TradeListener, onState?: (live: boolean) => void) {
  let hub = tradeHubs.get(symbol);
  if (!hub) {
    const h = { listeners: new Set<TradeListener>(), stateListeners: new Set<(l: boolean) => void>(), live: false, conn: null as unknown as ReturnType<typeof connect> };
    h.conn = connect(
      `/publicTrades/${encodeURIComponent(symbol)}`,
      (msg) => {
        const data = (msg as { data?: { p: string; q: string; S: string; T: number }[] }).data;
        if (!Array.isArray(data)) return;
        const trades = data.map((t) => ({ price: Number(t.p), qty: Number(t.q), side: t.S === "BUY" ? ("buy" as const) : ("sell" as const), ts: t.T })).sort((a, b) => a.ts - b.ts);
        h.listeners.forEach((l) => l(trades));
      },
      (live) => {
        h.live = live;
        h.stateListeners.forEach((l) => l(live));
      },
    );
    tradeHubs.set(symbol, h);
    hub = h;
  }
  hub.listeners.add(fn);
  if (onState) {
    hub.stateListeners.add(onState);
    onState(hub.live);
  }
  return () => {
    hub!.listeners.delete(fn);
    if (onState) hub!.stateListeners.delete(onState);
    if (hub!.listeners.size === 0) {
      hub!.conn.close();
      tradeHubs.delete(symbol);
    }
  };
}

/** Last N trades for the tape, plus the latest trade price. */
export function useTrades(symbol: string, keep = 30) {
  const [trades, setTrades] = useState<StreamTrade[]>([]);
  const [live, setLive] = useState(false);
  useEffect(() => {
    setTrades([]);
    let buf: StreamTrade[] = [];
    let dirty = false;
    const unsub = subscribeTrades(
      symbol,
      (t) => {
        buf = [...[...t].reverse(), ...buf].slice(0, keep); // copy: the array is shared with other listeners
        dirty = true;
      },
      setLive,
    );
    const flush = setInterval(() => {
      if (dirty) {
        dirty = false;
        setTrades(buf);
      }
    }, FLUSH_MS);
    return () => {
      unsub();
      clearInterval(flush);
    };
  }, [symbol, keep]);
  return { trades, last: trades[0]?.price, live };
}

// ── Order book: full depth snapshot + deltas, top levels rendered ─────────

interface BookMsg {
  type: "SNAPSHOT" | "DELTA";
  seq: number;
  data: { b: { p: string; q: string; c?: string }[]; a: { p: string; q: string; c?: string }[] };
}

function top(side: Map<number, number>, n: number, desc: boolean): BookLevel[] {
  // O(depth) partial selection — cheaper than sorting the whole ~10k-level book on every frame.
  const out: BookLevel[] = [];
  for (const [price, qty] of side) {
    if (out.length < n) {
      out.push({ price, qty });
      if (out.length === n) out.sort((x, y) => (desc ? y.price - x.price : x.price - y.price));
      continue;
    }
    const worst = out[n - 1].price;
    if (desc ? price > worst : price < worst) {
      out[n - 1] = { price, qty };
      out.sort((x, y) => (desc ? y.price - x.price : x.price - y.price));
    }
  }
  return out.sort((x, y) => (desc ? y.price - x.price : x.price - y.price));
}

export function useOrderBook(symbol: string, levels = 12) {
  const [book, setBook] = useState<{ bids: BookLevel[]; asks: BookLevel[]; ts: number } | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setBook(null);
    const bids = new Map<number, number>();
    const asks = new Map<number, number>();
    let seq = -1;
    let dirty = false;
    let ts = 0;

    const conn = connect(
      `/orderbooks/${encodeURIComponent(symbol)}`,
      (raw) => {
        const msg = raw as BookMsg & { ts: number };
        if (msg.type === "SNAPSHOT") {
          bids.clear();
          asks.clear();
          for (const l of msg.data.b) bids.set(Number(l.p), Number(l.q));
          for (const l of msg.data.a) asks.set(Number(l.p), Number(l.q));
        } else if (msg.type === "DELTA") {
          if (seq >= 0 && msg.seq !== seq + 1) return conn.reconnect(); // gap → resubscribe for a fresh snapshot
          // `c` is the level's new absolute size; `q` is only the change.
          for (const l of msg.data.b) (Number(l.c) > 0 ? bids.set(Number(l.p), Number(l.c)) : bids.delete(Number(l.p)));
          for (const l of msg.data.a) (Number(l.c) > 0 ? asks.set(Number(l.p), Number(l.c)) : asks.delete(Number(l.p)));
        } else return;
        seq = msg.seq;
        ts = msg.ts;
        dirty = true;
      },
      (l) => {
        setLive(l);
        if (!l) seq = -1;
      },
    );
    const flush = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      setBook({ bids: top(bids, levels, true), asks: top(asks, levels, false), ts });
    }, FLUSH_MS);
    return () => {
      conn.close();
      clearInterval(flush);
    };
  }, [symbol, levels]);

  return { book, live };
}

// ── Mark prices (what the server marks P&L and breaches with) ─────────────

export function useMarks(symbols: string[]) {
  const [marks, setMarks] = useState<Record<string, number>>({});
  const key = [...new Set(symbols)].sort().join(",");
  const latest = useRef<Record<string, number>>({});

  useEffect(() => {
    const list = key ? key.split(",") : [];
    const conns = list.map((s) =>
      connect(`/prices/mark/${encodeURIComponent(s)}`, (raw) => {
        const p = Number((raw as { data?: { p?: string } }).data?.p);
        if (p > 0) latest.current = { ...latest.current, [s]: p };
      }),
    );
    const flush = setInterval(() => setMarks((m) => (m === latest.current ? m : latest.current)), 250);
    return () => {
      conns.forEach((c) => c.close());
      clearInterval(flush);
    };
  }, [key]);

  return marks;
}
