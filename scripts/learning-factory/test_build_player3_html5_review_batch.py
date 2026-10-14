"""Player3 batch converter: synthetic test fixtures, no real copyrighted courses."""
import io
import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from build_player3_html5_review_batch import batch_review, KNOWN_SOURCES_BY_SHA
from convert_preserved_html5 import UnsafePackage
from test_prepare_player3_learner_review import original, model

def bundle(files):
    out = io.BytesIO()
    with ZipFile(out, 'w') as z:
        for name, raw in files.items():
            z.writestr(name, raw)
    return out.getvalue()

class Player3BatchReviewTests(unittest.TestCase):
    def test_uses_existing_extractor_and_creates_private_non_publishable_editions(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            second = model()
            second['courseId'] = 'course-2'
            source = root/'source.zip'
            source.write_bytes(bundle({'courses/rc8.1.zip': original(),
                                       'courses/second.zip': original(second)}))
            private, learner = root/'private', root/'learner'
            summary = batch_review([source], private, learner)
            self.assertEqual(summary['editions'], 2)
            self.assertFalse(summary['allCoursesPublishable'])
            self.assertEqual(len(list(private.glob('edition-*/**/*server-only-bank.json'))), 2)
            self.assertEqual(len(list(learner.glob('edition-*/*.zip'))), 2)
            self.assertFalse(list(learner.rglob('*server-only-bank.json')))
            self.assertNotIn('PRIVATE_KEY_SENTINEL_123',
                             json.dumps(summary, ensure_ascii=False))
            self.assertTrue((private/'batch-private-review.json').is_file())


    def test_22_renamed_uploaded_archives_are_matched_by_content_digest(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            batches = []
            digests = {}
            for batch_name, prefix, count in (
                ('SMS(6).zip', 'sms', 9),
                ('Segurança Operacional(3).zip', 'operacional', 13),
            ):
                editions = {}
                for i in range(count):
                    m = model()
                    m['courseId'] = f'{prefix}-{i}'
                    editions[f'{prefix}/course-{i}.zip'] = original(m)
                path = root/batch_name
                path.write_bytes(bundle(editions))
                digests[hashlib.sha256(path.read_bytes()).hexdigest()] = (prefix, count)
                batches.append(path)
            # Synthetic digest table verifies the filename-independent contract;
            # production digests remain permanently pinned in the implementation.
            with patch.dict(KNOWN_SOURCES_BY_SHA, digests, clear=True):
                result = batch_review(batches, root/'private', root/'learner')
            self.assertEqual(result['editions'], 22)
            self.assertFalse(result['allCoursesPublishable'])
            self.assertEqual(len(list((root/'learner').glob('edition-*/*.zip'))), 22)
            self.assertEqual(len(list((root/'private').glob(
                'edition-*/*server-only-bank.json'))), 22)

    def test_preflight_failure_does_not_write_any_artifact(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            invalid = root/'source.zip'
            invalid.write_bytes(bundle({'good.zip': original(), 'bad.zip': b'not-a-zip'}))
            private, learner = root/'private', root/'learner'
            with self.assertRaises(Exception):
                batch_review([invalid], private, learner)
            self.assertFalse(private.exists())
            self.assertFalse(learner.exists())


    def test_appledouble_metadata_is_skipped_but_traversal_is_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            first = root / 'safe.zip'
            first.write_bytes(bundle({'course.zip': original(),
                                      '__MACOSX/._course.zip': b'ignored'}))
            result = batch_review([first], root/'private', root/'learner')
            self.assertEqual(result['editions'], 1)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            unsafe = root / 'unsafe.zip'
            unsafe.write_bytes(bundle({'course.zip': original(),
                                       '__MACOSX/../../escape.zip': b'unsafe'}))
            with self.assertRaisesRegex(UnsafePackage, 'UNSAFE_APPLEDOUBLE'):
                batch_review([unsafe], root/'private', root/'learner')
            self.assertFalse((root/'learner').exists())

    def test_rejects_duplicate_source_edition(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root/'batch.zip'
            same = original()
            source.write_bytes(bundle({'one.zip': same, 'two.zip': same}))
            with self.assertRaisesRegex(UnsafePackage, 'DUPLICATE_SOURCE_EDITION'):
                batch_review([source], root/'private', root/'learner')

    def test_rejects_mismatched_named_original_before_any_output(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            spoof = root/'SMS(5).zip'
            spoof.write_bytes(bundle({'one.zip': original()}))
            with self.assertRaisesRegex(UnsafePackage, 'ORIGINAL_ARCHIVE_SHA_MISMATCH'):
                batch_review([spoof], root/'private', root/'learner')
            self.assertFalse((root/'private').exists())

if __name__ == '__main__':
    unittest.main()
