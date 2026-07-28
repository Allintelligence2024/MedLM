# Audit — Le repo `Allintelligence2024/MedLM` correspond-il à l'architecture MedAnki DZ v2 ?

**Réponse courte : NON.** Le repo est un **prototype Android natif mono-couche généré par Google AI Studio**, pas l'architecture v2 décrite (Flutter + NestJS + PostgreSQL + pipeline éditorial + entitlement serveur). Il partage le **nom du produit, le vocabulaire et l'intention UX**, mais quasiment aucune des décisions techniques structurantes.

Taux de couverture estimé : **~15 %** de l'architecture cible (uniquement la partie « app locale de révision », et de façon partielle).

---

## 1. Ce que contient réellement le repo

```
MedLM/  (Gradle, single-module Android app — 4 170 lignes de Kotlin)
├── app/src/main/java/com/example/
│   ├── MainActivity.kt              Nav Compose : dashboard, study, qcm, exam, glossary, stats, addCard
│   ├── data/
│   │   ├── local/  AppDatabase.kt (Room v1), MedDao.kt, DatabaseInitializer.kt (seed en dur)
│   │   ├── model/  CardItem, Deck, SrsCardState, ReviewLog, UserStats, ExamAttempt
│   │   └── repository/ MedRepository.kt  (une seule classe, tout dedans)
│   ├── srs/FsrsEngine.kt            ~96 lignes, heuristique maison "FSRS-like"
│   ├── ui/  screens (7), components (3), theme, viewmodel/MedViewModel.kt
│   └── util/TtsHelper.kt            TTS Android pour la prononciation EN
└── (aucun backend, aucun CMS, aucune infra, aucun CI)
```

Stack effective : **Kotlin + Jetpack Compose + Room + ViewModel/StateFlow + Navigation Compose**, dépendances Firebase (BOM, firebase-ai, App Check) et Retrofit/OkHttp/Moshi **déclarées mais non utilisées** dans le code. Aucun appel réseau n'existe dans les sources.

Contenu embarqué : **5 decks et 7 cartes** de seed en dur (`DatabaseInitializer`), dont 2 QCM.

---

## 2. Comparaison point par point avec l'architecture v2

| Domaine v2 | Cible v2 | Réalité du repo | Verdict |
|---|---|---|---|
| Client mobile | Flutter 3.x (Android puis iOS) | **Android natif Kotlin/Compose** | ❌ Divergence majeure |
| State management | Riverpod 2.x | ViewModel + StateFlow (1 seul `MedViewModel` global) | ❌ (équivalent fonctionnel, pas l'archi) |
| Architecture interne | Clean Arch : presentation / domain / use cases / repository interfaces | 3 couches informelles, **aucune couche domain, aucun use case, aucune interface de repo** | ❌ |
| DB locale | Drift / SQLite | **Room / SQLite** | 🟡 Équivalent conceptuel, techno différente |
| Moteur SRS | FSRS-5 (port Dart testé, `ts-fsrs` côté serveur), fold déterministe | `FsrsEngine` **heuristique maison** : pas les 17+ paramètres w[], pas de formule stabilité/difficulté FSRS, pas de courbe d'oubli utilisée pour le scheduling, pas de `fold()` rejouable, **0 test** | ❌ Le cœur scientifique n'est pas là |
| Journal de revues | `review_logs` append-only, uuid v7, `device_id`, `exam_mode`, `card_type` | Table `review_logs` présente mais insérée en `OnConflictStrategy.REPLACE`, uuid v4, **pas de device_id / user_id / exam_mode / synced** | 🟡 Squelette seulement |
| Backend | Monolithe NestJS modulaire (Auth, Content, SRS, Exams, Billing, Notif, Analytics, Admin) | **Inexistant** | ❌ 0 % |
| Base serveur | PostgreSQL 16 + JSONB + read replica | **Inexistante** | ❌ |
| Sync engine | outbox_events, cursor, push/pull, merge CRDT/fold déterministe | **Inexistant** — aucune table outbox, aucun cursor, aucune notion de sync | ❌ 0 % |
| Auth | Google OAuth2, magic link, OTP, JWT 15 min + refresh | **Aucune authentification**, pas de notion d'utilisateur (`UserStats` a un PK fixe `id = 1`) | ❌ |
| Entitlement / premium | JWT RS256 signé, vérif offline, grace 14 j, decks chiffrés AES-256-GCM | Un seul champ `Deck.isPremium: Boolean = false`, **jamais lu nulle part** dans le code | ❌ ~2 % |
| Paiements | Abstraction `IPaymentProvider`, Chargily Pay (CIB/BaridiMob), promo codes, IAP | **Inexistant** | ❌ 0 % |
| Pipeline éditorial | CMS Next.js, workflow draft→review→approved→published, RBAC 5 rôles, audit log | **Inexistant**. Le contenu est du code Kotlin en dur ; `AddCardScreen` laisse l'utilisateur créer des cartes locales sans aucun contrôle qualité | ❌ 0 % |
| Modèle de contenu | JSONB versionné (`version`, `status`, `source_meta`, `tags`, `media[]`) | Colonnes plates FR/EN, QCM en `optionsJson` string, **pas de `version`, pas de `status`, pas de `source_meta`** | ❌ |
| Stratégie légale contenu | `source_type` obligatoire, takedown flag, feature flag par deck | Un simple `facultyTag: String = "Faculté d'Alger"` — **aucune traçabilité de source** | ❌ Risque juridique non couvert |
| Gamification | XP sur habitude, pas sur Easy, plafond 100 cartes/jour, streak freeze, badges, leaderboard opt-in | `+15 XP par carte quelle que soit la note` (donc **XP identique sur Easy — exactement l'anti-pattern que la v2 interdit**), pas de plafond, streak et freeze stockés mais **jamais mis à jour** (valeurs de démo : xp=120, streak=5) | ❌ Contraire à la v2 |
| Examens | Timer serveur, génération par template, questions ratées → SRS | `MockExamScreen` local, timer client, `ExamAttempt` stocké localement, pas de réinjection SRS | 🟡 Maquette |
| Notifications | FCM, due_reminder, streak_danger, fenêtre 22h–8h | **Inexistant** | ❌ |
| Analytics / observabilité | Sentry, KPIs SRS, dashboard interne | **Inexistant** | ❌ |
| Infra / CI-CD | Hetzner, Docker, Nginx, R2, GitHub Actions, tests FSRS obligatoires | Aucun Dockerfile, aucun workflow GitHub Actions ; tests = `ExampleUnitTest`, `ExampleRobolectricTest`, un screenshot test « Greeting » | ❌ |
| Offline-first | ✅ règle non négociable | ✅ **Respecté par accident** : tout est local, il n'y a pas de réseau du tout | ✅ (mais « offline-only », pas « offline-first ») |
| Bilinguisme FR/EN | FR principal + EN | EN principal + FR (`langPref = "EN"`, `metadata.json` : "English primary with French support") | 🟡 Inversé |
| Ciblage produit | Étudiants 1re/2e année DZ, FSRS, QCM DZ | Idem — modules Anatomie/Biochimie/Physiologie/Histologie, tags faculté Alger/Oran | ✅ |

---

## 3. Ce qui est aligné (le peu qui l'est)

- **Le domaine et l'UX** : dashboard « cartes dues », session d'étude avec flip card + 4 boutons Again/Hard/Good/Easy, banque QCM avec explication par option, mock exam, stats/heatmap, glossaire, toggle FR/EN, TTS de prononciation, tags faculté. La v2 est reconnaissable dans les écrans.
- **Le vocabulaire du modèle SRS** : `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, états `NEW/LEARNING/REVIEW/RELEARNING`, ratings 1–4, et une fonction `getRetrievability()` qui utilise bien `exp(-days / (9 * stability))`. Les *noms* sont FSRS ; la *logique de scheduling* ne l'est pas.
- **Le principe local-first** : la lecture des cartes dues passe uniquement par Room, aucun appel bloquant.
- **Séparation minimale** UI / ViewModel / Repository / DAO — une base saine pour refactorer.

---

## 4. Les 6 écarts qui coûtent le plus cher

1. **Pas de FSRS réel.** `FsrsEngine` applique des multiplicateurs arbitraires (`stability * 1.3f`, `* 0.4f`…). Aucun paramètre `w[0..18]`, aucune formule `S'(D,S,R,G)`, aucun `requestRetention`. C'est du SM-2 déguisé. La promesse « -25 % de reviews » n'est pas tenue et les données produites ne seront pas migrables vers un vrai FSRS sans réinitialiser les intervalles.
2. **Pas de notion d'utilisateur ni de sync.** `UserStats(id = 1)` = mono-utilisateur, mono-device. Toute la partie « la plus critique et la plus difficile à corriger en production » (spec sync `ReviewEvent`, outbox, cursor, merge) est absente à 100 %.
3. **Pas de backend du tout.** Auth, Content, Billing, Entitlement, Notifications, Analytics : zéro ligne. Retrofit est dans les dépendances mais aucun `ApiService` n'existe.
4. **Le contenu n'est pas un actif, c'est du code.** 7 cartes en dur dans un `object` Kotlin, sans version, sans statut, sans source. Le « moat contenu » et la conformité légale (`source_type`) ne sont pas amorcés.
5. **La gamification va contre le SRS.** +15 XP quel que soit le rating, y compris Easy — précisément l'anti-pattern listé dans le tableau des décisions v2. Streak et freeze sont des valeurs de démo figées.
6. **Aucune garantie de non-régression.** Zéro test sur le moteur SRS alors que la v2 exige « 50 scénarios déterministes » en CI, et `fallbackToDestructiveMigration()` sur Room = perte de données à chaque changement de schéma.

---

## 5. Deux chemins possibles

**Option A — Considérer le repo comme un prototype UX jetable** (conforme à la v2)
Il a validé les écrans et le parcours. On le garde comme référence Figma-vivante, on démarre la Phase 0/1 v2 : spec sync, schéma PostgreSQL, NestJS, puis app Flutter. Coût : le Kotlin est perdu (~4 000 lignes), mais l'architecture cible est respectée.

**Option B — Faire converger le repo Android vers l'esprit v2** (dévier de la v2 sur le client)
On assume Kotlin/Compose au lieu de Flutter (choix défendable : Android-only en v1, perf native, pas de couche Dart) et on rattrape l'essentiel dans l'ordre :

1. Remplacer `FsrsEngine` par une vraie implémentation FSRS-5 (port des paramètres w + tests déterministes) — **avant** que des utilisateurs génèrent de l'historique.
2. Rendre `review_logs` réellement append-only et ajouter `userId`, `deviceId`, `examMode`, `cardType`, `synced` ; recalculer l'état via un `fold(events)` pur et testable.
3. Ajouter les tables `outbox_events`, `deck_meta` (version), `entitlement`, `sync_cursor` + migrations Room réelles (supprimer `fallbackToDestructiveMigration`).
4. Externaliser le contenu : JSON versionné bundlé + endpoint delta, avec `version`, `status`, `source_meta`.
5. Backend NestJS minimal : Auth + Content delta + Sync push/pull + Entitlement JWT signé.
6. Corriger la gamification (XP sur session complétée, pas sur rating ; plafond 100 cartes/jour).
7. Ajouter GitHub Actions : lint + tests unitaires FSRS obligatoires.

Dans les deux cas, **l'étape 1 de la roadmap v2 reste la même : figer la spec `ReviewEvent` et le merge SRS avant tout le reste.**

---

## 6. Conclusion

Le repo est une **démo Android autonome, offline-only, mono-utilisateur, sans backend, avec un SRS approximatif et 7 cartes en dur**. Il illustre bien la *vision produit* MedAnki DZ (section 1 et section 14 du document) mais n'implémente **aucune** des décisions d'architecture des sections 2, 4, 5, 6, 7, 8, 10 et 11.

> Ce n'est pas « l'application construite selon l'architecture v2 ».
> C'est le **prototype d'écrans** qui justifie de construire l'architecture v2.
