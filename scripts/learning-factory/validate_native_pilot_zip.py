#!/usr/bin/env python3
"""Read-only, private ZIP boundary check for real Native V5/V6 pilot courses.

This never publishes, certifies, re-packs, authorizes a policy or writes a ZIP.
It logs structural counts/hashes only, never question text, correct answers,
source archives, student data or private bank contents.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import PurePosixPath
from zipfile import ZipFile, BadZipFile

MAX_ENTRIES = 400
MAX_BYTES = 250 * 1024 * 1024
SHA = re.compile(r"^[a-f0-9]{64}$")
NATIVE_WORKER_VERSION = re.compile(r"^n-[a-f0-9]{32}$")
PRIVATE_KEYS = frozenset(("correctOptionId", "feedbackCorrect", "feedbackIncorrect"))


class PilotReviewError(ValueError):
    pass


def require(condition: bool, code: str) -> None:
    if not condition:
        raise PilotReviewError("NATIVE_PILOT_" + code)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def private_fields(value: object) -> bool:
    if isinstance(value, dict):
        return bool(PRIVATE_KEYS.intersection(value)) or any(private_fields(v) for v in value.values())
    if isinstance(value, list):
        return any(private_fields(v) for v in value)
    return False


def validate_private_pilot(path: str) -> dict:
    try:
        with ZipFile(path, "r") as archive:
            files = archive.infolist()
            require(0 < len(files) <= MAX_ENTRIES, "ZIP_ENTRIES")
            require(sum(i.file_size for i in files) <= MAX_BYTES, "ZIP_TOO_LARGE")
            names = set()
            for i in files:
                part = PurePosixPath(i.filename)
                require(not i.filename.startswith("/") and "\\" not in i.filename and
                        ".." not in part.parts and not i.filename.startswith("./"),
                        "UNSAFE_ZIP_PATH")
                require(i.filename not in names, "DUPLICATE_ZIP_ENTRY")
                require(i.file_size <= MAX_BYTES and not ((i.external_attr >> 16) & 0o170000) == 0o120000,
                        "UNSAFE_ZIP_MEMBER")
                names.add(i.filename)
            required = [
                "privado/edicao-native.json", "privado/banco-questoes.json",
                "privado/crosswalk-questoes.json", "privado/politica-proposta.json",
                "aluno/conteudo-aluno.json", "revisao/relatorio.json",
                "referencia/ORIGINAL_SCORM12_NAO_PUBLICAR.zip",
            ]
            require(all(x in names for x in required), "MISSING_REQUIRED_MEMBER")
            def data(member: str) -> dict:
                item = json.loads(archive.read(member))
                require(isinstance(item, dict), "INVALID_JSON_OBJECT")
                return item
            edition_bytes = archive.read(required[0])
            edition = json.loads(edition_bytes)
            bank = data(required[1])
            crosswalk = data(required[2])
            policy = data(required[3])
            learner = data(required[4])
            report = data(required[5])
            require(edition.get("schema") == "AIRTRUST_NATIVE_COURSE_V1", "EDITION_SCHEMA")
            course_id = edition.get("courseId")
            require(isinstance(course_id, str) and
                    re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}", course_id), "COURSE_ID")
            edition_hash = digest(edition_bytes)
            require(edition_hash == policy.get("editionSha256") ==
                    bank.get("editionSha256") == report.get("candidateEditionSha256"),
                    "EDITION_DIGEST_OR_SCOPE")
            require(course_id == policy.get("courseId") == bank.get("courseId") ==
                    report.get("courseId") == learner.get("courseId"), "CROSS_TENANT_COURSE_SCOPE")
            require(report.get("sourceZipSha256") ==
                    digest(archive.read(required[6])), "ORIGINAL_SOURCE_DIGEST")
            require(edition.get("packageVersion") == learner.get("packageVersion"), "VERSION_DRIFT")
            require(edition.get("policy") == {"mode": "SCORED", "masteryScore": 70, "moduleGate": True},
                    "REQUESTED_EDITORIAL_GRADE")
            require(policy.get("schema") == "AIRTRUST_PLAYER3_GRADE_POLICY_V1" and
                    policy.get("masteryScore") == 70 and policy.get("moduleGate") is True,
                    "PROPOSED_POLICY_MISMATCH")
            require(policy.get("certificationApproved") is False and
                    report.get("independentQaApproved") is False and
                    report.get("publishable") is False, "UNTRUSTED_APPROVAL_STATE")
            require(not private_fields(learner), "ANSWER_KEY_IN_LEARNER_PROJECTION")
            assets = edition.get("assets")
            require(isinstance(assets, list) and len(assets) > 0, "ASSETS_ABSENT")
            require(learner.get("assets") == assets, "ASSET_PROJECTION_DRIFT")
            for media in assets:
                name = media.get("path", "")
                require(isinstance(name, str) and PurePosixPath(name).name == name and
                        not name.startswith("."), "ASSET_UNSAFE_PATH")
                member = "midia/" + name
                require(member in names and SHA.fullmatch(str(media.get("sha256", ""))) and
                        digest(archive.read(member)) == media["sha256"], "ASSET_DIGEST")
            units = edition.get("units")
            questions = edition.get("questions")
            require(isinstance(units, list) and isinstance(questions, list), "EDITION_UNITS")
            require(learner.get("units") == units, "LEARNER_UNITS_DRIFT")
            ids = [q.get("id") for q in questions]
            require(len(ids) == len(set(ids)) and
                    set(ids) == {q.get("id") for q in learner.get("questions", [])} ==
                    {q.get("id") for q in bank.get("questions", [])}, "QUESTIONS_NOT_ONE_TO_ONE")
            cross = crosswalk.get("questions", [])
            require(len(cross) == len(questions) and
                    {q.get("privateQuestionId") for q in cross} == set(ids) and
                    {q.get("learnerQuestionId") for q in cross} == set(ids), "CROSSWALK_INCOMPLETE")
            all_by_id = {q["id"]: q for q in questions}
            for q in cross:
                require(any(u.get("id") == q.get("stageId") and q.get("learnerQuestionId") in
                            u.get("questionIds", []) for u in units), "QUESTION_STAGE_ORPHAN")
            stages = []
            slide_count = 0
            for unit in units:
                kind = unit.get("kind")
                require(kind in ("lesson", "scenario", "practice", "assessment"), "UNIT_KIND")
                if kind in ("lesson", "scenario"):
                    slide_count += 1
                if kind == "assessment":
                    question_ids = unit.get("questionIds", [])
                    require(slide_count >= 20 and isinstance(question_ids, list) and
                            1 <= len(question_ids) <= 200 and
                            len(question_ids) == len(set(question_ids)) and
                            set(question_ids).issubset(all_by_id), "MODULE_SLIDES_OR_QUESTIONS")
                    require(len(question_ids) in (5, 10), "UNREVIEWED_ASSESSMENT_SIZE")
                    stages.append({"stageId": unit["id"], "slides": slide_count,
                                   "questions": len(question_ids),
                                   "minimumCorrect": math.ceil(len(question_ids) * 0.70),
                                   "firstPassingScore": 100 * math.ceil(len(question_ids) * 0.70) //
                                                        len(question_ids)})
                    slide_count = 0
            require(slide_count == 0 and len(stages) in (1, 2), "MODULE_BOUNDARIES")
            plan = report.get("modulePlan", [])
            require(len(plan) == len(stages) and all(
                p.get("assessmentUnitId") == stage["stageId"] and
                p.get("contentSlides") == stage["slides"] and
                p.get("questionCount") == stage["questions"]
                for p, stage in zip(plan, stages)), "EDITORIAL_MODULE_PLAN_MISMATCH")
            # The F4 runtime requires n-<32hex>; these editorial V5/V6
            # versions are intentionally NOT changed (would change edition SHA).
            compatible_version = bool(NATIVE_WORKER_VERSION.fullmatch(
                str(edition.get("packageVersion", ""))))
            return {
                "courseId": course_id, "zipSha256": digest(open(path, "rb").read()),
                "editionSha256": edition_hash, "sourceSha256": report["sourceZipSha256"],
                "moduleStages": stages, "assetsVerified": len(assets),
                "answerKeyExposedToLearner": False,
                "sourceMinimum": report.get("originalPassingScore"),
                "proposedMinimum": 70,
                "workerPackageVersionCompatible": compatible_version,
                "qaEligible": False, "publishable": False, "certificationApproved": False,
                "blockers": [
                    "INDEPENDENT_SIGNED_PEDAGOGICAL_AND_VISUAL_APPROVAL_REQUIRED",
                    "GOVERNED_REAL_COURSE_PUBLISHER_AND_STAGING_GRANT_REQUIRED",
                    "WORKER_PRIVATE_ASSESSMENT_BANK_AND_STAGE_POLICY_ADAPTER_REQUIRED",
                    *([] if compatible_version else
                      ["REPACKAGE_EDITION_WITH_NATIVE_N_VERSION_AND_NEW_APPROVED_SHA"]),
                    "AUTHENTICATED_REAL_BROWSER_ENROLLMENT_AND_TERMINAL_QA_REQUIRED",
                ],
            }
    except (BadZipFile, KeyError, TypeError, json.JSONDecodeError, OSError) as exc:
        raise PilotReviewError("NATIVE_PILOT_INVALID_ARCHIVE_OR_DOCUMENT") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Read-only Native pilot inspection, no publication")
    parser.add_argument("archives", nargs="+", help="Private ZIP files; never copied or uploaded")
    args = parser.parse_args()
    import sys
    for path in args.archives:
        try:
            print(json.dumps(validate_private_pilot(path), sort_keys=True, ensure_ascii=False))
        except PilotReviewError as exc:
            print(str(exc), file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
