import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-fg" aria-label="Tenor home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="currentColor" opacity="0.08" />
        <path d="M7 22a9 9 0 0 1 18 0" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="22" r="2.5" fill="currentColor" />
      </svg>
      <span className="text-[17px] font-semibold tracking-tight">Tenor</span>
    </Link>
  );
}
