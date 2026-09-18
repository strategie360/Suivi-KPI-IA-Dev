# Suivi KPI IA Dev

Suivi objectif du temps de développement avec/sans IA sur l'ensemble des tickets Jira traités
par l'équipe : estimation initiale, % documentation, % itérations, temps gagné/passé grâce à
l'IA. Initiative référencée en interne sous **ADOBE-2075**.

Stack : Next.js (App Router) hébergé sur **Vercel**, données dans **Supabase** (Postgres +
Auth + Realtime).

## Architecture

- **Dashboard web** : `src/app/page.tsx` + `src/components/Dashboard.tsx` — lecture, saisie
  via un formulaire (**+ Nouvelle saisie**), export Excel, suppression d'une ligne erronée.
- **Auth** : lien magique (OTP par email) + code de secours, restreint à une liste blanche
  d'emails stockée dans Supabase (`public.allowed_emails`). Voir `src/app/login/`.
- **Écriture des données** : uniquement depuis le dashboard, par un utilisateur connecté et
  présent dans `allowed_emails` — les policies RLS d'`entries` n'autorisent l'insert/update
  qu'à ces utilisateurs (rôle `authenticated`). `developer_name` est renseigné automatiquement
  avec l'email de la session, sans champ à remplir.
- **Temps réel** : le dashboard s'abonne à `postgres_changes` sur `entries`, donc une saisie
  apparaît instantanément chez tous les viewers connectés.

## Mise en place

### 1. Base Supabase

Dans votre projet Supabase (SQL Editor > New query), exécutez [`supabase/schema.sql`](supabase/schema.sql)
(ré-exécutable sans risque si vous le relancez après une mise à jour). Il crée :
- la table `entries` (les saisies),
- la table `allowed_emails` (liste blanche — ajoutez-y les chefs de projet, le directeur de
  projet et les développeurs, voir l'exemple d'`insert` en commentaire dans le fichier),
- les policies RLS : lecture/écriture/suppression toutes réservées aux emails de
  `allowed_emails`,
- l'abonnement Realtime sur `entries`.

### 2. Variables d'environnement

```bash
cp .env.local.example .env.local
```

Remplissez avec les valeurs de **Project Settings > API** de votre projet Supabase :
`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la clé "publishable").

### 3. Installation et lancement local

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000 — vous serez redirigé vers `/login`. Connectez-vous avec un
email présent dans `allowed_emails`.

**Tester sans Supabase ni login** : mettez `NEXT_PUBLIC_MOCK=1` dans `.env.local` (redémarrez
`npm run dev`). Le login et Supabase sont entièrement contournés — quelques saisies d'exemple
en mémoire, un bandeau **Mode démo** dans l'en-tête, et toute action (ajout, modification,
suppression) reste locale au navigateur, perdue au rechargement. Pratique pour itérer sur
l'UI sans dépendre d'un projet Supabase configuré. Retirez la variable (ou mettez-la à `0`)
pour repasser en mode normal.

> Le service d'envoi d'email intégré de Supabase est très limité en débit (quelques emails/heure) —
> largement suffisant pour un seul test, mais vous tomberez vite sur une erreur `429 Too Many
> Requests` en itérant. Configurez un SMTP custom (voir plus bas) avant d'ouvrir l'accès à
> l'équipe.

### 4. Déploiement Vercel

Sur [vercel.com](https://vercel.com) : *Add New Project* → importez ce dépôt GitHub → dans
*Environment Variables*, ajoutez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Déployez.

Ajoutez aussi l'URL Vercel (`https://xxx.vercel.app`) dans Supabase : **Authentication > URL
Configuration > Redirect URLs**, sinon le lien magique redirigera vers `localhost`.

### 5. GitHub

```bash
git add .
git commit -m "Initial commit — suivi KPI IA dev"
git push -u origin main
```

## Saisir une entrée

Sur le dashboard, cliquez **+ Nouvelle saisie** et remplissez :

```
Ticket Jira (URL ou réf.)   https://jira.totalenergies.com/browse/PROJ-1234
Estimation (h)              10h
% Documentation             10%
% Itérations                30%
Temps IA (h)                1h
```

La référence et le projet sont extraits automatiquement de l'URL ou de la réf. brute. Le
temps réel est déduit (`estimation - temps IA`). Une saisie relancée le même jour pour le
même ticket met à jour la ligne existante plutôt que d'en créer une nouvelle (contrainte
unique `ticket_ref, entry_date, developer_name`).

## Modèle de données (table `entries`)

| Champ | Description |
|---|---|
| `ticket_ref` | Référence du ticket Jira (ex. `PROJ-1234`) |
| `ticket_title` | Titre du ticket (non demandé dans le formulaire, laissé vide) |
| `project` | Projet (déduit du préfixe de la référence) |
| `developer_name` | Email de l'utilisateur connecté qui a saisi la ligne |
| `entry_date` | Date de la saisie |
| `estimation_h` | Estimation initiale sans IA, en heures (charge TU) |
| `temps_reel_h` | Temps réel, en heures — déduit (`estimation_h - temps_ia_h`) |
| `pct_documentation` | % du temps consacré à la documentation |
| `pct_iterations` | % du temps consacré aux itérations/corrections |
| `temps_ia_h` | Temps passé/gagné grâce à l'IA, en heures (saisi directement) |
| `notes` | Note libre optionnelle (non utilisée par le formulaire actuel) |
| `source` | Toujours `web` |

Le **gain** (estimation − réel, en heures et en %) est calculé à l'affichage et à l'export —
jamais stocké, pour rester toujours cohérent avec les valeurs saisies.

## Configurer l'envoi d'email (SMTP custom, recommandé)

Le service d'email intégré de Supabase est limité à quelques envois/heure — suffisant pour
un test isolé, pas pour un usage en équipe. Avant d'ouvrir l'accès, branchez un SMTP externe.
[Resend](https://resend.com) a un plan gratuit (3 000 emails/mois) largement suffisant ici :

1. Sur resend.com : créez un compte, puis **Domains** → ajoutez votre domaine d'envoi et
   posez les enregistrements DNS (SPF/DKIM) qu'ils indiquent. Sans domaine vérifié, Resend
   n'autorise l'envoi qu'à votre propre adresse — pas aux autres membres de l'équipe.
2. **API Keys** → créez une clé avec l'accès "Sending".
3. Dans Supabase : **Authentication → Emails → SMTP Settings** → activez *Enable Custom
   SMTP* et renseignez :

   | Champ | Valeur |
   |---|---|
   | Sender email | ex. `noreply@votredomaine.com` (domaine vérifié à l'étape 1) |
   | Sender name | `Suivi KPI IA Dev` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | la clé API Resend de l'étape 2 |

4. Sauvegardez, puis testez le lien magique — la limite du service intégré ne s'applique plus.

## Le lien magique dit "expired" alors qu'il vient d'être reçu

Symptôme : en cliquant sur le lien reçu par email, redirection vers
`/login#error=access_denied&error_code=otp_expired`. C'est presque toujours dû aux
passerelles de sécurité des emails d'entreprise (Outlook Safe Links, antivirus mail, etc.) qui
**pré-cliquent** les liens pour les scanner avant que l'utilisateur ne clique lui-même — ce qui
consomme le lien à usage unique.

Le dashboard gère déjà ce cas : après avoir demandé un email, un champ apparaît pour saisir
directement le **code** reçu dans le même email (immunisé contre le pré-clic ; sa longueur
dépend du réglage Supabase **Authentication → Providers → Email → OTP Length**, 6 par défaut).
Pour que ce code apparaisse dans l'email, vérifiez que le template Supabase l'inclut :
**Authentication → Emails → Templates**, à la fois sur **Magic Link** et sur **Confirm
signup** (le premier login d'un email utilise ce second template), ajoutez `{{ .Token }}`
quelque part dans le corps (il n'y est pas par défaut, seul `{{ .ConfirmationURL }}` y est) :

```html
<p>Ou saisissez ce code dans l'application : {{ .Token }}</p>
```

## Après une connexion réussie, la page reste bloquée sur /login

Si `getUser()` (utilisé par le middleware et la page d'accueil) doit contacter l'API Supabase
depuis le serveur Next.js à chaque requête, et que ce processus ne peut pas atteindre
`supabase.co` (proxy d'entreprise non configuré pour Node, alors que le navigateur y arrive
directement), la vérification échoue silencieusement et vous renvoie en boucle vers `/login`
malgré un cookie de session valide. Le code utilise maintenant `getSession()` (décodage du
cookie, sans appel réseau) précisément pour éviter cette dépendance.

## Gérer les accès

Ajoutez ou retirez des emails dans `public.allowed_emails` (Supabase Table Editor, ou SQL) :

```sql
insert into public.allowed_emails (email, display_name, role)
values ('prenom.nom@totalenergies.com', 'Prénom Nom', 'chef_projet');
```

Un email retiré de la table perd l'accès immédiatement (RLS), même s'il reste connecté
(session expirée à la prochaine requête).

## Pistes d'évolution (non implémentées)

- Alimentation automatique depuis Jira (au lieu de la saisie manuelle via le formulaire).
- Alertes quand un ticket dépasse significativement son estimation initiale.
- Invitation en un clic depuis le dashboard (actuellement : gestion via SQL/Table Editor).
