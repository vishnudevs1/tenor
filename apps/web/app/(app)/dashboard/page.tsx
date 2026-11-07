import type { Metadata } from "next";
import { listAccounts } from "@/lib/server/engine";
import { currentUser } from "@/lib/server/user";
import { HomeClient } from "./HomeClient";

export const metadata: Metadata = { title: "Home | Tenor" };

export default async function Home() {
  const user = (await currentUser())!;
  return <HomeClient initial={await listAccounts(user.id)} firstName={user.name?.split(" ")[0] ?? null} />;
}
