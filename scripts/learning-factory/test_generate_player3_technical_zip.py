"""Fail-closed, offline tests for the no-course-data technical fixture."""
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

MODULE = Path(__file__).with_name('generate_player3_technical_zip.py')
spec = importlib.util.spec_from_file_location('fixture_generator', MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TechnicalPackageTest(unittest.TestCase):
    def test_deterministic_zip_and_private_policy_separated(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / 'one', Path(tmp) / 'two'
            args = ('https://qa-player.airtrust.example', 'a' * 64)
            first, second = module.build(a, *args), module.build(b, *args)
            self.assertEqual(first, second)
            self.assertEqual((a / 'player3-technical-only.zip').read_bytes(),
                             (b / 'player3-technical-only.zip').read_bytes())
            self.assertEqual(first['unitCount'], 5)
            self.assertEqual(first['stageCount'], 1)
            units = module.units()
            self.assertEqual([u['kind'] for u in units],
                             ['lesson', 'lesson', 'lesson', 'lesson', 'assessment'])
            self.assertEqual(units[-1]['official']['stageId'], 'qa-stage-1')
            self.assertIn('practice', units[0])
            self.assertFalse(first['remoteWrites'])
            with ZipFile(a / 'player3-technical-only.zip') as z:
                self.assertEqual(z.namelist(), ['app.js', 'index.html'])
                js = z.read('app.js').decode()
                self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1', js)
                self.assertIn('b.onclick=()=>{practiced=true;next.disabled=false;', js)
                self.assertNotIn('if(i===1){practiced=true;', js)
                self.assertIn('AIRTRUST_PLAYER3_RESUME_ACK_V1', js)
                self.assertIn('AIRTRUST_PLAYER3_CONTENT_END_HINT_V1', js)
                self.assertIn("event.source!==window.parent", js)
                self.assertNotIn('privateSyntheticAnswerKeys', js)
                self.assertNotIn('qualificacao_historico_id', js)
                self.assertNotIn('certificate_id', js)
                self.assertNotIn('LMSSetValue', js)
                app = a / 'generated-app.js'
                app.write_text(js)
                self.assertEqual(subprocess.run(['node', '--check', str(app)],
                              text=True, capture_output=True).returncode, 0)
            profile = json.loads((a / 'PRIVATE-qa-profile-fragment.json').read_text())
            self.assertEqual(profile['sourceZipSha256'], first['sourceZipSha256'])
            self.assertEqual(profile['privateSyntheticAnswerKeys']['qa-stage-1']['qa-stage-1-q1'], 'o1')
            self.assertEqual((a / 'PRIVATE-qa-profile-fragment.json').stat().st_mode & 0o777, 0o600)
            self.assertEqual(hashlib.sha256((a / 'player3-technical-only.zip').read_bytes()).hexdigest(), first['sourceZipSha256'])

    def test_refuses_production_and_unpinned_inputs_without_creating_files(self):
        for url in ('https://airtrust.online', 'https://qa.airtrust.online',
                    'http://qa.test.example', 'https://qa.test.example/path',
                    'https://qa.test.example?token=secret', 'https://localhost'):
            with self.subTest(url=url), tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / 'output'
                with self.assertRaisesRegex(module.TechnicalFixtureError, 'STAGING_ORIGIN'):
                    module.build(out, url, 'a' * 64)
                self.assertFalse(out.exists())
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'output'
            with self.assertRaisesRegex(module.TechnicalFixtureError, 'EDITION_SHA'):
                module.build(out, 'https://qa.test.example', 'bad')
            self.assertFalse(out.exists())

    def test_never_overwrites_existing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'output'
            out.mkdir()
            sentinel = out / 'keep'; sentinel.write_text('unmodified')
            with self.assertRaisesRegex(module.TechnicalFixtureError, 'OUTPUT_ALREADY_EXISTS'):
                module.build(out, 'https://qa.test.example', 'a' * 64)
            self.assertEqual(sentinel.read_text(), 'unmodified')


if __name__ == '__main__':
    unittest.main()
