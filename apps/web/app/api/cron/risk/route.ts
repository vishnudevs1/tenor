import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { riskSweep } from "@/lib/server/engine";

// Enforces rules on every active account even when nobody has the app open.
// Schedule it (e.g. every minute) with: Authorization: Bearer $CRON_SECRET
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await riskSweep());
}
