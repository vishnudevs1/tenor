import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "@/app/login/actions";
import { Badge, ButtonLink, Card, cx } from "@/components/ui";
import { arc } from "@/lib/arc";
import { pct, signedUsd, usd } from "@/lib/format";
import { listAccounts } from "@/lib/server/engine";
import { profileStats } from "@/lib/server/profile";
import { currentUser } from "@/lib/server/user";

export const metadata: Metadata = { title: "Profile | Tenor" };

const STATUS = {
  active: { tone: "warn", label: "Active" },
  passed: { tone: "up", label: "Passed" },
  breached: { tone: "down", label: "Breached" },
} as const;

export default async function ProfilePage() {
  const user = (await currentUser())!;
  const image = (await auth())?.user?.image ?? null;
  const [stats, accounts] = await Promise.all([profileStats(user.id), listAccounts(user.id)]);
  const { challenges: c, trades: t } = stats;
  const winRate = t.closed > 0 ? t.wins / t.closed : null;
  const initial = (user.name ?? user.email).charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>

      {/* Identity */}
      <Card className="mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        {image ? (
          // Google profile photo: small and external, so next/image isn't worth the remote-host config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={72} height={72} referrerPolicy="no-referrer" className="size-18 shrink-0 rounded-full" />
        ) : (
          <span className="grid size-18 shrink-0 place-items-center rounded-full bg-accent/20 text-2xl font-semibold text-accent">{initial}</span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-semibold">{user.name ?? "Trader"}</div>
          <div className="truncate text-sm text-muted">{user.email}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>Signed in with Google</Badge>
            <Badge tone="accent">{arc.name}</Badge>
            {stats.memberSince && <Badge>Member since {new Date(stats.memberSince).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</Badge>}
          </div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="h-10 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:border-down/50 hover:text-down">
            Sign out
          </button>
        </form>
      </Card>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Challenges", value: String(c.total), hint: `${c.paid} paid · ${c.demo} demo` },
          { label: "Active", value: String(c.active), hint: `${c.passed} passed · ${c.breached} breached` },
          { label: "Closed trades", value: String(t.closed), hint: winRate === null ? "No closed trades yet" : `${pct(winRate)} win rate` },
          { label: "Net P&L", value: signedUsd(t.netPnl), hint: "After fees, all accounts", tone: t.netPnl > 0 ? "text-up" : t.netPnl < 0 ? "text-down" : "" },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs text-muted">{s.label}</div>
            <div className={cx("num mt-1 text-2xl font-medium", s.tone)}>{s.value}</div>
            <div className="mt-1 text-xs text-faint">{s.hint}</div>
          </Card>
        ))}
      </div>

      {/* Accounts */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-medium">Your accounts</h2>
          <span className="text-xs text-muted">Spent on challenges: <span className="num text-fg">{usd(stats.spentUsdc, true)}</span></span>
        </div>
        {accounts.length === 0 ? (
          <div className="border-t border-line px-5 py-10 text-center text-sm text-muted">
            <p>No accounts yet.</p>
            <ButtonLink href="/challenges" className="mt-4">Buy a challenge</ButtonLink>
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {accounts.map((a) => {
              const pnl = a.equity - a.size;
              const st = STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link href={`/trade?account=${a.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="num text-xs text-faint">{a.id}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <div className="num text-sm">{usd(a.equity, true)}</div>
                        <div className={cx("num text-xs", pnl >= 0 ? "text-up" : "text-down")}>{signedUsd(pnl)}</div>
                      </div>
                      <Badge tone={a.demo && a.status === "active" ? "neutral" : st.tone}>{a.demo && a.status === "active" ? "Demo" : st.label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Payouts */}
      <Card className="mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">Payout wallet</h2>
          <p className="mt-1 text-sm text-muted">You&apos;ll add a payout wallet and complete KYC when your first funded account is ready.</p>
        </div>
        <ButtonLink href="/payouts" variant="secondary" className="shrink-0">Payouts</ButtonLink>
      </Card>
    </div>
  );
}
