---
name: log-kpi-ia
description: Enregistre une saisie de suivi KPI IA (estimation, % documentation, % itérations, temps IA) pour un ticket Jira, et la pousse automatiquement dans Supabase pour le dashboard centralisé. Déclenché par la commande /log-kpi-ia avec le ticket et les chiffres en arguments, ou par une demande de "logger le KPI IA", "saisir le temps IA" ou "suivre ce ticket pour le KPI IA".
---

# Saisie KPI IA

Écrit une ligne de suivi directement dans Supabase, en une seule commande, sans aller-retour :

```
/log-kpi-ia <url ou réf. ticket Jira> <estimation>h <%doc>% <%itérations>% <temps IA>h [titre optionnel]
```

Exemple :
```
/log-kpi-ia https://jira.totalenergies.com/browse/ADOBE-2075 10h 10% 30% 1h
```

Ceci écrit : ticket `ADOBE-2075`, projet `ADOBE`, estimation 10h, 10% du temps en
documentation, 30% en itérations/corrections, 1h gagnée/passée grâce à l'IA.

## Connexion Supabase

Complète ces deux constantes avec les valeurs du projet Supabase (Project Settings > API >
Project URL, et la clé "anon" / "public" sous Project API keys), puis utilise-les dans la
requête `curl` de l'étape 3 :

```
SUPABASE_URL = "https://REMPLACER.supabase.co"
SUPABASE_ANON_KEY = "REMPLACER_PAR_LA_CLE_ANON_PUBLIQUE"
```

Pourquoi la clé "anon" et pas la clé "service_role" : la clé anon est conçue par Supabase pour
être publique (elle circule déjà dans le bundle JS du site web) — sa portée est strictement
limitée par les policies RLS de `supabase/schema.sql`, qui n'autorisent avec cette clé que
l'insertion/mise à jour de lignes dans `entries`, rien d'autre. C'est ce qui permet de
partager ce fichier tel quel avec toute l'équipe sans configuration côté développeur. La clé
`service_role` donne au contraire un accès total à la base et ne doit jamais figurer ici.

## Étape 1 — Parser la commande

Découpe les arguments dans l'ordre :

1. **Ticket** : URL Jira (ex. `.../browse/ADOBE-2075`) ou référence brute (`ADOBE-2075`).
   Extrait `ticket_ref` avec le motif `[A-Z][A-Z0-9]*-[0-9]+` trouvé dans le token.
   `project` = préfixe avant le tiret (`ADOBE-2075` → `ADOBE`).
2. **Estimation** : nombre suivi de `h` (`10h` → `10`) → `estimation_h`.
3. **% documentation** : nombre suivi de `%` (`10%` → `10`) → `pct_documentation`.
4. **% itérations** : nombre suivi de `%` (`30%` → `30`) → `pct_iterations`.
5. **Temps IA** : nombre suivi de `h` (`1h` → `1`) → `temps_ia_h`.
6. **Titre** (optionnel) : tout ce qui suit ces 5 arguments, tel quel → `ticket_title`. Absent
   si rien n'est fourni (le dashboard affiche alors la réf. ticket à la place).

Si un des 5 premiers arguments manque ou ne parse pas, demande uniquement la valeur
manquante — jamais les 5 en bloc si 4 sont déjà valides. Si tout est fourni et valide, **ne
pose aucune question** : c'est le but de cette commande.

Calcule `temps_reel_h = max(0, estimation_h - temps_ia_h)` (le temps réel n'est pas demandé
explicitement ; on le déduit de l'estimation et du temps gagné/passé via IA).

## Étape 2 — Développeur

Cherche `config/kpi-config.json` à la racine du projet (le crée avec `{"developer_name": ""}`
s'il n'existe pas). Si `developer_name` est vide, demande le nom une seule fois puis
écris-le dans ce fichier — les commandes suivantes ne le redemanderont plus.

## Étape 3 — Écrire dans Supabase

Upsert via l'API REST (PostgREST) — la contrainte unique `(ticket_ref, entry_date,
developer_name)` fait qu'une commande relancée le même jour pour le même ticket **remplace**
l'ancienne saisie au lieu de la dupliquer :

```bash
curl -sS -X POST "$SUPABASE_URL/rest/v1/entries?on_conflict=ticket_ref,entry_date,developer_name" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '{
    "ticket_ref": "ADOBE-2075",
    "ticket_title": "",
    "project": "ADOBE",
    "developer_name": "...",
    "entry_date": "2026-09-18",
    "estimation_h": 10,
    "temps_reel_h": 9,
    "pct_documentation": 10,
    "pct_iterations": 30,
    "temps_ia_h": 1,
    "notes": "",
    "source": "skill"
  }'
```

`entry_date` = date du jour au format `YYYY-MM-DD`. Vérifie que la réponse HTTP est un succès
(2xx) et contient la ligne créée avant de confirmer ; en cas d'erreur, affiche le message
renvoyé par Supabase (une erreur `42501`/`permission denied` signifie que les policies RLS de
`supabase/schema.sql` n'ont pas encore été appliquées sur ce projet).

## Étape 4 — Confirmer

Une seule ligne de confirmation : ticket, gain (`temps_ia_h`, en heures et en % de
l'estimation), rien de plus. Le dashboard se met à jour en direct (Supabase Realtime),
aucune action supplémentaire n'est nécessaire.

## Correction d'une saisie

Relancer `/log-kpi-ia` le même jour sur le même ticket met à jour la ligne existante (upsert),
ça ne crée jamais de doublon.
