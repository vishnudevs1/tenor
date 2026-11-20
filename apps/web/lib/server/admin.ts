import "server-only";
import { USDC_ERC20_DECIMALS } from "@/lib/arc";
import { db, tx } from "./db";

/** Admins are listed by Google email in ADMIN_EMAILS (comma-separated). Unset = nobody. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Idempotent: the same session re-records the same (user, ts) row, which is ignored. True when newly recorded. */
export async function recordLogin(userId: string, ts: number): Promise<boolean> {
  return (await db.run("INSERT INTO logins (user_id, ts) VALUES ($1, $2) ON CONFLICT DO NOTHING", [userId, ts])) > 0;
}

/**
 * Users used to be keyed by a random id per sign-in, so one Google account could own several user rows.
 * Move everything owned by other rows with the same (Google-verified) email onto `userId` and delete them.
 * Returns how many duplicate rows were merged.
 */
export async function claimLegacyUsers(userId: string, email: string): Promise<number> {
  return tx(async (t) => {
    // Only legacy rows (random UUIDs from the old scheme) are claimable. Google subject ids are digits, so a
    // row keyed by another real Google account is never taken over, even if it shares the email.
    const olds = await t.all<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND id <> $2
         AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       FOR UPDATE`,
      [email, userId],
    );
    if (olds.length === 0) return 0;
    const ids = olds.map((o) => o.id);
    // Only one active demo per user (accounts_one_active_demo): keep the oldest, end the rest. Demo funds only.
    const extraDemos = (
      await t.all<{ id: string }>(
        `SELECT id FROM accounts WHERE user_id = ANY($1) AND demo = 1 AND status = 'active'
         ORDER BY created_at OFFSET 1`,
        [[userId, ...ids]],
      )
    ).map((r) => r.id);
    if (extraDemos.length) {
      await t.run("DELETE FROM tickets WHERE account_id = ANY($1)", [extraDemos]);
      await t.run(
        "UPDATE accounts SET status = 'breached', breach_reason = 'Duplicate demo closed when your sign-ins were merged', ended_at = $1 WHERE id = ANY($2)",
        [Date.now(), extraDemos],
      );
    }
    await t.run("UPDATE orders SET user_id = $1 WHERE user_id = ANY($2)", [userId, ids]);
    await t.run("UPDATE accounts SET user_id = $1 WHERE user_id = ANY($2)", [userId, ids]);
    await t.run("INSERT INTO logins (user_id, ts) SELECT $1, ts FROM logins WHERE user_id = ANY($2) ON CONFLICT DO NOTHING", [userId, ids]);
    await t.run("DELETE FROM logins WHERE user_id = ANY($1)", [ids]);
    // Keep the earliest join date.
    await t.run(
      "UPDATE users SET created_at = LEAST(created_at, (SELECT MIN(created_at) FROM users WHERE id = ANY($2))) WHERE id = $1",
      [userId, ids],
    );
    await t.run("DELETE FROM users WHERE id = ANY($1)", [ids]);
    return ids.length;
  });
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: number;
  lastSeenAt: number | null;
  lastLoginAt: number | null;
  logins: number;
  challenges: number;
  paidChallenges: number;
  activeChallenges: number;
  spentUsdc: number;
}

/** All-time totals, with last-7-day figures kept as secondary context. */
export interface AdminOverview {
  users: number;
  newUsers7d: number;
  active7d: number;
  logins: number;
  logins7d: number;
  challenges: number;
  paidChallenges: number;
  payingUsers: number;
  revenueUsdc: number;
}

export interface AdminLogin {
  ts: number;
  userId: string;
  email: string;
  name: string | null;
}

const n = (v: unknown) => Number(v ?? 0);
const nOrNull = (v: unknown) => (v == null ? null : Number(v));
const WEEK = 7 * 24 * 3600 * 1000;

/** Every user with their sign-in, challenge and spend totals, most recently active first. */
/** Every user (no limit by default), most recently active first. */
export async function listUsers(limit: number | null = null): Promise<AdminUser[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT u.id, u.email, u.name, u.image, u.created_at, u.last_seen_at,
            l.cnt AS logins, l.last AS last_login_at,
            a.total, a.paid, a.active,
            o.micro AS spent_micro
     FROM users u
     LEFT JOIN (SELECT user_id, COUNT(*) AS cnt, MAX(ts) AS last FROM logins GROUP BY user_id) l ON l.user_id = u.id
     LEFT JOIN (SELECT user_id, COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE demo = 0) AS paid,
                       COUNT(*) FILTER (WHERE status = 'active') AS active
                FROM accounts GROUP BY user_id) a ON a.user_id = u.id
     LEFT JOIN (SELECT user_id, SUM(total_micro) AS micro FROM orders WHERE status = 'paid' GROUP BY user_id) o ON o.user_id = u.id
     ORDER BY COALESCE(u.last_seen_at, u.created_at) DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: (r.name as string | null) ?? null,
    image: (r.image as string | null) ?? null,
    createdAt: n(r.created_at),
    lastSeenAt: nOrNull(r.last_seen_at),
    lastLoginAt: nOrNull(r.last_login_at),
    logins: n(r.logins),
    challenges: n(r.total),
    paidChallenges: n(r.paid),
    activeChallenges: n(r.active),
    spentUsdc: n(r.spent_micro) / 10 ** USDC_ERC20_DECIMALS,
  }));
}

export async function adminOverview(now = Date.now()): Promise<AdminOverview> {
  const since = now - WEEK;
  const [u, l, a, o] = await Promise.all([
    db.one<Record<string, unknown>>(
      `SELECT COUNT(*) AS users,
              COUNT(*) FILTER (WHERE created_at >= $1) AS new7d,
              COUNT(*) FILTER (WHERE last_seen_at >= $1) AS active7d
       FROM users`,
      [since],
    ),
    db.one<Record<string, unknown>>("SELECT COUNT(*) AS logins, COUNT(*) FILTER (WHERE ts >= $1) AS logins7d FROM logins", [since]),
    db.one<Record<string, unknown>>("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE demo = 0) AS paid FROM accounts"),
    db.one<Record<string, unknown>>("SELECT COUNT(DISTINCT user_id) AS payers, SUM(total_micro) AS micro FROM orders WHERE status = 'paid'"),
  ]);
  return {
    users: n(u?.users),
    newUsers7d: n(u?.new7d),
    active7d: n(u?.active7d),
    logins: n(l?.logins),
    logins7d: n(l?.logins7d),
    challenges: n(a?.total),
    paidChallenges: n(a?.paid),
    payingUsers: n(o?.payers),
    revenueUsdc: n(o?.micro) / 10 ** USDC_ERC20_DECIMALS,
  };
}

/** Sign-in history, newest first. No limit by default. */
export async function recentLogins(limit: number | null = null): Promise<AdminLogin[]> {
  const rows = await db.all<Record<string, unknown>>(
    `SELECT l.ts, l.user_id, u.email, u.name FROM logins l JOIN users u ON u.id = l.user_id ORDER BY l.ts DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ts: n(r.ts), userId: String(r.user_id), email: String(r.email), name: (r.name as string | null) ?? null }));
}
