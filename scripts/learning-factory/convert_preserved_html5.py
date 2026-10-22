#!/usr/bin/env python3
"""AirTrust Player 3: preserve original HTML5 bytes, NEVER publish a draft.

Converts nested original SCORM ZIPs into private HTML5 review artifacts. It does
not re-render courses into generic JSON slides, strip authoring interactions,
certify assessments, upload to R2 or change enrollment data. Private JS may
contain keys: output must not be exposed publicly.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import re
import stat
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

MAX_NESTED_ZIP = 120 * 1024 * 1024
MAX_FILES = 2000
MAX_UNCOMPRESSED = 400 * 1024 * 1024
MAX_SINGLE = 70 * 1024 * 1024
MAX_RATIO = 500
MAX_MODEL_BYTES = 10 * 1024 * 1024

class UnsafePackage(ValueError):
    pass

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def checked_files(source: ZipFile):
    infos = [i for i in source.infolist() if not i.is_dir()]
    if len(infos) > MAX_FILES or sum(i.file_size for i in infos) > MAX_UNCOMPRESSED:
        raise UnsafePackage('PACKAGE_LIMIT')
    entries = {}
    for info in infos:
        name = info.filename
        parts = name.split('/')
        if not name or '\\' in name or '\x00' in name or name.startswith('/') or ':' in parts[0] or \
           parts[0].startswith('__MACOSX') or any(p in ('', '.', '..') for p in parts):
            raise UnsafePackage('UNSAFE_PATH')
        if name in entries or stat.S_ISLNK(info.external_attr >> 16) or info.file_size > MAX_SINGLE:
            raise UnsafePackage('DUPLICATE_SYMLINK_OR_TOO_LARGE')
        if info.file_size > max(1, info.compress_size) * MAX_RATIO:
            raise UnsafePackage('COMPRESSION_RATIO')
        entries[name] = info
    return entries

def source_metadata(source: ZipFile, files: dict):
    if 'index.html' not in files or 'imsmanifest.xml' not in files:
        raise UnsafePackage('NOT_HTML5_SCORM_SOURCE')
    manifest = {}
    if 'airtrust-completion-manifest.json' in files:
        if files['airtrust-completion-manifest.json'].file_size > MAX_MODEL_BYTES:
            raise UnsafePackage('OVERSIZED_COMPLETION_MANIFEST')
        manifest = json.loads(source.read('airtrust-completion-manifest.json'))
        if not isinstance(manifest, dict):
            raise UnsafePackage('INVALID_COMPLETION_MANIFEST')
    model = None
    for filename in ('course_data.js', 'course-model.js'):
        if filename in files and files[filename].file_size <= MAX_MODEL_BYTES:
            text = source.read(filename).decode('utf-8-sig').strip()
            match = re.match(r'^window\.[A-Z_]+\s*=\s*', text)
            if match:
                try:
                    model = json.loads(text[match.end():].strip().rstrip(';').strip())
                except json.JSONDecodeError:
                    model = None
                if isinstance(model, dict) and isinstance(model.get('slides'), list):
                    break
    slides = model.get('slides', []) if isinstance(model, dict) else []
    content = manifest.get('content', {}) if isinstance(manifest.get('content'), dict) else {}
    assessment = manifest.get('assessment', {}) if isinstance(manifest.get('assessment'), dict) else {}
    completion = manifest.get('completion', {}) if isinstance(manifest.get('completion'), dict) else {}
    return {
        'course_id': manifest.get('courseId') or (model or {}).get('courseId'),
        'title': (model or {}).get('title'),
        'package_version': manifest.get('packageVersion') or (model or {}).get('packageVersion') or (model or {}).get('version'),
        'source_slide_count': len(slides),
        'source_slide_ids': [s['id'] for s in slides if isinstance(s, dict) and isinstance(s.get('id'), str)],
        'required_slide_ids': content.get('requiredSlides', []),
        'module_assessment_ids': assessment.get('moduleAssessments') or assessment.get('certifyingInteractions') or [],
        'required_interaction_ids': assessment.get('requiredInteractions', []),
        'mastery_score': assessment.get('masteryScore') or (model or {}).get('masteryScore') or (model or {}).get('passingScore'),
        'module_gate_declared': assessment.get('moduleGate') or completion.get('moduleGate'),
        'source_manifest_present': bool(manifest),
    }

def convert(original: bytes, source_name: str, output: Path):
    if len(original) > MAX_NESTED_ZIP:
        raise UnsafePackage('NESTED_ARCHIVE_OVERSIZE')
    with ZipFile(io.BytesIO(original)) as archive:
        files = checked_files(archive)
        metadata = source_metadata(archive, files)
        paths = []
        for path, info in sorted(files.items()):
            raw = archive.read(info)
            paths.append({'path': path, 'sha256': sha(raw), 'bytes': len(raw)})
        contract = {
            'schema': 'AIRTRUST_HTML5_PRESERVED_V1',
            'status': 'REVIEW_ONLY_NOT_PUBLICATION_READY',
            'source': {'original_zip_basename': source_name, 'original_zip_sha256': sha(original)},
            'course': metadata,
            'presentation': {'entry': 'content/index.html',
                             'method': 'BYTE_IDENTICAL_SOURCE', 'files': paths},
            'assessment': {'authority': 'NOT_YET_INTEGRATED',
                           'policy': 'PRESERVE_ORIGINAL_UNTIL_EXPLICIT_REVIEW',
                           'needs_independent_server_grader': True,
                           'risk': 'Authoring JavaScript may contain visible answer keys'},
            'security': {'never_publish_as_public_asset': True,
                         'never_trust_client_score_or_completion': True,
                         'tenant_and_edition_binding_required': True,
                         'browser_isolation_required': True},
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as result:
            result.writestr('player3-content-contract.json',
                            json.dumps(contract, indent=2, ensure_ascii=False, sort_keys=True) + '\n')
            for entry in paths:
                result.writestr('content/' + entry['path'], archive.read(entry['path']))
    with ZipFile(output) as verified:
        for entry in paths:
            if sha(verified.read('content/' + entry['path'])) != entry['sha256']:
                output.unlink(missing_ok=True)
                raise UnsafePackage('BYTE_FIDELITY_MISMATCH')
    return {
        'name': source_name, 'status': contract['status'],
        'course_id': metadata['course_id'], 'source_sha256': sha(original),
        'converted_sha256': sha(output.read_bytes()),
        'files_preserved': len(paths),
        'source_slides': metadata['source_slide_count'],
        'module_assessments': len(metadata['module_assessment_ids']),
        'mastery_score': metadata['mastery_score'],
    }

def main():
    args = argparse.ArgumentParser()
    args.add_argument('archives', nargs='+', type=Path)
    args.add_argument('--output', type=Path, required=True)
    config = args.parse_args()
    config.output.mkdir(parents=True, exist_ok=True)
    results = []
    for batch in config.archives:
        with ZipFile(batch) as archive:
            candidates = [i for i in archive.infolist()
                          if i.filename.lower().endswith('.zip')
                          and not i.filename.startswith('__MACOSX/')
                          and not i.filename.rsplit('/', 1)[-1].startswith('._')]
            for entry in candidates:
                name = Path(entry.filename).name
                try:
                    artifact = config.output / (batch.stem + '__' + name)
                    results.append(convert(archive.read(entry), name, artifact))
                except Exception as error:
                    results.append({'name': name, 'status': 'ERROR', 'error': str(error)})
    report = {'schema': 'AIRTRUST_HTML5_PRESERVED_CONVERSION_BATCH_V1',
              'files': len(results), 'results': results}
    (config.output / 'review-batch.json').write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    print(json.dumps({'files': len(results),
                      'converted': sum(r['status'] == 'REVIEW_ONLY_NOT_PUBLICATION_READY' for r in results),
                      'errors': [r for r in results if r['status'] == 'ERROR']}, ensure_ascii=False))
    if any(r['status'] == 'ERROR' for r in results):
        raise SystemExit(2)

if __name__ == '__main__':
    main()
