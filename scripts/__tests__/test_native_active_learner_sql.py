"""Executable offline SQLite checks of the *actual* TypeScript Native learner join.

No staging D1 writes or PII. The test extracts literal join fragments from
services/lms-native-active-learner-sql.ts and evaluates them with the same
usuario/funcionario/matricula columns confirmed by staging sqlite_master.
"""
import ast
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'worker-airtrust/src/services/lms-native-active-learner-sql.ts'
PREFLIGHT = ROOT / 'worker-airtrust/src/services/lms-native-canonical-completion-preflight.ts'


def predicates():
    text = SOURCE.read_text(encoding='utf8')
    match = re.search(
        r"export const NATIVE_ACTIVE_EMPLOYEE_JOIN = \[(.*?)\]\.join\(' '\);",
        text, re.S,
    )
    if not match:
        raise AssertionError('NATIVE_ACTIVE_EMPLOYEE_SQL_SOURCE_DRIFT')
    parts = [ast.literal_eval(x.strip().rstrip(',')) for x in match.group(1).splitlines() if x.strip()]
    user = re.search(r"export const NATIVE_ACTIVE_USER_CONDITION = '([^']+)';", text)
    if not user:
        raise AssertionError('NATIVE_ACTIVE_USER_SQL_SOURCE_DRIFT')
    return ' '.join(parts), user.group(1)


class NativeActiveLearnerSqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript("""
          CREATE TABLE funcionarios(
            id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
            status TEXT,ativo INTEGER NOT NULL,deleted_at TEXT
          );
          CREATE TABLE usuarios(
            id INTEGER PRIMARY KEY,funcionario_id INTEGER,
            active INTEGER DEFAULT 1,deleted_at TEXT
          );
          CREATE TABLE lms_matriculas(
            id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
            funcionario_id INTEGER NOT NULL,deleted_at TEXT
          );
          INSERT INTO funcionarios(id,empresa_id,status,ativo)
            VALUES(18,6,'ATIVO',1),(19,7,'ATIVO',1);
          INSERT INTO usuarios(id,funcionario_id,active)
            VALUES(101,18,1),(102,19,1);
          INSERT INTO lms_matriculas(id,empresa_id,funcionario_id)
            VALUES(99,6,18);
        """)
        employee,user=predicates()
        self.query = ("""
          SELECT u.funcionario_id FROM usuarios u
          JOIN lms_matriculas m ON m.id=? AND m.empresa_id=?
            AND m.funcionario_id=u.funcionario_id AND m.deleted_at IS NULL
        """+employee+" WHERE u.id=? AND u.deleted_at IS NULL "+user+" LIMIT 1")

    def tearDown(self):
        self.db.close()

    def lookup(self, actor=101, tenant=6, enrollment=99):
        return self.db.execute(self.query, (enrollment,tenant,actor)).fetchone()

    def test_authorized_active_learner_resolves_only_one_employee(self):
        self.assertEqual(self.lookup(), (18,))
        self.assertIsNone(self.lookup(actor=102))
        self.assertIsNone(self.lookup(tenant=7))
        self.assertIsNone(self.lookup(enrollment=100))

    def test_revoked_or_deleted_user_is_rejected(self):
        for field,value in (('active',0),('active',None),('deleted_at','2026-10-12')):
            with self.subTest(field=field,value=value):
                self.db.execute('UPDATE usuarios SET active=1,deleted_at=NULL WHERE id=101')
                self.db.execute(f'UPDATE usuarios SET {field}=? WHERE id=101',(value,))
                self.assertIsNone(self.lookup())

    def test_inactive_foreign_or_deleted_employee_is_rejected(self):
        for field,value in (('ativo',0),('status','INATIVO'),
                            ('deleted_at','2026-10-12'),('empresa_id',7)):
            with self.subTest(field=field):
                self.db.execute("""
                  UPDATE funcionarios SET ativo=1,status='ATIVO',
                  deleted_at=NULL,empresa_id=6 WHERE id=18
                """)
                self.db.execute(f'UPDATE funcionarios SET {field}=? WHERE id=18',(value,))
                self.assertIsNone(self.lookup())

    def test_soft_deleted_enrollment_is_denied(self):
        self.db.execute("UPDATE lms_matriculas SET deleted_at='2026-10-12' WHERE id=99")
        self.assertIsNone(self.lookup())

    def test_preflight_excludes_inactive_qualification_types(self):
        src = PREFLIGHT.read_text(encoding='utf8')
        self.assertIn('qt.ativo=1',src)
        self.assertIn('row.qualificacao_tipo_ativo_id !== row.qualificacao_tipo_id',src)


if __name__ == '__main__':
    unittest.main()
