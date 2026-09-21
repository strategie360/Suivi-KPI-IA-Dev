import type { Entry } from "./types";

// Mode démo : contourne Supabase et le login pour tester l'UI en local.
// Activé en mettant NEXT_PUBLIC_MOCK=1 dans .env.local. Ne jamais activer
// en production (voir middleware.ts et src/app/page.tsx).
export const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "1";

export const MOCK_USER_EMAIL = "demo@local.test";

function iso(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
}

export const initialMockEntries: Entry[] = [
  {
    id: "mock-1",
    ticket_ref: "PROJ-101",
    ticket_title: "",
    project: "PROJ",
    developer_name: "demo@local.test",
    entry_date: iso(1),
    estimation_h: 8,
    temps_reel_h: 5,
    pct_documentation: 10,
    pct_iterations: 20,
    temps_ia_h: 3,
    notes: "",
    source: "web",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "mock-2",
    ticket_ref: "PROJ-97",
    ticket_title: "",
    project: "PROJ",
    developer_name: "collegue@local.test",
    entry_date: iso(4),
    estimation_h: 4,
    temps_reel_h: 4,
    pct_documentation: 0,
    pct_iterations: 10,
    temps_ia_h: 0,
    notes: "",
    source: "web",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "mock-3",
    ticket_ref: "ADOBE-2075",
    ticket_title: "",
    project: "ADOBE",
    developer_name: "demo@local.test",
    entry_date: iso(9),
    estimation_h: 10,
    temps_reel_h: 6,
    pct_documentation: 15,
    pct_iterations: 25,
    temps_ia_h: 4,
    notes: "",
    source: "web",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];
