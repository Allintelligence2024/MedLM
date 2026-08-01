# Phase 19.7 — Landing page / marketing site

> Statut : **terminée**. Site statique trilingue (FR/AR/EN), sans build,
> sans tracker, prêt à être déployé tel quel sur n'importe quel hébergeur
> statique (GitHub Pages, Cloudflare Pages, Nginx…).

## Livré

```
site/
  index.html     (SEO : title/description, OG, 1 seul <h1> ; contenu FR
                  INLINÉ — lisible sans JS, crawlable, dégradation gracieuse)
  styles.css     (thème teal médical, propriétés logiques → RTL natif,
                  responsive 3 breakpoints, :focus-visible)
  app.js         (i18n client léger, dir=rtl pour l'arabe, choix persisté
                  localStorage ; aucun service tiers, aucun cookie)
  i18n.json      (61 clés × 3 langues — fr/ar/en)
  robots.txt

tools/scripts/check_landing.py   (parité clés, contenu inliné, zéro
                                  tracker, base SEO/a11y)
tools/scripts/phase13_checks.sh  (check_landing intégré aux validations
                                  d'avant-push, bloquant)
```

## Sections de la page

Hero (badge « facultés de médecine d'Algérie », chiffres 697+/10/3) →
6 fonctionnalités (FSRS-5, offline-first, hints IA sans cloud, tuteur
vocal encadré, examens blancs, gamification) → bibliothèque par
discipline → tarifs (freemium : Découverte 0 DA / Premium prix
étudiant DZ) → FAQ (dont « mes données partent-elles vers un LLM ? »
et « est-ce un avis médical ? » — cohérent avec la policy tuteur) →
formulaire de notification de lancement → footer (disclaimer,
**lien SECURITY.md = canal bug bounty Phase 19.4**, mention 🇩🇿).

## Choix structurants

### Zéro build, zéro dépendance

HTML/CSS/JS vanilla. Aucun CDN, aucune font tierce, aucun tracker —
conforme à la ligne vie privée du produit (v2 §10) et déployable même
derrière un réseau lent. `check_landing.py` casse le pipeline si un
marqueur tiers (analytics, pixels, CDN…) apparaît.

### i18n comme le reste du projet

* FR principal, EN secondaire, AR complet (MSA) avec `dir=rtl`
  automatique et propriétés CSS logiques (`margin-inline-start`…) —
  cf. Phase 19.3 pour la même convention côté backend.
* Parité des clés vérifiée par `check_landing.py` (cas bloquant dans
  `phase13_checks.sh`) : toute clé FR existe en AR/EN, aucune orpheline.
* SEO : le contenu FR est inliné dans le HTML — les robots et les
  utilisateurs sans JS voient la page complète ; `app.js` ne fait que
  basculer la langue.

### Formulaire « notify » honnête

Les stores ne sont pas ouverts (Phase 19.8) : le formulaire accuse
réception **localement** avec le point de branchement documenté
(`POST /v1/marketing/notify-list`, double opt-in, loi 18-07) — aucun
faux endpoint appelé, aucune collecte réelle sans back-office.

## Vérification

```bash
python3 tools/scripts/check_landing.py   # ✓ 61 clés × 3, FR inliné, 0 tracker
bash tools/scripts/phase13_checks.sh     # ✓ (check_landing inclus, bloquant)
node --check site/app.js                 # ✓
python3 -m json.tool site/i18n.json      # ✓
```

Déploiement suggéré : `site/` en racine d'un hébergeur statique
(ex. `docs.medanki-dz` ou page produit du repo) — aucune étape de build.

## Hors périmètre (reporté)

* Endpoint de collecte d'emails (`/v1/marketing/notify-list` + double
  opt-in) — à faire au lancement stores (19.8), avec registre CNIL/18-07.
* Blog / pages SEO par module (contenu éditorial) — Phase 20.
* Captures d'écran produit réelles (nécessite un build mobile signé) —
  remplacer les emojis par des visuels au moment de la soumission.
