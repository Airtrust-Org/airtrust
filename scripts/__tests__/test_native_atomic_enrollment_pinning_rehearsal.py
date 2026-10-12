"""Offline-only: atomic Native enrollment + cycle + immutable edition pin.

Reuses the versioned 0550 contract with the additive marker predicate ONLY in
memory. Tests a transient enrollment intent visible within one transaction but
never left committed; legacy enrollment is denied without such an intent.
Not a Schema V2 migration, remote apply, or production-ready enrollment API.
"""
import re
import runpy
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGE = ROOT / 'worker-airtrust/schema-v2/changes/0550_lms_native_v1_evidence.sql'
ACTIVATION_RUNNER = ROOT / 'scripts/schema-v2/rehearse-native-catalog-activation-table.py'
OLD_NATIVE = "c.tipo_conteudo='native'"
EFFECTIVE_NATIVE = """(c.tipo_conteudo='native' OR (
  c.tipo_conteudo='scorm' AND EXISTS (
    SELECT 1 FROM lms_native_catalog_activation a
     WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id
  )))"""
HASH = 'a' * 64

# Candidate-only contract. The intent is inserted and destroyed IN THE SAME
# atomic D1-like transaction as the enrollment+cycle+pin. An untrusted legacy
# INSERT has no intent and is rejected by the trigger. IDs are tied to an
# edition, authenticated user and employee; the nonce never appears in HTTP.
ENROLLMENT_GATE = """
CREATE TABLE lms_native_enrollment_intents(
  nonce TEXT PRIMARY KEY CHECK(length(nonce)=64),
  empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL, actor_user_id INTEGER NOT NULL,
  edicao_id INTEGER NOT NULL REFERENCES lms_native_edicoes(id),
  matricula_id INTEGER, ciclo_id INTEGER
);
CREATE TRIGGER native_intent_required BEFORE INSERT ON lms_matriculas
WHEN EXISTS(SELECT 1 FROM lms_native_catalog_activation a
             WHERE a.empresa_id=NEW.empresa_id AND a.curso_id=NEW.curso_id)
BEGIN
 SELECT RAISE(ABORT,'NATIVE_ENROLLMENT_INTENT_REQUIRED')
 WHERE NOT EXISTS (
   SELECT 1 FROM lms_native_enrollment_intents i
   WHERE i.empresa_id=NEW.empresa_id AND i.curso_id=NEW.curso_id
     AND i.funcionario_id=NEW.funcionario_id AND i.matricula_id IS NULL
     AND i.ciclo_id IS NULL
 );
END;
"""

def fixture():
    db = sqlite3.connect(':memory:')
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript("""
      CREATE TABLE lms_cursos(
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
        tipo_conteudo TEXT NOT NULL CHECK(tipo_conteudo IN
          ('scorm','h5p','video','pdf','pptx')),
        ativo INTEGER NOT NULL DEFAULT 1, publicado INTEGER NOT NULL DEFAULT 1,
        scorm_launch_file TEXT, scorm_package_r2_prefix TEXT,
        deleted_at TEXT);
      CREATE TABLE lms_scorm_package_versions(
        id INTEGER PRIMARY KEY,curso_id INTEGER REFERENCES lms_cursos(id));
      CREATE TABLE usuarios(
        id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
      CREATE TABLE lms_matriculas(
        id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL REFERENCES lms_cursos(id),
        funcionario_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'NAO_INICIADO',
        deleted_at TEXT, UNIQUE(empresa_id, curso_id, funcionario_id));
      CREATE TABLE lms_matricula_ciclos(
        id INTEGER PRIMARY KEY AUTOINCREMENT, matricula_id INTEGER NOT NULL
          REFERENCES lms_matriculas(id), empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'NAO_INICIADO'
          CHECK(status IN ('NAO_INICIADO','EM_ANDAMENTO','CONCLUIDO','REPROVADO',
                           'CANCELADO','PENDENTE_VINCULO')),
        ciclo_atual INTEGER NOT NULL DEFAULT 1,
        origem TEXT NOT NULL DEFAULT 'LMS'
          CHECK(origem IN ('LMS','MANUAL','AUTO_RENOVACAO','IMPORTADO_EDAPP')),
        numero_ciclo INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT, UNIQUE(matricula_id, ciclo_atual));
      INSERT INTO lms_cursos(id,empresa_id,tipo_conteudo)
      VALUES(10,6,'scorm'),(11,6,'scorm'),(12,7,'scorm');
      INSERT INTO usuarios(id,funcionario_id) VALUES(900,69),(901,70);
    """)
    # Reuse the actual candidate activation DDL, omitting ONLY its pilot
    # blanket enrollment-insert ban. The replacement gate below requires
    # a transaction-scoped edition+tenant+actor intent instead.
    activation = runpy.run_path(str(ACTIVATION_RUNNER))['ACTIVATION_DDL']
    old_gate = 'CREATE TRIGGER trg_native_catalog_no_legacy_enrollment_insert'
    next_gate = 'CREATE TRIGGER trg_native_catalog_no_legacy_enrollment_retarget'
    if activation.count(old_gate) != 1 or activation.count(next_gate) != 1:
        raise AssertionError('NATIVE_ACTIVATION_CANDIDATE_GATE_DRIFT')
    first, last = activation.index(old_gate), activation.index(next_gate)
    db.executescript(activation[:first] + activation[last:])
    db.execute('INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(10,6)')
    db.commit()
    ddl = CHANGE.read_text(encoding='utf8')
    if ddl.count(OLD_NATIVE) != 4:
        raise AssertionError('NATIVE_0550_PREDICATE_CONTRACT_DRIFT')
    db.executescript(ddl.replace(OLD_NATIVE, EFFECTIVE_NATIVE))
    db.executescript(ENROLLMENT_GATE)
    db.execute("""INSERT INTO lms_native_edicoes(
      empresa_id,curso_id,artifact_sha256,package_version,r2_prefix
    ) VALUES(6,10,?,?,?)""", (HASH, 'n-'+'a'*32, f'lms/native/6/10/{HASH}/'))
    db.execute("""UPDATE lms_native_edicoes
      SET status='REVIEWED',reviewed_at=datetime('now') WHERE id=1""")
    db.execute("""UPDATE lms_native_edicoes
      SET status='PUBLISHED',published_at=datetime('now') WHERE id=1""")
    db.commit()
    return db

def assertion(db, condition, code, values=()):
    # sqlite json() aborts the entire transaction if the condition is false.
    # All external values remain SQL bind parameters, including the nonce.
    db.execute(f"SELECT json(CASE WHEN ({condition}) THEN 'null' ELSE ? END)",
               (*values, code))

def provision(db, *, nonce='f'*64, empresa=6, curso=10,
              funcionario=69, actor=900, edition=1, fault=None):
    # Mirrors D1.batch: no intermediate write is externally observable.
    # Never split these into independently committed worker .run() calls.
    if not re.fullmatch(r'[0-9a-f]{64}', nonce):
        raise ValueError('NATIVE_PROVISION_INVALID_NONCE')
    with db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("""
          INSERT INTO lms_native_enrollment_intents
            (nonce,empresa_id,curso_id,funcionario_id,actor_user_id,edicao_id)
          SELECT ?, c.empresa_id, c.id, u.funcionario_id, u.id, ed.id
          FROM lms_cursos c
          JOIN lms_native_catalog_activation a
            ON a.curso_id=c.id AND a.empresa_id=c.empresa_id
          JOIN lms_native_edicoes ed
            ON ed.curso_id=c.id AND ed.empresa_id=c.empresa_id
          JOIN usuarios u ON u.id=? AND u.funcionario_id=?
            AND u.deleted_at IS NULL
          WHERE c.id=? AND c.empresa_id=? AND c.ativo=1
            AND c.publicado=1 AND c.deleted_at IS NULL
            AND ed.id=? AND ed.status='PUBLISHED'
            AND NOT EXISTS(
              SELECT 1 FROM lms_matriculas m
              WHERE m.empresa_id=c.empresa_id AND m.curso_id=c.id
                AND m.funcionario_id=u.funcionario_id)
        """, (nonce, actor, funcionario, curso, empresa, edition))
        assertion(db, "(SELECT COUNT(*) FROM lms_native_enrollment_intents WHERE nonce=?)=1",
                  'NATIVE_PROVISION_SCOPE_DENIED', (nonce,))
        if fault == 'before_enrollment':
            raise RuntimeError('INJECTED_BEFORE_ENROLLMENT')
        db.execute("""
          INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id,status)
          SELECT empresa_id,curso_id,funcionario_id,'NAO_INICIADO'
            FROM lms_native_enrollment_intents WHERE nonce=?
        """, (nonce,))
        db.execute("""UPDATE lms_native_enrollment_intents
             SET matricula_id=last_insert_rowid() WHERE nonce=?""", (nonce,))
        db.execute("""
          INSERT INTO lms_matricula_ciclos(
            matricula_id,empresa_id,curso_id,funcionario_id,status,ciclo_atual)
          SELECT matricula_id,empresa_id,curso_id,funcionario_id,'NAO_INICIADO',1
          FROM lms_native_enrollment_intents WHERE nonce=?
        """, (nonce,))
        db.execute("""UPDATE lms_native_enrollment_intents
             SET ciclo_id=last_insert_rowid() WHERE nonce=?""", (nonce,))
        if fault == 'before_pin':
            raise RuntimeError('INJECTED_BEFORE_PIN')
        db.execute("""
          INSERT INTO lms_native_matricula_edicoes(
            empresa_id,curso_id,matricula_id,ciclo_id,edicao_id)
          SELECT i.empresa_id,i.curso_id,i.matricula_id,i.ciclo_id,i.edicao_id
            FROM lms_native_enrollment_intents i
            JOIN lms_matriculas m ON m.id=i.matricula_id
              AND m.empresa_id=i.empresa_id AND m.curso_id=i.curso_id
              AND m.funcionario_id=i.funcionario_id
            JOIN lms_matricula_ciclos cy ON cy.id=i.ciclo_id
              AND cy.matricula_id=m.id AND cy.status=m.status AND cy.ciclo_atual=1
            JOIN lms_native_edicoes ed ON ed.id=i.edicao_id
              AND ed.empresa_id=i.empresa_id AND ed.curso_id=i.curso_id
              AND ed.status='PUBLISHED'
          WHERE i.nonce=?
        """, (nonce,))
        assertion(db, """(SELECT COUNT(*) FROM lms_native_matricula_edicoes b
          JOIN lms_native_enrollment_intents i
          ON i.matricula_id=b.matricula_id AND i.ciclo_id=b.ciclo_id
          AND i.edicao_id=b.edicao_id AND i.empresa_id=b.empresa_id
          WHERE i.nonce=?)=1""", 'NATIVE_PROVISION_PIN_MISSING', (nonce,))
        if fault == 'before_intent_cleanup':
            raise RuntimeError('INJECTED_BEFORE_CLEANUP')
        db.execute('DELETE FROM lms_native_enrollment_intents WHERE nonce=?', (nonce,))
        assertion(db, "(SELECT COUNT(*) FROM lms_native_enrollment_intents)=0",
                  'NATIVE_PROVISION_INTENT_NOT_CONSUMED')
    return db.execute("""SELECT m.id,cy.id,b.id FROM lms_matriculas m
       JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id
       JOIN lms_native_matricula_edicoes b ON b.matricula_id=m.id AND b.ciclo_id=cy.id
       WHERE m.curso_id=? AND m.empresa_id=? AND m.funcionario_id=?""",
       (curso,empresa,funcionario)).fetchone()

class NativeAtomicEnrollmentRehearsal(unittest.TestCase):
    def test_atomic_happy_path_and_closed_legacy_enrollment_after_commit(self):
        db=fixture()
        try:
            receipt=provision(db)
            self.assertIsNotNone(receipt)
            self.assertTrue(all(isinstance(x,int) and x>0 for x in receipt))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_native_enrollment_intents').fetchone()[0],0)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(db.execute("""SELECT origem FROM lms_matricula_ciclos
                 WHERE matricula_id=?""",(receipt[0],)).fetchone()[0],'LMS')
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_ENROLLMENT_INTENT_REQUIRED'):
                db.execute("""INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id)
                  VALUES(6,10,70)""")
            self.assertEqual(db.execute("SELECT tipo_conteudo FROM lms_cursos WHERE id=10").fetchone()[0],'scorm')
        finally:
            db.close()

    def test_rejected_scope_and_edition_never_create_partial_enrollment(self):
        for params in ({'empresa':7},{'curso':11},{'actor':901},
                       {'funcionario':70},{'edition':77}):
            with self.subTest(params=params):
                db=fixture()
                try:
                    with self.assertRaises(sqlite3.OperationalError):
                        provision(db,**params)
                    self.assertEqual(self._counts(db),(0,0,0,0))
                finally: db.close()

    def test_injected_failure_at_each_stage_rolls_back_all_writes(self):
        for stage in ('before_enrollment','before_pin','before_intent_cleanup'):
            with self.subTest(stage=stage):
                db=fixture()
                try:
                    with self.assertRaisesRegex(RuntimeError,'INJECTED'):
                        provision(db,fault=stage)
                    self.assertEqual(self._counts(db),(0,0,0,0))
                    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
                finally: db.close()

    def test_native_enrollment_is_not_idempotently_rematriculated(self):
        db=fixture()
        try:
            provision(db)
            with self.assertRaises(sqlite3.OperationalError):
                provision(db,nonce='e'*64)
            self.assertEqual(self._counts(db),(0,1,1,1))
        finally:
            db.close()

    def test_rejects_untrusted_nonce_before_creating_any_intent(self):
        db=fixture()
        try:
            with self.assertRaisesRegex(ValueError, 'NATIVE_PROVISION_INVALID_NONCE'):
                provision(db, nonce="x' OR 1=1 --")
            self.assertEqual(self._counts(db),(0,0,0,0))
        finally: db.close()

    def test_unmarked_scorm_course_keeps_legacy_enrollment(self):
        db=fixture()
        try:
            db.execute("""INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id)
              VALUES(6,11,70)""")
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_matriculas').fetchone()[0],1)
        finally: db.close()

    @staticmethod
    def _counts(db):
        return tuple(db.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0] for tbl in (
            'lms_native_enrollment_intents','lms_matriculas',
            'lms_matricula_ciclos','lms_native_matricula_edicoes'))

if __name__=='__main__':
    unittest.main()
