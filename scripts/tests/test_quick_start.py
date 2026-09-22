"""Launcher contracts with a fake Docker CLI; no services or host configuration changed."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class QuickStartTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'docker').mkdir()
        (self.root / 'bin').mkdir()
        shutil.copy(ROOT / 'quick-start.sh', self.root / 'quick-start.sh')
        fake = self.root / 'bin/docker'
        fake.write_text('''#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$*" == 'compose version --short' ]]; then echo "${TEST_COMPOSE_VERSION:-2.24.4}"; exit 0; fi
if [[ "$1" == info ]]; then exit "${TEST_DOCKER_FAILURE:-0}"; fi
if [[ "$*" == *'up --build'* ]]; then
  [[ -z "${PG_PASSWORD:-}" && -z "${REDIS_URL:-}" ]] || exit 90
  exit "${TEST_START_FAILURE:-0}"
fi
exit 0
''')
        fake.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.root / 'bin') + ':' + os.environ['PATH'],
                        DOCKER_CALLS=str(self.root / 'calls'))

    def run_script(self, *args):
        return subprocess.run(['bash', str(self.root / 'quick-start.sh'), *args],
                              env=self.env, text=True, capture_output=True)

    def test_check_is_read_only(self):
        result = self.run_script('--check')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.root / 'docker/quickstart.env').exists())
        self.assertNotIn('up --build', (self.root / 'calls').read_text())

    def test_start_preserves_credentials_and_isolates_deployment_environment(self):
        self.env.update(PG_PASSWORD='deployment-password', REDIS_URL='redis://deployment')
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        credentials = self.root / 'docker/quickstart.env'
        original = credentials.read_bytes()
        self.assertEqual(credentials.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.run_script('--yes').returncode, 0)
        self.assertEqual(credentials.read_bytes(), original)
        calls = (self.root / 'calls').read_text()
        self.assertIn('--project-name vaultysclaw-quickstart', calls)
        self.assertIn('up --build -d --wait --wait-timeout 300', calls)
        self.assertIn('http://localhost:3010/login', result.stdout)

    def test_failed_start_never_reports_ready(self):
        self.env['TEST_START_FAILURE'] = '1'
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('Ready:', result.stdout)
        self.assertIn('--logs', result.stderr)

    def test_old_compose_and_unreachable_docker_fail_before_writing(self):
        for overrides in ({'TEST_COMPOSE_VERSION': '2.24.3'}, {'TEST_DOCKER_FAILURE': '1'}):
            with self.subTest(overrides=overrides):
                original = self.env.copy()
                self.env.update(overrides)
                self.assertNotEqual(self.run_script().returncode, 0)
                self.assertFalse((self.root / 'docker/quickstart.env').exists())
                self.env = original

    def test_stop_keeps_volumes(self):
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(self.run_script('--down').returncode, 0)
        last = (self.root / 'calls').read_text().splitlines()[-1]
        self.assertTrue(last.endswith(' down'))
        self.assertNotIn('down -v', last)

    def test_invalid_existing_credentials_are_preserved(self):
        credentials = self.root / 'docker/quickstart.env'
        credentials.write_text('PG_PASSWORD=short\n')
        self.assertNotEqual(self.run_script().returncode, 0)
        self.assertEqual(credentials.read_text(), 'PG_PASSWORD=short\n')

    def test_help_and_unknown_options_do_not_call_docker(self):
        self.assertEqual(self.run_script('--help').returncode, 0)
        self.assertEqual(self.run_script('--unknown').returncode, 2)
        self.assertFalse((self.root / 'calls').exists())


if __name__ == '__main__':
    unittest.main()
