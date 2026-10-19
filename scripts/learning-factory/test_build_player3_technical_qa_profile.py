import copy
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_player3_technical_candidate import prepare
from build_player3_technical_qa_profile import main_profile, write_private, QaProfileError

STAGING = "https://staging.airtrust.pages.dev"
API = "https://airtrust-api-staging.airtrust.workers.dev"
CONTENT = "https://content-qa.example.org"


def assignments():
    projects = {}
    for browser, offset in (("chromium", 1000), ("webkit", 2000)):
        projects[browser] = {
            "doutrinamento": {
                "courseId": offset + 1, "enrollmentId": offset + 1,
                "cycleId": offset + 101,
                "launchPath": f"/qa/native/{offset + 1}",
                "qualificationPath": f"/qa/qualification/{offset + 1}",
                "certificatePath": f"/qa/certificate/{offset + 1}",
            },
            "resume80": {
                "enrollmentId": offset + 2, "cycleId": offset + 102,
                "editionSha256": "b" * 64, "launchPath": f"/qa/resume/{offset + 2}",
                "minPreviousPct": 85, "expectedResumeUnitId": "qa-unit-4",
                "creditedNavigationIds": ["qa-unit-1", "qa-unit-2"],
            },
            "external": {
                "enrollmentId": offset + 3, "cycleId": offset + 103,
                "editionSha256": "c" * 64, "launchPath": f"/qa/scorm/{offset + 3}",
                "frameSelectors": ["iframe[title='SCORM']"],
                "visualLastPageButton": "Final",
                "wrongAnswerButton": "Incorreto",
                "correctAnswerButton": "Correto",
                "submitButton": "Enviar",
                "finishButton": "Finalizar",
                "learnerCompletionButton": "Solicitar conclusão",
            },
        }
    return {
        "schema": "AIRTRUST_PLAYER3_QA_IDENTITIES_V1",
        "tenantCode": "qa_examiner_training",
        "tenantId": 999006,
        "releaseSha": "a" * 40,
        "baseUrl": STAGING, "apiBaseUrl": API, "contentOrigin": CONTENT,
        "projects": projects,
    }


class PrivateQaProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="player3-profile-qa-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.candidate = self.root / "candidate"
        self.manifest = prepare(self.candidate, STAGING)
        self.identities = assignments()

    def test_immutable_source_and_six_real_separate_identities(self):
        out = main_profile(self.candidate, self.identities)
        self.assertEqual(out["qaContentMode"], "SYNTHETIC_TECHNICAL")
        self.assertEqual(out["expectedSourceSha"], "a" * 40)
        self.assertEqual(out["empresaId"], 999006)
        mids = []
        for name in ("chromium", "webkit"):
            p = out["projects"][name]
            d = p["doutrinamento"]
            self.assertEqual(d["sourceZipSha256"], self.manifest["sourceZipSha256"])
            self.assertEqual(d["editionSha256"], self.manifest["editionSha256"])
            self.assertEqual(d["contentSha256"], self.manifest["contentSha256"])
            self.assertEqual(len(d["units"]), 5)
            self.assertEqual(len([u for u in d["units"] if u.get("official")]), 1)
            self.assertEqual(len(d["requiredLessonIds"]), 4)
            for j in ("doutrinamento", "resume80", "external"):
                mids.append(p[j]["enrollmentId"])
            self.assertEqual(p["external"]["snapshotPath"],
                f"/api/lms/native/scorm/matriculas/{p['external']['enrollmentId']}/qa-evidencias")
        self.assertEqual(len(set(mids)), 6)

    def test_private_output_file_mode_no_overwrite(self):
        assignment_path = self.root / "identities.json"
        assignment_path.write_text(json.dumps(self.identities))
        target = self.root / "private" / "profile.json"
        write_private(self.candidate, assignment_path, target)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
        self.assertEqual(json.loads(target.read_text())["empresaId"], 999006)
        with self.assertRaisesRegex(QaProfileError, "ALREADY_EXISTS"):
            write_private(self.candidate, assignment_path, target)

    def test_never_accept_cross_tenant_or_duplicate_enrollment(self):
        wrong = copy.deepcopy(self.identities)
        wrong["tenantCode"] = "customer"
        with self.assertRaisesRegex(QaProfileError, "SYNTHETIC_TENANT"):
            main_profile(self.candidate, wrong)
        wrong = copy.deepcopy(self.identities)
        wrong["tenantId"] = 6
        with self.assertRaisesRegex(QaProfileError, "QA_SYNTHETIC_TENANT_ID_REQUIRED"):
            main_profile(self.candidate, wrong)
        wrong = copy.deepcopy(self.identities)
        wrong["projects"]["webkit"]["external"]["enrollmentId"] = 1001
        with self.assertRaisesRegex(QaProfileError, "DUPLICATE"):
            main_profile(self.candidate, wrong)

    def test_reject_unsigned_artifact_and_unsafe_origins_or_routes(self):
        for key, value in (("baseUrl", "https://airtrust.online"),
                           ("contentOrigin", API)):
            wrong = copy.deepcopy(self.identities)
            wrong[key] = value
            with self.assertRaises(QaProfileError):
                main_profile(self.candidate, wrong)
        wrong = copy.deepcopy(self.identities)
        wrong["projects"]["chromium"]["doutrinamento"]["launchPath"] = "//evil.example"
        with self.assertRaisesRegex(QaProfileError, "UNSAFE_ROUTE"):
            main_profile(self.candidate, wrong)
        (self.candidate / "private/native-private-candidate.json").write_text("{}")
        with self.assertRaisesRegex(QaProfileError, "NOT_PINNED"):
            main_profile(self.candidate, self.identities)

    def test_private_policy_or_bank_drift_is_rejected(self):
        policy = self.candidate / "private/player3-approved-policy.json"
        bank = self.candidate / "private/player3-server-private-bank.json"
        original_policy = policy.read_bytes()
        original_bank = bank.read_bytes()
        policy.write_bytes(b"{}")
        with self.assertRaisesRegex(QaProfileError, "POLICY_OR_BANK_DIGEST"):
            main_profile(self.candidate, self.identities)
        policy.write_bytes(original_policy)
        bank.write_bytes(b"{}")
        with self.assertRaisesRegex(QaProfileError, "POLICY_OR_BANK_DIGEST"):
            main_profile(self.candidate, self.identities)
        bank.write_bytes(original_bank)
        crosswalk = self.candidate / "private/source-stage-crosswalk.json"
        crosswalk.write_text("{}")
        with self.assertRaisesRegex(QaProfileError, "POLICY_CROSSWALK_DRIFT"):
            main_profile(self.candidate, self.identities)

    def test_requires_real_resume_and_external_scorm_evidence(self):
        wrong = copy.deepcopy(self.identities)
        wrong["projects"]["webkit"]["resume80"]["creditedNavigationIds"] = []
        with self.assertRaisesRegex(QaProfileError, "80_PERCENT"):
            main_profile(self.candidate, wrong)
        wrong = copy.deepcopy(self.identities)
        wrong["projects"]["chromium"]["external"]["frameSelectors"] = []
        with self.assertRaisesRegex(QaProfileError, "SCORM_SELECTORS"):
            main_profile(self.candidate, wrong)


if __name__ == "__main__":
    unittest.main()
