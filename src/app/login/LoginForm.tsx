"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "checking" | "sent" | "not-allowed" | "error";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStatus("checking");
    const supabase = createClient();

    const { data: allowed, error: rpcError } = await supabase.rpc("is_allowed_email", {
      check_email: trimmed
    });

    if (rpcError) {
      setStatus("error");
      return;
    }
    if (!allowed) {
      setStatus("not-allowed");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      }
    });

    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm text-text">
        Lien de connexion envoyé à <span className="font-mono">{email}</span>. Ouvrez-le
        depuis votre boîte mail pour accéder au dashboard.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label htmlFor="email" className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
          Email professionnel
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@totalenergies.com"
          className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-accent"
        />
      </div>

      <button
        type="submit"
        disabled={status === "checking"}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {status === "checking" ? "Vérification…" : "Recevoir le lien de connexion"}
      </button>

      {status === "not-allowed" && (
        <p className="text-sm text-bad">
          Cet email n&apos;est pas autorisé. Demandez à un chef de projet de vous ajouter à la
          liste des accès.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-bad">Une erreur est survenue. Réessayez dans un instant.</p>
      )}
    </form>
  );
}
