import "server-only";
import { USDC_ERC20_DECIMALS } from "@/lib/arc";
import { db } from "./db";

export interface ProfileStats {
  memberSince: number | null;
  challenges: { total: number; paid: number; demo: number; active: number; passed: number; breached: number };
  trades: { closed: number; wins: number; netPnl: number };
  spentUsdc: number;
}

/** One round-trip per table: everything the profile page shows, computed in Postgres. */
export async function profileStats(userId: string): Promise<ProfileStats> {
  const [user, accts, trades, spent] = await Promise.all([
    db.one<{ created_at: number }>("SELECT created_at FROM users WHERE id = $1", [userId]),
    db.one<{ total: number; paid: number; demo: number; active: number; passed: number; breached: number }>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE demo = 0) AS paid,
              COUNT(*) FILTER (WHERE demo = 1) AS demo,
              COUNT(*) FILTER (WHERE status = 'active') AS active,
              COUNT(*) FILTER (WHERE status = 'passed') AS passed,
              COUNT(*) FILTER (WHERE status = 'breached') AS breached
       FROM accounts WHERE user_id = $1`,
      [userId],
    ),
    // One row per closing fill = one closed trade (or partial close). Net = realized P&L minus open + close fees.
    db.one<{ closed: number; wins: number; net: number | null }>(
      `SELECT COUNT(*) AS closed,
              COUNT(*) FILTER (WHERE f.realized_pnl - f.fee - COALESCE(f.open_fee, 0) > 0) AS wins,
              SUM(f.realized_pnl - f.fee - COALESCE(f.open_fee, 0)) AS net
       FROM fills f JOIN accounts a ON a.id = f.account_id
       WHERE a.user_id = $1 AND f.reason NOT IN ('open', 'order')`,
      [userId],
    ),
    db.one<{ micro: number | null }>("SELECT SUM(total_micro) AS micro FROM orders WHERE user_id = $1 AND status = 'paid'", [userId]),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    memberSince: user?.created_at ?? null,
    challenges: {
      total: n(accts?.total),
      paid: n(accts?.paid),
      demo: n(accts?.demo),
      active: n(accts?.active),
      passed: n(accts?.passed),
      breached: n(accts?.breached),
    },
    trades: { closed: n(trades?.closed), wins: n(trades?.wins), netPnl: n(trades?.net) },
    spentUsdc: n(spent?.micro) / 10 ** USDC_ERC20_DECIMALS,
  };
}
