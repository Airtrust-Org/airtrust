"""Native start: execute the exact TypeScript SQL against realistic D1 SQLite.

No real database connections or writes. Both lifecycle records must commit
atomically; a rejected scope or a failed cycle write rolls back the matrícula.
"""
import ast
import re
import sqlite3
import unittest
from pathlib import Path

SRC = (Path(__file__).resolve().parents[2] /
       'worker-airtrust/src/services/lms-native-enrollment-starter.ts').read_text()


def statement(name, extra=None):
    match = re.search(r'const ' + name + r' = \[\n(.*?)\n\]\.join\(\x27 \x27\);', SRC, re.S)
    if not match:
        raise AssertionError('SQL_NOT_FOUND_' + name)
    tokens = []
    for line in match.group(1).splitlines():
        token = line.strip().rstrip(',')
        if token == 'PINNED_SCOPE':
            assert extra is not None
            tokens.append(extra)
        elif token:
            tokens.append(ast.literal_eval(token))
    return ' '.join(tokens)


PINNED_SCOPE = statement('PINNED_SCOPE')
PREFLIGHT_SQL = statement('PREFLIGHT_SQL', PINNED_SCOPE)
START_MATRICULA_SQL = statement('START_MATRICULA_SQL', PINNED_SCOPE)
START_CYCLE_SQL = statement('START_CYCLE_SQL', PINNED_SCOPE)
POSTCHECK_SQL = statement('POSTCHECK_SQL', PINNED_SCOPE)
EDITION = 'a'*64
BINDS = (900, 101, 6, 31, 1001, EDITION)


def make_db():
    db = sqlite3.connect(':memory:')
    db.executescript("""
    PRAGMA foreign_keys = ON;
    CREATE TABLE usuarios(
      id INTEGER PRIMARY KEY, funcionario_id INTEGER NOT NULL, deleted_at TEXT
    );
    CREATE TABLE lms_cursos(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, tipo_conteudo TEXT,
      ativo INTEGER, publicado INTEGER, deleted_at TEXT
    );
    CREATE TABLE lms_matriculas(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      funcionario_id INTEGER, status TEXT, data_inicio TEXT,
      updated_at TEXT, deleted_at TEXT
    );
    -- Mirrors status, funcionario and cycle identifiers of migration 0346.
    CREATE TABLE lms_matricula_ciclos(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, matricula_id INTEGER,
      curso_id INTEGER, funcionario_id INTEGER, status TEXT,
      ciclo_atual INTEGER, data_inicio TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE lms_native_edicoes(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      artifact_sha256 TEXT, status TEXT
    );
    CREATE TABLE lms_native_matricula_edicoes(
      id INTEGER PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      matricula_id INTEGER, ciclo_id INTEGER, edicao_id INTEGER
    );
    INSERT INTO usuarios VALUES (900,69,NULL);
    INSERT INTO lms_cursos VALUES (31,6,'native',1,1,NULL);
    INSERT INTO lms_matriculas VALUES (101,6,31,69,'NAO_INICIADO',NULL,NULL,NULL);
    INSERT INTO lms_matricula_ciclos VALUES
      (1001,6,101,31,69,'NAO_INICIADO',1,NULL,NULL,NULL);
    INSERT INTO lms_native_edicoes VALUES (501,6,31,'""" + EDITION + """','PUBLISHED');
    INSERT INTO lms_native_matricula_edicoes VALUES (601,6,31,101,1001,501);
    """)
    return db


def run_batch(db, binds=BINDS, interrupt=None):
    """D1.batch equivalent: begin / 4 exact statements / commit or rollback."""
    db.execute('BEGIN')
    try:
        db.execute(PREFLIGHT_SQL, binds).fetchone()
        first = db.execute(START_MATRICULA_SQL, binds).rowcount
        if interrupt:
            interrupt(db)
        second = db.execute(START_CYCLE_SQL, binds).rowcount
        db.execute(POSTCHECK_SQL, binds).fetchone()
        db.commit()
        return first, second
    except Exception:
        db.rollback()
        raise


def statuses(db):
    m = db.execute('SELECT status,data_inicio FROM lms_matriculas WHERE id=101').fetchone()
    c = db.execute('SELECT status,data_inicio FROM lms_matricula_ciclos WHERE id=1001').fetchone()
    return m, c


class NativeStartAtomicSQLiteTests(unittest.TestCase):
    def test_first_start_updates_both_ssot_records_and_dates(self):
        with make_db() as db:
            self.assertEqual(run_batch(db), (1,1))
            m, c = statuses(db)
            self.assertEqual(m[0], 'EM_ANDAMENTO')
            self.assertEqual(c[0], 'EM_ANDAMENTO')
            self.assertTrue(m[1])
            self.assertEqual(m[1],c[1])

    def test_same_verified_user_cycle_and_edition_is_idempotent(self):
        with make_db() as db:
            self.assertEqual(run_batch(db), (1,1))
            self.assertEqual(run_batch(db), (0,0))
            self.assertEqual(statuses(db)[0][0], 'EM_ANDAMENTO')

    def test_drift_between_matricula_and_active_cycle_refuses_mutations(self):
        for parent, cycle in [('EM_ANDAMENTO','NAO_INICIADO'),
                              ('NAO_INICIADO','EM_ANDAMENTO'),
                              ('CONCLUIDO','EM_ANDAMENTO'),
                              ('CANCELADO','NAO_INICIADO')]:
            with self.subTest(parent=parent, cycle=cycle), make_db() as db:
                db.execute('UPDATE lms_matriculas SET status=? WHERE id=101',(parent,))
                db.execute('UPDATE lms_matricula_ciclos SET status=? WHERE id=1001',(cycle,))
                snapshot=statuses(db)
                with self.assertRaises(sqlite3.OperationalError):
                    run_batch(db)
                self.assertEqual(statuses(db),snapshot)

    def test_bad_user_tenant_course_cycle_and_edition_cannot_start(self):
        overrides=[
            (901,101,6,31,1001,EDITION),
            (900,101,7,31,1001,EDITION),
            (900,101,6,32,1001,EDITION),
            (900,101,6,31,1002,EDITION),
            (900,101,6,31,1001,'b'*64),
        ]
        for binds in overrides:
            with self.subTest(binds=binds),make_db() as db:
                with self.assertRaises(sqlite3.OperationalError):
                    run_batch(db,binds)
                self.assertEqual(statuses(db)[0][0],'NAO_INICIADO')
                self.assertEqual(statuses(db)[1][0],'NAO_INICIADO')

    def test_revoked_edition_old_cycle_or_unpublished_course_refuses_start(self):
        for change in [
            "UPDATE lms_native_edicoes SET status='REVOKED' WHERE id=501",
            "UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1001",
            "UPDATE lms_cursos SET publicado=0 WHERE id=31",
            "UPDATE lms_cursos SET tipo_conteudo='scorm' WHERE id=31",
        ]:
            with self.subTest(change=change),make_db() as db:
                db.execute(change)
                with self.assertRaises(sqlite3.OperationalError):
                    run_batch(db)
                self.assertEqual(statuses(db)[0][0],'NAO_INICIADO')
                self.assertEqual(statuses(db)[1][0],'NAO_INICIADO')

    def test_cycle_update_error_rolls_back_already_updated_matricula(self):
        with make_db() as db:
            db.execute("""
                CREATE TRIGGER fail_native_cycle_update
                BEFORE UPDATE ON lms_matricula_ciclos
                BEGIN SELECT RAISE(ABORT,'SIMULATED_CYCLE_WRITE_FAILED'); END;
            """)
            with self.assertRaises(sqlite3.IntegrityError):
                run_batch(db)
            self.assertEqual(statuses(db)[0][0],'NAO_INICIADO')
            self.assertEqual(statuses(db)[1][0],'NAO_INICIADO')

    def test_final_assertion_rolls_back_when_an_intermediate_step_fails_silently(self):
        with make_db() as db:
            def disrupt(_db):
                # Make the second update miss its scope without throwing.
                _db.execute("UPDATE lms_native_edicoes SET status='REVOKED' WHERE id=501")
            with self.assertRaises(sqlite3.OperationalError):
                run_batch(db, interrupt=disrupt)
            self.assertEqual(statuses(db)[0][0],'NAO_INICIADO')
            self.assertEqual(statuses(db)[1][0],'NAO_INICIADO')
            self.assertEqual(db.execute(
                'SELECT status FROM lms_native_edicoes WHERE id=501'
            ).fetchone()[0],'PUBLISHED')


if __name__ == '__main__':
    unittest.main()
