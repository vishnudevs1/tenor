import { createDemoAccount } from "@/lib/server/engine";
import { authed, body } from "@/lib/server/http";

export const POST = authed(async ({ req, user }) => {
  const { productId } = await body<{ productId: string }>(req);
  return { accountId: await createDemoAccount(user.id, String(productId)) };
});
