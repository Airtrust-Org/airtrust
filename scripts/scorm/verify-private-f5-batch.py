#!/usr/bin/env python3
"""Read-only, fail-closed verifier for a private SCORM ZIP candidate batch.

No private ZIPs or indexes are committed. Accept a normalized --index or a pair
of native --source-index / --candidate-index files (records with courseId,
file and sha256). Native indexes are joined by exact courseId, never by order.
Normalized input shape:
{"courses":[{"course_id":"id","source_file":"a.zip","source_sha256":"64hex",
"candidate_file":"b.zip","candidate_sha256":"64hex"}]}.
For media restoration, each course may additionally declare
"approved_added_members":{"assets/restored.png":"actual-64hex-member-digest"}.
Unlisted additions and all removals are rejected.
This verifier does NOT certify SCORM behavior or authorize activation.
"""
import argparse
import fnmatch
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import zipfile

HEX64 = re.compile(r"[0-9a-f]{64}\Z")
MAX_ZIP_MEMBERS = 8192
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024


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
        infos = archive.infolist()
        require(len(infos) <= MAX_ZIP_MEMBERS, f"too many ZIP members: {path.name}")
        entries, seen_paths = {}, set()
        total_uncompressed = 0
        for item in infos:
            name = item.filename
            require(name and "\\" not in name and "\x00" not in name,
                    f"invalid ZIP entry: {name!r}")
            canonical = name[:-1] if item.is_dir() else name
            posix = PurePosixPath(canonical)
            require(canonical not in ("", ".", "..") and not posix.is_absolute()
                    and str(posix) == canonical and ".." not in posix.parts
                    and ":" not in canonical.split("/")[0],
                    f"noncanonical/unsafe ZIP entry: {name!r}")
            require(canonical not in seen_paths, f"duplicate ZIP path: {name}")
            seen_paths.add(canonical)
            require(not stat.S_ISLNK(item.external_attr >> 16), f"ZIP symlink: {name}")
            total_uncompressed += item.file_size
            require(total_uncompressed <= MAX_UNCOMPRESSED_BYTES,
                    f"ZIP uncompressed size limit exceeded: {path.name}")
            if item.is_dir():
                continue
            h = hashlib.sha256()
            with archive.open(item) as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(block)  # Streaming read also verifies each member's CRC.
            entries[name] = h.hexdigest()
        require(entries, f"empty ZIP: {path.name}")
        # A ZIP may contain both a file named 'a' and another member 'a/b'.
        # Extraction semantics differ by platform; reject ambiguous layouts.
        file_paths = set(entries)
        for member in seen_paths:
            parts = member.split("/")
            for depth in range(1, len(parts)):
                require("/".join(parts[:depth]) not in file_paths,
                        f"ZIP file/directory collision: {member}")
        return entries


def normalize_native_indices(source, candidate):
    """Bind two private factory indexes by courseId without trusting record order.

    Source/candidate indexes use {"courses":43,"records":[{"courseId":...,
    "file":...,"sha256":...}]}. Missing/extra/duplicate course IDs fail closed.
    Optional per-member media approval must be present on candidate records.
    """
    def records_by_id(index, label):
        require(isinstance(index, dict) and isinstance(index.get("records"), list),
                f"{label} native records missing")
        rows = index["records"]
        require(isinstance(index.get("courses"), int)
                and not isinstance(index["courses"], bool)
                and index["courses"] == len(rows),
                f"{label} native course count mismatch")
        by_id = {}
        for row in rows:
            require(isinstance(row, dict), f"{label} invalid record")
            cid = row.get("courseId")
            require(isinstance(cid, str) and cid and cid not in by_id,
                    f"{label} duplicate/invalid courseId")
            by_id[cid] = row
        return by_id

    old = records_by_id(source, "source")
    new = records_by_id(candidate, "candidate")
    require(old.keys() == new.keys(), "native source/candidate courseId sets differ")
    result = []
    for cid in sorted(old):
        src, dst = old[cid], new[cid]
        row = {"course_id": cid, "source_file": src.get("file"),
               "source_sha256": src.get("sha256"),
               "candidate_file": dst.get("file"),
               "candidate_sha256": dst.get("sha256")}
        approved = dst.get("approved_added_members",
                           dst.get("approvedAddedMembers", {}))
        row["approved_added_members"] = approved
        result.append(row)
    return {"courses": result}


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
        removed = set(old) - set(new)
        added = set(new) - set(old)
        require(not removed, f"ZIP members removed: {cid}: {sorted(removed)}")
        approved = row.get("approved_added_members", {})
        require(isinstance(approved, dict) and all(
            isinstance(k, str) and isinstance(v, str) and HEX64.fullmatch(v)
            for k, v in approved.items()), f"invalid approved additions: {cid}")
        require(added == set(approved),
                f"unapproved/missing ZIP additions: {cid}: {sorted(added ^ set(approved))}")
        require(all(new[k] == approved[k] for k in added),
                f"added member digest mismatch: {cid}")
        changed = sorted(k for k in old if k in new and old[k] != new[k])
        require(changed or added, f"no changes in candidate: {cid}")
        require(all(any(fnmatch.fnmatchcase(k, pattern) for pattern in allow_patterns)
                    for k in changed), f"unapproved ZIP member changed: {cid}")
        report.append({"course_id": cid, "candidate_sha256": candidate_sha,
                       "changed_members": changed, "added_members": sorted(added),
                       "unchanged_members": len(old) - len(changed)})
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
        def check():
            return verify(index, src.parent, dst.parent, ["engine.js"], 1)

        def expect_reject(label):
            try:
                check()
            except VerificationError:
                return
            raise AssertionError(f"unsafe candidate accepted: {label}")

        require(check()["courses"] == 1, "valid candidate rejected")
        native_source = {"courses": 1, "records": [
            {"courseId": "demo", "file": "a.zip", "sha256": digest_file(src)}]}
        native_candidate = {"courses": 1, "records": [
            {"courseId": "demo", "file": "a.zip", "sha256": digest_file(dst)}]}
        converted = normalize_native_indices(native_source, native_candidate)
        require(verify(converted, src.parent, dst.parent, ["engine.js"], 1)["courses"] == 1,
                "native index conversion rejected valid candidate")
        native_candidate["records"][0]["courseId"] = "other"
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("mismatched native courseId sets accepted")
        native_candidate["records"][0]["courseId"] = "demo"
        native_candidate["records"].append(dict(native_candidate["records"][0]))
        native_candidate["courses"] = 2
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("duplicate native courseId accepted")
        native_candidate["records"].pop()
        native_candidate["courses"] = 1
        index["courses"][0]["candidate_sha256"] = "0" * 64
        expect_reject("SHA mismatch")
        write_zip(dst, "v4", "tampered")
        index["courses"][0]["candidate_sha256"] = digest_file(dst)
        expect_reject("pedagogical modification")

        def replace_entries(entries):
            with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as z:
                for name, data in entries:
                    z.writestr(name, data)
            index["courses"][0]["candidate_sha256"] = digest_file(dst)

        replace_entries([("engine.js", "v4"), ("lesson.html", "same"), ("../evil", "x")])
        expect_reject("traversal")
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"), ("a/./b", "x")])
        expect_reject("noncanonical alias")
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"), ("a//b", "x")])
        expect_reject("empty path component")
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"), ("C:/evil", "x")])
        expect_reject("Windows drive path")
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            replace_entries([("engine.js", "v4"), ("lesson.html", "same"),
                             ("engine.js", "v4")])
        expect_reject("duplicate member")
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"),
                         (link, "target")])
        expect_reject("symlink")
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"),
                         ("assets", "file"), ("assets/image.png", "image")])
        expect_reject("file/directory collision")

        # Restored media must be listed per course with exact member SHA-256.
        replace_entries([("engine.js", "v4"), ("lesson.html", "same"),
                         ("assets/restored.png", "media")])
        expect_reject("unapproved media addition")
        index["courses"][0]["approved_added_members"] = {
            "assets/restored.png": "0" * 64}
        expect_reject("incorrect approved media digest")
        index["courses"][0]["approved_added_members"] = {
            "assets/restored.png": hashlib.sha256(b"media").hexdigest()}
        require(check()["courses"] == 1, "approved media addition rejected")
        replace_entries([("engine.js", "v4")])
        expect_reject("pedagogical member removal")
        index["courses"][0].pop("approved_added_members")
    print("SELF_TEST_PASS")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path)
    parser.add_argument("--source-index", type=Path)
    parser.add_argument("--candidate-index", type=Path)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--candidate-dir", type=Path)
    parser.add_argument("--allow-change", action="append", default=[])
    parser.add_argument("--expected-count", type=int, default=43)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    require(args.source_dir and args.candidate_dir, "source/candidate directories required")
    require(args.expected_count > 0, "invalid expected-count")
    if args.index:
        require(not args.source_index and not args.candidate_index,
                "choose normalized --index OR native index pair")
        index = json.loads(args.index.read_text(encoding="utf-8"))
    else:
        require(args.source_index and args.candidate_index,
                "both native --source-index and --candidate-index required")
        index = normalize_native_indices(
            json.loads(args.source_index.read_text(encoding="utf-8")),
            json.loads(args.candidate_index.read_text(encoding="utf-8")))
    result = verify(index, args.source_dir, args.candidate_dir,
                    args.allow_change, args.expected_count)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (VerificationError, OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f"F5_STATIC_INCONCLUSIVE: {exc}", file=sys.stderr)
        sys.exit(2)
