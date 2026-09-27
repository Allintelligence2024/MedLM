#!/usr/bin/env python3
"""Collect a diagnostic baseline, NOT a release approval. No implicit installs/skips."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def fingerprint() -> dict:
    paths = subprocess.check_output(
        ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard',
         '--', 'backend', 'cms', 'mobile', 'tools', '.github'], cwd=ROOT,
    ).decode().split('\0')
    files = {}
    for name in sorted(set(filter(None, paths))):
        path = ROOT / name
        if path.is_file():
            files[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    digest = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return {'sha256': digest, 'files': files}


def classify(returncode: int, audit: bool = False, payload: str = '') -> str:
    if audit:
        try:
            result = json.loads(payload)
            if returncode in (0, 1) and not result.get('error') and isinstance(
                result.get('metadata', {}).get('vulnerabilities'), dict
            ):
                return 'PASS'  # Collection passed; vulnerabilities stay open.
        except (ValueError, AttributeError, TypeError):
            pass
        return 'FAIL'
    return 'PASS' if returncode == 0 else 'FAIL'


def run_check(name: str, argv: list[str], cwd: Path, output: Path,
              missing: list[str], audit: bool = False, timeout: int = 240) -> dict:
    record = {'id': name, 'command': argv, 'cwd': str(cwd.relative_to(ROOT)),
              'log': name + ('.json' if audit else '.log')}
    if missing:
        record.update(status='BLOCKED', reason='; '.join(missing))
        (output / record['log']).write_text(record['reason'] + '\n')
        return record
    try:
        result = subprocess.run(argv, cwd=cwd, capture_output=True, text=True,
                                timeout=timeout, env={**os.environ, 'NO_COLOR': '1',
                                                      'NEXT_TELEMETRY_DISABLED': '1'})
        text = result.stdout if audit else result.stdout + result.stderr
        (output / record['log']).write_text(text)
        if audit and result.stderr:
            (output / (name + '.stderr.log')).write_text(result.stderr)
        record.update(returncode=result.returncode,
                      status=classify(result.returncode, audit, result.stdout))
        if audit and record['status'] == 'PASS':
            record['vulnerabilities'] = json.loads(result.stdout)['metadata']['vulnerabilities']
            record['meaning'] = 'Audit collected; NOT an acceptance of vulnerabilities.'
    except (OSError, subprocess.TimeoutExpired) as exc:
        record.update(status='FAIL', reason=str(exc))
        (output / record['log']).write_text(str(exc) + '\n')
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.cache/remediation/phase0')
    parser.add_argument('--include-historical-reproductions', action='store_true',
                        help='Only on the phase-0 source snapshot: asserts that old bugs still exist')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    # Avoid mixing a failed/interrupted new run with an old successful result.
    (output / 'summary.json').unlink(missing_ok=True)
    npm_missing = [] if shutil.which('npm') else ['npm unavailable']
    node_missing = [] if shutil.which('node') else ['node unavailable']
    backend_missing = npm_missing + ([] if (ROOT / 'backend/node_modules/.bin/vitest').exists()
                                    else ['run npm ci in backend'])
    cms_missing = npm_missing + ([] if (ROOT / 'cms/node_modules/.bin/next').exists()
                                else ['run npm ci in cms'])
    yaml_missing = [] if importlib.util.find_spec('yaml') else ['PyYAML unavailable; checker would skip']
    before = fingerprint()
    summary = {'schema_version': 1, 'started_at': datetime.now(timezone.utc).isoformat(),
               'commit': git('rev-parse', 'HEAD'), 'branch': git('branch', '--show-current'),
               'working_tree_status': git('status', '--short'), 'source_before': before,
               'python_version': sys.version, 'release_decision': 'NO_GO',
               'meaning': 'Phase 0 diagnostic collection, not release qualification.',
               'not_run': ['Flutter SDK/build/device', 'PostgreSQL 16 server',
                           'Docker/Kubernetes deployment', 'Chargily/FCM/APNs live providers',
                           'clinical validation', 'production data and backups'], 'checks': []}
    jobs = []
    for executable in ('node', 'npm'):
        jobs.append((executable + '-version', [executable, '--version'], ROOT,
                     node_missing if executable == 'node' else npm_missing, False))
    for task in ('typecheck', 'lint', 'test', 'test:integration', 'build'):
        jobs.append(('backend-' + task.replace(':', '-'), ['npm', 'run', task],
                     ROOT / 'backend', backend_missing, False))
    jobs.append(('cms-build', ['npm', 'run', 'build'], ROOT / 'cms', cms_missing, False))
    for name in ('check_workflows', 'check_dockerfiles', 'check_migrations_apply',
                 'check_dart_static', 'security_audit', 'check_mobile_i18n'):
        jobs.append((name, [sys.executable, 'tools/scripts/' + name + '.py'], ROOT,
                     yaml_missing if name in ('check_workflows', 'check_dockerfiles') else [], False))
    for project, omit in (('backend', False), ('backend', True), ('cms', False)):
        jobs.append((project + '-audit' + ('-runtime' if omit else ''),
                     ['npm', 'audit', '--json'] + (['--omit=dev'] if omit else []),
                     ROOT / project, npm_missing, True))
    proofs = ROOT / 'docs/reviews/2026-09-26/evidence'
    # Historical evidence remains immutable. Do not require fixed bugs to persist.
    if args.include_historical_reproductions:
        jobs.append(('known-defects-reproduction', ['node', str(proofs / 'reproduce.cjs')],
                     ROOT, node_missing + backend_missing, False))
    jobs.append(('batch-totp-calculation', ['node', str(proofs / 'check-batch-totp.cjs')],
                 ROOT, node_missing, False))
    for name, argv, cwd, missing, audit in jobs:
        # Don't use a stale compiled artifact if the fresh build failed.
        if name == 'known-defects-reproduction' and not any(
            c['id'] == 'backend-build' and c['status'] == 'PASS' for c in summary['checks']
        ):
            missing = [*missing, 'fresh backend build did not pass']
        record = run_check(name, argv, cwd, output, missing, audit)
        summary['checks'].append(record)
        print(f"{record['status']:7} {name}", flush=True)
    after = fingerprint()
    summary['source_after_sha256'] = after['sha256']
    summary['source_changed_during_run'] = before['sha256'] != after['sha256']
    ok = all(c['status'] == 'PASS' for c in summary['checks']) and not summary['source_changed_during_run']
    summary['collection_status'] = 'PASS' if ok else 'INCOMPLETE_OR_FAILED'
    summary['finished_at'] = datetime.now(timezone.utc).isoformat()
    (output / 'summary.json').write_text(json.dumps(summary, indent=2, ensure_ascii=False) + '\n')
    print(f"Collection: {summary['collection_status']}; release: NO_GO; results: {output}")
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
