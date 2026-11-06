import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Google is the only sign-in / sign-up method: first sign-in creates the account.
// Reads AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET from the environment.
// TODO: on first sign-in, provision a Circle user-controlled wallet on Arc for payouts.
export const { handlers, auth, signIn, signOut } = NextAuth({
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
