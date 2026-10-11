#!/usr/bin/env python3
"""Read-only SCORM -> AirTrust Native import DRAFT (not a publishable course).

Does not execute JavaScript or contact services. Imported content requires
technical/pedagogical review and end-to-end LMS certification before publication.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import stat
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile

MAX_ENTRIES = 3000
MAX_UNCOMPRESSED = 350 * 1024 * 1024
MAX_DATA_FILE = 8 * 1024 * 1024
MAX_ASSET = 60 * 1024 * 1024
SAFE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp3', '.wav', '.mp4', '.webm', '.vtt'}
JS_JSON_ASSIGNMENT = re.compile(
    r'^\s*window\.(?:COURSE_DATA|AIRTRUST_COURSE_MODEL)\s*=\s*', re.DOTALL,
)


class ConversionError(ValueError):
    pass


def safe_member_name(name: str) -> str:
    if not isinstance(name, str) or not name or '\\' in name or '\x00' in name:
        raise ConversionError('UNSAFE_ZIP_PATH')
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ('..', '.', '') for part in name.split('/')):
        raise ConversionError('UNSAFE_ZIP_PATH')
    if ':' in path.parts[0] or path.parts[0].startswith('__MACOSX'):
        raise ConversionError('UNSAFE_ZIP_PATH')
    return str(path)


def source_json(archive: ZipFile, name: str) -> dict | None:
    try:
        info = archive.getinfo(name)
    except KeyError:
        return None
    if info.file_size > MAX_DATA_FILE:
        raise ConversionError('SOURCE_MODEL_OVERSIZE')
    data = archive.read(info).decode('utf-8-sig').strip()
    if name.endswith('.js'):
        assignment = JS_JSON_ASSIGNMENT.match(data)
        if not assignment:
            raise ConversionError('SOURCE_MODEL_NOT_JSON_ASSIGNMENT')
        data = data[assignment.end():].strip().rstrip(';').strip()
    try:
        result = json.loads(data)
    except json.JSONDecodeError as exc:
        raise ConversionError('SOURCE_MODEL_NOT_STRICT_JSON') from exc
    if not isinstance(result, dict):
        raise ConversionError('SOURCE_MODEL_NOT_OBJECT')
    return result


def extract_draft(source: Path, destination: Path) -> dict:
    if destination.exists():
        raise ConversionError('DESTINATION_EXISTS')
    try:
        with ZipFile(source, 'r') as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            if len(entries) > MAX_ENTRIES or sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED:
                raise ConversionError('ARCHIVE_LIMIT_EXCEEDED')
            indexed = {}
            for entry in entries:
                name = safe_member_name(entry.filename)
                if name in indexed:
                    raise ConversionError('DUPLICATE_ZIP_PATH')
                if stat.S_ISLNK(entry.external_attr >> 16):
                    raise ConversionError('SYMLINK_NOT_ALLOWED')
                indexed[name] = entry
            if 'imsmanifest.xml' not in indexed:
                raise ConversionError('MISSING_SCORM_MANIFEST')
            model = source_json(archive, 'course-model.js')
            data = source_json(archive, 'course_data.js')
            if model is None and data is None:
                raise ConversionError('UNSUPPORTED_AUTHORING_FORMAT')
            authored = data if isinstance(data, dict) and isinstance(data.get('slides'), list) else model
            if not isinstance(authored, dict):
                raise ConversionError('MISSING_SLIDES')
            slides = authored.get('slides')
            if not isinstance(slides, list) or not slides:
                raise ConversionError('MISSING_SLIDES')
            ids = []
            for slide in slides:
                if not isinstance(slide, dict) or not isinstance(slide.get('id'), str) or not slide['id'].strip():
                    raise ConversionError('INVALID_SLIDE_ID')
                ids.append(slide['id'])
            if len(ids) != len(set(ids)):
                raise ConversionError('DUPLICATE_SLIDE_ID')
            course_id = authored.get('courseId') or (model or {}).get('courseId')
            title = authored.get('title') or (model or {}).get('title')
            version = (
                authored.get('packageVersion') or authored.get('version')
                or (model or {}).get('packageVersion') or (model or {}).get('version')
            )
            if not all(isinstance(value, str) and value.strip() for value in (course_id, title, version)):
                raise ConversionError('MISSING_ID_TITLE_VERSION')
            completion = source_json(archive, 'airtrust-completion-manifest.json')
            media = []
            for name, entry in indexed.items():
                if PurePosixPath(name).suffix.lower() not in SAFE_EXT:
                    continue
                if entry.file_size > MAX_ASSET:
                    raise ConversionError('ASSET_OVERSIZE')
                media.append((name, entry))
            with source.open('rb') as stream:
                source_sha = hashlib.file_digest(stream, 'sha256').hexdigest()
            draft = {
                'schema': 'AIRTRUST_NATIVE_IMPORT_DRAFT_V1',
                'status': 'REQUIRES_REVIEW',
                'publishable': False,
                'source': {'format': 'scorm', 'archive_sha256': source_sha, 'archive_name': source.name},
                'course': {
                    'id': course_id, 'title': title, 'packageVersion': version,
                    'slideIds': ids, 'slides': slides,
                },
                'legacyCompletionManifest': completion,
                'legacyAuthoringModel': model,
                'media': [],
                'reviewReasons': [
                    'Legacy interaction and evaluation semantics must be mapped and verified',
                    'Imported HTML/text must be sanitized before rendering',
                    'Completion and qualification require authenticated end-to-end tests',
                ],
            }
            destination.mkdir(parents=True)
            for name, entry in media:
                payload = archive.read(entry)
                output = destination / 'media' / name
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(payload)
                draft['media'].append({
                    'sourcePath': name, 'localPath': f'media/{name}',
                    'sha256': hashlib.sha256(payload).hexdigest(), 'bytes': len(payload),
                })
            (destination / 'native-import-draft.json').write_text(
                json.dumps(draft, ensure_ascii=False, indent=2) + '\n',
                encoding='utf-8',
            )
            return {
                'status': draft['status'], 'course_id': course_id, 'version': version,
                'slides': len(slides), 'media': len(media),
                'media_bytes': sum(info.file_size for _, info in media),
                'archive_sha256': source_sha,
            }
    except (BadZipFile, OSError, UnicodeDecodeError) as exc:
        raise ConversionError('INVALID_OR_UNREADABLE_ARCHIVE') from exc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scorm_zip', type=Path)
    parser.add_argument('output_dir', type=Path)
    args = parser.parse_args()
    if args.output_dir.exists():
        parser.exit(2, 'ERROR DESTINATION_EXISTS\n')
    try:
        result = extract_draft(args.scorm_zip, args.output_dir)
    except ConversionError as exc:
        if args.output_dir.exists():
            shutil.rmtree(args.output_dir)
        parser.exit(2, f'ERROR {exc}\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
