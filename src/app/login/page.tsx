import LoginForm from "./LoginForm";

export default function LoginPage({
  searchParams
}: {
  searchParams: { next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-lg font-bold text-text">Suivi KPI IA Dev</h1>
          <p className="mt-1 text-sm text-text-muted">
            Accès réservé aux membres autorisés du projet.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <LoginForm next={searchParams.next ?? "/"} />
        </div>
      </div>
    </main>
  );
}
