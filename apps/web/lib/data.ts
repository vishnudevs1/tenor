// Transparency Terminal demo data. Replace with reads from the RiskReserve and PricingEngine
// contracts once they are deployed to Arc; until then every page using this shows a "Demo data" badge.

export const IS_DEMO = true;

export const firm = {
  passRate90d: 0.08,
  reserveAssets: 412_800,
  liveMaxLoss: 286_250, // Σ size × DD × gap buffer across funded accounts
  bufferTarget: 1.2,
  fundedAccounts: 148,
  aBookShare: 1,
  medianPayoutMinutes: 6,
  breachToFlattenP95Ms: 640,
  paidOut30d: 318_420,
  venues: [
    { name: "edgeX", role: "FX + multi-asset", share: 0.46 },
    { name: "Extended", role: "Crypto", share: 0.38 },
    { name: "Hibachi", role: "FX + institutional", share: 0.16 },
  ],
  venueCap: 0.6,
};

export const coverage = firm.reserveAssets / firm.liveMaxLoss;

export const CURRENCIES = [
  { code: "USDC", label: "US Dollar", flag: "🇺🇸", rate: 1 },
  { code: "EURC", label: "Euro", flag: "🇪🇺", rate: 0.92 },
  { code: "BRLA", label: "Brazilian Real", flag: "🇧🇷", rate: 5.42 },
  { code: "MXNB", label: "Mexican Peso", flag: "🇲🇽", rate: 18.1 },
  { code: "JPYC", label: "Japanese Yen", flag: "🇯🇵", rate: 152.3 },
  { code: "KRW1", label: "Korean Won", flag: "🇰🇷", rate: 1384 },
  { code: "QCAD", label: "Canadian Dollar", flag: "🇨🇦", rate: 1.37 },
  { code: "ZARU", label: "South African Rand", flag: "🇿🇦", rate: 18.2 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];



export const recentPayouts = [
  { trader: "0x41c…a0e2", amount: 2_310.55, currency: "BRLA", minutes: 4, hash: "0x5e1f9a0c3b7d2e8f4a6c1b9d0e3f7a2c5b8d1e4f7a0c3b6d9e2f5a8c1b4d7e0a" },
  { trader: "0x9bd…17f4", amount: 980.0, currency: "USDC", minutes: 2, hash: "0x2c7e4a1f8b3d6e9c0a5f2b8d1e4c7a0f3b6d9e2c5a8f1b4d7e0c3a6f9b2d5e8c" },
  { trader: "0x03a…e8b1", amount: 4_120.4, currency: "MXNB", minutes: 9, hash: "0x8f3a6c9e2b5d8f1a4c7e0b3d6f9a2c5e8b1d4f7a0c3e6b9d2f5a8c1e4b7d0f3a" },
  { trader: "0xd72…4c09", amount: 1_455.1, currency: "EURC", minutes: 3, hash: "0x1b4e7a0d3f6c9b2e5a8d1f4c7b0e3a6d9f2c5b8e1a4d7f0c3b6e9a2d5f8c1b4e" },
];
