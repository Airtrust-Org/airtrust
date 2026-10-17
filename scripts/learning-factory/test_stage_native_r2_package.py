"""Offline-only Native R2 stage tests use synthetic content, never employee data."""
from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from compile_native_draft import compile_candidate
from convert_scorm_to_native import extract_draft
from stage_native_r2_package import NativeStageError, stage_native_package
from test_compile_native_draft import fixture


class NativeStageTests(unittest.TestCase):
    def prepare(self, root: Path):
        source = root / 'synthetic.zip'
        fixture(source)
        draft_dir = root / 'draft'
        extract_draft(source, draft_dir)
        draft = json.loads((draft_dir / 'native-import-draft.json').read_text())
        candidate, report = compile_candidate(draft, draft_dir)
        candidate_dir = root / 'candidate'
        candidate_dir.mkdir()
        (candidate_dir / 'native-private-candidate.json').write_text(
            json.dumps(candidate, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        (candidate_dir / 'conversion-review.json').write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        return draft_dir, candidate_dir, candidate, report

    def test_exact_runtime_r2_prefix_and_private_artifact_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, course, report = self.prepare(root)
            result = stage_native_package(candidate_dir, draft, root / 'out', 6, 31)
            prefix = f"lms/native/6/31/{report['artifactBytesSha256']}/"
            self.assertEqual(result['r2Prefix'], prefix)
            self.assertEqual(len(result['files']), 2)
            self.assertFalse(result['publishable'])
            self.assertFalse(result['remoteUploadPerformed'])
            self.assertEqual(result['files'][0]['r2Key'], prefix + 'native-private-candidate.json')
            self.assertEqual(result['files'][1]['r2Key'], prefix + 'media/hero.webp')
            original = (candidate_dir / 'native-private-candidate.json').read_bytes()
            copied = (root / 'out' / prefix / 'native-private-candidate.json').read_bytes()
            self.assertEqual(original, copied)
            self.assertEqual(hashlib.sha256(copied).hexdigest(), report['artifactBytesSha256'])
            self.assertEqual(
                (root / 'out' / prefix / 'media/hero.webp').read_bytes(), b'RIFF-WEBP-MOCK'
            )
            self.assertEqual(
                json.loads((root / 'out/private-publication-review.json').read_text())['status'],
                'REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW',
            )
            self.assertIn('correctOptionId', copied.decode('utf-8'))  # stays PRIVATE only

    def test_blocks_existing_output_and_never_overwrites_work(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, _ = self.prepare(root)
            out = root / 'out'
            out.mkdir()
            sentinel = out / 'unknown-work.txt'
            sentinel.write_text('KEEP')
            with self.assertRaisesRegex(NativeStageError, 'STAGE_DESTINATION_EXISTS'):
                stage_native_package(candidate_dir, draft, out, 6, 31)
            self.assertEqual(sentinel.read_text(), 'KEEP')

    def test_refuses_candidate_json_tampering_without_creating_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, _ = self.prepare(root)
            source = candidate_dir / 'native-private-candidate.json'
            source.write_bytes(source.read_bytes() + b' ')
            with self.assertRaisesRegex(NativeStageError, 'STAGE_ARTIFACT_DIGEST_MISMATCH'):
                stage_native_package(candidate_dir, draft, root / 'out', 6, 31)
            self.assertFalse((root / 'out').exists())

    def test_refuses_asset_tampering_without_creating_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, _ = self.prepare(root)
            (draft / 'media/media/hero.webp').write_bytes(b'EVIL')
            with self.assertRaisesRegex(NativeStageError, 'STAGE_MEDIA_DIGEST_MISMATCH'):
                stage_native_package(candidate_dir, draft, root / 'out', 6, 31)
            self.assertFalse((root / 'out').exists())

    def test_refuses_symlinked_media_even_if_bytes_match(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, _ = self.prepare(root)
            asset = draft / 'media/media/hero.webp'
            original = asset.read_bytes()
            asset.unlink()
            external = root / 'external.webp'
            external.write_bytes(original)
            asset.symlink_to(external)
            with self.assertRaisesRegex(NativeStageError, 'SYMLINK_SOURCE_NOT_ALLOWED'):
                stage_native_package(candidate_dir, draft, root / 'out', 6, 31)

    def test_refuses_traversal_and_unlisted_mime(self):
        for path, mime, expected in [
            ('media/../../secret.webp', 'image/webp', 'UNSAFE_STAGE_PATH'),
            ('../secret.webp', 'image/webp', 'INVALID_STAGE_ASSET_PATH'),
            ('media/hero.webp', 'application/javascript', 'STAGE_MIME_CONFLICT'),
        ]:
            with self.subTest(path=path), tempfile.TemporaryDirectory() as d:
                root = Path(d)
                draft, candidate_dir, _, report = self.prepare(root)
                candidate = json.loads((candidate_dir / 'native-private-candidate.json').read_text())
                candidate['assets'][0]['path'] = path
                candidate['assets'][0]['mime'] = mime
                new_bytes = (json.dumps(candidate, ensure_ascii=False, indent=2)+'\n').encode()
                (candidate_dir/'native-private-candidate.json').write_bytes(new_bytes)
                report['artifactBytesSha256'] = hashlib.sha256(new_bytes).hexdigest()
                (candidate_dir/'conversion-review.json').write_text(json.dumps(report))
                with self.assertRaisesRegex(NativeStageError, expected):
                    stage_native_package(candidate_dir, draft, root / 'out', 6, 31)

    def test_refuses_unreviewed_or_forged_publishable_report(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, report = self.prepare(root)
            report['publishable'] = True
            (candidate_dir/'conversion-review.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(NativeStageError, 'INVALID_STAGE_REVIEW_STATUS'):
                stage_native_package(candidate_dir, draft, root / 'out', 6, 31)

    def test_refuses_invalid_tenant_course_identity(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, candidate_dir, _, _ = self.prepare(root)
            for company, course in [(0, 31), (6, -1), ('6', 31), (True, 31)]:
                with self.subTest(company=company, course=course):
                    with self.assertRaisesRegex(NativeStageError, 'INVALID_TENANT_OR_COURSE_ID'):
                        stage_native_package(candidate_dir, draft, root / 'out', company, course)
            self.assertFalse((root / 'out').exists())


if __name__ == '__main__':
    unittest.main()
