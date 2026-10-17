"""Gerenciamento de Resíduos SHA-pinned Player3 review adapter regressions.

CI tests need no unpublished SCORM files or answer keys; optional source-backed
QA is enabled only by an explicitly provided private ZIP path.
"""
from __future__ import annotations
import hashlib
import io
import os
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile
from build_player3_residuos_review import (
    ResiduosUnsupported, SOURCE_ZIP, SOURCE_APP,
    adapt_residuos_app, compile_residuos_review,
)


def sample():
    return [{'stageId':'s18','questions':[
        {'id':f'q-{i}','options':[{'id':f'o{j}','text':f'Opção {j}'}
                                 for j in range(4)]} for i in range(10)]}]


class Player3ResiduosReviewTests(unittest.TestCase):
    def test_source_is_pinned_not_any_js_with_answer_keys(self):
        with self.assertRaisesRegex(ResiduosUnsupported,'SOURCE_SHA_MISMATCH'):
            adapt_residuos_app(b'alert(1)',SOURCE_ZIP,'https://airtrust.online','a'*64,sample())

    def test_explicit_secure_parent_origin_and_edition_required(self):
        from build_player3_residuos_review import _sha
        raw=b'function init(){}'
        with patch('build_player3_residuos_review.SOURCE_APP',_sha(raw)):
            for origin in ('http://airtrust.online','*','https://localhost',
                           'https://airtrust.online/path',
                           'https://u:p@airtrust.online','https://airtrust.online/?ok=1'):
                with self.subTest(origin=origin),self.assertRaisesRegex(ResiduosUnsupported,'ORIGIN_INVALID'):
                    adapt_residuos_app(raw,SOURCE_ZIP,origin,'a'*64,sample())
            with self.assertRaisesRegex(ResiduosUnsupported,'EDITION_INVALID'):
                adapt_residuos_app(raw,SOURCE_ZIP,'https://airtrust.online','bad',sample())

    def test_exact_one_stage_ten_questions_and_public_options(self):
        from build_player3_residuos_review import _sha
        raw=b'function init(){}'
        with patch('build_player3_residuos_review.SOURCE_APP',_sha(raw)):
            for stages in ([], sample()*2, [{'stageId':'final','questions':sample()[0]['questions']}],
                           [{'stageId':'s18','questions':sample()[0]['questions'][:9]}]):
                with self.assertRaises(ResiduosUnsupported):
                    adapt_residuos_app(raw,SOURCE_ZIP,'https://airtrust.online','a'*64,stages)
            dupe=sample();dupe[0]['questions'][0]['id']=dupe[0]['questions'][1]['id']
            with self.assertRaisesRegex(ResiduosUnsupported,'QUESTION_DUPLICATE'):
                adapt_residuos_app(raw,SOURCE_ZIP,'https://airtrust.online','a'*64,dupe)
            bad=sample();bad[0]['questions'][0]['options'][2]['id']='o99'
            with self.assertRaisesRegex(ResiduosUnsupported,'OPTION_ID'):
                adapt_residuos_app(raw,SOURCE_ZIP,'https://airtrust.online','a'*64,bad)

    def test_verified_js_structure_fails_closed_if_author_changes(self):
        from build_player3_residuos_review import _sha
        raw=b'function init(){}'
        with patch('build_player3_residuos_review.SOURCE_APP',_sha(raw)):
            with self.assertRaisesRegex(ResiduosUnsupported,'FUNCTION_DRIFT'):
                adapt_residuos_app(raw,SOURCE_ZIP,'https://airtrust.online','a'*64,sample())

    def test_real_residuos_zip_optional_sha_and_no_client_grading(self):
        path=os.getenv('AIRTRUST_PLAYER3_RESIDUOS_SOURCE_ZIP')
        if not path:self.skipTest('Private Resíduos RC4.1 original not mounted in CI')
        raw=Path(path).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),SOURCE_ZIP)
        archive,meta,projection,bank,receipt=compile_residuos_review(
            raw,'https://airtrust.online','b'*64)
        self.assertEqual(meta['question_count'],10)
        self.assertEqual(meta['stage_count'],1)
        self.assertFalse(receipt['publishable'])
        self.assertFalse(receipt['adapterHostBridgeImplemented'])
        self.assertEqual(len(bank['questions']),10)
        with ZipFile(io.BytesIO(archive)) as p, ZipFile(io.BytesIO(raw)) as original:
            js=p.read('app.js').decode('utf8')
            for token in ('q.correct','item.correct','op.ok','LMSSetValue(',
                          'cmi.core.lesson_status','AIRTRUST_COMPLETION_DIAGNOSTICS_V1'):
                self.assertNotIn(token,js)
            self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',js)
            self.assertIn('AIRTRUST_PLAYER3_STAGE_VERDICT_V1',js)
            for name in original.namelist():
                if name.endswith('/') or name in ('app.js','course-model.js','scorm.js'):
                    continue
                self.assertEqual(p.read(name),original.read(name))
            self.assertNotIn('LMSSetValue',p.read('scorm.js').decode('utf8'))

if __name__=='__main__':unittest.main()