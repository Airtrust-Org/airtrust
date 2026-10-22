#!/usr/bin/env python3
"""Offline-only publication blueprint for an immutable, synthetic Player 3 QA course.

source_reference: prepare_player3_technical_candidate.py, Schema V2 0558/0559/
  0561/0562, lms-native-enrollment-edition-selector.ts and
  lms-player3-module-attempt-writer.ts.
operational_decision: generate a SHA-pinned list of exact private R2 keys and
  strictly separated public HTML5 assets for the dedicated staging QA tenant.
  This is NOT a deployment, migration, enrollment, or permission grant.
dry_run_required: no remote client; refuse any non-synthetic release candidate.
rollback_plan_required: output is a disposable local file; physical data is
  immutable by Schema V2 and must only be retired under separate governance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

SHA64 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
ID = re.compile(r"^[1-9][0-9]{0,15}$")
QA_TENANT = 999006
# Runtime and content origins must remain independently isolated. The HTML5
# origin is a third HTTPS host and must never alias the API or Pages.
STAGING_RUNTIME_HOSTS = frozenset((
    "staging.airtrust.pages.dev",
    "airtrust-api-staging.airtrust.workers.dev",
))
ROOT = Path(__file__).resolve().parents[2]
FILES = (
    "native-private-candidate.json",
    "player3-approved-policy.json",
    "player3-server-private-bank.json",
    "source-stage-crosswalk.json",
)


class PublicationDenied(ValueError):
    pass


def require(condition: bool, code: str):
    if not condition:
        raise PublicationDenied(code)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verified_file(root: Path, name: str, sha: str) -> dict:
    source = root / name
    require(source.is_file() and not source.is_symlink() and SHA64.fullmatch(sha),
            "QA_PRIVATE_SOURCE_MISSING_OR_UNPINNED")
    data = source.read_bytes()
    require(0 < len(data) <= 4 * 1024 * 1024 and digest(data) == sha,
            "QA_PRIVATE_SOURCE_BYTES_MISMATCH")
    return {"name": name, "sha256": sha, "bytes": len(data)}


def allowed_origin(origin: object) -> str:
    require(isinstance(origin, str) and len(origin) <= 260,
            "QA_HTML5_ORIGIN_MISSING")
    url = urlsplit(origin)
    require(url.scheme == "https" and url.hostname and url.netloc == url.hostname
            and not url.path and not url.query and not url.fragment
            and not url.username and not url.password and
            not url.hostname.endswith("airtrust.online") and
            url.hostname.rstrip(".") not in STAGING_RUNTIME_HOSTS and
            ("qa" in url.hostname or "staging" in url.hostname or
             "stage" in url.hostname),
            "QA_HTML5_SEPARATE_STAGING_ORIGIN_REQUIRED")
    return origin


def compose(candidate: Path, tenant: int, course: int,
            release_sha: str, content_origin: str) -> dict:
    require(type(tenant) is int and tenant == QA_TENANT,
            "QA_EXCLUSIVE_STAGING_TENANT_REQUIRED")
    require(type(course) is int and ID.fullmatch(str(course)),
            "QA_APPROVED_PHYSICAL_COURSE_ID_REQUIRED")
    require(isinstance(release_sha, str) and SHA40.fullmatch(release_sha),
            "QA_PINNED_RELEASE_SHA_REQUIRED")
    origin = allowed_origin(content_origin)
    require(not candidate.is_symlink(), "QA_CANDIDATE_SYMLINK")
    manifest_file = candidate / "manifest.json"
    require(manifest_file.is_file() and not manifest_file.is_symlink(),
            "QA_CANDIDATE_MANIFEST_MISSING")
    manifest = json.loads(manifest_file.read_text(encoding="utf8"))
    require(manifest.get("status") ==
            "OFFLINE_TECHNICAL_CANDIDATE_NOT_APPROVED_FOR_STAGING_OR_PRODUCTION"
            and manifest.get("remoteWrites") is False
            and manifest.get("reviewedRelease") is False
            and manifest.get("courseId") == "qa-player3-synthetic",
            "QA_SYNTHETIC_REVIEW_ONLY_CANDIDATE_REQUIRED")
    private = candidate / "private"
    require(private.is_dir() and not private.is_symlink() and
            set(p.name for p in private.iterdir()) == set(FILES),
            "QA_PRIVATE_CANDIDATE_FILESET_INVALID")
    file_hashes = {
        "native-private-candidate.json": manifest.get("editionSha256"),
        "player3-approved-policy.json": manifest.get("policySha256"),
        "player3-server-private-bank.json": manifest.get("privateBankSha256"),
    }
    require(all(isinstance(h, str) and SHA64.fullmatch(h)
                for h in file_hashes.values()),
            "QA_MANIFEST_PRIVATE_HASH_INVALID")
    private_files = []
    for name in FILES:
        sha = file_hashes.get(name) or digest((private / name).read_bytes())
        private_files.append(verified_file(private, name, sha))
    artifact = json.loads((private / FILES[0]).read_text())
    policy = json.loads((private / FILES[1]).read_text())
    bank = json.loads((private / FILES[2]).read_text())
    crosswalk = json.loads((private / FILES[3]).read_text())
    require(artifact.get("schema") == "AIRTRUST_NATIVE_COURSE_V1" and
            artifact.get("courseId") == "qa-player3-synthetic" and
            manifest.get("packageVersion") == artifact.get("packageVersion") and
            manifest.get("artifactSha256") == private_files[0]["sha256"] and
            policy.get("schema") == "AIRTRUST_PLAYER3_GRADE_POLICY_V1" and
            policy.get("editionSha256") == private_files[0]["sha256"] and
            policy.get("courseId") == bank.get("courseId") ==
            crosswalk.get("courseId") == artifact["courseId"],
            "QA_PRIVATE_ARTIFACT_OR_POLICY_DRIFT")
    zip_path = candidate / "browser/player3-technical-only.zip"
    require(zip_path.is_file() and not zip_path.is_symlink() and
            manifest.get("sourceZipSha256") == digest(zip_path.read_bytes()),
            "QA_HTML5_SOURCE_ZIP_DRIFT")
    with ZipFile(zip_path) as archive:
        require(sorted(archive.namelist()) == ["app.js", "index.html"],
                "QA_PUBLIC_ZIP_ASSET_SCOPE")
        index_bytes, js_bytes = archive.read("index.html"), archive.read("app.js")
        for raw in (index_bytes, js_bytes):
            require(all(secret not in raw for secret in
                (b"privateSyntheticAnswerKeys", b"correctOptionId",
                 b"PRIVATE_NEVER_SERVE_TO_BROWSER", b"player3-server-private-bank")),
                "QA_PRIVILEGED_CONTENT_IN_BROWSER_ZIP")
        require(manifest.get("contentSha256") ==
                digest(index_bytes + js_bytes),
                "QA_HTML5_CONTENT_SHA_DRIFT")
    require(policy.get("source_sha256") == bank.get("source_sha256") ==
            crosswalk.get("sourceSha256") == manifest.get("sourceZipSha256") and
            policy.get("learnerContent", {}).get("sourceStageCrosswalkSha256") ==
            private_files[3]["sha256"],
            "QA_PLAYER3_PRIVATE_CROSSWALK_INCONSISTENT")
    require(manifest.get("unitCount") == len(artifact.get("units", [])) and
            manifest.get("stageCount") == len(policy.get("stages", [])) and
            manifest.get("unitCount") == 5 and manifest.get("stageCount") == 1,
            "QA_IMMUTABLE_TECHNICAL_UNIT_COUNT_DRIFT")
    r2prefix = f"lms/native/{tenant}/{course}/{private_files[0]['sha256']}/"
    # Browser paths bind tenant, physical course and immutable edition.
    # No QA static artifact can be accidentally reused at another scope.
    public_prefix = f"/qa/player3/{tenant}/{course}/{private_files[0]['sha256']}/"
    return {
        "schema": "AIRTRUST_PLAYER3_QA_PUBLICATION_PLAN_V1",
        "state": "REVIEW_ONLY_NO_REMOTE_APPLY",
        "releaseSha": release_sha,
        "environment": "staging",
        "targetTenantId": tenant,
        "targetCourseId": course,
        "syntheticCourseCode": manifest["courseId"],
        "expectedNativePackageVersion": artifact["packageVersion"],
        "artifactSha256": private_files[0]["sha256"],
        "sourceZipSha256": manifest["sourceZipSha256"],
        "stagedR2Prefix": r2prefix,
        "privateR2Objects": [
            {"key": r2prefix + item["name"], "sha256": item["sha256"],
             "bytes": item["bytes"]} for item in private_files
        ],
        "publicHtml5Origin": origin,
        "publicHtml5Objects": [
            {"url": origin + public_prefix + name,
             "sha256": digest(data), "bytes": len(data)}
            for name, data in (("index.html", index_bytes), ("app.js", js_bytes))
        ],
        "physicalPreconditions": [
            "QA_TENANT_EXISTS_ONCE",
            "QA_LMS_INTEGRATED_QUALIFICATION_ACTIVE",
            "COURSE_BELONGS_TO_QA_TENANT_WITHOUT_SCORM_PACKAGE_OR_ENROLLMENTS",
            "NO_EXISTING_NATIVE_MARKER_OR_EDITION_OR_POLICY",
            "STAGING_SCHEMA_V2_0558_0559_0561_0562_APPLIED",
            "GOVERNED_R2_PUT_AND_READBACK_SHA_VERIFY_BEFORE_PUBLISH",
            "EDITION_DRAFT_REVIEWED_PUBLISHED_TRANSITIONS",
            "POLICY_DRAFT_APPROVED_WITH_QA_APPROVER",
            "TWO_INDEPENDENT_AUTHENTICATED_QA_LEARNERS",
            "SIX_ENROLLMENTS_VIA_WORKER_NOT_SQL",
            "LOCKED_STAGING_WINDOW_AND_RECOVERY_POINT",
        ],
        "validatedPhysicalCourse": False,
        "validatedRemoteR2": False,
        "validatedD1Policy": False,
        "approvedForProduction": False,
        "remoteWritesPerformed": False,
    }


def write_plan(candidate: Path, tenant: int, course: int,
               release_sha: str, origin: str, output: Path):
    require(not output.exists() and not output.is_symlink() and
            not output.resolve().is_relative_to(ROOT),
            "QA_PLAN_OUTPUT_MUST_BE_PRIVATE_AND_NEW")
    doc = compose(candidate, tenant, course, release_sha, origin)
    output.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf8") as file:
        json.dump(doc, file, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        file.write("\n")
    os.chmod(output, 0o600)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--tenant-id", type=int, required=True)
    parser.add_argument("--course-id", type=int, required=True)
    parser.add_argument("--release-sha", required=True)
    parser.add_argument("--content-origin", required=True)
    parser.add_argument("--out", type=Path, required=True)
    opt = parser.parse_args()
    write_plan(opt.candidate, opt.tenant_id, opt.course_id,
               opt.release_sha, opt.content_origin, opt.out)
    print("PLAYER3_QA_REVIEW_ONLY_PUBLICATION_PLAN_CREATED_NO_REMOTE_WRITES")
