import io
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from convert_preserved_html5 import UnsafePackage, checked_files, convert

def bundle(entries):
    output = io.BytesIO()
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    return output.getvalue()

class PreservedHtml5Tests(unittest.TestCase):
    def test_blocks_traversal_and_unsafe_paths(self):
        for path in ['../secret', '/outside', 'foo/../secret', 'C:/pass', 'foo\\bar']:
            with self.subTest(path=path):
                with ZipFile(io.BytesIO(bundle({path: b'x'}))) as source:
                    with self.assertRaises(UnsafePackage):
                        checked_files(source)

    def test_requires_real_html5_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(UnsafePackage):
                convert(bundle({'index.html': '<main>Hello</main>'}),
                        'broken.zip', Path(directory) / 'candidate.zip')

    def test_preserves_html_css_js_media_exact_bytes(self):
        entries = {
            'index.html': '<main>Formação</main>'.encode(),
            'imsmanifest.xml': '<manifest/>'.encode(),
            'app.js': b'window.author={interactive:true};',
            'assets/photo.png': b'\x00\x89\xff',
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'candidate.zip'
            receipt = convert(bundle(entries), 'source.zip', target)
            self.assertEqual(receipt['files_preserved'], len(entries))
            with ZipFile(target) as content:
                manifest = json.loads(content.read('player3-content-contract.json'))
                self.assertTrue(manifest['security']['never_publish_as_public_asset'])
                self.assertEqual(manifest['assessment']['authority'], 'NOT_YET_INTEGRATED')
                for path, data in entries.items():
                    self.assertEqual(content.read('content/' + path), data)

if __name__ == '__main__':
    unittest.main()
