"""Source-locked SGSO 10.4/10.7 Player3 adapters. No answer keys in CI."""
from __future__ import annotations
import hashlib, io, os, unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile
from build_player3_sgso_review import (
    SGSOUnsupported,SOURCES,SCORM_SHIM,adapt_sgso_app,compile_sgso_review
)

def projection():
    return [{'stageId':f'sgso26-{a:03}','questions':[
        {'id':f'q-{a}-{i}','options':[{'id':f'o{j}','text':f'Option {j}'} for j in range(4)]}
        for i in range(4)]}
        for a in (10,18,26,35,43)]

class Player3SGSOReviewTests(unittest.TestCase):
    def test_exact_two_known_source_pairs(self):
        self.assertEqual(len(SOURCES),2)
        for source,(app,version) in SOURCES.items():
            self.assertEqual(len(source),64)
            self.assertEqual(len(app),64)
            self.assertIn(version,('M10.4','M10.7'))
        self.assertNotIn(b'LMSSetValue',SCORM_SHIM)
        self.assertNotIn(b'lesson_status',SCORM_SHIM)
        self.assertIn(b'finish:()=>false',SCORM_SHIM)

    def test_unpinned_source_fails_before_processing_or_output(self):
        with self.assertRaisesRegex(SGSOUnsupported,'SOURCE_NOT_PINNED'):
            adapt_sgso_app(b'alert(1)', 'f'*64,'https://airtrust.online','a'*64,projection())
        for source in SOURCES:
            with self.assertRaisesRegex(SGSOUnsupported,'SOURCE_NOT_PINNED'):
                adapt_sgso_app(b'alert(1)',source,'https://airtrust.online','a'*64,projection())

    def test_no_implicit_trust_of_origin_or_edition(self):
        raw=b'function persist(exitMode){}'
        digest=hashlib.sha256(raw).hexdigest()
        with patch.dict(SOURCES,{digest:(digest,'M10.4')},clear=True):
            for origin in ('http://airtrust.online','https://localhost','*',
                           'https://airtrust.online/path','https://u:p@airtrust.online',
                           'https://airtrust.online?x=1'):
                with self.subTest(origin=origin), self.assertRaisesRegex(SGSOUnsupported,'PARENT_ORIGIN_INVALID'):
                    adapt_sgso_app(raw,digest,origin,'a'*64,projection())
            with self.assertRaisesRegex(SGSOUnsupported,'EDITION_INVALID'):
                adapt_sgso_app(raw,digest,'https://airtrust.online','invalid',projection())

    def test_duplicate_options_and_stages_rejected(self):
        raw=b'function persist(exitMode){}'
        digest=hashlib.sha256(raw).hexdigest()
        with patch.dict(SOURCES,{digest:(digest,'M10.4')},clear=True):
            for stages in ([],projection()[:-1],projection()+projection()[:1]):
                with self.assertRaises(SGSOUnsupported):
                    adapt_sgso_app(raw,digest,'https://airtrust.online','a'*64,stages)
            dup=projection();dup[1]['stageId']=dup[0]['stageId']
            with self.assertRaisesRegex(SGSOUnsupported,'STAGE_INVALID'):
                adapt_sgso_app(raw,digest,'https://airtrust.online','a'*64,dup)
            bad=projection();bad[0]['questions'][0]['options'][1]['id']='o9'
            with self.assertRaisesRegex(SGSOUnsupported,'QUESTION_OPTIONS_INVALID'):
                adapt_sgso_app(raw,digest,'https://airtrust.online','a'*64,bad)

    def test_exact_authored_js_functions_are_required(self):
        raw=b'function persist(exitMode){}'
        digest=hashlib.sha256(raw).hexdigest()
        with patch.dict(SOURCES,{digest:(digest,'M10.4')},clear=True):
            with self.assertRaisesRegex(SGSOUnsupported,'LOCAL_EXAM_GRADER_DRIFT'):
                adapt_sgso_app(raw,digest,'https://airtrust.online','a'*64,projection())

    def test_real_sources_opt_in_private_source_backed(self):
        for key in ('AIRTRUST_PLAYER3_SGSO_M104_ZIP','AIRTRUST_PLAYER3_SGSO_M107_ZIP'):
            file=os.getenv(key)
            if not file:self.skipTest('Two private SGSO source archives required to validate real media; not in CI')
            raw=Path(file).read_bytes();digest=hashlib.sha256(raw).hexdigest()
            self.assertIn(digest,SOURCES)
            archive,meta,projection_data,private,receipt=compile_sgso_review(raw,'https://airtrust.online','b'*64)
            self.assertEqual(meta['stage_count'],5)
            self.assertEqual(meta['question_count'],20)
            self.assertEqual(len(private['questions']),20)
            self.assertFalse(receipt['publishable'])
            with ZipFile(io.BytesIO(raw)) as original, ZipFile(io.BytesIO(archive)) as review:
                self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',review.read('app.js').decode())
                self.assertNotIn('LMSSetValue',review.read('airtrust-scorm.js').decode())
                for name in original.namelist():
                    if name.endswith('/') or name in ('app.js','airtrust-scorm.js','course-model.js'):continue
                    self.assertEqual(original.read(name),review.read(name))

if __name__=='__main__': unittest.main()