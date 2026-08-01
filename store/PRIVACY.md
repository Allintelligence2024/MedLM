# Politique de confidentialité — MedAnki DZ

_Dernière mise à jour : 2026-08-01. Cadre légal : loi n° 18-07
(protection des données personnelles, Algérie)._

## 1. Résumé (FR)

MedAnki DZ est **offline-first** : tes révisions, ton historique SRS et
tes statistiques vivent sur ton appareil. Le serveur ne reçoit que ce
qui est nécessaire au compte et à la synchronisation. Les fonctions IA
n'envoient **aucune donnée personnelle identifiable** à un service
externe par défaut : les hints sont calculés par règles (sans LLM), et
la dictée vocale privilégie la transcription sur l'appareil (texte,
jamais l'audio).

## 2. Données collectées

| Catégorie | Détail | Base légale | Conservation |
|---|---|---|---|
| Compte | email, pseudo, faculté, année d'étude | contrat | durée du compte |
| Progression | événements de révision (note, horodatage, carte) | contrat | durée du compte |
| Appareil | identifiant technique de device, plateforme | intérêt légitime (sécurité des clés) | 1 an après dernière activité |
| Facturation | identifiant de commande Chargily (PAS de carte bancaire chez nous) | contrat | 10 ans (obligations comptables) |
| Tuteur IA | question posée + réponse servie (audit de conformité, table append-only) | obligation de diligence | durée du compte |

## 3. Ce que nous ne collectons JAMAIS

- contenu médical personnel (symptômes, santé réelle) — le tuteur est
  un assistant de révision et détecte/renvoie les urgences vers SAMU
  115 / Protection civile 14 ;
- données biométriques, contacts, localisation précise ;
- audio de dictée (le texte transcrit suffit ; l'audio n'est envoyé
  que si l'appareil ne propose pas de transcription native, avec
  consentement explicite dans l'écran de dictée).

## 4. Intelligence artificielle

- **Hints** : calculés par règles sur le serveur à partir des
  événements de révision — aucun LLM externe.
- **Tuteur / génération** : provider LLM configurable côté serveur
  (`AI_LLM_PROVIDER=mock` par défaut = déterministe, aucun appel
  sortant). Si un provider externe est activé par l'exploitant, seules
  la question et l'historique court (≤ 10 messages) sont transmis ;
  aucun identifiant utilisateur.
- **Poids FSRS adaptatifs** : calculés sur agrégats de revues de la
  fenêtre glissante de 30 jours ; jamais exportés.

## 5. Partage

Aucune vente de données. Sous-traitants limités : hébergement (données
hébergées en Algérie — multi-régions Alger/Oran/Constantine, Phase 20)
et paiement (Chargily, régie algérienne).

## 6. Tes droits (loi 18-07)

Accès, rectification, effacement (suppression du compte depuis les
réglages ou par email), opposition. Délégué : privacy@medanki-dz.example.
Réponse sous 30 jours. Les tables d'audit append-only conservent les
traces de conformité anonymisées réduites au hachage.

## 7. Sécurité

Chiffrement TLS en transit, AES-GCM au repos pour les decks premium
(clé wrappée par device), rotation des refresh tokens, audit append-only.
Signalement de vulnérabilité : voir SECURITY.md (bug bounty).

---

## ملخص (AR)

ميد أنكي دي زد يعمل دون اتصال أولًا: مراجعاتك وإحصاءاتك تبقى على
جهازك. ميزات الذكاء الاصطناعي لا ترسل بياناتك الشخصية المعرِّفة إلى
خدمة خارجية افتراضيًا. الإملاء يفضّل النص المفرَّغ على الجهاز، لا
الصوت. لا نبيع أي بيانات، ولا نجمع محتوى طبيًا شخصيًا. حقوقك وفق
القانون 18-07: الوصول والتصحيح والمحو والاعتراض، عبر البريد الموضح
أعلاه خلال 30 يومًا.

## Summary (EN)

MedAnki DZ is offline-first: your reviews and statistics stay on your
device. AI features send no identifiable personal data to external
services by default. Dictation prefers on-device transcripts, never
audio. We never sell data and never collect personal medical content.
Your rights under law 18-07: access, rectification, erasure and
objection, via the email above, answered within 30 days.
