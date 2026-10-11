"""Convert two known AirTrust SCORM course-model families into review-only drafts.

This adapter is deliberately strict: no JavaScript execution, remote access,
publishing, completion, synthetic correct answers or silent question omission.
The original authoring model stays in the private draft for human comparison.
"""
from __future__ import annotations

from typing import Any

class SpecializedModelError(ValueError):
    pass


def need(ok: bool, code: str) -> None:
    if not ok:
        raise SpecializedModelError(code)


def label(value: Any, code: str, limit: int = 8000) -> str:
    need(isinstance(value, str) and bool(value.strip()) and len(value) <= limit, code)
    return value


def list_of(value: Any, code: str, minimum: int = 1, maximum: int = 100) -> list:
    need(isinstance(value, list) and minimum <= len(value) <= maximum, code)
    return value


def pair_text(item: Any, code: str) -> str:
    need(isinstance(item, dict), code)
    name = label(item.get('title'), code, 300)
    detail = label(item.get('text'), code, 4000)
    return name + ': ' + detail


def normalize_specialized_course_model(model: dict) -> dict:
    """Return COURSE_DATA-shaped authoring input for the existing compiler."""
    need(isinstance(model, dict), 'SPECIALIZED_MODEL_INVALID')
    original_slides = list_of(model.get('slides'), 'SPECIALIZED_SLIDES_INVALID', maximum=500)
    kinds = {s.get('kind') for s in original_slides if isinstance(s, dict)}
    sgso = bool(model.get('requiredSlideIds')) and 'quiz' in kinds and 'scenario' in kinds
    residuos = isinstance(model.get('assessment'), dict) and 'choices' in set().union(
        *(set(s) for s in original_slides if isinstance(s, dict))
    )
    need(sgso != residuos, 'SPECIALIZED_MODEL_UNRECOGNIZED')
    course_id = label(model.get('courseId'), 'SPECIALIZED_COURSE_ID', 80)
    title = label(model.get('title'), 'SPECIALIZED_TITLE', 200)
    version = label(model.get('version') or model.get('packageVersion'),
                    'SPECIALIZED_VERSION', 300)
    score = (model.get('passingScore') if sgso else model['assessment'].get('masteryScore'))
    need(type(score) is int and 1 <= score <= 100, 'SPECIALIZED_MASTERY_MISSING')
    ids = [label(s.get('id'), 'SPECIALIZED_SLIDE_ID', 80)
           for s in original_slides if isinstance(s, dict)]
    need(len(ids) == len(original_slides) and len(ids) == len(set(ids)),
         'SPECIALIZED_SLIDE_IDS_INVALID')
    if sgso:
        required = model.get('requiredSlideIds')
        decisions = model.get('requiredInteractionIds')
        need(isinstance(required, list) and set(required) == set(ids),
             'SPECIALIZED_SLIDE_GATE_MISMATCH')
        # In this SGSO authoring family requiredInteractionIds reference the
        # five certifying QUIZ slides, while scenario slides independently carry
        # requiredDecision=true. Do not confuse those two completion gates.
        quiz_ids = {s['id'] for s in original_slides if s.get('kind') == 'quiz'}
        need(isinstance(decisions, list) and set(decisions) == quiz_ids,
             'SPECIALIZED_EXAM_GATE_MISMATCH')

    lessons = []
    mapped_kinds = {
        'cover', 'content', 'roadmap', 'concept_map', 'matrix',
        'rule_exception', 'scenario', 'quiz', 'compare', 'process', 'bowtie',
        'lesson', 'assessment',
    }
    # New authoring fields require deliberate review, not accidental dropping.
    supported_fields = {
        'id', 'module', 'title', 'kind', 'source', 'kicker', 'subtitle',
        'objective', 'outcomes', 'ordinal', 'media', 'lead', 'cards',
        'intro', 'steps', 'callout', 'conceptNodes', 'headers', 'rows',
        'items', 'context', 'question', 'scenarioOptions', 'scenarioCorrect',
        'requiredDecision', 'questions', 'columns', 'center', 'left', 'right',
        'chapter', 'image', 'caption', 'bullets', 'layout', 'gateItems',
        'choices', 'hotspots',
    }
    unexpected = {
        key for slide in original_slides if isinstance(slide, dict)
        for key in slide if key not in supported_fields
    }
    need(not unexpected, 'SPECIALIZED_NEW_FIELDS_REQUIRE_MAPPING')
    total_missing_feedback = 0
    spatial_hotspots = 0
    original_question_wording_pending = 0
    question_source_review_required = 0
    for source in original_slides:
        need(isinstance(source, dict) and source.get('kind') in mapped_kinds,
             'SPECIALIZED_SLIDE_KIND_UNSUPPORTED')
        kind = source['kind']
        if sgso:
            need(kind not in {'lesson', 'assessment'}, 'SPECIALIZED_UNEXPECTED_SGSO_KIND')
        else:
            need(kind in {'cover', 'lesson', 'scenario', 'assessment'},
                 'SPECIALIZED_UNEXPECTED_RESIDUOS_KIND')
        unit_kind = ('scenario' if kind == 'scenario'
                     else 'assessment' if kind in ('quiz', 'assessment') else 'lesson')
        body: list[str] = []
        heading = label(source.get('title'), 'SPECIALIZED_SLIDE_TITLE', 200)
        out: dict = {'id': source['id'], 'title': heading,
                     'kind': unit_kind}
        for name in ('lead', 'intro', 'context', 'subtitle', 'objective',
                     'kicker', 'center', 'callout', 'caption'):
            if source.get(name) is not None:
                body.append(label(source[name], 'SPECIALIZED_TEXT_' + name, 8000))
        if source.get('outcomes') is not None:
            for item in list_of(source['outcomes'], 'SPECIALIZED_OUTCOMES'):
                # SGSO's real objectives are {title,text}, not bare strings.
                body.append(pair_text(item, 'SPECIALIZED_OUTCOME') if isinstance(item, dict)
                            else label(item, 'SPECIALIZED_OUTCOME', 4000))
        if source.get('bullets') is not None:
            for item in list_of(source['bullets'], 'SPECIALIZED_BULLETS'):
                body.append(label(item, 'SPECIALIZED_BULLET', 4000))
        if source.get('cards') is not None:
            for item in list_of(source['cards'], 'SPECIALIZED_CARDS'):
                body.append(pair_text(item, 'SPECIALIZED_CARD'))
        if source.get('conceptNodes') is not None:
            for item in list_of(source['conceptNodes'], 'SPECIALIZED_CONCEPTS'):
                body.append(pair_text(item, 'SPECIALIZED_CONCEPT'))
        if source.get('items') is not None:
            for item in list_of(source['items'], 'SPECIALIZED_ITEMS'):
                body.append(pair_text(item, 'SPECIALIZED_ITEM'))
        if source.get('steps') is not None:
            out['steps'] = [pair_text(item, 'SPECIALIZED_STEP')
                            for item in list_of(source['steps'], 'SPECIALIZED_STEPS')]
        if source.get('columns') is not None:
            out['columns'] = [
                {'title': label(item.get('title'), 'SPECIALIZED_COLUMN_TITLE', 200),
                 'items': [label(item.get('text'), 'SPECIALIZED_COLUMN_TEXT', 1000)]}
                for item in list_of(source['columns'], 'SPECIALIZED_COLUMNS')
                if isinstance(item, dict)
            ]
            need(len(out['columns']) == len(source['columns']), 'SPECIALIZED_COLUMNS_INVALID')
        for field in ('left', 'right'):
            if source.get(field) is not None:
                out.setdefault('columns', []).append({
                    'title': 'Esquerda' if field == 'left' else 'Direita',
                    'items': [pair_text(item, 'SPECIALIZED_BOWTIE')
                              for item in list_of(source[field], 'SPECIALIZED_BOWTIE_ITEMS')],
                })
        if source.get('headers') is not None or source.get('rows') is not None:
            headers = list_of(source.get('headers'), 'SPECIALIZED_MATRIX_HEADERS', maximum=20)
            rows = list_of(source.get('rows'), 'SPECIALIZED_MATRIX_ROWS')
            header_labels = [label(h, 'SPECIALIZED_MATRIX_HEADER', 100) for h in headers]
            for row in rows:
                need(isinstance(row, list) and len(row) == len(header_labels),
                     'SPECIALIZED_MATRIX_SHAPE')
                body.append(' | '.join(
                    h + ': ' + label(value, 'SPECIALIZED_MATRIX_VALUE', 900)
                    for h, value in zip(header_labels, row)
                ))
        if source.get('gateItems') is not None:
            items = list_of(source['gateItems'], 'SPECIALIZED_GATE_ITEMS')
            normalized = []
            for item in items:
                need(isinstance(item, dict) and
                     set(item) >= {'id', 'label', 'detail'}, 'SPECIALIZED_GATE_FORMAT')
                normalized.append([
                    label(item['label'], 'SPECIALIZED_GATE_LABEL', 300),
                    label(item['detail'], 'SPECIALIZED_GATE_DETAIL', 600),
                ])
            out['gateItems'] = normalized
        if source.get('hotspots') is not None:
            points = list_of(source['hotspots'], 'SPECIALIZED_HOTSPOTS')
            for item in points:
                need(isinstance(item, dict) and
                     set(item) >= {'id', 'label', 'detail', 'x', 'y'},
                     'SPECIALIZED_HOTSPOT_FORMAT')
                spatial_hotspots += 1
                body.append(
                    label(item['label'], 'SPECIALIZED_HOTSPOT_LABEL', 400) + ': ' +
                    label(item['detail'], 'SPECIALIZED_HOTSPOT_DETAIL', 3000)
                )
        media = source.get('media') if sgso else source.get('image')
        if sgso:
            images = list_of(media, 'SPECIALIZED_MEDIA_LIST', maximum=1)
            need(isinstance(images[0], dict), 'SPECIALIZED_MEDIA_ITEM')
            out['media'] = label(images[0].get('src'), 'SPECIALIZED_MEDIA_SRC', 256)
            out['visualAlt'] = label(images[0].get('alt'), 'SPECIALIZED_MEDIA_ALT', 500)
            body.append(label(images[0].get('caption'), 'SPECIALIZED_MEDIA_CAPTION', 8000))
        else:
            out['media'] = label(media, 'SPECIALIZED_IMAGE', 256)
            out['visualAlt'] = heading
        refs = []
        source_ref = source.get('source')
        if isinstance(source_ref, str):
            refs.append(label(source_ref, 'SPECIALIZED_SOURCE', 250))
        elif isinstance(source_ref, dict):
            refs.append(label(source_ref.get('referenceBasis'),
                              'SPECIALIZED_SOURCE', 250))
        else:
            need(False, 'SPECIALIZED_MISSING_SOURCE')
        out['sourceRefs'] = refs
        if kind == 'scenario':
            if sgso:
                options = list_of(source.get('scenarioOptions'), 'SPECIALIZED_SCENARIO_OPTIONS')
                correct = source.get('scenarioCorrect')
                need(type(correct) is int and 0 <= correct < len(options),
                     'SPECIALIZED_SCENARIO_ANSWER')
                out['options'] = [
                    [label(item.get('text'), 'SPECIALIZED_OPTION_TEXT', 2000),
                     i == correct,
                     label(item.get('feedback'), 'SPECIALIZED_OPTION_FEEDBACK', 4000)]
                    for i, item in enumerate(options)
                ]
                out['question'] = label(source.get('question'), 'SPECIALIZED_SCENARIO_PROMPT', 4000)
            else:
                choices = list_of(source.get('choices'), 'SPECIALIZED_CHOICES')
                need(all(isinstance(item, dict) and type(item.get('ok')) is bool
                         for item in choices), 'SPECIALIZED_CHOICES_INVALID')
                need(sum(item['ok'] for item in choices) == 1, 'SPECIALIZED_CHOICES_AMBIGUOUS')
                out['options'] = [
                    [label(item.get('t'), 'SPECIALIZED_CHOICE_TEXT', 2000),
                     item['ok'],
                     label(item.get('f'), 'SPECIALIZED_CHOICE_FEEDBACK', 4000)]
                    for item in choices
                ]
                out['question'] = label(source.get('title'), 'SPECIALIZED_SCENARIO_PROMPT', 4000)
            need(source.get('requiredDecision') is True, 'SPECIALIZED_REQUIRED_DECISION_MISSING')
        if kind == 'quiz':
            questions = list_of(source.get('questions'), 'SPECIALIZED_QUIZ', maximum=100)
            out['questions'] = []
            for q in questions:
                need(isinstance(q, dict), 'SPECIALIZED_QUIZ_ENTRY')
                need(set(q) <= {'text','originalText','options','correct','feedback','source'},
                     'SPECIALIZED_QUIZ_UNMAPPED_FIELD')
                prompt = label(q.get('text'), 'SPECIALIZED_QUIZ_PROMPT', 4000)
                if q.get('originalText') is not None:
                    original = label(q['originalText'], 'SPECIALIZED_ORIGINAL_QUIZ_WORDING', 4000)
                    if original != prompt:
                        original_question_wording_pending += 1
                if q.get('source') is not None:
                    question_source = q['source']
                    need(isinstance(question_source, dict), 'SPECIALIZED_QUIZ_SOURCE_INVALID')
                    source_basis = label(question_source.get('referenceBasis'),
                                         'SPECIALIZED_QUIZ_SOURCE_BASIS', 250)
                    if source_basis not in out['sourceRefs']:
                        out['sourceRefs'].append(source_basis)
                    question_source_review_required += 1
                answers = list_of(q.get('options'), 'SPECIALIZED_QUIZ_OPTIONS', 2, 10)
                correct = q.get('correct')
                need(type(correct) is int and 0 <= correct < len(answers),
                     'SPECIALIZED_QUIZ_CORRECT')
                out['questions'].append({
                    'q': prompt,
                    'options': [label(v, 'SPECIALIZED_QUIZ_OPTION', 2000) for v in answers],
                    'answer': correct,
                    'explain': label(q.get('feedback'), 'SPECIALIZED_QUIZ_FEEDBACK', 4000),
                })
        if kind == 'assessment' and not sgso:
            questions = list_of(model['assessment'].get('questions'),
                                'SPECIALIZED_GLOBAL_ASSESSMENT', maximum=100)
            out['questions'] = []
            for q in questions:
                need(isinstance(q, dict), 'SPECIALIZED_ASSESSMENT_ENTRY')
                answers = list_of(q.get('a'), 'SPECIALIZED_ASSESSMENT_OPTIONS', 2, 10)
                correct = q.get('correct')
                need(type(correct) is int and 0 <= correct < len(answers),
                     'SPECIALIZED_ASSESSMENT_ANSWER')
                # The original contains NO teaching rationale. Never invent
                # one: explicit review-blocker text cannot certify employees.
                placeholder = 'Justificativa não fornecida no SCORM original. Revisão pedagógica obrigatória.'
                total_missing_feedback += 1
                out['questions'].append({
                    'q': label(q.get('q'), 'SPECIALIZED_ASSESSMENT_PROMPT', 4000),
                    'options': [label(v, 'SPECIALIZED_ASSESSMENT_OPTION', 2000) for v in answers],
                    'answer': correct,
                    'explain': placeholder,
                })
        if body:
            out['body'] = '\n'.join(body)[:8000]
            need(len('\n'.join(body)) <= 8000, 'SPECIALIZED_BODY_TOO_LARGE')
        if kind == 'cover' and not body:
            out['lead'] = heading
        lessons.append(out)
    need(any(unit['kind'] == 'assessment' for unit in lessons), 'SPECIALIZED_MISSING_EXAM')
    result = {
        'courseId': course_id, 'title': title, 'packageVersion': version,
        'masteryScore': score, 'slides': lessons,
        'adapter': 'SGSO_MODEL_V1' if sgso else 'RESIDUOS_MODEL_V1',
        'adapterReview': {
            'missingPedagogicalFeedback': total_missing_feedback,
            'spatialHotspotsRequiringVisualReview': spatial_hotspots,
            'originalQuestionWordingPending': original_question_wording_pending,
            'questionSourceReviewRequired': question_source_review_required,
            'sourceSlideCount': len(original_slides),
        },
    }
    return result
