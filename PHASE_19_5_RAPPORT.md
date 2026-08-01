# Phase 19.5 — UI mobile des endpoints IA + signaux auteur CMS

> Statut : **terminée**. Les quatre fonctionnalités IA de la Phase 18
> sont désormais consommables depuis l'app mobile (Flutter) et les
> signaux de difficulté depuis le CMS éditorial.

## Livré

### Mobile (Flutter)

```
mobile/lib/data/network/api_client.dart
  + fetchAiHint(cardId, lang)          → GET  /v1/ai/hints/:cardId
  + voiceToCard(deckId, lang, …)       → POST /v1/ai/voice-to-card
  + tutorAsk(question, lang, history)  → POST /v1/ai/tutor/ask
  + fetchAdaptiveProfile()             → GET  /v1/ai/adaptive/profile

mobile/lib/data/repositories/ai/
  ai_models.dart      (AiHint, VoiceDraft, TutorAnswer, AdaptiveProfile
                       + énumérations miroir des DTOs backend)
  ai_repository.dart  (cache de hints par carte+langue, hintOrNull
                       offline-first, historique tuteur plafonné à 10)

mobile/lib/ui/ai/
  ai_speech_ports.dart       (ports STT/TTS abstraits + impl « indisponible »
                              — provider-agnostic, injectable, testable)
  hint_banner.dart           (bannière d'indice pendant l'étude)
  voice_dictation_sheet.dart (dictée → brouillon de carte)
  tutor_chat_screen.dart     (chat tuteur STT/TTS)

mobile/lib/core/container/app_container.dart  (+ aiRepository)

mobile/test/ai/
  ai_models_test.dart      (12 cas de parsing, payloads = DTOs backend)
  ai_repository_test.dart  (cache, offline, plafond historique, validation)
  ai_widgets_test.dart     (hint servi / caché offline, dictée → brouillon,
                            disclaimer servi affiché + lu par le TTS, urgence)
```

### CMS (Next.js)

```
cms/src/lib/signals.ts                 (types miroir de la réponse Drizzle,
                                        camelCase)
cms/src/app/admin/signals/page.tsx     (file open/resolved/ignored,
                                        bouton « Lancer un balayage »,
                                        lien « Relire la carte »)
cms/src/app/layout.tsx                 (+ entrées nav Signalements/Signaux IA)
```

## Choix structurants

### Offline-first (l'étude ne dépend jamais de l'IA)

`AiRepository.hintOrNull` encapsule chaque fetch de hint : offline,
429, 5xx → `null` → la `HintBanner` retourne `SizedBox.shrink()`. Le
hint est une aide, pas un prérequis ; la session d'étude n'est jamais
interrompue. Testé (`ai_widgets_test.dart`, cas « erreur réseau »).

### Ports STT/TTS (provider-agnostic, vie privée)

L'UI parle à `SpeechToTextPort` / `TextToSpeechPort`, jamais à un
plugin natif. Le chemin préféré envoie le **texte transcrit** au
backend (`audio_transcript`), jamais l'audio (v2 §10). Les impls
réelles (`speech_to_text` / `flutter_tts`) seront branchées au
`main()` ; ici on livre les impls « indisponible » (fallback saisie
manuelle) et des fakes scriptés pour les tests widget.

### Conformité tuteur — source unique pour le texte légal

* Aucun disclaimer médical n'est codé en dur côté mobile : le bandeau
  persistant, le pied de chaque bulle et le texte lu par le TTS
  utilisent **exclusivement** les champs `answer` / `disclaimer`
  SERVIS par `tutor.policy.ts` (cf. PHASE_19_3_RAPPORT.md « source
  unique »). Le test TTS vérifie que le texte lu contient le
  disclaimer.
* Les réponses `emergency: true` sont stylées en alerte (container
  d'erreur + badge « Urgence détectée ») ; les numéros (SAMU 115,
  Protection civile 14) sont déjà dans le texte servi.
* Avant la première réponse, seul un texte d'aide *neutre* (périmètre
  révision) est affiché — jamais une copie du disclaimer légal.

### Signaux CMS

La page consomme `GET /v1/ai/adaptive/signals?status=&limit=` (rôle
`author`) et `POST /v1/ai/adaptive/signals/scan` (rôle `editor`, corps
par défaut `{}` = seuils normatifs). Les types reflètent la réponse
réelle : alias Drizzle sérialisés en **camelCase** (`cardId`,
`affectedUsers`, `totalLapses`, `windowDays`, `createdAt`).

## Vérification

```bash
python3 tools/scripts/security_audit.py         # ✓ 0 violation
python3 tools/scripts/generate_lockfiles.py --check   # ✓
python3 tools/validate_content.py               # ✓ 722 vérifs
bash tools/scripts/phase13_checks.sh            # ✓
# Tests Dart (SDK requis, CI) :
cd mobile && dart test test/ai/                 # modèles + repo + widgets
```

Équilibrage syntaxique vérifié statiquement sur 13 fichiers Dart
(sandbox sans SDK — `dart test` reste à jouer en CI Phase 12).

## Hors périmètre (reporté)

* Branchement des plugins STT/TTS natifs au `main()` (nécessite un
  device : speech_to_text, flutter_tts) — ports prêts.
* Intégration de `HintBanner`/`VoiceDictationSheet` dans les écrans
  d'étude existants (écrans en cours de refonte, branche UI) — les
  widgets sont autonomes et documentés.
* Application locale des poids FSRS ajustés serveur → Phase 19.6
  (les modèles `AdaptiveProfile`/`FsrsAdjustment` sont déjà livrés).
