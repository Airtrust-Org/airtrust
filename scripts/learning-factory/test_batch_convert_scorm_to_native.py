"""Nested AirTrust SCORM batch conversion tests use synthetic images/questions only."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from batch_convert_scorm_to_native import batch_convert_scorm, NativeBatchError
from test_compile_native_draft import fixture
from test_normalize_scorm_model import make_zip, sgso_model, residuos_model


def make_bundle(root: Path, include_bad=False) -> Path:
    normal = root / 'normal.zip'
    sgso = root / 'sgso.zip'
    residuos = root / 'residuos.zip'
    fixture(normal)
    make_zip(sgso, sgso_model())
    make_zip(residuos, residuos_model())
    bundle = root / 'batch.zip'
    with ZipFile(bundle, 'w') as outer:
        for source in (normal, sgso, residuos):
            outer.writestr('SMS/' + source.name, source.read_bytes())
        if include_bad:
            outer.writestr('SMS/bad.zip', b'NOT_A_ZIP')
        outer.writestr('__MACOSX/SMS/._normal.zip', b'MAC_METADATA')
        outer.writestr('SMS/._sgso.zip', b'MAC_METADATA')
    return bundle


class NativeBatchTests(unittest.TestCase):
    def test_batch_prepares_all_three_private_review_candidates_with_gates(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            bundle = make_bundle(root)
            before = bundle.read_bytes()
            report = batch_convert_scorm(bundle, root/'private')
            self.assertEqual(report['totalPackages'], 3)
            self.assertEqual(report['candidatesForReview'], 3)
            self.assertEqual(report['blockedPackages'], 0)
            self.assertFalse(report['publicationPerformed'])
            self.assertFalse(report['remoteUploadPerformed'])
            self.assertFalse(report['allPublishable'])
            self.assertEqual(bundle.read_bytes(), before)
            with Path(root/'private/batch-conversion-review.json').open() as stream:
                stored = json.load(stream)
            self.assertEqual(stored, report)
            self.assertEqual(
                [course['specializedAdapter'] for course in report['courses']],
                [None, 'SGSO_MODEL_V1', 'RESIDUOS_MODEL_V1'],
            )
            for name in ('normal', 'sgso', 'residuos'):
                candidate = json.loads(
                    (root/'private'/name/'candidate/native-private-candidate.json').read_text()
                )
                self.assertEqual(candidate['schema'], 'AIRTRUST_NATIVE_COURSE_V1')
                self.assertTrue(candidate['questions'])
                self.assertFalse(
                    json.loads((root/'private'/name/'candidate/conversion-review.json').read_text()
                    )['publishable']
                )
                self.assertTrue((root/'private'/name/'draft/native-import-draft.json').is_file())
            self.assertEqual(
                report['courses'][-1]['adapterReview']['missingPedagogicalFeedback'], 1,
            )
            self.assertNotIn('correctOptionId', json.dumps(report))
            self.assertNotIn('feedbackCorrect', json.dumps(report))
            if os.name == 'posix':
                self.assertEqual((root/'private').stat().st_mode & 0o777, 0o700)

    def test_bad_nested_course_is_isolated_without_partial_candidate(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            report = batch_convert_scorm(make_bundle(root, include_bad=True), root/'out')
            self.assertEqual(report['totalPackages'], 4)
            self.assertEqual(report['candidatesForReview'], 3)
            self.assertEqual(report['blockedPackages'], 1)
            self.assertFalse((root/'out/bad').exists())
            self.assertTrue((root/'out/normal/candidate/native-private-candidate.json').is_file())

    def test_never_overwrites_existing_private_conversion(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            bundle = make_bundle(root)
            (root/'private').mkdir()
            marker = root/'private/existing-private-work'
            marker.write_text('PRESERVE')
            with self.assertRaisesRegex(NativeBatchError, 'BATCH_OUTPUT_ALREADY_EXISTS'):
                batch_convert_scorm(bundle, root/'private')
            self.assertEqual(marker.read_text(), 'PRESERVE')

    def test_rejects_zip_traversal_before_creating_any_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            bundle = root/'bad.zip'
            with ZipFile(bundle, 'w') as f:
                f.writestr('../bad.zip', b'not-data')
            with self.assertRaisesRegex(ValueError, 'UNSAFE_ZIP_PATH'):
                batch_convert_scorm(bundle, root/'out')
            self.assertFalse((root/'out').exists())

    def test_rejects_duplicate_subpackage_basename_in_different_folders(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            source = root/'source.zip'
            fixture(source)
            bundle = root/'duplicate.zip'
            with ZipFile(bundle, 'w') as f:
                f.writestr('A/source.zip', source.read_bytes())
                f.writestr('B/source.zip', source.read_bytes())
            with self.assertRaisesRegex(NativeBatchError, 'BATCH_UNSAFE_OR_DUPLICATE_COURSE'):
                batch_convert_scorm(bundle, root/'out')
            self.assertFalse((root/'out').exists())


if __name__ == '__main__':
    unittest.main()
