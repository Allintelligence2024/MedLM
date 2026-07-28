"""Valide le contenu embarqué contre la Content Policy (v2 §5.3 et §5.4).

Ce script rejoue en Python les règles implémentées par `ContentParser` (Dart) et
les applique aux fichiers de `mobile/assets/content/`. Il sert deux objectifs :

  1. garantir que le contenu livré est conforme (aucune carte sans provenance,
     sans explication, ou avec un QCM mal formé) ;
  2. vérifier que les règles rejettent effectivement les cas invalides — un
     validateur qui n'échoue jamais ne protège de rien.

Destiné à tourner en CI (Phase 12) : une carte non conforme doit bloquer la
publication, pas être découverte par un étudiant.
"""

import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT_DIR = os.path.join(ROOT, "mobile", "assets", "content")

VALID_SOURCE_TYPES = {"original", "inspired", "partnership"}
VALID_CARD_TYPES = {"basic", "cloze", "qcm"}


class PolicyError(Exception):
    pass


def check_localized(node, field, card_id):
    if not isinstance(node, dict):
        raise PolicyError(f"[{card_id}] champ '{field}' : objet {{fr, en}} attendu")
    fr = node.get("fr")
    if not isinstance(fr, str) or not fr.strip():
        raise PolicyError(f"[{card_id}] champ '{field}' : le français est obligatoire")


def validate_source_meta(card):
    cid = card.get("id", "?")
    meta = card.get("source_meta")
    if not meta:
        raise PolicyError(f"[{cid}] source_meta absent : provenance obligatoire")

    st = meta.get("source_type")
    if st not in VALID_SOURCE_TYPES:
        raise PolicyError(f"[{cid}] source_type invalide : {st!r}")

    if st == "partnership" and not (meta.get("attribution") or "").strip():
        raise PolicyError(f"[{cid}] type 'partnership' sans attribution")

    if st == "inspired" and not (meta.get("notes") or "").strip():
        raise PolicyError(
            f"[{cid}] type 'inspired' sans notes documentant la reformulation")

    if meta.get("can_distribute_offline") is False:
        raise PolicyError(f"[{cid}] carte retirée de la distribution")


def validate_card(card):
    cid = card.get("id")
    if not cid:
        raise PolicyError("carte sans identifiant")

    ctype = card.get("type")
    if ctype not in VALID_CARD_TYPES:
        raise PolicyError(f"[{cid}] type inconnu : {ctype!r}")

    validate_source_meta(card)

    content = card.get("content")
    if not isinstance(content, dict):
        raise PolicyError(f"[{cid}] bloc 'content' manquant")

    if ctype == "qcm":
        check_localized(content.get("question"), "question", cid)
        options = content.get("options")
        if not isinstance(options, list) or len(options) < 2:
            raise PolicyError(f"[{cid}] un QCM doit proposer au moins 2 options")

        ids = [o.get("id") for o in options]
        if len(set(ids)) != len(ids):
            raise PolicyError(f"[{cid}] identifiants d'options dupliqués")

        correct = [o for o in options if o.get("is_correct")]
        if not correct:
            raise PolicyError(f"[{cid}] QCM sans bonne réponse")
        is_multiple = content.get("is_multiple", False)
        if not is_multiple and len(correct) > 1:
            raise PolicyError(
                f"[{cid}] QCM à réponse unique avec {len(correct)} bonnes réponses")
        if is_multiple and len(correct) == 1:
            raise PolicyError(f"[{cid}] QCM multiple avec une seule bonne réponse")

        for o in options:
            oid = o.get("id")
            if not (o.get("fr") or "").strip():
                raise PolicyError(f"[{cid}] option {oid} sans texte français")
            if not (o.get("explanation_fr") or "").strip():
                raise PolicyError(
                    f"[{cid}] option {oid} sans explication "
                    f"(obligatoire y compris pour les distracteurs)")
    else:
        check_localized(content.get("front"), "front", cid)
        check_localized(content.get("back"), "back", cid)
        if not content.get("explanation"):
            raise PolicyError(f"[{cid}] carte sans explication clinique")
        check_localized(content.get("explanation"), "explanation", cid)

    for m in content.get("media", []) or []:
        if not m.get("key"):
            raise PolicyError(f"[{cid}] média sans clé de stockage")
        if m.get("type", "image") == "image" and not (m.get("alt_fr") or "").strip():
            raise PolicyError(
                f"[{cid}] image '{m.get('key')}' sans texte alternatif français")


def validate_deck(path):
    deck = json.load(open(path, encoding="utf-8"))
    name = os.path.basename(path)

    for field in ("deck_id", "module_id", "version", "name_fr", "cards"):
        if field not in deck:
            raise PolicyError(f"{name} : champ '{field}' manquant")

    if not isinstance(deck["version"], int) or deck["version"] < 1:
        raise PolicyError(f"{name} : version de deck invalide")

    ids = set()
    for card in deck["cards"]:
        validate_card(card)
        if card["id"] in ids:
            raise PolicyError(f"{name} : identifiant de carte dupliqué "
                              f"{card['id']}")
        ids.add(card["id"])

    return deck


# ── Cas invalides : le validateur doit les refuser ──────────────────────────
def base_card(**overrides):
    card = {
        "id": "test_001",
        "type": "basic",
        "source_meta": {"source_type": "original", "can_distribute_offline": True},
        "content": {
            "front": {"fr": "Q"},
            "back": {"fr": "R"},
            "explanation": {"fr": "Parce que."},
        },
    }
    card.update(overrides)
    return card


NEGATIVE_CASES = [
    ("carte sans source_meta", base_card(source_meta=None)),
    ("source_type inconnu",
     base_card(source_meta={"source_type": "scanned_exam"})),
    ("source_type absent", base_card(source_meta={"faculty": "Alger"})),
    ("partenariat sans attribution",
     base_card(source_meta={"source_type": "partnership"})),
    ("inspiré sans notes de reformulation",
     base_card(source_meta={"source_type": "inspired"})),
    ("carte retirée de la distribution",
     base_card(source_meta={"source_type": "original",
                            "can_distribute_offline": False})),
    ("type de carte inconnu", base_card(type="video")),
    ("carte sans explication clinique",
     base_card(content={"front": {"fr": "Q"}, "back": {"fr": "R"}})),
    ("français manquant",
     base_card(content={"front": {"en": "Q"}, "back": {"fr": "R"},
                        "explanation": {"fr": "x"}})),
    ("QCM à une seule option",
     base_card(type="qcm", content={
         "question": {"fr": "Q"},
         "options": [{"id": "A", "fr": "a", "is_correct": True,
                      "explanation_fr": "ok"}]})),
    ("QCM sans bonne réponse",
     base_card(type="qcm", content={
         "question": {"fr": "Q"},
         "options": [{"id": "A", "fr": "a", "is_correct": False,
                      "explanation_fr": "x"},
                     {"id": "B", "fr": "b", "is_correct": False,
                      "explanation_fr": "y"}]})),
    ("QCM unique à deux bonnes réponses",
     base_card(type="qcm", content={
         "question": {"fr": "Q"},
         "options": [{"id": "A", "fr": "a", "is_correct": True,
                      "explanation_fr": "x"},
                     {"id": "B", "fr": "b", "is_correct": True,
                      "explanation_fr": "y"}]})),
    ("distracteur sans explication",
     base_card(type="qcm", content={
         "question": {"fr": "Q"},
         "options": [{"id": "A", "fr": "a", "is_correct": True,
                      "explanation_fr": "ok"},
                     {"id": "B", "fr": "b", "is_correct": False}]})),
    ("options dupliquées",
     base_card(type="qcm", content={
         "question": {"fr": "Q"},
         "options": [{"id": "A", "fr": "a", "is_correct": True,
                      "explanation_fr": "x"},
                     {"id": "A", "fr": "b", "is_correct": False,
                      "explanation_fr": "y"}]})),
    ("image sans texte alternatif",
     base_card(content={
         "front": {"fr": "Q"}, "back": {"fr": "R"},
         "explanation": {"fr": "x"},
         "media": [{"type": "image", "key": "a.webp"}]})),
]


def main():
    failures = []
    checks = 0

    files = sorted(glob.glob(os.path.join(CONTENT_DIR, "*.json")))
    if not files:
        print("❌ aucun fichier de contenu trouvé")
        return 1

    total_cards = 0
    deck_ids = set()
    for path in files:
        try:
            deck = validate_deck(path)
            checks += 1
            total_cards += len(deck["cards"])
            if deck["deck_id"] in deck_ids:
                failures.append(f"deck_id dupliqué : {deck['deck_id']}")
            deck_ids.add(deck["deck_id"])
        except PolicyError as e:
            failures.append(f"{os.path.basename(path)} : {e}")
        except json.JSONDecodeError as e:
            failures.append(f"{os.path.basename(path)} : JSON invalide — {e}")

    for label, card in NEGATIVE_CASES:
        checks += 1
        try:
            validate_card(card)
            failures.append(f"cas invalide accepté à tort : {label}")
        except PolicyError:
            pass

    # Le français doit être la langue principale partout.
    for path in files:
        deck = json.load(open(path, encoding="utf-8"))
        for card in deck["cards"]:
            checks += 1
            c = card["content"]
            node = c.get("question") or c.get("front")
            if not (node or {}).get("fr"):
                failures.append(f"[{card['id']}] français manquant "
                                f"(le FR est la langue principale)")

    print(f"{checks} vérifications — {len(files)} decks, {total_cards} cartes, "
          f"{len(NEGATIVE_CASES)} cas invalides testés")
    if failures:
        print(f"\n❌ {len(failures)} problème(s) :\n")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Contenu conforme à la Content Policy et règles de rejet actives.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
