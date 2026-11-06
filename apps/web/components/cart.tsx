"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MAX_ACTIVE_CAPITAL, parseProductId, priceOf, productName } from "@tenor/rules";
import { usd } from "@/lib/format";
import { cx } from "./ui";

export interface CartLine {
  productId: string;
  qty: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  subtotal: number;
  capital: number; // account size in cart
  open: boolean;
  setOpen: (o: boolean) => void;
  add: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx | null>(null);
const KEY = "tenor.cart.v1";
const MAX_QTY = 5;

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as CartLine[];
    // Drop anything no longer in the catalog.
    return raw.filter((l) => parseProductId(l.productId) && !parseProductId(l.productId)!.demo && l.qty >= 1).map((l) => ({ ...l, qty: Math.min(MAX_QTY, l.qty) }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    setLines(load());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {}
  }, [lines]);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.productId !== productId) : ls.map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, qty) } : l))));
  }, []);

  const value = useMemo<CartCtx>(() => {
    const products = lines.map((l) => ({ l, p: parseProductId(l.productId)! }));
    return {
      lines,
      count: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: products.reduce((s, { l, p }) => s + priceOf(p) * l.qty, 0),
      capital: products.reduce((s, { l, p }) => s + p.size * l.qty, 0),
      open,
      setOpen,
      add: (productId) => {
        setLines((ls) => (ls.some((l) => l.productId === productId) ? ls.map((l) => (l.productId === productId ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l)) : [...ls, { productId, qty: 1 }]));
        setOpen(true);
      },
      setQty,
      remove: (productId) => setQty(productId, 0),
      clear: () => setLines([]),
    };
  }, [lines, open, setQty]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart outside CartProvider");
  return c;
}

export function CartButton() {
  const cart = useCart();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cart.open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && cart.setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cart.setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [cart]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => cart.setOpen(!cart.open)}
        aria-label={`Cart, ${cart.count} item${cart.count === 1 ? "" : "s"}`}
        aria-expanded={cart.open}
        className="relative grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0" />
        </svg>
        {cart.count > 0 && <span className="num absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-fg px-1 text-[10px] font-semibold leading-4 text-bg">{cart.count}</span>}
      </button>

      {cart.open && (
        <div role="dialog" aria-label="Your cart" className="fixed inset-x-3 top-16 z-50 rounded-card border border-line-strong bg-surface-2 shadow-2xl shadow-black/60 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="font-semibold">
              Your cart <span className="ml-1 text-sm font-normal text-muted">{cart.count} challenge{cart.count === 1 ? "" : "s"}</span>
            </div>
            <button onClick={() => cart.setOpen(false)} aria-label="Close cart" className="text-muted hover:text-fg">✕</button>
          </div>

          {cart.lines.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted">
              Your cart is empty.
              <Link href="/challenges" onClick={() => cart.setOpen(false)} className="mt-3 block font-medium text-accent">Browse challenges →</Link>
            </div>
          ) : (
            <>
              <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
                {cart.lines.map((l) => {
                  const p = parseProductId(l.productId)!;
                  return (
                    <li key={l.productId} className="px-5 py-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{productName(p)}</div>
                          <div className="text-xs text-muted">Account: {p.size.toLocaleString()} USDC</div>
                        </div>
                        <div className="num text-sm">{usd(priceOf(p) * l.qty, true)}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center rounded-full border border-line">
                          <button onClick={() => cart.setQty(l.productId, l.qty - 1)} aria-label="Decrease quantity" className="grid size-8 place-items-center text-muted hover:text-fg">−</button>
                          <span className="num w-6 text-center text-sm" aria-live="polite">{l.qty}</span>
                          <button onClick={() => cart.setQty(l.productId, l.qty + 1)} disabled={l.qty >= MAX_QTY} aria-label="Increase quantity" className="grid size-8 place-items-center text-muted hover:text-fg disabled:opacity-30">+</button>
                        </div>
                        <button onClick={() => cart.remove(l.productId)} className="text-xs text-muted hover:text-down">Remove</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Subtotal</span>
                  <span className="num font-medium">{usd(cart.subtotal, true)}</span>
                </div>
                <p className="mt-1 text-xs text-faint">Each evaluation opens as its own account. Active capital limit {usd(MAX_ACTIVE_CAPITAL)}.</p>
                <Link
                  href="/checkout"
                  onClick={() => cart.setOpen(false)}
                  className={cx("mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-fg text-sm font-medium text-bg hover:bg-white")}
                >
                  Checkout →
                </Link>
                <button onClick={() => cart.setOpen(false)} className="mt-2 h-10 w-full rounded-full text-sm text-muted hover:bg-white/5 hover:text-fg">
                  Continue shopping
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
