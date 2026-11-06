"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MARKETS, displayPair, formatPrice, type Market, type MarketCategory, type MarketStats } from "@/lib/markets";
import { short } from "@/lib/format";
import { cx } from "../ui";

type Tab = "fav" | "All" | MarketCategory;
type SortKey = "symbol" | "price" | "change" | "volume" | "cap" | "oi";
const TABS: Tab[] = ["fav", "All", "Crypto", "Commodities", "FX"];
const FAV_KEY = "tenor.favMarkets.v1";

function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Round coloured tile with the asset's ticker — no third-party icon assets. */
export function MarketIcon({ m, size = 28 }: { m: Market; size?: number }) {
  const label = m.base === "USDJPY" ? "¥" : m.base === "EUR" ? "€" : m.base === "XAU" ? "Au" : m.base.slice(0, 1);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, background: m.color, fontSize: size * 0.42 }}
      className="grid shrink-0 place-items-center rounded-full font-bold text-white shadow-inner"
    >
      {label}
    </span>
  );
}

function Star({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "#f5c451" : "none"} stroke={on ? "#f5c451" : "currentColor"} strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" />
    </svg>
  );
}

export function MarketSearch({ open, onClose, value, stats, onSelect }: { open: boolean; onClose: () => void; value: string; stats: Record<string, MarketStats>; onSelect: (symbol: string) => void }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("All");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "volume", desc: true });
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setFavs(loadFavs()), []);
  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    requestAnimationFrame(() => input.current?.focus());
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggleFav = (s: string) => {
    setFavs((f) => {
      const n = new Set(f);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const val = (m: Market): number | string => {
      const s = stats[m.symbol];
      switch (sort.key) {
        case "symbol":
          return displayPair(m);
        case "price":
          return s?.mark ?? 0;
        case "change":
          return s?.change24h ?? 0;
        case "volume":
          return s?.volume24h ?? 0;
        case "cap":
          return s?.positionCap ?? 0;
        case "oi":
          return s?.openInterest ?? 0;
      }
    };
    return MARKETS.filter((m) => (tab === "All" ? true : tab === "fav" ? favs.has(m.symbol) : m.category === tab))
      .filter((m) => !needle || [m.base, m.name, m.symbol, displayPair(m)].some((x) => x.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
        return sort.desc ? -c : c;
      });
  }, [q, tab, sort, favs, stats]);

  useEffect(() => setCursor((c) => Math.min(c, Math.max(0, rows.length - 1))), [rows.length]);

  if (!open) return null;

  const pick = (s: string) => {
    onSelect(s);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && rows[cursor]) pick(rows[cursor].symbol);
  };
  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cx("px-3 py-2.5 font-normal", className)}>
      <button onClick={() => setSort((s) => ({ key: k, desc: s.key === k ? !s.desc : true }))} className={cx("inline-flex items-center gap-1 hover:text-fg", sort.key === k && "text-fg")}>
        {label}
        {sort.key === k && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
      </button>
    </th>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Search markets" onKeyDown={onKey} className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-card border border-line-strong bg-surface-2 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-muted" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search markets…"
            aria-label="Search markets"
            className="h-8 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-fg">
            ✕
          </button>
        </div>

        <div role="tablist" className="no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2.5">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              aria-label={t === "fav" ? "Favourites" : undefined}
              onClick={() => setTab(t)}
              className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors", tab === t ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}
            >
              {t === "fav" ? <Star on={tab === "fav"} /> : t}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted">{tab === "fav" ? "Star a market to pin it here." : "No markets match your search."}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2 text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="w-10" />
                  <Th k="symbol" label="Symbol" />
                  <Th k="price" label="Last price" className="text-right" />
                  <Th k="change" label="24h change" className="text-right" />
                  <Th k="volume" label="Volume" className="hidden text-right sm:table-cell" />
                  <Th k="cap" label="Cap" className="hidden text-right md:table-cell" />
                  <Th k="oi" label="OI" className="hidden pr-4 text-right md:table-cell" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m, i) => {
                  const s = stats[m.symbol];
                  const chg$ = s ? s.mark - s.mark / (1 + s.change24h) : 0;
                  const up = (s?.change24h ?? 0) >= 0;
                  return (
                    <tr
                      key={m.symbol}
                      onClick={() => pick(m.symbol)}
                      onMouseEnter={() => setCursor(i)}
                      aria-selected={m.symbol === value}
                      className={cx("cursor-pointer border-b border-line/60 transition-colors", i === cursor ? "bg-white/[0.06]" : "hover:bg-white/[0.04]")}
                    >
                      <td className="pl-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFav(m.symbol);
                          }}
                          aria-label={favs.has(m.symbol) ? `Unstar ${m.base}` : `Star ${m.base}`}
                          className="grid size-8 place-items-center rounded-full text-muted hover:text-warn"
                        >
                          <Star on={favs.has(m.symbol)} />
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <MarketIcon m={m} />
                          <span className="font-semibold">{displayPair(m)}</span>
                          <span className="rounded-md bg-up/10 px-1.5 py-0.5 text-[11px] font-medium text-up">{m.maxLeverage}×</span>
                          {s && !s.open && <span className="text-[11px] text-warn">closed</span>}
                        </div>
                      </td>
                      <td className="num px-3 py-3.5 text-right">{s ? formatPrice(s.mark, m) : "—"}</td>
                      <td className={cx("num whitespace-nowrap px-3 py-3.5 text-right", up ? "text-up" : "text-down")}>
                        {s ? (
                          <>
                            <span className="hidden lg:inline">
                              {up ? "+" : "−"}
                              {formatPrice(Math.abs(chg$), m)} /{" "}
                            </span>
                            {up ? "+" : "−"}
                            {Math.abs(s.change24h * 100).toFixed(2)}%
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="num hidden px-3 py-3.5 text-right sm:table-cell">{s ? `$${short(s.volume24h)}` : "—"}</td>
                      <td className="num hidden px-3 py-3.5 text-right md:table-cell" title="Max open position per account">
                        {s?.positionCap ? `$${short(s.positionCap)}` : "—"}
                      </td>
                      <td className="num hidden px-3 py-3.5 pr-4 text-right md:table-cell">{s ? `$${short(s.openInterest)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>↑↓ to move · Enter to open · Esc to close</span>
          <span>Cap = max open position per account, sized from live order-book depth</span>
        </div>
      </div>
    </div>
  );
}
