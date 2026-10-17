import importlib.util
import hashlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "learning-factory" / "verify_golden_core.py"
spec = importlib.util.spec_from_file_location("verify_golden_core", SRC)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FactoryCoreLockTests(unittest.TestCase):
    def _write_zip(self, entries):
        tmp = tempfile.TemporaryDirectory()
        path = Path(tmp.name) / "candidate.zip"
        with zipfile.ZipFile(path, "w") as out:
            for name, data in entries:
                out.writestr(name, data)
        self.addCleanup(tmp.cleanup)
        return path

    def setUp(self):
        self.core = {"app.js": b"engine-app", "styles.css": b"engine-style", "scorm_api.js": b"engine-scorm"}
        self.hashes = {name: hashlib.sha256(data).hexdigest() for name, data in self.core.items()}
        self.entries = list(self.core.items()) + [
            ("imsmanifest.xml", b"<manifest/>"),
            ("airtrust-completion-manifest.json", b"{}"),
        ]

    def test_exact_locked_files_pass(self):
        result = module.verify_golden_core(self._write_zip(self.entries), self.hashes)
        self.assertTrue(result["core_lock_pass"])
        self.assertEqual(result["errors"], [])

    def test_javascript_change_fails(self):
        entries = [(name, b"drift" if name == "app.js" else value) for name, value in self.entries]
        result = module.verify_golden_core(self._write_zip(entries), self.hashes)
        self.assertFalse(result["core_lock_pass"])
        self.assertIn("app.js:CORE_DRIFT", result["errors"])

    def test_missing_manifest_and_styles_fail(self):
        entries = [(n, v) for n, v in self.entries if n not in {"styles.css", "imsmanifest.xml"}]
        result = module.verify_golden_core(self._write_zip(entries), self.hashes)
        self.assertFalse(result["core_lock_pass"])
        self.assertTrue(any("styles.css" in error for error in result["errors"]))
        self.assertTrue(any("imsmanifest.xml" in error for error in result["errors"]))

    def test_duplicate_core_name_fails_closed(self):
        result = module.verify_golden_core(self._write_zip(self.entries + [("app.js", b"drift")]), self.hashes)
        self.assertFalse(result["core_lock_pass"])
        self.assertIn("app.js:expected_exactly_one_found_2", result["errors"])

    def test_nested_core_does_not_silently_pass(self):
        entries = [(f"course/{n}", v) for n, v in self.entries]
        result = module.verify_golden_core(self._write_zip(entries), self.hashes)
        self.assertFalse(result["core_lock_pass"])


if __name__ == "__main__":
    unittest.main()
