"""OFFLINE ONLY: document why 0550 cannot use the staging D1 legacy CHECK.

A candidate trigger predicate is rewritten IN MEMORY to test tenant-bound
feasibility; the versioned Schema V2 0550 SQL, manifest and D1 are not edited.
This proof deliberately does NOT implement Native enrollment/cycle creation.
"""
import sqlite3
import unittest
from pathlib import Path

CHANGE = Path(__file__).resolve().parents[2] / (
    'worker-airtrust/schema-v2/changes/0558_lms_native_v1_evidence.sql')
ORIGINAL_NATIVE = "c.tipo_conteudo='native'"
CANDIDATE_NATIVE = """(c.tipo_conteudo='native'
 OR (c.tipo_conteudo='scorm' AND EXISTS (
   SELECT 1 FROM lms_native_catalog_activation a
   WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id)))"""


def fixture():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript("""
    CREATE TABLE lms_cursos(
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      tipo_conteudo TEXT NOT NULL CHECK(tipo_conteudo IN ('scorm','h5p','video','pdf','pptx')),
      deleted_at TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      publicado INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL REFERENCES lms_cursos(id),
      funcionario_id INTEGER NOT NULL,
      deleted_at TEXT,
      status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO'
    );
    CREATE TABLE lms_matricula_ciclos(
      id INTEGER PRIMARY KEY,
      matricula_id INTEGER NOT NULL REFERENCES lms_matriculas(id),
      empresa_id INTEGER NOT NULL,
      curso_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
      deleted_at TEXT,
      ciclo_atual INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE lms_native_catalog_activation(
      curso_id INTEGER PRIMARY KEY REFERENCES lms_cursos(id) ON DELETE RESTRICT,
      empresa_id INTEGER NOT NULL
    );
    INSERT INTO lms_cursos(id,empresa_id,tipo_conteudo)
      VALUES (10,6,'scorm'), (11,6,'scorm'), (12,7,'scorm');
    INSERT INTO lms_matriculas(id,empresa_id,curso_id,funcionario_id)
      VALUES (100,6,10,69);
    INSERT INTO lms_matricula_ciclos(
      id,matricula_id,empresa_id,curso_id,funcionario_id,status,ciclo_atual
    ) VALUES (1000,100,6,10,69,'EM_ANDAMENTO',1);
    INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(10,6);
    """)
    assert db.execute('PRAGMA foreign_keys').fetchone()[0] == 1
    return db


def insert_edition(db, company, course):
    return db.execute("""
      INSERT INTO lms_native_edicoes (
        empresa_id,curso_id,artifact_sha256,package_version,r2_prefix
      ) VALUES (?,?,?,?,?)
    """, (
      company, course, 'a'*64, 'n-'+'a'*32,
      f'lms/native/{company}/{course}/'+'a'*64+'/',
    )).lastrowid


class NativeMarker0550CompatibilityTests(unittest.TestCase):
    def test_current_0550_fails_closed_for_marked_scorm_physical_course(self):
        raw = CHANGE.read_text(encoding='utf-8')
        self.assertEqual(raw.count(ORIGINAL_NATIVE), 4)
        db = fixture()
        try:
            db.executescript(raw)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'NATIVE_EDITION_COURSE_SCOPE'):
                insert_edition(db, 6, 10)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE lms_cursos SET tipo_conteudo='native' WHERE id=10")
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally:
            db.close()

    def test_candidate_in_memory_predicate_accepts_only_exact_marked_tenant(self):
        raw = CHANGE.read_text(encoding='utf-8')
        self.assertEqual(raw.count(ORIGINAL_NATIVE), 4)
        # Rewriting an in-memory copy is NOT a governed migration or patch.
        candidate = raw.replace(ORIGINAL_NATIVE, CANDIDATE_NATIVE)
        self.assertEqual(candidate.count(CANDIDATE_NATIVE), 4)
        db = fixture()
        try:
            db.executescript(candidate)
            for company, course in ((6,11),(7,12),(7,10)):
                with self.subTest(tenant=company,course=course):
                    with self.assertRaises(sqlite3.IntegrityError):
                        insert_edition(db, company, course)
            edition = insert_edition(db, 6, 10)
            db.execute("UPDATE lms_native_edicoes SET status='REVIEWED',reviewed_at=datetime('now') WHERE id=?",(edition,))
            db.execute("UPDATE lms_native_edicoes SET status='PUBLISHED',published_at=datetime('now') WHERE id=?",(edition,))
            bind = db.execute("""
              INSERT INTO lms_native_matricula_edicoes(
                empresa_id,curso_id,matricula_id,ciclo_id,edicao_id
              ) VALUES(6,10,100,1000,?)
            """,(edition,)).lastrowid
            db.execute("""
              INSERT INTO lms_native_eventos(
                vinculo_id,event_id,sequencia,unidade_id,payload_sha256
              ) VALUES(?,?,1,'lesson_1',?)
            """,(bind,'native-visit','a'*64))
            db.execute("""
              INSERT INTO lms_native_tentativas(
                vinculo_id,tentativa_numero,answers_json,answers_sha256,
                policy,score_pct,assessment_satisfied
              ) VALUES(?,1,'[]',?,'SCORED',100,1)
            """,(bind,'a'*64))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(db.execute('SELECT tipo_conteudo FROM lms_cursos WHERE id=10').fetchone()[0], 'scorm')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_native_eventos').fetchone()[0],1)
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
