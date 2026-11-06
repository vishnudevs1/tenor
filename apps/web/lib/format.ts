const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const usd = (n: number, cents = false) => (cents ? usd2 : usd0).format(n);
export const signedUsd = (n: number) => `${n >= 0 ? "+" : "−"}${usd2.format(Math.abs(n))}`;
export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;
export const short = (n: number) => compact.format(n);
export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
