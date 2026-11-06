"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { CartButton, CartProvider } from "./cart";
import { Badge, cx } from "./ui";
import { arc } from "@/lib/arc";
import { signOutAction } from "@/app/login/actions";
import { X_HANDLE, X_URL } from "@/lib/brand";
import { XIcon } from "./XLink";

export interface ShellUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

const NAV = [
  { href: "/dashboard", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/challenges", label: "Buy Challenge", short: "Challenges", icon: "M12 5v14M5 12h14" },
  { href: "/trade", label: "Trade", icon: "M4 19V9m5 10V5m5 14v-7m5 7V8" },
  { href: "/payouts", label: "Payouts", icon: "M12 3v18M17 7.5C17 5.6 14.8 4.5 12 4.5S7 5.6 7 7.5 9 10.5 12 11s5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Avatar({ user, size = 32 }: { user: ShellUser; size?: number }) {
  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();
  return user.image ? (
    // Google profile photos are small and external; next/image isn't worth the remote-host config here.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.image} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full" />
  ) : (
    <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-accent/20 text-sm font-medium text-accent">
      {initial}
    </span>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open} className="rounded-full ring-offset-2 ring-offset-bg hover:ring-2 hover:ring-line-strong">
        <Avatar user={user} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-64 rounded-card border border-line-strong bg-surface-2 p-2 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user.name ?? "Trader"}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
          <div className="px-3 pb-2"><Badge tone="accent">{arc.name}</Badge></div>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/transparency" className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-fg">Transparency</Link>
          <a role="menuitem" href={X_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-fg">
            <XIcon size={14} /> Follow @{X_HANDLE}
          </a>
          <form action={signOutAction}>
            <button role="menuitem" type="submit" className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-white/5 hover:text-down">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <CartProvider>
      <div className="app-glow min-h-dvh pb-20 md:pb-0">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-6 px-4 sm:px-6">
            <Logo href="/dashboard" />
            <nav aria-label="App" className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={cx("rounded-full px-3.5 py-2 text-sm transition-colors", active(n.href) ? "font-medium text-fg" : "text-muted hover:text-fg")}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <CartButton />
              <UserMenu user={user} />
            </div>
          </div>
        </header>

        {children}

        {/* Mobile bottom tabs — thumb-reachable primary nav */}
        <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={cx("flex flex-col items-center gap-1 py-2.5 text-[11px]", active(n.href) ? "text-fg" : "text-faint")}>
              <Icon d={n.icon} />
              {n.short ?? n.label}
            </Link>
          ))}
        </nav>
      </div>
    </CartProvider>
  );
}
