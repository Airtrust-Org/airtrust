"""Unified Player3 author conversion factory guards, without answer keys in CI."""
import hashlib
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile
import build_player3_unified_review_batch as factory
from build_player3_unified_review_batch import (
    ADAPTED,VENDOR_UNSUPPORTED,review_binding_sha256,compile_safe_review,
    private_source_stage_map,unified_review,
)
from build_player3_html5_review_batch import KNOWN_SOURCES_BY_SHA
from convert_preserved_html5 import UnsafePackage

class Player3UnifiedBatchTests(unittest.TestCase):
    def test_source_coverage_22_review_only_and_none_published(self):
        self.assertEqual(len(ADAPTED),22)
        self.assertEqual(len(VENDOR_UNSUPPORTED),0)
        self.assertFalse(ADAPTED & VENDOR_UNSUPPORTED)
        self.assertEqual(len(KNOWN_SOURCES_BY_SHA),2)
        for sha in ADAPTED | VENDOR_UNSUPPORTED:
            self.assertRegex(sha,r'^[0-9a-f]{64}$')

    def test_review_binding_not_source_sha_and_stable(self):
        digest=next(iter(ADAPTED))
        a=review_binding_sha256(digest)
        self.assertRegex(a,r'^[0-9a-f]{64}$')
        self.assertNotEqual(a,digest)
        self.assertEqual(a,review_binding_sha256(digest))
        self.assertNotEqual(a,review_binding_sha256('0'*64))

    def test_unknown_zip_fails_closed(self):
        # Authoritative digest is verified from actual source bytes;
        # arbitrary data cannot spoof a known supplier key.
        for raw in (b'not-a-zip',b'edited archive'):
            with self.assertRaisesRegex(UnsafePackage,'UNRECOGNIZED_SOURCE_SHA'):
                compile_safe_review(raw,'fake.zip','https://airtrust.online')

    def test_invalid_source_count_and_no_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            bad=root/'unapproved.zip';bad.write_bytes(b'bad')
            private=root/'private'; learner=root/'learner'
            with self.assertRaisesRegex(UnsafePackage,'REQUIRE_BOTH_SOURCE_ARCHIVES'):
                unified_review([bad],private,learner,'https://airtrust.online')
            self.assertFalse(private.exists());self.assertFalse(learner.exists())
            with self.assertRaisesRegex(UnsafePackage,'BOTH_PINNED_BATCHES_REQUIRED'):
                unified_review([bad,bad],private,learner,'https://airtrust.online')
            self.assertFalse(private.exists());self.assertFalse(learner.exists())


class Player3UnifiedBatchWriteTests(unittest.TestCase):
    """Real unified write pipeline with 22 *synthetic* outer ZIP fixtures.

    The per-course compiler is mocked here: this proves orchestration, hash
    coverage, fail-before-write and directory isolation, NOT real-course QA.
    """

    def fixture(self, root):
        batches=[]
        sources={}
        known={}
        for side,count in enumerate((9,13)):
            entries={}
            for idx in range(count):
                name=f'course-{side}-{idx}.zip'
                raw=f'SYNTHETIC-SOURCE-{side}-{idx}'.encode('ascii')
                entries[name]=raw
                sources[hashlib.sha256(raw).hexdigest()]=raw
            out=io.BytesIO()
            with ZipFile(out,'w') as archive:
                for name,raw in entries.items():
                    archive.writestr(name,raw)
            path=root/f'package-batch-{side}.zip'
            path.write_bytes(out.getvalue())
            known[hashlib.sha256(path.read_bytes()).hexdigest()]=(str(side),count)
            batches.append(path)
        self.assertEqual(len(sources),22)
        return batches,known,frozenset(sources)

    def compiler(self,raw,name,origin):
        digest=hashlib.sha256(raw).hexdigest()
        self.assertEqual(origin,'https://airtrust.online')
        out=io.BytesIO()
        with ZipFile(out,'w') as artifact:
            artifact.writestr('index.html','<p>QA only. No learner certification</p>')
            artifact.writestr('player3-review-manifest.json',
                              '{"publishable":false,"stageContractApproved":false}')
        meta={'courseId':'synthetic-'+digest[:12],'stage_count':1,'question_count':1}
        public={'stages':[{'stageId':'synthetic-stage','questions':[]}]}
        private={'PRIVATE_NEVER_SERVE_TO_BROWSER':True,
                 'questions':[{'id':'private-qa','correctOptionId':'o1'}]}
        receipt={'adapter':'SYNTHETIC_TEST_ONLY','publishable':False,
                 'stageContractApproved':False,
                 'sourceStageCrosswalk':[{'stageId':'unit-1','originalKind':'lesson',
                    'candidatePlayer3Type':'content','requiresPedagogicalApproval':False},
                    {'stageId':'synthetic-stage','originalKind':'assessment',
                    'candidatePlayer3Type':'final_exam','requiresPedagogicalApproval':False}]}
        return (out.getvalue(),meta,public,private,receipt,
                factory.review_binding_sha256(digest))

    def test_22_edition_atomic_output_without_private_key_in_learner(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            batches,known,source_digests=self.fixture(root)
            private=root/'private'
            learner=root/'learner'
            with patch.dict(KNOWN_SOURCES_BY_SHA,known,clear=True), \
                 patch.object(factory,'ADAPTED',source_digests), \
                 patch.object(factory,'compile_safe_review',side_effect=self.compiler):
                result=factory.unified_review(batches,private,learner,'https://airtrust.online')
            self.assertEqual(result['totalOriginals'],22)
            self.assertEqual(result['adaptedReviewEditions'],22)
            self.assertEqual(result['supplierRuntimeBlocked'],0)
            self.assertEqual(result['approvedForStudents'],0)
            self.assertFalse(result['allCoursesPublishable'])
            self.assertFalse(result['remoteWrites'])
            self.assertEqual(len(result['courses']),22)
            self.assertEqual(stat.S_IMODE(private.stat().st_mode),0o700)
            self.assertEqual(stat.S_IMODE(learner.stat().st_mode),0o700)
            summary=json.loads((private/'22-course-private-summary.json').read_text())
            self.assertEqual(len(summary['courses']),22)
            for row in result['courses']:
                self.assertFalse(row['publishable'])
                self.assertFalse(row['stageContractApproved'])
                self.assertNotEqual(row['source_sha256'],row['reviewOnlyBindingSha256'])
            editions=list(learner.glob('edition-*/*.zip'))
            self.assertEqual(len(editions),22)
            self.assertEqual(len(list(private.glob('edition-*/player3-server-only-bank.json'))),22)
            crosswalk_files=list(private.glob('edition-*/player3-source-stage-crosswalk-review.json'))
            self.assertEqual(len(crosswalk_files),22)
            self.assertFalse(list(learner.rglob('*crosswalk*')))
            for file in crosswalk_files:
                self.assertEqual(stat.S_IMODE(file.stat().st_mode),0o600)
                crosswalk=json.loads(file.read_text())
                self.assertEqual(crosswalk['targetEditionSha256'],None)
                self.assertFalse(crosswalk['targetEditionApproved'])
                self.assertFalse(crosswalk['lessonEvidencePersisted'])
                self.assertEqual(crosswalk['sourceUnitCount'],2)
                self.assertEqual(crosswalk['sourceLessonCandidateCount'],1)
                self.assertEqual([row['sourceUnitId'] for row in crosswalk['sourceStages']],
                                 ['unit-1','synthetic-stage'])
                self.assertTrue(crosswalk['sourceUnitIdsSha256'])
            for row in result['courses']:
                self.assertIsNone(row['targetEditionSha256'])
                self.assertFalse(row['sourceStageMapApproved'])
                self.assertEqual(row['sourceUnitCount'],2)
            self.assertFalse(list(learner.rglob('*server-only-bank.json')))
            for path in editions:
                self.assertEqual(stat.S_IMODE(path.stat().st_mode),0o600)
                with ZipFile(path) as archive:
                    contents=b''.join(archive.read(name) for name in archive.namelist())
                    self.assertNotIn(b'correctOptionId',contents)

    def test_source_stage_crosswalk_refuses_duplicates_and_false_approval(self):
        digest='a'*64
        stage={'stageId':'u1','originalKind':'lesson','candidatePlayer3Type':'content',
               'requiresPedagogicalApproval':False}
        base={'sourceStageCrosswalk':[stage]}
        valid=private_source_stage_map(digest,'b'*64,'c'*64,base)
        self.assertEqual(valid['sourceStages'][0]['sourceUnitId'],'u1')
        self.assertIsNone(valid['targetEditionSha256'])
        for broken in (
            {'sourceStageCrosswalk':[]},
            {'sourceStageCrosswalk':[stage,stage]},
            {'sourceStageCrosswalk':[dict(stage,stageId='../bad')]},
            {'sourceStageCrosswalk':[dict(stage,requiresPedagogicalApproval=1)]},
            {'sourceStageCrosswalk':[dict(stage,candidatePlayer3Type='certificate')]},
        ):
            with self.subTest(broken=broken), self.assertRaises(UnsafePackage):
                private_source_stage_map(digest,'b'*64,'c'*64,broken)

    def test_compile_error_before_write_leaves_no_partial_artifacts(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            batches,known,source_digests=self.fixture(root)
            private=root/'private';learner=root/'learner'
            attempts=[0]
            def fail_midbatch(raw,name,origin):
                attempts[0]+=1
                if attempts[0]==15:
                    raise UnsafePackage('SYNTHETIC_PRECHECK_FAILURE')
                return self.compiler(raw,name,origin)
            with patch.dict(KNOWN_SOURCES_BY_SHA,known,clear=True), \
                 patch.object(factory,'ADAPTED',source_digests), \
                 patch.object(factory,'compile_safe_review',side_effect=fail_midbatch):
                with self.assertRaisesRegex(UnsafePackage,'SYNTHETIC_PRECHECK_FAILURE'):
                    factory.unified_review(batches,private,learner,'https://airtrust.online')
            self.assertEqual(attempts[0],15)
            self.assertFalse(private.exists())
            self.assertFalse(learner.exists())

    def test_disk_write_error_rolls_back_22_review_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            batches,known,source_digests=self.fixture(root)
            private=root/'private';learner=root/'learner'
            real_writer=factory._write_exclusive
            count=[0]
            def fail_write(path,data):
                count[0]+=1
                if count[0]==21:
                    raise OSError('SYNTHETIC_DISK_IO_FAILURE')
                return real_writer(path,data)
            with patch.dict(KNOWN_SOURCES_BY_SHA,known,clear=True), \
                 patch.object(factory,'ADAPTED',source_digests), \
                 patch.object(factory,'compile_safe_review',side_effect=self.compiler), \
                 patch.object(factory,'_write_exclusive',side_effect=fail_write):
                with self.assertRaisesRegex(OSError,'SYNTHETIC_DISK_IO_FAILURE'):
                    factory.unified_review(batches,private,learner,'https://airtrust.online')
            self.assertEqual(count[0],21)
            self.assertFalse(private.exists())
            self.assertFalse(learner.exists())


if __name__=='__main__':unittest.main()