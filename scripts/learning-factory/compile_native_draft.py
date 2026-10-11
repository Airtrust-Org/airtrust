#!/usr/bin/env python3
"""Compile supported SCORM authoring drafts to PRIVATE Native V1 candidates.

No remote access, JS execution, publication, status update, or LMS completion.
Output includes answer keys; keep exclusively in a private workspace.
The candidate is NOT certifiable without technical and pedagogical review.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

SUPPORTED_KINDS = frozenset({'lesson', 'scenario', 'assessment'})
MEDIA_MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
}
IDENTIFIER = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$')


class NativeCompileError(ValueError):
    pass


def ensure_text(value: Any, label: str, limit: int = 8000) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit:
        raise NativeCompileError('INVALID_' + label)
    return value


def ensure_id(value: Any, label: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise NativeCompileError('INVALID_' + label)
    return value


def make_questions(slide: dict, is_scenario: bool) -> list[dict]:
    result = []
    if is_scenario:
        prompt = ensure_text(slide.get('question'), 'SCENARIO_QUESTION')
        raw_options = slide.get('options')
        if not isinstance(raw_options, list) or not 2 <= len(raw_options) <= 10:
            raise NativeCompileError('INVALID_SCENARIO_OPTIONS')
        if any(not isinstance(opt, list) or len(opt) != 3 or
               not isinstance(opt[1], bool) for opt in raw_options):
            raise NativeCompileError('INVALID_SCENARIO_OPTIONS')
        correct = [i for i, opt in enumerate(raw_options) if opt[1]]
        if len(correct) != 1:
            raise NativeCompileError('AMBIGUOUS_SCENARIO_ANSWER')
        candidates = [{
            'q': prompt,
            'options': [ensure_text(opt[0], 'SCENARIO_OPTION', 2000) for opt in raw_options],
            'answer': correct[0],
            'explain': ensure_text(raw_options[correct[0]][2], 'SCENARIO_FEEDBACK', 4000),
            'incorrect': ' '.join(ensure_text(opt[2], 'SCENARIO_FEEDBACK', 4000)
                                  for opt in raw_options if not opt[1])[:4000],
        }]
    else:
        candidates = slide.get('questions')
        if not isinstance(candidates, list) or not candidates:
            raise NativeCompileError('ASSESSMENT_QUESTIONS_MISSING')
    for position, q in enumerate(candidates, 1):
        if not isinstance(q, dict):
            raise NativeCompileError('INVALID_QUESTION')
        prompt = ensure_text(q.get('q'), 'QUESTION_PROMPT', 4000)
        choices = q.get('options')
        answer = q.get('answer')
        if not isinstance(choices, list) or not 2 <= len(choices) <= 10:
            raise NativeCompileError('INVALID_QUESTION_OPTIONS')
        if not isinstance(answer, int) or isinstance(answer, bool) or not 0 <= answer < len(choices):
            raise NativeCompileError('INVALID_QUESTION_ANSWER')
        options = [{'id': f'option-{i+1}', 'text': ensure_text(v, 'QUESTION_OPTION', 2000)}
                   for i, v in enumerate(choices)]
        result.append({
            'id': f"{ensure_id(slide['id'], 'SLIDE_ID')}-question-{position:03d}",
            'prompt': prompt,
            'options': options,
            'correctOptionId': f'option-{answer+1}',
            'feedbackCorrect': ensure_text(q.get('explain'), 'QUESTION_FEEDBACK', 4000),
            'feedbackIncorrect': ensure_text(q.get('incorrect', q.get('explain')),
                                             'QUESTION_FEEDBACK', 4000),
        })
    return result


def compile_candidate(draft: dict, location: Path) -> tuple[dict, dict]:
    if draft.get('schema') != 'AIRTRUST_NATIVE_IMPORT_DRAFT_V1' or draft.get('publishable') is not False:
        raise NativeCompileError('INVALID_OR_PUBLISHABLE_DRAFT')
    original = draft.get('course')
    source = draft.get('source')
    if not isinstance(original, dict) or not isinstance(source, dict):
        raise NativeCompileError('MISSING_DRAFT_METADATA')
    course_id = ensure_id(original.get('id'), 'COURSE_ID')
    title = ensure_text(original.get('title'), 'COURSE_TITLE', 200)
    version = ensure_text(original.get('packageVersion'), 'ORIGINAL_VERSION', 300)
    archive_sha = source.get('archive_sha256')
    if not isinstance(archive_sha, str) or not re.fullmatch(r'[a-f0-9]{64}', archive_sha):
        raise NativeCompileError('INVALID_ARCHIVE_DIGEST')
    slides = original.get('slides')
    if not isinstance(slides, list) or not slides:
        raise NativeCompileError('MISSING_SLIDES')
    policy_score = draft.get('legacyAuthoringModel', {}).get('masteryScore') if isinstance(
        draft.get('legacyAuthoringModel'), dict) else None
    # Authoring source (COURSE_DATA) is preferred over the model when available.
    authored_score = original.get('masteryScore')
    if authored_score is not None:
        policy_score = authored_score
    if policy_score is None:
        # The draft preserves the original author's score when supplied by either source.
        policy_score = draft.get('authoringMasteryScore')
    if not isinstance(policy_score, int) or isinstance(policy_score, bool) or not 1 <= policy_score <= 100:
        raise NativeCompileError('MISSING_OR_INVALID_MASTERY_POLICY')

    media_index: dict[str, dict] = {}
    for media in draft.get('media', []):
        if not isinstance(media, dict) or not isinstance(media.get('sourcePath'), str):
            raise NativeCompileError('INVALID_MEDIA_INDEX')
        media_index[media['sourcePath']] = media
    assets = []
    units = []
    questions = []
    source_fields_unmapped = set()
    for slide in slides:
        if not isinstance(slide, dict):
            raise NativeCompileError('INVALID_SLIDE')
        slide_id = ensure_id(slide.get('id'), 'SLIDE_ID')
        kind = slide.get('kind')
        if kind not in SUPPORTED_KINDS:
            raise NativeCompileError('UNSUPPORTED_SLIDE_KIND')
        blocks = []
        lead = slide.get('lead')
        if lead is not None:
            blocks.append({'type': 'paragraph', 'text': ensure_text(lead, 'SLIDE_LEAD')})
        body = slide.get('body')
        if body is not None:
            if isinstance(body, str):
                blocks.append({'type': 'paragraph', 'text': ensure_text(body, 'SLIDE_BODY')})
            elif isinstance(body, list) and body and all(isinstance(x, str) for x in body):
                blocks.append({'type': 'bullets', 'items': [ensure_text(x, 'SLIDE_BODY', 1000) for x in body]})
            else:
                raise NativeCompileError('UNSUPPORTED_BODY_FORMAT')
        image = slide.get('media')
        if image is not None:
            if not isinstance(image, str) or image not in media_index:
                raise NativeCompileError('MISSING_REFERENCED_MEDIA')
            info = media_index[image]
            path = str(info.get('localPath', ''))
            origin = location / path
            if not path.startswith('media/') or not origin.resolve().is_relative_to((location / 'media').resolve()) or not origin.is_file():
                raise NativeCompileError('MISSING_COPIED_MEDIA')
            sha = hashlib.sha256(origin.read_bytes()).hexdigest()
            if sha != info.get('sha256'):
                raise NativeCompileError('MEDIA_DIGEST_MISMATCH')
            mime = MEDIA_MIME.get(Path(image).suffix.lower())
            if mime is None:
                raise NativeCompileError('UNSUPPORTED_MEDIA_FORMAT')
            asset_id = 'asset-' + hashlib.sha256(image.encode('utf-8')).hexdigest()[:20]
            if not any(a['id'] == asset_id for a in assets):
                assets.append({'id': asset_id, 'path': image, 'sha256': sha, 'mime': mime})
            alt = ensure_text(slide.get('visualAlt'), 'MEDIA_DESCRIPTION', 500)
            blocks.append({
                'type': 'video' if mime.startswith('video/') else 'image',
                'assetId': asset_id, 'alt': alt,
            })
        slide_questions = []
        if kind in ('scenario', 'assessment'):
            slide_questions = make_questions(slide, is_scenario=(kind == 'scenario'))
            questions.extend(slide_questions)
        elif slide.get('questions') or slide.get('question'):
            raise NativeCompileError('QUESTIONS_ON_LESSON')
        if not blocks and kind == 'lesson':
            raise NativeCompileError('EMPTY_LESSON')
        source_refs = slide.get('sourceRefs')
        if source_refs is not None and (
            not isinstance(source_refs, list) or
            any(not isinstance(s, str) or not s.strip() for s in source_refs)
        ):
            raise NativeCompileError('INVALID_SOURCE_REFS')
        unit = {'id': slide_id, 'title': ensure_text(slide.get('title'), 'SLIDE_TITLE', 200),
                'kind': kind, 'blocks': blocks, 'questionIds': [q['id'] for q in slide_questions]}
        if source_refs:
            unit['sourceRefs'] = source_refs
        units.append(unit)
        accounted = {'id','title','kind','lead','body','media','visualAlt','sourceRefs',
                     'question','options','questions'}
        source_fields_unmapped.update(k for k in slide if k not in accounted)
    if len(set(unit['id'] for unit in units)) != len(units):
        raise NativeCompileError('DUPLICATE_SLIDE_ID')
    if not any(unit['kind'] == 'assessment' for unit in units):
        raise NativeCompileError('MISSING_CERTIFYING_ASSESSMENT')

    references = []
    for i, item in enumerate(draft.get('authoringSources', []), 1):
        if not isinstance(item, dict):
            raise NativeCompileError('INVALID_SOURCE_RECORD')
        references.append({
            'id': f'ref-{i:03d}',
            'label': ensure_text(item.get('label'), 'SOURCE_LABEL', 600),
            'detail': ensure_text(item.get('detail'), 'SOURCE_DETAIL', 4000),
        })
    native = {
        'schema': 'AIRTRUST_NATIVE_COURSE_V1',
        'courseId': course_id,
        'packageVersion': 'v-' + archive_sha[:24],
        'title': title, 'locale': 'pt-BR',
        'policy': {'mode': 'SCORED', 'masteryScore': policy_score},
        'assets': assets, 'units': units, 'questions': questions,
        'references': references,
    }
    report = {
        'status': 'REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW',
        'publishable': False,
        'originalPackageVersion': version,
        'originalArchiveSha256': archive_sha,
        'unitsConverted': len(units),
        'questionsConverted': len(questions),
        'assessmentQuestions': sum(len(u['questionIds']) for u in units if u['kind'] == 'assessment'),
        'scenarioQuestions': sum(len(u['questionIds']) for u in units if u['kind'] == 'scenario'),
        'unmappedLayoutFields': sorted(source_fields_unmapped),
        'unreferencedMedia': sorted(set(media_index) -
                                    {s.get('media') for s in slides if isinstance(s, dict)}),
        'certification': 'BLOCKED_UNTIL_LMS_STAGING_E2E',
    }
    return native, report


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('draft_directory', type=Path)
    p.add_argument('output_directory', type=Path)
    args = p.parse_args()
    if args.output_directory.exists():
        p.exit(2, 'ERROR DESTINATION_EXISTS\n')
    try:
        draft = json.loads((args.draft_directory / 'native-import-draft.json').read_text(encoding='utf-8'))
        candidate, report = compile_candidate(draft, args.draft_directory)
    except (OSError, ValueError, KeyError) as error:
        p.exit(2, f'ERROR {error}\n')
    args.output_directory.mkdir(parents=True)
    (args.output_directory / 'native-private-candidate.json').write_text(
        json.dumps(candidate, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (args.output_directory / 'conversion-review.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': report['status'], 'units': report['unitsConverted'],
                      'questions': report['questionsConverted']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
