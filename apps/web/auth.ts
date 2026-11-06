import { createHash } from "node:crypto";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google is the only sign-in / sign-up method: first sign-in creates the account.
// Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET from the environment.
// TODO: on first sign-in, provision a Circle user-controlled wallet on Arc for payouts.

/**
 * Session-signing secret. Prefer AUTH_SECRET (or its pre-v5 name NEXTAUTH_SECRET).
 * If neither is set, derive one from the Google client secret — server-only and already secret,
 * so the derived value is too — so a missing variable can't take sign-in down.
 * Trade-off: rotating the Google secret then signs everyone out once. Set AUTH_SECRET to decouple.
 */
function resolveSecret(): { secret?: string; source: "AUTH_SECRET" | "NEXTAUTH_SECRET" | "derived" | "missing" } {
  if (process.env.AUTH_SECRET) return { secret: process.env.AUTH_SECRET, source: "AUTH_SECRET" };
  if (process.env.NEXTAUTH_SECRET) return { secret: process.env.NEXTAUTH_SECRET, source: "NEXTAUTH_SECRET" };
  const google = process.env.AUTH_GOOGLE_SECRET;
  if (google) return { secret: createHash("sha256").update(`tenor/auth-secret/v1:${google}`).digest("base64"), source: "derived" };
  return { source: "missing" };
}

const resolved = resolveSecret();
export const authSecret = resolved.secret;
export const authSecretSource = resolved.source;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  providers: [Google],
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    // token.sub is Google's stable subject id — our user primary key.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
