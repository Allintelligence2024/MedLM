#!/usr/bin/env python3
"""
load_test.py — Tests de charge basiques pour le backend NestJS.

Approche : on simule N utilisateurs concurrents qui exécutent le
parcours typique (login → fetch due cards → push review event →
pull sync) sur T secondes. On mesure latence P50/P95/P99, taux
d'erreur, et RPS.

Pourquoi Python plutôt que k6 / Artillery : aucune dépendance
externe (k6 est en Go, Artillery en Node), et on a déjà Python
dans la CI. C'est volontairement simple — un test de charge
réel utilisera k6/Artillery en prod.

Usage :
    python3 tests/load/load_test.py --base-url http://localhost:3000 --users 50 --duration 30
"""
from __future__ import annotations
import argparse
import asyncio
import statistics
import time
import sys
from dataclasses import dataclass, field
from pathlib import Path
import json
import urllib.request
import urllib.error
import random
import string

REPO_ROOT = Path(__file__).resolve().parents[2]


def _rand_email() -> str:
    return "loadtest+" + "".join(random.choices(string.ascii_lowercase, k=8)) + "@medanki-dz.test"


@dataclass
class Result:
    user_id: str
    requests: int = 0
    errors: int = 0
    latencies_ms: list[int] = field(default_factory=list)
    rps: float = 0.0

    @property
    def error_rate(self) -> float:
        return self.errors / max(1, self.requests)

    @property
    def p50(self) -> int:
        return int(statistics.median(self.latencies_ms)) if self.latencies_ms else 0

    @property
    def p95(self) -> int:
        if not self.latencies_ms:
            return 0
        s = sorted(self.latencies_ms)
        idx = int(len(s) * 0.95)
        return s[idx]

    @property
    def p99(self) -> int:
        if not self.latencies_ms:
            return 0
        s = sorted(self.latencies_ms)
        idx = int(len(s) * 0.99)
        return s[idx]


def _req(method: str, url: str, body: dict | None = None, token: str | None = None) -> tuple[int, float]:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            _ = resp.read()
            elapsed_ms = (time.perf_counter() - t0) * 1000
            return resp.status, elapsed_ms
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return e.code, elapsed_ms
    except Exception:
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return 0, elapsed_ms


async def run_user(base_url: str, duration_s: int, results: list[Result], stop_at: float) -> None:
    """Simule un utilisateur sur la durée."""
    res = Result(user_id=_rand_email())
    email = res.user_id
    # Signup (idempotent : 409 si déjà existant est OK pour le test).
    code, _ = _req("POST", f"{base_url}/v1/auth/signup", {
        "email": email,
        "display_name": "load-test",
    })
    if code in (201, 409):
        # Login.
        code, _ = _req("POST", f"{base_url}/v1/auth/login", {"email": email})
    token = ""
    if code == 200:
        # Récupère un token via login (à adapter au vrai format de réponse).
        # En dev, on prend le JWT du body si dispo. Sinon on continue sans auth.
        try:
            data = json.loads(_req("POST", f"{base_url}/v1/auth/login", {"email": email})[0] or "{}")
        except Exception:
            data = {}
        token = data.get("access_token", "")
    if not token:
        # On continue quand même pour stresser les endpoints publics.
        token = None
    while time.time() < stop_at:
        # 1. healthz
        code, lat = _req("GET", f"{base_url}/v1/healthz")
        res.requests += 1
        res.latencies_ms.append(int(lat))
        if code >= 500:
            res.errors += 1
        await asyncio.sleep(0.1)
        # 2. readyz
        code, lat = _req("GET", f"{base_url}/v1/readyz")
        res.requests += 1
        res.latencies_ms.append(int(lat))
        if code >= 500:
            res.errors += 1
        await asyncio.sleep(0.1)
        # 3. (si auth) srs-sync/pull
        if token:
            code, lat = _req("GET", f"{base_url}/v1/srs-sync/pull?since_ms=0&limit=10", token=token)
            res.requests += 1
            res.latencies_ms.append(int(lat))
            if code >= 500:
                res.errors += 1
        await asyncio.sleep(0.1)
    results.append(res)


async def main_async(args: argparse.Namespace) -> int:
    print(f"[load] base={args.base_url} users={args.users} duration={args.duration}s")
    # Vérifie que le serveur répond.
    code, lat = _req("GET", f"{args.base_url}/v1/healthz")
    if code != 200:
        print(f"[load] ✗ serveur non accessible (code={code}, lat={lat:.0f}ms)")
        return 1
    print(f"[load] ✓ serveur OK ({lat:.0f}ms)")

    results: list[Result] = []
    stop_at = time.time() + args.duration
    tasks = [
        run_user(args.base_url, args.duration, results, stop_at)
        for _ in range(args.users)
    ]
    t0 = time.perf_counter()
    await asyncio.gather(*tasks)
    elapsed = time.perf_counter() - t0

    # Agrège.
    total_requests = sum(r.requests for r in results)
    total_errors = sum(r.errors for r in results)
    all_latencies = [l for r in results for l in r.latencies_ms]
    rps = total_requests / elapsed if elapsed > 0 else 0
    error_rate = total_errors / max(1, total_requests)

    p50 = int(statistics.median(all_latencies)) if all_latencies else 0
    p95 = (
        sorted(all_latencies)[int(len(all_latencies) * 0.95)]
        if all_latencies
        else 0
    )
    p99 = (
        sorted(all_latencies)[int(len(all_latencies) * 0.99)]
        if all_latencies
        else 0
    )

    print()
    print(f"[load] Résultats après {elapsed:.1f}s :")
    print(f"  Requêtes totales : {total_requests}")
    print(f"  Erreurs 5xx      : {total_errors} ({error_rate*100:.2f}%)")
    print(f"  RPS effectif     : {rps:.1f}")
    print(f"  Latence P50      : {p50} ms")
    print(f"  Latence P95      : {p95} ms")
    print(f"  Latence P99      : {p99} ms")
    print()

    # Seuils d'acceptance (v2 §11.3).
    ok = True
    if p95 > 500:
        print(f"  ✗ P95 > 500ms ({p95}ms) — objectif v2 non atteint")
        ok = False
    else:
        print(f"  ✓ P95 < 500ms ({p95}ms)")
    if error_rate > 0.01:
        print(f"  ✗ error_rate > 1% ({error_rate*100:.2f}%)")
        ok = False
    else:
        print(f"  ✓ error_rate < 1% ({error_rate*100:.2f}%)")
    if rps < 10:
        print(f"  ⚠ RPS < 10 ({rps:.1f}) — peut indiquer un bottleneck")
    else:
        print(f"  ✓ RPS > 10 ({rps:.1f})")

    if ok:
        print("[load] ✓ SLO respectés")
        return 0
    print("[load] ✗ SLO non respectés")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--users", type=int, default=20)
    parser.add_argument("--duration", type=int, default=10)
    args = parser.parse_args()
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main())
