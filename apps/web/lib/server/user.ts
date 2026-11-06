import "server-only";
import { auth } from "@/auth";
import { db } from "./db";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

/** Current signed-in user (persisted on first sight), or null. */
export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  await db.run(
    `INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name`,
    [u.id, u.email, u.name ?? null, Date.now()],
  );
  return { id: u.id, email: u.email, name: u.name ?? null };
}
