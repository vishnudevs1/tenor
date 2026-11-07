import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Trader app requires a signed-in user; marketing pages and /transparency stay public.
// API routes do their own auth check (see lib/server/http.ts).
export default auth((req) => {
  if (req.auth) return;
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/dashboard/:path*", "/challenges/:path*", "/trade/:path*", "/checkout/:path*", "/payouts/:path*", "/profile/:path*"],
};
