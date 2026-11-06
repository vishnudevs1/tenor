import "server-only";
import { NextResponse } from "next/server";
import { TradeError } from "./engine";
import { currentUser, type User } from "./user";

type Handler<P> = (ctx: { req: Request; params: P; user: User }) => Promise<unknown>;

/** Authenticated JSON route: 401 when signed out, TradeError → its status, anything else → 500. */
export function authed<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    try {
      return NextResponse.json(await handler({ req, params: await ctx.params, user }));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof TradeError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new TradeError("Invalid JSON body");
  }
}
