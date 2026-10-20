#!/usr/bin/env python3
"""Convert an INDEPENDENT, HUMAN-APPROVED private QA CSV into signer input.
Does not infer answers from SCORM, the runtime, or the source package.
No private content or reviewer name is printed to stdout.
"""
import argparse
import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path

COUNTS = {
    "cdc5a3cf30e4d37697c1f411977d87e16538bc75a6c03379252bbc2c8c06f6d2": (15, 80),
    "8c15a73984591fcea71a4957e306dc8676c40d937537058f2440e52a3748baa7": (41, 45),
}


def convert(csv_path: Path, package_sha: str, reviewer_ref: str,
            approval_ref: str, approved_at: str) -> dict:
    if package_sha not in COUNTS:
        raise ValueError("UNRECOGNIZED_EXACT_ZIP_SHA")
    course, expected = COUNTS[package_sha]
    if not (6 <= len(reviewer_ref) <= 128 and
            all(c.isalnum() or c in "._:-" for c in reviewer_ref)):
        raise ValueError("REVIEWER_REFERENCE_REQUIRED")
    if not 10 <= len(approval_ref.strip()) <= 128:
        raise ValueError("GOVERNED_APPROVAL_REFERENCE_REQUIRED")
    try:
        approval_time = datetime.strptime(approved_at, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError as exc:
        raise ValueError("APPROVAL_TIMESTAMP_REQUIRED") from exc
    if (approval_time.replace(tzinfo=timezone.utc) >
            datetime.now(timezone.utc)):
        raise ValueError("FUTURE_PEDAGOGICAL_APPROVAL")
    with csv_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        must = {"course_id", "package_sha256", "item_type", "slide_index",
                "item_number", "options_json", "reviewer_selected_index",
                "reviewer_evidence", "reviewer_name", "reviewer_date", "review_state"}
        if not must.issubset(set(reader.fieldnames or [])):
            raise ValueError("REVIEW_COLUMNS_INCOMPLETE")
        rows = [r for r in reader if r["package_sha256"] == package_sha]
    if len(rows) != expected:
        raise ValueError(f"INCOMPLETE_INDEPENDENT_REVIEW:{len(rows)}/{expected}")
    names, seen, items = set(), set(), []
    for row in rows:
        if int(row["course_id"]) != course:
            raise ValueError("REVIEW_TENANT_COURSE_SOURCE_MISMATCH")
        if row["review_state"].strip() != "APPROVED":
            raise ValueError("UNREVIEWED_ITEM")
        name = row["reviewer_name"].strip()
        if not name or row["reviewer_date"].strip() != approved_at[:10]:
            raise ValueError("HUMAN_IDENTITY_AND_REVIEW_DATE_REQUIRED")
        names.add(name)
        if len(row["reviewer_evidence"].strip()) < 24:
            raise ValueError("INDEPENDENT_RATIONALE_MISSING")
        choices = json.loads(row["options_json"])
        if not isinstance(choices, list) or not choices:
            raise ValueError("REVIEW_CHOICES_MISSING")
        try:
            idx = int(row["reviewer_selected_index"])
        except (ValueError, TypeError) as exc:
            raise ValueError("REVIEWER_SELECTION_MISSING") from exc
        if idx < 0 or idx >= len(choices):
            raise ValueError("REVIEWER_SELECTION_OUT_OF_RANGE")
        item_id = "/".join((str(course), row["slide_index"].strip(),
                            row["item_type"].strip(), row["item_number"].strip()))
        if item_id in seen:
            raise ValueError("REVIEW_ITEM_DUPLICATED")
        seen.add(item_id)
        items.append({"itemId": item_id, "status": "APPROVED",
                      "selectedIndex": idx,
                      "rationale": row["reviewer_evidence"].strip(),
                      "reviewerReference": reviewer_ref})
    if len(names) != 1:
        raise ValueError("REVIEWER_IDENTITY_INCONSISTENT")
    return {"kind": "AIRTRUST_SCORM_INDEPENDENT_PEDAGOGICAL_REVIEW_V1",
            "packageSha256": package_sha,
            "approved": True, "independentOfPackageAuthor": True,
            "reviewerReference": reviewer_ref, "approvalReference": approval_ref,
            "approvedAt": approved_at, "items": items}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--csv", type=Path, required=True)
    p.add_argument("--package-sha", required=True)
    p.add_argument("--reviewer-reference", required=True)
    p.add_argument("--approval-reference", required=True)
    p.add_argument("--approved-at", required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    data = convert(args.csv, args.package_sha, args.reviewer_reference,
                   args.approval_reference, args.approved_at)
    if args.output.exists():
        raise ValueError("REFUSE_OVERWRITE_PEDAGOGICAL_APPROVAL")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(args.output, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(f"REVIEW_ARTIFACT_CREATED={args.output.name}; APPROVED_ITEMS={len(data['items'])}")


if __name__ == "__main__":
    main()
