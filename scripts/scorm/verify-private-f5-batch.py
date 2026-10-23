#!/usr/bin/env python3
"""Read-only, fail-closed verifier for a private SCORM ZIP candidate batch.

No private ZIPs or indexes are committed. Accept a normalized --index or a pair
of native --source-index (V2 records with courseId/file/sha256) and
--candidate-index (V4/V4A records with oldZip/newZip and SHA-256) files.
Native indexes are joined by exact courseId, never by record order.
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


def verify_completion_contract(path, cid, expected_engine_sha):
    """Validate completion manifest and authored slide order (never grant credit).

    Only active for ZIPs containing F5 model/manifest members; the generic
    verifier self-tests use minimal synthetic ZIPs without SCORM materials.
    """
    with zipfile.ZipFile(path) as archive:
        files = set(archive.namelist())
        f5 = {"airtrust-course-data.js", "airtrust-completion-manifest.json"}
        if not (files & f5):
            return
        require(f5 <= files, f"incomplete F5 model/manifest pair: {cid}")
        source = archive.read("airtrust-course-data.js").decode("utf-8")
        heading, sep, payload = source.partition("=")
        require(sep and heading.strip() == "window.AIRTRUST_F5_MODEL"
                and payload.rstrip().endswith(";"),
                f"unparseable F5 course model: {cid}")
        model = json.loads(payload.strip()[:-1])
        manifest = json.loads(archive.read("airtrust-completion-manifest.json"))
        require(isinstance(model, dict) and isinstance(manifest, dict),
                f"invalid F5 model/manifest: {cid}")
        slides = model.get("slides")
        require(isinstance(slides, list) and 1 <= len(slides) <= 1000
                and all(isinstance(s, dict) and isinstance(s.get("id"), str)
                        and 0 < len(s["id"]) <= 256 for s in slides),
                f"invalid F5 slides: {cid}")
        ids = [s["id"] for s in slides]
        require(len(ids) == len(set(ids)), f"duplicate F5 slide IDs: {cid}")
        content = manifest.get("content")
        required = content.get("requiredSlides") if isinstance(content, dict) else None
        require(isinstance(required, list) and required == ids,
                f"F5 requiredSlides do not match authored slide IDs: {cid}")
        require(model.get("courseId") == cid and manifest.get("courseId") == cid,
                f"F5 courseId mismatch: {cid}")
        require(isinstance(model.get("edition"), str) and model["edition"]
                and manifest.get("packageVersion") == model["edition"],
                f"F5 package edition mismatch: {cid}")
        require(manifest.get("engineSha256") == expected_engine_sha,
                f"F5 engine manifest hash mismatch: {cid}")
        assessment = manifest.get("assessment")
        completion = manifest.get("completion")
        release = manifest.get("release")
        require(isinstance(assessment, dict) and assessment.get("mode") == "EXTERNAL"
                and assessment.get("scoringBySCORM") is False
                and isinstance(completion, dict) and completion.get("workerApprovalRequired") is True
                and isinstance(release, dict) and release.get("reviewed") is False,
                f"F5 non-certifying assessment/release contract violated: {cid}")


def normalize_native_indices(source, candidate):
    """Join native V2 source and V4/V4A candidate indexes by exact courseId.

    V2 records: courseId, file, sha256, sourceSha256.
    V4/V4A records: courseId, oldZip, oldZipSha256, newZip,
    newZipSha256, changedMembers. V4A mediaRestoration.restored supplies
    per-member SHA-256 approvals for original media, never wildcard approval.
    """
    def records_by_id(index, label, count_key):
        require(isinstance(index, dict) and isinstance(index.get("records"), list),
                f"{label} native records missing")
        rows = index["records"]
        require(type(index.get(count_key)) is int and index[count_key] == len(rows),
                f"{label} native course count mismatch")
        by_id = {}
        for row in rows:
            require(isinstance(row, dict), f"{label} invalid record")
            cid = row.get("courseId")
            require(isinstance(cid, str) and cid and cid not in by_id,
                    f"{label} duplicate/invalid courseId")
            by_id[cid] = row
        return by_id

    old = records_by_id(source, "source", "courses")
    new = records_by_id(candidate, "candidate", "courseCount")
    require(old.keys() == new.keys(), "native source/candidate courseId sets differ")
    for key in ("slides", "formative", "requiredGates"):
        require(type(source.get(key)) is int and type(candidate.get(key)) is int
                and source[key] == candidate[key],
                f"native aggregate pedagogy mismatch: {key}")
    old_engine, new_engine = source.get("engineSha256"), candidate.get("engineNewSha256")
    require(isinstance(old_engine, str) and HEX64.fullmatch(old_engine)
            and candidate.get("engineOldSha256") == old_engine,
            "native source engine SHA mismatch")
    require(isinstance(new_engine, str) and HEX64.fullmatch(new_engine),
            "invalid native candidate engine SHA")
    media = candidate.get("mediaRestoration", {})
    require(isinstance(media, dict), "invalid mediaRestoration")
    restored = media.get("restored", [])
    require(isinstance(restored, list), "invalid mediaRestoration.restored")
    approved_by_id = {}
    asset_total = 0
    for item in restored:
        require(isinstance(item, dict), "invalid media restoration record")
        cid = item.get("courseId")
        require(isinstance(cid, str) and cid in old and cid not in approved_by_id,
                "unknown/duplicate restored media courseId")
        assets = item.get("assets")
        require(isinstance(assets, list) and assets, f"invalid media assets: {cid}")
        require(type(item.get("mediaCount")) is int and item["mediaCount"] == len(assets),
                f"media count mismatch: {cid}")
        require(item.get("sourceSha256") == old[cid].get("sourceSha256"),
                f"media original source SHA mismatch: {cid}")
        require(item.get("newZipSha256") == new[cid].get("newZipSha256"),
                f"media candidate SHA mismatch: {cid}")
        paths = {}
        for asset in assets:
            require(isinstance(asset, dict), f"invalid media asset: {cid}")
            name, sha = asset.get("path"), asset.get("sha256")
            require(isinstance(name, str) and name and name not in paths,
                    f"duplicate/invalid media path: {cid}")
            require(isinstance(sha, str) and HEX64.fullmatch(sha),
                    f"invalid media SHA: {cid}: {name}")
            paths[name] = sha
        approved_by_id[cid] = paths
        asset_total += len(paths)
    if "courses" in media:
        require(type(media["courses"]) is int and media["courses"] == len(restored),
                "media restored course count mismatch")
    if "assets" in media:
        require(type(media["assets"]) is int and media["assets"] == asset_total,
                "media restored asset count mismatch")

    result = []
    for cid in sorted(old):
        src, dst = old[cid], new[cid]
        require(isinstance(src.get("sourceSha256"), str)
                and HEX64.fullmatch(src["sourceSha256"]),
                f"native original source SHA missing/invalid: {cid}")
        require(dst.get("oldZip") == src.get("file")
                and dst.get("oldZipSha256") == src.get("sha256"),
                f"native source provenance mismatch: {cid}")
        for key in ("slides", "formative", "requiredGates"):
            require(type(src.get(key)) is int and type(dst.get(key)) is int
                    and src[key] == dst[key],
                    f"native course pedagogy mismatch: {cid}: {key}")
        changed = dst.get("changedMembers")
        require(isinstance(changed, list) and changed
                and all(isinstance(x, str) and x for x in changed)
                and len(set(changed)) == len(changed),
                f"invalid declared changedMembers: {cid}")
        result.append({
            "course_id": cid,
            "source_file": src.get("file"),
            "source_sha256": src.get("sha256"),
            "candidate_file": dst.get("newZip"),
            "candidate_sha256": dst.get("newZipSha256"),
            "approved_added_members": approved_by_id.get(cid, {}),
            "expected_changed_members": changed,
            "engine_member": "airtrust-score-unified-engine.js",
            "expected_source_engine_sha256": old_engine,
            "expected_candidate_engine_sha256": new_engine,
        })
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
        engine_member = row.get("engine_member", "airtrust-score-unified-engine.js")
        if "expected_source_engine_sha256" in row:
            require(old.get(engine_member) == row["expected_source_engine_sha256"],
                    f"source ZIP engine digest mismatch: {cid}")
        if "expected_candidate_engine_sha256" in row:
            require(new.get(engine_member) == row["expected_candidate_engine_sha256"],
                    f"candidate ZIP engine digest mismatch: {cid}")
        verify_completion_contract(cp, cid, new.get(engine_member))
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
        expected_changed = row.get("expected_changed_members")
        if expected_changed is not None:
            require(isinstance(expected_changed, list)
                    and all(isinstance(x, str) and x for x in expected_changed)
                    and len(expected_changed) == len(set(expected_changed))
                    and set(expected_changed) == (set(changed) | added),
                    f"native declared changes differ from actual ZIP delta: {cid}")
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
        native_source = {
            "courses": 1, "slides": 1, "formative": 0, "requiredGates": 0,
            "engineSha256": hashlib.sha256(b"v2").hexdigest(),
            "records": [{"courseId": "demo", "file": "a.zip",
                         "sha256": digest_file(src), "sourceSha256": digest_file(src),
                         "slides": 1, "formative": 0, "requiredGates": 0}]}
        native_candidate = {
            "courseCount": 1, "slides": 1, "formative": 0, "requiredGates": 0,
            "engineOldSha256": hashlib.sha256(b"v2").hexdigest(),
            "engineNewSha256": hashlib.sha256(b"v4").hexdigest(),
            "records": [{"courseId": "demo", "oldZip": "a.zip",
                         "oldZipSha256": digest_file(src), "newZip": "a.zip",
                         "newZipSha256": digest_file(dst), "changedMembers": ["engine.js"],
                         "slides": 1, "formative": 0, "requiredGates": 0}]}
        converted = normalize_native_indices(native_source, native_candidate)
        converted["courses"][0]["engine_member"] = "engine.js"
        require(verify(converted, src.parent, dst.parent, ["engine.js"], 1)["courses"] == 1,
                "native index conversion rejected valid candidate")
        # Native provenance and pedagogy must reject missing digests and bool-as-int.
        saved_original_sha = native_source["records"][0].pop("sourceSha256")
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("missing original source SHA accepted")
        native_source["records"][0]["sourceSha256"] = saved_original_sha
        native_candidate["records"][0]["slides"] = True
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("boolean native pedagogy count accepted")
        native_candidate["records"][0]["slides"] = 1
        native_candidate["records"][0]["courseId"] = "other"
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("mismatched native courseId sets accepted")
        native_candidate["records"][0]["courseId"] = "demo"
        native_candidate["records"].append(dict(native_candidate["records"][0]))
        native_candidate["courseCount"] = 2
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("duplicate native courseId accepted")
        native_candidate["records"].pop()
        native_candidate["courseCount"] = 1
        native_candidate["records"][0]["oldZipSha256"] = "0" * 64
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("native source provenance mismatch accepted")
        native_candidate["records"][0]["oldZipSha256"] = digest_file(src)
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
        native_candidate["records"][0]["newZipSha256"] = digest_file(dst)
        native_candidate["records"][0]["changedMembers"] = [
            "engine.js", "assets/restored.png"]
        native_candidate["mediaRestoration"] = {
            "courses": 1, "assets": 1, "restored": [{
                "courseId": "demo", "mediaCount": 1,
                "sourceSha256": digest_file(src),
                "newZipSha256": digest_file(dst),
                "assets": [{"path": "assets/restored.png",
                            "sha256": hashlib.sha256(b"media").hexdigest()}]}]}
        native_candidate["mediaRestoration"]["restored"][0]["mediaCount"] = True
        try:
            normalize_native_indices(native_source, native_candidate)
        except VerificationError:
            pass
        else:
            raise AssertionError("boolean restored media count accepted")
        native_candidate["mediaRestoration"]["restored"][0]["mediaCount"] = 1
        native_index = normalize_native_indices(native_source, native_candidate)
        native_index["courses"][0]["engine_member"] = "engine.js"
        require(verify(native_index, src.parent, dst.parent, ["engine.js"], 1)["courses"] == 1,
                "native V4A restored media rejected")
        native_candidate["records"][0]["changedMembers"] = ["engine.js"]
        try:
            invalid_native = normalize_native_indices(native_source, native_candidate)
            invalid_native["courses"][0]["engine_member"] = "engine.js"
            verify(invalid_native, src.parent, dst.parent, ["engine.js"], 1)
        except VerificationError:
            pass
        else:
            raise AssertionError("native undeclared restored media accepted")
        with tempfile.TemporaryDirectory() as f5tmp:
            d = Path(f5tmp)
            model = {"courseId": "demo", "edition": "v4", "slides": [
                {"id": "first", "kind": "lesson"},
                {"id": "review", "kind": "review"}]}
            manifest = {"courseId": "demo", "packageVersion": "v4",
                "engineSha256": hashlib.sha256(b"v4").hexdigest(),
                "content": {"requiredSlides": ["first", "review"]},
                "assessment": {"mode": "EXTERNAL", "scoringBySCORM": False},
                "completion": {"workerApprovalRequired": True},
                "release": {"reviewed": False}}
            f5src, f5dst = d / "source.zip", d / "candidate.zip"
            def write_f5(path, engine, data):
                with zipfile.ZipFile(path, "w") as z:
                    z.writestr("engine.js", engine)
                    z.writestr("airtrust-course-data.js",
                        "window.AIRTRUST_F5_MODEL = " + json.dumps(model) + ";")
                    z.writestr("airtrust-completion-manifest.json", json.dumps(data))
            write_f5(f5src, "v2", manifest)
            write_f5(f5dst, "v4", manifest)
            trial = {"courses": [{"course_id": "demo",
                "source_file": f5src.name,"source_sha256": digest_file(f5src),
                "candidate_file": f5dst.name,"candidate_sha256": digest_file(f5dst),
                "engine_member": "engine.js"}]}
            def check_contract():
                return verify(trial, d, d, ["engine.js"], 1)
            require(check_contract()["courses"] == 1,
                "valid F5 completion contract unexpectedly rejected")
            manifest["content"]["requiredSlides"] = ["first"]
            write_f5(f5dst, "v4", manifest)
            trial["courses"][0]["candidate_sha256"] = digest_file(f5dst)
            try:
                check_contract()
            except VerificationError:
                pass
            else:
                raise AssertionError("partial F5 requiredSlides accepted")
            manifest["content"]["requiredSlides"] = ["first", "review"]
            manifest["assessment"]["scoringBySCORM"] = True
            write_f5(f5dst, "v4", manifest)
            trial["courses"][0]["candidate_sha256"] = digest_file(f5dst)
            try:
                check_contract()
            except VerificationError:
                pass
            else:
                raise AssertionError("graded F5 assessment accepted")
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
