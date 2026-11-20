import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, Card, cx } from "@/components/ui";
import { usd } from "@/lib/format";
import { adminOverview, isAdmin, listUsers, recentLogins } from "@/lib/server/admin";
import { currentUser } from "@/lib/server/user";

export const metadata: Metadata = { title: "Admin · Users | Tenor", robots: { index: false } };

const dateTime = (t: number | null) =>
  t == null ? "—" : new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const date = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function ago(t: number | null, now: number) {
  if (t == null) return "never";
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function AdminUsersPage() {
  const me = await currentUser();
  if (!me || !isAdmin(me.email)) {
    // In production, hide the page's existence from non-admins. In dev, say why access was refused.
    if (process.env.NODE_ENV === "production" || !me) notFound();
    const configured = Boolean(process.env.ADMIN_EMAILS?.trim());
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <Card className="p-6">
          <Badge tone="warn">Dev only</Badge>
          <h1 className="mt-3 text-lg font-semibold">Not an admin</h1>
          <p className="mt-2 text-sm text-muted">
            You&apos;re signed in as <span className="text-fg">{me.email}</span>.{" "}
            {configured ? "That email isn't in ADMIN_EMAILS." : "ADMIN_EMAILS isn't set (restart the dev server after editing .env.local)."}
          </p>
          <p className="mt-2 text-sm text-muted">
            Add it to <code className="num text-fg">apps/web/.env.local</code> as <code className="num text-fg">ADMIN_EMAILS={me.email}</code>. Production returns a plain 404 here.
          </p>
        </Card>
      </div>
    );
  }

  const [overview, users, logins] = await Promise.all([adminOverview(), listUsers(), recentLogins()]);
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <Badge tone="warn">Admin only</Badge>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total users", value: String(overview.users), hint: `${overview.newUsers7d} new · ${overview.active7d} active this week` },
          { label: "Total sign-ins", value: String(overview.logins), hint: `${overview.logins7d} this week` },
          { label: "Total challenges", value: String(overview.challenges), hint: `${overview.paidChallenges} paid · ${overview.challenges - overview.paidChallenges} demo` },
          { label: "Paying users", value: String(overview.payingUsers), hint: `${usd(overview.revenueUsdc, true)} in paid orders, all time` },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="num mt-1 text-2xl font-medium">{s.value}</div>
            <div className="mt-1 text-xs text-faint">{s.hint}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-medium">All users</h2>
          <span className="text-xs text-muted">{users.length} {users.length === 1 ? "user" : "users"} · most recently active first</span>
        </div>
        {users.length === 0 ? (
          <div className="border-t border-line px-5 py-10 text-center text-sm text-muted">Nobody has signed in yet.</div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-normal">User</th>
                  <th className="px-3 py-3 font-normal">Joined</th>
                  <th className="px-3 py-3 font-normal">Last sign-in</th>
                  <th className="px-3 py-3 font-normal">Last seen</th>
                  <th className="px-3 py-3 text-right font-normal">Sign-ins</th>
                  <th className="px-3 py-3 text-right font-normal">Challenges</th>
                  <th className="px-5 py-3 text-right font-normal">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {u.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.image} alt="" width={32} height={32} referrerPolicy="no-referrer" className="size-8 shrink-0 rounded-full" />
                        ) : (
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-medium text-accent">
                            {(u.name ?? u.email).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium">{u.name ?? "—"}</div>
                          <div className="truncate text-xs text-muted">{u.email}</div>
                          <div className="num truncate text-[11px] text-faint" title="Google subject id">{u.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted">{date(u.createdAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted" title={dateTime(u.lastLoginAt)}>{ago(u.lastLoginAt, now)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted" title={dateTime(u.lastSeenAt)}>{ago(u.lastSeenAt, now)}</td>
                    <td className="num px-3 py-3 text-right">{u.logins}</td>
                    <td className="num whitespace-nowrap px-3 py-3 text-right">
                      {u.challenges}
                      {u.challenges > 0 && <span className="text-xs text-faint"> ({u.paidChallenges} paid · {u.activeChallenges} active)</span>}
                    </td>
                    <td className={cx("num px-5 py-3 text-right", u.spentUsdc > 0 ? "text-fg" : "text-faint")}>{usd(u.spentUsdc, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-medium">Sign-in history</h2>
          <span className="text-xs text-muted">{logins.length} total · newest first</span>
        </div>
        {logins.length === 0 ? (
          <div className="border-t border-line px-5 py-8 text-center text-sm text-muted">No sign-ins recorded yet. They are logged from the next Google sign-in onwards.</div>
        ) : (
          <ul className="max-h-[480px] divide-y divide-line overflow-y-auto border-t border-line">
            {logins.map((l) => (
              <li key={`${l.userId}-${l.ts}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{l.name ?? l.email}</span>
                  {l.name && <span className="ml-2 text-xs text-muted">{l.email}</span>}
                </div>
                <span className="shrink-0 text-xs text-muted" title={dateTime(l.ts)}>{ago(l.ts, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
