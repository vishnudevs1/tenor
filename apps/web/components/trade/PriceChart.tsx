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
import { subscribeTrades, type StreamTrade } from "@/lib/stream";

// TradingView Lightweight Charts, driven tick-by-tick by the venue's trade stream.
// ≥1m: history from the venue's REST candles, then every trade updates the live candle.
// 1s/5s: built entirely in the browser from the trade stream (the venue has no sub-minute history).

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
    let last: Candle | null = null;
    let bars = 0;
    let ready = false;
    let stop = false;
    const pending: StreamTrade[] = [];

    series.setData([]);
    vol.setData([]);
    setState("loading");

    const apply = (t: StreamTrade) => {
      const bucket = Math.floor(t.ts / 1000 / step) * step;
      if (last && bucket < last.time) return; // late trade for an already-closed bar
      if (!last || bucket > last.time) {
        last = { time: bucket, open: t.price, high: t.price, low: t.price, close: t.price, volume: t.qty };
        bars++;
      } else {
        last = { ...last, high: Math.max(last.high, t.price), low: Math.min(last.low, t.price), close: t.price, volume: last.volume + t.qty };
      }
      series.update(toBar(last));
      vol.update(toVol(last));
    };

    const unsub = subscribeTrades(symbol, (trades) => {
      if (!ready) return void pending.push(...trades);
      for (const t of trades) apply(t);
      if (bars > MAX_LIVE_BARS) {
        // Keep long-running 1s charts bounded.
        const data = series.data().slice(-MAX_LIVE_BARS);
        series.setData(data as ReturnType<typeof toBar>[]);
        bars = data.length;
      }
      setState((s) => (s === "waiting" ? "ready" : s));
    });

    (async () => {
      try {
        if (isVenueInterval(interval)) {
          const hist = await api<Candle[]>(`/api/candles?symbol=${symbol}&interval=${interval}`);
          if (stop) return;
          series.setData(hist.map(toBar));
          vol.setData(hist.map(toVol));
          last = hist.at(-1) ?? null;
          bars = hist.length;
          chart.current?.timeScale().fitContent();
        } else {
          // Seed sub-minute charts with the venue's most recent prints.
          const { trades } = await api<{ trades: StreamTrade[] }>(`/api/book?symbol=${symbol}`);
          if (stop) return;
          [...trades].sort((a, b) => a.ts - b.ts).forEach(apply);
          chart.current?.timeScale().scrollToRealTime();
        }
        ready = true;
        pending.sort((a, b) => a.ts - b.ts).forEach(apply);
        pending.length = 0;
        setState(bars > 0 ? "ready" : "waiting");
      } catch {
        if (!stop) setState("error");
      }
    })();

    return () => {
      stop = true;
      unsub();
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
