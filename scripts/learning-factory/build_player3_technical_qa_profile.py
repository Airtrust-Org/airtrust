#!/usr/bin/env python3
"""Bind already-provisioned, authorized Player 3 staging QA identities to an
immutable, fully synthetic technical candidate. Offline only: NO D1/R2/API calls.

The six real, disposable enrollment/cycle identities must be supplied by an
independent governed staging provisioning step. This tool cannot invent them.
Secrets/QA answer choices remain in a private 0600 output outside the repo.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

from generate_player3_technical_zip import units as synthetic_units

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SHA40 = set("0123456789abcdef")
SHA64 = set("0123456789abcdef")


class QaProfileError(ValueError):
    pass


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise QaProfileError(reason)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha(value: object, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and set(value) <= SHA40


def positive(value: object) -> bool:
    return type(value) is int and 0 < value <= 10**15


def safe_origin(value: object) -> str:
    require(isinstance(value, str), "QA_HTTPS_STAGING_ORIGIN")
    url = urlsplit(value)
    require(url.scheme == "https" and url.hostname and
            ("staging" in url.hostname or "stage" in url.hostname or "qa" in url.hostname)
            and not url.username and not url.password and not url.path and
            not url.query and not url.fragment and
            url.hostname not in ("airtrust.online", "api.airtrust.online") and
            not url.hostname.endswith(".airtrust.online"),
            "QA_HTTPS_STAGING_ORIGIN")
    return value


def route(value: object) -> str:
    require(isinstance(value, str) and value.startswith("/") and
            not value.startswith("//") and ".." not in value and
            "%" not in value and "?" not in value and "#" not in value and
            "\\" not in value, "QA_UNSAFE_ROUTE")
    return value


def main_profile(candidate: Path, assignments: dict) -> dict:
    manifest = json.loads((candidate / "manifest.json").read_text())
    require(manifest.get("status") ==
            "OFFLINE_TECHNICAL_CANDIDATE_NOT_APPROVED_FOR_STAGING_OR_PRODUCTION"
            and manifest.get("remoteWrites") is False,
            "QA_SYNTHETIC_OFFLINE_CANDIDATE_REQUIRED")
    edition = manifest.get("editionSha256")
    source = manifest.get("sourceZipSha256")
    content = manifest.get("contentSha256")
    require(all(sha(x, 64) for x in (edition, source, content)),
            "QA_IMMUTABLE_DIGESTS")
    archive = candidate / "browser/player3-technical-only.zip"
    artifact = candidate / "private/native-private-candidate.json"
    require(archive.is_file() and artifact.is_file() and
            sha256(archive) == source and sha256(artifact) == edition,
            "QA_BYTES_NOT_PINNED")
    with ZipFile(archive) as bundle:
        require(sorted(bundle.namelist()) == ["app.js", "index.html"],
                "QA_PUBLIC_CONTENT_CONTAINS_UNEXPECTED_ASSETS")
    require(sha256(artifact) == manifest.get("artifactSha256"),
            "QA_ARTIFACT_DIGEST_MISMATCH")
    require(assignments.get("schema") == "AIRTRUST_PLAYER3_QA_IDENTITIES_V1" and
            assignments.get("tenantCode") == "qa_examiner_training",
            "QA_GOVERNED_SYNTHETIC_TENANT_REQUIRED")
    tenant = assignments.get("tenantId")
    require(positive(tenant), "QA_SYNTHETIC_TENANT_ID_REQUIRED")
    release = assignments.get("releaseSha")
    require(sha(release, 40), "QA_RELEASE_SHA_REQUIRED")
    origins = [safe_origin(assignments.get(key)) for key in
               ("baseUrl", "apiBaseUrl", "contentOrigin")]
    require(len(set(origins)) == 3, "QA_THREE_SEPARATE_ORIGINS")
    projects = assignments.get("projects")
    require(isinstance(projects, dict) and set(projects) ==
            {"chromium", "webkit"}, "QA_TWO_BROWSERS_REQUIRED")
    source_units = synthetic_units()
    require(len(source_units) == manifest.get("unitCount") and
            sum(bool(u.get("official")) for u in source_units) ==
            manifest.get("stageCount"), "QA_CANDIDATE_UNIT_STAGE_DRIFT")
    out = {}
    enrollment_ids, cycle_ids = set(), set()
    for browser in ("chromium", "webkit"):
        fixture = projects[browser]
        require(isinstance(fixture, dict) and set(fixture) ==
                {"doutrinamento", "resume80", "external"},
                "QA_THREE_INDEPENDENT_JOURNEYS_REQUIRED")
        destination = {}
        for kind, data in fixture.items():
            require(isinstance(data, dict), "QA_MISSING_AUTHORIZED_IDENTITY")
            mid, cid = data.get("enrollmentId"), data.get("cycleId")
            require(positive(mid) and positive(cid) and
                    mid not in enrollment_ids and cid not in cycle_ids,
                    "QA_DUPLICATE_OR_MISSING_ENROLLMENT_CYCLE")
            enrollment_ids.add(mid)
            cycle_ids.add(cid)
            identity = {
                "enrollmentId": mid, "cycleId": cid,
                "launchPath": route(data.get("launchPath")),
                "snapshotPath": (
                    f"/api/lms/native/scorm/matriculas/{mid}/qa-evidencias"
                    if kind == "external" else
                    f"/api/lms/native/matriculas/{mid}/etapas/qa-evidencias"),
                "editionSha256": edition if kind == "doutrinamento" else
                    data.get("editionSha256"),
            }
            require(sha(identity["editionSha256"], 64),
                    "QA_INDEPENDENT_VERSION_MISSING")
            if kind == "doutrinamento":
                require(positive(data.get("courseId")),
                        "QA_NATIVE_COURSE_ID_REQUIRED")
                identity.update({
                    "courseId": data["courseId"],
                    "sourceZipSha256": source, "contentSha256": content,
                    "units": source_units,
                    "requiredLessonIds": [u["lessonId"] for u in source_units
                                          if u.get("lessonId")],
                    "qualificationPath": route(data.get("qualificationPath")),
                    "certificatePath": route(data.get("certificatePath")),
                })
            elif kind == "resume80":
                require(type(data.get("minPreviousPct")) is int and
                        80 <= data["minPreviousPct"] < 100 and
                        isinstance(data.get("expectedResumeUnitId"), str) and
                        isinstance(data.get("creditedNavigationIds"), list) and
                        len(data["creditedNavigationIds"]) > 0,
                        "QA_REAL_80_PERCENT_PROOF_REQUIRED")
                identity.update({key: data[key] for key in
                    ("expectedResumeUnitId", "creditedNavigationIds",
                     "minPreviousPct")})
            else:
                required = ("frameSelectors", "visualLastPageButton",
                    "wrongAnswerButton", "correctAnswerButton", "submitButton",
                    "finishButton", "learnerCompletionButton")
                require(isinstance(data.get("frameSelectors"), list) and
                    all(isinstance(x, str) and x for x in data["frameSelectors"]) and
                    all(isinstance(data.get(k), str) and data[k] for k in required[1:]),
                    "QA_EXTERNAL_SCORM_SELECTORS_REQUIRED")
                identity.update({key: data[key] for key in required})
                identity["scormSnapshotPath"] = f"/api/lms/scorm/state/{mid}"
            destination[kind] = identity
        out[browser] = destination
    require(len(enrollment_ids) == len(cycle_ids) == 6,
            "QA_SIX_DISPOSABLE_JOURNEYS_REQUIRED")
    return {
        "qaContentMode": "SYNTHETIC_TECHNICAL",
        "baseUrl": origins[0], "apiBaseUrl": origins[1], "contentOrigin": origins[2],
        "expectedSourceSha": release, "empresaId": tenant,
        "courseTitle": "Player 3 — homologação exclusivamente sintética",
        "projects": out,
    }


def write_private(candidate: Path, assignments: Path, output: Path) -> None:
    # A QA profile contains synthetic correct answers and may contain tenant IDs.
    # Do not put it in the repository, public browser tree or existing files.
    out = output.resolve()
    require(not out.is_relative_to(PROJECT_ROOT) and
            not out.is_relative_to((candidate / "browser").resolve()),
            "QA_PROFILE_MUST_BE_OUTSIDE_REPO_AND_PUBLIC_ASSETS")
    require(not output.exists() and not output.is_symlink(),
            "QA_PROFILE_FILE_ALREADY_EXISTS")
    data = json.loads(assignments.read_text())
    profile = main_profile(candidate, data)
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf8") as stream:
        json.dump(profile, stream, ensure_ascii=False, separators=(",", ":"))
        stream.write("\n")
    os.chmod(output, 0o600)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True, type=Path)
    parser.add_argument("--assignments", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    write_private(args.candidate, args.assignments, args.out)
    print("PLAYER3_PRIVATE_QA_PROFILE_CREATED_OFFLINE_ONLY")
