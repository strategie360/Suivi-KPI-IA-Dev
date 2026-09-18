"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "checking" | "sent" | "verifying" | "not-allowed" | "error" | "bad-code";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleRequestLink(e: React.FormEvent) {
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

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;

    setStatus("verifying");
    const supabase = createClient();

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: "email"
    });

    if (error) {
      setStatus("bad-code");
      return;
    }
    window.location.href = next;
  }

  if (status === "sent" || status === "verifying" || status === "bad-code") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-surface-alt px-4 py-3 text-sm text-text">
          Email envoyé à <span className="font-mono">{email}</span>. Ouvrez le lien depuis
          votre boîte mail, <strong>ou</strong> saisissez le code à 6 chiffres reçu dans le
          même email ci-dessous.
        </div>

        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
          <div>
            <label htmlFor="code" className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
              Code reçu par email
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-text outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            disabled={status === "verifying"}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {status === "verifying" ? "Vérification…" : "Valider le code"}
          </button>
          {status === "bad-code" && (
            <p className="text-sm text-bad">Code invalide ou expiré. Redemandez un email ci-dessous.</p>
          )}
        </form>

        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="text-xs text-text-muted underline hover:text-accent"
        >
          Redemander un email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequestLink} className="flex flex-col gap-3">
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
