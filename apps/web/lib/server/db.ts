import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Postgres everywhere.
// - DATABASE_URL set (Vercel + Neon): node-postgres pool.
// - Not set (local dev, tests): PGlite — real Postgres compiled to WASM, stored in TENOR_DATA_DIR.
// Every query in the app goes through `db` / `tx` below, so the pages never know which one is in use.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,           -- Google subject id
  email       TEXT NOT NULL,
  name        TEXT,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  items_json    TEXT NOT NULL,            -- [{productId, qty, unitPrice}]
  total_micro   BIGINT NOT NULL,          -- USDC, 6 decimals (ERC-20 view on Arc)
  wallet        TEXT,
  status        TEXT NOT NULL CHECK (status IN ('pending','paid','expired')),
  tx_hash       TEXT UNIQUE,
  created_at    BIGINT NOT NULL,
  paid_at       BIGINT
);

CREATE TABLE IF NOT EXISTS accounts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id),
  order_id         TEXT REFERENCES orders(id),
  product_id       TEXT NOT NULL,
  size             DOUBLE PRECISION NOT NULL,
  demo             INTEGER NOT NULL DEFAULT 0,
  step             INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL CHECK (status IN ('active','passed','breached')),
  breach_reason    TEXT,
  balance          DOUBLE PRECISION NOT NULL,   -- cash: start + realized PnL − fees
  day_key          TEXT NOT NULL,               -- UTC yyyy-mm-dd of day_start_equity
  day_start_equity DOUBLE PRECISION NOT NULL,
  created_at       BIGINT NOT NULL,
  ended_at         BIGINT
);
CREATE INDEX IF NOT EXISTS accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS accounts_status ON accounts(status);
-- One active demo per user, enforced by the database rather than a racy read.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_one_active_demo ON accounts(user_id) WHERE demo = 1 AND status = 'active';

CREATE TABLE IF NOT EXISTS positions (
  account_id  TEXT NOT NULL REFERENCES accounts(id),
  market      TEXT NOT NULL,
  qty         DOUBLE PRECISION NOT NULL,  -- signed: + long, − short
  entry       DOUBLE PRECISION NOT NULL,
  tp          DOUBLE PRECISION,
  sl          DOUBLE PRECISION,
  opened_at   BIGINT NOT NULL,
  PRIMARY KEY (account_id, market)
);

CREATE TABLE IF NOT EXISTS fills (
  id           BIGSERIAL PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  market       TEXT NOT NULL,
  side         TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty          DOUBLE PRECISION NOT NULL,
  price        DOUBLE PRECISION NOT NULL,
  fee          DOUBLE PRECISION NOT NULL,
  realized_pnl DOUBLE PRECISION NOT NULL,
  reason       TEXT NOT NULL,             -- order | tp | sl | breach | pass
  ts           BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS fills_account ON fills(account_id, ts);
`;

export interface Q {
  /** All rows. Placeholders are $1, $2, … */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Returns the number of affected rows. */
  run(sql: string, params?: unknown[]): Promise<number>;
}

interface Driver {
  q: Q;
  tx<T>(fn: (t: Q) => Promise<T>): Promise<T>;
}

type Exec = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; count: number }>;
const wrap = (exec: Exec): Q => ({
  all: async <T>(s: string, p?: unknown[]) => (await exec(s, p)).rows as T[],
  one: async <T>(s: string, p?: unknown[]) => (await exec(s, p)).rows[0] as T | undefined,
  run: async (s: string, p?: unknown[]) => (await exec(s, p)).count,
});

async function postgres(url: string): Promise<Driver> {
  const pg = (await import("pg")).default;
  pg.types.setTypeParser(20, Number); // BIGINT (timestamps, counts) → number; all values here are < 2^53
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 });
  const exec = (c: { query: typeof pool.query }): Exec => async (s, p) => {
    const r = await c.query(s, p as unknown[]);
    return { rows: r.rows, count: r.rowCount ?? 0 };
  };
  return {
    q: wrap(exec(pool)),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(exec(client as unknown as { query: typeof pool.query })));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function pglite(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.TENOR_DATA_DIR ?? path.join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(path.join(dir, "pglite"));
  type Conn = Pick<typeof db, "query">;
  const exec = (c: Conn): Exec => async (s, p) => {
    const r = await c.query(s, p);
    return { rows: r.rows, count: r.affectedRows ?? 0 };
  };
  return { q: wrap(exec(db)), tx: (fn) => db.transaction((t) => fn(wrap(exec(t)))) };
}

async function open(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  // Serverless file systems are read-only and per-instance: never fall back to PGlite there.
  if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set — connect a Postgres database (e.g. Neon) to this Vercel project");
  const d = url ? await postgres(url) : await pglite();
  // Serialize schema setup across concurrent cold starts.
  await d.tx(async (t) => {
    await t.run("SELECT pg_advisory_xact_lock(727270)");
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await t.run(stmt);
  });
  return d;
}

// One driver per process; survives dev hot-reloads.
const g = globalThis as unknown as { __tenorDb?: Promise<Driver> };
const driver = () => (g.__tenorDb ??= open().catch((e) => {
  g.__tenorDb = undefined; // retry on the next request instead of caching the failure
  throw e;
}));

export const db: Q = {
  all: async (s, p) => (await driver()).q.all(s, p),
  one: async (s, p) => (await driver()).q.one(s, p),
  run: async (s, p) => (await driver()).q.run(s, p),
};

/** Run fn in a transaction. Lock rows you read-then-write with SELECT … FOR UPDATE. */
export async function tx<T>(fn: (t: Q) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}

/** Postgres unique-violation check (e.g. a reused tx hash or a second active demo). */
export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505";

export function newId(prefix: string) {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}-${Array.from(bytes, (b) => alphabet[b % 32]).join("")}`;
}

export const utcDayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
