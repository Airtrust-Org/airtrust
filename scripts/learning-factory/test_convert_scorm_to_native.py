"""Read-only native importer regression tests; no Cloudflare or user-data access."""
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile
from convert_scorm_to_native import ConversionError, extract_draft


def example_zip(path, *, slides=None, source='window.COURSE_DATA = ', malicious=False):
    if slides is None:
        slides = [
            {'id': 'slide-1', 'title': 'Introdução'},
            {'id': 'slide-2', 'title': 'Prova', 'questions': [{'correct': 'B'}]},
        ]
    model = {
        'courseId': 'flight-safety', 'title': 'Segurança',
        'packageVersion': '1.0.0', 'slides': slides,
    }
    with ZipFile(path, 'w') as archive:
        archive.writestr('imsmanifest.xml', '<manifest/>')
        archive.writestr('course_data.js', source + json.dumps(model) + ';')
        archive.writestr('media/slide.webp', b'WEBP-content')
        archive.writestr('app.js', 'alert("never run")')
        if malicious:
            archive.writestr('../secrets.txt', 'SECRET')


class NativeImportTests(unittest.TestCase):
    def test_extract_preserves_content_media_and_never_marks_publishable(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, dest = Path(tmp)/'course.zip', Path(tmp)/'native'
            example_zip(source)
            before = source.read_bytes()
            result = extract_draft(source, dest)
            draft = json.loads((dest/'native-import-draft.json').read_text())
            self.assertEqual(result['slides'], 2)
            self.assertEqual(draft['schema'], 'AIRTRUST_NATIVE_IMPORT_DRAFT_V1')
            self.assertFalse(draft['publishable'])
            self.assertEqual(draft['status'], 'REQUIRES_REVIEW')
            self.assertEqual(draft['course']['slides'][1]['questions'][0]['correct'], 'B')
            self.assertEqual((dest/'media/media/slide.webp').read_bytes(), b'WEBP-content')
            self.assertFalse((dest/'media/app.js').exists())
            self.assertEqual(source.read_bytes(), before)

    def test_refuses_unsafe_member(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, dest = Path(tmp)/'course.zip', Path(tmp)/'native'
            example_zip(source, malicious=True)
            with self.assertRaisesRegex(ConversionError, 'UNSAFE_ZIP_PATH'):
                extract_draft(source, dest)
            self.assertFalse((Path(tmp)/'secrets.txt').exists())

    def test_refuses_duplicate_slide_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'course.zip'
            example_zip(source, slides=[{'id': 'x'}, {'id': 'x'}])
            with self.assertRaisesRegex(ConversionError, 'DUPLICATE_SLIDE_ID'):
                extract_draft(source, Path(tmp)/'native')

    def test_refuses_executable_js_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)/'course.zip'
            example_zip(source, source='someCode();window.COURSE_DATA = ')
            with self.assertRaisesRegex(ConversionError, 'SOURCE_MODEL_NOT_JSON_ASSIGNMENT'):
                extract_draft(source, Path(tmp)/'native')

    def test_will_not_overwrite_a_previous_conversion(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, dest = Path(tmp)/'course.zip', Path(tmp)/'native'
            example_zip(source)
            dest.mkdir()
            (dest/'precious.txt').write_text('keep')
            with self.assertRaisesRegex(ConversionError, 'DESTINATION_EXISTS'):
                extract_draft(source, dest)
            self.assertEqual((dest/'precious.txt').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
