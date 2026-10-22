#!/usr/bin/env python3
"""Prepare a PRIVATE AirTrust Native V1 R2-layout package, offline only.

This stages files for review; it NEVER uploads, publishes, marks completion or
writes to D1/R2. The JSON contains answer keys and MUST remain private.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path, PurePosixPath

MAX_CANDIDATE = 4 * 1024 * 1024
MAX_MEDIA = 12 * 1024 * 1024
MAX_TOTAL_MEDIA = 350 * 1024 * 1024
MAX_ASSETS = 1000
SHA = re.compile(r'^[a-f0-9]{64}$')
VERSION = re.compile(r'^n-[a-f0-9]{32}$')
PATH = re.compile(r'^[a-zA-Z0-9_./-]+$')
MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.vtt': 'text/vtt',
}


class NativeStageError(ValueError):
    pass


def fail(code: str):
    raise NativeStageError(code)


def safe_input(root: Path, relative: str) -> Path:
    """Reject path traversal, absolute paths and symlinks in any component."""
    if not isinstance(relative, str) or not PATH.fullmatch(relative):
        fail('UNSAFE_STAGE_PATH')
    name = PurePosixPath(relative)
    if name.is_absolute() or any(part in ('', '.', '..') for part in relative.split('/')):
        fail('UNSAFE_STAGE_PATH')
    if root.is_symlink():
        fail('SYMLINK_SOURCE_NOT_ALLOWED')
    path = root
    for part in name.parts:
        path = path / part
        if path.is_symlink():
            fail('SYMLINK_SOURCE_NOT_ALLOWED')
    if not path.resolve().is_relative_to(root.resolve()):
        fail('UNSAFE_STAGE_PATH')
    if not path.is_file():
        fail('STAGE_SOURCE_MISSING')
    return path


def digest(path: Path, limit: int) -> tuple[str, int]:
    size = path.stat().st_size
    if size <= 0 or size > limit:
        fail('STAGE_ASSET_SIZE_INVALID')
    sha = hashlib.sha256()
    with path.open('rb') as file:
        while chunk := file.read(1024 * 1024):
            sha.update(chunk)
    return sha.hexdigest(), size


def stage_native_package(
    candidate_dir: Path,
    draft_dir: Path,
    output_dir: Path,
    empresa_id: int,
    curso_id: int,
) -> dict:
    if any(type(n) is not int or n <= 0 for n in (empresa_id, curso_id)):
        fail('INVALID_TENANT_OR_COURSE_ID')
    if output_dir.exists() or output_dir.is_symlink():
        fail('STAGE_DESTINATION_EXISTS')
    candidate_file = safe_input(candidate_dir, 'native-private-candidate.json')
    report_file = safe_input(candidate_dir, 'conversion-review.json')
    candidate_hash, candidate_size = digest(candidate_file, MAX_CANDIDATE)
    report = json.loads(report_file.read_text(encoding='utf-8'))
    candidate = json.loads(candidate_file.read_text(encoding='utf-8'))

    if not isinstance(report, dict) or report.get('publishable') is not False or (
        report.get('status') != 'REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW'
    ):
        fail('INVALID_STAGE_REVIEW_STATUS')
    if not isinstance(candidate, dict) or candidate.get('schema') != 'AIRTRUST_NATIVE_COURSE_V1' or (
        not isinstance(candidate.get('packageVersion'), str)
        or not VERSION.fullmatch(candidate['packageVersion'])
    ):
        fail('INVALID_STAGE_CANDIDATE')
    if report.get('artifactBytesSha256') != candidate_hash:
        fail('STAGE_ARTIFACT_DIGEST_MISMATCH')
    assets = candidate.get('assets')
    if not isinstance(assets, list) or len(assets) > MAX_ASSETS:
        fail('INVALID_STAGE_ASSET_LIST')
    prefix = f'lms/native/{empresa_id}/{curso_id}/{candidate_hash}/'
    files = [(candidate_file, prefix + 'native-private-candidate.json',
              candidate_hash, candidate_size, 'application/json')]
    seen = {'native-private-candidate.json'}
    media_total = 0
    for asset in assets:
        if not isinstance(asset, dict):
            fail('INVALID_STAGE_ASSET')
        path = asset.get('path')
        if not isinstance(path, str) or not path.startswith('media/'):
            fail('INVALID_STAGE_ASSET_PATH')
        if path in seen:
            fail('DUPLICATE_STAGE_ASSET')
        seen.add(path)
        expected_mime = MIME.get(PurePosixPath(path).suffix.lower())
        if not expected_mime or expected_mime != asset.get('mime'):
            fail('STAGE_MIME_CONFLICT')
        expected_sha = asset.get('sha256')
        if not isinstance(expected_sha, str) or not SHA.fullmatch(expected_sha):
            fail('INVALID_STAGE_ASSET_DIGEST')
        # The SCORM extraction stores media under draft_dir/media/<sourcePath>.
        source = safe_input(draft_dir, 'media/' + path)
        actual_sha, size = digest(source, MAX_MEDIA)
        if actual_sha != expected_sha:
            fail('STAGE_MEDIA_DIGEST_MISMATCH')
        media_total += size
        if media_total > MAX_TOTAL_MEDIA:
            fail('STAGE_MEDIA_TOTAL_EXCEEDED')
        files.append((source, prefix + path, actual_sha, size, expected_mime))

    manifest = {
        'schema': 'AIRTRUST_NATIVE_PRIVATE_STAGE_V1',
        'status': 'REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW',
        'publishable': False,
        'remoteUploadPerformed': False,
        'empresaId': empresa_id,
        'cursoId': curso_id,
        'packageVersion': candidate['packageVersion'],
        'artifactBytesSha256': candidate_hash,
        'r2Prefix': prefix,
        'files': [
            {'r2Key': key, 'sha256': sha, 'bytes': size, 'mime': mime}
            for _, key, sha, size, mime in files
        ],
    }
    output_dir.mkdir(parents=False, exist_ok=False)
    try:
        for source, key, sha, size, _mime in files:
            target = output_dir.joinpath(*PurePosixPath(key).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            actual, copied_size = digest(target, MAX_CANDIDATE if source == candidate_file else MAX_MEDIA)
            if actual != sha or copied_size != size:
                fail('STAGE_COPY_INTEGRITY_FAILED')
        (output_dir / 'private-publication-review.json').write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
    except Exception:
        shutil.rmtree(output_dir)
        raise
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate_dir', type=Path)
    parser.add_argument('draft_dir', type=Path)
    parser.add_argument('output_dir', type=Path)
    parser.add_argument('--empresa-id', type=int, required=True)
    parser.add_argument('--curso-id', type=int, required=True)
    args = parser.parse_args()
    try:
        result = stage_native_package(
            args.candidate_dir, args.draft_dir,
            args.output_dir, args.empresa_id, args.curso_id,
        )
    except (NativeStageError, ValueError, OSError) as error:
        parser.exit(2, f'ERROR {error}\n')
    print(json.dumps({
        'status': result['status'], 'r2Prefix': result['r2Prefix'],
        'fileCount': len(result['files']),
        'remoteUploadPerformed': False,
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
