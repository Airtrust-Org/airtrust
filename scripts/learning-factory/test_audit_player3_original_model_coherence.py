"""Answer-free synthetic and optional real-original Player3 source invariants."""
import io
import json
import os
import unittest
from pathlib import Path
from zipfile import ZipFile
from audit_player3_original_model_coherence import (
    SourceCoherenceError, inspect_edition, audit_originals,
)


def source(first, second=None):
    output = io.BytesIO()
    with ZipFile(output, 'w') as z:
        z.writestr('course_data.js', 'window.COURSE_DATA = '+json.dumps(first)+';')
        if second is not None:
            z.writestr('course-model.js', 'window.AIRTRUST_COURSE_MODEL = '+json.dumps(second)+';')
    return output.getvalue()


def model(question_bank=True):
    slides = [{'id':'intro','kind':'lesson'}, {'id':'quiz','kind':'assessment'}]
    if question_bank:
        slides[1]['questions'] = [{'q':'Synthetic test', 'options':['A','B'], 'answer':1}]
    return {'courseId':'fictional-synthetic','slides':slides}


class Player3OriginalModelCoherenceTests(unittest.TestCase):
    def test_dual_matching_banks(self):
        result=inspect_edition(source(model(),model()))
        self.assertTrue(result['questionBanksCompared'])
        self.assertFalse(result['questionBankMismatch'])

    def test_dual_presentation_only_is_legal(self):
        result=inspect_edition(source(model(),model(False)))
        self.assertTrue(result['onePresentationOnly'])
        self.assertFalse(result['questionBanksCompared'])

    def test_reject_cross_course_and_stage_mismatch(self):
        bad=model();bad['courseId']='other'
        with self.assertRaisesRegex(SourceCoherenceError,'COURSE_ID_MISMATCH'):
            inspect_edition(source(model(),bad))
        bad=model();bad['slides'][0]['id']='different'
        with self.assertRaisesRegex(SourceCoherenceError,'STAGE_MISMATCH'):
            inspect_edition(source(model(),bad))

    def test_reject_different_answers_without_exporting_them(self):
        bad=model();bad['slides'][1]['questions'][0]['answer']=0
        with self.assertRaisesRegex(SourceCoherenceError,'PRIVATE_BANK_MISMATCH'):
            inspect_edition(source(model(),bad))
        bad=model();bad['slides'][1]['questions'][0]['q']='Another prompt'
        with self.assertRaisesRegex(SourceCoherenceError,'PRIVATE_BANK_MISMATCH'):
            inspect_edition(source(model(),bad))

    def test_reject_unknown_outer_archive_without_writing_outputs(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'untrusted.zip'
            p.write_bytes(source(model(),model()))
            with self.assertRaisesRegex(SourceCoherenceError,'TWO_ARCHIVES_REQUIRED'):
                audit_originals([p])
            with self.assertRaisesRegex(SourceCoherenceError,'UNAPPROVED_OUTER_SHA'):
                audit_originals([p,p])

    def test_exact_private_originals_opt_in(self):
        a,b = os.environ.get('AIRTRUST_PLAYER3_SMS_ORIGINAL'), os.environ.get('AIRTRUST_PLAYER3_SEGURANCA_ORIGINAL')
        if not a or not b:
            self.skipTest('Private original batches not present in GitHub Actions')
        output=audit_originals([Path(a),Path(b)])
        self.assertEqual(output['originalsVerified'],22)
        self.assertEqual(output['identicalPairedQuestionBanks'],7)
        self.assertFalse(output['publishable'])
        self.assertFalse(output['remoteWrites'])

if __name__=='__main__':unittest.main()