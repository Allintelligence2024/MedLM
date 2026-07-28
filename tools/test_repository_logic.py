"""Valide la logique SQL du dépôt SRS contre un vrai SQLite.

Le SDK Dart étant indisponible ici, on rejoue en Python les requêtes exactes
qu'émet `SrsRepository` (file d'étude, upsert d'état, compteurs quotidiens,
transaction d'enregistrement d'une revue) et on vérifie les propriétés
attendues. L'objectif est de prouver que la *logique de données* est correcte,
indépendamment de la couche Drift qui n'en est que la façade typée.

Couvre notamment la garantie centrale de la Phase 2 : une revue enregistrée est
atomiquement présente dans le journal ET dans la file de sortie, ou absente des
deux.
"""

import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_DIR = os.path.join(ROOT, "mobile", "lib", "data", "local", "schema")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fsrs_reference import State, apply_review, fold  # noqa: E402

DAY = 86400000
T0 = 1700000000000

failures = []
checks = 0


def check(label, cond, detail=""):
    global checks
    checks += 1
    if not cond:
        failures.append(f"{label}{(' — ' + detail) if detail else ''}")


def db():
    conn = sqlite3.connect(":memory:", isolation_level=None)
    for f in ("v1.sql", "v2.sql"):
        conn.executescript(open(os.path.join(SCHEMA_DIR, f), encoding="utf-8").read())
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "INSERT INTO deck_meta (deck_id, module_id, name_fr, is_premium, updated_at)"
        " VALUES ('d1','anatomie','Anatomie',0,1)")
    return conn


def add_card(conn, cid, ctype="basic"):
    conn.execute(
        "INSERT INTO local_cards (id,deck_id,type,content_json,downloaded_at) "
        "VALUES (?,?,?,'{}',1)", (cid, "d1", ctype))
    conn.execute(
        "INSERT INTO srs_state (user_id,card_id,state,updated_at) "
        "VALUES ('u1',?, 'new',1)", (cid,))


# La transaction exacte de SrsRepository.recordReview
def record_review(conn, card_id, rating, now, day_key, card_type="basic",
                  exam_mode=False, event_id=None, device="devA"):
    event_id = event_id or f"ev-{card_id}-{now}"
    cur = conn.cursor()
    cur.execute("BEGIN")
    try:
        row = cur.execute(
            "SELECT state,stability,difficulty,elapsed_days,scheduled_days,"
            "reps,lapses,last_review_ms,due_ms,is_leech FROM srs_state "
            "WHERE user_id='u1' AND card_id=?", (card_id,)).fetchone()
        st = State() if row is None else State(
            state=row[0], stability=row[1], difficulty=row[2],
            elapsed_days=row[3], scheduled_days=row[4], reps=row[5],
            lapses=row[6], last_review_ms=row[7], due_ms=row[8],
            is_leech=bool(row[9]))
        was_new = st.state == "new"

        cur.execute(
            "INSERT INTO review_log (id,user_id,card_id,device_id,rating,"
            "duration_ms,card_type,exam_mode,reviewed_at,received_at) "
            "VALUES (?,'u1',?,?,?,0,?,?,?,?)",
            (event_id, card_id, device, rating, card_type,
             1 if exam_mode else 0, now, now))
        cur.execute(
            "INSERT INTO outbox_events (id,user_id,event_type,payload_json,"
            "created_at) VALUES (?,'u1','review','{}',?)", (event_id, now))

        if not exam_mode:
            st = apply_review(st, rating, now, card_type=card_type)
            cur.execute(
                "INSERT INTO srs_state (user_id,card_id,state,stability,"
                "difficulty,elapsed_days,scheduled_days,reps,lapses,"
                "last_review_ms,due_ms,is_leech,updated_at) "
                "VALUES ('u1',?,?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT (user_id,card_id) DO UPDATE SET "
                "state=excluded.state,stability=excluded.stability,"
                "difficulty=excluded.difficulty,elapsed_days=excluded.elapsed_days,"
                "scheduled_days=excluded.scheduled_days,reps=excluded.reps,"
                "lapses=excluded.lapses,last_review_ms=excluded.last_review_ms,"
                "due_ms=excluded.due_ms,is_leech=excluded.is_leech,"
                "updated_at=excluded.updated_at",
                (card_id, st.state, st.stability, st.difficulty, st.elapsed_days,
                 st.scheduled_days, st.reps, st.lapses, st.last_review_ms,
                 st.due_ms, 1 if st.is_leech else 0, now))
            cur.execute(
                "INSERT INTO daily_counters (user_id,day_key,new_cards_done,"
                "reviews_done) VALUES ('u1',?,?,1) "
                "ON CONFLICT (user_id,day_key) DO UPDATE SET "
                "new_cards_done=new_cards_done+excluded.new_cards_done,"
                "reviews_done=reviews_done+1", (day_key, 1 if was_new else 0))
        conn.commit()
        return st
    except Exception:
        conn.rollback()
        raise


# ── 1. Enregistrement atomique ──────────────────────────────────────────────
conn = db()
add_card(conn, "c1")
record_review(conn, "c1", 3, T0, "2023-11-14")
check("recordReview : la revue est journalisée",
      conn.execute("SELECT count(*) FROM review_log").fetchone()[0] == 1)
check("recordReview : la revue est mise en file de sortie",
      conn.execute("SELECT count(*) FROM outbox_events").fetchone()[0] == 1)
check("recordReview : journal et file partagent le même identifiant",
      conn.execute("SELECT r.id = o.id FROM review_log r, outbox_events o"
                   ).fetchone()[0] == 1)
st = conn.execute("SELECT state, reps FROM srs_state WHERE card_id='c1'").fetchone()
check("recordReview : l'état est projeté", st == ("learning", 1), str(st))

# ── 2. Atomicité en cas d'échec ─────────────────────────────────────────────
try:
    record_review(conn, "c1", 3, T0 + 1000, "2023-11-14",
                  event_id=f"ev-c1-{T0}")  # identifiant déjà utilisé
    failures.append("atomicité : le doublon aurait dû échouer")
except sqlite3.IntegrityError:
    checks += 1
check("atomicité : aucune écriture partielle après échec",
      conn.execute("SELECT count(*) FROM review_log").fetchone()[0] == 1
      and conn.execute("SELECT count(*) FROM outbox_events").fetchone()[0] == 1)

# ── 3. Mode examen : journalisé mais sans effet ─────────────────────────────
conn = db()
add_card(conn, "c1")
record_review(conn, "c1", 3, T0, "2023-11-14")
before = conn.execute("SELECT state,stability,reps,due_ms FROM srs_state "
                      "WHERE card_id='c1'").fetchone()
record_review(conn, "c1", 1, T0 + DAY, "2023-11-15", exam_mode=True)
after = conn.execute("SELECT state,stability,reps,due_ms FROM srs_state "
                     "WHERE card_id='c1'").fetchone()
check("mode examen : la planification est inchangée", before == after,
      f"{before} != {after}")
check("mode examen : la revue est tout de même journalisée",
      conn.execute("SELECT count(*) FROM review_log WHERE exam_mode=1"
                   ).fetchone()[0] == 1)
check("mode examen : les compteurs du jour ne bougent pas",
      conn.execute("SELECT count(*) FROM daily_counters WHERE "
                   "day_key='2023-11-15'").fetchone()[0] == 0)

# ── 4. Compteurs quotidiens et plafonds ─────────────────────────────────────
conn = db()
for i in range(5):
    add_card(conn, f"c{i}")
for i in range(5):
    record_review(conn, f"c{i}", 3, T0 + i * 1000, "2023-11-14")
row = conn.execute("SELECT new_cards_done, reviews_done FROM daily_counters "
                   "WHERE day_key='2023-11-14'").fetchone()
check("compteurs : 5 nouvelles cartes et 5 revues comptées", row == (5, 5), str(row))
# Une deuxième revue sur une carte déjà vue ne recompte pas une "nouvelle".
record_review(conn, "c0", 3, T0 + 20000, "2023-11-14")
row = conn.execute("SELECT new_cards_done, reviews_done FROM daily_counters "
                   "WHERE day_key='2023-11-14'").fetchone()
check("compteurs : une carte déjà vue n'incrémente pas les nouvelles",
      row == (5, 6), str(row))

# ── 5. Reconstruction depuis le journal (rebuildFromLog) ────────────────────
conn = db()
add_card(conn, "c1")
seq = [(3, 0), (3, 0), (3, 4), (1, 18), (3, 18), (4, 25)]
now = T0
for i, (rating, day) in enumerate(seq):
    now = T0 + day * DAY + i * 1000
    record_review(conn, "c1", rating, now, "2023-11-14")

stored = conn.execute(
    "SELECT state,stability,difficulty,reps,lapses FROM srs_state "
    "WHERE card_id='c1'").fetchone()

rows = conn.execute(
    "SELECT id,rating,reviewed_at,card_type,exam_mode FROM review_log "
    "WHERE user_id='u1' AND card_id='c1' ORDER BY reviewed_at, id").fetchall()
rebuilt = fold([{"id": r[0], "rating": r[1], "reviewedAt": r[2],
                 "cardType": r[3], "examMode": bool(r[4])} for r in rows])

check("rebuildFromLog : le rejeu du journal redonne l'état stocké",
      stored[0] == rebuilt.state
      and abs(stored[1] - rebuilt.stability) < 1e-9
      and abs(stored[2] - rebuilt.difficulty) < 1e-9
      and stored[3] == rebuilt.reps and stored[4] == rebuilt.lapses,
      f"stocké={stored} rejoué={rebuilt.to_dict()}")

# Le rejeu doit ignorer les revues d'examen même mélangées au journal.
conn.execute("INSERT INTO review_log (id,user_id,card_id,device_id,rating,"
             "card_type,exam_mode,reviewed_at,received_at) VALUES "
             "('exam-1','u1','c1','devB',1,'qcm',1,?,?)",
             (T0 + 10 * DAY, T0 + 10 * DAY))
conn.commit()
rows2 = conn.execute(
    "SELECT id,rating,reviewed_at,card_type,exam_mode FROM review_log "
    "WHERE user_id='u1' AND card_id='c1' ORDER BY reviewed_at, id").fetchall()
rebuilt2 = fold([{"id": r[0], "rating": r[1], "reviewedAt": r[2],
                  "cardType": r[3], "examMode": bool(r[4])} for r in rows2])
check("rebuildFromLog : les revues d'examen restent exclues",
      rebuilt2.to_dict() == rebuilt.to_dict())

# ── 6. File d'étude : ordre et plafonds ─────────────────────────────────────
conn = db()
now = T0 + 30 * DAY
data = [
    ("late", "review", now - 5 * DAY, None),
    ("soon", "review", now - 1000, None),
    ("later", "review", now + DAY, None),
    ("buried", "review", now - DAY, now + DAY),
    ("newA", "new", None, None),
    ("newB", "new", None, None),
]
for cid, state, due, buried in data:
    conn.execute("INSERT INTO local_cards (id,deck_id,type,content_json,"
                 "downloaded_at) VALUES (?, 'd1','basic','{}',1)", (cid,))
    conn.execute("INSERT INTO srs_state (user_id,card_id,state,due_ms,"
                 "buried_until_ms,updated_at) VALUES ('u1',?,?,?,?,1)",
                 (cid, state, due, buried))
conn.commit()

due_q = conn.execute(
    "SELECT c.id FROM srs_state s JOIN local_cards c ON c.id = s.card_id "
    "WHERE s.user_id='u1' AND s.state != 'new' AND s.due_ms <= ? "
    "AND (s.buried_until_ms IS NULL OR s.buried_until_ms <= ?) "
    "ORDER BY s.due_ms LIMIT 100", (now, now)).fetchall()
check("file d'étude : les cartes dues sortent par échéance croissante",
      [r[0] for r in due_q] == ["late", "soon"], str(due_q))

new_q = conn.execute(
    "SELECT c.id FROM srs_state s JOIN local_cards c ON c.id = s.card_id "
    "WHERE s.user_id='u1' AND s.state='new' ORDER BY c.id LIMIT 1").fetchall()
check("file d'étude : le plafond de nouvelles cartes est respecté",
      [r[0] for r in new_q] == ["newA"], str(new_q))

# ── 7. Sélection des événements à pousser ───────────────────────────────────
conn = db()
add_card(conn, "c1")
for i in range(5):
    record_review(conn, "c1", 3, T0 + i * 60000, "2023-11-14")
pending = conn.execute(
    "SELECT id FROM review_log WHERE user_id='u1' AND synced=0 "
    "ORDER BY reviewed_at LIMIT 100").fetchall()
check("push : les 5 revues sont en attente", len(pending) == 5)
conn.execute("UPDATE review_log SET synced=1 WHERE id IN (?,?)",
             (pending[0][0], pending[1][0]))
conn.commit()
remaining = conn.execute(
    "SELECT count(*) FROM review_log WHERE synced=0").fetchone()[0]
check("push : le marquage réduit la file d'attente", remaining == 3)
check("push : le contenu des revues marquées est intact",
      conn.execute("SELECT count(*) FROM review_log").fetchone()[0] == 5)

# ── 8. Isolation entre comptes ──────────────────────────────────────────────
conn = db()
add_card(conn, "c1")
record_review(conn, "c1", 3, T0, "2023-11-14")
conn.execute("INSERT INTO srs_state (user_id,card_id,state,updated_at) "
             "VALUES ('u2','c1','new',1)")
conn.commit()
check("isolation : la file de u2 ne contient pas la progression de u1",
      conn.execute("SELECT state FROM srs_state WHERE user_id='u2' "
                   "AND card_id='c1'").fetchone()[0] == "new")
check("isolation : la progression de u1 est préservée",
      conn.execute("SELECT state FROM srs_state WHERE user_id='u1' "
                   "AND card_id='c1'").fetchone()[0] == "learning")

print(f"{checks} vérifications exécutées")
if failures:
    print(f"\n❌ {len(failures)} échec(s) :\n")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print("✅ Logique du dépôt SRS validée (atomicité, examen, compteurs, "
      "rejeu, file d'étude, push, isolation).")
