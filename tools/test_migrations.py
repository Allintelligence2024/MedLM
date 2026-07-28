"""Tests réels du schéma local et de ses migrations.

Le SDK Dart n'est pas installable dans cet environnement ; Drift ne peut donc
pas être exécuté ici. Mais Drift n'est qu'une couche typée au-dessus de SQLite :
le schéma, les contraintes, les déclencheurs et les migrations sont du SQL
standard, et c'est *là* que se situent les risques (perte de données, journal
modifiable, index manquant).

Ce script exécute donc réellement le SQL avec sqlite3 et vérifie :
  1. que le schéma v1 se crée sans erreur ;
  2. que la migration v1 -> v2 préserve intégralement les données existantes ;
  3. que `review_log` est effectivement append-only (UPDATE/DELETE rejetés) ;
  4. que les contraintes d'intégrité rejettent les données invalides ;
  5. que les index critiques sont bien utilisés par le planificateur SQLite ;
  6. que la requête de file des cartes dues est correcte.
"""

import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_DIR = os.path.join(ROOT, "mobile", "lib", "data", "local", "schema")

failures = []
checks = 0


def check(label, condition, detail=""):
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}{(' — ' + detail) if detail else ''}")


def sql(name):
    with open(os.path.join(SCHEMA_DIR, name), encoding="utf-8") as f:
        return f.read()


def fresh_v1():
    conn = sqlite3.connect(":memory:")
    conn.executescript(sql("v1.sql"))
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def seed(conn, n_cards=5, n_reviews=20):
    """Insère un jeu de données représentatif."""
    conn.execute(
        "INSERT INTO deck_meta (deck_id, module_id, name_fr, name_en, version, "
        "card_count, is_premium, updated_at) VALUES "
        "('deck-anat-1', 'anatomie', 'Membre supérieur', 'Upper limb', 3, ?, 0, 1700000000000)",
        (n_cards,),
    )
    for i in range(n_cards):
        conn.execute(
            "INSERT INTO local_cards (id, deck_id, type, content_json, "
            "source_meta_json, downloaded_at) VALUES (?, 'deck-anat-1', 'basic', "
            "?, ?, 1700000000000)",
            (f"card-{i}", '{"front":{"fr":"Q"},"back":{"fr":"R"}}',
             '{"source_type":"original"}'),
        )
    for i in range(n_reviews):
        conn.execute(
            "INSERT INTO review_log (id, user_id, card_id, device_id, rating, "
            "card_type, reviewed_at, received_at) VALUES (?, 'user-1', ?, "
            "'dev-A', ?, 'basic', ?, ?)",
            (f"{i:08d}-0000-7000-8000-000000000000", f"card-{i % n_cards}",
             (i % 4) + 1, 1700000000000 + i * 3600000, 1700000000000 + i * 3600000),
        )
    for i in range(n_cards):
        conn.execute(
            "INSERT INTO srs_state (user_id, card_id, state, stability, "
            "difficulty, due_ms, updated_at) VALUES ('user-1', ?, 'review', "
            "?, 5.0, ?, 1700000000000)",
            (f"card-{i}", 3.0 + i, 1700000000000 + i * 86400000),
        )
    conn.commit()


# ── 1. Création du schéma v1 ────────────────────────────────────────────────
try:
    conn = fresh_v1()
    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    expected = {"deck_meta", "local_cards", "review_log", "srs_state",
                "outbox_events", "sync_cursor", "entitlement",
                "study_sessions", "daily_counters", "user_prefs"}
    check("v1 : toutes les tables sont créées", expected <= tables,
          f"manquantes: {expected - tables}")
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"v1 : échec de création — {e}")

# ── 2. Migration v1 -> v2 sans perte ────────────────────────────────────────
try:
    conn = fresh_v1()
    seed(conn)
    before = {
        "cards": conn.execute("SELECT count(*) FROM local_cards").fetchone()[0],
        "reviews": conn.execute("SELECT count(*) FROM review_log").fetchone()[0],
        "srs": conn.execute("SELECT count(*) FROM srs_state").fetchone()[0],
        "sum_rating": conn.execute("SELECT sum(rating) FROM review_log").fetchone()[0],
        "sum_stab": round(conn.execute(
            "SELECT sum(stability) FROM srs_state").fetchone()[0], 6),
    }

    conn.executescript(sql("v2.sql"))
    conn.commit()

    after = {
        "cards": conn.execute("SELECT count(*) FROM local_cards").fetchone()[0],
        "reviews": conn.execute("SELECT count(*) FROM review_log").fetchone()[0],
        "srs": conn.execute("SELECT count(*) FROM srs_state").fetchone()[0],
        "sum_rating": conn.execute("SELECT sum(rating) FROM review_log").fetchone()[0],
        "sum_stab": round(conn.execute(
            "SELECT sum(stability) FROM srs_state").fetchone()[0], 6),
    }
    check("migration v1->v2 : aucune donnée perdue", before == after,
          f"{before} != {after}")

    cols = {r[1] for r in conn.execute("PRAGMA table_info(local_cards)")}
    check("migration v1->v2 : colonne reported_flag ajoutée",
          "reported_flag" in cols)
    check("migration v1->v2 : colonne published_at ajoutée",
          "published_at" in cols)
    check("migration v1->v2 : table card_reports créée",
          conn.execute("SELECT count(*) FROM sqlite_master WHERE "
                       "name='card_reports'").fetchone()[0] == 1)
    dcols = {r[1] for r in conn.execute("PRAGMA table_info(daily_counters)")}
    check("migration v1->v2 : colonne freeze_used ajoutée", "freeze_used" in dcols)
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"migration v1->v2 : échec — {e}")

# ── 3. review_log strictement append-only ───────────────────────────────────
try:
    conn = fresh_v1()
    seed(conn, n_reviews=3)

    for label, stmt in (
        ("UPDATE du rating", "UPDATE review_log SET rating = 4"),
        ("UPDATE de reviewed_at",
         "UPDATE review_log SET reviewed_at = 0"),
        ("UPDATE de exam_mode", "UPDATE review_log SET exam_mode = 1"),
        ("DELETE d'une revue", "DELETE FROM review_log"),
    ):
        try:
            conn.execute(stmt)
            conn.commit()
            failures.append(f"append-only : {label} aurait dû être rejeté")
        except sqlite3.IntegrityError:
            checks += 1  # rejet attendu
        except sqlite3.OperationalError as e:
            if "append-only" in str(e):
                checks += 1
            else:
                failures.append(f"append-only : {label} — erreur inattendue {e}")
        conn.rollback()

    # Le marquage de synchronisation doit rester possible : il ne touche pas au
    # contenu de la revue.
    conn.execute("UPDATE review_log SET synced = 1 WHERE user_id = 'user-1'")
    conn.commit()
    check("append-only : le marquage 'synced' reste autorisé",
          conn.execute("SELECT count(*) FROM review_log WHERE synced = 1"
                       ).fetchone()[0] == 3)

    # L'insertion reste évidemment permise.
    conn.execute(
        "INSERT INTO review_log (id, user_id, card_id, device_id, rating, "
        "card_type, reviewed_at, received_at) VALUES "
        "('new-id', 'user-1', 'card-0', 'dev-B', 3, 'basic', 1, 1)")
    conn.commit()
    check("append-only : l'insertion reste autorisée",
          conn.execute("SELECT count(*) FROM review_log").fetchone()[0] == 4)
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"append-only : échec — {e}")

# ── 4. Contraintes d'intégrité ──────────────────────────────────────────────
try:
    conn = fresh_v1()
    seed(conn, n_reviews=1)

    invalid = (
        ("rating hors bornes",
         "INSERT INTO review_log (id,user_id,card_id,device_id,rating,card_type,"
         "reviewed_at,received_at) VALUES ('x','u','c','d',5,'basic',1,1)"),
        ("rating nul",
         "INSERT INTO review_log (id,user_id,card_id,device_id,rating,card_type,"
         "reviewed_at,received_at) VALUES ('y','u','c','d',0,'basic',1,1)"),
        ("card_type inconnu",
         "INSERT INTO review_log (id,user_id,card_id,device_id,rating,card_type,"
         "reviewed_at,received_at) VALUES ('z','u','c','d',3,'video',1,1)"),
        ("état SRS inconnu",
         "INSERT INTO srs_state (user_id,card_id,state,updated_at) "
         "VALUES ('u','c','mastered',1)"),
        ("type de carte inconnu",
         "INSERT INTO local_cards (id,deck_id,type,content_json,downloaded_at) "
         "VALUES ('c9','deck-anat-1','image','{}',1)"),
        ("deck inexistant (clé étrangère)",
         "INSERT INTO local_cards (id,deck_id,type,content_json,downloaded_at) "
         "VALUES ('c8','deck-absent','basic','{}',1)"),
        ("plan d'abonnement inconnu",
         "INSERT INTO entitlement (user_id,plan) VALUES ('u','lifetime')"),
        ("difficulty_hint hors bornes",
         "INSERT INTO local_cards (id,deck_id,type,content_json,difficulty_hint,"
         "downloaded_at) VALUES ('c7','deck-anat-1','basic','{}',9,1)"),
        ("type d'événement outbox inconnu",
         "INSERT INTO outbox_events (id,user_id,event_type,payload_json,"
         "created_at) VALUES ('o1','u','purchase','{}',1)"),
    )
    for label, stmt in invalid:
        try:
            conn.execute(stmt)
            conn.commit()
            failures.append(f"contrainte : '{label}' aurait dû être rejeté")
        except sqlite3.IntegrityError:
            checks += 1
        conn.rollback()

    # Unicité de la projection SRS.
    try:
        conn.execute("INSERT INTO srs_state (user_id,card_id,state,updated_at) "
                     "VALUES ('user-1','card-0','new',1)")
        conn.commit()
        failures.append("contrainte : doublon (user_id, card_id) accepté")
    except sqlite3.IntegrityError:
        checks += 1
    conn.rollback()
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"contraintes : échec — {e}")

# ── 5. Isolation multi-utilisateurs ─────────────────────────────────────────
try:
    conn = fresh_v1()
    seed(conn)
    conn.execute(
        "INSERT INTO srs_state (user_id, card_id, state, stability, difficulty, "
        "due_ms, updated_at) VALUES ('user-2','card-0','new',0,0,0,1)")
    conn.commit()
    check("multi-utilisateurs : deux comptes coexistent sur la même carte",
          conn.execute("SELECT count(*) FROM srs_state WHERE card_id='card-0'"
                       ).fetchone()[0] == 2)
    check("multi-utilisateurs : la file d'un compte ignore l'autre",
          conn.execute("SELECT count(*) FROM srs_state WHERE user_id='user-2'"
                       ).fetchone()[0] == 1)
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"multi-utilisateurs : échec — {e}")

# ── 6. Index critiques réellement utilisés ──────────────────────────────────
try:
    conn = fresh_v1()
    seed(conn, n_cards=200, n_reviews=500)
    conn.execute("ANALYZE")

    plan_due = " ".join(str(r) for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT card_id FROM srs_state "
        "WHERE user_id = 'user-1' AND due_ms <= 1700000000000 "
        "ORDER BY due_ms LIMIT 100").fetchall())
    check("index : la file des cartes dues utilise idx_srs_due",
          "idx_srs_due" in plan_due, plan_due)

    plan_hist = " ".join(str(r) for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM review_log WHERE user_id='user-1' "
        "AND card_id='card-1' ORDER BY reviewed_at, id").fetchall())
    check("index : le rejeu d'une carte utilise idx_review_log_card",
          "idx_review_log_card" in plan_hist, plan_hist)

    plan_push = " ".join(str(r) for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM review_log WHERE user_id='user-1' "
        "AND synced = 0 ORDER BY reviewed_at LIMIT 100").fetchall())
    check("index : la sélection à pousser utilise idx_review_log_unsynced",
          "idx_review_log_unsynced" in plan_push, plan_push)

    plan_outbox = " ".join(str(r) for r in conn.execute(
        "EXPLAIN QUERY PLAN SELECT * FROM outbox_events WHERE user_id='user-1' "
        "AND next_attempt_at <= 999 ORDER BY created_at").fetchall())
    check("index : la file d'envoi utilise idx_outbox_ready",
          "idx_outbox_ready" in plan_outbox, plan_outbox)
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"index : échec — {e}")

# ── 7. Requête de file d'étude ──────────────────────────────────────────────
try:
    conn = fresh_v1()
    now = 1700000000000
    conn.execute("INSERT INTO deck_meta (deck_id, module_id, name_fr, "
                 "is_premium, updated_at) VALUES ('d','m','D',0,1)")
    rows = [
        # (card, state, due, buried_until)
        ("due-1", "review", now - 86400000, None),
        ("due-2", "review", now - 1000, None),
        ("future", "review", now + 86400000, None),
        ("buried", "review", now - 5000, now + 86400000),
        ("unburied", "review", now - 5000, now - 1),
        ("new-1", "new", None, None),
    ]
    for cid, st, due, buried in rows:
        conn.execute("INSERT INTO local_cards (id,deck_id,type,content_json,"
                     "downloaded_at) VALUES (?, 'd','basic','{}',1)", (cid,))
        conn.execute("INSERT INTO srs_state (user_id,card_id,state,due_ms,"
                     "buried_until_ms,updated_at) VALUES ('u',?,?,?,?,1)",
                     (cid, st, due, buried))
    conn.commit()

    due_cards = [r[0] for r in conn.execute(
        "SELECT card_id FROM srs_state WHERE user_id='u' AND state != 'new' "
        "AND due_ms <= ? AND (buried_until_ms IS NULL OR buried_until_ms <= ?) "
        "ORDER BY due_ms", (now, now))]
    check("file d'étude : seules les cartes dues et non enterrées sortent",
          due_cards == ["due-1", "unburied", "due-2"],
          str(due_cards))

    new_cards = [r[0] for r in conn.execute(
        "SELECT card_id FROM srs_state WHERE user_id='u' AND state='new' "
        "LIMIT 10")]
    check("file d'étude : les nouvelles cartes sont isolées",
          new_cards == ["new-1"], str(new_cards))
    conn.close()
except Exception as e:  # noqa: BLE001
    failures.append(f"file d'étude : échec — {e}")

# ── Résultat ────────────────────────────────────────────────────────────────
print(f"{checks} vérifications exécutées sur SQLite {sqlite3.sqlite_version}")
if failures:
    print(f"\n❌ {len(failures)} échec(s) :\n")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("✅ Schéma, migrations, append-only, contraintes et index validés.")
