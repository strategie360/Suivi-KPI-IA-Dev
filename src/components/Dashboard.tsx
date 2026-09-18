"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deriveGain, type Entry } from "@/lib/types";
import BarChart from "./BarChart";

function fmtH(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return (Math.round(n * 10) / 10).toString().replace(".", ",") + " h";
}
function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return (Math.round(n * 10) / 10).toString().replace(".", ",") + " %";
}
function projectOf(e: Pick<Entry, "project" | "ticket_ref">) {
  if (e.project) return e.project;
  const m = /^[A-Za-z]+/.exec(e.ticket_ref || "");
  return m ? m[0].toUpperCase() : "—";
}

function parseTicketRef(input: string): { ticketRef: string; project: string } | null {
  const m = /([A-Za-z][A-Za-z0-9]*)-(\d+)/.exec(input.trim());
  if (!m) return null;
  return { ticketRef: `${m[1].toUpperCase()}-${m[2]}`, project: m[1].toUpperCase() };
}

function parseNumber(input: string): number | null {
  const m = /-?\d+(?:[.,]\d+)?/.exec(input.trim());
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export default function Dashboard({
  initialEntries,
  userEmail
}: {
  initialEntries: Entry[];
  userEmail: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [devFilter, setDevFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [period, setPeriod] = useState("30");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ticketInput, setTicketInput] = useState("");
  const [estimInput, setEstimInput] = useState("");
  const [docInput, setDocInput] = useState("");
  const [iterInput, setIterInput] = useState("");
  const [iaInput, setIaInput] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => {
        supabase
          .from("entries")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(1000)
          .then(({ data }) => {
            if (data) setEntries(data as Entry[]);
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const devs = useMemo(
    () => Array.from(new Set(entries.map((e) => e.developer_name).filter(Boolean))).sort(),
    [entries]
  );
  const projects = useMemo(
    () => Array.from(new Set(entries.map(projectOf).filter(Boolean))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const cutoff = period === "all" ? null : new Date(Date.now() - Number(period) * 86400000);
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (devFilter && e.developer_name !== devFilter) return false;
      if (projectFilter && projectOf(e) !== projectFilter) return false;
      if (cutoff && new Date(e.entry_date) < cutoff) return false;
      if (q) {
        const hay = `${e.ticket_ref} ${e.ticket_title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, devFilter, projectFilter, period, search]);

  const withEstim = filtered.filter((e) => Number(e.estimation_h) > 0);
  const avgGainPct = withEstim.length
    ? withEstim.reduce((s, e) => s + (deriveGain(e).gainPct ?? 0), 0) / withEstim.length
    : null;
  const totalIa = filtered.reduce((s, e) => s + (Number(e.temps_ia_h) || 0), 0);
  const avgEcart = filtered.length
    ? filtered.reduce((s, e) => s + deriveGain(e).gainH, 0) / filtered.length
    : null;
  const distinctTickets = new Set(filtered.map((e) => e.ticket_ref)).size;

  const chartData = useMemo(() => {
    return filtered
      .slice()
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
      .slice(-10)
      .map((e) => ({ label: e.ticket_ref, estimation: Number(e.estimation_h) || 0, reel: Number(e.temps_reel_h) || 0 }));
  }, [filtered]);

  const byDev = useMemo(() => {
    const map = new Map<string, { count: number; gainSum: number; gainN: number; ia: number }>();
    filtered.forEach((e) => {
      const d = e.developer_name || "Inconnu";
      const s = map.get(d) || { count: 0, gainSum: 0, gainN: 0, ia: 0 };
      s.count++;
      const g = deriveGain(e);
      if (g.gainPct !== null) {
        s.gainSum += g.gainPct;
        s.gainN++;
      }
      s.ia += Number(e.temps_ia_h) || 0;
      map.set(d, s);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filtered]);

  const sortedRows = useMemo(
    () => filtered.slice().sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()),
    [filtered]
  );

  async function handleDelete(entry: Entry) {
    if (!confirm(`Supprimer la saisie ${entry.ticket_ref} du ${entry.entry_date} ?`)) return;
    const { error } = await supabase.from("entries").delete().eq("id", entry.id);
    if (error) {
      setToast("Suppression impossible (droits insuffisants ?).");
    } else {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      setToast("Saisie supprimée.");
    }
  }

  async function handleExport() {
    if (!filtered.length) {
      setToast("Aucune donnée à exporter avec ces filtres.");
      return;
    }
    const XLSX = await import("xlsx");

    const rows = filtered
      .slice()
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())
      .map((e) => {
        const g = deriveGain(e);
        return {
          Ticket: e.ticket_ref,
          Titre: e.ticket_title,
          Projet: projectOf(e),
          Développeur: e.developer_name,
          Date: e.entry_date,
          "Estimation initiale (h)": e.estimation_h,
          "Temps réel (h)": e.temps_reel_h,
          "% Documentation": e.pct_documentation,
          "% Itérations": e.pct_iterations,
          "Temps via IA (h)": e.temps_ia_h,
          "Gain (h)": Math.round(g.gainH * 100) / 100,
          "Gain (%)": g.gainPct === null ? "" : Math.round(g.gainPct * 10) / 10,
          Note: e.notes || ""
        };
      });

    const summaryRows = byDev.map(([dev, s]) => ({
      Développeur: dev,
      Tickets: s.count,
      "Gain moyen (%)": s.gainN ? Math.round((s.gainSum / s.gainN) * 10) / 10 : "",
      "Temps IA cumulé (h)": Math.round(s.ia * 100) / 100
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Saisies");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Synthese par dev");
    XLSX.writeFile(wb, `suivi-kpi-ia_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function openNewForm() {
    setEditingId(null);
    setTicketInput("");
    setEstimInput("");
    setDocInput("");
    setIterInput("");
    setIaInput("");
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(entry: Entry) {
    setEditingId(entry.id);
    setTicketInput(entry.ticket_ref);
    setEstimInput(String(entry.estimation_h));
    setDocInput(String(entry.pct_documentation));
    setIterInput(String(entry.pct_iterations));
    setIaInput(String(entry.temps_ia_h));
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmitEntry(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const parsedTicket = parseTicketRef(ticketInput);
    const estimation = parseNumber(estimInput);
    const pctDoc = parseNumber(docInput);
    const pctIter = parseNumber(iterInput);
    const tempsIa = parseNumber(iaInput);

    if (!parsedTicket) {
      setFormError("Ticket invalide — collez l'URL Jira ou une référence du type PROJ-1234.");
      return;
    }
    if (estimation === null || estimation < 0) {
      setFormError("Estimation invalide.");
      return;
    }
    if (pctDoc === null || pctDoc < 0 || pctDoc > 100) {
      setFormError("% documentation doit être entre 0 et 100.");
      return;
    }
    if (pctIter === null || pctIter < 0 || pctIter > 100) {
      setFormError("% itérations doit être entre 0 et 100.");
      return;
    }
    if (tempsIa === null || tempsIa < 0) {
      setFormError("Temps IA invalide.");
      return;
    }

    setSaving(true);

    const fields = {
      ticket_ref: parsedTicket.ticketRef,
      project: parsedTicket.project,
      estimation_h: estimation,
      temps_reel_h: Math.max(0, estimation - tempsIa),
      pct_documentation: pctDoc,
      pct_iterations: pctIter,
      temps_ia_h: tempsIa
    };

    const { error } = editingId
      ? await supabase.from("entries").update(fields).eq("id", editingId)
      : await supabase.from("entries").upsert(
          {
            ...fields,
            ticket_title: "",
            developer_name: userEmail,
            entry_date: new Date().toISOString().slice(0, 10),
            notes: "",
            source: "web"
          },
          { onConflict: "ticket_ref,entry_date,developer_name" }
        );

    setSaving(false);

    if (error) {
      setFormError(`Écriture refusée par la base (${error.code || "?"}): ${error.message}`);
      return;
    }

    window.location.reload();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Suivi KPI IA Dev</h1>
          <p className="mt-1 text-sm text-text-muted">
            Tous les tickets Jira de l&apos;équipe — charge estimée vs réelle, impact de l&apos;IA sur le développement
          </p>
          <p className="mt-1 text-xs text-text-faint">Connecté en tant que {userEmail}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => (showForm ? closeForm() : openNewForm())}
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            + Nouvelle saisie
          </button>
          <button
            onClick={handleExport}
            className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text transition hover:border-accent"
          >
            Exporter Excel
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-transparent px-3.5 py-2 text-sm text-text-muted transition hover:bg-surface-alt"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {showForm && (
        <form
          onSubmit={handleSubmitEntry}
          className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border-2 border-accent bg-surface p-3.5 shadow-sm"
        >
          <div className="w-full text-sm font-semibold text-text">
            {editingId ? "Modifier la saisie" : "Nouvelle saisie"}
          </div>
          <Field label="Ticket Jira (URL ou réf.)" className="min-w-[240px] flex-1">
            <input
              type="text"
              value={ticketInput}
              onChange={(e) => setTicketInput(e.target.value)}
              placeholder="https://jira.totalenergies.com/browse/PROJ-1234"
              className="select"
              autoFocus
            />
          </Field>
          <Field label="Estimation (h)">
            <input
              type="text"
              inputMode="decimal"
              value={estimInput}
              onChange={(e) => setEstimInput(e.target.value)}
              placeholder="10h"
              className="select w-24"
            />
          </Field>
          <Field label="% Documentation">
            <input
              type="text"
              inputMode="decimal"
              value={docInput}
              onChange={(e) => setDocInput(e.target.value)}
              placeholder="10%"
              className="select w-24"
            />
          </Field>
          <Field label="% Itérations">
            <input
              type="text"
              inputMode="decimal"
              value={iterInput}
              onChange={(e) => setIterInput(e.target.value)}
              placeholder="30%"
              className="select w-24"
            />
          </Field>
          <Field label="Temps IA (h)">
            <input
              type="text"
              inputMode="decimal"
              value={iaInput}
              onChange={(e) => setIaInput(e.target.value)}
              placeholder="1h"
              className="select w-24"
            />
          </Field>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : editingId ? "Modifier" : "Enregistrer"}
          </button>
          <button type="button" onClick={closeForm} className="px-2 py-2 text-sm text-text-muted underline hover:text-accent">
            Annuler
          </button>
          {formError && <p className="w-full text-sm text-bad">{formError}</p>}
        </form>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm">
        <Field label="Développeur">
          <select value={devFilter} onChange={(e) => setDevFilter(e.target.value)} className="select">
            <option value="">Tous</option>
            {devs.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Projet">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="select">
            <option value="">Tous</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Période">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="select">
            <option value="all">Toutes dates</option>
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </Field>
        <Field label="Recherche ticket" className="min-w-[200px] flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ex. PROJ-123 ou mot-clé"
            className="select"
          />
        </Field>
        <button
          onClick={() => {
            setDevFilter("");
            setProjectFilter("");
            setPeriod("30");
            setSearch("");
          }}
          className="pb-2 text-xs text-text-muted underline hover:text-accent"
        >
          Réinitialiser
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Tickets suivis" value={String(filtered.length)} sub={filtered.length ? `${distinctTickets} ticket(s) distinct(s)` : " "} />
        <Tile
          label="Gain de temps moyen"
          value={fmtPct(avgGainPct)}
          tone={avgGainPct === null ? "neutral" : avgGainPct >= 0 ? "good" : "bad"}
          sub="estimation TU vs réel avec IA"
        />
        <Tile label="Temps IA cumulé" value={filtered.length ? fmtH(totalIa) : "–"} sub="heures gagnées / utilisées via IA" />
        <Tile
          label="Écart estimation moyen"
          value={fmtH(avgEcart)}
          tone={avgEcart === null ? "neutral" : avgEcart >= 0 ? "good" : "bad"}
          sub="estimation − réel, en heures"
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[1.55fr_1fr]">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Estimation vs réel</h2>
            <span className="text-xs text-text-faint">10 saisies les plus récentes</span>
          </div>
          <BarChart data={chartData} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-text">Par développeur</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-text-muted">
                <th className="pb-2 font-medium">Dev</th>
                <th className="pb-2 text-right font-medium">Tickets</th>
                <th className="pb-2 text-right font-medium">Gain moy.</th>
                <th className="pb-2 text-right font-medium">Temps IA</th>
              </tr>
            </thead>
            <tbody>
              {byDev.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-text-faint">Aucune donnée</td>
                </tr>
              )}
              {byDev.map(([dev, s]) => (
                <tr key={dev} className="border-b border-border last:border-0">
                  <td className="py-1.5">{dev}</td>
                  <td className="tabular py-1.5 text-right font-mono">{s.count}</td>
                  <td className="tabular py-1.5 text-right font-mono">{fmtPct(s.gainN ? s.gainSum / s.gainN : null)}</td>
                  <td className="tabular py-1.5 text-right font-mono">{fmtH(s.ia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {entries.length === 0 ? (
          <div className="px-6 py-14 text-center text-text-muted">
            <div className="mb-1.5 text-sm font-semibold text-text">Aucune saisie pour l&apos;instant</div>
            <p className="mx-auto max-w-md text-sm">
              Cliquez sur <strong>+ Nouvelle saisie</strong> ci-dessus pour logger votre premier
              ticket : URL ou réf. Jira, estimation, % documentation, % itérations, temps IA.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-surface-alt text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <th className="whitespace-nowrap px-3 py-2.5">Ticket</th>
                  <th className="px-3 py-2.5">Titre</th>
                  <th className="px-3 py-2.5">Dev</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5 text-right">Estim. (h)</th>
                  <th className="px-3 py-2.5 text-right">Réel (h)</th>
                  <th className="px-3 py-2.5 text-right">% Doc</th>
                  <th className="px-3 py-2.5 text-right">% Itér.</th>
                  <th className="px-3 py-2.5 text-right">Temps IA (h)</th>
                  <th className="px-3 py-2.5 text-right">Gain</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-4 text-text-faint">Aucune saisie ne correspond aux filtres.</td>
                  </tr>
                )}
                {sortedRows.map((e) => {
                  const g = deriveGain(e);
                  const tone = g.gainPct === null ? "neutral" : g.gainPct >= 0 ? "good" : "bad";
                  return (
                    <tr key={e.id} className="border-t border-border hover:bg-surface-alt">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12.5px] font-semibold">{e.ticket_ref}</td>
                      <td
                        className={`max-w-[240px] truncate px-3 py-2 ${e.ticket_title ? "" : "text-text-faint"}`}
                        title={e.ticket_title || undefined}
                      >
                        {e.ticket_title || "—"}
                      </td>
                      <td className="px-3 py-2">{e.developer_name}</td>
                      <td className="tabular px-3 py-2 font-mono">{e.entry_date}</td>
                      <td className="tabular px-3 py-2 text-right font-mono">{fmtH(e.estimation_h)}</td>
                      <td className="tabular px-3 py-2 text-right font-mono">{fmtH(e.temps_reel_h)}</td>
                      <td className="tabular px-3 py-2 text-right font-mono">{fmtPct(e.pct_documentation)}</td>
                      <td className="tabular px-3 py-2 text-right font-mono">{fmtPct(e.pct_iterations)}</td>
                      <td className="tabular px-3 py-2 text-right font-mono">{fmtH(e.temps_ia_h)}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`pill pill-${tone}`}>
                          {g.gainPct === null ? "–" : (g.gainPct >= 0 ? "+" : "") + fmtPct(g.gainPct)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => openEditForm(e)}
                          title="Modifier"
                          className="rounded px-1.5 py-1 text-text-faint transition hover:bg-surface-alt hover:text-accent"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          title="Supprimer"
                          className="rounded px-1.5 py-1 text-text-faint transition hover:bg-surface-alt hover:text-bad"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="mt-5 text-center text-xs text-text-faint">
        Accès restreint aux membres autorisés du projet.
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-text px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}

      <style jsx>{`
        .select {
          width: 100%;
          border: 1px solid var(--border);
          background: var(--surface-alt);
          color: var(--text);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 13px;
        }
        .select:focus {
          outline: 2px solid var(--accent);
          outline-offset: -1px;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 8px;
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 600;
        }
        .pill-good {
          background: var(--good-tint);
          color: var(--good);
        }
        .pill-bad {
          background: var(--bad-tint);
          color: var(--bad);
        }
        .pill-neutral {
          background: var(--surface-alt);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-[130px] ${className}`}>
      <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">{label}</label>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "neutral"
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`tabular font-mono text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-text-faint">{sub}</div>
    </div>
  );
}
