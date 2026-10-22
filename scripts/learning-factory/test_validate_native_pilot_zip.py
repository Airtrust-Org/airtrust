"""Synthetic-only tests for private Native V6 pilot boundary validator."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from validate_native_pilot_zip import PilotReviewError, validate_private_pilot


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def raw(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()


def fixture(path, slides=15, questions=10, leak=False, media_tamper=False,
            mastery=70, modules=1):
    course = "qa-test-module"
    q = [
        {"id": f"q{i}", "prompt": "Synthetic?", "options": [
            {"id": "A", "text": "A"}, {"id": "B", "text": "B"}],
         "correctOptionId": "A", "feedbackCorrect": "ok", "feedbackIncorrect": "retry"}
        for i in range(modules * questions)
    ]
    units = []
    for index in range(modules):
        units += [{"kind": "lesson", "id": f"l{index}-{i}", "title": "QA",
                   "blocks": [], "questionIds": []} for i in range(slides)]
        units += [{"kind": "assessment", "id": f"exam-{index}", "title": "QA",
                   "blocks": [], "questionIds": [f"q{x}" for x in
                   range(index * questions, (index + 1) * questions)]}]
    media = b"SYNTHETIC_MEDIA_NO_IMAGE"
    assets = [{"id": "a", "path": "a.webp", "mime": "image/webp", "sha256": sha(media)}]
    edition = {"schema": "AIRTRUST_NATIVE_COURSE_V1", "courseId": course,
               "packageVersion": "v6-" + "a" * 32, "locale": "pt-BR",
               "title": "Synthetic only", "policy": {"mode": "SCORED",
               "masteryScore": 70, "moduleGate": True},
               "assets": assets, "units": units, "questions": q}
    edition_bytes = raw(edition)
    learner = dict(edition)
    learner["questions"] = [{k: v for k, v in entry.items()
                             if k not in ("correctOptionId", "feedbackCorrect",
                                          "feedbackIncorrect")} for entry in q]
    if leak:
        learner["questions"][0]["correctOptionId"] = "A"
    source = b"SYNTHETIC_SCORM_SOURCE_NO_DATA"
    cross = [{"sourceQuestionId": f"original{i}", "privateQuestionId": f"q{i}",
              "learnerQuestionId": f"q{i}", "stageId": f"exam-{i // questions}"}
             for i in range(modules * questions)]
    bank = {"courseId": course, "editionSha256": sha(edition_bytes),
            "schema": "AIRTRUST_PLAYER3_SERVER_PRIVATE_BANK_REVIEW_V1",
            "questions": [{"id": f"q{i}", "correctOptionId": "A",
                           "feedbackCorrect": "ok", "feedbackIncorrect": "retry"}
                          for i in range(modules * questions)]}
    policy = {"schema": "AIRTRUST_PLAYER3_GRADE_POLICY_V1",
              "courseId": course, "editionSha256": sha(edition_bytes),
              "masteryScore": mastery, "moduleGate": True,
              "certificationApproved": False, "status": "PROPOSED_V5_NOT_APPROVED"}
    report = {"courseId": course, "candidateEditionSha256": sha(edition_bytes),
              "sourceZipSha256": sha(source), "independentQaApproved": False,
              "publishable": False, "originalPassingScore": 80,
              "modulePlan": [
                  {"assessmentUnitId": f"exam-{index}", "contentSlides": slides,
                   "questionCount": questions} for index in range(modules)]}
    with ZipFile(path, "w") as z:
        for name, payload in [
            ("privado/edicao-native.json", edition_bytes),
            ("privado/banco-questoes.json", raw(bank)),
            ("privado/crosswalk-questoes.json", raw({"questions": cross})),
            ("privado/politica-proposta.json", raw(policy)),
            ("aluno/conteudo-aluno.json", raw(learner)),
            ("revisao/relatorio.json", raw(report)),
            ("referencia/ORIGINAL_SCORM12_NAO_PUBLICAR.zip", source),
            ("midia/a.webp", (b"TAMPER" if media_tamper else media)),
        ]:
            z.writestr(name, payload)


class NativePilotReview(unittest.TestCase):
    def use_case(self, **kwargs):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        path = str(Path(tmp.name) / "private.zip")
        fixture(path, **kwargs)
        return path

    def test_one_module_70_ten_questions_requires_seven(self):
        result = validate_private_pilot(self.use_case())
        self.assertEqual(result["moduleStages"][0]["minimumCorrect"], 7)
        self.assertEqual(result["moduleStages"][0]["firstPassingScore"], 70)
        self.assertFalse(result["qaEligible"])
        self.assertFalse(result["publishable"])
        self.assertIn("REPACKAGE_EDITION_WITH_NATIVE_N_VERSION_AND_NEW_APPROVED_SHA",
                      result["blockers"])

    def test_two_independent_modules_10_question_threshold(self):
        result = validate_private_pilot(self.use_case(modules=2, questions=10))
        self.assertEqual(len(result["moduleStages"]), 2)
        self.assertEqual([v["minimumCorrect"] for v in result["moduleStages"]], [7, 7])

    def test_under_15_slides_rejected(self):
        with self.assertRaisesRegex(PilotReviewError, "MODULE_SLIDES_OR_QUESTIONS"):
            validate_private_pilot(self.use_case(slides=14))

    def test_five_question_module_rejected(self):
        with self.assertRaisesRegex(PilotReviewError, 'UNREVIEWED_ASSESSMENT_SIZE'):
            validate_private_pilot(self.use_case(questions=5))

    def test_private_answers_must_not_leak_to_learner(self):
        with self.assertRaisesRegex(PilotReviewError, "ANSWER_KEY_IN_LEARNER_PROJECTION"):
            validate_private_pilot(self.use_case(leak=True))

    def test_asset_hash_mismatch_rejected(self):
        with self.assertRaisesRegex(PilotReviewError, "ASSET_DIGEST"):
            validate_private_pilot(self.use_case(media_tamper=True))

    def test_80_policy_cannot_silently_replace_requested_70_proposal(self):
        with self.assertRaisesRegex(PilotReviewError, "PROPOSED_POLICY_MISMATCH"):
            validate_private_pilot(self.use_case(mastery=80))


if __name__ == "__main__":
    unittest.main()
