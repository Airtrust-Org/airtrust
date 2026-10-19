"""Offline contract tests: synthetic HTML5, Native edition, Worker stage bank/policy."""
import hashlib
import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

FILE = Path(__file__).with_name("prepare_player3_technical_candidate.py")
SPEC = importlib.util.spec_from_file_location("qa_candidate", FILE)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
ORIGIN = "https://qa-parent.airtrust.example"


class TechnicalCandidateTest(unittest.TestCase):
    def test_exact_native_edition_and_private_policy_crosswalk(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "out"
            manifest = module.prepare(root, ORIGIN)
            private = root / "private"
            artifact_bytes = (private / "native-private-candidate.json").read_bytes()
            artifact = json.loads(artifact_bytes)
            bank = json.loads((private / "player3-server-private-bank.json").read_bytes())
            policy = json.loads((private / "player3-approved-policy.json").read_bytes())
            browser = (root / "browser" / "player3-technical-only.zip")
            self.assertEqual(manifest["editionSha256"], hashlib.sha256(artifact_bytes).hexdigest())
            self.assertEqual(manifest["artifactSha256"], manifest["editionSha256"])
            self.assertRegex(artifact["packageVersion"], r"^n-[0-9a-f]{32}$")
            self.assertEqual(artifact["schema"], "AIRTRUST_NATIVE_COURSE_V1")
            self.assertEqual([u["kind"] for u in artifact["units"]],
                             ["lesson", "lesson", "assessment", "lesson", "lesson"])
            self.assertEqual(manifest["lessonCount"], 4)
            self.assertEqual(len(artifact["questions"]), 10)
            self.assertEqual(artifact["policy"], {"mode": "SCORED", "masteryScore": 70,
                                                   "moduleGate": True})
            self.assertEqual(bank["schema"], "AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1")
            self.assertEqual(policy["schema"], "AIRTRUST_PLAYER3_GRADE_POLICY_V1")
            self.assertEqual(policy["source_sha256"], manifest["sourceZipSha256"])
            self.assertEqual(bank["source_sha256"], manifest["sourceZipSha256"])
            self.assertEqual(policy["editionSha256"], manifest["editionSha256"])
            self.assertEqual(policy["stages"][0]["stageId"], "qa-stage-1")
            self.assertEqual(policy["stages"][0]["requiredQuestionIds"],
                             artifact["units"][2]["questionIds"])
            self.assertEqual(policy["learnerContent"]["sourceSha256"], manifest["sourceZipSha256"])
            self.assertTrue(bank["PRIVATE_NEVER_SERVE_TO_BROWSER"])
            self.assertFalse(manifest["remoteWrites"])
            self.assertFalse(manifest["reviewedRelease"])
            self.assertEqual(manifest["policySha256"],
                             hashlib.sha256((private / "player3-approved-policy.json").read_bytes()).hexdigest())
            self.assertEqual(manifest["privateBankSha256"],
                             hashlib.sha256((private / "player3-server-private-bank.json").read_bytes()).hexdigest())
            with ZipFile(browser) as archive:
                html = archive.read("index.html").decode()
                script = archive.read("app.js").decode()
                self.assertIn("conteúdo sintético", html)
                self.assertIn(manifest["editionSha256"], script)
                self.assertIn("qa-stage-1-q1", script)
                self.assertNotIn("correctOptionId", script)
                self.assertNotIn("PRIVATE_NEVER_SERVE_TO_BROWSER", script)
                self.assertNotIn("certificationApproved", script)
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)
            for f in private.iterdir():
                self.assertEqual(f.stat().st_mode & 0o777, 0o600)

    def test_reproducible_across_runs_and_zero_remote_mutation(self):
        with tempfile.TemporaryDirectory() as folder:
            first = Path(folder) / "a"
            second = Path(folder) / "b"
            a = module.prepare(first, ORIGIN)
            b = module.prepare(second, ORIGIN)
            self.assertEqual(a, b)
            self.assertEqual((first / "browser" / "player3-technical-only.zip").read_bytes(),
                             (second / "browser" / "player3-technical-only.zip").read_bytes())
            for filename in ("native-private-candidate.json", "player3-approved-policy.json",
                             "player3-server-private-bank.json", "source-stage-crosswalk.json"):
                self.assertEqual((first / "private" / filename).read_bytes(),
                                 (second / "private" / filename).read_bytes())

    def test_rejects_bad_target_and_real_course_ids_without_touching_existing_work(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / "private"
            root.mkdir()
            keep = root / "other-work"
            keep.write_text("untouched")
            with self.assertRaisesRegex(module.CandidateError, "OUTPUT_EXISTS"):
                module.prepare(root, ORIGIN)
            self.assertEqual(keep.read_text(), "untouched")
            for course in ("real-flight-course", "../../bad", "qa-invalid space"):
                with self.subTest(course=course):
                    dest = Path(folder) / ("target-" + hashlib.sha256(course.encode()).hexdigest()[:8])
                    with self.assertRaisesRegex(module.CandidateError, "SYNTHETIC_QA_COURSE_ID_REQUIRED"):
                        module.prepare(dest, ORIGIN, course)
                    self.assertFalse(dest.exists())
            with self.assertRaisesRegex(module.zip_gen.TechnicalFixtureError, "STAGING_ORIGIN"):
                module.prepare(Path(folder) / "blocked", "https://airtrust.online")


if __name__ == "__main__":
    unittest.main()
