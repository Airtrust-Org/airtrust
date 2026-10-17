"""A reviewed FDM lesson ID is longer than the backend ID limit.

Synthetic fixtures test fail-closed exception and deterministic alias. Original
ZIPs are never checked into Git and the opt-in real-source test stays private.
"""
import hashlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from convert_preserved_html5 import UnsafePackage
from extract_player3_private_assessments import extract, SOURCE_LONG_LESSON_ALLOWLIST, ID
from build_player3_unified_review_batch import private_source_stage_map, unified_review

LONG_ID='comite_admin_027_flight_following_informacoes_de_acompanhamento_nao_sao_julgamento'
SOURCE_SHA='cd4b4cdbe51b750fa5f27ef74d602a197f44700cc040365993695aef8cfb689f'
ALIAS='u-'+hashlib.sha256(LONG_ID.encode()).hexdigest()[:32]


def synthetic_source(long_kind='lesson',long_id=LONG_ID):
    model={'courseId':'synthetic-course','masteryScore':80,'slides':[
        {'id':'intro','kind':'lesson','title':'Intro'},
        {'id':long_id,'kind':long_kind,'title':'Long original author ID'},
        {'id':'final','kind':'assessment','questions':[
            {'q':'Synthetic question (not original)','options':['A','B'],'answer':1}]}]}
    b=io.BytesIO()
    with ZipFile(b,'w') as z:
        z.writestr('index.html','<!doctype html><main>QA</main>')
        z.writestr('imsmanifest.xml','<manifest/>')
        z.writestr('course_data.js','window.COURSE_DATA = '+json.dumps(model)+';')
    return b.getvalue()

class Player3SourceUnitAliasTests(unittest.TestCase):
    def test_exact_original_long_id_is_allowlisted_only_for_pinned_source(self):
        self.assertEqual(SOURCE_LONG_LESSON_ALLOWLIST[SOURCE_SHA],frozenset({LONG_ID}))
        self.assertEqual(len(LONG_ID),82)
        self.assertTrue(ID.fullmatch(ALIAS))
        self.assertFalse(ID.fullmatch(LONG_ID))
        raw=synthetic_source()
        with self.assertRaisesRegex(UnsafePackage,'DUPLICATE_OR_INVALID_UNIT_ID'):
            extract(raw,'synthetic.zip')
        digest=hashlib.sha256(raw).hexdigest()
        with patch.dict(SOURCE_LONG_LESSON_ALLOWLIST,{digest:frozenset({LONG_ID})},clear=True):
            meta,public,bank=extract(raw,'synthetic.zip')
            self.assertEqual(meta['stage_count'],1)
            self.assertEqual(len(bank['questions']),1)
            self.assertNotIn('correctOptionId',json.dumps(public))

    def test_long_exam_id_cannot_be_mapped_into_unapproved_official_stage(self):
        raw=synthetic_source(long_kind='assessment')
        digest=hashlib.sha256(raw).hexdigest()
        with patch.dict(SOURCE_LONG_LESSON_ALLOWLIST,{digest:frozenset({LONG_ID})},clear=True):
            with self.assertRaisesRegex(UnsafePackage,'DUPLICATE_OR_INVALID_UNIT_ID'):
                extract(raw,'synthetic.zip')

    def test_unreviewed_overlength_or_invalid_lesson_id_fails_closed(self):
        for unit_id in ('z'*81,'z'*161,'unidade inválida'):
            raw=synthetic_source(long_id=unit_id)
            with self.subTest(length=len(unit_id)),self.assertRaisesRegex(
                    UnsafePackage,'DUPLICATE_OR_INVALID_UNIT_ID'):
                extract(raw,'synthetic.zip')

    def test_private_crosswalk_preserves_source_and_maps_single_alias(self):
        stages=[{'stageId':'intro','originalKind':'lesson',
                 'candidatePlayer3Type':'content','requiresPedagogicalApproval':False},
                {'stageId':LONG_ID,'originalKind':'lesson',
                 'candidatePlayer3Type':'content','requiresPedagogicalApproval':False},
                {'stageId':'final','originalKind':'assessment',
                 'candidatePlayer3Type':'final_exam','requiresPedagogicalApproval':False}]
        raw=private_source_stage_map(SOURCE_SHA,'a'*64,'b'*64,{'sourceStageCrosswalk':stages})
        self.assertIsNone(raw['targetEditionSha256'])
        self.assertFalse(raw['targetEditionApproved'])
        self.assertFalse(raw['lessonEvidencePersisted'])
        self.assertEqual(raw['sourceUnitCount'],3)
        self.assertEqual([u['canonicalUnitId'] for u in raw['sourceStages']],
                         ['intro',ALIAS,'final'])
        self.assertEqual([u['requiresUnitAlias'] for u in raw['sourceStages']],
                         [False,True,False])
        self.assertEqual(raw['sourceStages'][1]['sourceUnitId'],LONG_ID)
        self.assertTrue(all(ID.fullmatch(u['canonicalUnitId']) for u in raw['sourceStages']))

    def test_crosswalk_refuses_long_assessment_alias(self):
        stage={'stageId':LONG_ID,'originalKind':'assessment',
               'candidatePlayer3Type':'module_exam','requiresPedagogicalApproval':False}
        with self.assertRaisesRegex(UnsafePackage,'SOURCE_STAGE_MAP_INVALID'):
            private_source_stage_map(SOURCE_SHA,'a'*64,'b'*64,
                                     {'sourceStageCrosswalk':[stage]})

    @unittest.skipUnless(os.getenv('AIRTRUST_PLAYER3_ORIGINAL_SMS_ZIP') and
                         os.getenv('AIRTRUST_PLAYER3_ORIGINAL_OPERATIONAL_ZIP'),
                         'Original packages private; opt-in source-backed validation')
    def test_complete_22_source_batch_real_opt_in(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            batches=[Path(os.environ['AIRTRUST_PLAYER3_ORIGINAL_SMS_ZIP']),
                     Path(os.environ['AIRTRUST_PLAYER3_ORIGINAL_OPERATIONAL_ZIP'])]
            result=unified_review(batches,root/'private',root/'learner','https://airtrust.online')
            self.assertEqual(result['adaptedReviewEditions'],22)
            self.assertEqual(result['approvedForStudents'],0)
            self.assertEqual(len(list((root/'private').glob('edition-*/player3-source-stage-crosswalk-review.json'))),22)
            self.assertEqual(sum(row['sourceUnitCount'] for row in result['courses']),674)
            self.assertEqual(sum(row['stageCount'] for row in result['courses']),63)
            self.assertEqual(sum(row['questionCount'] for row in result['courses']),570)
            self.assertEqual(sum(sum(u['requiresUnitAlias'] for u in
                json.loads(path.read_text())['sourceStages'])
                for path in (root/'private').glob('edition-*/player3-source-stage-crosswalk-review.json')),1)

if __name__=='__main__':unittest.main()