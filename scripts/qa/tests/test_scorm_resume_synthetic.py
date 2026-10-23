"""Local-only contract assertions; not a trusted SCORM certification."""
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import hashlib
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

BUILDER = Path(__file__).resolve().parents[1] / 'build-scorm-resume-synthetic.py'
spec = spec_from_file_location('synthetic_builder', BUILDER)
builder = module_from_spec(spec)
spec.loader.exec_module(builder)

class ResumeFixtureTests(unittest.TestCase):
    def test_reproducible_manifest_and_scope(self):
        with tempfile.TemporaryDirectory() as d:
            one = Path(d) / 'one.zip'
            two = Path(d) / 'two.zip'
            r1 = builder.build_zip(one)
            r2 = builder.build_zip(two)
            self.assertEqual(r1['sha256'], r2['sha256'])
            self.assertEqual(one.read_bytes(), two.read_bytes())
            self.assertEqual(r1['sha256'], hashlib.sha256(one.read_bytes()).hexdigest())
            self.assertEqual(r1['certification'], 'UNCERTIFIED')
            self.assertFalse(r1['activationAuthorized'])
            self.assertFalse(r1['stagingWritesAuthorized'])
            with zipfile.ZipFile(one) as z:
                self.assertIsNone(z.testzip())
                self.assertEqual(sorted(z.namelist()), ['imsmanifest.xml', 'index.html', 'resume-runtime.js'])
                root = ET.fromstring(z.read('imsmanifest.xml'))
                ns = '{http://www.imsproject.org/xsd/imscp_rootv1p1p2}'
                self.assertEqual(root.find(f'{ns}metadata/{ns}schemaversion').text, '1.2')
                sco = root.find(f'{ns}resources/{ns}resource')
                self.assertEqual(sco.attrib['{http://www.adlnet.org/xsd/adlcp_rootv1p2}scormtype'], 'sco')
                self.assertEqual(sco.attrib['href'], 'index.html')
                script = z.read('resume-runtime.js').decode()
                for field in ('cmi.core.lesson_location', 'cmi.suspend_data'):
                    self.assertIn(field, script)
                self.assertNotIn('cmi.core.score.raw', script)
                self.assertNotIn("'passed'", script)
                self.assertNotIn("'completed'", script)

if __name__ == '__main__':
    unittest.main()
