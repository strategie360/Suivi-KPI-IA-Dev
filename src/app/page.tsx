import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Entry } from "@/lib/types";

export default async function Home() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: entries } = await supabase
    .from("entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .limit(1000);

  return <Dashboard initialEntries={(entries ?? []) as Entry[]} userEmail={user.email ?? ""} />;
}
