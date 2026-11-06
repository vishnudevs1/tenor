import { listAccounts } from "@/lib/server/engine";
import { authed } from "@/lib/server/http";

export const GET = authed(async ({ user }) => ({ accounts: await listAccounts(user.id) }));
