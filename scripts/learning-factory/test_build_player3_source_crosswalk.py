"""Player3 crosswalk conversion never exports questions or changes original HTML5."""
import io
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_player3_source_crosswalk import build_catalog, inspect_original_zip
from convert_preserved_html5 import UnsafePackage

def archive(files):
    out=io.BytesIO()
    with ZipFile(out,'w') as z:
        for name,value in files.items():
            z.writestr(name,value)
    return out.getvalue()

def course(kinds=('lesson','scenario','assessment'), gate=None):
    slides=[
        {'id':f'slide_{i}', 'kind':kind,'module':'m1','title':f'Unit {i}',
         'questions':[{'id':'q-secret','prompt':'PRIVATE QUESTION','answer':'PRIVATE KEY'}]
         if kind=='assessment' else []}
        for i,kind in enumerate(kinds)
    ]
    manifest={'content':{'requiredSlides':[s['id'] for s in slides]},
              'assessment':{'masteryScore':80,'moduleGate':gate},
              'completion':{'strategy':'assessment'}}
    return archive({
        'index.html':'<html><body><h1>Design must remain</h1></body></html>',
        'imsmanifest.xml':'<manifest/>',
        'course_data.js':'window.COURSE_DATA = '+json.dumps({
            'courseId':'course-v1','packageVersion':'RC1','slides':slides})+';',
        'airtrust-completion-manifest.json':json.dumps(manifest),
        'images/cover.jpg':b'\xff\xd8\xff',
    })

class CrosswalkTests(unittest.TestCase):
    def test_module_assessments_are_declared_as_candidate_only(self):
        result=inspect_original_zip(course(('lesson','assessment','lesson','assessment'),True),'course.zip')
        self.assertEqual(result['policy_candidate'],'MODULE_CERTIFIED_CANDIDATE')
        self.assertEqual(result['assessment_source_ids'],['slide_1','slide_3'])
        self.assertFalse(result['certification_approved'])
        self.assertFalse(result['learner_progress_evidence'])
        self.assertNotIn('PRIVATE',json.dumps(result))
        self.assertNotIn('questions',json.dumps(result))
        self.assertNotIn('correctOptionId',json.dumps(result))
    def test_final_exam_is_only_candidate_when_at_end(self):
        result=inspect_original_zip(course(),'course.zip')
        self.assertEqual(result['policy_candidate'],'FINAL_CERTIFIED_CANDIDATE')
        self.assertEqual(result['source_unit_count'],3)
        self.assertEqual(result['scenario_source_ids'],['slide_1'])
        early=inspect_original_zip(course(('lesson','assessment','lesson')),'course.zip')
        self.assertEqual(early['policy_candidate'],'REVIEW_REQUIRED')
    def test_no_invented_final_exam_for_ambiguous_multi_assessments(self):
        result=inspect_original_zip(course(('assessment','lesson','assessment')),'course.zip')
        self.assertEqual(result['policy_candidate'],'REVIEW_REQUIRED')
        self.assertEqual(result['policy_review_reason'],'ASSESSMENT_PATTERN_REQUIRES_HUMAN_REVIEW')
    def test_rejects_duplicate_unit_ids_and_unsafe_authoring(self):
        zipped=archive({
            'index.html':'<html/>','imsmanifest.xml':'<manifest/>',
            'course_data.js':'window.COURSE_DATA = '+json.dumps({
                'courseId':'x','slides':[{'id':'same','kind':'lesson'},
                                        {'id':'same','kind':'assessment'}]})+';',
        })
        with self.assertRaises(UnsafePackage):
            inspect_original_zip(zipped,'duplicate.zip')
    def test_batched_catalog_tracks_source_digests_and_never_answers(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'batch.zip'
            with ZipFile(source,'w') as z:
                z.writestr('lessons/a.zip',course())
                z.writestr('lessons/b.zip',course(('lesson','assessment','lesson','assessment'),True))
                z.writestr('__MACOSX/._hidden.zip',b'not-real-zip')
            report=build_catalog([source])
            self.assertEqual(report['course_count'],2)
            self.assertEqual(len(report['courses']),2)
            self.assertEqual(len(report['courses'][0]['original_zip_sha256']),64)
            self.assertNotIn('PRIVATE',json.dumps(report))

if __name__=='__main__':
    unittest.main()
