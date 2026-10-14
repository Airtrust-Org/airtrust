"""Pinned RC8.1 bridge: fail-closed synthetic and optional source-backed QA.

CI never needs private course media or answer keys. With the exact original
source archive supplied privately, the same tests verify the real runtime.
"""
import io
import os
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_player3_rc81_bridge_review import (
    RC81Unsupported,
    SOURCE_ZIP_SHA256,
    _host_origin,
    _replace_line,
    adapt_rc81_app,
    compile_rc81_review,
)


class Rc81BridgeTests(unittest.TestCase):
    def test_refuses_unpinned_app_even_with_spoofed_source_digest(self):
        with self.assertRaisesRegex(RC81Unsupported, 'RC81_SOURCE_NOT_PINNED'):
            adapt_rc81_app(b'function evaluate(){return true}', SOURCE_ZIP_SHA256,
                           'https://airtrust.online', 'a' * 64, [])

    def test_refuses_modified_or_unversioned_source_archive(self):
        with self.assertRaisesRegex(RC81Unsupported, 'RC81_SOURCE_ZIP_MISMATCH'):
            compile_rc81_review(b'not-original', 'https://airtrust.online', 'a' * 64)

    def test_parent_origin_must_be_explicit_https_origin(self):
        self.assertEqual(_host_origin('https://airtrust.online'), 'https://airtrust.online')
        for bad in ('http://airtrust.online', 'https://airtrust.online/path',
                    'https://name:password@airtrust.online', 'https://localhost',
                    'https://127.0.0.1', 'https://airtrust.online?a=1',
                    'https://airtrust.online/#anything', '*', 'null'):
            with self.subTest(bad=bad), self.assertRaises(RC81Unsupported):
                _host_origin(bad)

    def test_runtime_patch_requires_exactly_one_original_function(self):
        for source in ([], ['function evaluate(){return 1}',
                           'function evaluate(){return 2}']):
            with self.assertRaisesRegex(RC81Unsupported, 'PATCH_FUNCTION_MISSING'):
                _replace_line(source, 'evaluate', 'function evaluate(){}')

    def test_real_original_archive_opt_in_private_qa(self):
        raw_path = os.environ.get('AIRTRUST_PLAYER3_RC81_SOURCE_ZIP')
        if not raw_path:
            self.skipTest('Private RC8.1 original not mounted in CI; run with explicit source path')
        raw = Path(raw_path).read_bytes()
        import hashlib
        self.assertEqual(hashlib.sha256(raw).hexdigest(), SOURCE_ZIP_SHA256)
        with ZipFile(io.BytesIO(raw)) as source:
            self.assertIn('app.js', source.namelist())
        candidate, meta, projection, bank, receipt = compile_rc81_review(
            raw, 'https://airtrust.online', 'b' * 64)
        self.assertEqual(meta['stage_count'], 8)
        self.assertEqual(meta['question_count'], 80)
        self.assertEqual(len(projection['stages']), 8)
        self.assertEqual(len(bank['questions']), 80)
        self.assertFalse(receipt['publishable'])
        self.assertFalse(receipt['adapterHostBridgeImplemented'])
        with ZipFile(io.BytesIO(candidate)) as z:
            patched = z.read('app.js').decode('utf8')
            self.assertIn('AIRTRUST_PLAYER3_STAGE_SUBMIT_HINT_V1', patched)
            self.assertIn('AIRTRUST_PLAYER3_STAGE_VERDICT_V1', patched)
            self.assertNotIn('Scorm?.finish?.()', patched)
            self.assertNotIn('window.__AIRTRUST_PLAYER_TEST__', patched)
            self.assertNotIn('LMSInitialize', z.read('scorm_api.js').decode())
            self.assertNotIn('LMSSetValue', z.read('scorm_api.js').decode())
            for forbidden in ('item.answer', 'qq.answer', 's.questions[i].answer', 'correctOptionId', 'scenarioCorrect'):
                self.assertNotIn(forbidden, patched)
            with ZipFile(io.BytesIO(raw)) as original:
                self.assertEqual(z.read('index.html'), original.read('index.html'))
                self.assertEqual(z.read('styles.css'), original.read('styles.css'))


    def test_real_original_42_units_and_retake_browser_opt_in(self):
        """Author HTML5 42/42 with SIMULATED server receipts; no real LMS writes.

        Requires both private original + Chromium; intentionally skipped in CI
        and NEVER represents staging approval, persisted D1, or certification.
        """
        raw_path = os.environ.get('AIRTRUST_PLAYER3_RC81_SOURCE_ZIP')
        chromium_path = os.environ.get('AIRTRUST_PLAYER3_CHROMIUM_PATH')
        if not raw_path or not chromium_path:
            self.skipTest('Opt-in browser QA requires private RC8.1 ZIP and Chromium path')
        from playwright.sync_api import sync_playwright
        import re
        from urllib.parse import unquote
        raw = Path(raw_path).read_bytes()
        import hashlib
        self.assertEqual(hashlib.sha256(raw).hexdigest(), SOURCE_ZIP_SHA256)
        candidate, meta, projection, bank, receipt = compile_rc81_review(
            raw, 'https://airtrust.online', 'b' * 64)
        self.assertFalse(receipt['publishable'])
        with ZipFile(io.BytesIO(candidate)) as z:
            data = {n: z.read(n) for n in z.namelist() if not n.endswith('/')}
        # Offline set_content is deliberate: no Cloudflare/network request and
        # scripts render only in the disposable Chromium QA context.
        html = data['index.html'].decode('utf8')
        html = re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>', '', html)
        html = re.sub(r'<link[^>]*href="styles.css"[^>]*>', '', html)
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                executable_path=chromium_path, headless=True, args=['--no-sandbox'])
            try:
                page = browser.new_page(viewport={'width':1280,'height':800})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.set_content(html, wait_until='domcontentloaded')
                page.add_style_tag(content=data['styles.css'].decode('utf8'))
                for name in ('course_data.js', 'course-model.js', 'scorm_api.js','app.js'):
                    if name in data:
                        page.add_script_tag(content=data[name].decode('utf8'))
                page.evaluate("window.dispatchEvent(new Event('DOMContentLoaded'))")
                self.assertEqual(page.locator('#count').inner_text(), '1/42')
                self.assertFalse(page.evaluate('Boolean(window.__AIRTRUST_PLAYER_TEST__)'))
                page.evaluate("""() => {
                  window.__QA_RECEIPTS__=[];
                  window.__QA_CONTENT_END__=null;
                  let denyOnce=true;
                  window.AIRTRUST_PLAYER3_RC81.submit=(stage,selections)=>{
                    window.__QA_RECEIPTS__.push({stage,selections});
                    if(denyOnce){denyOnce=false;return Promise.resolve({
                      stage_passed:false,score_pct:10});}
                    return Promise.resolve({stage_passed:true,score_pct:100});
                  };
                  window.AIRTRUST_PLAYER3_RC81.contentEnd=unit=>{
                    window.__QA_CONTENT_END__=unit;
                  };
                }""")
                approved = []
                for step in range(150):
                    counter = page.locator('#count').inner_text()
                    if page.locator('.assessment-page').count():
                        stage = page.locator('#viewport .screen').get_attribute('data-unit')
                        if stage not in approved:
                            for j in range(10):
                                page.locator('[data-answer]').first.click(force=True)
                                if j != 9:
                                    page.locator('#qNext').click(force=True)
                            page.locator('#next').click(force=True)
                            if not approved:
                                page.wait_for_function("""() =>
                                    document.querySelector('#next').textContent.includes('Nova tentativa')""")
                                self.assertEqual(counter, page.locator('#count').inner_text())
                                page.locator('#next').click(force=True)
                                for j in range(10):
                                    page.locator('[data-answer]').first.click(force=True)
                                    if j != 9:
                                        page.locator('#qNext').click(force=True)
                                page.locator('#next').click(force=True)
                            page.wait_for_function("""() =>
                                document.querySelector('#next').textContent.includes('Continuar') ||
                                document.querySelector('#next').textContent.includes('Concluir curso')""")
                            approved.append(stage)
                    for button in page.locator('[data-gate]').all():
                        button.click(force=True)
                    if page.locator('[data-opt]').count():
                        page.locator('[data-opt]').first.click(force=True)
                    next_button = page.locator('#next')
                    self.assertFalse(next_button.is_disabled(), f'Blocked at {counter}')
                    if counter == '42/42':
                        self.assertEqual(len(approved), 8)
                        self.assertIn('Concluir curso', next_button.inner_text())
                        next_button.click(force=True)
                        self.assertEqual(page.locator('#count').inner_text(), '42/42')
                        self.assertEqual(page.evaluate('window.__QA_CONTENT_END__'), approved[-1])
                        self.assertFalse(page.evaluate('window.Scorm.isFinished()'))
                        self.assertEqual(
                            page.evaluate("window.Scorm.set('cmi.core.lesson_status','passed')"),
                            'false')
                        break
                    next_button.click(force=True)
                    self.assertNotEqual(counter, page.locator('#count').inner_text())
                else:
                    self.fail('RC81 journey did not reach unit 42 in 150 actions')
                receipts = page.evaluate('window.__QA_RECEIPTS__')
                self.assertEqual(len(receipts), 9)  # failed + 8 passed
                self.assertEqual(len(receipts[0]['selections']), 10)
                self.assertEqual(errors, [])
            finally:
                browser.close()

if __name__ == '__main__':
    unittest.main()