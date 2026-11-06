// Deterministic rules library (blueprint §3.4).
// The SAME code evaluates simulated evaluations and live funded accounts,
// so there is never a "the sim was different" dispute.

export type Phase = "evaluation" | "funded";
export type AccountStatus = "active" | "passed" | "breached";

export interface Ruleset {
  version: string; // hashed on-chain at activation; immutable per account
  profitTarget: number; // fraction of initial balance; ignored for funded accounts
  dailyLoss: number; // fraction of initial balance
  maxDrawdown: number; // fraction of initial balance, static
}

export interface AccountSnapshot {
  phase: Phase;
  initialBalance: number;
  dayStartEquity: number; // equity at 00:00 UTC
  equity: number; // balance + unrealized PnL
}

export interface Objective {
  /** 0..1 share of the limit used (losses) or of the target reached (profit). */
  progress: number;
  /** Absolute USDC remaining before the limit / target. */
  remaining: number;
  limit: number;
}

export interface Evaluation {
  status: AccountStatus;
  reason?: "daily_loss" | "max_drawdown";
  profit: Objective;
  dailyLoss: Objective;
  drawdown: Objective;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function evaluate(acct: AccountSnapshot, rules: Ruleset): Evaluation {
  const { initialBalance, dayStartEquity, equity } = acct;

  const dailyLimit = initialBalance * rules.dailyLoss;
  const dailyUsed = Math.max(0, dayStartEquity - equity);

  const ddLimit = initialBalance * rules.maxDrawdown;
  const ddUsed = Math.max(0, initialBalance - equity);

  const target = initialBalance * rules.profitTarget;
  const gained = equity - initialBalance;

  const dailyLoss: Objective = { limit: dailyLimit, progress: clamp01(dailyUsed / dailyLimit), remaining: Math.max(0, dailyLimit - dailyUsed) };
  const drawdown: Objective = { limit: ddLimit, progress: clamp01(ddUsed / ddLimit), remaining: Math.max(0, ddLimit - ddUsed) };
  const profit: Objective = { limit: target, progress: target > 0 ? clamp01(gained / target) : 0, remaining: Math.max(0, target - gained) };

  // Breaches are checked before the target: touching a limit always ends the account.
  if (dailyUsed >= dailyLimit) return { status: "breached", reason: "daily_loss", profit, dailyLoss, drawdown };
  if (ddUsed >= ddLimit) return { status: "breached", reason: "max_drawdown", profit, dailyLoss, drawdown };
  if (acct.phase === "evaluation" && gained >= target) return { status: "passed", profit, dailyLoss, drawdown };
  return { status: "active", profit, dailyLoss, drawdown };
}

/** Default funded ruleset (blueprint §2.4). */
export const CLASSIC: Ruleset = { version: "classic-v1", profitTarget: 0.1, dailyLoss: 0.03, maxDrawdown: 0.06 };
export const FAST: Ruleset = { version: "fast-v1", profitTarget: 0.08, dailyLoss: 0.03, maxDrawdown: 0.04 };

/** One clear leverage table — blueprint §2.4. */
export const LEVERAGE_CAPS = {
  "FX majors": 10,
  Gold: 8,
  "Crypto majors": 5,
  Alts: 3,
} as const;
