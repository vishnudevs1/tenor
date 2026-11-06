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
import type { Candle, IntervalKey } from "@/lib/markets";
import { api } from "@/lib/client";

// Canvas can't read CSS variables — these mirror the tokens in globals.css.
const C = { up: "#3ddc97", down: "#ff6b6b", text: "#8b93a3", grid: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", accent: "#8cc8ff", warn: "#f5c451" };
const SECONDS: Record<IntervalKey, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };

export interface ChartLine {
  price: number;
  title: string;
  tone: "entry" | "tp" | "sl";
}

export function PriceChart({ symbol, interval, mark, decimals, lines }: { symbol: string; interval: IntervalKey; mark?: number; decimals: number; lines: ChartLine[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volume = useRef<ISeriesApi<"Histogram"> | null>(null);
  const last = useRef<Candle | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: C.text, fontFamily: "Inter, ui-sans-serif, system-ui", attributionLogo: false },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false },
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

  // History: load on market/interval change, refresh every 30s so gaps fill in.
  useEffect(() => {
    let stop = false;
    let first = true;
    setState("loading");
    const load = async () => {
      try {
        const data = await api<Candle[]>(`/api/candles?symbol=${symbol}&interval=${interval}`);
        if (stop || !candles.current) return;
        candles.current.setData(data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close })));
        volume.current?.setData(data.map((d) => ({ time: d.time as UTCTimestamp, value: d.volume, color: d.close >= d.open ? "rgba(61,220,151,0.35)" : "rgba(255,107,107,0.35)" })));
        last.current = data.at(-1) ?? null;
        if (first) chart.current?.timeScale().fitContent();
        first = false;
        setState("ready");
      } catch {
        if (!stop && first) setState("error");
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [symbol, interval]);

  // Live: roll the latest candle forward with the mark price between history refreshes.
  useEffect(() => {
    const l = last.current;
    if (!mark || !l || !candles.current) return;
    const step = SECONDS[interval];
    const bucket = Math.floor(Date.now() / 1000 / step) * step;
    const next = bucket > l.time ? { time: bucket, open: l.close, high: mark, low: mark, close: mark, volume: 0 } : { ...l, high: Math.max(l.high, mark), low: Math.min(l.low, mark), close: mark };
    last.current = next;
    candles.current.update({ time: next.time as UTCTimestamp, open: next.open, high: next.high, low: next.low, close: next.close });
  }, [mark, interval]);

  // Entry / TP / SL lines for the open position.
  const linesKey = lines.map((l) => `${l.tone}:${l.price}`).join("|");
  useEffect(() => {
    const s = candles.current;
    if (!s) return;
    priceLines.current.forEach((p) => s.removePriceLine(p));
    priceLines.current = lines.map((l) =>
      s.createPriceLine({
        price: l.price,
        title: l.title,
        color: l.tone === "entry" ? C.accent : l.tone === "tp" ? C.up : C.down,
        lineStyle: l.tone === "entry" ? LineStyle.Solid : LineStyle.Dashed,
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
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">{state === "loading" ? "Loading chart…" : "Chart data unavailable"}</div>
      )}
    </div>
  );
}
