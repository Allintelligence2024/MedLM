# Phase 20.4 — Partenariats facultés de médecine

> Statut : **terminée**. Socle complet du programme partenariat :
> table + invariants SQL, machine à états pure et testée, API gardée,
> allow-list unique des facultés recoupée avec le contenu, page CMS.

## Livré

```
backend/src/db/migrations/0016_partnerships.sql
   (CHECK statuts, commission 0..50, UNIQUE partiel : 1 actif/faculté)
backend/src/db/schema/partnerships.ts   (drizzle, exporté via index.ts)

backend/src/partnerships/
  faculties.ts            (allow-list SOURCE UNIQUE : 10 facultés DZ)
  partnership-status.ts   (machine pure : draft→active⇄suspended,
                           puits terminated ; activation signée +
                           commission bornée)
  partnerships.dto.ts     (Zod : faculty ∈ allow-list, commission ≤ 50)
  partnerships.service.ts (list/create/transition + traduction propre
                           de l'erreur d'unicité active)
  partnerships.controller.ts (GET author+, POST/PATCH editor+)
  partnerships.module.ts  (monté dans AppModule)

backend/test/unit/partnerships.test.ts  (24 cas : transitions,
  puits, signature, bornes, allow-list, DTO)

tools/scripts/check_partnerships.py
   (facultés citées dans les 697 cartes ∈ allow-list, invariants
    de la migration, machine à états, gardes — bloquant)

cms/src/app/admin/partnerships/page.tsx (liste, filtres, transitions
   limitées aux états valides, badges de statut)
cms/src/app/layout.tsx                  (+ nav « Partenariats »)
```

## Décisions structurantes

### Invariants au plus bas niveau possible

La règle « un seul partenariat ACTIF par faculté » vit dans la base
(index partiel UNIQUE), pas seulement dans le code : aucune écriture
concurrente ne peut créer un doublon de redevance. La commission est
bornée 0–50 % par CHECK SQL *et* Zod *et* fonction pure.

### Machine à états sans ressurrection

`terminated` est un puits : un accord terminé ne revient pas — nouvelle
négociation = nouvelle ligne, l'audit reste propre. Activation exige
`signed_at` (draft uniquement ; la reprise après suspension n'exige
pas de re-signature). Le CMS ne propose que les transitions valides,
mais la vérité reste côté serveur.

### Une seule liste de facultés

`faculties.ts` est la source unique ; `check_partnerships.py` recoupe
le contenu embarqué (697 cartes) avec cette liste à chaque push — une
coquille de ville dans un `source_meta.faculty` casse le pipeline.

## Vérification

```bash
python3 tools/scripts/check_partnerships.py   # ✓
python3 tools/scripts/security_audit.py       # ✓ gardes+zod
bash tools/scripts/phase13_checks.sh          # ✓
cd backend && npm run test -- partnerships.test  # vitest (CI)
```

## Hors périmètre (reporté)

* CMS : formulaire complet de création (endpoint prêt, page actuelle =
  gestion des états + message de branchement).
* Affectation effective des redevances au cycle de facturation Chargily
  (rapprochement mensuel — comptabilité, pas code applicatif).
* Espace faculté dédié (revue des cartes co-produites par
  l'enseignant partenaire) — itération CMS suivante.
