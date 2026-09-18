-- Suivi KPI IA Dev — schéma Supabase
-- À exécuter dans l'éditeur SQL du projet Supabase (SQL Editor > New query).
-- Ce script est ré-exécutable sans risque (idempotent) : vous pouvez le relancer
-- tel quel après une mise à jour pour appliquer les derniers changements.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Table des saisies (une ligne = un point de mesure pour un ticket Jira)
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text not null,
  ticket_title text not null default '',
  project text not null,
  developer_name text not null,
  entry_date date not null,
  estimation_h numeric not null check (estimation_h >= 0),
  temps_reel_h numeric not null check (temps_reel_h >= 0),
  pct_documentation numeric not null default 0 check (pct_documentation between 0 and 100),
  pct_iterations numeric not null default 0 check (pct_iterations between 0 and 100),
  temps_ia_h numeric not null default 0 check (temps_ia_h >= 0),
  notes text default '',
  source text not null default 'skill',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- une seule saisie par ticket / développeur / jour : le skill peut la
  -- corriger (upsert) sans créer de doublon en relançant le même jour.
  unique (ticket_ref, entry_date, developer_name)
);

-- si la table existait déjà avant ce champ par défaut, on le rattrape ici
alter table public.entries alter column ticket_title set default '';

create index if not exists entries_entry_date_idx on public.entries (entry_date desc);
create index if not exists entries_developer_idx on public.entries (developer_name);
create index if not exists entries_project_idx on public.entries (project);

-- ---------------------------------------------------------------------------
-- Liste blanche des emails autorisés à se connecter / consulter le dashboard
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_emails (
  email text primary key,
  display_name text,
  role text default 'member', -- 'member' | 'chef_projet' | 'directeur'
  added_at timestamptz not null default now()
);

-- Ajoutez vos utilisateurs ici, par exemple :
-- insert into public.allowed_emails (email, display_name, role) values
--   ('prenom.nom@totalenergies.com', 'Prénom Nom', 'chef_projet');

-- ---------------------------------------------------------------------------
-- Fonction publique (SECURITY DEFINER) : vérifie qu'un email est autorisé,
-- sans jamais exposer le contenu de la table allowed_emails au client.
-- ---------------------------------------------------------------------------
create or replace function public.is_allowed_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(check_email)
  );
$$;

revoke all on function public.is_allowed_email(text) from public;
grant execute on function public.is_allowed_email(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.entries enable row level security;
alter table public.allowed_emails enable row level security;

-- entries : lecture + suppression réservées aux emails de la liste blanche
-- (site web, session utilisateur authentifiée).
drop policy if exists "allowed users can read entries" on public.entries;
create policy "allowed users can read entries"
  on public.entries for select
  to authenticated
  using (exists (
    select 1 from public.allowed_emails a
    where a.email = lower(auth.jwt() ->> 'email')
  ));

drop policy if exists "allowed users can delete entries" on public.entries;
create policy "allowed users can delete entries"
  on public.entries for delete
  to authenticated
  using (exists (
    select 1 from public.allowed_emails a
    where a.email = lower(auth.jwt() ->> 'email')
  ));

-- entries : écriture (insert + upsert) ouverte à la clé "anon" — c'est ce que
-- le skill /log-kpi-ia utilise, embarquée directement dans SKILL.md pour que
-- chaque développeur puisse l'utiliser sans configuration. La clé "anon" est
-- conçue par Supabase pour être publique (elle circule déjà dans le bundle
-- JS du site) ; la portée de ce qu'elle permet est strictement définie par
-- ces policies RLS, pas par le secret de la clé — elle ne donne accès qu'à
-- écrire des saisies, rien d'autre (pas de lecture, pas de suppression, pas
-- d'accès à allowed_emails).
drop policy if exists "anon can insert entries" on public.entries;
create policy "anon can insert entries"
  on public.entries for insert
  to anon
  with check (true);

drop policy if exists "anon can update entries via upsert" on public.entries;
create policy "anon can update entries via upsert"
  on public.entries for update
  to anon
  using (true)
  with check (true);

-- allowed_emails : aucune policy pour anon/authenticated -> table illisible
-- depuis le client (seule is_allowed_email(), en SECURITY DEFINER, y accède).

-- ---------------------------------------------------------------------------
-- Realtime : pour que le dashboard se mette à jour en direct chez tous les
-- viewers quand une saisie arrive via le skill ou qu'une ligne est supprimée.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
end $$;
