#!/usr/bin/env python3
"""Adapt a validated PRIVATE Native pilot ZIP to Worker n-<32hex> identity.

Offline only. No publication, D1/R2/network, authorization, learner enrollment
or certification. Re-keying invalidates prior editorial signatures: the newly
hashed edition requires independent approval and governed staging publication.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path
from zipfile import ZipFile

from validate_native_pilot_zip import validate_private_pilot, PilotReviewError, NATIVE_WORKER_VERSION

ROOT = Path(__file__).resolve().parents[2]
DOCUMENTS = (
    "privado/edicao-native.json",
    "privado/banco-questoes.json",
    "privado/crosswalk-questoes.json",
    "privado/politica-proposta.json",
    "aluno/conteudo-aluno.json",
    "revisao/relatorio.json",
)
EDITION, BANK, CROSSWALK, POLICY, LEARNER, REPORT = DOCUMENTS


class PilotAdapterError(ValueError):
    pass


def canonical(obj: dict) -> bytes:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def replace_edition_reference(obj: object, old: str, new: str) -> object:
    if isinstance(obj, dict):
        return {k: replace_edition_reference(v, old, new) for k, v in obj.items()}
    if isinstance(obj, list):
        return [replace_edition_reference(v, old, new) for v in obj]
    return new if obj == old else obj


def adapt(source: Path, output: Path) -> dict:
    source = source.resolve(strict=True)
    output = output.absolute()
    if source.is_symlink() or not source.is_file() or output.exists() or output.is_symlink():
        raise PilotAdapterError("PRIVATE_SOURCE_OR_EXCLUSIVE_DESTINATION_REQUIRED")
    # Protect from inadvertent source/key publication via a repo workspace.
    if source.is_relative_to(ROOT) or output.resolve().is_relative_to(ROOT):
        raise PilotAdapterError("PRIVATE_ZIPS_MUST_BE_OUTSIDE_REPOSITORY")
    if not output.parent.is_dir() or output.parent.is_symlink():
        raise PilotAdapterError("PRIVATE_OUTPUT_DIRECTORY_REQUIRED")

    before = validate_private_pilot(str(source))
    with ZipFile(source) as original:
        docs = {name: json.loads(original.read(name)) for name in DOCUMENTS}
        old_bytes = original.read(EDITION)
        old_sha = digest(old_bytes)
        prior_version = docs[EDITION]["packageVersion"]
        if NATIVE_WORKER_VERSION.fullmatch(prior_version):
            raise PilotAdapterError("ALREADY_WORKER_VERSIONED")
        # Immutable version is derived from the exact prior edition bytes,
        # never from student fields, historical passing score or author names.
        version = "n-" + digest(b"AIRTRUST_NATIVE_PILOT_VERSION_V1\0" + old_bytes)[:32]
        docs[EDITION]["packageVersion"] = version
        docs[LEARNER]["packageVersion"] = version
        new_bytes = canonical(docs[EDITION])
        new_sha = digest(new_bytes)
        for name in (BANK, CROSSWALK, POLICY, LEARNER, REPORT):
            docs[name] = replace_edition_reference(docs[name], old_sha, new_sha)
        # No signature/approval may survive this new immutable edition.
        docs[POLICY]["certificationApproved"] = False
        docs[REPORT]["independentQaApproved"] = False
        docs[REPORT]["publishable"] = False
        docs[REPORT]["nativeVersionAdapter"] = {
            "schema": "AIRTRUST_NATIVE_PILOT_VERSION_ADAPTER_V1",
            "sourceEditionSha256": old_sha,
            "adaptedEditionSha256": new_sha,
            "sourcePackageVersion": prior_version,
            "adaptedPackageVersion": version,
            "independentReviewRequired": True,
            "authorizationGranted": False,
        }
        docs[EDITION] = canonical(docs[EDITION])
        changed = {name: (value if isinstance(value, bytes) else canonical(value))
                   for name, value in docs.items()}
        # Fail closed on unknown documents pinning an old edition digest.
        for item in original.infolist():
            if item.is_dir() or item.filename in DOCUMENTS:
                continue
            if old_sha.encode() in original.read(item):
                raise PilotAdapterError("UNKNOWN_LEGACY_EDITION_REFERENCE")
        fd, temporary = tempfile.mkstemp(prefix=".airtrust-native-private-", suffix=".zip",
                                         dir=output.parent)
        try:
            with os.fdopen(fd, "wb") as stream:
                with ZipFile(stream, mode="w") as target:
                    for item in original.infolist():
                        target.writestr(item, changed.get(item.filename, original.read(item)))
            os.chmod(temporary, 0o600)
            after = validate_private_pilot(temporary)
            if (after["editionSha256"] != new_sha or
                after["zipSha256"] == before["zipSha256"] or
                after["sourceSha256"] != before["sourceSha256"] or
                after["assetsVerified"] != before["assetsVerified"] or
                after["moduleStages"] != before["moduleStages"] or
                not after["workerPackageVersionCompatible"] or
                after["qaEligible"] or after["publishable"] or
                after["certificationApproved"]):
                raise PilotAdapterError("REVALIDATION_FAILED_CLOSED")
            # Atomic exclusive destination: existing files are never overwritten.
            os.link(temporary, output)
        finally:
            os.unlink(temporary)
    return {"status": "PRIVATE_REVIEW_ONLY_NOT_APPROVED_FOR_PUBLICATION",
            "originalZipSha256": before["zipSha256"],
            "adaptedZipSha256": after["zipSha256"],
            "originalEditionSha256": old_sha,
            "adaptedEditionSha256": new_sha,
            "workerPackageVersion": version,
            "modules": len(after["moduleStages"]),
            "mediaAssetsPreserved": after["assetsVerified"],
            "approvalRequired": True, "remoteWrites": False}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--private-output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(adapt(args.source, args.private_output),
                         ensure_ascii=False, sort_keys=True))
    except (PilotAdapterError, PilotReviewError, OSError, ValueError) as error:
        # Do not leak private paths, questions or answers in errors.
        raise SystemExit("NATIVE_PRIVATE_ADAPTER_FAILED_CLOSED:" +
                         (str(error) if isinstance(error, PilotAdapterError)
                          else type(error).__name__)) from None


if __name__ == "__main__":
    main()
