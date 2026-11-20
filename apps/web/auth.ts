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
    // Email identifies admins (ADMIN_EMAILS) and legacy rows to merge, so it must be one Google has verified.
    // A Google account can carry an address its owner never proved they control.
    signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return false;
    },
    // `account` is only present on the sign-in request itself, so this runs exactly once per sign-in.
    jwt({ token, account }) {
      if (account) {
        // Without a DB adapter, Auth.js gives every sign-in a fresh random user id (@auth/core oauth callback).
        // Key users by Google's stable subject id instead, so signing in again finds the same user.
        token.sub = account.providerAccountId;
        token.loginAt = Date.now(); // currentUser() records it (DB kept out of here: proxy.ts loads this file too)
        token.idv = 2;
      } else if (token.idv !== 2) {
        // Session from before the fix: its sub is a random per-sign-in id. End it once; the next
        // sign-in merges that user's data into the stable id (see claimLegacyUsers).
        return null;
      }
      return token;
    },
    // token.sub is Google's stable subject id — our user primary key.
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (typeof token.loginAt === "number") session.loginAt = token.loginAt;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    /** When this session's Google sign-in happened (ms). Absent on sessions created before login tracking. */
    loginAt?: number;
  }
}

export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
