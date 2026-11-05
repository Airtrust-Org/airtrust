#!/usr/bin/env python3
"""Prepare a private NR26 Factory RC5 recovery ZIP, never upload or activate it.

The authored 29-slide edition identity is preserved to allow governed reuse of
an existing v4 CMI cursor. R2 package identity still changes; production learners
require a server-verified same-cycle edition handoff and admin approvals.
"""
import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

from verify_golden_core import (
    FORMATIVE_V3_RECOVERY_VERSION,
    PINNED_FORMATIVE_V3,
    PINNED_FORMATIVE_V3_RECOVERY,
    verify_golden_core,
)

SOURCE_ZIP_SHA = "6a354bc290b60855e4fd6834acded23372d3beafcd7f5f5581bb1c0034e3cee1"
SOURCE_PACKAGE_VERSION = "CDS-NR26-AERO-V31-NO-MODULE-EXAM-RC1-20261102"
SOURCE_COURSE_ID = "costa-do-sol-nr26-fds"
SOURCE_MODEL_SHA = "abf2dda6614ef0ce1f400b554ea63be39219206e4e0bf9bc19a5940d231e051c"
CORE = Path(__file__).resolve().parent / "cores" / "AIRTRUST_FORMATIVE_V3_RECOVERY_CANDIDATE.app.js.txt"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(source: Path, output: Path) -> dict:
    if not source.is_file() or source.resolve() == output.resolve():
        raise ValueError("SOURCE_MISSING_OR_OUTPUT_EQUALS_SOURCE")
    if output.exists() or output.suffix.lower() != ".zip":
        raise ValueError("OUTPUT_MUST_BE_NEW_ZIP")
    if sha(source.read_bytes()) != SOURCE_ZIP_SHA:
        raise ValueError("PRIVATE_SOURCE_ZIP_SHA_MISMATCH")
    recovery = CORE.read_bytes()
    if sha(recovery) != PINNED_FORMATIVE_V3_RECOVERY["app.js"]:
        raise ValueError("RECOVERY_CORE_SHA_MISMATCH")

    with zipfile.ZipFile(source) as before:
        infos = before.infolist()
        names = [info.filename for info in infos if not info.is_dir()]
        if len(names) != len(set(names)):
            raise ValueError("DUPLICATED_ASSET_PATH")
        if any(name.startswith("/") or "\\" in name or ".." in Path(name).parts for name in names):
            raise ValueError("UNSAFE_ASSET_PATH")
        if sum(info.file_size for info in infos) > 512 * 1024 * 1024:
            raise ValueError("SOURCE_ZIP_TOO_LARGE")
        for required in ("app.js", "styles.css", "scorm_api.js", "course-model.js",
                         "airtrust-completion-manifest.json"):
            if names.count(required) != 1:
                raise ValueError("REQUIRED_ROOT_FILE_MISSING_OR_DUPLICATED:" + required)
        for name, expected in PINNED_FORMATIVE_V3.items():
            if sha(before.read(name)) != expected:
                raise ValueError("ORIGINAL_GOLDEN_CORE_DRIFT:" + name)
        if sha(before.read("course-model.js")) != SOURCE_MODEL_SHA:
            raise ValueError("COURSE_MODEL_CHANGED")
        manifest = json.loads(before.read("airtrust-completion-manifest.json"))
        if manifest.get("courseId") != SOURCE_COURSE_ID or \
           manifest.get("packageVersion") != SOURCE_PACKAGE_VERSION or \
           manifest.get("factoryCoreVersion") != "AIRTRUST_GOLDEN_MASTER_CORE_V3_RC4_NO_FINAL_EXAM_CANDIDATE" or \
           manifest.get("assessment", {}).get("mode") != "NONE" or \
           len(manifest.get("content", {}).get("requiredSlides", [])) != 29:
            raise ValueError("SOURCE_MANIFEST_NOT_THE_REVIEWED_NR26_EDITION")
        manifest["factoryCoreVersion"] = FORMATIVE_V3_RECOVERY_VERSION
        manifest["engineSha256"] = PINNED_FORMATIVE_V3_RECOVERY["app.js"]
        manifest["release"] = dict(manifest.get("release") or {})
        manifest["release"].update({
            "status": "PRIVATE_CANDIDATE_DO_NOT_ACTIVATE",
            "reviewed": False,
            "functionalCertified": False,
            "productionActivationAuthorized": False,
            "note": "Factory RC5 scenario-recovery candidate. Requires independent review, "
                    "CI-signed browser/Worker evidence, tenant-scoped edition handoff and owner authorization.",
        })
        manifest_bytes = (json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n").encode()
        changes = {"app.js": recovery, "airtrust-completion-manifest.json": manifest_bytes}
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            with zipfile.ZipFile(output, "w") as after:
                for info in infos:
                    if info.is_dir():
                        after.writestr(info, b"")
                        continue
                    after.writestr(info, changes.get(info.filename, before.read(info)))
            verified = verify_golden_core(output)
            if not verified["core_lock_pass"] or \
               verified["golden_master_version"] != FORMATIVE_V3_RECOVERY_VERSION:
                raise ValueError("RECOVERY_ZIP_FAILED_GOLDEN_CORE_VERIFICATION")
        except Exception:
            output.unlink(missing_ok=True)
            raise
    return {
        "scope": "PRIVATE_LOCAL_CANDIDATE_NOT_CERTIFIED",
        "source_zip_sha256": SOURCE_ZIP_SHA,
        "candidate_zip_sha256": sha(output.read_bytes()),
        "factoryCoreVersion": FORMATIVE_V3_RECOVERY_VERSION,
        "packageVersion": SOURCE_PACKAGE_VERSION,
        "asset_changes": ["app.js", "airtrust-completion-manifest.json"],
        "content_preserved": True,
        "requires_governed_edition_handoff": True,
        "activated": False,
        "output": str(output),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_zip", type=Path)
    parser.add_argument("output_zip", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.source_zip, args.output_zip), ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
        print(type(exc).__name__ + ":" + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())