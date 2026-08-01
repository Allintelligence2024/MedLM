#!/usr/bin/env python3
"""Les migrations s'appliquent-elles VRAIMENT ? (bug trouvé le 2026-08-01)

LE BUG QUE CE SCRIPT VERROUILLE
--------------------------------
`0001_init.sql` ne contenait que des commentaires. Il annonçait « toutes
les tables décrites dans src/db/schema/ sont créées ici », mais
`npm run db:generate` n'avait jamais été lancé : pas une instruction SQL.

Les 15 tables fondatrices — `users`, `decks`, `cards`, `review_logs`,
`srs_card_state`, `refresh_tokens`… — n'étaient créées par AUCUNE
migration. Provisionner une base réelle échouait dès `0002` sur
« relation "review_logs" does not exist ».

Personne ne l'avait vu : les tests unitaires instancient les classes
directement, les tests d'intégration substituent un faux `DRIZZLE`, et
aucun environnement ne disposait d'un PostgreSQL. Le premier à s'en
apercevoir aurait été le premier déploiement.

CE QUE FAIT CE SCRIPT
---------------------
Il compare, sans base de données, l'ensemble des tables déclarées dans
`src/db/schema/*.ts` à celles réellement créées par les fichiers
`migrations/*.sql`. Toute table qui existe côté code sans exister côté
migration est une table qui manquera en production.

Il vérifie aussi que chaque migration listée au journal contient au
moins une instruction exécutable — un fichier « documentaire » comme
l'ancien 0001 doit être considéré comme une erreur, pas comme une
migration vide légitime.

Pour l'application RÉELLE contre PostgreSQL, voir le job `integration`
de `backend-ci.yml`, qui lance `npm run db:migrate`.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "backend" / "src" / "db" / "schema"
MIGRATIONS = ROOT / "backend" / "src" / "db" / "migrations"

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)


def schema_tables() -> set[str]:
    """Tables déclarées via `pgTable('nom', …)` (souvent multi-lignes)."""
    tables: set[str] = set()
    for ts in SCHEMA_DIR.glob("*.ts"):
        tables |= set(re.findall(r"pgTable\(\s*'([a-z_]+)'", ts.read_text(encoding="utf-8")))
    return tables


def migration_tables() -> tuple[set[str], dict[str, int]]:
    """Tables créées par les .sql, et nombre d'instructions par fichier."""
    created: set[str] = set()
    statements: dict[str, int] = {}
    for sql in sorted(MIGRATIONS.glob("*.sql")):
        text = sql.read_text(encoding="utf-8")
        created |= {
            t.lower()
            for t in re.findall(
                r'CREATE TABLE (?:IF NOT EXISTS )?"?([a-z_]+)"?', text, re.I
            )
        }
        # Instructions exécutables = lignes non commentaires se terminant
        # par « ; » quelque part dans le fichier.
        stripped = re.sub(r"^\s*--.*$", "", text, flags=re.M).strip()
        statements[sql.name] = stripped.count(";")
    return created, statements


def main() -> int:
    if not SCHEMA_DIR.is_dir() or not MIGRATIONS.is_dir():
        print("⏭  schéma ou migrations absents")
        return 0

    declared = schema_tables()
    created, statements = migration_tables()

    if not declared:
        fail("aucune table trouvée dans src/db/schema/ — parsing cassé ?")

    missing = sorted(declared - created)
    for table in missing:
        fail(
            f"table « {table} » déclarée dans le schéma Drizzle mais créée par "
            "aucune migration — elle n'existera pas en production"
        )

    # Une migration au journal qui ne contient aucune instruction est un
    # fichier documentaire déguisé : exactement le cas de l'ancien 0001.
    journal = MIGRATIONS / "meta" / "_journal.json"
    if journal.exists():
        entries = json.loads(journal.read_text(encoding="utf-8")).get("entries", [])
        for entry in entries:
            name = f"{entry['tag']}.sql"
            if statements.get(name, 0) == 0:
                fail(
                    f"{name} est au journal mais ne contient aucune instruction "
                    "SQL exécutable (fichier purement documentaire ?)"
                )

    # Les tables créées sans être déclarées ne sont pas une erreur en soi
    # (tables techniques), mais méritent d'être signalées.
    orphans = sorted(created - declared)

    for f in failures:
        print(f"  ❌ {f}")
    if orphans:
        print(f"  ⚠  créées sans être déclarées : {', '.join(orphans)}")
    if failures:
        print(f"\n❌ Migrations : {len(failures)} problème(s).")
        return 1

    print(
        f"✅ Migrations complètes ({len(declared)} tables du schéma toutes créées, "
        f"{len(statements)} fichiers tous exécutables)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
