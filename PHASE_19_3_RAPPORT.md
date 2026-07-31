# Phase 19.3 — i18n FR/AR/EN complète pour les clés IA (backend)

> Statut : **terminée**. Le catalogue i18n backend couvre désormais
> toutes les features Phase 18 (hints, génération, voice, adaptive,
> rétention, tuteur) dans les 3 langues, avec tests de parité
> structurelle et de cohérence avec les textes normatifs.

## Livré

```
backend/src/i18n/i18n.ts
  + 15 nouvelles clés × 3 langues (fr/ar/en)
  + export DEFAULT_CATALOG (testabilité)

backend/test/unit/i18n_parity.test.ts
  + tests de parité (clés, placeholders, non-vide)
  + tests de résolution trilingue des clés IA
  + tests « source unique » (catalog == tutor.policy)

PHASE_19_3_RAPPORT.md
```

## Clés ajoutées

| Domaine | Clés |
|---|---|
| Hints | `ai.hint.fetched` |
| Génération LLM | `ai.generate.drafts_created` (plural ICU-lite), `ai.generate.quota_exceeded` |
| Voice-to-card | `ai.voice.draft_created` |
| Adaptive | `ai.adaptive.profile_fetched`, `ai.adaptive.scan_done` |
| Tuteur | `ai.tutor.disclaimer` ⚠️, `ai.tutor.out_of_scope`, `ai.tutor.quota_exceeded` |
| Rétention | `retention.{gentle,streak_broken,reengagement}.{title,body}` (6 clés, `{days}`) |

## Choix structurants

### Source unique pour les textes de conformité

`ai.tutor.disclaimer` du catalogue est **identique à l'unicode près**
à `MEDICAL_DISCLAIMER[lang]` de `tutor.policy.ts` — le test
`i18n_parity.test.ts` casse le build si les deux divergent. Les
disclaimers médicales n'existent donc qu'en un seul point de vérité
par canal (policy pour le texte servi, catalogue pour l'UI).

### Parité garantie par tests (CI)

* toute clé FR doit exister en AR/EN (et réciproquement) ;
* aucun message vide ;
* placeholders simples identiques entre langues (pas de `{days}`
  en FR et `{day}` en EN) ;
* pluralisation ICU-lite vérifiée sur `ai.generate.drafts_created`
  (« 1 brouillon créé » / « 4 brouillons créés »).

### RTL arabe

`isRtl('ar')` reste vrai ; les nouvelles clés arabes sont en arabe
standard (MSA) — la darija reste hors scope (documenté Phase 18.3).
Les valeurs numériques `{days}`/`{count}` restent en chiffres
latins (convention du catalogue existant).

## Conformité v2 (§3.2)

| Exigence | État |
|---|---|
| FR principal, EN secondaire, AR pour l'Algérie | ✅ 31 clés × 3 |
| Fallback FR si clé manquante | ✅ conservé |
| RTL signalé | ✅ `isRtl('ar')` |
| Cohérence texte servi / texte UI | ✅ test source-unique |

## Vérification

```bash
# Parité structurelle (statique, sandbox) :
python3 - <<'EOF'
import re
src = open('backend/src/i18n/i18n.ts', encoding='utf-8').read()
langs = {}
for lang in ('fr', 'ar', 'en'):
    m = re.search(rf"^  {lang}: \{{(.*?)^  \}},?$", src, re.S | re.M)
    langs[lang] = re.findall(r"^    '([\w.]+)':", m.group(1), re.M)
assert langs['fr'] == langs['ar'] == langs['en']
print('OK')
EOF

# Tests unitaires (CI) :
cd backend && npm run test -- i18n_parity.test.ts
```

## Hors périmètre (reporté)

* Consolidation : faire consommer le catalogue par
  `retention.messages.ts` (aujourd'hui deux sources par design,
  documentées) — refactor sans enjeu, Phase 20.
* RTL *rendu* côté mobile Flutter (Directionality, layouts inversés)
  — chantier mobile.
* Traductions du contenu médical lui-même (cartes) en AR — travail
  éditorial séparé (Phase 19 restante / Phase 20).
