#!/usr/bin/env python3
"""Batch-convert nested private SCORM ZIPs to non-publishable AirTrust Native candidates.

Offline, read-only toward sources, no JS execution, no D1/R2/HTTP.
Private outputs contain answer keys and MUST stay outside Git/Pages/shared Drive.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from convert_scorm_to_native import extract_draft, ConversionError, safe_member_name
from compile_native_draft import compile_candidate, NativeCompileError

MAX_PACKAGES = 200
MAX_NESTED_BYTES = 150 * 1024 * 1024
MAX_BATCH_UNCOMPRESSED = 2 * 1024 * 1024 * 1024
SAFE_COMPONENT = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$')


class NativeBatchError(ValueError):
    pass


def verify_entry(entry: zipfile.ZipInfo) -> str:
    name = safe_member_name(entry.filename)
    if stat.S_ISLNK(entry.external_attr >> 16):
        raise NativeBatchError('BATCH_SYMLINK_REJECTED')
    return name


def batch_convert_scorm(
    archive_path: Path, output_dir: Path,
) -> dict:
    if output_dir.exists() or output_dir.is_symlink():
        raise NativeBatchError('BATCH_OUTPUT_ALREADY_EXISTS')
    if not archive_path.is_file() or archive_path.is_symlink():
        raise NativeBatchError('BATCH_SOURCE_INVALID')
    with zipfile.ZipFile(archive_path, 'r') as outer:
        members = [item for item in outer.infolist() if not item.is_dir()]
        if len(members) > 1000:
            raise NativeBatchError('BATCH_TOO_MANY_ENTRIES')
        seen_paths = set()
        packages = []
        seen_names = set()
        total_size = 0
        for item in members:
            # Finder resource-fork files are not courses. Skip the recognized
            # AppleDouble directory only after checking that its components
            # cannot escape a ZIP path or impersonate a parent segment.
            raw_name = item.filename
            if raw_name.startswith('__MACOSX/') and '\\' not in raw_name and (
                '\x00' not in raw_name
            ) and all(part not in ('', '.', '..') for part in raw_name.split('/')):
                continue
            name = verify_entry(item)
            if name in seen_paths:
                raise NativeBatchError('BATCH_DUPLICATE_ENTRY')
            seen_paths.add(name)
            if name.startswith('__MACOSX/') or PurePosixPath(name).name.startswith('._'):
                continue
            if not name.lower().endswith('.zip'):
                continue
            stem = PurePosixPath(name).name[:-4]
            if not SAFE_COMPONENT.fullmatch(stem) or stem in seen_names:
                raise NativeBatchError('BATCH_UNSAFE_OR_DUPLICATE_COURSE')
            seen_names.add(stem)
            total_size += item.file_size
            if item.file_size <= 0 or item.file_size > MAX_NESTED_BYTES or \
               total_size > MAX_BATCH_UNCOMPRESSED:
                raise NativeBatchError('BATCH_PACKAGE_LIMIT_EXCEEDED')
            packages.append((stem, item))
        if not packages or len(packages) > MAX_PACKAGES:
            raise NativeBatchError('BATCH_INVALID_PACKAGE_COUNT')
        # Restrict local privacy by default; only the user may distribute
        # these packages after independent security and pedagogy approval.
        output_dir.mkdir(parents=True, exist_ok=False, mode=0o700)
        results = []
        for stem, item in packages:
            destination = output_dir / stem
            try:
                with tempfile.TemporaryDirectory(prefix='native-import-private-') as temp:
                    package_file = Path(temp) / 'source.zip'
                    # Outer ZipFile CRC is checked when the nested bytes are read.
                    payload = outer.read(item)
                    package_sha = hashlib.sha256(payload).hexdigest()
                    package_file.write_bytes(payload)
                    draft_dir = destination / 'draft'
                    candidate_dir = destination / 'candidate'
                    destination.mkdir(mode=0o700)
                    extraction = extract_draft(package_file, draft_dir)
                    draft = json.loads((draft_dir / 'native-import-draft.json').read_text(
                        encoding='utf-8'))
                    candidate, review = compile_candidate(draft, draft_dir)
                    candidate_dir.mkdir(mode=0o700)
                    (candidate_dir / 'native-private-candidate.json').write_text(
                        json.dumps(candidate, ensure_ascii=False, indent=2) + '\n',
                        encoding='utf-8')
                    (candidate_dir / 'conversion-review.json').write_text(
                        json.dumps(review, ensure_ascii=False, indent=2) + '\n',
                        encoding='utf-8')
                    results.append({
                        'package': stem + '.zip', 'status': 'REQUIRES_REVIEW',
                        'publishable': False, 'sourceSha256': package_sha,
                        'slides': extraction['slides'], 'mediaFiles': extraction['media'],
                        'unitsConverted': review['unitsConverted'],
                        'assessmentQuestions': review['assessmentQuestions'],
                        'scenarioQuestions': review['scenarioQuestions'],
                        'specializedAdapter': review.get('specializedAdapter'),
                        'adapterReview': review.get('adapterReview'),
                        'mediaTransportBlockers': review.get('mediaTransportBlockers', []),
                        'unmappedLayoutFields': review['unmappedLayoutFields'],
                    })
            except (ConversionError, NativeCompileError, OSError, ValueError,
                    zipfile.BadZipFile) as error:
                # The source remains untouched. A partial course is discarded,
                # while other courses continue independently.
                import shutil
                if destination.exists():
                    shutil.rmtree(destination)
                results.append({
                    'package': stem + '.zip', 'status': 'BLOCKED',
                    'publishable': False,
                    'error': type(error).__name__ + ': ' + str(error)[:160],
                })
        report = {
            'schema': 'AIRTRUST_NATIVE_BATCH_REVIEW_V1',
            'remoteUploadPerformed': False, 'publicationPerformed': False,
            'allPublishable': False,
            'totalPackages': len(packages),
            'candidatesForReview': sum(row['status'] == 'REQUIRES_REVIEW' for row in results),
            'blockedPackages': sum(row['status'] == 'BLOCKED' for row in results),
            'courses': results,
        }
        (output_dir / 'batch-conversion-review.json').write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8')
        return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle_zip', type=Path)
    parser.add_argument('private_output_dir', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    try:
        report = batch_convert_scorm(args.bundle_zip, args.private_output_dir)
    except (NativeBatchError, OSError, zipfile.BadZipFile) as error:
        parser.exit(2, f'ERROR {error}\n')
    print(json.dumps({
        'totalPackages': report['totalPackages'],
        'candidatesForReview': report['candidatesForReview'],
        'blockedPackages': report['blockedPackages'],
        'publicationPerformed': False,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
