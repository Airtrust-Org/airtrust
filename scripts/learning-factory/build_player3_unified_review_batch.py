#!/usr/bin/env python3
"""Player3 one-shot SHA-pinned PRIVATE REVIEW factory for 22 HTML5 editions.

These are nonpublishable learning candidates, NOT approved Player3 editions.
No real evaluation, content evidence, enrollment or certificate is persisted.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from zipfile import ZipFile

from build_player3_html5_review_batch import KNOWN_SOURCES_BY_SHA, candidates
from build_player3_rc81_bridge_review import SOURCE_ZIP_SHA256, compile_rc81_review
from build_player3_standard_journey_review import SOURCES as STANDARD, compile_standard_review
from build_player3_v3_review import SOURCES as V33, FORMATIVE_ZIPS, compile_v33_review
from build_player3_legacy_review import SOURCES as LEGACY, compile_legacy_review
from build_player3_sgso_review import SOURCES as SGSO, compile_sgso_review
from build_player3_residuos_review import SOURCE_ZIP as RESIDUOS, compile_residuos_review
from convert_preserved_html5 import UnsafePackage
from extract_player3_private_assessments import _safe_output_pair, _write_exclusive, extract
from prepare_player3_learner_review import compile_review

VENDOR_UNSUPPORTED = frozenset()  # Formerly blocked sources now have pinned adapters.
ADAPTED=frozenset([SOURCE_ZIP_SHA256,*STANDARD,*V33,*LEGACY,*SGSO,RESIDUOS])
if len(ADAPTED)!=22 or len(SGSO)!=2 or RESIDUOS not in ADAPTED:
    raise RuntimeError('PLAYER3_BROKEN_SOURCE_REGISTRY')


def review_binding_sha256(original_sha256:str)->str:
    """NEVER edition/content SHA: synthetic temporary QA-only binding.

    This cannot accidentally be mistaken for source SHA or approved R2 edition.
    The backend must replace it with a truly governed edition SHA and rebuild.
    """
    return hashlib.sha256(('AIRTRUST_PLAYER3_REVIEW_ONLY_BINDING_V1:'+original_sha256).encode()).hexdigest()


def compile_safe_review(raw: bytes, name: str, origin: str):
    digest=hashlib.sha256(raw).hexdigest()
    if digest not in ADAPTED:
        raise UnsafePackage('PLAYER3_UNRECOGNIZED_SOURCE_SHA')
    binding=review_binding_sha256(digest)
    if digest==SOURCE_ZIP_SHA256:
        edition,meta,public,bank,receipt=compile_rc81_review(raw,origin,binding)
    elif digest in STANDARD:
        edition,meta,public,bank,receipt=compile_standard_review(raw,name,origin,binding)
    elif digest in V33:
        edition,meta,public,bank,receipt=compile_v33_review(raw,name,origin,binding)
    elif digest in SGSO:
        edition,meta,public,bank,receipt=compile_sgso_review(raw,origin,binding)
    elif digest == RESIDUOS:
        edition,meta,public,bank,receipt=compile_residuos_review(raw,origin,binding)
    else:
        edition,meta,public,bank,receipt=compile_legacy_review(raw,name,origin,binding)
    # No lineage is approved before the content and authoritative server policy
    # have been verified in staging under an edition/cycle/tenant ledger.
    if receipt.get('publishable') is not False or receipt.get('stageContractApproved') is not False:
        raise UnsafePackage('PLAYER3_UNAPPROVED_EDITION_CONTRACT')
    return edition,meta,public,bank,receipt,binding


def private_source_stage_map(source_sha: str, review_sha: str, binding_sha: str,
                             receipt: dict) -> dict:
    """Evidence candidate; only an authenticated future edition gets a target SHA.

    Never interpret a review ZIP digest or synthetic iframe binding as an
    approved Player3 target edition. The original stage IDs remain immutable.
    """
    import re
    original = receipt.get('sourceStageCrosswalk')
    if (not isinstance(original, list) or not 1 <= len(original) <= 500):
        raise UnsafePackage('PLAYER3_SOURCE_STAGE_MAP_MISSING')
    ids=set()
    stages=[]
    for index, row in enumerate(original):
        if not isinstance(row, dict):
            raise UnsafePackage('PLAYER3_SOURCE_STAGE_MAP_INVALID')
        stage_id=row.get('stageId')
        kind=row.get('originalKind')
        typ=row.get('candidatePlayer3Type')
        review=row.get('requiresPedagogicalApproval')
        if (not isinstance(stage_id,str) or
            not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}',stage_id) or
            stage_id in ids or not isinstance(kind,str) or not 1 <= len(kind) <= 80 or
            (typ is not None and typ not in ('content','practice','module_exam','final_exam')) or
            type(review) is not bool):
            raise UnsafePackage('PLAYER3_SOURCE_STAGE_MAP_INVALID')
        ids.add(stage_id)
        stages.append({'sourceOrder':index,'sourceUnitId':stage_id,
                       'sourceKind':kind,'candidatePlayer3Type':typ,
                       'requiresPedagogicalApproval':review})
    canonical=json.dumps(stages,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf8')
    return {
        'schema':'AIRTRUST_PLAYER3_PRIVATE_SOURCE_STAGE_CROSSWALK_REVIEW_V1',
        'sourceEditionSha256':source_sha,
        'reviewZipSha256':review_sha,
        'reviewOnlyBindingSha256':binding_sha,
        'targetEditionSha256':None,
        'targetEditionApproved':False,
        'lessonEvidencePersisted':False,
        'sourceUnitIdsSha256':hashlib.sha256(canonical).hexdigest(),
        'sourceUnitCount':len(stages),
        'sourceLessonCandidateCount':sum(x['candidatePlayer3Type']=='content' for x in stages),
        'sourceStages':stages,
    }


def unified_review(batches:list[Path], private_output:Path, learner_output:Path,
                   parent_origin:str):
    from build_player3_rc81_bridge_review import _host_origin
    _host_origin(parent_origin)
    private,learner=_safe_output_pair(private_output,learner_output)
    if len(batches)!=2:
        raise UnsafePackage('PLAYER3_REQUIRE_BOTH_SOURCE_ARCHIVES')
    digests=[]
    for p in batches:
        if not p.is_file() or p.is_symlink() or p.stat().st_size>220*1024*1024:
            raise UnsafePackage('PLAYER3_INVALID_BATCH_PATH')
        digests.append(hashlib.sha256(p.read_bytes()).hexdigest())
    if set(digests)!=set(KNOWN_SOURCES_BY_SHA):
        raise UnsafePackage('PLAYER3_BOTH_PINNED_BATCHES_REQUIRED')
    # Preflight the ENTIRE batch before touching output paths. Keep private keys
    # only in memory, then in chmod 0600 private directory outside repo/Drive.
    verified=[]
    seen=set()
    for outer,name,raw in candidates(batches):
        digest=hashlib.sha256(raw).hexdigest()
        if digest in seen:raise UnsafePackage('PLAYER3_DUPLICATE_EDITION')
        seen.add(digest)
        edition,meta,public,bank,receipt,binding=compile_safe_review(raw,name,parent_origin)
        stage_map=private_source_stage_map(
            digest,hashlib.sha256(edition).hexdigest(),binding,receipt)
        verified.append((outer,name,digest,edition,meta,public,bank,receipt,binding,stage_map))
    if seen!=ADAPTED or len(verified)!=22:
        raise UnsafePackage('PLAYER3_22_SOURCE_COVERAGE_MISMATCH')
    summary={'schema':'AIRTRUST_PLAYER3_22_FAMILY_REVIEW_BATCH_V1',
       'status':'REVIEW_ONLY_NEVER_DEPLOY','totalOriginals':22,
       'adaptedReviewEditions':len(verified),'supplierRuntimeBlocked':0,
       'approvedForStudents':0,'remoteWrites':False,'allCoursesPublishable':False,
       'blocked':[],'courses':[]}
    created=[]
    try:
        private.mkdir(mode=0o700)
        created.append(private)
        learner.mkdir(mode=0o700)
        created.append(learner)
        for n,(outer,name,digest,edition,meta,public,bank,receipt,binding,stage_map) in enumerate(verified,1):
            vault=private/('edition-'+str(n));qadir=learner/('edition-'+str(n))
            vault.mkdir(mode=0o700)
            qadir.mkdir(mode=0o700)
            _write_exclusive(vault/'player3-server-only-bank.json',bank)
            _write_exclusive(vault/'player3-private-review-metadata.json',meta)
            _write_exclusive(vault/'player3-source-stage-crosswalk-review.json',stage_map)
            _write_exclusive(qadir/'player3-learner-question-projection.json',public)
            path=qadir/'player3-HTML5-REVIEW-ONLY-NOT-DEPLOYABLE.zip'
            fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,'wb') as f:f.write(edition)
            summary['courses'].append({
                'sourceArchive':outer,'originalPackage':name,'source_sha256':digest,
                'reviewZipSha256':hashlib.sha256(edition).hexdigest(),
                'reviewOnlyBindingSha256':binding,'adapter':receipt.get('adapter'),
                'targetEditionSha256':None,'sourceUnitCount':stage_map['sourceUnitCount'],
                'sourceLessonCandidateCount':stage_map['sourceLessonCandidateCount'],
                'sourceUnitIdsSha256':stage_map['sourceUnitIdsSha256'],
                'sourceStageMapApproved':False,
                'stageCount':meta['stage_count'],'questionCount':meta['question_count'],
                'formativePolicyReviewRequired':digest in FORMATIVE_ZIPS,
                'stageContractApproved':False,'publishable':False})
        _write_exclusive(private/'22-course-private-summary.json',summary)
    except BaseException:
        for p in reversed(created):shutil.rmtree(p,ignore_errors=True)
        raise
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original_batches',nargs=2,type=Path)
    parser.add_argument('--parent-origin',required=True)
    parser.add_argument('--private-output',required=True,type=Path)
    parser.add_argument('--learner-review-output',required=True,type=Path)
    a=parser.parse_args();os.umask(0o077)
    summary=unified_review(a.original_batches,a.private_output,a.learner_review_output,a.parent_origin)
    print(json.dumps({'status':summary['status'], 'totalOriginals':22,
        'adaptedReviewEditions':22,'supplierRuntimeBlocked':0,'approvedForStudents':0},ensure_ascii=False))
if __name__=='__main__':main()