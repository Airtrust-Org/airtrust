"""Execute the EXACT Native private R2 edition selection query in synthetic SQLite.

This verifies that a once-admitted user cannot use a stale enrollment cycle
or a revoked course to select private R2 content. No remote D1 or R2 access.
"""
import ast
import re
import sqlite3
import unittest
from pathlib import Path

from test_lms_native_start_atomic import make_db

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'worker-airtrust/src/services/lms-native-content-loader.ts').read_text()
MATCH = re.search(
    r'const row = await params\.db\.prepare\(\[\n(.*?)\n  \]\.join\(\x27 \x27\)\)',
    SOURCE, re.S,
)
if not MATCH:
    raise AssertionError('NATIVE_PRIVATE_EDITION_SQL_NOT_FOUND')
PARTS = ast.parse('[' + MATCH.group(1) + ']', mode='eval').body
if not isinstance(PARTS, ast.List) or not all(
    isinstance(p, ast.Constant) and isinstance(p.value, str) for p in PARTS.elts
):
    raise AssertionError('NATIVE_PRIVATE_EDITION_SQL_NOT_STATIC')
SQL = ' '.join(p.value for p in PARTS.elts)
BINDS = (900, 6, 101, 31)


def fixture():
    db = make_db()
    db.execute('ALTER TABLE lms_native_edicoes ADD COLUMN package_version TEXT')
    db.execute('ALTER TABLE lms_native_edicoes ADD COLUMN r2_prefix TEXT')
    db.execute(
        "UPDATE lms_native_edicoes SET package_version=?,r2_prefix=? WHERE id=501",
        ('n-' + 'a' * 32, 'lms/native/6/31/' + 'a'*64 + '/'),
    )
    db.commit()
    return db


class NativePrivateEditionSqlTests(unittest.TestCase):
    def test_only_current_published_pinned_edition_passes(self):
        with fixture() as db:
            result = db.execute(SQL, BINDS).fetchone()
            self.assertIsNotNone(result)
            self.assertEqual(result[0], 'a' * 64)
            self.assertEqual(result[3], 1001)
            self.assertIn('cycle.status=m.status', SQL)
            self.assertIn('cycle.funcionario_id=m.funcionario_id', SQL)
            self.assertIn('u.id=?', SQL)
            self.assertIn("c.tipo_conteudo='native'", SQL)

    def test_rejects_any_changed_identity_or_enrollment_state(self):
        changes = [
            "UPDATE usuarios SET funcionario_id=70 WHERE id=900",
            "UPDATE usuarios SET deleted_at='now' WHERE id=900",
            "UPDATE lms_matriculas SET funcionario_id=70 WHERE id=101",
            "UPDATE lms_matriculas SET status='CONCLUIDO' WHERE id=101",
            "UPDATE lms_matricula_ciclos SET funcionario_id=70 WHERE id=1001",
            "UPDATE lms_matricula_ciclos SET status='CANCELADO' WHERE id=1001",
            "UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1001",
            "UPDATE lms_native_edicoes SET status='REVOKED' WHERE id=501",
            "UPDATE lms_cursos SET publicado=0 WHERE id=31",
            "UPDATE lms_cursos SET tipo_conteudo='scorm' WHERE id=31",
        ]
        for statement in changes:
            with self.subTest(statement=statement), fixture() as db:
                db.execute(statement)
                self.assertIsNone(db.execute(SQL, BINDS).fetchone())

    def test_rejects_other_user_tenant_enrollment_and_course(self):
        for binds in [
            (901, 6, 101, 31),
            (900, 7, 101, 31),
            (900, 6, 102, 31),
            (900, 6, 101, 32),
        ]:
            with self.subTest(binds=binds), fixture() as db:
                self.assertIsNone(db.execute(SQL, binds).fetchone())

    def test_read_only_sql_never_updates_or_bypasses_lifecycle(self):
        with fixture() as db:
            before = db.total_changes
            self.assertIsNotNone(db.execute(SQL, BINDS).fetchone())
            self.assertEqual(db.total_changes, before)
            self.assertEqual(db.execute(
                "SELECT status FROM lms_matricula_ciclos WHERE id=1001"
            ).fetchone()[0], 'NAO_INICIADO')


if __name__ == '__main__':
    unittest.main()
