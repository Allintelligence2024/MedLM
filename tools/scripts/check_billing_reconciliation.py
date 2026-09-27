#!/usr/bin/env python3
"""Render the real Helm chart and assert financial-job safety controls. Requires Helm + PyYAML."""
from pathlib import Path
import subprocess
import os
import sys
import traceback


def report_failure(kind, value, tb):
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        message = ''.join(traceback.format_exception(kind, value, tb))
        message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print(f'::error title=Billing reconciliation contract::{message}')
    sys.__excepthook__(kind, value, tb)


sys.excepthook = report_failure
import yaml  # Required dependency, pinned in tools/requirements.txt; never skip this check.


ROOT = Path(__file__).resolve().parents[2]
BASE = ['helm', 'template', 'test', str(ROOT / 'deploy/helm/medanki-backend'),
        '--set-string', 'secrets.databaseUrl=ci-unused', '--set-string', 'secrets.jwtSigningKey=ci-not-a-key']

def render(*settings, success=True):
    args = BASE + [arg for item in settings for arg in ('--set', item)]
    result = subprocess.run(args, capture_output=True, text=True)
    if not success:
        assert result.returncode != 0, 'unsafe configuration was accepted'
        return []
    assert result.returncode == 0, result.stderr
    return [doc for doc in yaml.safe_load_all(result.stdout) if doc]

def cron(docs):
    return [doc for doc in docs if doc['kind'] == 'CronJob']

assert not cron(render()), 'default chart must not create a financial job'
enabled = ('billingReconciliation.enabled=true', 'billingReconciliation.existingSecret=ci-existing-secret')
job, = cron(render(*enabled))
long_job, = cron(render(*enabled, 'fullnameOverride=' + 'a' * 63))
assert len(long_job['metadata']['name']) <= 52, 'CronJob name exceeds Kubernetes limit'
assert job['spec']['suspend'] is True
assert job['spec']['concurrencyPolicy'] == 'Forbid'
assert job['spec']['jobTemplate']['spec']['backoffLimit'] == 0
assert job['spec']['jobTemplate']['spec']['activeDeadlineSeconds'] == 600
pod = job['spec']['jobTemplate']['spec']['template']['spec']
assert pod['restartPolicy'] == 'Never'
assert pod['automountServiceAccountToken'] is False
container, = pod['containers']
assert container['command'] == ['node', 'dist/billing/reconcile.cli.js', '--apply']
assert container['envFrom'] == [{'secretRef': {'name': 'ci-existing-secret'}}]
assert container['securityContext']['readOnlyRootFilesystem'] is True
assert container['securityContext']['runAsNonRoot'] is True
render(*enabled, 'billingReconciliation.suspend=false', success=False)
render('billingReconciliation.enabled=true', success=False)
render(*enabled, 'billingReconciliation.environment=unknown', success=False)
job, = cron(render(*enabled, 'billingReconciliation.suspend=false',
                   'billingReconciliation.qualificationApproved=true',
                   'billingReconciliation.environment=production'))
container, = job['spec']['jobTemplate']['spec']['template']['spec']['containers']
env = {item['name']: item['value'] for item in container['env']}
assert env['CHARGILY_ENV'] == env['NODE_ENV'] == 'production'
assert env['CHARGILY_DRY_RUN'] == 'false'
assert env['BILLING_RECONCILE_MIN_AGE_MINUTES'] == '35'
print('PASS: default off; suspended opt-in; approval gate; secret reference; bounded execution; production mode')
