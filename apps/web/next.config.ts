import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tenor/rules"],
  // PGlite ships WASM + data files; load it from node_modules instead of bundling. (Local dev only — Vercel uses pg.)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  experimental: {
    agentUpgrade: "security",
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // No framing (clickjacking), no plugins, no <base> hijacking. Script/connect sources are left open on
          // purpose: wallets, Arc RPC and Vercel Analytics need them; tighten with a nonce CSP once mapped.
          // form-action is omitted: Chrome applies it to the redirect to Google during sign-in.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Per-user data must never land in a shared cache.
        source: "/(admin|api)/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default config;
