import { NextResponse } from "next/server";
import { authSecret, authSecretSource, googleConfigured } from "@/auth";
import { treasuryAddress } from "@/lib/server/checkout";
import { db } from "@/lib/server/db";
import { getMarkets } from "@/lib/server/venue";

export const dynamic = "force-dynamic";

// Deployment health: which settings are present (never their values) and whether dependencies answer.
export async function GET() {
  const [database, venue] = await Promise.all([
    db.one("SELECT 1 AS ok").then(
      () => ({ ok: true, driver: process.env.DATABASE_URL ? "postgres" : "pglite" }),
      (e: Error) => ({ ok: false, error: e.message.slice(0, 200) }),
    ),
    getMarkets().then(
      (m) => ({ ok: true, markets: Object.keys(m.stats).length }),
      () => ({ ok: false }),
    ),
  ]);
  const config = {
    authSecret: Boolean(authSecret),
    authSecretSource, // "derived" means AUTH_SECRET is not set — works, but set it to decouple from the Google secret
    googleClient: googleConfigured,
    treasuryAddress: treasuryAddress() !== null,
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  const ok = database.ok && venue.ok && config.authSecret && config.googleClient;
  return NextResponse.json({ ok, config, database, venue }, { status: ok ? 200 : 503 });
}
