import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-fg text-bg hover:bg-white",
  secondary: "border border-line-strong text-fg hover:bg-white/5",
  ghost: "text-muted hover:text-fg",
};
const btn = (v: Variant, size: "md" | "lg") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none",
    size === "lg" ? "h-12 px-6 text-[15px]" : "h-10 px-4 text-sm",
    VARIANTS[v],
  );

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" }) {
  return <button className={cx(btn(variant, size), className)} {...p} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "lg" }) {
  return <Link className={cx(btn(variant, size), className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-card border border-line bg-surface", className)} {...p} />;
}

type Tone = "neutral" | "accent" | "up" | "down" | "warn";
const TONES: Record<Tone, string> = {
  neutral: "bg-white/5 text-muted",
  accent: "bg-accent/10 text-accent",
  up: "bg-up/10 text-up",
  down: "bg-down/10 text-down",
  warn: "bg-warn/10 text-warn",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Dot({ tone = "up" }: { tone?: "up" | "warn" | "down" }) {
  const c = { up: "bg-up", warn: "bg-warn", down: "bg-down" }[tone];
  return (
    <span className="relative flex size-2">
      <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", c)} />
      <span className={cx("relative inline-flex size-2 rounded-full", c)} />
    </span>
  );
}

/** Horizontal limit meter. `danger` flips colors so a *used-up loss limit* reads as red, a *reached target* as green. */
export function Meter({ value, kind = "loss", label }: { value: number; kind?: "loss" | "target"; label: string }) {
  const v = Math.min(1, Math.max(0, value));
  const color = kind === "target" ? "bg-up" : v > 0.75 ? "bg-down" : v > 0.5 ? "bg-warn" : "bg-accent";
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={cx("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${Math.max(v * 100, 2)}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-medium sm:text-[28px]">{value}</div>
      {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, sub }: { eyebrow?: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">{eyebrow}</div>}
      <h2 className="font-display text-4xl leading-[1.05] sm:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-[15px] leading-relaxed text-muted sm:text-base">{sub}</p>}
    </div>
  );
}

export { cx };
