# Suivi KPI IA Dev

Suivi objectif du temps de développement avec/sans IA sur l'ensemble des tickets Jira traités
par l'équipe : estimation initiale, % documentation, % itérations, temps gagné/passé grâce à
l'IA. Initiative référencée en interne sous **ADOBE-2075**.

Stack : Next.js (App Router) hébergé sur **Vercel**, données dans **Supabase** (Postgres +
Auth + Realtime).

## Architecture

- **Dashboard web** (lecture + export Excel + suppression d'une ligne erronée uniquement —
  pas de saisie manuelle) : `src/app/page.tsx` + `src/components/Dashboard.tsx`.
- **Auth** : lien magique (OTP par email), restreint à une liste blanche d'emails stockée
  dans Supabase (`public.allowed_emails`). Voir `src/app/login/`.
- **Écriture des données** : uniquement via le skill Claude Code `/log-kpi-ia`
  (`.claude/skills/log-kpi-ia/SKILL.md`), qui upsert directement dans Supabase avec la clé
  **publishable** (anciennement "anon"), embarquée dans le fichier du skill lui-même — voir
  *Distribuer le skill* ci-dessous. Le site web n'a aucun endpoint d'écriture pour les
  saisies : seules les policies RLS d'`entries` autorisent l'insert/update avec cette clé.
- **Temps réel** : le dashboard s'abonne à `postgres_changes` sur `entries`, donc une saisie
  faite par le skill apparaît instantanément chez tous les viewers connectés.

## Mise en place

### 1. Base Supabase

Dans votre projet Supabase (SQL Editor > New query), exécutez [`supabase/schema.sql`](supabase/schema.sql)
(ré-exécutable sans risque si vous le relancez après une mise à jour). Il crée :
- la table `entries` (les saisies),
- la table `allowed_emails` (liste blanche — ajoutez-y les chefs de projet, le directeur de
  projet et les développeurs, voir l'exemple d'`insert` en commentaire dans le fichier),
- les policies RLS : lecture/suppression réservées aux emails de `allowed_emails` (site web,
  utilisateur connecté), insert/update ouvertes à la clé publishable (skill),
- l'abonnement Realtime sur `entries`.

### 2. Variables d'environnement (site web)

```bash
cp .env.local.example .env.local
```

Remplissez avec les valeurs de **Project Settings > API** de votre projet Supabase :
`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la clé "publishable").

### 3. Distribuer le skill à l'équipe

Ouvrez [`.claude/skills/log-kpi-ia/SKILL.md`](.claude/skills/log-kpi-ia/SKILL.md) et
remplacez les deux placeholders `SUPABASE_URL` / `SUPABASE_ANON_KEY` par les mêmes valeurs
qu'à l'étape 2 (URL du projet + clé publishable). Une fois committé et poussé sur GitHub
(voir étape 5), n'importe quel développeur qui clone le repo a `/log-kpi-ia` disponible
immédiatement dans Claude Code — rien à configurer de son côté.

### 4. Installation et lancement local du site

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000 — vous serez redirigé vers `/login`. Connectez-vous avec un
email présent dans `allowed_emails`.

### 5. Déploiement Vercel

Sur [vercel.com](https://vercel.com) : *Add New Project* → importez ce dépôt GitHub → dans
*Environment Variables*, ajoutez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Déployez.

Ajoutez aussi l'URL Vercel (`https://xxx.vercel.app`) dans Supabase : **Authentication > URL
Configuration > Redirect URLs**, sinon le lien magique redirigera vers `localhost`.

### 6. GitHub

```bash
git add .
git commit -m "Initial commit — suivi KPI IA dev"
git push -u origin main
```

## Utiliser le skill de saisie

Dans Claude Code, à la racine de ce projet :

```
/log-kpi-ia https://jira.totalenergies.com/browse/ADOBE-2075 10h 10% 30% 1h
```

Ordre des arguments : URL ou réf. du ticket Jira, estimation initiale (`h`), % documentation
(`%`), % itérations (`%`), temps gagné/passé grâce à l'IA (`h`) — et optionnellement un titre
libre en dernier. Au premier lancement, le skill demande le nom du développeur (mémorisé dans
`config/kpi-config.json`), puis n'importe plus rien : une commande, une ligne dans le
dashboard, mise à jour en direct pour tous les viewers connectés.

## Modèle de données (table `entries`)

| Champ | Description |
|---|---|
| `ticket_ref` | Référence du ticket Jira (ex. `PROJ-1234`) |
| `ticket_title` | Titre du ticket (optionnel) |
| `project` | Projet (déduit du préfixe de la référence si non précisé) |
| `developer_name` | Nom du développeur |
| `entry_date` | Date de la saisie |
| `estimation_h` | Estimation initiale sans IA, en heures (charge TU) |
| `temps_reel_h` | Temps réel, en heures — déduit par le skill (`estimation_h - temps_ia_h`) |
| `pct_documentation` | % du temps consacré à la documentation |
| `pct_iterations` | % du temps consacré aux itérations/corrections |
| `temps_ia_h` | Temps passé/gagné grâce à l'IA, en heures (saisi directement) |
| `notes` | Note libre optionnelle |
| `source` | Toujours `skill` |

Contrainte unique `(ticket_ref, entry_date, developer_name)` : relancer le skill le même jour
sur le même ticket met à jour la ligne existante au lieu d'en créer une nouvelle.

Le **gain** (estimation − réel, en heures et en %) est calculé à l'affichage et à l'export —
jamais stocké, pour rester toujours cohérent avec les valeurs saisies.

## Gérer les accès

Ajoutez ou retirez des emails dans `public.allowed_emails` (Supabase Table Editor, ou SQL) :

```sql
insert into public.allowed_emails (email, display_name, role)
values ('prenom.nom@totalenergies.com', 'Prénom Nom', 'chef_projet');
```

Un email retiré de la table perd l'accès en lecture immédiatement (RLS), même s'il reste
connecté (session expirée à la prochaine requête).

## Note sur la clé publishable dans le skill

`SKILL.md` embarque volontairement la clé Supabase **publishable** (pas `service_role`) pour
que le skill soit utilisable par toute l'équipe sans configuration individuelle. C'est le
même modèle que la clé déjà présente dans le bundle JS public du site : sa portée n'est pas
le secret de la clé mais les policies RLS de `supabase/schema.sql`, qui n'autorisent avec
cette clé que l'insert/update sur `entries` — rien d'autre (pas de lecture, pas de
suppression, pas d'accès à `allowed_emails`). Ne mettez jamais la clé `service_role` dans ce
fichier : elle donne un accès total à la base et il ne doit jamais être partagée ni committée.

## Pistes d'évolution (non implémentées)

- Alimentation automatique depuis Jira (au lieu du skill déclenché manuellement par le dev).
- Alertes quand un ticket dépasse significativement son estimation initiale.
- Invitation en un clic depuis le dashboard (actuellement : gestion via SQL/Table Editor).
