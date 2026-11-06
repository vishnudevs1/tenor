"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "./Logo";
import { ButtonLink } from "./ui";

const LINKS = [
  { href: "/#challenges", label: "Challenges" },
  { href: "/#how", label: "How it works" },
  { href: "/transparency", label: "Transparency" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted transition-colors hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
            Log in
          </ButtonLink>
          <ButtonLink href="/login">Get funded</ButtonLink>
          <button
            className="-mr-2 grid size-10 place-items-center rounded-full text-muted hover:text-fg md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 14h14" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line px-4 pb-4 md:hidden" aria-label="Mobile">
          {[...LINKS, { href: "/login", label: "Log in" }].map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block border-b border-line py-3.5 text-[15px] text-fg last:border-0">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
