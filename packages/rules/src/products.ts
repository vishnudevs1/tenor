// Challenge catalog. Shared by the UI and the server so a price shown is the price charged.
// Fees come from the self-pricing formula (pricing.ts), never hard-coded.

import { minFee, displayFee } from "./pricing.ts";
import type { Ruleset } from "./rules.ts";

export type PlanKey = "classic" | "turbo" | "pro";
export type Steps = 1 | 2;

export const ACCOUNT_SIZES = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000] as const;
export const DEMO_SIZE = 10_000;
/** Max combined size of a trader's active paid evaluations. */
export const MAX_ACTIVE_CAPITAL = 200_000;
export const PROFIT_SPLIT = 0.8;

export interface Plan {
  key: PlanKey;
  name: string;
  tagline: string;
  profitTarget: number;
  maxDrawdown: number;
  dailyLoss: number;
}

export const PLANS: Record<PlanKey, Plan> = {
  classic: { key: "classic", name: "Classic", tagline: "Balanced room to trade", profitTarget: 0.1, maxDrawdown: 0.06, dailyLoss: 0.03 },
  turbo: { key: "turbo", name: "Turbo", tagline: "Lowest fee, tight drawdown", profitTarget: 0.09, maxDrawdown: 0.03, dailyLoss: 0.03 },
  pro: { key: "pro", name: "Pro", tagline: "Higher target, more room", profitTarget: 0.12, maxDrawdown: 0.05, dailyLoss: 0.03 },
};
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

/** 2-step evaluations: a lower target per phase, same loss limits. */
export const TWO_STEP_TARGETS = [0.08, 0.05] as const;

/** Trailing pass rates feeding the PricingEngine. Seed values until the closed beta produces real ones. */
export const PASS_RATES: Record<Steps, number> = { 1: 0.08, 2: 0.05 };

export interface Product {
  size: number;
  plan: PlanKey;
  steps: Steps;
  demo: boolean;
}

export function productId(p: Product): string {
  return p.demo ? `demo-${p.plan}-${p.steps}` : `${p.size}-${p.plan}-${p.steps}`;
}

/** Parses and validates an id from untrusted input. Returns null for anything not in the catalog. */
export function parseProductId(id: string): Product | null {
  const m = /^(demo|\d+)-(classic|turbo|pro)-([12])$/.exec(id);
  if (!m) return null;
  const demo = m[1] === "demo";
  const size = demo ? DEMO_SIZE : Number(m[1]);
  if (!demo && !(ACCOUNT_SIZES as readonly number[]).includes(size)) return null;
  return { size, plan: m[2] as PlanKey, steps: Number(m[3]) as Steps, demo };
}

/** Fee in whole USDC. Demo accounts are free. */
export function priceOf(p: Product): number {
  if (p.demo) return 0;
  return displayFee(minFee({ accountSize: p.size, maxDrawdown: PLANS[p.plan].maxDrawdown, passRate: PASS_RATES[p.steps] }));
}

/** Ruleset for a given phase (1-based). Its version string is what gets hashed on-chain. */
export function rulesFor(p: Product, step = 1): Ruleset {
  const plan = PLANS[p.plan];
  const profitTarget = p.steps === 2 ? TWO_STEP_TARGETS[Math.min(step, 2) - 1] : plan.profitTarget;
  return { version: `${p.plan}-${p.steps}s-p${step}-v1`, profitTarget, dailyLoss: plan.dailyLoss, maxDrawdown: plan.maxDrawdown };
}

export function sizeLabel(size: number): string {
  return `${size / 1000}K`;
}

export function productName(p: Product): string {
  return `${p.demo ? "Demo" : sizeLabel(p.size)} ${PLANS[p.plan].name} · ${p.steps}-Step`;
}
