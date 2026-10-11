"""Conversion tests use synthetic fixtures only; never include private course content."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert_scorm_to_native import extract_draft
from compile_native_draft import NativeCompileError, compile_candidate


def fixture(path: Path, *, kind='scenario', correct=1, mastery=80):
    slides = [
        {'id': 'opening', 'kind': 'lesson', 'title': 'Abertura', 'lead': 'Introdução.',
         'media': 'media/hero.webp', 'visualAlt': 'Ambiente de treinamento', 'sourceRefs': ['NR6']},
        {'id': 'choice', 'kind': kind, 'title': 'Cenário', 'lead': 'Um risco observado.',
         'question': 'Qual conduta?', 'options': [
             ['Ignorar', False, 'Não atende'], ['Interromper', bool(correct), 'Correto'],
         ]},
        {'id': 'exam', 'kind': 'assessment', 'title': 'Avaliação',
         'questions': [{'q': 'Qual alternativa?', 'options': ['A', 'B', 'C'], 'answer': 1,
                        'explain': 'Justificativa normativa'}]},
    ]
    package = {
        'courseId': 'training', 'title': 'Treinamento de referência',
        'packageVersion': 'RC1 — setembro', 'masteryScore': mastery,
        'slides': slides, 'sources': [{'label': 'NR-6', 'detail': 'Regulamento técnico'}],
    }
    with ZipFile(path, 'w') as archive:
        archive.writestr('imsmanifest.xml', '<manifest/>')
        archive.writestr('course_data.js', 'window.COURSE_DATA = ' + json.dumps(package) + ';')
        archive.writestr('media/hero.webp', b'RIFF-WEBP-MOCK')
        archive.writestr('app.js', 'throw new Error("do not execute")')


class CompileNativeDraftTests(unittest.TestCase):
    def prepare(self, root: Path):
        source = root / 'course.zip'
        fixture(source)
        location = root / 'draft'
        extract_draft(source, location)
        draft = json.loads((location / 'native-import-draft.json').read_text())
        return draft, location

    def test_convert_lesson_scenario_and_final_test_without_scorm_runtime(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            candidate, report = compile_candidate(draft, location)
            self.assertEqual(candidate['schema'], 'AIRTRUST_NATIVE_COURSE_V1')
            self.assertEqual([u['kind'] for u in candidate['units']],
                             ['lesson', 'scenario', 'assessment'])
            self.assertEqual(len(candidate['questions']), 2)
            self.assertEqual(candidate['questions'][0]['correctOptionId'], 'option-2')
            self.assertEqual(candidate['questions'][1]['correctOptionId'], 'option-2')
            self.assertEqual(candidate['policy']['masteryScore'], 80)
            self.assertEqual(candidate['units'][0]['sourceRefs'], ['NR6'])
            self.assertEqual(candidate['references'][0]['label'], 'NR-6')
            self.assertEqual(candidate['assets'][0]['sha256'], hashlib.sha256(b'RIFF-WEBP-MOCK').hexdigest())
            self.assertEqual(report['assessmentQuestions'], 1)
            self.assertEqual(report['scenarioQuestions'], 1)
            self.assertFalse(report['publishable'])
            self.assertEqual(report['certification'], 'BLOCKED_UNTIL_LMS_STAGING_E2E')
            self.assertEqual(candidate['packageVersion'], 'n-' + report['nativeCandidateSha256'][:32])

    def test_converter_version_changes_when_content_changes_but_scorm_source_is_same(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            first, first_report = compile_candidate(draft, location)
            draft['course']['slides'][0]['lead'] = 'Texto revisado pela engenharia'
            second, second_report = compile_candidate(draft, location)
            self.assertEqual(first_report['originalArchiveSha256'],
                             second_report['originalArchiveSha256'])
            self.assertNotEqual(first['packageVersion'], second['packageVersion'])
            self.assertNotEqual(first_report['nativeCandidateSha256'],
                                second_report['nativeCandidateSha256'])

    def test_fail_closed_on_missing_source_or_unmapped_slide(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            draft['course']['slides'][0]['kind'] = 'unknown-quiz'
            with self.assertRaisesRegex(NativeCompileError, 'UNSUPPORTED_SLIDE_KIND'):
                compile_candidate(draft, location)

    def test_detect_media_tampering(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            (location / 'media/media/hero.webp').write_bytes(b'CHANGED')
            with self.assertRaisesRegex(NativeCompileError, 'MEDIA_DIGEST_MISMATCH'):
                compile_candidate(draft, location)

    def test_never_promote_draft_even_if_user_sets_publishable(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            draft['publishable'] = True
            with self.assertRaisesRegex(NativeCompileError, 'INVALID_OR_PUBLISHABLE_DRAFT'):
                compile_candidate(draft, location)

    def test_reject_missing_or_ambiguous_correct_answers(self):
        with tempfile.TemporaryDirectory() as d:
            draft, location = self.prepare(Path(d))
            draft['course']['slides'][1]['options'][0][1] = True
            with self.assertRaisesRegex(NativeCompileError, 'AMBIGUOUS_SCENARIO_ANSWER'):
                compile_candidate(draft, location)

    def test_reject_unsafe_copied_media_path_even_if_metadata_is_tampered(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            draft, location = self.prepare(root)
            outside = root / 'secret.webp'
            outside.write_bytes(b'SECRET')
            draft['media'][0]['localPath'] = 'media/../../../secret.webp'
            with self.assertRaisesRegex(NativeCompileError, 'MISSING_COPIED_MEDIA'):
                compile_candidate(draft, location)


if __name__ == '__main__':
    unittest.main()
