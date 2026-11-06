import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts does the fast redirect; this is the authoritative check.
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { name, email, image } = session.user;
  return <AppShell user={{ name: name ?? null, email: email ?? null, image: image ?? null }}>{children}</AppShell>;
}
