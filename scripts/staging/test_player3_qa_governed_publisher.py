"""Focused offline contract for the governed Player3 synthetic publisher."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts/learning-factory"))
from prepare_player3_technical_candidate import prepare
from build_player3_qa_publication_plan import compose

spec=importlib.util.spec_from_file_location(
    "player3_qa_governed_publisher",
    Path(__file__).with_name("player3-qa-governed-publisher.py"))
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
SHA="a"*40
PROJECT="qa-player3-staging"


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.candidate=self.root/"candidate"
        prepare(self.candidate,"https://staging.airtrust.pages.dev")
        self.plan=self.root/"plan.json"
        self.body=compose(self.candidate,999006,12345,SHA,
                          f"https://{PROJECT}.pages.dev")
        self.plan.write_text(json.dumps(self.body))
        self.good_env={
            "GITHUB_ACTIONS":"true","GITHUB_REF":"refs/heads/main",
            "GITHUB_REPOSITORY":"Airtrust-Org/airtrust",
            "PLAYER3_QA_APPROVED_SHA":SHA,
            "CONFIRM_STAGING_PLAYER3_QA_PUBLISH":"AIRTRUST_STAGING_PLAYER3_SYNTHETIC_PUBLISH",
            "PLAYER3_QA_LOCK_GRANTED":"airtrust-staging-mutations-and-scorm-qa",
            "PLAYER3_QA_PHYSICAL_COURSE_VERIFIED":"true",
            "PLAYER3_QA_RECOVERY_POINT_VERIFIED":"true",
            "PLAYER3_QA_PAGES_PROJECT":PROJECT,
            "PLAYER3_QA_R2_BUCKET":"airtrust-storage-staging",
            "CLOUDFLARE_API_TOKEN":"placeholder-unit-test-token",
            "CLOUDFLARE_ACCOUNT_ID":"placeholder-unit-test-account",
        }

    def test_readonly_preflight_never_uses_cloudflare(self):
        with patch.object(mod,"_run",side_effect=AssertionError("network")):
            result=mod.publish(self.plan,self.candidate,PROJECT)
        self.assertEqual(result["status"],"DRY_RUN")
        self.assertEqual(result["r2Writes"],0)

    def test_no_staging_lock_or_target_leaks_into_apply(self):
        invalids=(
            {"PLAYER3_QA_APPROVED_SHA":"b"*40},
            {"PLAYER3_QA_LOCK_GRANTED":""},
            {"PLAYER3_QA_RECOVERY_POINT_VERIFIED":"false"},
            {"PLAYER3_QA_PHYSICAL_COURSE_VERIFIED":"false"},
            {"GITHUB_REF":"refs/heads/feat/lms-native"},
            {"PLAYER3_QA_R2_BUCKET":"airtrust-storage"},
        )
        for delta in invalids:
            with self.subTest(delta=tuple(delta)):
                with self.assertRaises(mod.PublicationBlocked):
                    mod.approval_gate(self.body,PROJECT,{**self.good_env,**delta})
        with self.assertRaises(mod.PublicationBlocked):
            mod.approval_gate(self.body,"airtrust",self.good_env)

    def test_private_plan_and_browser_asset_hash_tamper_fail_closed(self):
        tampered=dict(self.body);tampered["publicHtml5Origin"]="https://staging.airtrust.pages.dev"
        self.plan.write_text(json.dumps(tampered))
        with self.assertRaises(Exception):
            mod.prepare(self.plan,self.candidate)
        self.plan.write_text(json.dumps(self.body))
        zipfile=self.candidate/"browser/player3-technical-only.zip"
        zipfile.write_bytes(b"changed")
        with self.assertRaises(Exception):
            mod.prepare(self.plan,self.candidate)

    def test_remote_existing_hash_mismatch_cannot_be_overwritten(self):
        item = self.body["privateR2Objects"][0]
        file = self.root/"existing"
        file.write_bytes(b"wrong-existing-bytes")
        with self.assertRaisesRegex(mod.PublicationBlocked,
                                    "QA_R2_READBACK_INTEGRITY_FAILURE"):
            mod.verify_r2_readback(file, item)

    def test_get_failure_is_not_automatically_treated_as_missing(self):
        from subprocess import CompletedProcess
        request = ["wrangler", "r2", "object", "get", "bucket/key", "--remote"]
        receipt = self.root/"receipt"
        with patch.object(mod.subprocess,"run",return_value=CompletedProcess(
            request,1,stdout="",stderr="Unauthorized")):
            with self.assertRaisesRegex(mod.PublicationBlocked,
                                        "QA_R2_GET_FAILED_NOT_AN_AUTHORIZED_MISS"):
                mod.probe_remote_object(request,receipt)
        with patch.object(mod.subprocess,"run",return_value=CompletedProcess(
            request,1,stdout="",stderr="404 object not found")):
            self.assertFalse(mod.probe_remote_object(request,receipt))

    def test_no_apply_in_untrusted_local_process(self):
        env={**self.good_env,"GITHUB_ACTIONS":"false"}
        with self.assertRaises(mod.PublicationBlocked):
            mod.approval_gate(self.body,PROJECT,env)


if __name__=="__main__":
    unittest.main()
