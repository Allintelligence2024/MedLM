"""Garde-fou : les tables Drift doivent refléter le schéma SQL de référence.

Le schéma SQL (`schema/v1.sql` + `v2.sql`) est celui qui est réellement testé
contre SQLite. Les classes Drift (`tables.dart`) sont la façade typée utilisée
par l'application. Si les deux divergent, l'application compilerait avec un
schéma différent de celui qui a été validé.

Ce script compare les noms de tables et de colonnes des deux côtés, en tenant
compte de la conversion camelCase -> snake_case appliquée par Drift.
"""

import os
import re
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_DIR = os.path.join(ROOT, "mobile", "lib", "data", "local", "schema")
TABLES_DART = os.path.join(ROOT, "mobile", "lib", "data", "local", "tables.dart")


def snake(name):
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def sql_schema():
    conn = sqlite3.connect(":memory:")
    for f in ("v1.sql", "v2.sql"):
        conn.executescript(open(os.path.join(SCHEMA_DIR, f), encoding="utf-8").read())
    out = {}
    for (t,) in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%'"):
        out[t] = {r[1] for r in conn.execute(f"PRAGMA table_info({t})")}
    conn.close()
    return out


def dart_schema():
    src = open(TABLES_DART, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"class\s+(\w+)\s+extends\s+Table\s*\{(.*?)\n\}",
                         src, re.S):
        cls, body = m.group(1), m.group(2)
        cols = set()
        for cm in re.finditer(
                r"(?:Text|Int|Real|Bool)Column\s+get\s+(\w+)\s*=>", body):
            cols.add(snake(cm.group(1)))
        out[snake(cls)] = cols
    return out


def main():
    sql_t = sql_schema()
    dart_t = dart_schema()
    failures = []

    only_sql = set(sql_t) - set(dart_t)
    only_dart = set(dart_t) - set(sql_t)
    if only_sql:
        failures.append(f"Tables présentes en SQL mais absentes de Drift : "
                        f"{sorted(only_sql)}")
    if only_dart:
        failures.append(f"Tables présentes en Drift mais absentes du SQL : "
                        f"{sorted(only_dart)}")

    for t in sorted(set(sql_t) & set(dart_t)):
        missing = sql_t[t] - dart_t[t]
        extra = dart_t[t] - sql_t[t]
        if missing:
            failures.append(f"{t} : colonnes manquantes côté Drift {sorted(missing)}")
        if extra:
            failures.append(f"{t} : colonnes en trop côté Drift {sorted(extra)}")

    total_cols = sum(len(c) for c in sql_t.values())
    print(f"{len(sql_t)} tables / {total_cols} colonnes comparées "
          f"(SQL de référence ↔ Drift)")
    if failures:
        print(f"\n❌ {len(failures)} divergence(s) :\n")
        for f in failures:
            print("  -", f)
        return 1
    print("✅ Les tables Drift reflètent fidèlement le schéma SQL validé.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
