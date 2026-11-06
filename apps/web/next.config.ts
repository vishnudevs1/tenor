import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tenor/rules"],
  // PGlite ships WASM + data files; load it from node_modules instead of bundling. (Local dev only — Vercel uses pg.)
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
};

export default config;
