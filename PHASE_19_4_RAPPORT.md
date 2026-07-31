# Phase 19.4 — Politique de sécurité & programme Bug Bounty

> Statut : **terminée (cadre)**. Le document `SECURITY.md` est en
> place : divulgation responsable, périmètre, SLA, safe harbor,
> primes indicatives DZD, rotation des secrets. Le pen test externe
> et l'ouverture publique du programme restent des actions
> **opérationnelles** (hors code) planifiées avant le lancement.

## Livré

```
SECURITY.md        (politique complète, 9 sections)
PHASE_19_4_RAPPORT.md
```

## Structure du document

| § | Contenu clé |
|---|---|
| 1 | Canal privé `security@medanki-dz.com` (jamais d'issue publique) |
| 2 | SLA : accusé 48 h, correctif critique 14 j, divulgation ≤ 90 j |
| 3 | Safe harbor (bonne foi, arrêt à la 1ère donnée tierce, lois 09-04 et 18-07 algériennes citées) |
| 4 | In scope (API, mobile, CMS, repo, manifests) vs out of scope (DoS, scans bruts, social engineering) |
| 5 | Barème indicatif : 20k → 100k DZD selon CVSSv4 + Hall of Fame systématique |
| 6 | Points durs existants (append-only, Zod, JWT RS256, policy tuteur…) pour éviter les rapports redondants |
| 7 | Table de rotation des secrets (consommé par Phase 19.2 CronJob) |
| 8 | Hall of Fame (prêt à remplir) |

## Choix structurants

### Bug bounty "léger" mais crédible

Adapter au stade pré-lancement : primes indicatives modestes mais
explicites, réactivité garantie par SLA, reconnaissance systématique.
Pas de promesses excessives — le barème s'alignera sur le premier
budget marketing/produit.

### Périmètre pensé pour les phases 17-18

L'in scope liste explicitement les **endpoints IA Phase 18** (quota
bypass, prompt injection du tuteur, exfiltration `ai_tutor_prompts`)
— typiquement la surface nouvelle la plus scrutée par les
chercheurs. La rotation `retention-cron-token` (19.2) est référencée
§7 → les deux sous-phases s'auto-documentent.

### Légalité algérienne

Citation des lois **09-04** (infractions TIC) et **18-07**
(protection des données personnelles) : le safe harbor protège le
chercheur tout en rappelant le cadre obligatoire — un programme
américain copié tel quel serait inopérant juridiquement.

## Vérification

```bash
test -f SECURITY.md && grep -q "security@medanki-dz.com" SECURITY.md \
  && grep -q "18-07" SECURITY.md && echo OK
```

## Reste opérationnel (débloqué par le code, hors repo)

1. Souscription officielle du pen test externe (devis/obtention
   de créneau) — condition d'App Store submission.
2. Création de l'alias `security@…` + clé PGP (infra mail Phase 10).
3. Publication du programme (landing page Phase 19 restante).
4. Budget des primes DZD (validation direction).
