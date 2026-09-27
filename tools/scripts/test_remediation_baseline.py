"""Unit tests for baseline bookkeeping, not application security."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from remediation_baseline import ROOT, classify, run_check


class BaselineTests(unittest.TestCase):
    def test_normal_exit_status(self):
        self.assertEqual(classify(0), 'PASS')
        self.assertEqual(classify(1), 'FAIL')

    def test_audit_findings_are_collected_not_hidden(self):
        payload = json.dumps({'metadata': {'vulnerabilities': {'high': 3}}})
        self.assertEqual(classify(1, True, payload), 'PASS')
        self.assertEqual(classify(2, True, payload), 'FAIL')

    def test_audit_network_failure_is_not_success(self):
        self.assertEqual(classify(1, True, '{"error":{"code":"ENET"}}'), 'FAIL')
        self.assertEqual(classify(0, True, 'not json'), 'FAIL')
        self.assertEqual(classify(0, True, '[]'), 'FAIL')

    def test_missing_dependency_blocks_execution(self):
        with tempfile.TemporaryDirectory() as tmp, patch('remediation_baseline.subprocess.run') as run:
            result = run_check('yaml', ['python', 'checker'], ROOT, Path(tmp), ['PyYAML missing'])
            self.assertEqual(result['status'], 'BLOCKED')
            run.assert_not_called()
            self.assertIn('PyYAML missing', (Path(tmp) / 'yaml.log').read_text())

    def test_failed_command_is_recorded(self):
        with tempfile.TemporaryDirectory() as tmp, patch('remediation_baseline.subprocess.run') as run:
            run.return_value = subprocess.CompletedProcess(['test'], 1, 'out', 'err')
            result = run_check('test', ['test'], ROOT, Path(tmp), [])
            self.assertEqual(result['status'], 'FAIL')
            self.assertEqual((Path(tmp) / 'test.log').read_text(), 'outerr')

    def test_timeout_is_recorded(self):
        with tempfile.TemporaryDirectory() as tmp, patch('remediation_baseline.subprocess.run') as run:
            run.side_effect = subprocess.TimeoutExpired(['test'], 1)
            self.assertEqual(run_check('test', ['test'], ROOT, Path(tmp), [])['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
