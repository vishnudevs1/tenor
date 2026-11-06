"use server";

import { signIn, signOut } from "@/auth";

/** Only allow same-site relative paths, so callbackUrl can't redirect off-site. */
function safePath(p: FormDataEntryValue | null) {
  const s = typeof p === "string" ? p : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

export async function signInWithGoogle(form: FormData) {
  await signIn("google", { redirectTo: safePath(form.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
