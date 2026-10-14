#!/usr/bin/env python3
"""Player 3 HTML5 source de-key factory: PRIVATE REVIEW ONLY, never deploy.

Reuses the Player 3 bank extractor and preserves HTML/CSS/media/runtime bytes.
The original assessment runtime still requires a server-authoritative adapter
and real browser QA before any learner distribution.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from convert_preserved_html5 import UnsafePackage, checked_files, MAX_NESTED_ZIP
from extract_player3_private_assessments import (
    COURSE, _safe_output_pair, _write_exclusive, extract,
)

KEYS = frozenset({
    'answer', 'correct', 'scenarioCorrect', 'isCorrect', 'correctOptionId',
    'answerKey', 'correctAnswers', 'ok', 'feedback', 'explain', 'explanation',
    'feedbackCorrect', 'feedbackIncorrect', 'rationale',
})
MODEL_FILES = ('course_data.js', 'course-model.js')
EXTERNAL_KEY = re.compile(
    r"""(?i)(?:["']?(?:answerKey|correctAnswers|correctOptionId|scenarioCorrect)["']?\s*[:=]|["'](?:answer|correct)["']\s*:\s*(?:[0-9]|["']))"""
)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def dekey(value):
    if isinstance(value, dict):
        # Unknown authoring field with possible answer/feedback cannot leak.
        if any(re.search(r'answer|correct|feedback|gabarito|solution|rationale', k, re.I)
               and k not in KEYS for k in value):
            raise UnsafePackage('PLAYER3_UNKNOWN_PRIVATE_FIELD')
        # Residuos scenario choices use {t, ok, f}; f is feedback.
        scenario_choice = 'ok' in value and 't' in value
        return {k: dekey(v) for k, v in value.items()
                if k not in KEYS and not (scenario_choice and k == 'f')}
    if isinstance(value, list):
        # Lists with correctness flags need explicit adapter before stripping.
        if any(isinstance(item, bool) for item in value):
            raise UnsafePackage('PLAYER3_UNMAPPED_BOOLEAN_LIST')
        return [dekey(v) for v in value]
    return value

def fixed_zip(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with ZipFile(out, 'w', compression=ZIP_DEFLATED, compresslevel=6) as z:
        for path, raw in sorted(files.items()):
            info = ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            z.writestr(info, raw)
    return out.getvalue()

def compile_review(original: bytes, name: str):
    if not isinstance(original, bytes) or len(original) > MAX_NESTED_ZIP:
        raise UnsafePackage('PLAYER3_SOURCE_SIZE')
    meta, projection, bank = extract(original, name)
    with ZipFile(io.BytesIO(original)) as original_zip:
        entries = checked_files(original_zip)
        models = [p for p in MODEL_FILES if p in entries]
        if len(models) != 1:
            raise UnsafePackage('PLAYER3_AMBIGUOUS_MODEL_FILES')
        model_path = models[0]
        text = original_zip.read(model_path).decode('utf-8-sig').strip()
        prefix = COURSE.match(text)
        if not prefix:
            raise UnsafePackage('PLAYER3_NOT_LITERAL_MODEL')
        try:
            model = json.loads(text[prefix.end():].strip().rstrip(';').strip())
        except ValueError as error:
            raise UnsafePackage('PLAYER3_INVALID_MODEL') from error
        sanitized = dekey(model)
        if not isinstance(model.get('slides'), list) or not isinstance(sanitized.get('slides'), list):
            raise UnsafePackage('PLAYER3_INVALID_SLIDES')
        if [(s.get('id'), s.get('kind')) for s in model['slides']] != [
            (s.get('id'), s.get('kind')) for s in sanitized['slides']
        ]:
            raise UnsafePackage('PLAYER3_STAGE_PARITY')
        sanitized_bytes = (text[:prefix.end()] + json.dumps(
            sanitized, ensure_ascii=False, separators=(',', ':')) + ';\n').encode('utf-8')
        files = {}
        for path in sorted(entries):
            raw = original_zip.read(path)
            if path != model_path and path.lower().endswith(('.js', '.json', '.html', '.htm')):
                if EXTERNAL_KEY.search(raw.decode('utf-8', errors='replace')):
                    raise UnsafePackage('PLAYER3_UNMAPPED_GRADING_SOURCE:' + path)
            files[path] = sanitized_bytes if path == model_path else raw
        for path, raw in files.items():
            if path != model_path and raw != original_zip.read(path):
                raise UnsafePackage('PLAYER3_VISUAL_BYTE_FIDELITY')
    receipt = {
        'schema': 'AIRTRUST_PLAYER3_HTML5_DEKEY_REVIEW_V1',
        'status': 'REVIEW_ONLY_NEVER_DEPLOY',
        'source_sha256': sha(original),
        'courseId': meta['courseId'],
        'sourceVersion': meta['sourceVersion'],
        'stageCount': meta['stage_count'],
        'questionCount': meta['question_count'],
        'modelFile': model_path,
        'byteIdenticalNonModelFiles': True,
        'officialAnswerBankExcluded': True,
        'originalRuntimeAssessmentMustBeAdapted': True,
        'browserVisualAndFunctionalQaRequired': True,
        'serverStagePolicyApprovalRequired': True,
        'isolatedAuthenticatedAssetTransportRequired': True,
        'publishable': False,
    }
    files['player3-review-manifest.json'] = (
        json.dumps(receipt, indent=2, ensure_ascii=False, sort_keys=True) + '\n'
    ).encode('utf-8')
    return fixed_zip(files), meta, projection, bank, receipt

def build(original: bytes, basename: str, private_dir: Path, learner_dir: Path):
    private, learner = _safe_output_pair(private_dir, learner_dir)
    archive, meta, projection, bank, receipt = compile_review(original, basename)
    created = []
    try:
        for folder in (private, learner):
            folder.mkdir(mode=0o700)
            created.append(folder)
        short = receipt['source_sha256'][:20]
        _write_exclusive(private / (short + '-server-only-bank.json'), bank)
        _write_exclusive(private / (short + '-private-review.json'), meta)
        _write_exclusive(learner / (short + '-learner-questions.json'), projection)
        name = learner / (short + '-UNSAFE-REVIEW.zip')
        with os.fdopen(os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as out:
            out.write(archive)
    except BaseException:
        import shutil
        for folder in reversed(created):
            shutil.rmtree(folder)
        raise
    return receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original_zip', type=Path)
    parser.add_argument('--private-output', type=Path, required=True)
    parser.add_argument('--learner-output', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    if (not args.original_zip.is_file() or args.original_zip.is_symlink()
            or args.original_zip.stat().st_size > MAX_NESTED_ZIP):
        parser.error('INVALID_SOURCE_FILE')
    receipt = build(args.original_zip.read_bytes(), args.original_zip.name,
                    args.private_output, args.learner_output)
    print(json.dumps({'status': receipt['status'], 'courseId': receipt['courseId'],
                      'source_sha256': receipt['source_sha256'],
                      'publishable': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
