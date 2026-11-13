"""Fail-closed tests for the canonical PTO contract and its DOCX provenance."""
import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PATH = ROOT / "check-pto-v18-canonical-contract.py"
spec = importlib.util.spec_from_file_location("pto_v18_canonical_guard", PATH)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class CanonicalPtoV18Test(unittest.TestCase):
    def test_approved_document_transcription_and_two_pf_legs(self):
        result = guard.validate()
        self.assertEqual(
            (result["sessions"], result["technical_positions"], result["distinct_technical_codes"], result["notechs"]),
            (82, 1476, 531, 15),
        )

    def test_tampered_technical_item_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = guard.DEFAULT_DIR
            for name in ("manifest.json", "sessoes_pto_v18.json", "notechs_pto_v18.json"):
                shutil.copyfile(source / name, Path(tmp) / name)
            path = Path(tmp) / "sessoes_pto_v18.json"
            sessions = json.loads(path.read_text())
            sessions[0]["itens"][0]["perna"] = "2 - PF B"
            path.write_text(json.dumps(sessions, ensure_ascii=False))
            with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
                guard.validate(tmp)

    def test_manifest_cannot_grant_operational_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = guard.DEFAULT_DIR
            for name in ("manifest.json", "sessoes_pto_v18.json", "notechs_pto_v18.json"):
                shutil.copyfile(source / name, Path(tmp) / name)
            path = Path(tmp) / "manifest.json"
            manifest = json.loads(path.read_text())
            manifest["status"] = "VALIDADO_PARA_PRODUCAO"
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "NONOPERATIONAL_STATUS_REQUIRED"):
                guard.validate(tmp)

    def test_wrong_docx_source_rejected(self):
        with tempfile.NamedTemporaryFile(suffix=".docx") as dummy:
            dummy.write(b"unapproved PTO")
            dummy.flush()
            with self.assertRaisesRegex(ValueError, "APPROVED_DOCX_HASH_MISMATCH"):
                guard.validate(pto=dummy.name)


if __name__ == "__main__":
    unittest.main()
