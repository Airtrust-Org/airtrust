#!/usr/bin/env python3
"""Prepare an independently reviewable SCORM formative checklist from exact ZIP bytes.

This tool NEVER fills human approvals, identifies a reviewer or signs anything.
It also never promotes an inactive edition or writes to a LMS.
"""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
from zipfile import ZipFile, BadZipFile

FIELDS = (
    "course_id", "package_sha256", "item_type", "slide_index", "item_number",
    "options_json", "reviewer_selected_index", "reviewer_evidence",
    "reviewer_name", "reviewer_date", "review_state",
    "slide_id", "module", "title", "scenario_context", "question",
)
SHA = "0123456789abcdef"


def _fail(reason):
    raise ValueError("FORMATIVE_REVIEW_" + reason)


def inventory(zip_path: Path, expected_sha: str, course_id: int):
    if not (len(expected_sha) == 64 and all(c in SHA for c in expected_sha)):
        _fail("EXPECTED_SHA_INVALID")
    if not (isinstance(course_id, int) and course_id > 0):
        _fail("COURSE_ID_INVALID")
    data = zip_path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha:
        _fail("ZIP_SHA_MISMATCH")
    if len(data) > 80 * 1024 * 1024:
        _fail("ZIP_TOO_LARGE")
    try:
        with ZipFile(zip_path) as z:
            if z.testzip() is not None:
                _fail("ZIP_CRC_INVALID")
            if any(n.startswith("/") or "\\" in n or ".." in n.split("/") for n in z.namelist()):
                _fail("UNSAFE_ENTRY")
            contract = json.loads(z.read("airtrust-completion-manifest.json"))
            raw = z.read("content.js").decode("utf-8")
    except (BadZipFile, KeyError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        _fail("PACKAGE_PARSE_INVALID")
    if not raw.startswith("window.AIRTRUST_CONTENT = "):
        _fail("CONTENT_MODEL_INVALID")
    try:
        model = json.loads(raw.split(" = ", 1)[1].rstrip(";\r\n "))
    except (IndexError, json.JSONDecodeError):
        _fail("CONTENT_MODEL_INVALID")
    if contract.get("assessment", {}).get("mode") != "NONE" or \
       contract["assessment"].get("scoringBySCORM") is not False:
        _fail("NOT_FORMATIVE_WITHOUT_EXAM")
    slides = model.get("slides")
    required = contract.get("formative", {}).get("requiredActivities")
    required_slides = contract.get("content", {}).get("requiredSlides")
    if not isinstance(slides, list) or not slides or len(slides) > 1000 or \
       not isinstance(required, list) or not required or len(required) > 2500 or \
       len(set(required)) != len(required) or \
       not isinstance(required_slides, list) or \
       [s.get("id") for s in slides] != required_slides:
        _fail("CONTENT_COVERAGE_INVALID")
    scenarios = [(idx + 1, slide) for idx, slide in enumerate(slides)
                 if slide.get("layout") == "scenario"]
    if len(scenarios) != len(required) or set(required) != {s.get("id") for _, s in scenarios}:
        _fail("ACTIVITY_SET_MISMATCH")
    rows = []
    for idx, s in scenarios:
        options = s.get("options")
        if not isinstance(options, list) or len(options) < 2 or len(options) > 20 or \
           any(not isinstance(opt, dict) or not isinstance(opt.get("text"), str) or
               not opt["text"].strip() or not isinstance(opt.get("feedback"), str) or
               not opt["feedback"].strip() or not isinstance(opt.get("correct"), bool)
               for opt in options) or sum(opt["correct"] for opt in options) != 1:
            _fail("FORMATIVE_OPTIONS_INCOMPLETE")
        # The authoring answer key must not pre-approve, pre-select, or impersonate
        # independent reviewer judgment. Only student-visible option text is copied.
        rows.append({
            "course_id": str(course_id), "package_sha256": expected_sha,
            "item_type": "FORMATIVE_SCENARIO", "slide_index": str(idx),
            "item_number": "1",
            "options_json": json.dumps([o["text"] for o in options], ensure_ascii=False),
            "reviewer_selected_index": "", "reviewer_evidence": "",
            "reviewer_name": "", "reviewer_date": "", "review_state": "PENDING",
            "slide_id": s["id"], "module": str(s.get("module") or ""),
            "title": str(s.get("title") or ""),
            "scenario_context": str(s.get("lead") or ""),
            "question": str(s.get("question") or ""),
        })
    return rows


def write_template(path: Path, rows):
    if path.exists():
        _fail("REFUSE_OVERWRITE")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--zip", type=Path, required=True)
    ap.add_argument("--package-sha", required=True)
    ap.add_argument("--course-id", type=int, required=True)
    ap.add_argument("--output", type=Path, required=True)
    a = ap.parse_args()
    rows = inventory(a.zip, a.package_sha, a.course_id)
    write_template(a.output, rows)
    print(f"FORMATIVE_REVIEW_PENDING={len(rows)}; ZIP_SHA256={a.package_sha}")


if __name__ == "__main__":
    main()
