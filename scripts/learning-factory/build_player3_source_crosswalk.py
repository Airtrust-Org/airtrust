#!/usr/bin/env python3
"""Create a safe Player3 curriculum CROSSWALK from original nested SCORM ZIPs.

Output is a technical review catalog only: never exposes question text, answer
options, answer keys or lesson bodies, and never declares certification ready.
The HTML/CSS/JS/media remain in their original packages, untouched.

The resulting staged IDs are input to the future session/assessment writer,
NOT evidence that a learner visited or passed the unit.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile, BadZipFile

from convert_preserved_html5 import checked_files, UnsafePackage, MAX_NESTED_ZIP

MAX_SLIDES = 500
def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def _read_model(archive: ZipFile, entries: dict) -> tuple[dict, str]:
    for name, prefix in [
        ('course_data.js', 'window.COURSE_DATA ='),
        ('course-model.js', 'window.AIRTRUST_COURSE_MODEL ='),
    ]:
        info = entries.get(name)
        if not info or info.file_size > 10 * 1024 * 1024:
            continue
        text = archive.read(name).decode('utf-8-sig').strip()
        import re
        matched = re.match(r'^window\\.(?:COURSE_DATA|AIRTRUST_COURSE_MODEL)\\s*=\\s*', text)
        if matched:
            model = json.loads(text[matched.end():].strip().rstrip(';').strip())
            if isinstance(model, dict) and isinstance(model.get('slides'), list):
                return model, name
    raise UnsafePackage('NO_VERIFIABLE_SLIDE_MODEL')

def _module_key(raw: object) -> str | None:
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:120]
    if isinstance(raw, dict):
        for key in ('id','name','title'):
            v = raw.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()[:120]
    return None

def _mode(assessments: list, manifest: dict, model: dict, last_id: str) -> tuple[str, str]:
    a = manifest.get('assessment', {})
    c = manifest.get('completion', {})
    if not isinstance(a, dict) or not isinstance(c, dict):
        return 'REVIEW_REQUIRED', 'MALFORMED_COMPLETION_CONTRACT'
    gate = a.get('moduleGate', c.get('moduleGate', model.get('navigationGate')))
    explicit_module = gate is True or gate == 'module-assessment'
    if explicit_module and assessments:
        return 'MODULE_CERTIFIED_CANDIDATE', 'MODULE_GATES_DECLARED_BY_SOURCE'
    if len(assessments) == 1 and assessments[0]['source_unit_id'] == last_id:
        return 'FINAL_CERTIFIED_CANDIDATE', 'ONE_TERMINAL_ASSESSMENT'
    if not assessments:
        return 'REVIEW_REQUIRED', 'NO_STANDALONE_ASSESSMENT'
    return 'REVIEW_REQUIRED', 'ASSESSMENT_PATTERN_REQUIRES_HUMAN_REVIEW'

def inspect_original_zip(original: bytes, basename: str) -> dict:
    if not isinstance(original, bytes) or len(original) > MAX_NESTED_ZIP:
        raise UnsafePackage('INVALID_ZIP_SIZE')
    with ZipFile(io.BytesIO(original)) as z:
        entries = checked_files(z)
        if 'index.html' not in entries or 'imsmanifest.xml' not in entries:
            raise UnsafePackage('INVALID_SOURCE_HTML5')
        model, model_file = _read_model(z, entries)
        slides = model['slides']
        if len(slides) == 0 or len(slides) > MAX_SLIDES:
            raise UnsafePackage('INVALID_SLIDE_COUNT')
        ids: set[str] = set()
        unit_map: list[dict] = []
        for index, slide in enumerate(slides):
            if not isinstance(slide, dict):
                raise UnsafePackage('INVALID_SLIDE')
            unit_id, kind = slide.get('id'), slide.get('kind')
            if not isinstance(unit_id, str) or not unit_id or len(unit_id) > 80 or (
                not unit_id[0].isalnum()) or not all(c.isascii() and (
                    c.isalnum() or c in '._-') for c in unit_id
            ) or unit_id in ids:
                raise UnsafePackage('INVALID_OR_DUPLICATE_SLIDE_ID')
            if not isinstance(kind, str) or not kind or len(kind) > 50:
                raise UnsafePackage('INVALID_SLIDE_KIND')
            ids.add(unit_id)
            unit_map.append({
                'index_zero_based': index,
                'source_unit_id': unit_id,
                'source_kind': kind,
                'module_ref': _module_key(slide.get('module')),
            })
        manifest = {}
        if 'airtrust-completion-manifest.json' in entries:
            if entries['airtrust-completion-manifest.json'].file_size > 1024 * 1024:
                raise UnsafePackage('MANIFEST_TOO_LARGE')
            manifest = json.loads(z.read('airtrust-completion-manifest.json'))
            if not isinstance(manifest, dict):
                raise UnsafePackage('INVALID_SOURCE_MANIFEST')
        assessments = [u for u in unit_map if u['source_kind'] in ('assessment','quiz')]
        scenarios = [u for u in unit_map if u['source_kind'] == 'scenario']
        mode, reason = _mode(assessments, manifest, model, unit_map[-1]['source_unit_id'])
        a = manifest.get('assessment', {}) if isinstance(manifest.get('assessment', {}), dict) else {}
        raw_score = a.get('masteryScore', model.get('masteryScore', model.get('passingScore')))
        score = raw_score if isinstance(raw_score, int) and not isinstance(raw_score,bool) and 0 <= raw_score <= 100 else None
        # Only metadata; model JSON and answer-bearing JS are never serialized here.
        return {
            'schema':'AIRTRUST_PLAYER3_SOURCE_CROSSWALK_V1',
            'status':'REVIEW_REQUIRED_NOT_DEPLOYABLE',
            'original_zip_basename':basename,
            'original_zip_sha256':digest(original),
            'model_source':model_file,
            'course_id':model.get('courseId') if isinstance(model.get('courseId'),str) else None,
            'package_version':model.get('packageVersion', model.get('version')),
            'source_unit_count':len(unit_map),
            'units':unit_map,
            'assessment_source_ids':[u['source_unit_id'] for u in assessments],
            'scenario_source_ids':[u['source_unit_id'] for u in scenarios],
            'mastery_score_source_claim':score,
            'policy_candidate':mode,
            'policy_review_reason':reason,
            'certification_approved':False,
            'learner_progress_evidence':False,
            'contains_answers':False,
        }

def build_catalog(batches: list[Path]) -> dict:
    courses=[]
    for source in batches:
        with ZipFile(source) as archive:
            names=set()
            for info in archive.infolist():
                if (info.is_dir() or not info.filename.lower().endswith('.zip') or
                    '/._' in info.filename or info.filename.startswith('__MACOSX/') or
                    Path(info.filename).name.startswith('._')):
                    continue
                basename=Path(info.filename).name
                if basename in names:
                    raise UnsafePackage('DUPLICATE_NESTED_SOURCE_BASENAME')
                names.add(basename)
                if info.file_size<=0 or info.file_size>MAX_NESTED_ZIP:
                    raise UnsafePackage('INVALID_NESTED_ZIP_SIZE')
                courses.append(inspect_original_zip(archive.read(info),basename))
    return {
        'schema':'AIRTRUST_PLAYER3_REVIEW_CATALOG_V1',
        'status':'CANDIDATE_NOT_FOR_DEPLOY',
        'course_count':len(courses),
        'course_identities_unique':len({(c['course_id'],c['package_version']) for c in courses})==len(courses),
        'courses':sorted(courses,key=lambda x:x['original_zip_basename']),
    }

def main() -> None:
    p=argparse.ArgumentParser()
    p.add_argument('source_archives',nargs='+',type=Path)
    p.add_argument('--output',required=True,type=Path)
    args=p.parse_args()
    data=build_catalog(args.source_archives)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(data,ensure_ascii=False,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({
        'courses':data['course_count'],
        'policy_candidates':{
            key:sum(c['policy_candidate']==key for c in data['courses'])
            for key in ('MODULE_CERTIFIED_CANDIDATE','FINAL_CERTIFIED_CANDIDATE','REVIEW_REQUIRED')
        },
        'answers_exported':False,'deployment_approved':False,
    }))

if __name__=='__main__':
    main()
