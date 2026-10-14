"""Integration/NR20/LOSA SHA-pinned runtime adapters (no author bank in CI)."""
import hashlib
import io
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from zipfile import ZipFile
from build_player3_legacy_review import SOURCES, adapt_legacy_app, compile_legacy_review, JourneyUnsupported

class Player3LegacyBridgeTests(unittest.TestCase):
    def test_three_distinct_pinned_families(self):
        self.assertEqual(len(SOURCES),3)
        self.assertEqual({entry[2] for entry in SOURCES.values()}, {'integration','nr20','losa'})
        self.assertEqual(sorted(entry[2] for entry in SOURCES.values()), ['integration','losa','nr20'])
        self.assertEqual({entry[1] for entry in SOURCES.values()}, {1,4,7})
        for sha,entry in SOURCES.items():
            self.assertRegex(sha,r'^[a-f0-9]{64}$')
            self.assertRegex(entry[0],r'^[a-f0-9]{64}$')

    def test_unknown_source_rejected(self):
        source=b'function evaluate(){return true}'
        with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_UNPINNED_SOURCE'):
            adapt_legacy_app(source,next(iter(SOURCES)), 'https://airtrust.online','b'*64, [])
        with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_UNPINNED_ARCHIVE'):
            compile_legacy_review(source,'synthetic.zip','https://airtrust.online','b'*64)

    def test_untrusted_stage_and_tampered_original_cannot_enable_bridge(self):
        source=b'function renderAssessment(){}'; digest=hashlib.sha256(source).hexdigest()
        key='d'*64
        stage={'stageId':'stage-a','questions':[{'id':'q'+str(i),'options':[
            {'id':'o0','text':'A'}, {'id':'o1','text':'B'}]} for i in range(10)]}
        with patch.dict(SOURCES,{key:(digest,1,'integration')},clear=True):
            with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_EDITION_INVALID'):
                adapt_legacy_app(source,key,'https://airtrust.online','not-edition',[stage])
            with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_PARENT_ORIGIN_INVALID'):
                adapt_legacy_app(source,key,'http://airtrust.online','b'*64,[stage])
            with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_STAGE_COUNT_DRIFT'):
                adapt_legacy_app(source,key,'https://airtrust.online','b'*64,[])
            stage['questions'][0]['options'][0]['id']='spoof'
            with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_BAD_PUBLIC_OPTIONS'):
                adapt_legacy_app(source,key,'https://airtrust.online','b'*64,[stage])
            stage['questions'][0]['options'][0]['id']='o0'
            with self.assertRaisesRegex(JourneyUnsupported,'LEGACY_SCORE_DRIFT'):
                adapt_legacy_app(source,key,'https://airtrust.online','b'*64,[stage])

    def test_private_legacy_sources_opt_in(self):
        directory=os.environ.get('AIRTRUST_PLAYER3_LEGACY_PRIVATE_ZIP_DIRECTORY')
        if not directory:
            self.skipTest('Original three private author ZIPs unavailable in CI')
        files={}
        for p in Path(directory).glob('*.zip'):
            raw=p.read_bytes();h=hashlib.sha256(raw).hexdigest()
            if h in SOURCES:files[h]=(p.name,raw)
        self.assertEqual(set(files),set(SOURCES))
        for sha,(name,raw) in files.items():
            with self.subTest(course=name):
                learner,meta,projection,bank,receipt=compile_legacy_review(
                    raw,name,'https://airtrust.online','b'*64)
                self.assertFalse(receipt['publishable'])
                self.assertFalse(receipt['stageContractApproved'])
                self.assertEqual(meta['stage_count'],SOURCES[sha][1])
                with ZipFile(io.BytesIO(learner)) as z:
                    js=z.read('app.js').decode('utf8')
                    for forbidden in ('item.answer','qq.answer','op[1]',
                        'cmi.core.lesson_status','window.__AIRTRUST_PLAYER_TEST__'):
                        self.assertNotIn(forbidden,js)
                    self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',js)
                    self.assertNotIn('LMSSetValue',z.read('scorm_api.js').decode())

if __name__=='__main__':unittest.main()