"""Player3 secure authored assessment extraction — no publication, no data writes."""
import io
import json
import stat
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from convert_preserved_html5 import UnsafePackage
from extract_player3_private_assessments import extract, build

def zip_bytes(files):
    b=io.BytesIO()
    with ZipFile(b,'w') as z:
        for path,data in files.items():
            z.writestr(path,data)
    return b.getvalue()

def scorm(model, name='course_data.js'):
    model_name={'course_data.js':'COURSE_DATA',
                'course-model.js':'AIRTRUST_COURSE_MODEL'}[name]
    return zip_bytes({
        'index.html':'<!doctype html><h1>Visual authored remains untouched</h1>',
        'imsmanifest.xml':'<manifest/>',
        name:'window.'+model_name+'='+json.dumps(model)+';',
    })

def course_data():
    return {'courseId':'course-1','packageVersion':'RC1',
            'slides':[
                {'id':'content_1','kind':'content'},
                {'id':'assessment_1','kind':'assessment','questions':[
                    {'q':'Prompt <b>original</b>','options':['first','second','third'],
                     'answer':1,'explain':'Original explanation'}]},
            ],
            'masteryScore':70}

def sgso():
    return {'courseId':'SGSO','version':'M10.4','masteryScore':80,
            'navigationGate':'module-assessment','slides':[
                {'id':'module','kind':'content'},
                {'id':'test','kind':'quiz','questions':[
                    {'text':'SGSO prompt','options':['A','B'],
                     'correct':0,'feedback':'Original SGSO feedback'}]},
            ]}

def residuos():
    return {'courseId':'waste','version':'RC2','masteryScore':70,
            'slides':[{'id':'waste_01','kind':'content'},
                      {'id':'waste_exam','kind':'quiz'}],
            'assessment':{'questions':[{'id':'r1','q':'Resíduos prompt',
                                        'a':['não','sim'],'correct':1}]}}

class PrivateBankTest(unittest.TestCase):
    def test_course_data_answer_never_in_learner_projection(self):
        raw=scorm(course_data())
        meta,learner,bank=extract(raw,'c1.zip')
        self.assertEqual(meta['question_count'],1)
        self.assertEqual(meta['certificationModeCandidate'],'FINAL_CERTIFIED_CANDIDATE')
        self.assertEqual(meta['certificationApproved'],False)
        self.assertEqual(bank['questions'][0]['correctOptionId'],'o1')
        self.assertEqual(bank['questions'][0]['feedbackCorrect'],'Original explanation')
        self.assertEqual(learner['stages'][0]['questions'][0]['prompt'],
                         'Prompt <b>original</b>')
        self.assertNotIn('correctOptionId',json.dumps(learner))
        self.assertNotIn('Original explanation',json.dumps(learner))
        self.assertNotIn('PRIVATE_NEVER_SERVE_TO_BROWSER',json.dumps(learner))
    def test_special_sgso_and_residuos_models(self):
        m,l,b=extract(scorm(sgso(),'course-model.js'),'sgso.zip')
        self.assertEqual(m['certificationModeCandidate'],'MODULE_CERTIFIED_CANDIDATE')
        self.assertEqual(b['questions'][0]['correctOptionId'],'o0')
        self.assertEqual(b['questions'][0]['feedbackCorrect'],'Original SGSO feedback')
        m,l,b=extract(scorm(residuos(),'course-model.js'),'residuos.zip')
        self.assertEqual(m['question_count'],1)
        self.assertEqual(b['questions'][0]['correctOptionId'],'o1')
    def test_unsupported_or_ambiguous_questions_must_fail_closed(self):
        bad=course_data()
        bad['slides'][-1]['questions'][0]['answer']=999
        with self.assertRaises(UnsafePackage): extract(scorm(bad),'bad.zip')
        bad=course_data()
        bad['slides'][-1]['questions'][0]['answer']='B'
        with self.assertRaises(UnsafePackage): extract(scorm(bad),'bad.zip')
        bad=course_data()
        bad['slides'][-1]['questions'][0].pop('answer')
        with self.assertRaises(UnsafePackage): extract(scorm(bad),'bad.zip')
    def test_duplicate_ids_and_missing_assessment_block(self):
        bad=course_data()
        bad['slides'][0]['id']='assessment_1'
        with self.assertRaises(UnsafePackage):extract(scorm(bad),'dup.zip')
        bad=course_data()
        bad['slides'].pop()
        with self.assertRaises(UnsafePackage):extract(scorm(bad),'noexam.zip')
    def test_private_bank_and_review_projection_use_separate_roots(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            batch=root/'batch.zip'
            with ZipFile(batch,'w') as z:
                z.writestr('original/c1.zip',scorm(course_data()))
                z.writestr('original/sgso.zip',scorm(sgso(),'course-model.js'))
            private=root/'vault'
            review=root/'learner-review'
            report=build([batch],private,review)
            self.assertEqual(report['course_editions'],2)
            self.assertEqual(report['questions'],2)
            self.assertEqual(len(list(private.glob('*server-only-bank.json'))),2)
            self.assertEqual(len(list(review.glob('*learner-review.json'))),2)
            self.assertFalse(list(review.glob('*server-only-bank.json')))
            self.assertFalse(list(private.glob('*learner-review.json')))
            self.assertEqual(stat.S_IMODE(private.stat().st_mode),0o700)
            self.assertEqual(stat.S_IMODE(review.stat().st_mode),0o700)
            for p in list(private.iterdir())+list(review.iterdir()):
                self.assertEqual(stat.S_IMODE(p.stat().st_mode),0o600)
            with self.assertRaises(UnsafePackage):
                build([batch],private,review)
    def test_failure_must_not_leave_incomplete_outputs(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            batch=root/'batch.zip'
            malformed=course_data()
            malformed['slides'][-1]['questions'][0]['answer']=9
            with ZipFile(batch,'w') as z:
                z.writestr('good.zip',scorm(course_data()))
                z.writestr('bad.zip',scorm(malformed))
            with self.assertRaises(UnsafePackage):
                build([batch],root/'vault',root/'review')
            self.assertFalse((root/'vault').exists())
            self.assertFalse((root/'review').exists())
    def test_output_paths_must_be_disjoint(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)
            batch=p/'batch.zip'
            with ZipFile(batch,'w') as z:z.writestr('a.zip',scorm(course_data()))
            with self.assertRaises(UnsafePackage):
                build([batch],p/'vault',p/'vault'/'learner')
            self.assertFalse((p/'vault').exists())

if __name__=='__main__':
    unittest.main()
