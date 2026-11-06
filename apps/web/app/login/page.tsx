import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, googleConfigured } from "@/auth";
import { signInWithGoogle } from "./actions";
import { GoogleButton } from "./GoogleButton";

export const metadata: Metadata = { title: "Sign in — Tenor" };

const ERRORS: Record<string, string> = {
  AccessDenied: "Access was denied. Try a different Google account.",
  Configuration: "Sign-in isn't configured yet. Please try again later.",
};

const safePath = (p?: string) => (p?.startsWith("/") && !p.startsWith("//") ? p : "/dashboard");

// Deliberately minimal: one decision, one primary action. Sign in and sign up are the same step.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await searchParams;
  if (await auth()) redirect(safePath(callbackUrl));

  const message = error ? (ERRORS[error] ?? "Couldn't sign you in. Please try again.") : null;

  return (
    <div className="sky relative flex min-h-dvh flex-col overflow-hidden text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="cloud left-[-10%] top-[8%] h-64 w-[55%]" />
        <div className="cloud right-[-12%] top-[30%] h-72 w-[50%] [animation-delay:-12s]" />
        <div className="cloud bottom-[-8%] left-[15%] h-80 w-[70%] bg-white/70 [animation-delay:-24s]" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        <Link href="/" className="font-display text-6xl tracking-tight drop-shadow-sm sm:text-7xl">
          Tenor
        </Link>

        <div className="mt-5 flex items-center gap-2">
          <Link href="/transparency" className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur hover:bg-white/30">
            100% A-book
          </Link>
          <Link href="/#how" className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium backdrop-blur hover:bg-white/30">
            How it works ↗
          </Link>
        </div>

        <p className="num mt-6 text-center text-[15px] text-white/90 [text-shadow:0_1px_12px_rgb(0_40_90/0.35)]">
          get funded, get paid in your own currency
        </p>

        <form action={signInWithGoogle} className="mt-9 w-full max-w-sm">
          <input type="hidden" name="callbackUrl" value={safePath(callbackUrl)} />
          <GoogleButton disabled={!googleConfigured} />
          <p className="mt-4 text-center text-sm text-white/90">New here? The same button creates your account.</p>
        </form>

        <p aria-live="polite" className="mt-3 min-h-5 max-w-sm text-center text-sm font-medium text-white">
          {message}
          {!googleConfigured &&
            (process.env.NODE_ENV === "production"
              ? "Sign-in is temporarily unavailable. Please try again shortly."
              : "Dev: set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in apps/web/.env.local")}
        </p>
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-6 pb-8 text-sm text-[#0b2a4a]/80">
        <Link href="#" className="hover:text-[#0b2a4a]">Terms</Link>
        <span className="font-display text-lg">on Arc</span>
        <Link href="#" className="hover:text-[#0b2a4a]">Privacy</Link>
      </footer>
    </div>
  );
}
