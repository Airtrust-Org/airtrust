"""Seven SHA-pinned author journeys: generic server-verdict adapter (review only).

Synthetic/negative checks execute in Actions. Opt-in original ZIP tests require
private source archives mounted outside GitHub; never echo answers or media.
"""
from __future__ import annotations

import hashlib
import io
import os
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_player3_standard_journey_review import (
    SOURCES, JourneyUnsupported, adapt_standard_app, compile_standard_review,
)


class StandardJourneyBridgeTests(unittest.TestCase):
    def test_exactly_seven_review_sources_pinned(self):
        self.assertEqual(len(SOURCES), 7)
        self.assertEqual(len(set(SOURCES.values())), 6)  # identical PPSP runtime, separate editions
        for source_sha, app_sha in SOURCES.items():
            self.assertRegex(source_sha, r'^[a-f0-9]{64}$')
            self.assertRegex(app_sha, r'^[a-f0-9]{64}$')

    def test_unpinned_or_modified_js_fails_closed(self):
        for digest in SOURCES:
            with self.subTest(digest=digest[:12]), self.assertRaisesRegex(
                JourneyUnsupported, 'JOURNEY_PINNED_SOURCE_REQUIRED'
            ):
                adapt_standard_app(b'function evaluate(){return true}',
                    digest, 'https://airtrust.online', 'b'*64, [])
        with self.assertRaisesRegex(JourneyUnsupported, 'JOURNEY_ZIP_NOT_PINNED'):
            compile_standard_review(b'modified source', 'unknown.zip',
                                    'https://airtrust.online', 'b'*64)

    def test_invalid_origin_and_edition_never_build(self):
        for bad in ('http://airtrust.online', 'https://airtrust.online/something', '*'):
            # Fails even earlier on source pinning, and never returns an adapted app.
            with self.subTest(origin=bad), self.assertRaises(JourneyUnsupported):
                adapt_standard_app(b'x',next(iter(SOURCES)),bad,'b'*64,[])
        with self.assertRaises(JourneyUnsupported):
            adapt_standard_app(b'x',next(iter(SOURCES)),
                               'https://airtrust.online','not-a-digest',[])

    def test_malformed_public_stage_rejected_without_shipping_adapter(self):
        from unittest.mock import patch
        good=bytes(b'synthetic pinned app')
        digest=hashlib.sha256(good).hexdigest()
        basic={'stageId':'final','questions':[
          {'id':'q0','options':[{'id':'o0','text':'A'},{'id':'o1','text':'B'}]}
        ]}
        broken=({'stageId':'final','questions':[{'id':'q0','options':[
                  {'id':'x0','text':'A'},{'id':'o1','text':'B'}]}]},
                {'stageId':'final','questions':[{'id':'q0','options':[
                  {'id':'o0','text':'A'},{'id':'o1','text':'B'}]},
                  {'id':'q0','options':[{'id':'o0','text':'A'},
                                       {'id':'o1','text':'B'}]}]},
                {'stageId':'final','questions':[None]},
                {'stageId':'final','questions':[{'id':'q0','options':['A','B']} ]})
        with patch.dict(SOURCES,{digest:digest},clear=True):
            for stage in broken:
                with self.subTest(stage=str(stage)[:30]), self.assertRaises(JourneyUnsupported):
                    adapt_standard_app(good,digest,'https://airtrust.online','b'*64,[stage])
            with self.assertRaisesRegex(JourneyUnsupported, 'STAGE_COUNT_NOT_VERIFIED'):
                adapt_standard_app(good,digest,'https://airtrust.online','b'*64,[basic])

    def test_bridge_explicitly_ignores_unverified_verdicts(self):
        from build_player3_standard_journey_review import BRIDGE
        for marker in ('e.source!==window.parent', 'e.origin!==origin',
                       'd.requestId!==pending.requestId', 'd.editionSha256!==edition',
                       'd.persisted!==true', 'd.stage_passed',
                       'AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1',
                       'AIRTRUST_PLAYER3_STAGE_VERDICT_V1'):
            self.assertIn(marker, BRIDGE)
        for forbidden in ('completion_supported=true', 'correctOptionId',
                          'certificate', 'window.Scorm', 'window.localStorage'):
            self.assertNotIn(forbidden, BRIDGE)

    def test_real_seven_sources_opt_in(self):
        sms = os.environ.get('AIRTRUST_PLAYER3_ORIGINAL_SMS_BATCH')
        op = os.environ.get('AIRTRUST_PLAYER3_ORIGINAL_OPERACIONAL_BATCH')
        if not sms or not op:
            self.skipTest('7 source-backed tests require both private original batch ZIPs')
        seen=set()
        for batch_path in (Path(sms),Path(op)):
            with ZipFile(batch_path) as batch:
                for item in batch.infolist():
                    if (not item.filename.endswith('.zip') or
                        item.filename.startswith('__MACOSX/') or
                        Path(item.filename).name.startswith('._')):
                        continue
                    raw=batch.read(item)
                    digest=hashlib.sha256(raw).hexdigest()
                    if digest not in SOURCES:continue
                    self.assertNotIn(digest,seen)
                    seen.add(digest)
                    converted,meta,projection,private,receipt=compile_standard_review(
                        raw,Path(item.filename).name,'https://airtrust.online','b'*64)
                    self.assertFalse(receipt['publishable'])
                    self.assertFalse(receipt['adapterHostBridgeImplemented'])
                    self.assertEqual(meta['stage_count'],1)
                    self.assertEqual(meta['question_count'],10)
                    self.assertEqual(len(projection['stages']),1)
                    self.assertEqual(len(private['questions']),10)
                    with ZipFile(io.BytesIO(raw)) as source, ZipFile(io.BytesIO(converted)) as result:
                        self.assertNotEqual(source.read('app.js'),result.read('app.js'))
                        self.assertNotEqual(source.read('scorm_api.js'),result.read('scorm_api.js'))
                        for name in source.namelist():
                            if name.endswith('/') or name in ('app.js','scorm_api.js','course_data.js','course-model.js'):
                                continue
                            with self.subTest(asset=name):
                                self.assertEqual(source.read(name),result.read(name))
                        app=result.read('app.js').decode('utf8')
                        for forbidden in ('item.answer', 'qq.answer',
                                          's.questions[i].answer',
                                          'window.__AIRTRUST_PLAYER_TEST__',
                                          'cmi.core.lesson_status'):
                            self.assertNotIn(forbidden,app)
        self.assertEqual(len(seen),7)

if __name__=='__main__':
    unittest.main()