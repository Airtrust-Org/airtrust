#!/usr/bin/env python3
"""Prepare a coherent *offline* Native + HTML5 Player 3 QA test candidate.

The output is synthetic-only and NOT an authorized content release or database
seed. All privileged data remain in a private local directory (0700/0600).
Actual tenant/actor approval, Schema V2 and staging release are separate gates.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
from pathlib import Path

GENERATOR_PATH = Path(__file__).with_name("generate_player3_technical_zip.py")
SPEC = importlib.util.spec_from_file_location("player3_disposable_zip", GENERATOR_PATH)
assert SPEC and SPEC.loader
zip_gen = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(zip_gen)

ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


class CandidateError(ValueError):
    pass


def canonical(data: dict | list) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def write_private(path: Path, data: dict) -> str:
    path.write_bytes(canonical(data))
    os.chmod(path, 0o600)
    return digest(path.read_bytes())


def native_artifact(course_id: str) -> dict:
    if not ID.fullmatch(course_id) or not course_id.startswith("qa-"):
        raise CandidateError("SYNTHETIC_QA_COURSE_ID_REQUIRED")
    items = zip_gen.units()
    artifact_units = []
    artifact_questions = []
    for u in items:
        stage = u.get("official")
        question_ids = []
        if stage:
            for idx, q in enumerate(stage["questions"], 1):
                qid = f"qa-stage-1-q{idx}"
                question_ids.append(qid)
                artifact_questions.append({
                    "id": qid, "prompt": q["question"],
                    "options": [
                        {"id": "o0", "text": q["wrong"]},
                        {"id": "o1", "text": q["correct"]},
                    ],
                    "correctOptionId": "o1",
                    "feedbackCorrect": "Resposta sintética correta.",
                    "feedbackIncorrect": "Revisar a questão sintética.",
                })
        artifact_units.append({
            "id": u["id"], "title": u["visualCue"],
            "kind": u["kind"],
            "blocks": [{"type": "paragraph", "text": u["visualCue"]}],
            "questionIds": question_ids,
        })
    source_identity = canonical({"courseId": course_id, "units": artifact_units,
                                 "questions": artifact_questions})
    version = "n-" + digest(source_identity)[:32]
    return {
        "schema": "AIRTRUST_NATIVE_COURSE_V1", "courseId": course_id,
        "packageVersion": version,
        "title": "Player 3 — homologação exclusivamente sintética",
        "locale": "pt-BR", "policy": {"mode": "SCORED", "masteryScore": 70,
                                     "moduleGate": True},
        "assets": [], "units": artifact_units, "questions": artifact_questions,
    }


def prepare(out: Path, parent_origin: str, course_id="qa-player3-synthetic") -> dict:
    zip_gen.safe_origin(parent_origin)
    if out.exists() or out.is_symlink():
        raise CandidateError("SYNTHETIC_QA_OUTPUT_EXISTS")
    artifact = native_artifact(course_id)
    artifact_raw = canonical(artifact)
    edition_sha = digest(artifact_raw)
    out.mkdir(parents=True, mode=0o700)
    try:
        private = out / "private"
        private.mkdir(mode=0o700)
        public = out / "browser"
        result = zip_gen.build(public, parent_origin, edition_sha)
        source_sha = result["sourceZipSha256"]
        ids = [u["id"] for u in zip_gen.units()]
        stage_id = "qa-stage-1"
        question_ids = [f"qa-stage-1-q{i}" for i in range(1, 11)]
        crosswalk = {
            "courseId": course_id,
            "sourceSha256": source_sha,
            "editionSha256": edition_sha,
            "units": ids,
            "stages": {stage_id: question_ids},
        }
        launch = {
            "schema": "AIRTRUST_PLAYER3_AUTHORED_LAUNCH_V1",
            "sourceSha256": source_sha,
            "contentSha256": result["contentSha256"],
            "sourceStageCrosswalkSha256": digest(canonical(crosswalk)),
            # Mirrors JS JSON.stringify(list_of_ids); not Python's spaced JSON.
            "orderedUnitIdsSha256": digest(json.dumps(ids, separators=(",", ":")).encode()),
            "answersStripped": True,
            "legacyScormDisabled": True,
            # Exercises Worker launch contract only. NOT an actual reviewed edition.
            "reviewedImmutableRelease": True,
        }
        bank = {
            "schema": "AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1",
            "source_sha256": source_sha, "courseId": course_id,
            "PRIVATE_NEVER_SERVE_TO_BROWSER": True,
            "questions": [{
                "id": qid, "stageId": stage_id,
                "options": ["o0", "o1"], "correctOptionId": "o1",
                "feedbackCorrect": "OK (sintético)",
                "feedbackIncorrect": "Revisar (sintético)",
            } for qid in question_ids],
        }
        policy = {
            "schema": "AIRTRUST_PLAYER3_GRADE_POLICY_V1",
            "courseId": course_id, "source_sha256": source_sha,
            "editionSha256": edition_sha,
            # True is needed to test the grader contract, not approval to deploy.
            "certificationApproved": True,
            "stages": [{
                "stageId": stage_id, "masteryScore": 70,
                "requiredQuestionIds": question_ids,
            }],
            "learnerContent": launch,
        }
        art_hash = write_private(private / "native-private-candidate.json", artifact)
        bank_hash = write_private(private / "player3-server-private-bank.json", bank)
        policy_hash = write_private(private / "player3-approved-policy.json", policy)
        write_private(private / "source-stage-crosswalk.json", crosswalk)
        manifest = {
            "status": "OFFLINE_TECHNICAL_CANDIDATE_NOT_APPROVED_FOR_STAGING_OR_PRODUCTION",
            "remoteWrites": False,
            "courseId": course_id, "packageVersion": artifact["packageVersion"],
            "editionSha256": edition_sha, "sourceZipSha256": source_sha,
            "contentSha256": result["contentSha256"],
            "policySha256": policy_hash, "privateBankSha256": bank_hash,
            "unitCount": len(ids), "lessonCount": sum(u["kind"] == "lesson" for u in zip_gen.units()),
            "stageCount": 1,
            "artifactSha256": art_hash,
            "reviewedRelease": False,
        }
        (out / "manifest.json").write_bytes(canonical(manifest) + b"\n")
        return manifest
    except BaseException:
        shutil.rmtree(out)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--parent-origin", required=True)
    parser.add_argument("--course-id", default="qa-player3-synthetic")
    args = parser.parse_args()
    print(json.dumps(prepare(args.out, args.parent_origin, args.course_id), sort_keys=True))


if __name__ == "__main__":
    main()
