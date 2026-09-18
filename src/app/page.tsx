import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "@/components/Dashboard";
import type { Entry } from "@/lib/types";
import { MOCK_MODE, MOCK_USER_EMAIL, initialMockEntries } from "@/lib/mock";

export default async function Home() {
  if (MOCK_MODE) {
    return <Dashboard initialEntries={initialMockEntries} userEmail={MOCK_USER_EMAIL} mock />;
  }

  const supabase = createClient();

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

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
