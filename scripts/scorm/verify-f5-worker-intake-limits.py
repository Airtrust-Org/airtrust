#!/usr/bin/env python3
"""Fail-closed, local-only F5 intake audit against the ACTUAL Worker ZIP limits.

Unlike scripts/staging/scorm-governed-functional-executor.mjs (80/250 MiB),
the current upload route calls inspectZipCentralDirectory in the LMS Worker:
32 MiB compressed, 64 MiB expanded, 32 MiB/member, <=2000 entries,
<=200:1 member expansion, depth <=20, member path <=512 UTF-8 bytes.
Only reads SHA-pinned private ZIPs. Does NOT upload, certify or write R2/D1.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import zipfile

MiB = 1024 * 1024
MAX_ZIP = 32 * MiB
MAX_EXPANDED = 64 * MiB
MAX_MEMBER = 32 * MiB
MAX_FILES = 2000
MAX_RATIO = 200
MAX_PATH_DEPTH = 20
MAX_PATH_BYTES = 512


class IntakeError(Exception):
    pass


def demand(condition, label):
    if not condition:
        raise IntakeError(label)


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reasons_for(stats):
    reasons = []
    conditions = [
        ("ZIP_COMPRESSED_OVER_32_MIB", stats["zipBytes"] > MAX_ZIP),
        ("ZIP_EXPANDED_OVER_64_MIB", stats["expandedBytes"] > MAX_EXPANDED),
        ("ZIP_MEMBER_OVER_32_MIB", stats["largestMemberBytes"] > MAX_MEMBER),
        ("ZIP_ENTRIES_OVER_2000", stats["entryCount"] > MAX_FILES),
        ("ZIP_RATIO_OVER_200X", stats["highestRatio"] > MAX_RATIO),
        ("ZIP_PATH_DEPTH_OVER_20", stats["maxPathDepth"] > MAX_PATH_DEPTH),
        ("ZIP_PATH_OVER_512_UTF8_BYTES", stats["maxPathBytes"] > MAX_PATH_BYTES),
        ("ZIP_ENCRYPTED", stats["encrypted"]),
        ("ZIP64_UNSUPPORTED", stats["zip64"]),
        ("ZIP_PATH_COLLISION_OR_TRAVERSAL", stats["unsafePath"]),
    ]
    for label, rejected in conditions:
        if rejected:
            reasons.append(label)
    return reasons


def inspect(path):
    demand(path.is_file() and not path.is_symlink(), "MISSING_OR_SYMLINK_ZIP")
    stats = {
        "zipBytes": path.stat().st_size,
        "expandedBytes": 0,
        "largestMemberBytes": 0,
        "entryCount": 0,
        "highestRatio": 0,
        "maxPathDepth": 0,
        "maxPathBytes": 0,
        "encrypted": False,
        "zip64": False,
        "unsafePath": False,
    }
    # Inspect the ZIP central-directory. No decompression or media re-encoding.
    with path.open("rb") as f:
        f.seek(max(0, stats["zipBytes"] - 65557))
        tail = f.read()
    eocd = tail.rfind(bytes((80, 75, 5, 6)))
    if eocd < 0 or len(tail) - eocd < 22:
        raise IntakeError("INVALID_ZIP_EOCD")
    stats["zip64"] = (
        tail[eocd + 8:eocd + 10] == bytes((255, 255))
        or tail[eocd + 10:eocd + 12] == bytes((255, 255))
        or tail[eocd + 12:eocd + 16] == bytes((255, 255, 255, 255))
        or tail[eocd + 16:eocd + 20] == bytes((255, 255, 255, 255))
    )
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            stats["entryCount"] = len(entries)
            seen = set()
            for member in entries:
                if member.is_dir():
                    continue
                p = member.filename
                segments = p.split("/")
                key = p.casefold()
                if (not p or p.startswith("/") or "\\" in p
                    or any(part in ("", ".", "..") for part in segments)
                    or key in seen):
                    stats["unsafePath"] = True
                seen.add(key)
                stats["maxPathDepth"] = max(stats["maxPathDepth"], len(segments))
                stats["maxPathBytes"] = max(stats["maxPathBytes"], len(p.encode("utf-8")))
                stats["encrypted"] |= bool(member.flag_bits & 1)
                stats["expandedBytes"] += member.file_size
                stats["largestMemberBytes"] = max(
                    stats["largestMemberBytes"], member.file_size)
                if member.file_size > 1024:
                    stats["highestRatio"] = max(
                        stats["highestRatio"],
                        member.file_size / max(1, member.compress_size))
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        raise IntakeError("INVALID_ZIP_CENTRAL_DIRECTORY") from exc
    return stats


def check_intake(manifest, root, expected=43):
    demand(isinstance(manifest, dict)
           and isinstance(manifest.get("courses"), list)
           and len(manifest["courses"]) == expected,
           "INVALID_COURSE_COUNT")
    assert isinstance(root, Path)
    demand(root.is_dir(), "MISSING_INTAKE_DIRECTORY")
    found = set()
    output = []
    for row in manifest["courses"]:
        cid = row.get("courseId")
        name = row.get("zipFilename")
        digest = row.get("zipSha256")
        demand(isinstance(cid, str) and cid and cid not in found, "DUPLICATE_COURSE")
        found.add(cid)
        demand(isinstance(name, str) and name.startswith("packages/")
               and "/" not in name[len("packages/"):]
               and not any(x in name for x in ("\\", "\x00", "..")),
               "UNSAFE_INTAKE_PATH")
        demand(isinstance(digest, str) and len(digest) == 64
               and all(c in "0123456789abcdef" for c in digest),
               "INVALID_SHA")
        demand(row.get("assessmentMode") == "EXTERNAL"
               and row.get("releaseReviewed") is False
               and row.get("allowActivation") is False
               and row.get("allowCertificate") is False,
               "ASSESSMENT_OR_RELEASE_POLICY_CHANGED")
        path = root / name
        demand(file_sha(path) == digest, "ZIP_SHA_DRIFT_" + cid)
        values = inspect(path)
        errors = reasons_for(values)
        output.append({
            "courseId": cid, "zipSha256": digest, "status":
                "UPLOAD_BLOCKED" if errors else "WORKER_LIMITS_PASS_NOT_AUTHORIZED",
            "reasons": errors, "stats": {
                key: value for key, value in values.items()
                if key not in ("encrypted", "zip64", "unsafePath")
            }
        })
    blocked = [item for item in output if item["reasons"]]
    return {
        "classification": "F5_WORKER_INTAKE_LIMITS_V1",
        "status": "UPLOAD_BLOCKED" if blocked else "INTAKE_LIMITS_PASS_NOT_AUTHORIZED",
        "courses": len(output),
        "passed": len(output) - len(blocked),
        "blocked": len(blocked),
        "blockedCourses": blocked,
        "stagingCandidateImport": "NOT_RUN",
        "R2D1Writes": 0,
        "releaseAuthorized": False,
    }


def self_test():
    values = {
        "zipBytes": 1, "expandedBytes": 1, "largestMemberBytes": 1,
        "entryCount": 1, "highestRatio": 1, "maxPathDepth": 1,
        "maxPathBytes": 1, "encrypted": False, "zip64": False, "unsafePath": False
    }
    demand(reasons_for(values) == [], "VALID_BASELINE_REJECTED")
    checks = [
        ("zipBytes", MAX_ZIP + 1, "ZIP_COMPRESSED_OVER_32_MIB"),
        ("expandedBytes", MAX_EXPANDED + 1, "ZIP_EXPANDED_OVER_64_MIB"),
        ("largestMemberBytes", MAX_MEMBER + 1, "ZIP_MEMBER_OVER_32_MIB"),
        ("entryCount", MAX_FILES + 1, "ZIP_ENTRIES_OVER_2000"),
        ("highestRatio", 201, "ZIP_RATIO_OVER_200X"),
        ("maxPathDepth", 21, "ZIP_PATH_DEPTH_OVER_20"),
        ("maxPathBytes", 513, "ZIP_PATH_OVER_512_UTF8_BYTES"),
        ("encrypted", True, "ZIP_ENCRYPTED"),
        ("zip64", True, "ZIP64_UNSUPPORTED"),
        ("unsafePath", True, "ZIP_PATH_COLLISION_OR_TRAVERSAL"),
    ]
    for field, value, expected in checks:
        mutated = dict(values)
        mutated[field] = value
        demand(expected in reasons_for(mutated), "UNDETECTED_" + expected)
    print("SELF_TEST_PASS 10_NEGATIVE_CASES")


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--manifest", type=Path)
    cli.add_argument("--root", type=Path)
    cli.add_argument("--expected-count", type=int, default=43)
    cli.add_argument("--self-test", action="store_true")
    args = cli.parse_args()
    if args.self_test:
        self_test()
        return
    demand(args.manifest is not None and args.root is not None, "MANIFEST_ROOT_REQUIRED")
    demand(0 < args.expected_count <= 100, "EXPECTED_COUNT_UNSAFE")
    manifest = json.loads(args.manifest.read_text(encoding="utf8"))
    outcome = check_intake(manifest, args.root, args.expected_count)
    print(json.dumps(outcome, ensure_ascii=False, sort_keys=True))
    if outcome["blocked"]:
        raise SystemExit(2)


if __name__ == "__main__":
    try:
        main()
    except (IntakeError, OSError, ValueError, KeyError) as exc:
        print("F5_WORKER_INTAKE_INCONCLUSIVE: " + str(exc), file=sys.stderr)
        sys.exit(2)
