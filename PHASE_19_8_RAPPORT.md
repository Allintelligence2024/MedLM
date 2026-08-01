# Phase 19.8 — Pen test + app stores (fondations du lancement)

> Statut : **livrables terminées / opérationnel en cours**. Un pen test
> et une soumission store sont par nature des opérations hors-code
> (consoles Apple/Google, prestataire externe, device physique). Cette
> sous-phase livre **tout ce qui est automatisable et verrouillable**
> : fiches stores conformes, politique de confidentialité, runbook de
> soumission, et scan statique du périmètre du pen test intégré au
> pipeline.

## Livré

```
store/
  play/listing_{fr,ar,en}.txt      (fiche Play Console trilingue)
  apple/listing_{fr,ar,en}.txt     (fiche App Store trilingue)
  PRIVACY.md                       (politique loi 18-07 + résumés AR/EN)
  RELEASE_CHECKLIST.md             (runbook signature/captures/labels/go-no-go)

tools/scripts/check_store.py       (6 fiches, 80c, 0 promesse médicale,
                                    cohérence labels ↔ politique)
tools/scripts/pentest_prep.py      (6 mesures du périmètre vérifiées
                                    statiquement, --report pour le prestataire)
tools/scripts/phase13_checks.sh    (2 nouveaux checks bloquants intégrés)
```

## Décisions structurantes

### Périmètre pen test = code vérifié, pas promesse

Le prestataire externe (canal = SECURITY.md §1) recevra le rapport
`pentest_prep.py --report`. Mais surtout, chaque mesure du périmètre
est **contrôlée à chaque push** :

| Mesure | Verrou statique |
|---|---|
| Rotation refresh tokens | token haché sha256 + `revokedAt` à chaque rotation |
| Wrap-key decks | controller sous JwtGuard + DELETE de révocation par device |
| Quotas IA | 3 services avec constante quota + HTTP 429 |
| Audit append-only | triggers 0002 (review_logs) + 0015 (ai_tutor_prompts, empreintes hash) |
| Anti-injection LLM | system prompt serveur, rôle user confiné, historique ≤ 10, hors-sujet sans LLM |
| Cron rétention | preview + scan sous rôle admin |

Une régression sur l'une de ces lignes **casse `phase13_checks.sh`**
avant qu'un attaquant ne la découvre.

### Fiches store : les scanners avant les reviewers

`check_store.py` applique la même discipline qu'une revue Apple 1.4.1 /
Play Health Apps : aucun mot de promesse médicale (diagnostic,
guérison… — y compris en arabe), description courte ≤ 80 caractères
effectifs. Premier scan : 1 faux positif attrapé et corrigé
(« never a diagnosis » remplacé par une formulation sans mot-clé).

### Privacy labels = politique publique

Le tableau de `RELEASE_CHECKLIST.md` (Data safety / Nutrition labels)
est dérivé de `store/PRIVACY.md` et doit rester cohérent avec la FAQ
de la landing (`site/i18n.json`) — notamment : audio jamais collecté
(transcription sur l'appareil), santé/biométrie/localisation jamais
collectées. Le script recoupe ces engagements entre les fichiers.

## Vérification

```bash
python3 tools/scripts/pentest_prep.py          # ✓ 6 mesures présentes
python3 tools/scripts/pentest_prep.py --report /tmp/pentest_scope.json
python3 tools/scripts/check_store.py           # ✓ livrables conformes
bash tools/scripts/phase13_checks.sh           # ✓ (checks intégrés, bloquants)
```

## Reste hors-code (traçable dans RELEASE_CHECKLIST.md)

* Exécution du pen test par le prestataire + correctifs avec tests de
  non-régression adossés au rapport chiffré.
* Ouverture des consoles, signature (keystore hors-VM, Play App
  Signing), captures sur device, revues stores.
* Branchements device : plugins STT/TTS natifs au `main()`,
  notifications FCM/APNs, transaction Chargily réelle (remboursée).
