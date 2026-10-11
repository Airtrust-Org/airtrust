"""Strict specialized SCORM model fixtures are synthetic and free of real course text."""
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from normalize_scorm_model import (
    normalize_specialized_course_model, SpecializedModelError,
)
from convert_scorm_to_native import extract_draft
from compile_native_draft import compile_candidate


def sgso_model():
    return {
        'courseId': 'sgso-reference', 'title': 'Safety Reference',
        'version': 'M10.4', 'passingScore': 70,
        'requiredSlideIds': ['cover', 'decision', 'quiz'],
        'requiredInteractionIds': ['quiz'],
        'slides': [
            {
                'id': 'cover', 'title': 'Capa', 'kind': 'cover',
                'subtitle': 'Visão geral', 'outcomes': ['Identificar perigos'],
                'source': {'referenceBasis': 'Manual local', 'generated': '2026-01-01'},
                'media': [{'src': 'media/cover.webp', 'alt': 'Helicóptero', 'caption': 'Imagem contextual'}],
            },
            {
                'id': 'decision', 'title': 'Cenário', 'kind': 'scenario',
                'context': 'Exemplo', 'question': 'Qual decisão?',
                'requiredDecision': True,
                'scenarioOptions': [
                    {'text': 'Ignorar', 'feedback': 'Incorreto'},
                    {'text': 'Interromper', 'feedback': 'Correto'},
                ],
                'scenarioCorrect': 1,
                'source': {'referenceBasis': 'Manual local', 'generated': '2026-01-01'},
                'media': [{'src': 'media/decision.webp', 'alt': 'Pessoa decidindo',
                           'caption': 'Decisão responsável'}],
            },
            {
                'id': 'quiz', 'title': 'Avaliação', 'kind': 'quiz',
                'questions': [
                    {'text': 'Qual prevenção?', 'options': ['Desconsiderar','Verificar'],
                     'correct': 1, 'feedback': 'Conferir requisito técnico'},
                ],
                'source': {'referenceBasis': 'Manual local', 'generated': '2026-01-01'},
                'media': [{'src': 'media/quiz.webp', 'alt': 'Símbolo de prova',
                           'caption': 'Avaliação'},
                ],
            },
        ],
    }


def residuos_model():
    return {
        'courseId': 'residuos-reference', 'title': 'Gestão de Resíduos',
        'version': 'RC4', 'assessment': {
            'masteryScore': 80, 'questions': [
                {'id':'e1', 'q':'Qual classificação?', 'a':['Misturar','Separar','Ignorar'],
                 'correct':1},
            ],
        },
        'slides': [
            {
                'id': 'cover', 'kind': 'cover', 'title': 'Abertura',
                'lead': 'Introdução ao descarte', 'image': 'media/cover.jpg',
                'caption': 'Coleta seletiva', 'bullets': ['Tipos de resíduos'],
                'source': 'Norma de referência',
            },
            {
                'id': 'lesson', 'kind': 'lesson', 'title': 'Procedimento',
                'lead': 'Boas práticas', 'image': 'media/lesson.jpg',
                'caption': 'Procedimento seguro', 'source': 'Norma de referência',
                'gateItems': [{'id': 'g1', 'label': 'Ponto obrigatório',
                               'detail': 'Verificar segregação'}],
                'hotspots': [{'id': 'h1', 'label': 'Área A',
                              'detail': 'Locais de descarte', 'x': 15, 'y': 40}],
            },
            {
                'id': 'decision', 'kind': 'scenario', 'title': 'Decisão',
                'lead': 'Escolha segura', 'image': 'media/decision.jpg',
                'caption': 'Qual destino?', 'source': 'Norma de referência',
                'requiredDecision': True, 'choices': [
                    {'t':'Jogar junto','ok':False,'f':'Inadequado'},
                    {'t':'Separar','ok':True,'f':'Adequado'},
                ],
            },
            {
                'id': 'assessment', 'kind': 'assessment', 'title': 'Avaliação final',
                'lead': 'Responda', 'image': 'media/exam.jpg',
                'caption': 'Atenção', 'source': 'Norma de referência',
            },
        ],
    }


def make_zip(path, model):
    with ZipFile(path, 'w') as z:
        z.writestr('imsmanifest.xml', '<manifest/>')
        z.writestr('course-model.js',
                   'window.AIRTRUST_COURSE_MODEL = ' + json.dumps(model) + ';')
        for slide in model['slides']:
            asset = slide.get('image') or slide.get('media')[0]['src']
            z.writestr(asset, b'fake-private-image-data')


class SpecializedCourseAdapterTests(unittest.TestCase):
    def test_sgso_scenario_quiz_and_gate_survive_to_native_candidate(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            model = sgso_model()
            make_zip(root/'source.zip', model)
            extract_draft(root/'source.zip', root/'draft')
            draft = json.loads((root/'draft/native-import-draft.json').read_text())
            self.assertEqual(draft['specializedAdapter'], 'SGSO_MODEL_V1')
            self.assertEqual(draft['legacyAuthoringModel'], model)
            candidate, report = compile_candidate(draft, root/'draft')
            self.assertEqual([unit['kind'] for unit in candidate['units']],
                             ['lesson', 'scenario', 'assessment'])
            self.assertEqual([q['correctOptionId'] for q in candidate['questions']],
                             ['option-2', 'option-2'])
            self.assertEqual(candidate['policy']['masteryScore'], 70)
            self.assertEqual(len(candidate['assets']), 3)
            self.assertEqual(report['assessmentQuestions'], 1)
            self.assertEqual(report['scenarioQuestions'], 1)
            self.assertFalse(report['publishable'])

    def test_real_sgso_objective_and_quiz_metadata_are_preserved_or_flagged(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            model = sgso_model()
            model['slides'][0]['outcomes'] = [
                {'title': 'Meta operacional', 'text': 'Reconhecer a barreira'}
            ]
            question = model['slides'][2]['questions'][0]
            question['originalText'] = 'Redação original distinta da pergunta mostrada'
            question['source'] = {
                'referenceBasis': 'Manual da avaliação', 'generated': '2026-01-01',
            }
            normalized = normalize_specialized_course_model(model)
            self.assertEqual(normalized['adapterReview']['originalQuestionWordingPending'], 1)
            self.assertEqual(normalized['adapterReview']['questionSourceReviewRequired'], 1)
            self.assertIn('Meta operacional: Reconhecer a barreira',
                          normalized['slides'][0]['body'])
            self.assertIn('Manual da avaliação', normalized['slides'][2]['sourceRefs'])
            make_zip(root/'source.zip', model)
            extract_draft(root/'source.zip', root/'draft')
            draft = json.loads((root/'draft/native-import-draft.json').read_text())
            candidate, review = compile_candidate(draft, root/'draft')
            self.assertFalse(review['publishable'])
            self.assertEqual(review['adapterReview']['originalQuestionWordingPending'], 1)
            self.assertEqual(review['adapterReview']['questionSourceReviewRequired'], 1)
            self.assertEqual(len(candidate['questions']), 2)
            self.assertEqual(candidate['questions'][-1]['prompt'], 'Qual prevenção?')
            self.assertIn('Redação original distinta',
                          json.dumps(draft['legacyAuthoringModel'], ensure_ascii=False))

    def test_residuos_uses_global_exam_and_requires_missing_rationale_review(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            model = residuos_model()
            make_zip(root/'source.zip', model)
            extract_draft(root/'source.zip', root/'draft')
            draft = json.loads((root/'draft/native-import-draft.json').read_text())
            self.assertEqual(draft['specializedAdapter'], 'RESIDUOS_MODEL_V1')
            candidate, report = compile_candidate(draft, root/'draft')
            self.assertEqual(candidate['policy']['masteryScore'], 80)
            self.assertEqual(report['assessmentQuestions'], 1)
            self.assertEqual(report['scenarioQuestions'], 1)
            self.assertEqual(candidate['questions'][-1]['correctOptionId'], 'option-2')
            self.assertIn('Revisão pedagógica obrigatória',
                          candidate['questions'][-1]['feedbackCorrect'])
            self.assertFalse(report['publishable'])
            self.assertEqual(report['adapterReview']['missingPedagogicalFeedback'], 1)
            self.assertEqual(report['adapterReview']['spatialHotspotsRequiringVisualReview'], 1)
            self.assertIn('Ponto obrigatório: Verificar segregação',
                          [item for block in candidate['units'][1]['blocks']
                           if block['type'] == 'bullets' for item in block['items']])

    def test_unknown_specialized_model_fails_closed(self):
        model = sgso_model()
        model.pop('requiredSlideIds')
        with self.assertRaisesRegex(SpecializedModelError, 'SPECIALIZED_MODEL_UNRECOGNIZED'):
            normalize_specialized_course_model(model)

    def test_revoked_required_scenario_gate_is_never_dropped(self):
        model = sgso_model()
        model['requiredInteractionIds'] = []
        with self.assertRaisesRegex(SpecializedModelError, 'SPECIALIZED_EXAM_GATE_MISMATCH'):
            normalize_specialized_course_model(model)

    def test_sgso_scenario_gate_is_independent_of_quiz_completion_gate(self):
        model = sgso_model()
        model['slides'][1]['requiredDecision'] = False
        with self.assertRaisesRegex(SpecializedModelError, 'SPECIALIZED_REQUIRED_DECISION_MISSING'):
            normalize_specialized_course_model(model)

    def test_incorrect_scenario_source_fails_instead_of_guessing_correct_answer(self):
        model = residuos_model()
        model['slides'][2]['choices'][1]['ok'] = False
        with self.assertRaisesRegex(SpecializedModelError, 'SPECIALIZED_CHOICES_AMBIGUOUS'):
            normalize_specialized_course_model(model)

    def test_future_unknown_authoring_fields_require_explicit_adapter_mapping(self):
        model = sgso_model()
        model['slides'][0]['unreviewedRegulatoryControl'] = 'never silently ignored'
        with self.assertRaisesRegex(SpecializedModelError, 'SPECIALIZED_NEW_FIELDS_REQUIRE_MAPPING'):
            normalize_specialized_course_model(model)

    def test_required_structural_content_must_not_disappear(self):
        model = sgso_model()
        model['slides'][0]['outcomes'] = [{'unexpected': 'object'}]
        with self.assertRaises(SpecializedModelError):
            normalize_specialized_course_model(model)


if __name__ == '__main__':
    unittest.main()
