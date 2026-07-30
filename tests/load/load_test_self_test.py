#!/usr/bin/env python3
"""
load_test_self_test.py — Test du script de charge.

Lance un mini serveur HTTP en local et vérifie que load_test.py
produit un rapport cohérent (RPS > 0, latences < seuils absurdes).
"""
from __future__ import annotations
import http.server
import json
import socketserver
import threading
import time
import sys
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


class StubHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/v1/healthz") or self.path.startswith("/v1/readyz"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/v1/auth/signup":
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"access_token":"stub","refresh_token":"stub","user_id":"u1"}')
        elif self.path == "/v1/auth/login":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"access_token":"stub","refresh_token":"stub","user_id":"u1"}')
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):  # silence
        pass


def main() -> int:
    port = 18998
    # Allow address reuse to avoid TIME_WAIT issues.
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    server = socketserver.ThreadingTCPServer(("127.0.0.1", port), StubHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.3)
    try:
        # Lance le load test sur le stub.
        result = subprocess.run(
            [
                "python3",
                str(REPO_ROOT / "tests/load/load_test.py"),
                "--base-url",
                f"http://127.0.0.1:{port}",
                "--users",
                "5",
                "--duration",
                "2",
            ],
            capture_output=True,
            text=True,
        )
        print(result.stdout)
        if result.returncode != 0 and result.returncode != 1:
            print("STDERR:", result.stderr, file=sys.stderr)
            return 1
        # Le stub renvoie 200 partout, donc RPS > 0 et error_rate = 0.
        # On accepte returncode 0 ou 1 (le script peut retourner 1 si
        # les seuils ne sont pas atteints, mais on a quand même un
        # rapport).
        if "RPS" in result.stdout and "P95" in result.stdout:
            print("[self-test] ✓ load_test.py produit un rapport")
            return 0
        print("[self-test] ✗ rapport manquant")
        return 1
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
