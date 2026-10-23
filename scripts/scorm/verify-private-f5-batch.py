#!/usr/bin/env python3
"""Read-only, fail-closed verifier for a private SCORM ZIP candidate batch.

No private ZIPs or indexes are committed. Input index must be normalized to:
{"courses":[{"course_id":"id","source_file":"a.zip","source_sha256":"64hex",
"candidate_file":"b.zip","candidate_sha256":"64hex"}]}.
This verifier does NOT certify SCORM behavior or authorize activation.
"""
import argparse
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import zipfile

HEX64 = re.compile(r"[0-9a-f]{64}\Z")


class VerificationError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise VerificationError(message)


def safe_filename(name):
    require(isinstance(name, str) and name and name not in (".", ".."), "invalid filename")
    require("/" not in name and "\\" not in name and "\x00" not in name, "unsafe filename")
    return name


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def inspect_zip(path):
    require(zipfile.is_zipfile(path), f"not ZIP: {path.name}")
    with zipfile.ZipFile(path) as archive:
        entries = {}
        for item in archive.infolist():
            name = item.filename
            posix = PurePosixPath(name)
            require(name and "\\" not in name and "\x00" not in name, f"invalid ZIP entry: {name!r}")
            require(not posix.is_absolute() and ".." not in posix.parts, f"ZIP traversal: {name}")
            require(name not in entries, f"duplicate ZIP entry: {name}")
            require(not stat.S_ISLNK(item.external_attr >> 16), f"ZIP symlink: {name}")
            if item.is_dir():
                continue
            require(item.file_size <= 512 * 1024 * 1024, f"oversized ZIP entry: {name}")
            h = hashlib.sha256()
            with archive.open(item) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(block)  # Streaming read also verifies each member's CRC.
            entries[name] = h.hexdigest()
        require(entries, f"empty ZIP: {path.name}")
        return entries


def verify(index, source_dir, candidate_dir, allow_patterns, expected_count=43):
    require(isinstance(index, dict) and isinstance(index.get("courses"), list), "index.courses missing")
    rows = index["courses"]
    require(len(rows) == expected_count, f"expected {expected_count} courses, got {len(rows)}")
    require(allow_patterns and all(isinstance(p, str) and p for p in allow_patterns),
            "explicit --allow-change pattern required")
    ids, sources, candidates = set(), set(), set()
    report = []
    for row in rows:
        require(isinstance(row, dict), "invalid course record")
        cid = row.get("course_id")
        require(isinstance(cid, str) and cid and cid not in ids, "duplicate/invalid course_id")
        ids.add(cid)
        src = safe_filename(row.get("source_file"))
        dst = safe_filename(row.get("candidate_file"))
        require(src not in sources and dst not in candidates, f"duplicate filename for {cid}")
        sources.add(src)
        candidates.add(dst)
        source_sha = row.get("source_sha256")
        candidate_sha = row.get("candidate_sha256")
        require(isinstance(source_sha, str) and HEX64.fullmatch(source_sha), f"invalid source SHA: {cid}")
        require(isinstance(candidate_sha, str) and HEX64.fullmatch(candidate_sha), f"invalid candidate SHA: {cid}")
        sp, cp = source_dir / src, candidate_dir / dst
        require(sp.is_file() and cp.is_file() and not sp.is_symlink() and not cp.is_symlink(),
                f"missing/symlinked file: {cid}")
        require(digest_file(sp) == source_sha, f"source SHA mismatch: {cid}")
        require(digest_file(cp) == candidate_sha, f"candidate SHA mismatch: {cid}")
        old, new = inspect_zip(sp), inspect_zip(cp)
        require(old.keys() == new.keys(), f"ZIP member set changed: {cid}")
        changed = sorted(k for k in old if old[k] != new[k])
        require(changed, f"no changes in candidate: {cid}")
        require(all(any(fnmatch.fnmatchcase(k, pattern) for pattern in allow_patterns)
                    for k in changed), f"unapproved ZIP member changed: {cid}")
        report.append({"course_id": cid, "candidate_sha256": candidate_sha,
                       "changed_members": changed, "unchanged_members": len(old) - len(changed)})
    return {"status": "PASS_STATIC_ONLY_NOT_CERTIFIED", "courses": len(report), "results": report}


def self_test():
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        (base / "source").mkdir()
        (base / "candidate").mkdir()
        def write_zip(path, engine, lesson):
            with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as z:
                z.writestr("engine.js", engine)
                z.writestr("lesson.html", lesson)
        src = base / "source" / "a.zip"
        dst = base / "candidate" / "a.zip"
        write_zip(src, "v2", "same")
        write_zip(dst, "v4", "same")
        index = {"courses": [{"course_id": "demo", "source_file": "a.zip",
            "source_sha256": digest_file(src), "candidate_file": "a.zip",
            "candidate_sha256": digest_file(dst)}]}
        assert verify(index, src.parent, dst.parent, ["engine.js"], 1)["courses"] == 1
        write_zip(dst, "v4", "tampered")
        index["courses"][0]["candidate_sha256"] = digest_file(dst)
        try:
            verify(index, src.parent, dst.parent, ["engine.js"], 1)
        except VerificationError:
            pass
        else:
            raise AssertionError("unexpected pedagogical content change accepted")
    print("SELF_TEST_PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--candidate-dir", type=Path)
    parser.add_argument("--allow-change", action="append", default=[])
    parser.add_argument("--expected-count", type=int, default=43)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    require(args.index and args.source_dir and args.candidate_dir, "index and directories required")
    require(args.expected_count > 0, "invalid expected-count")
    result = verify(json.loads(args.index.read_text(encoding="utf-8")),
                    args.source_dir, args.candidate_dir,
                    args.allow_change, args.expected_count)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (VerificationError, OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f"F5_STATIC_INCONCLUSIVE: {exc}", file=sys.stderr)
        sys.exit(2)
