#!/usr/bin/env python3
"""Staging-only R2+isolated Pages publisher for an already provisioned QA course.

source_reference: PLAYER3_TECHNICAL_FIRST_ACCEPTANCE.md, build_player3_qa_publication_plan.py.
operational_decision: apply only a SHA-pinned synthetic plan in a trusted,
  serialized GitHub staging runner after physical D1 course preflight and
  explicit approval; never put keys, bank, tokens or answers in Pages output.
dry_run_required: default validates the entire candidate with zero network/writes.
rollback_plan_required: published immutable R2 objects are retained for a
  governed retirement; staged Pages assets require a dedicated QA project.
  D1 Time Travel/recovery and QA course lifecycle remain separate gates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

from importlib.machinery import SourceFileLoader

_FACTORY = Path(__file__).resolve().parents[1] / "learning-factory"
_blueprint = SourceFileLoader(
    "player3_qa_publication_blueprint",
    str(_FACTORY / "build_player3_qa_publication_plan.py"),
).load_module()

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "worker-airtrust"
R2_BUCKET = "airtrust-storage-staging"
ID = re.compile(r"^qa-player3-[a-z0-9-]{1,32}$")
HASH = re.compile(r"^[0-9a-f]{40}$")


class PublicationBlocked(RuntimeError):
    pass


def require(ok, code):
    if not ok:
        raise PublicationBlocked(code)


def hexsha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def prepare(plan_file: Path, candidate: Path):
    require(plan_file.is_file() and not plan_file.is_symlink(),
            "QA_PLAN_REQUIRED")
    plan = json.loads(plan_file.read_text(encoding="utf8"))
    require(isinstance(plan, dict) and plan.get("state") == "REVIEW_ONLY_NO_REMOTE_APPLY",
            "QA_PLAN_NOT_REVIEW_ONLY")
    expected = _blueprint.compose(
        candidate, plan.get("targetTenantId"), plan.get("targetCourseId"),
        plan.get("releaseSha"), plan.get("publicHtml5Origin"))
    require(plan == expected, "QA_PLAN_OR_CANDIDATE_DRIFT")
    require(expected["targetTenantId"] == 999006 and
            len(expected["privateR2Objects"]) == 4 and
            len(expected["publicHtml5Objects"]) == 2 and
            expected["environment"] == "staging" and
            expected["remoteWritesPerformed"] is False,
            "QA_PLAN_SCOPE_INVALID")
    with ZipFile(candidate / "browser/player3-technical-only.zip") as z:
        page_assets = {name: z.read(name) for name in ("index.html", "app.js")}
    for item in expected["publicHtml5Objects"]:
        name = item["url"].rsplit("/", 1)[-1]
        require(name in page_assets and
                hexsha(page_assets[name]) == item["sha256"] and
                len(page_assets[name]) == item["bytes"], "QA_HTML5_ASSET_DRIFT")
    return expected, page_assets


def approval_gate(plan, project: str, env):
    # This check supplements (does not replace) protected staging environment
    # review, F0's lock, the Actions eight-gate check and D1 Time Travel receipt.
    require(env.get("GITHUB_ACTIONS") == "true" and
            env.get("GITHUB_REF") == "refs/heads/main" and
            env.get("GITHUB_REPOSITORY") == "Airtrust-Org/airtrust",
            "QA_TRUSTED_ACTIONS_MAIN_REQUIRED")
    require(env.get("PLAYER3_QA_APPROVED_SHA") == plan["releaseSha"] and
            HASH.fullmatch(env.get("PLAYER3_QA_APPROVED_SHA", "")),
            "QA_APPROVED_EXACT_SHA_REQUIRED")
    require(env.get("CONFIRM_STAGING_PLAYER3_QA_PUBLISH") ==
            "AIRTRUST_STAGING_PLAYER3_SYNTHETIC_PUBLISH" and
            env.get("PLAYER3_QA_LOCK_GRANTED") ==
            "airtrust-staging-mutations-and-scorm-qa" and
            env.get("PLAYER3_QA_PHYSICAL_COURSE_VERIFIED") == "true" and
            env.get("PLAYER3_QA_RECOVERY_POINT_VERIFIED") == "true",
            "QA_STAGING_APPROVAL_LOCK_RECOVERY_REQUIRED")
    require(ID.fullmatch(project) and project != "airtrust" and
            plan["publicHtml5Origin"] == f"https://{project}.pages.dev",
            "QA_DEDICATED_PAGES_PROJECT_ORIGIN_REQUIRED")
    require(env.get("PLAYER3_QA_PAGES_PROJECT") == project and
            env.get("PLAYER3_QA_R2_BUCKET") == R2_BUCKET,
            "QA_PINNED_CLOUDFLARE_TARGET_REQUIRED")
    require(env.get("CLOUDFLARE_API_TOKEN") and
            env.get("CLOUDFLARE_ACCOUNT_ID"), "QA_STAGING_CLOUDFLARE_SECRETS_REQUIRED")


def _run(args, *, cwd=WORKER):
    # Never pass credentials as CLI arguments, log response bodies or print
    # command stdout. Secrets come only from the protected staging environment.
    done = subprocess.run(args, cwd=cwd, capture_output=True,
                          text=True, timeout=90, check=False)
    require(done.returncode == 0, "QA_PUBLISH_CLOUDFLARE_OPERATION_FAILED")


def probe_remote_object(args, file_path: Path):
    """Return false only for an explicit missing object; never mask auth errors."""
    done = subprocess.run(args, cwd=WORKER, capture_output=True,
                          text=True, timeout=90, check=False)
    if done.returncode == 0:
        require(file_path.is_file(), "QA_R2_GET_RESPONSE_MISSING")
        return True
    combined = (done.stderr + "\n" + done.stdout).lower()
    if re.search(r"\b(404|object not found|object does not exist|no such r2 object)\b",
                 combined):
        return False
    raise PublicationBlocked("QA_R2_GET_FAILED_NOT_AN_AUTHORIZED_MISS")


def verify_r2_readback(receipt: Path, item):
    require(receipt.is_file() and not receipt.is_symlink() and
            hexsha(receipt.read_bytes()) == item["sha256"] and
            receipt.stat().st_size == item["bytes"],
            "QA_R2_READBACK_INTEGRITY_FAILURE")


def publish(plan_file: Path, candidate: Path, project: str, *, apply=False, env=None):
    plan, assets = prepare(plan_file, candidate)
    if not apply:
        return {"status": "DRY_RUN", "r2Writes": 0, "pagesDeploys": 0,
                "scope": "qa_examiner_training", "editionSha256": plan["artifactSha256"]}
    approval_gate(plan, project, os.environ if env is None else env)
    wrangler = str(WORKER / "node_modules/.bin/wrangler")
    require(Path(wrangler).is_file(), "QA_WRANGLER_NOT_INSTALLED")
    with tempfile.TemporaryDirectory(prefix="player3-qa-publish-") as directory:
        root = Path(directory)
        pages = root / "site"
        for item in plan["publicHtml5Objects"]:
            url = urlsplit(item["url"])
            relative = url.path.lstrip("/")
            require(relative.startswith(
                f"qa/player3/999006/{plan['targetCourseId']}/{plan['artifactSha256']}/"
            ), "QA_HTML5_PATH_OUT_OF_SCOPE")
            target = pages / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(assets[target.name])
        # Never publish private artifacts in the Pages directory.
        require(sorted(p.name for p in pages.rglob("*") if p.is_file()) ==
                ["app.js", "index.html"], "QA_BROWSER_FILESET_INVALID")
        for item in plan["privateR2Objects"]:
            source = candidate / "private" / item["key"].rsplit("/", 1)[-1]
            require(hexsha(source.read_bytes()) == item["sha256"],
                    "QA_R2_OBJECT_BYTES_DRIFT")
            recovered = root / (source.name + ".readback")
            get_args = [wrangler, "r2", "object", "get",
                        f"{R2_BUCKET}/{item['key']}", "--remote",
                        f"--file={recovered}"]
            found = probe_remote_object(get_args, recovered)
            if found:
                # Never overwrite an existing different object at the same
                # immutable tenant/course/edition key. Reuse exact bytes.
                verify_r2_readback(recovered, item)
            else:
                _run([wrangler, "r2", "object", "put",
                      f"{R2_BUCKET}/{item['key']}", "--remote",
                      f"--file={source}", "--content-type=application/json"])
                _run(get_args)
                verify_r2_readback(recovered, item)
        _run([wrangler, "pages", "deploy", str(pages),
              f"--project-name={project}", "--branch=staging",
              f"--commit-hash={plan['releaseSha']}"], cwd=ROOT)
    # A Pages deploy URL alone does not prove the requested origin resolves to
    # these bytes; an independent HTTPS fetch/check is required before D1 publish.
    return {"status": "R2_READBACK_AND_PAGES_DEPLOYED_VERIFY_HTTPS_BEFORE_D1",
            "r2Writes": len(plan["privateR2Objects"]), "pagesDeploys": 1,
            "scope": "qa_examiner_training", "editionSha256": plan["artifactSha256"]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--pages-project", default="")
    parser.add_argument("--apply", action="store_true")
    opts = parser.parse_args()
    try:
        result = publish(opts.plan, opts.candidate, opts.pages_project,
                         apply=opts.apply)
        print(json.dumps(result, sort_keys=True))
    except (PublicationBlocked, _blueprint.PublicationDenied, ValueError,
            OSError, json.JSONDecodeError) as exc:
        code = str(exc) if isinstance(exc, PublicationBlocked) else "QA_PUBLISH_PREFLIGHT_DENIED"
        parser.exit(1, code + "\n")


if __name__ == "__main__":
    main()
