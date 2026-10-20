"""Synthetic-only tests for the offline V7 -> Worker immutable edition adapter."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from adapt_native_pilot_version import adapt, PilotAdapterError
from test_validate_native_pilot_zip import fixture
from validate_native_pilot_zip import PilotReviewError, validate_private_pilot


class PrivateEditionAdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.src = Path(self.temp.name) / "source-v7.zip"
        self.out = Path(self.temp.name) / "review-only.zip"
        fixture(str(self.src), modules=2, slides=15, questions=10)
        self.original_sha = hashlib.sha256(self.src.read_bytes()).hexdigest()

    def test_two_stages_media_and_private_bank_remain_intact(self):
        result = adapt(self.src, self.out)
        self.assertTrue(result["workerPackageVersion"].startswith("n-"))
        self.assertEqual(result["modules"], 2)
        self.assertFalse(result["remoteWrites"])
        self.assertTrue(result["approvalRequired"])
        self.assertEqual(self.original_sha, hashlib.sha256(self.src.read_bytes()).hexdigest())
        self.assertEqual(self.out.stat().st_mode & 0o777, 0o600)
        review = validate_private_pilot(str(self.out))
        self.assertEqual(review["moduleStages"][0]["minimumCorrect"], 7)
        self.assertEqual(review["moduleStages"][1]["minimumCorrect"], 7)
        self.assertEqual(review["assetsVerified"], 1)
        self.assertFalse(review["publishable"])
        self.assertFalse(review["certificationApproved"])
        with ZipFile(self.src) as old, ZipFile(self.out) as new:
            self.assertEqual(old.read("midia/a.webp"), new.read("midia/a.webp"))
            self.assertEqual(old.read("referencia/ORIGINAL_SCORM12_NAO_PUBLICAR.zip"),
                             new.read("referencia/ORIGINAL_SCORM12_NAO_PUBLICAR.zip"))
            ed = json.loads(new.read("privado/edicao-native.json"))
            student = json.loads(new.read("aluno/conteudo-aluno.json"))
            policy = json.loads(new.read("privado/politica-proposta.json"))
            bank = json.loads(new.read("privado/banco-questoes.json"))
            report = json.loads(new.read("revisao/relatorio.json"))
            self.assertEqual(ed["packageVersion"], student["packageVersion"])
            self.assertEqual(policy["editionSha256"], result["adaptedEditionSha256"])
            self.assertEqual(bank["editionSha256"], result["adaptedEditionSha256"])
            self.assertFalse(policy["certificationApproved"])
            self.assertFalse(report["independentQaApproved"])
            self.assertFalse(report["nativeVersionAdapter"]["authorizationGranted"])
            self.assertNotIn(b"correctOptionId", new.read("aluno/conteudo-aluno.json"))
            self.assertEqual(len(ed["questions"]), 20)

    def test_refuse_overwrite_even_after_valid_input(self):
        self.out.write_text("DO_NOT_OVERWRITE")
        with self.assertRaises(PilotAdapterError):
            adapt(self.src, self.out)
        self.assertEqual(self.out.read_text(), "DO_NOT_OVERWRITE")

    def test_replay_of_already_native_version_is_not_silent(self):
        adapt(self.src, self.out)
        other = Path(self.temp.name) / "second.zip"
        with self.assertRaisesRegex(PilotAdapterError, "ALREADY_WORKER_VERSIONED"):
            adapt(self.out, other)
        self.assertFalse(other.exists())

    def test_invalid_content_is_never_repacked(self):
        fixture(str(Path(self.temp.name) / "bad.zip"), slides=14)
        bad = Path(self.temp.name) / "bad.zip"
        with self.assertRaises(PilotReviewError):
            adapt(bad, self.out)
        self.assertFalse(self.out.exists())

    def test_normalization_is_deterministic(self):
        another = Path(self.temp.name) / "second.zip"
        a = adapt(self.src, self.out)
        b = adapt(self.src, another)
        self.assertEqual(a["adaptedEditionSha256"], b["adaptedEditionSha256"])
        self.assertEqual(a["adaptedZipSha256"], b["adaptedZipSha256"])
        self.assertEqual(self.out.read_bytes(), another.read_bytes())


if __name__ == "__main__":
    unittest.main()
