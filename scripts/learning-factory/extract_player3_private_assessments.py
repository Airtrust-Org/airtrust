#!/usr/bin/env python3
"""Player 3 private question extraction (READ ONLY originals, NEVER deploys).

Accepted authoring sources:
- course_data.js: slides[].questions[{q,options,answer,explain}]
- course-model.js SGSO: slides[].questions[{text,options,correct,feedback}]
- course-model.js Residuos: assessment.questions[{id,q,a,correct}]
This keeps authored question text, answer and feedback BYTE/character faithful
in a restricted private Worker-bank candidate. A separate learner projection
omits keys and explanations. Neither candidate may be published before review
and de-keying all learner-served original JS, with stage policy approval.
No client score, SCORM status, answer, or guessed passing grade is accepted.
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

from convert_preserved_html5 import checked_files, UnsafePackage, MAX_NESTED_ZIP

ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')
COURSE = re.compile(r'^window\.(?:COURSE_DATA|AIRTRUST_COURSE_MODEL)\s*=\s*')
LIMIT_QUESTIONS = 500
LIMIT_QUESTION_TEXT = 4000
LIMIT_OPTIONS = 10

def fail(reason: str):
    raise UnsafePackage('PLAYER3_BANK_' + reason)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def serialize(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf8')

def load_model(archive: ZipFile, entries: dict) -> dict:
    for name in ('course_data.js', 'course-model.js'):
        if name not in entries:
            continue
        if entries[name].file_size > 10 * 1024 * 1024:
            fail('OVERSIZED_MODEL')
        text = archive.read(name).decode('utf-8-sig').strip()
        matched = COURSE.match(text)
        if not matched:
            fail('MODEL_NOT_LITERAL_JSON')
        try:
            parsed = json.loads(text[matched.end():].strip().rstrip(';').strip())
        except (ValueError, TypeError):
            fail('MODEL_NOT_JSON')
        if not isinstance(parsed, dict) or not isinstance(parsed.get('slides'), list):
            fail('INVALID_MODEL')
        return parsed
    fail('MISSING_MODEL')

def extract_question(q: dict, stage: str, i: int) -> tuple[dict, dict]:
    if not isinstance(q, dict):
        fail('INVALID_QUESTION')
    if 'answer' in q and 'options' in q and 'q' in q:
        prompt, options, correct, feedback = (
            q['q'], q['options'], q['answer'], q.get('explain'))
    elif 'correct' in q and 'options' in q and 'text' in q:
        prompt, options, correct, feedback = (
            q['text'], q['options'], q['correct'], q.get('feedback'))
    elif 'correct' in q and 'a' in q and 'q' in q:
        prompt, options, correct, feedback = (
            q['q'], q['a'], q['correct'], None)
    else:
        fail('UNSUPPORTED_QUESTION_SCHEMA')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > LIMIT_QUESTION_TEXT:
        fail('INVALID_PROMPT')
    if not isinstance(options, list) or not 2 <= len(options) <= LIMIT_OPTIONS or (
        any(not isinstance(o, str) or not o.strip() or len(o)>2000
            for o in options)):
        fail('INVALID_OPTIONS')
    if not isinstance(correct, int) or isinstance(correct, bool) or (
        correct < 0 or correct >= len(options)):
        fail('UNSAFE_CORRECT_OPTION')
    if feedback is not None and (not isinstance(feedback, str) or len(feedback)>LIMIT_QUESTION_TEXT):
        fail('INVALID_FEEDBACK')
    # IDs are deterministic, tied to original stage, zero-based question order,
    # and cannot overflow Player3's strict backend ID validator.
    question_id = 'q-' + sha((stage + ':' + str(i)).encode('utf8'))[:32]
    public = {
        'id': question_id, 'prompt': prompt,
        'options': [{'id': 'o'+str(n), 'text': text}
                    for n, text in enumerate(options)],
    }
    private = {
        'id': question_id, 'stageId': stage,
        'options': ['o'+str(n) for n in range(len(options))],
        'correctOptionId': 'o'+str(correct),
        'feedbackCorrect': feedback or '',
        'feedbackIncorrect': feedback or '',
    }
    return public, private

def extract(original: bytes, basename: str) -> tuple[dict, dict, dict]:
    if not isinstance(original, bytes) or len(original) > MAX_NESTED_ZIP:
        fail('SOURCE_SIZE')
    with ZipFile(io.BytesIO(original)) as archive:
        entries = checked_files(archive)
        if 'index.html' not in entries or 'imsmanifest.xml' not in entries:
            fail('NOT_SCORM_HTML5')
        model = load_model(archive, entries)
        slides = model['slides']
        if not slides or len(slides)>500:
            fail('INVALID_UNIT_COUNT')
        manifest = {}
        if 'airtrust-completion-manifest.json' in entries:
            if entries['airtrust-completion-manifest.json'].file_size>1_000_000:
                fail('OVERSIZED_MANIFEST')
            manifest=json.loads(archive.read('airtrust-completion-manifest.json'))
            if not isinstance(manifest,dict):
                fail('INVALID_MANIFEST')
        details=manifest.get('assessment') if isinstance(manifest.get('assessment'),dict) else {}
        model_assessment=model.get('assessment') if isinstance(model.get('assessment'),dict) else {}
        mastery=details.get('masteryScore',model_assessment.get('masteryScore',
            model.get('masteryScore',model.get('passingScore'))))
        if not isinstance(mastery,int) or isinstance(mastery,bool) or not 1<=mastery<=100:
            mastery=None
        stages=[]
        seen=set()
        assessment_stages=[]
        for slide in slides:
            if not isinstance(slide,dict):
                fail('INVALID_UNIT')
            sid=slide.get('id')
            if not isinstance(sid,str) or not ID.fullmatch(sid) or sid in seen:
                fail('DUPLICATE_OR_INVALID_UNIT_ID')
            seen.add(sid)
            if slide.get('kind') in ('assessment','quiz'):
                assessment_stages.append(slide)
        if not assessment_stages:
            fail('NO_ASSESSMENT_STAGE')
        if len(assessment_stages)>1 and isinstance(model_assessment.get('questions'),list):
            fail('AMBIGUOUS_ROOT_QUESTIONS')
        public_stages=[]
        private_questions=[]
        count=0
        for slide in assessment_stages:
            sid=slide['id']
            questions=slide.get('questions')
            if not isinstance(questions,list) or not questions:
                if len(assessment_stages)==1 and isinstance(model_assessment.get('questions'),list):
                    questions=model_assessment['questions']
                else:
                    fail('EMPTY_STAGE_BANK')
            projection=[]
            for i,q in enumerate(questions):
                public,private=extract_question(q,sid,i)
                projection.append(public)
                private_questions.append(private)
            if len(projection)>100:
                fail('STAGE_QUESTION_LIMIT')
            count+=len(projection)
            if count>LIMIT_QUESTIONS:
                fail('OVERLOADED_BANK')
            public_stages.append({'stageId':sid,'questions':projection})
        if len({q['id'] for q in private_questions}) != len(private_questions):
            fail('DUPLICATE_QUESTION_ID')
        source_hash=sha(original)
        course_id=model.get('courseId')
        if not isinstance(course_id,str) or not ID.fullmatch(course_id):
            fail('INVALID_COURSE_ID')
        module_gate=(
            details.get('moduleGate') is True or
            model.get('navigationGate')=='module-assessment' or
            (isinstance(manifest.get('completion'),dict) and
             manifest['completion'].get('moduleGate') is True)
        )
        if module_gate:
            mode='MODULE_CERTIFIED_CANDIDATE'
        elif len(assessment_stages)==1 and assessment_stages[0] is slides[-1]:
            mode='FINAL_CERTIFIED_CANDIDATE'
        else:
            mode='REVIEW_REQUIRED'
        meta={
            'schema':'AIRTRUST_PLAYER3_BANK_EXTRACTION_REPORT_V1',
            'status':'PRIVATE_REVIEW_ONLY_NOT_DEPLOYABLE',
            'original_basename':basename,
            'original_source_sha256':source_hash,
            'courseId':course_id,
            'sourceVersion':model.get('packageVersion',model.get('version')),
            'stage_count':len(public_stages),
            'question_count':count,
            'masteryScoreCandidate':mastery,
            'certificationModeCandidate':mode,
            'certificationApproved':False,
            'originalJsHasAnswers':True,
            'assetsApprovedForLearners':False,
        }
        learner={
            'schema':'AIRTRUST_PLAYER3_LEARNER_PROJECTION_REVIEW_V1',
            'source_sha256':source_hash,
            'courseId':course_id,
            'stages':public_stages,
            'certificationApproved':False,
        }
        bank={
            'schema':'AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1',
            'source_sha256':source_hash,
            'courseId':course_id,
            'questions':private_questions,
            'PRIVATE_NEVER_SERVE_TO_BROWSER':True,
        }
        return meta,learner,bank

def _safe_output_pair(private_output: Path, learner_output: Path) -> tuple[Path, Path]:
    """Never put answer keys under a learner/static/repo/Drive subtree."""
    if not private_output.is_absolute() or not learner_output.is_absolute():
        fail('OUTPUT_PATH_MUST_BE_ABSOLUTE')
    private = private_output.resolve()
    learner = learner_output.resolve()
    repo_root = Path(__file__).resolve().parents[2]
    for path in (private,learner):
        if path in (repo_root, repo_root.parent) or path.is_relative_to(repo_root):
            fail('REPO_OUTPUT_FORBIDDEN')
        if any(part.lower() in ('cloudstorage','google drive','airtrust-drive-cloud')
               for part in path.parts):
            fail('SHARED_DRIVE_OUTPUT_FORBIDDEN')
        if path.exists() or path.is_symlink():
            fail('OUTPUT_ALREADY_EXISTS')
        if not path.parent.is_dir():
            fail('OUTPUT_PARENT_MISSING')
    if private == learner or private.is_relative_to(learner) or learner.is_relative_to(private):
        fail('OUTPUT_ROOTS_MUST_BE_SEPARATE')
    return private,learner

def _write_exclusive(path: Path, payload: dict) -> None:
    import stat
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        with os.fdopen(fd,'wb') as out:
            out.write(serialize(payload))
        if stat.S_IMODE(path.stat().st_mode)!=0o600:
            fail('INSECURE_FILE_MODE')
    except BaseException:
        path.unlink(missing_ok=True)
        raise

def build(batches: list[Path], private_output: Path, learner_output: Path)-> dict:
    """Validate ALL sources before making ANY output directory.

    The original HTML5 package, including its embedded quiz logic, is never
    repacked or marked approved. A separate de-keyed browser asset pipeline
    remains a required pre-publication task.
    """
    private,learner_review=_safe_output_pair(private_output,learner_output)
    entries=[]
    seen=set()
    for batch in batches:
        if not batch.is_file() or batch.is_symlink() or batch.stat().st_size>MAX_NESTED_ZIP:
            fail('INVALID_SOURCE_FILE')
        with ZipFile(batch) as outer:
            names={i.filename for i in outer.infolist()}
            # Support original authoring packages directly, without making a
            # second ZIP copy. A batch is recognized by nested *.zip members.
            if 'index.html' in names and 'imsmanifest.xml' in names:
                source_packages=[(batch.name,batch.read_bytes())]
            else:
                source_packages=[]
                for info in outer.infolist():
                    if (info.is_dir() or not info.filename.lower().endswith('.zip') or
                        info.filename.startswith('__MACOSX/') or
                        Path(info.filename).name.startswith('._')):
                        continue
                    basename=Path(info.filename).name
                    if info.file_size<=0 or info.file_size>MAX_NESTED_ZIP:
                        fail('NESTED_ZIP_SIZE')
                    source_packages.append((basename,outer.read(info)))
            for basename,original in source_packages:
                meta,projection,bank=extract(original,basename)
                unique=(meta['courseId'],meta['original_source_sha256'])
                if unique in seen:
                    fail('DUPLICATE_EDITION')
                seen.add(unique)
                if len(seen)>100:
                    fail('TOO_MANY_EDITIONS')
                entries.append((meta,projection,bank))
    if not entries:
        fail('NO_SUPPORTED_SOURCE_ZIPS')
    report={
        'schema':'AIRTRUST_PLAYER3_PRIVATE_EXTRACTION_SUMMARY_V1',
        'course_editions':len(entries),
        'stages':sum(c['stage_count'] for c,_,__ in entries),
        'questions':sum(c['question_count'] for c,_,__ in entries),
        'requires_review':sum(c['certificationModeCandidate']=='REVIEW_REQUIRED'
                              or c['masteryScoreCandidate'] is None for c,_,__ in entries),
        'answer_keys_exported_to_git':False,
        'published_to_r2':False,
        'details':[{k:v for k,v in meta.items() if k!='original_basename'}
                   for meta,_,__ in entries],
    }
    # Both destination directories are created by this call and never reused.
    # On failure, delete only our own newly-created outputs.
    import shutil
    created=[]
    try:
        for root in (private,learner_review):
            root.mkdir(mode=0o700)
            created.append(root)
        for meta,projection,bank in entries:
            key=meta['original_source_sha256'][:20]
            _write_exclusive(private/(key+'-server-only-bank.json'),bank)
            _write_exclusive(private/(key+'-private-review.json'),meta)
            _write_exclusive(learner_review/(key+'-learner-review.json'),projection)
        _write_exclusive(private/'private-review-summary.json',report)
    except BaseException:
        for root in reversed(created):
            shutil.rmtree(root)
        raise
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source_archives',nargs='+',type=Path)
    parser.add_argument('--private-output',required=True,type=Path,
        help='Absolute private filesystem directory outside repo/Drive; created 0700')
    parser.add_argument('--learner-review-output',required=True,type=Path,
        help='Separate absolute directory for de-keyed learner questions, REVIEW ONLY')
    args=parser.parse_args()
    report=build(args.source_archives,args.private_output,args.learner_review_output)
    print(json.dumps({
        'course_editions':report['course_editions'],
        'assessment_stages':report['stages'],
        'questions':report['questions'],
        'requiring_explicit_review':report['requires_review'],
        'deployable':False,'keys_logged':False,
    }))
