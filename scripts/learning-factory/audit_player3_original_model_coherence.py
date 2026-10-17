#!/usr/bin/env python3
"""Offline Player3 source coherence audit. No answers/media in stdout or report.

Strict input cohort: the two byte-identical original archives handed to Front A.
Checks each authored dual model's identity, stage topology and optional paired
question payloads before a factory is permitted to trust either model.
No course editions or private answer banks are written by this tool.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import stat
from pathlib import Path
from zipfile import ZipFile

BATCHES = {
    '4ab977d88559c238bf0f1d6226f28959f241276aadd30d5e9183e7ab24dca55b': 9,
    'b1e274cd6b316ab25797b9062bfeff68b532469a96d3e26bbbe7a8063ad8ff7e': 13,
}
MODEL_VARS = {'course_data.js': 'COURSE_DATA',
              'course-model.js': 'AIRTRUST_COURSE_MODEL'}
LITERAL = re.compile(r'^window\.(COURSE_DATA|AIRTRUST_COURSE_MODEL)\s*=\s*')

class SourceCoherenceError(ValueError):
    pass


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _model(raw: bytes, expected: str) -> dict:
    text = raw.decode('utf-8-sig').strip()
    literal = LITERAL.match(text)
    if not literal or literal.group(1) != expected:
        raise SourceCoherenceError('SOURCE_INVALID_AUTHORING_GLOBAL')
    try:
        result = json.loads(text[literal.end():].rstrip(';').strip())
    except (ValueError, TypeError) as exc:
        raise SourceCoherenceError('SOURCE_INVALID_LITERAL_MODEL') from exc
    if not isinstance(result, dict) or not isinstance(result.get('slides'), list):
        raise SourceCoherenceError('SOURCE_INVALID_SLIDES')
    return result


def _question_map(model: dict) -> dict:
    result = {}
    for s in model['slides']:
        if not isinstance(s, dict) or not isinstance(s.get('id'), str):
            raise SourceCoherenceError('SOURCE_INVALID_STAGE')
        questions = s.get('questions')
        if questions is not None:
            if not isinstance(questions, list):
                raise SourceCoherenceError('SOURCE_INVALID_QUESTION_LIST')
            if questions:
                result[s['id']] = questions
    return result


def inspect_edition(raw: bytes) -> dict:
    """Sanitized findings only; never return question content or answer keys."""
    with ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        models = [name for name in MODEL_VARS if name in names]
        if len(models) not in (1, 2) or len(names) != len(set(names)):
            raise SourceCoherenceError('SOURCE_INVALID_MODEL_MEMBERSHIP')
        parsed = [_model(archive.read(name), MODEL_VARS[name]) for name in models]
    identity = parsed[0].get('courseId')
    if not isinstance(identity, str) or not identity.strip():
        raise SourceCoherenceError('SOURCE_INVALID_COURSE_ID')
    signatures = []
    question_maps = []
    for model in parsed:
        if model.get('courseId') != identity:
            raise SourceCoherenceError('SOURCE_DUAL_COURSE_ID_MISMATCH')
        signatures.append([(s.get('id'), s.get('kind')) for s in model['slides']])
        question_maps.append(_question_map(model))
    if any(sig != signatures[0] for sig in signatures):
        raise SourceCoherenceError('SOURCE_DUAL_STAGE_MISMATCH')
    both = len(parsed) == 2 and bool(question_maps[0]) and bool(question_maps[1])
    if both and question_maps[0] != question_maps[1]:
        raise SourceCoherenceError('SOURCE_DUAL_PRIVATE_BANK_MISMATCH')
    return {'source_sha256': sha(raw), 'dualModels': len(parsed) == 2,
            'questionBanksCompared': both,
            'onePresentationOnly': len(parsed) == 2 and bool(question_maps[0]) != bool(question_maps[1]),
            'stageTopologyMatched': True, 'questionBankMismatch': False}


def audit_originals(paths: list[Path]) -> dict:
    if len(paths) != 2:
        raise SourceCoherenceError('SOURCE_TWO_ARCHIVES_REQUIRED')
    batches = []
    seen = set()
    cohort = {}
    for path in paths:
        if not path.is_file() or path.is_symlink() or path.stat().st_size > 220 * 1024 * 1024:
            raise SourceCoherenceError('SOURCE_INVALID_OUTER_ARCHIVE')
        digest = sha(path.read_bytes())
        if digest not in BATCHES or digest in seen:
            raise SourceCoherenceError('SOURCE_UNAPPROVED_OUTER_SHA')
        seen.add(digest)
        findings = []
        with ZipFile(path) as outer:
            for entry in outer.infolist():
                name = entry.filename
                if name.startswith('__MACOSX/') or Path(name).name.startswith('._'):
                    continue
                if not name.lower().endswith('.zip') or entry.is_dir():
                    continue
                if (name.startswith('/') or '\\' in name or '\x00' in name or
                    any(part in ('', '.', '..') for part in name.split('/')) or
                    stat.S_IFMT((entry.external_attr >> 16) & 0xffff) == stat.S_IFLNK or
                    entry.file_size <= 0 or entry.file_size > 100 * 1024 * 1024):
                    raise SourceCoherenceError('SOURCE_UNSAFE_NESTED_ZIP')
                report = inspect_edition(outer.read(entry))
                if report['source_sha256'] in cohort:
                    raise SourceCoherenceError('SOURCE_DUPLICATE_EDITION')
                cohort[report['source_sha256']] = report
                findings.append(report)
        if len(findings) != BATCHES[digest]:
            raise SourceCoherenceError('SOURCE_INCOMPLETE_BATCH')
        batches.append({'batchSha256': digest, 'editions': len(findings)})
    all_rows = sorted(cohort.values(), key=lambda r:r['source_sha256'])
    if len(all_rows) != 22:
        raise SourceCoherenceError('SOURCE_22_EDITION_COHORT_MISMATCH')
    dual = sum(r['dualModels'] for r in all_rows)
    compared = sum(r['questionBanksCompared'] for r in all_rows)
    presentation = sum(r['onePresentationOnly'] for r in all_rows)
    if (dual, compared, presentation) != (19, 7, 12):
        raise SourceCoherenceError('SOURCE_DUAL_MODEL_CONTRACT_CHANGED')
    return {'schema': 'AIRTRUST_PLAYER3_22_ORIGINAL_MODEL_COHERENCE_V1',
            'reviewOnly': True, 'publishable': False,
            'originalsVerified': len(all_rows), 'dualModels': dual,
            'identicalPairedQuestionBanks': compared,
            'presentationOnlyCompanions': presentation,
            'privateQuestionsWritten': False, 'remoteWrites': False,
            'batches': sorted(batches, key=lambda z:z['batchSha256']),
            'editions': all_rows}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original_archives', type=Path, nargs=2)
    args = parser.parse_args()
    result = audit_originals(args.original_archives)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()