#!/usr/bin/env python3
"""Synthetic fail-closed tests for the read-only large F5 ZIP stream verifier.

No private ZIP data; tests run in GitHub Actions on generated tiny fixtures.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import warnings
import zipfile

RUNNER = Path(__file__).with_name("validate-f5-streamed-zip.mjs")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def invoke(path, expected):
    return subprocess.run(
        ["node", str(RUNNER), str(path), expected],
        text=True, capture_output=True, timeout=40, check=False,
    )


def assert_reject(path, reason=None):
    result = invoke(path, sha(path.read_bytes()))
    if result.returncode != 2 or (
        reason and reason not in result.stderr
    ):
        raise AssertionError(f"failed to reject {path.name}: {result.returncode} {result.stderr[:300]}")


def make_zip(path, entries, compression=zipfile.ZIP_DEFLATED):
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="Duplicate name")
        with zipfile.ZipFile(path, "w", compression=compression) as z:
            for name, contents in entries:
                z.writestr(name, contents)


def main():
    if not RUNNER.is_file():
        raise RuntimeError("Verifier missing")
    with tempfile.TemporaryDirectory(prefix="f5-stream-test-") as tmp:
        root = Path(tmp)
        valid = root / "valid.zip"
        make_zip(valid, [
            ("index.html", b"<title>ok</title>"),
            ("imsmanifest.xml", b"<manifest/>"),
            ("media/test.mp4", bytes(range(256)) * 16),
        ])
        original = sha(valid.read_bytes())
        result = invoke(valid, original)
        if result.returncode or json.loads(result.stdout)["members"] != 3:
            raise AssertionError(f"valid ZIP failed: {result.stderr}")
        if invoke(valid, "0" * 64).returncode != 2:
            raise AssertionError("wrong candidate SHA accepted")
        cases = [
            ("dotdot.zip", [("../bad.txt", b"a")], "ZIP_PATH_TRAVERSAL"),
            ("duplicate.zip", [("a.txt", b"a"), ("a.txt", b"b")], "ZIP_DUPLICATE_PATH"),
            ("percentage.zip", [("%2E%2E/a.txt", b"a")], "ZIP_PATH_TRAVERSAL"),
            ("bomb.zip", [("a.txt", b"x" * (1024 * 1024))], "COMPRESSION_RATIO"),
            ("member_big.zip", [("a.bin", bytes(33 * 1024 * 1024))], "EXPANDED_LIMIT"),
        ]
        for name, files, reason in cases:
            p = root / name
            make_zip(p, files)
            assert_reject(p, reason)
        corrupt = root / "crc_corrupted.zip"
        make_zip(corrupt, [("a.txt", b"content with crc")], zipfile.ZIP_STORED)
        raw = bytearray(corrupt.read_bytes())
        pos = raw.index(b"content with crc")
        raw[pos] ^= 1
        corrupt.write_bytes(raw)
        assert_reject(corrupt, "ZIP_CRC_OR_SIZE_MISMATCH")
        bad_local = root / "bad_local.zip"
        raw = bytearray(valid.read_bytes())
        raw[8] = 0  # change local method from deflate to STORE
        bad_local.write_bytes(raw)
        assert_reject(bad_local, "LOCAL_MISMATCH")
        bad_eocd = root / "bad_eocd.zip"
        bad_eocd.write_bytes(valid.read_bytes()[:-5])
        assert_reject(bad_eocd, "EOCD_MISSING")
    print("F5_STREAMED_ZIP_SELF_TEST_PASS 9_CASES")


if __name__ == "__main__":
    main()
