// Self-pricing challenges (blueprint §4.2).
// minFee = trailing pass rate × size × max DD × gap buffer × target coverage
// The on-chain PricingEngine mirrors this formula; keep the two in sync.

export const GAP_BUFFER = 1.25;
export const TARGET_COVERAGE = 1.2;

export interface PriceInput {
  accountSize: number; // USDC
  maxDrawdown: number; // fraction, e.g. 0.06
  passRate: number; // trailing 90-day, fraction
  buffer?: number;
  coverage?: number;
}

/** Worst-case loss the reserve must pre-fund for one funded account. */
export function maxLoss(accountSize: number, maxDrawdown: number, buffer = GAP_BUFFER): number {
  return accountSize * maxDrawdown * buffer;
}

/** Smallest fee at which challenge revenue alone pre-funds every funded account's worst case. */
export function minFee({ accountSize, maxDrawdown, passRate, buffer = GAP_BUFFER, coverage = TARGET_COVERAGE }: PriceInput): number {
  if (passRate < 0 || passRate > 1) throw new RangeError("passRate must be within [0, 1]");
  return passRate * maxLoss(accountSize, maxDrawdown, buffer) * coverage;
}

/** Coverage ratio = (fee ÷ pass rate) ÷ max loss. ≥ 1.0 means solvent without a B-book. */
export function coverageRatio(fee: number, input: Omit<PriceInput, "coverage">): number {
  const loss = maxLoss(input.accountSize, input.maxDrawdown, input.buffer);
  if (input.passRate === 0) return Infinity;
  return fee / input.passRate / loss;
}

/** Round a fee up to a friendly price point (never down — rounding down would break solvency). */
export function displayFee(fee: number): number {
  return Math.ceil(fee);
}
