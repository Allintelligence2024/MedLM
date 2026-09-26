#!/usr/bin/env python3
"""Construit un rapport lisible des échecs Flutter à partir du rapport JSON.

Usage :
    python3 tools/scripts/flutter_ci_report.py \
        --analyze /tmp/analyze.txt \
        --json /tmp/tests.json \
        --stderr /tmp/tests.err \
        --out /tmp/report.md

Le rapport JSON de `flutter test` ne contient, pour les tests de widgets,
qu'un message générique ("Test failed. See exception logs above.") : le
détail de l'exception part dans les événements `print`. On les rattache
donc au test concerné par `testID`.
"""

from __future__ import annotations

import argparse
import json


def load_events(path):
    events = []
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        pass
    return events


def slug(name):
    return name.replace(" ", "_").replace("/", "_")[:80]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analyze")
    parser.add_argument("--json", required=True)
    parser.add_argument("--stderr")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    lines = ["# Rapport de diagnostic Flutter", ""]

    if args.analyze:
        try:
            with open(args.analyze, encoding="utf-8") as fh:
                analyze = fh.read().strip()
            lines += ["## flutter analyze", "", "```", analyze[-12000:], "```", ""]
        except OSError as exc:
            lines += ["## flutter analyze", "", f"indisponible : {exc}", ""]

    tests: dict[object, str] = {}
    prints: dict[object, list[str]] = {}
    failures: list[dict] = []
    passed = 0

    for ev in load_events(args.json):
        kind = ev.get("type")
        if kind == "testStart":
            tests[ev["test"]["id"]] = ev["test"].get("name", "?")
        elif kind == "print":
            prints.setdefault(ev.get("testID"), []).append(ev.get("message", ""))
        elif kind == "error":
            failures.append(
                {
                    "id": ev.get("testID"),
                    "name": tests.get(ev.get("testID"), "?"),
                    "error": ev.get("error", ""),
                    "stack": ev.get("stackTrace", ""),
                }
            )
        elif kind == "testDone":
            if ev.get("result") == "success":
                passed += 1
            elif ev.get("result") == "error":
                name = tests.get(ev.get("testID"), "?")
                if not any(f["name"] == name for f in failures):
                    failures.append(
                        {
                            "id": ev.get("testID"),
                            "name": name,
                            "error": "result=error (sans message)",
                            "stack": "",
                        }
                    )

    lines += ["## Tests", "", f"{passed} réussis, {len(failures)} en échec", ""]

    for f in failures:
        lines += [f"### `{f['name']}`", ""]
        lines += ["```", f["error"].strip()[:4000], "```", ""]
        frames = [
            line
            for line in f["stack"].splitlines()
            if "mobile/" in line or "package:test" in line
        ][:10]
        if frames:
            lines += ["Pile :", "", "```", "\n".join(frames), "```", ""]
        logs = prints.get(f.get("id")) or []
        if logs:
            tail = "\n".join(logs)[-6000:]
            lines += ["Journal du test :", "", "```", tail, "```", ""]

    if args.stderr:
        try:
            with open(args.stderr, encoding="utf-8") as fh:
                err = fh.read().strip()
            if err:
                lines += ["## stderr", "", "```", err[-5000:], "```", ""]
        except OSError:
            pass

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"rapport : {len(failures)} échec(s) détaillé(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
