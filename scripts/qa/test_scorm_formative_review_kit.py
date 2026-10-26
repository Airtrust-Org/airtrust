#!/usr/bin/env python3
"""Regression coverage for exact-ZIP formative human-review intake."""
import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

import scorm_formative_review_kit as kit

MODULE = Path(__file__).with_name("scorm-pedagogical-review-from-csv.py")
spec = importlib.util.spec_from_file_location("scorm_review_convert", MODULE)
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class FormativeReviewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.zip = self.root / "course.zip"
        self.csv = self.root / "review.csv"
        self.model = {"slides": [
            {"id": "activity_1", "title": "Scenario", "layout": "scenario",
             "options": [
                 {"text": "Uncontrolled file", "correct": False, "feedback": "No."},
                 {"text": "Check current manual", "correct": True, "feedback": "Yes."}]},
            {"id": "end", "layout": "end", "isEnd": True},
        ]}
        self.manifest = {"assessment": {"mode": "NONE", "scoringBySCORM": False},
                         "content": {"requiredSlides": ["activity_1", "end"]},
                         "formative": {"requiredActivities": ["activity_1"]}}
        with ZipFile(self.zip, "w") as z:
            z.writestr("content.js", "window.AIRTRUST_CONTENT = " +
                       json.dumps(self.model) + ";\n")
            z.writestr("airtrust-completion-manifest.json",
                       json.dumps(self.manifest))
        self.sha = hashlib.sha256(self.zip.read_bytes()).hexdigest()

    def write_review(self, amend=None):
        rows = kit.inventory(self.zip, self.sha, 15)
        assert len(rows) == 1
        row = rows[0]
        row.update(reviewer_selected_index="1",
                   reviewer_evidence="The current controlled manual governs the procedure.",
                   reviewer_name="Independent Reviewer",
                   reviewer_date="2026-10-25",
                   review_state="APPROVED")
        if amend:
            amend(row)
        kit.write_template(self.csv, [row])

    def convert(self):
        return converter.convert(self.csv, self.sha,
                                 "reviewer_id_123", "approval_workflow_record",
                                 "2026-10-25T12:00:00.000Z",
                                 zip_path=self.zip, course_id=15)

    def test_generated_review_is_unapproved_and_no_answer_exposed(self):
        kit.write_template(self.csv, kit.inventory(self.zip, self.sha, 15))
        with self.csv.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(rows[0]["review_state"], "PENDING")
        self.assertEqual(rows[0]["reviewer_selected_index"], "")
        self.assertNotIn("correct", rows[0]["options_json"])
        with self.assertRaisesRegex(ValueError, "UNREVIEWED_ITEM"):
            self.convert()

    def test_approved_real_review_needs_followup_crypto_signature(self):
        self.write_review()
        result = self.convert()
        self.assertEqual(len(result["items"]), 1)
        self.assertTrue(result["approved"])
        self.assertEqual(result["packageSha256"], self.sha)
        self.assertNotIn("signature", result)

    def test_reject_wrong_zip_sha(self):
        with self.assertRaisesRegex(ValueError, "ZIP_SHA_MISMATCH"):
            kit.inventory(self.zip, "0"*64, 15)

    def test_reject_wrong_reviewer_choice(self):
        self.write_review(lambda row: row.update(reviewer_selected_index="0"))
        with self.assertRaisesRegex(ValueError, "SELECTION_DISAGREES"):
            self.convert()

    def test_reject_changed_options(self):
        self.write_review(lambda row: row.update(options_json='["tampered"]'))
        with self.assertRaisesRegex(ValueError, "ZIP_CONTENT_DRIFT"):
            self.convert()

    def test_reject_duplicate_scenario_and_missing_activity(self):
        self.manifest["formative"]["requiredActivities"] = ["wrong_id"]
        with ZipFile(self.zip, "w") as z:
            z.writestr("content.js", "window.AIRTRUST_CONTENT = " +
                       json.dumps(self.model) + ";\n")
            z.writestr("airtrust-completion-manifest.json",
                       json.dumps(self.manifest))
        changed_sha = hashlib.sha256(self.zip.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, "ACTIVITY_SET_MISMATCH"):
            kit.inventory(self.zip, changed_sha, 15)


if __name__ == "__main__":
    unittest.main()
