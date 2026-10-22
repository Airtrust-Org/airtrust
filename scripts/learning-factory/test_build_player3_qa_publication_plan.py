"""Offline synthetic Player3 publication plan never mutates staging or exports bank."""
import copy
import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_player3_technical_candidate import prepare
from build_player3_qa_publication_plan import (
    PublicationDenied, compose, write_plan, QA_TENANT,
)

SHA = "a"*40
ORIGIN = "https://qa-player3-staging.example.org"


class Player3SyntheticPublicationTests(unittest.TestCase):
    def setUp(self):
        self.work = tempfile.TemporaryDirectory(prefix="player3-offline-pub-")
        self.addCleanup(self.work.cleanup)
        self.path = Path(self.work.name)
        self.candidate = self.path / "candidate"
        prepare(self.candidate, "https://staging.airtrust.pages.dev")

    def plan(self, **updates):
        params = dict(candidate=self.candidate, tenant=QA_TENANT, course=12345,
                      release_sha=SHA, content_origin=ORIGIN)
        params.update(updates)
        return compose(**params)

    def test_exact_private_r2_objects_and_separated_html5(self):
        d = self.plan()
        self.assertEqual(d["state"], "REVIEW_ONLY_NO_REMOTE_APPLY")
        self.assertFalse(d["remoteWritesPerformed"])
        self.assertFalse(d["validatedRemoteR2"])
        self.assertEqual(len(d["privateR2Objects"]), 4)
        self.assertEqual(len(d["publicHtml5Objects"]), 2)
        self.assertEqual(d["targetTenantId"], QA_TENANT)
        prefix=f"lms/native/{QA_TENANT}/12345/{d['artifactSha256']}/"
        self.assertEqual(d["stagedR2Prefix"], prefix)
        self.assertTrue(all(k["key"].startswith(prefix) for k in d["privateR2Objects"]))
        self.assertTrue(all(k["url"].startswith(
            f"{ORIGIN}/qa/player3/{QA_TENANT}/12345/{d['artifactSha256']}/")
            for k in d["publicHtml5Objects"]))
        self.assertTrue(all("sha256" in k and k["bytes"]>0
                            for k in d["privateR2Objects"]))
        self.assertNotIn("correctOptionId", json.dumps(d))
        self.assertNotIn("privateSyntheticAnswerKeys", json.dumps(d))

    def test_rejects_prod_tenant_non_qa_artifact_and_unpinned_release(self):
        for override in ({"tenant":6}, {"tenant":0}, {"course":0},
                         {"release_sha":"dev"}, {"content_origin":"https://airtrust.online"},
                         {"content_origin":"http://qa-player3-staging.example.org"},
                         {"content_origin":"https://qa.airtrust.online"},
                         {"content_origin":"https://staging.airtrust.pages.dev"},
                         {"content_origin":"https://staging.airtrust.pages.dev."},
                         {"content_origin":"https://airtrust-api-staging.airtrust.workers.dev"}):
            with self.subTest(override=override):
                with self.assertRaises(PublicationDenied):
                    self.plan(**override)
        manifest=self.candidate/"manifest.json"
        value=json.loads(manifest.read_text())
        value["reviewedRelease"]=True
        manifest.write_text(json.dumps(value))
        with self.assertRaisesRegex(PublicationDenied,"REVIEW_ONLY_CANDIDATE"):
            self.plan()

    def test_rejects_private_r2_bytes_drift_and_public_zip_tampering(self):
        bank=self.candidate/"private/player3-server-private-bank.json"
        original=bank.read_bytes()
        bank.write_bytes(b"{}")
        with self.assertRaisesRegex(PublicationDenied,"PRIVATE_SOURCE_BYTES_MISMATCH"):
            self.plan()
        bank.write_bytes(original)
        package=self.candidate/"browser/player3-technical-only.zip"
        with ZipFile(package,"a",compression=ZIP_STORED) as archive:
            archive.writestr("answer-keys.json",b'{"correctOptionId":"o1"}')
        with self.assertRaisesRegex(PublicationDenied,"HTML5_SOURCE_ZIP_DRIFT"):
            self.plan()

    def test_private_output_no_overwrite_and_no_repo_writes(self):
        target=self.path/"secure"/"private-plan.json"
        write_plan(self.candidate,QA_TENANT,12345,SHA,ORIGIN,target)
        self.assertEqual(stat.S_IMODE(target.stat().st_mode),0o600)
        self.assertEqual(json.loads(target.read_text())["environment"],"staging")
        with self.assertRaisesRegex(PublicationDenied,"OUTPUT_MUST_BE_PRIVATE_AND_NEW"):
            write_plan(self.candidate,QA_TENANT,12345,SHA,ORIGIN,target)


if __name__ == "__main__":
    unittest.main()
