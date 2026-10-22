"""V3.3 HTML5 bridge review; no private ZIPs, answers, or network in CI."""
import hashlib
import os
from pathlib import Path
import unittest
from unittest.mock import patch

from build_player3_v3_review import (
    SOURCES, FORMATIVE_ZIPS, JourneyUnsupported,
    adapt_v33_app, compile_v33_review,
)


class Player3V33ReviewTests(unittest.TestCase):
    def test_exact_source_registry_unique_and_formative_subset(self):
        self.assertEqual(len(SOURCES), 7)
        self.assertEqual(len(FORMATIVE_ZIPS), 1)
        self.assertTrue(FORMATIVE_ZIPS.issubset(SOURCES.keys()))
        for archive_sha, runtime_sha in SOURCES.items():
            self.assertRegex(archive_sha, r'^[0-9a-f]{64}$')
            self.assertRegex(runtime_sha, r'^[0-9a-f]{64}$')

    def test_unpinned_bytes_and_non_original_archive_rejected(self):
        with self.assertRaisesRegex(JourneyUnsupported, 'V33_UNPINNED_SOURCE'):
            adapt_v33_app(b'function evaluate(){return true}',next(iter(SOURCES)),
                          'https://airtrust.online','a'*64,[])
        with self.assertRaisesRegex(JourneyUnsupported, 'V33_UNPINNED_ARCHIVE'):
            compile_v33_review(b'invalid','test.zip','https://airtrust.online','a'*64)

    def test_preflight_refuses_unsafe_parent_invalid_public_stage_and_unknown_template(self):
        source=b'function init(){}'
        digest=hashlib.sha256(source).hexdigest()
        archive='c'*64
        stage={'stageId':'assessment-one','questions':[
            {'id':'q0','options':[{'id':'o0','text':'A'},{'id':'o1','text':'B'}]}
        ]*10}
        with patch.dict(SOURCES,{archive:digest},clear=True):
            with self.assertRaisesRegex(JourneyUnsupported,'PARENT_ORIGIN_INVALID'):
                adapt_v33_app(source,archive,'http://airtrust.online','a'*64,[])
            with self.assertRaisesRegex(JourneyUnsupported,'V33_UNPINNED_EDITION'):
                adapt_v33_app(source,archive,'https://airtrust.online','INVALID',[])
            with self.assertRaisesRegex(JourneyUnsupported,'V33_BAD_PUBLIC_QID'):
                adapt_v33_app(source,archive,'https://airtrust.online','a'*64,[stage])
            unique=[{'id':'q'+str(i),'options':[{'id':'o0','text':'A'},
                {'id':'o1','text':'B'}]} for i in range(10)]
            mutated={'stageId':'assessment-one','questions':unique}
            with self.assertRaisesRegex(JourneyUnsupported,'V33_FUNCTION_DRIFT'):
                adapt_v33_app(source,archive,'https://airtrust.online','a'*64,[mutated])
            unique[0]['options'][0]['id']='evil'
            with self.assertRaisesRegex(JourneyUnsupported,'V33_BAD_PUBLIC_OPTIONS'):
                adapt_v33_app(source,archive,'https://airtrust.online','a'*64,[mutated])

    def test_private_source_qa_opt_in(self):
        """Run against mounted private original ZIP, not checked into repo."""
        directory=os.environ.get('AIRTRUST_PLAYER3_V33_PRIVATE_ZIP_DIRECTORY')
        if not directory:
            self.skipTest('Original private course archive directory absent in CI')
        import zipfile,io
        from prepare_player3_learner_review import sha
        raws={}
        for p in Path(directory).glob('*.zip'):
            raw=p.read_bytes()
            if sha(raw) in SOURCES:
                raws[sha(raw)]=(p.name,raw)
        self.assertEqual(set(raws),set(SOURCES))
        for digest,(name,raw) in raws.items():
            with self.subTest(course=name):
                learner,meta,stages,bank,receipt=compile_v33_review(
                    raw,name,'https://airtrust.online','a'*64)
                self.assertFalse(receipt['publishable'])
                self.assertFalse(receipt['stageContractApproved'])
                self.assertEqual(receipt['formativePolicyReviewRequired'],digest in FORMATIVE_ZIPS)
                self.assertEqual(receipt['adapterHostBridgeImplemented'],False)
                self.assertEqual(len(stages['stages']),meta['stage_count'])
                self.assertEqual(len(bank['questions']),meta['question_count'])
                with zipfile.ZipFile(io.BytesIO(learner)) as z:
                    js=z.read('app.js').decode('utf8')
                    for forbidden in ('item.answer','qq.answer','op.correct','op.feedback',
                                      'AIRTRUST_COMPLETION_DIAGNOSTICS_V1'):
                        self.assertNotIn(forbidden,js)
                    self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',js)
                    self.assertNotIn('LMSSetValue',z.read('scorm_api.js').decode())


if __name__=='__main__':unittest.main()