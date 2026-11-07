"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { INTERVAL_SECONDS, isVenueInterval, type Candle, type ChartInterval } from "@/lib/markets";
import { api } from "@/lib/client";
import { rememberedQuotes, rememberedTrades, subscribeQuotes, subscribeTrades, type StreamTrade } from "@/lib/stream";

// TradingView Lightweight Charts, driven tick-by-tick by the venue's trade stream.
// ≥1m: history from the venue's REST candles, then every trade updates the live candle.
// 30s: built in the browser from the live best bid/ask (~10/s) plus trades for volume; quiet periods get
// flat candles so the timeline is continuous (the venue has no sub-minute history).

// Canvas can't read CSS variables — these mirror the tokens in globals.css.
const C = { up: "#3ddc97", down: "#ff6b6b", text: "#8b93a3", grid: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", accent: "#8cc8ff" };
const MAX_LIVE_BARS = 3_000;

export interface ChartLine {
  price: number;
  title: string;
  tone: "entry-long" | "entry-short" | "tp" | "sl";
}

const toBar = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
const toVol = (c: Candle) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? "rgba(61,220,151,0.35)" : "rgba(255,107,107,0.35)" });

export function PriceChart({ symbol, interval, decimals, lines }: { symbol: string; interval: ChartInterval; decimals: number; lines: ChartLine[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "waiting" | "error">("loading");

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: C.text, fontFamily: "Inter, ui-sans-serif, system-ui", attributionLogo: true },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: true, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    candles.current = c.addSeries(CandlestickSeries, { upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false });
    volume.current = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    volume.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    candles.current?.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 1 / 10 ** decimals } });
  }, [decimals]);

  // Data: history (if any) + live trades. Trades that arrive while history loads are buffered, then replayed.
  useEffect(() => {
    const series = candles.current;
    const vol = volume.current;
    if (!series || !vol) return;
    const step = INTERVAL_SECONDS[interval];
    const fast = !isVenueInterval(interval);
    type Tick = { price: number; qty: number; ts: number };
    let last: Candle | null = null;
    let bars = 0;
    let ready = false;
    let stop = false;
    const pending: Tick[] = [];
    // Venue clock − local clock. Gap-filling runs on local time; without this, a fast local clock would open
    // "future" bars and every real tick would then be dropped as late.
    let skew = 0;
    const venueNow = () => Date.now() + skew;

    series.setData([]);
    vol.setData([]);
    // Each timeframe starts from a fresh zoom rather than inheriting the previous one.
    chart.current?.timeScale().applyOptions({ barSpacing: fast ? 8 : 6, rightOffset: 6 });
    chart.current?.timeScale().resetTimeScale();
    setState("loading");

    const push = (c: Candle) => {
      series.update(toBar(c));
      vol.update(toVol(c));
    };

    /** Fast charts: carry the last close forward through quiet buckets so the timeline never has holes. */
    const fillTo = (bucket: number) => {
      if (!fast || !last) return;
      // Bound the catch-up (e.g. after the tab slept) so we never emit thousands of bars at once.
      if (bucket - last.time > step * 900) last = { ...last, time: bucket - step * 900 };
      while (last.time < bucket) {
        last = { time: last.time + step, open: last.close, high: last.close, low: last.close, close: last.close, volume: 0 };
        push(last);
        bars++;
      }
    };

    const apply = (t: Tick) => {
      const bucket = Math.floor(t.ts / 1000 / step) * step;
      if (last && bucket < last.time) return; // late tick for an already-closed bar
      fillTo(bucket);
      if (!last || bucket > last.time) {
        last = { time: bucket, open: last?.close ?? t.price, high: t.price, low: t.price, close: t.price, volume: t.qty };
        last.high = Math.max(last.high, last.open);
        last.low = Math.min(last.low, last.open);
        bars++;
      } else {
        last = { ...last, high: Math.max(last.high, t.price), low: Math.min(last.low, t.price), close: t.price, volume: last.volume + t.qty };
      }
      push(last);
    };

    const trim = () => {
      if (bars <= MAX_LIVE_BARS) return;
      // Keep long-running live charts bounded.
      const keep = series.data().slice(-MAX_LIVE_BARS);
      series.setData(keep as ReturnType<typeof toBar>[]);
      vol.setData((vol.data() as ReturnType<typeof toVol>[]).slice(-MAX_LIVE_BARS));
      bars = keep.length;
    };

    const onTicks = (ticks: Tick[]) => {
      const newest = ticks.at(-1);
      if (newest) skew = newest.ts - Date.now();
      if (!ready) return void pending.push(...ticks);
      for (const t of ticks) apply(t);
      trim();
      setState((s) => (s === "waiting" ? "ready" : s));
    };

    const unsubTrades = subscribeTrades(symbol, (trades) => onTicks(trades.map((t) => ({ price: t.price, qty: t.qty, ts: t.ts }))));
    // Always subscribed (cheap), so quote memory builds up even while a slower timeframe is shown.
    const unsubQuotes = subscribeQuotes(symbol, (q) => fast && onTicks([{ price: q.mid, qty: 0, ts: q.ts }]));
    const clock = fast
      ? setInterval(() => {
          if (!ready || !last) return;
          fillTo(Math.floor(venueNow() / 1000 / step) * step);
          trim();
        }, 250)
      : undefined;

    (async () => {
      try {
        if (!fast) {
          const hist = await api<Candle[]>(`/api/candles?symbol=${symbol}&interval=${interval}`);
          if (stop) return;
          series.setData(hist.map(toBar));
          vol.setData(hist.map(toVol));
          last = hist.at(-1) ?? null;
          bars = hist.length;
          chart.current?.timeScale().fitContent();
        } else {
          // Seed with everything this page has already seen (quotes + trades) plus the venue's last prints
          // (its REST API only returns ~50 trades), de-duplicated and in time order.
          const { trades } = await api<{ trades: StreamTrade[] }>(`/api/book?symbol=${symbol}`);
          if (stop) return;
          const seen = new Set<string>();
          const seedTrades = [...trades, ...rememberedTrades(symbol)].filter((t) => {
            const k = `${t.ts}:${t.price}:${t.qty}`;
            return !seen.has(k) && (seen.add(k), true);
          });
          const ticks: Tick[] = [
            ...seedTrades.map((t) => ({ price: t.price, qty: t.qty, ts: t.ts })),
            ...rememberedQuotes(symbol).map((q) => ({ price: q.mid, qty: 0, ts: q.ts })),
          ].sort((x, y) => x.ts - y.ts);
          // Start the continuous timeline at most 30 minutes back (what the page remembers).
          const from = venueNow() - 30 * 60_000;
          const recent = ticks.filter((t) => t.ts >= from);
          (recent.length ? recent : ticks.slice(-1)).forEach(apply);
        }
        ready = true;
        pending.sort((x, y) => x.ts - y.ts).forEach(apply);
        pending.length = 0;
        if (fast) {
          fillTo(Math.floor(venueNow() / 1000 / step) * step);
          trim();
          chart.current?.timeScale().scrollToRealTime();
        }
        setState(bars > 0 ? "ready" : "waiting");
      } catch {
        if (!stop) setState("error");
      }
    })();

    return () => {
      stop = true;
      unsubTrades();
      unsubQuotes();
      if (clock) clearInterval(clock);
    };
  }, [symbol, interval]);

  // Entry / TP / SL lines for this market's open trades.
  const linesKey = lines.map((l) => `${l.tone}:${l.price}:${l.title}`).join("|");
  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    priceLines.current.forEach((p) => s.removePriceLine(p));
    priceLines.current = lines.map((l) =>
      s.createPriceLine({
        price: l.price,
        title: l.title,
        color: l.tone === "entry-long" || l.tone === "tp" ? C.up : l.tone === "entry-short" || l.tone === "sl" ? C.down : C.accent,
        lineStyle: l.tone.startsWith("entry") ? LineStyle.Solid : LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linesKey]);

  return (
    <div className="relative h-full min-h-[320px] w-full">
      <div ref={el} className="absolute inset-0" />
      {state !== "ready" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">
          {state === "loading" ? "Loading chart…" : state === "waiting" ? "Waiting for the first trade…" : "Chart data unavailable"}
        </div>
      )}
    </div>
  );
}
