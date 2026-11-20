import "server-only";
import { auth } from "@/auth";
import { claimLegacyUsers, recordLogin } from "./admin";
import { db } from "./db";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

/** Current signed-in user (persisted on first sight, sign-in recorded once), or null. */
export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  const now = Date.now();
  await db.run(
    `INSERT INTO users (id, email, name, image, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, image = excluded.image, last_seen_at = excluded.last_seen_at`,
    [u.id, u.email, u.name ?? null, u.image ?? null, now],
  );
  if (session?.loginAt && (await recordLogin(u.id, session.loginAt))) {
    // First request of a new sign-in: adopt rows left under older ids for this email.
    await claimLegacyUsers(u.id, u.email);
  }
  return { id: u.id, email: u.email, name: u.name ?? null };
}
