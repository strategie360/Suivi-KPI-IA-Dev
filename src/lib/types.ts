export type Entry = {
  id: string;
  ticket_ref: string;
  ticket_title: string;
  project: string;
  developer_name: string;
  entry_date: string; // YYYY-MM-DD
  estimation_h: number;
  temps_reel_h: number;
  pct_documentation: number;
  pct_iterations: number;
  temps_ia_h: number;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export function deriveGain(e: Pick<Entry, "estimation_h" | "temps_reel_h">) {
  const estim = Number(e.estimation_h) || 0;
  const reel = Number(e.temps_reel_h) || 0;
  const gainH = estim - reel;
  const gainPct = estim > 0 ? (gainH / estim) * 100 : null;
  return { gainH, gainPct };
}
