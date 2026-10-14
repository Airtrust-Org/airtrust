"""Pinned RC8.1 bridge: fail-closed synthetic and optional source-backed QA.

CI never needs private course media or answer keys. With the exact original
source archive supplied privately, the same tests verify the real runtime.
"""
import io
import os
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_player3_rc81_bridge_review import (
    RC81Unsupported,
    SOURCE_ZIP_SHA256,
    _host_origin,
    _replace_line,
    adapt_rc81_app,
    compile_rc81_review,
)


class Rc81BridgeTests(unittest.TestCase):
    def test_refuses_unpinned_app_even_with_spoofed_source_digest(self):
        with self.assertRaisesRegex(RC81Unsupported, 'RC81_SOURCE_NOT_PINNED'):
            adapt_rc81_app(b'function evaluate(){return true}', SOURCE_ZIP_SHA256,
                           'https://airtrust.online', 'a' * 64, [])

    def test_refuses_modified_or_unversioned_source_archive(self):
        with self.assertRaisesRegex(RC81Unsupported, 'RC81_SOURCE_ZIP_MISMATCH'):
            compile_rc81_review(b'not-original', 'https://airtrust.online', 'a' * 64)

    def test_parent_origin_must_be_explicit_https_origin(self):
        self.assertEqual(_host_origin('https://airtrust.online'), 'https://airtrust.online')
        for bad in ('http://airtrust.online', 'https://airtrust.online/path',
                    'https://name:password@airtrust.online', 'https://localhost',
                    'https://127.0.0.1', 'https://airtrust.online?a=1',
                    'https://airtrust.online/#anything', '*', 'null'):
            with self.subTest(bad=bad), self.assertRaises(RC81Unsupported):
                _host_origin(bad)

    def test_runtime_patch_requires_exactly_one_original_function(self):
        for source in ([], ['function evaluate(){return 1}',
                           'function evaluate(){return 2}']):
            with self.assertRaisesRegex(RC81Unsupported, 'PATCH_FUNCTION_MISSING'):
                _replace_line(source, 'evaluate', 'function evaluate(){}')

    def test_real_original_archive_opt_in_private_qa(self):
        raw_path = os.environ.get('AIRTRUST_PLAYER3_RC81_SOURCE_ZIP')
        if not raw_path:
            self.skipTest('Private RC8.1 original not mounted in CI; run with explicit source path')
        raw = Path(raw_path).read_bytes()
        import hashlib
        self.assertEqual(hashlib.sha256(raw).hexdigest(), SOURCE_ZIP_SHA256)
        with ZipFile(io.BytesIO(raw)) as source:
            self.assertIn('app.js', source.namelist())
        candidate, meta, projection, bank, receipt = compile_rc81_review(
            raw, 'https://airtrust.online', 'b' * 64)
        self.assertEqual(meta['stage_count'], 8)
        self.assertEqual(meta['question_count'], 80)
        self.assertEqual(len(projection['stages']), 8)
        self.assertEqual(len(bank['questions']), 80)
        self.assertFalse(receipt['publishable'])
        self.assertFalse(receipt['adapterHostBridgeImplemented'])
        with ZipFile(io.BytesIO(candidate)) as z:
            patched = z.read('app.js').decode('utf8')
            self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1', patched)
            self.assertIn('AIRTRUST_PLAYER3_STAGE_VERDICT_V1', patched)
            self.assertNotIn('Scorm?.finish?.()', patched)
            self.assertNotIn('window.__AIRTRUST_PLAYER_TEST__', patched)
            self.assertNotIn('LMSInitialize', z.read('scorm_api.js').decode())
            self.assertNotIn('LMSSetValue', z.read('scorm_api.js').decode())
            for forbidden in ('item.answer', 'qq.answer', 's.questions[i].answer', 'correctOptionId', 'scenarioCorrect'):
                self.assertNotIn(forbidden, patched)
            with ZipFile(io.BytesIO(raw)) as original:
                self.assertEqual(z.read('index.html'), original.read('index.html'))
                self.assertEqual(z.read('styles.css'), original.read('styles.css'))


if __name__ == '__main__':
    unittest.main()