#!/usr/bin/env python3
"""Player3 original HTML5 factory batch; review only, no remote writes.

Accepts the two original archives with nested SCORM ZIPs. Validate all
candidates BEFORE writing either output directory. Never copy original answer
bank into a learner artifact or print its contents.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
import shutil
from pathlib import Path
from zipfile import ZipFile

from convert_preserved_html5 import UnsafePackage, checked_files
from extract_player3_private_assessments import _safe_output_pair, _write_exclusive
from prepare_player3_learner_review import build, compile_review

KNOWN_SOURCES = {
    'SMS(5).zip': ('4ab977d88559c238bf0f1d6226f28959f241276aadd30d5e9183e7ab24dca55b', 9),
    'Segurança Operacional(2).zip': (
        'b1e274cd6b316ab25797b9062bfeff68b532469a96d3e26bbbe7a8063ad8ff7e', 13),
}

def candidates(batches):
    seen = set()
    for path in batches:
        if not path.is_file() or path.is_symlink():
            raise UnsafePackage('PLAYER3_SOURCE_NOT_REGULAR_FILE')
        raw = path.read_bytes()
        expected = KNOWN_SOURCES.get(path.name)
        if expected and hashlib.sha256(raw).hexdigest() != expected[0]:
            raise UnsafePackage('PLAYER3_ORIGINAL_ARCHIVE_SHA_MISMATCH')
        with ZipFile(io.BytesIO(raw)) as outer:
            files = checked_files(outer)
            nested = sorted(p for p in files if p.lower().endswith('.zip')
                            and not p.startswith('__MACOSX/')
                            and not Path(p).name.startswith('._'))
            if expected and len(nested) != expected[1]:
                raise UnsafePackage('PLAYER3_ORIGINAL_PACKAGE_COUNT_MISMATCH')
            if not nested or len(nested) > 40:
                raise UnsafePackage('PLAYER3_INVALID_NESTED_PACKAGE_COUNT')
            for entry in nested:
                basename = Path(entry).name
                content = outer.read(entry)
                source_hash = hashlib.sha256(content).hexdigest()
                if source_hash in seen:
                    raise UnsafePackage('PLAYER3_DUPLICATE_SOURCE_EDITION')
                seen.add(source_hash)
                yield path.name, basename, content

def batch_review(batches: list[Path], private_output: Path, learner_output: Path):
    private, learner = _safe_output_pair(private_output, learner_output)
    if not batches or len(batches) > 2:
        raise UnsafePackage('PLAYER3_INVALID_BATCH_COUNT')
    if any(path.name in KNOWN_SOURCES for path in batches):
        if {path.name for path in batches} != set(KNOWN_SOURCES):
            raise UnsafePackage('PLAYER3_REQUIRE_BOTH_ORIGINAL_ARCHIVES')
    # First pass: fail before writing any learner artifact if any source fails.
    verified = []
    for outer, basename, original in candidates(batches):
        _, meta, _, _, receipt = compile_review(original, basename)
        verified.append((outer, basename, receipt['source_sha256'],
                         receipt['courseId'], meta['stage_count'], meta['question_count']))
    if {p.name for p in batches} == set(KNOWN_SOURCES) and len(verified) != 22:
        raise UnsafePackage('PLAYER3_22_SOURCE_MISMATCH')
    private.mkdir(mode=0o700)
    try:
        learner.mkdir(mode=0o700)
        index = []
        for n, (outer, basename, content) in enumerate(candidates(batches)):
            v = verified[n]
            if (outer, basename, hashlib.sha256(content).hexdigest()) != v[:3]:
                raise UnsafePackage('PLAYER3_SOURCE_CHANGED_BETWEEN_PASSES')
            receipt = build(content, basename, private / ('edition-' + str(n + 1)),
                            learner / ('edition-' + str(n + 1)))
            index.append({'sourceArchive': outer, 'originalPackage': basename,
                          'source_sha256': receipt['source_sha256'],
                          'courseId': receipt['courseId'],
                          'stages': v[4], 'assessmentQuestions': v[5],
                          'publishable': False})
        summary = {'schema': 'AIRTRUST_PLAYER3_DEKEY_BATCH_REVIEW_V1',
                   'status': 'REVIEW_ONLY_NEVER_DEPLOY',
                   'editions': len(index),
                   'courses': index,
                   'remoteWrites': False,
                   'allCoursesPublishable': False}
        _write_exclusive(private / 'batch-private-review.json', summary)
    except BaseException:
        # Only delete roots created above; no existing directory is overwritten.
        shutil.rmtree(learner, ignore_errors=True)
        shutil.rmtree(private, ignore_errors=True)
        raise
    return summary

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archives', nargs='+', type=Path)
    parser.add_argument('--private-output', type=Path, required=True)
    parser.add_argument('--learner-output', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    result = batch_review(args.archives, args.private_output, args.learner_output)
    print(json.dumps({'status': result['status'], 'editions': result['editions'],
                      'allCoursesPublishable': False, 'remoteWrites': False}))

if __name__ == '__main__':
    main()
