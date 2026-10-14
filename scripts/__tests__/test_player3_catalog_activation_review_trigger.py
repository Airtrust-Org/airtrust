"""SQLite-only rehearsal of the REVIEW-ONLY Player3 catalog trigger extension.

No D1/R2 or live enrollments. The 0555 candidate must preserve the entire
official 0554 modular attempt trigger except for its tenant-scoped catalog
activation predicate, and must never accept unactivated external SCORM.
"""
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "worker-airtrust/schema-v2/plans/lms-native-catalog-activation-0555.REVIEW-ONLY.sql.txt"
BASE = ROOT / "worker-airtrust/schema-v2/changes/0554_lms_player3_module_attempts.sql"
START = "CREATE TRIGGER lms_player3_attempt_insert BEFORE INSERT"
OLD = "c.tipo_conteudo='native'"
ALIAS = ("(c.tipo_conteudo='native' OR (c.tipo_conteudo='scorm' AND EXISTS "
         "(SELECT 1 FROM lms_native_catalog_activation a WHERE "
         "a.empresa_id=c.empresa_id AND a.curso_id=c.id)))")


def extract_trigger(text: str) -> str:
    assert text.count(START) == 1
    return START + text.split(START, 1)[1].split("\nEND;", 1)[0] + "\nEND;"


def database() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY,empresa_id INTEGER,
        tipo_conteudo TEXT,ativo INTEGER,publicado INTEGER,deleted_at TEXT);
      CREATE TABLE lms_native_catalog_activation(curso_id INTEGER,empresa_id INTEGER);
      CREATE TABLE lms_native_edicoes(id INTEGER PRIMARY KEY,empresa_id INTEGER,
        curso_id INTEGER,status TEXT);
      CREATE TABLE lms_player3_politicas(id INTEGER PRIMARY KEY,edicao_id INTEGER,
        empresa_id INTEGER,curso_id INTEGER,estado TEXT);
      CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY,empresa_id INTEGER,
        curso_id INTEGER,funcionario_id INTEGER,status TEXT,deleted_at TEXT);
      CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY,matricula_id INTEGER,
        empresa_id INTEGER,curso_id INTEGER,funcionario_id INTEGER,
        ciclo_atual INTEGER,status TEXT,deleted_at TEXT);
      CREATE TABLE lms_native_matricula_edicoes(id INTEGER PRIMARY KEY,
        matricula_id INTEGER,empresa_id INTEGER,curso_id INTEGER,
        ciclo_id INTEGER,edicao_id INTEGER);
      CREATE TABLE lms_player3_tentativas_modulares(
        id INTEGER PRIMARY KEY,vinculo_id INTEGER,politica_id INTEGER,
        etapa_id TEXT,tentativa_numero INTEGER);
    """)
    for course, tenant, kind in ((31, 6, "scorm"), (32, 6, "scorm"),
                                 (33, 6, "native"), (34, 7, "scorm")):
        db.execute("INSERT INTO lms_cursos VALUES(?,?,?,1,1,NULL)", (course, tenant, kind))
        db.execute("INSERT INTO lms_native_edicoes VALUES(?,?,?,'PUBLISHED')",
                   (course, tenant, course))
        db.execute("INSERT INTO lms_player3_politicas VALUES(?,?,?,?,'APPROVED')",
                   (course, course, tenant, course))
        db.execute("INSERT INTO lms_matriculas VALUES(?,?,?,77,'EM_ANDAMENTO',NULL)",
                   (course, tenant, course))
        db.execute("INSERT INTO lms_matricula_ciclos VALUES(?,?,?,?,77,1,'EM_ANDAMENTO',NULL)",
                   (course, course, tenant, course))
        db.execute("INSERT INTO lms_native_matricula_edicoes VALUES(?,?,?,?,?,?)",
                   (course, course, tenant, course, course, course))
    db.execute("INSERT INTO lms_native_catalog_activation VALUES(31,6)")
    # Deliberate forged marker for the wrong tenant: it must NOT activate 32.
    db.execute("INSERT INTO lms_native_catalog_activation VALUES(32,7)")
    db.executescript(extract_trigger(PLAN.read_text(encoding="utf-8")))
    return db


def insert(db: sqlite3.Connection, binding: int, attempt: int = 1) -> None:
    db.execute("INSERT INTO lms_player3_tentativas_modulares"
               "(vinculo_id,politica_id,etapa_id,tentativa_numero)"
               " VALUES(?,?,'m01',?)", (binding, binding, attempt))


class Player3CatalogActivationTriggerReview(unittest.TestCase):
    def test_review_trigger_differs_from_approved_0554_only_by_course_format(self):
        old = extract_trigger(BASE.read_text(encoding="utf-8"))
        revised = extract_trigger(PLAN.read_text(encoding="utf-8"))
        self.assertEqual(old.count(OLD), 1)
        self.assertEqual(revised, old.replace(OLD, ALIAS))
        self.assertIn("DROP TRIGGER lms_player3_attempt_insert;", PLAN.read_text(encoding="utf-8"))

    def test_only_activated_scorm_and_physical_native_accept_modular_attempts(self):
        db = database()
        try:
            insert(db, 31)
            insert(db, 33)
            self.assertEqual(db.execute(
                "SELECT COUNT(*) FROM lms_player3_tentativas_modulares"
            ).fetchone()[0], 2)
            for binding in (32, 34):
                with self.assertRaisesRegex(sqlite3.IntegrityError,
                                            "PLAYER3_STAGE_ACTIVE_SCOPE"):
                    insert(db, binding)
        finally:
            db.close()

    def test_stale_cycle_revoked_policy_and_sequence_fail_closed(self):
        db = database()
        try:
            db.execute("UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=31")
            with self.assertRaisesRegex(sqlite3.IntegrityError,"PLAYER3_STAGE_ACTIVE_SCOPE"):
                insert(db, 31)
            db.execute("UPDATE lms_matricula_ciclos SET ciclo_atual=1 WHERE id=31")
            db.execute("UPDATE lms_player3_politicas SET estado='DRAFT' WHERE id=31")
            with self.assertRaisesRegex(sqlite3.IntegrityError,"PLAYER3_STAGE_ACTIVE_SCOPE"):
                insert(db, 31)
            db.execute("UPDATE lms_player3_politicas SET estado='APPROVED' WHERE id=31")
            with self.assertRaisesRegex(sqlite3.IntegrityError,"PLAYER3_STAGE_SEQUENCE_CONFLICT"):
                insert(db, 31, 2)
            insert(db, 31)
            insert(db, 31, 2)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
