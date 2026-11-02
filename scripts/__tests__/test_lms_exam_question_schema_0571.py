"""Offline Schema V2 integrity tests for 0571 (LMS question bank).

No Cloudflare credentials or remote DB. A passing rehearsal is NOT an apply
authorization.
"""
from pathlib import Path
import hashlib
import json
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "worker-airtrust/schema-v2/changes/0571_lms_exam_question_bank.sql"
PLAN = ROOT / "worker-airtrust/schema-v2/plans/lms-exam-question-bank-0571.md"
MANIFEST = ROOT / "worker-airtrust/schema-v2/lms-exam-question-bank-0571.json"
CONTENT = {
    "moduleId": "m1", "topicId": "safety", "sourceUnitId": "u1",
    "sourceSha256": "a" * 64, "prompt": "Pergunta real?",
    "choices": [{"id": "o1", "text": "Verdade"}, {"id": "o2", "text": "Falso"}],
    "correctChoiceId": "o1", "explanation": "Razão técnica",
}

class SqliteQuestionBank0571(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
          CREATE TABLE lms_cursos (
            id INTEGER PRIMARY KEY,
            empresa_id INTEGER NOT NULL,
            deleted_at TEXT
          );
          INSERT INTO lms_cursos(id,empresa_id) VALUES(100,6),(101,7);
        """)
        self.db.executescript(SCRIPT.read_text(encoding="utf-8"))
        self.db.execute("""
          INSERT INTO lms_exam_question_revisions
            (empresa_id,curso_id,question_key,revision,content_json,created_by,last_edited_by)
          VALUES(6,100,'q1',1,?,'author','author')
        """, (json.dumps(CONTENT),))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_no_cross_tenant_or_missing_course(self):
        for tenant, course in [(7,100), (6,101), (6,777)]:
            with self.subTest(tenant=tenant, course=course):
                with self.assertRaises(sqlite3.IntegrityError):
                    self.db.execute("""
                      INSERT INTO lms_exam_question_revisions
                        (empresa_id,curso_id,question_key,revision,content_json,created_by,last_edited_by)
                      VALUES(?,?,?,1,?,'author','author')
                    """, (tenant,course,f'q{tenant}{course}',json.dumps(CONTENT)))
                self.db.rollback()

    def test_draft_edit_version_and_optimistic_write(self):
        v = json.dumps({**CONTENT, "prompt": "Pergunta corrigida"})
        updated = self.db.execute("""
          UPDATE lms_exam_question_revisions
          SET content_json=?,last_edited_by='editor',edit_version=edit_version+1,
              updated_at=datetime('now')
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1'
            AND revision=1 AND status='DRAFT' AND edit_version=1
        """, (v,))
        self.assertEqual(updated.rowcount,1)
        stale = self.db.execute("""
          UPDATE lms_exam_question_revisions SET last_edited_by='stale',edit_version=edit_version+1
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1'
          AND revision=1 AND edit_version=1
        """)
        self.assertEqual(stale.rowcount,0)
        self.assertEqual(self.db.execute("""
          SELECT edit_version FROM lms_exam_question_revisions
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' AND revision=1
        """).fetchone()[0],2)

    def test_cannot_publish_directly_or_rewrite_reviewed_question(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
              UPDATE lms_exam_question_revisions SET status='PUBLISHED',
              reviewed_by='other',published_by='approver',content_sha256=?
              WHERE question_key='q1'
            """,('a'*64,))
        self.db.rollback()
        self.db.execute("""
          UPDATE lms_exam_question_revisions SET status='REVIEWED',reviewed_by='reviewer'
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' AND revision=1
        """)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
              UPDATE lms_exam_question_revisions SET content_json=?
              WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' AND revision=1
            """,(json.dumps({**CONTENT,'prompt':'fraud'}),))
        self.db.rollback()

    def test_publication_freezes_contents_and_new_revision_is_possible(self):
        self.db.execute("""
          UPDATE lms_exam_question_revisions SET status='REVIEWED',reviewed_by='reviewer'
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' AND revision=1
        """)
        self.db.execute("""
          UPDATE lms_exam_question_revisions SET status='PUBLISHED',
            published_by='publisher',content_sha256=?
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' AND revision=1
        """,('f'*64,))
        # Snapshot of the valid publication must survive rejected mutations.
        self.db.commit()
        for statement in [
            "UPDATE lms_exam_question_revisions SET status='DRAFT' WHERE question_key='q1'",
            "UPDATE lms_exam_question_revisions SET content_json='{}' WHERE question_key='q1'",
            "DELETE FROM lms_exam_question_revisions WHERE question_key='q1'",
        ]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(statement)
            self.db.rollback()
        self.db.execute("""
          INSERT INTO lms_exam_question_revisions
            (empresa_id,curso_id,question_key,revision,content_json,created_by,last_edited_by)
          VALUES(6,100,'q1',2,?,'editor','editor')
        """,(json.dumps({**CONTENT,'prompt':'Revision 2'}),))
        versions=self.db.execute("""
          SELECT revision,status FROM lms_exam_question_revisions
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1' ORDER BY revision
        """).fetchall()
        self.assertEqual(versions,[(1,'PUBLISHED'),(2,'DRAFT')])

    def test_no_unauthorized_revision_jump(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""
              INSERT INTO lms_exam_question_revisions
                (empresa_id,curso_id,question_key,revision,content_json,created_by,last_edited_by)
              VALUES(6,100,'q1',2,?,'editor','editor')
            """,(json.dumps(CONTENT),))
        self.db.rollback()

    def test_audit_contains_no_key_and_cannot_be_changed(self):
        self.db.execute("""
          UPDATE lms_exam_question_revisions SET status='REVIEWED',reviewed_by='reviewer'
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1'
        """)
        self.db.execute("""
          UPDATE lms_exam_question_revisions SET status='PUBLISHED',published_by='publisher',
             content_sha256=?
          WHERE empresa_id=6 AND curso_id=100 AND question_key='q1'
        """,('f'*64,))
        events=self.db.execute("""
          SELECT event_type,actor_key FROM lms_exam_question_audit
          WHERE empresa_id=6 AND curso_id=100 ORDER BY audit_id
        """).fetchall()
        self.assertEqual(events,[('CREATED','author'),('REVIEWED','reviewer'),
                                 ('PUBLISHED','publisher')])
        fields=[r[1] for r in self.db.execute("PRAGMA table_info(lms_exam_question_audit)")]
        self.assertNotIn('content_json',fields)
        self.assertNotIn('correct_choice_key',fields)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_exam_question_audit")
        self.db.rollback()

class Manifest0571Tests(unittest.TestCase):
    def test_manifest_hashes_and_paths_match_files(self):
        m = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(m["changeId"], "lms-exam-question-bank-0571")
        self.assertEqual(m["baselineId"], "production-d1-baseline-v2-20260714")
        self.assertEqual(m["fileHash"], hashlib.sha256(SCRIPT.read_bytes()).hexdigest())
        self.assertEqual(m["planHash"], hashlib.sha256(PLAN.read_bytes()).hexdigest())
        self.assertEqual(ROOT / m["filePath"], SCRIPT)
        self.assertEqual(ROOT / m["planPath"], PLAN)

    def test_sql_is_a_plain_additive_change(self):
        sql = SCRIPT.read_text(encoding="utf-8")
        for forbidden in ("IF NOT EXISTS", "PRAGMA", "DROP ", "DELETE FROM", "UPDATE lms_"):
            self.assertNotIn(forbidden, sql)
        self.assertEqual(sql.count("CREATE TABLE"), 2)
        self.assertEqual(sql.count("CREATE INDEX"), 2)
        self.assertEqual(sql.count("CREATE TRIGGER"), 7)


if __name__ == "__main__":
    unittest.main()
