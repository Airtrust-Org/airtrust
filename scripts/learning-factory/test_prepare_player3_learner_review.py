"""Synthetic, credential-free Player 3 HTML5 de-key review regressions."""
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert_preserved_html5 import UnsafePackage
from prepare_player3_learner_review import build, compile_review

def zip_source(files):
    output = io.BytesIO()
    with ZipFile(output, 'w') as z:
        for name, body in files.items():
            z.writestr(name, body)
    return output.getvalue()

def model():
    return {
        'courseId': 'doutrinamento-synthetic', 'version': 'RC8.1',
        'masteryScore': 80, 'navigationGate': 'module-assessment',
        'slides': [
            {'id': 'first', 'kind': 'lesson', 'title': 'Visual original'},
            {'id': 'module-quiz', 'kind': 'assessment', 'questions': [
                {'q': 'Pergunta de teste', 'options': ['A', 'B', 'C'],
                 'answer': 1, 'explain': 'PRIVATE_KEY_SENTINEL_123'}]},
            {'id': 'decision', 'kind': 'scenario', 'scenarioCorrect': 1,
             'scenarioOptions': [
                 {'text': 'A', 'feedback': 'answer disclosure'},
                 {'text': 'B', 'feedback': 'answer disclosure'}]},
        ]
    }

def original(m=None, extra=None):
    m = model() if m is None else m
    files = {
        'index.html': '<!doctype html><main>Visual original</main>',
        'imsmanifest.xml': '<manifest/>',
        'course_data.js': 'window.COURSE_DATA = ' + json.dumps(m, ensure_ascii=False) + ';',
        'styles.css': '.slide{transition:opacity 1s}',
        'app.js': 'window.renderSlides=()=>window.COURSE_DATA.slides;',
        'assets/diagram.png': b'\x89PNG\x00synthetic',
        'assets/demo.mp4': b'\x00\x00synthetic-mp4',
    }
    files.update(extra or {})
    return zip_source(files)


def zip_source(files):
    output = io.BytesIO()
    with ZipFile(output, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return output.getvalue()

class Player3Html5ReviewTests(unittest.TestCase):
    def test_known_keys_removed_and_all_other_bytes_identical(self):
        raw = original()
        candidate, metadata, learner, bank, receipt = compile_review(raw, 'RC8.1.zip')
        self.assertFalse(receipt['publishable'])
        self.assertTrue(receipt['browserVisualAndFunctionalQaRequired'])
        self.assertEqual(receipt['sourceVersion'], 'RC8.1')
        self.assertFalse(receipt['stageContractApproved'])
        self.assertEqual([u['stageId'] for u in receipt['sourceStageCrosswalk']],
                         ['first', 'module-quiz', 'decision'])
        self.assertEqual([u['candidatePlayer3Type']
                          for u in receipt['sourceStageCrosswalk']],
                         ['content', 'module_exam', None])
        self.assertTrue(receipt['sourceStageCrosswalk'][2]['requiresPedagogicalApproval'])
        self.assertNotIn('PRIVATE_KEY_SENTINEL_123', json.dumps(receipt))
        self.assertEqual(metadata['question_count'], 1)
        self.assertEqual(bank['questions'][0]['correctOptionId'], 'o1')
        self.assertEqual(learner['stages'][0]['questions'][0]['prompt'], 'Pergunta de teste')
        with ZipFile(io.BytesIO(raw)) as before, ZipFile(io.BytesIO(candidate)) as after:
            self.assertEqual(set(after.namelist()), set(before.namelist()) |
                             {'player3-review-manifest.json'})
            for filename in before.namelist():
                if filename != 'course_data.js':
                    self.assertEqual(after.read(filename), before.read(filename))
            dekeyed = after.read('course_data.js').decode()
            for forbidden in ('PRIVATE_KEY_SENTINEL_123', '"answer":',
                              '"scenarioCorrect":', 'answer disclosure'):
                self.assertNotIn(forbidden, dekeyed)
            self.assertIn('Pergunta de teste', dekeyed)
            self.assertIn('Visual original', after.read('index.html').decode())


    def test_dual_models_are_dekeyed_even_when_primary_has_different_layout(self):
        primary = model()
        # Scenario tuples are authored [label, isCorrect, feedback].
        primary['slides'][2]['options'] = [
            ['A', False, 'PRIVATE_BAD_SCENARIO_321'],
            ['B', True, 'PRIVATE_GOOD_SCENARIO_321'],
        ]
        secondary = json.loads(json.dumps(primary))
        secondary['slides'][1]['questions'][0]['answer'] = 2
        secondary['slides'][1]['questions'][0]['explain'] = 'PRIVATE_SECONDARY_KEY_321'
        dual = {
            'course_data.js': 'window.COURSE_DATA = ' + json.dumps(primary) + ';',
            'course-model.js': 'window.AIRTRUST_COURSE_MODEL = ' + json.dumps(secondary) + ';',
        }
        with ZipFile(io.BytesIO(original(primary))) as source:
            files = {name: source.read(name) for name in source.namelist()}
        files.update(dual)
        candidate, _, _, bank, receipt = compile_review(zip_source(files), 'RC8.1.zip')
        self.assertEqual(receipt['modelFiles'], ['course_data.js', 'course-model.js'])
        self.assertEqual(bank['questions'][0]['correctOptionId'], 'o1')
        with ZipFile(io.BytesIO(candidate)) as result:
            for name in receipt['modelFiles']:
                content = result.read(name).decode('utf8')
                for private in ('PRIVATE_SECONDARY_KEY_321','PRIVATE_BAD_SCENARIO_321',
                                'PRIVATE_GOOD_SCENARIO_321', '"answer":', '"correct":'):
                    self.assertNotIn(private, content)
                self.assertIn('[["A",null,null],["B",null,null]]', content)

    def test_css_ternary_label_is_not_an_embedded_answer_key(self):
        source = original(extra={'app.js': "let css=hit?'correct':'incorrect';"})
        compile_review(source, 'css-test.zip')

    def test_dual_model_identity_mismatch_blocks(self):
        other = model()
        other['slides'][0]['id'] = 'different-stage-id'
        with ZipFile(io.BytesIO(original())) as source:
            files = {name: source.read(name) for name in source.namelist()}
        files['course-model.js'] = (
            'window.AIRTRUST_COURSE_MODEL = ' + json.dumps(other) + ';')
        with self.assertRaisesRegex(UnsafePackage, 'DUAL_MODEL_STAGE_MISMATCH'):
            compile_review(zip_source(files), 'mismatch.zip')

    def test_same_input_produces_same_edition_bytes(self):
        raw = original()
        self.assertEqual(compile_review(raw, 'RC8.1.zip')[0],
                         compile_review(raw, 'RC8.1.zip')[0])

    def test_non_model_literal_key_blocks(self):
        with self.assertRaisesRegex(UnsafePackage, 'UNMAPPED_GRADING_SOURCE'):
            compile_review(original(extra={'hidden.js': 'window.answerKey = [1];'}),
                           'bad.zip')

    def test_unknown_private_fields_block(self):
        changed = model()
        changed['slides'][1]['questions'][0]['correctOptionIndex'] = 1
        with self.assertRaisesRegex(UnsafePackage, 'UNKNOWN_PRIVATE_FIELD'):
            compile_review(original(changed), 'bad.zip')

    def test_invalid_answer_and_boolean_key_list_block(self):
        changed = model()
        changed['slides'][1]['questions'][0]['answer'] = 'B'
        with self.assertRaises(UnsafePackage):
            compile_review(original(changed), 'bad.zip')
        changed = model()
        changed['slides'][0]['hiddenKey'] = [True, False]
        with self.assertRaisesRegex(UnsafePackage, 'UNMAPPED_BOOLEAN_LIST'):
            compile_review(original(changed), 'bad.zip')

    def test_private_outputs_separated_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            private, learner = Path(folder)/'vault', Path(folder)/'learner'
            receipt = build(original(), 'RC8.1.zip', private, learner)
            self.assertFalse(receipt['publishable'])
            self.assertEqual(stat.S_IMODE(private.stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE(learner.stat().st_mode), 0o700)
            self.assertEqual(len(list(private.glob('*server-only-bank.json'))), 1)
            self.assertEqual(len(list(learner.glob('*.zip'))), 1)
            artifact = next(learner.glob('*.zip'))
            import hashlib
            self.assertEqual(receipt['reviewZipSha256'],
                             hashlib.sha256(artifact.read_bytes()).hexdigest())
            self.assertFalse(list(learner.glob('*server-only-bank.json')))
            with self.assertRaises(UnsafePackage):
                build(original(), 'RC8.1.zip', private, learner)

if __name__ == '__main__':
    unittest.main()
