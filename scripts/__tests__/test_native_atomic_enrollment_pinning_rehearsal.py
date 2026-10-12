"""Offline-only: atomic Native enrollment + cycle + immutable edition pin.

Reuses the versioned 0550 contract with the additive marker predicate ONLY in
memory. Tests a transient enrollment intent visible within one transaction but
never left committed; legacy enrollment is denied without such an intent.
Not a Schema V2 migration, remote apply, or production-ready enrollment API.
"""
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHANGE = ROOT / 'worker-airtrust/schema-v2/changes/0550_lms_native_v1_evidence.sql'
CANDIDATE = ROOT / 'worker-airtrust/schema-v2/plans/lms-native-catalog-activation-0551.REVIEW-ONLY.sql.txt'
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
-- A deferred FK to an UNFILLABLE sentinel prevents any persistent orphan
-- intent at COMMIT. Within a single transaction the intent may exist briefly,
-- but it MUST be deleted after the matching enrollment/cycle/pin is verified.
CREATE TABLE lms_native_uncommittable_intent_guard(
  id INTEGER PRIMARY KEY CHECK(0)
);
CREATE TABLE lms_native_enrollment_intents(
  nonce TEXT PRIMARY KEY CHECK(length(nonce)=64),
  empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL, actor_user_id INTEGER NOT NULL,
  edicao_id INTEGER NOT NULL REFERENCES lms_native_edicoes(id),
  matricula_id INTEGER, ciclo_id INTEGER,
  uncommittable INTEGER NOT NULL DEFAULT 1
    REFERENCES lms_native_uncommittable_intent_guard(id)
    DEFERRABLE INITIALLY DEFERRED
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
        gerar_qualificacao_ao_concluir INTEGER NOT NULL DEFAULT 0,
        qualificacao_tipo_id INTEGER,deleted_at TEXT);
      CREATE TABLE lms_scorm_package_versions(
        id INTEGER PRIMARY KEY,curso_id INTEGER REFERENCES lms_cursos(id));
      CREATE TABLE funcionarios(
        id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'ATIVO',deleted_at TEXT);
      CREATE TABLE usuarios(
        id INTEGER PRIMARY KEY, funcionario_id INTEGER,
        active INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
      CREATE TABLE qualificacoes_categorias(
        id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
      CREATE TABLE qualificacoes_tipos(
        id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,
        categoria_id INTEGER REFERENCES qualificacoes_categorias(id),
        ativo INTEGER NOT NULL DEFAULT 1,deleted_at TEXT);
      CREATE TABLE lms_matriculas(
        id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL REFERENCES lms_cursos(id),
        funcionario_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'NAO_INICIADO',
        progresso_pct REAL NOT NULL DEFAULT 0, data_conclusao TEXT,
        qualificacao_historico_id INTEGER,
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
        progresso_pct REAL NOT NULL DEFAULT 0, data_conclusao TEXT,
        qualificacao_historico_id INTEGER,
        deleted_at TEXT, UNIQUE(matricula_id, ciclo_atual));
      INSERT INTO lms_cursos(id,empresa_id,tipo_conteudo)
      VALUES(10,6,'scorm'),(11,6,'scorm'),(12,7,'scorm');
      INSERT INTO funcionarios(id,empresa_id) VALUES(69,6),(70,7),(71,6);
      INSERT INTO usuarios(id,funcionario_id) VALUES(900,69),(901,70),(902,71);
      INSERT INTO qualificacoes_categorias(id,empresa_id) VALUES(45,6),(46,7);
      INSERT INTO qualificacoes_tipos(id,empresa_id,categoria_id) VALUES(44,6,45);
    """)
    # 0550 stays byte-for-byte versioned. The 0551 review-only candidate
    # evolves its physical-type triggers without altering any real database.
    ddl = CHANGE.read_text(encoding='utf8')
    if ddl.count(OLD_NATIVE) != 4:
        raise AssertionError('NATIVE_0550_PREDICATE_CONTRACT_DRIFT')
    db.executescript(ddl)
    candidate = CANDIDATE.read_text(encoding='utf8')
    if candidate.count("DROP TRIGGER lms_native_") != 4:
        raise AssertionError('NATIVE_0551_CANDIDATE_TRIGGER_DRIFT')
    db.executescript(candidate)
    db.execute('INSERT INTO lms_native_catalog_activation(curso_id,empresa_id) VALUES(10,6)')
    db.commit()
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
    if db.execute('PRAGMA foreign_keys').fetchone()[0] != 1:
        raise RuntimeError('NATIVE_PROVISION_FOREIGN_KEYS_REQUIRED')
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
          JOIN funcionarios f ON f.id=u.funcionario_id
            AND f.empresa_id=c.empresa_id AND f.deleted_at IS NULL
            AND f.ativo=1
            AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO'
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
        # Find the newly inserted row by its immutable tenant/course/employee
        # tuple instead of trusting connection-local last_insert_rowid() across
        # sequential D1.batch statements or database triggers.
        db.execute("""UPDATE lms_native_enrollment_intents
          SET matricula_id=(
            SELECT m.id FROM lms_matriculas m
             WHERE m.empresa_id=lms_native_enrollment_intents.empresa_id
               AND m.curso_id=lms_native_enrollment_intents.curso_id
               AND m.funcionario_id=lms_native_enrollment_intents.funcionario_id
               AND m.deleted_at IS NULL
          ) WHERE nonce=?""", (nonce,))
        assertion(db, """(SELECT COUNT(*) FROM lms_native_enrollment_intents i
          JOIN lms_matriculas m ON m.id=i.matricula_id
          AND m.empresa_id=i.empresa_id AND m.curso_id=i.curso_id
          AND m.funcionario_id=i.funcionario_id
          WHERE i.nonce=?)=1""", 'NATIVE_PROVISION_ENROLLMENT_NOT_PINNED', (nonce,))
        db.execute("""
          INSERT INTO lms_matricula_ciclos(
            matricula_id,empresa_id,curso_id,funcionario_id,status,ciclo_atual)
          SELECT matricula_id,empresa_id,curso_id,funcionario_id,'NAO_INICIADO',1
          FROM lms_native_enrollment_intents WHERE nonce=?
        """, (nonce,))
        db.execute("""UPDATE lms_native_enrollment_intents
          SET ciclo_id=(
            SELECT cy.id FROM lms_matricula_ciclos cy
             WHERE cy.empresa_id=lms_native_enrollment_intents.empresa_id
               AND cy.curso_id=lms_native_enrollment_intents.curso_id
               AND cy.funcionario_id=lms_native_enrollment_intents.funcionario_id
               AND cy.matricula_id=lms_native_enrollment_intents.matricula_id
               AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
          ) WHERE nonce=?""", (nonce,))
        assertion(db, """(SELECT COUNT(*) FROM lms_native_enrollment_intents i
          JOIN lms_matricula_ciclos cy ON cy.id=i.ciclo_id
          AND cy.empresa_id=i.empresa_id AND cy.curso_id=i.curso_id
          AND cy.funcionario_id=i.funcionario_id AND cy.matricula_id=i.matricula_id
          AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
          WHERE i.nonce=?)=1""", 'NATIVE_PROVISION_CYCLE_NOT_PINNED', (nonce,))
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

    def test_candidate_requires_foreign_key_enforcement_before_any_ddl(self):
        db=fixture()
        try:
            db.execute('PRAGMA foreign_keys=OFF')
            before=db.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()[0]
            with self.assertRaisesRegex(sqlite3.OperationalError, 'malformed JSON'):
                db.executescript(CANDIDATE.read_text(encoding='utf8'))
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sqlite_master').fetchone()[0],before)
        finally: db.close()

    def test_candidate_reapply_refused_before_existing_schema_mutation(self):
        db=fixture()
        try:
            before = db.execute(
                "SELECT sql FROM sqlite_master WHERE name='lms_native_event_scope_sequence'"
            ).fetchone()[0]
            with self.assertRaises(sqlite3.OperationalError):
                db.executescript(CANDIDATE.read_text(encoding='utf8'))
            self.assertEqual(db.execute(
                "SELECT sql FROM sqlite_master WHERE name='lms_native_event_scope_sequence'"
            ).fetchone()[0], before)
        finally:
            db.close()

    def test_legacy_cannot_inject_extra_native_cycle_or_change_current_cycle(self):
        db=fixture()
        try:
            matricula, ciclo, _ = provision(db)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'NATIVE_CATALOG_CYCLE_INTENT_REQUIRED'):
                db.execute("""INSERT INTO lms_matricula_ciclos (
                    matricula_id,empresa_id,curso_id,funcionario_id,numero_ciclo,status
                  ) VALUES(?,?,10,69,2,'NAO_INICIADO')""",(matricula,6))
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'NATIVE_CATALOG_CYCLE_IDENTITY_IMMUTABLE'):
                db.execute('UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=?',(ciclo,))
        finally:
            db.close()

    def test_foreign_keys_off_never_starts_provisioning(self):
        db=fixture()
        try:
            db.execute('PRAGMA foreign_keys=OFF')
            with self.assertRaisesRegex(RuntimeError,'NATIVE_PROVISION_FOREIGN_KEYS_REQUIRED'):
                provision(db)
            self.assertEqual(self._counts(db),(0,0,0,0))
            db.execute('PRAGMA foreign_keys=ON')
        finally:
            db.close()

    def test_orphan_intent_cannot_commit_or_make_permanent_legacy_bypass(self):
        db=fixture()
        try:
            self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone()[0],1)
            # Even a privileged accidental standalone INSERT cannot commit
            # the temporary privilege without an atomic consume-and-pin.
            with self.assertRaises(sqlite3.IntegrityError):
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    db.execute("""INSERT INTO lms_native_enrollment_intents(
                        nonce,empresa_id,curso_id,funcionario_id,actor_user_id,edicao_id
                      ) VALUES(?,?,?,?,?,?)""",('b'*64,6,10,69,900,1))
            self.assertEqual(self._counts(db),(0,0,0,0))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('INSERT INTO lms_native_uncommittable_intent_guard(id) VALUES(1)')
        finally:
            db.close()

    def test_legacy_retarget_and_scorm_package_paths_remain_blocked(self):
        db=fixture()
        try:
            db.execute("""INSERT INTO lms_matriculas(empresa_id,curso_id,funcionario_id)
              VALUES(6,11,71)""")
            db.commit()
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_CATALOG_ENROLLMENT_(IDENTITY_IMMUTABLE|REQUIRES_NATIVE_PIN)'):
                db.execute('UPDATE lms_matriculas SET curso_id=10 WHERE curso_id=11')
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_CATALOG_SCORM_VERSION_DENIED'):
                db.execute('INSERT INTO lms_scorm_package_versions(curso_id) VALUES(10)')
            self.assertEqual(self._counts(db),(0,1,0,0))
        finally:
            db.close()

    def test_rejected_scope_and_edition_never_create_partial_enrollment(self):
        for params in ({'empresa':7},{'curso':11},{'actor':901},
                       {'funcionario':70},{'actor':901,'funcionario':70},
                       {'edition':77}):
            with self.subTest(params=params):
                db=fixture()
                try:
                    with self.assertRaises(sqlite3.OperationalError):
                        provision(db,**params)
                    self.assertEqual(self._counts(db),(0,0,0,0))
                finally: db.close()

    def test_native_completion_cannot_be_forged_by_legacy_status_or_progress_writers(self):
        # Completion is not enabled yet. A 100% marker must never create a
        # regulated qualification or certificate without canonical proof.
        db=fixture()
        try:
            matricula,ciclo,_=provision(db)
            for tbl,row in (('lms_matriculas',matricula),('lms_matricula_ciclos',ciclo)):
                for field,value in (('status','CONCLUIDO'),('progresso_pct',100),
                                    ('data_conclusao','2026-10-12'),
                                    ('qualificacao_historico_id',555)):
                    with self.subTest(table=tbl,field=field):
                        with self.assertRaisesRegex(sqlite3.IntegrityError,
                                                     'NATIVE_CATALOG_COMPLETION_NOT_GOVERNED'):
                            db.execute(f'UPDATE {tbl} SET {field}=? WHERE id=?',(value,row))
            # No false-positive for a marked course still actually in progress.
            db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",(matricula,))
            db.execute("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?",(ciclo,))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(db.execute('SELECT status FROM lms_matriculas WHERE id=?',
                                        (matricula,)).fetchone()[0],'EM_ANDAMENTO')
        finally:
            db.close()

    def test_unmarked_scorm_can_still_be_completed_by_legacy_flow(self):
        db=fixture()
        try:
            db.execute("""INSERT INTO lms_matriculas(
              empresa_id,curso_id,funcionario_id,status,progresso_pct,data_conclusao
            ) VALUES(6,11,71,'CONCLUIDO',100,'2026-10-12')""")
            self.assertEqual(db.execute(
                "SELECT status,progresso_pct FROM lms_matriculas WHERE curso_id=11"
            ).fetchone(),('CONCLUIDO',100))
        finally:
            db.close()

    def test_candidate_accepts_evidence_only_for_pinned_active_native_cycle(self):
        db=fixture()
        try:
            matricula, ciclo, binding=provision(db)
            db.execute("UPDATE lms_matriculas SET status='EM_ANDAMENTO' WHERE id=?",(matricula,))
            db.execute("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?",(ciclo,))
            db.execute("""INSERT INTO lms_native_eventos(
                vinculo_id,event_id,sequencia,unidade_id,payload_sha256
              ) VALUES(?,'visit-001',1,'opening',?)""",(binding,HASH))
            db.execute("""INSERT INTO lms_native_tentativas(
                vinculo_id,tentativa_numero,answers_json,answers_sha256,
                policy,score_pct,assessment_satisfied
              ) VALUES(?,1,'[]',?,'SCORED',100,1)""",(binding,HASH))
            self.assertEqual(db.execute(
                'SELECT COUNT(*) FROM lms_native_eventos WHERE vinculo_id=?',
                (binding,)).fetchone()[0],1)
            self.assertEqual(db.execute(
                'SELECT COUNT(*) FROM lms_native_tentativas WHERE vinculo_id=?',
                (binding,)).fetchone()[0],1)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            self.assertEqual(db.execute(
                'SELECT tipo_conteudo FROM lms_cursos WHERE id=10'
            ).fetchone()[0],'scorm')
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_EVENT_SEQUENCE_CONFLICT'):
                db.execute("""INSERT INTO lms_native_eventos(
                  vinculo_id,event_id,sequencia,unidade_id,payload_sha256
                ) VALUES(?,'visit-002',3,'opening',?)""",(binding,HASH))
            with self.assertRaisesRegex(sqlite3.IntegrityError,'NATIVE_ATTEMPT_SEQUENCE_CONFLICT'):
                db.execute("""INSERT INTO lms_native_tentativas(
                  vinculo_id,tentativa_numero,answers_json,answers_sha256,
                  policy,score_pct,assessment_satisfied
                ) VALUES(?,3,'[]',?,'SCORED',100,1)""",(binding,HASH))
        finally:
            db.close()

    def test_candidate_rejects_forged_tenant_activation_before_creating_edition(self):
        db=fixture()
        try:
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        'NATIVE_CATALOG_TENANT_OR_SOURCE_CONFLICT'):
                db.execute("""INSERT INTO lms_native_catalog_activation(
                  curso_id,empresa_id) VALUES(12,6)""")
            self.assertEqual(db.execute(
                'SELECT COUNT(*) FROM lms_native_catalog_activation'
            ).fetchone()[0],1)
        finally:
            db.close()

    def test_employee_inactive_status_rejected_without_any_enrollment_write(self):
        for field, value in (('status','INATIVO'), ('ativo',0), ('deleted_at','2026-10-12')):
            with self.subTest(field=field):
                db=fixture()
                try:
                    db.execute(f'UPDATE funcionarios SET {field}=? WHERE id=69',(value,))
                    db.commit()
                    with self.assertRaises(sqlite3.OperationalError):
                        provision(db)
                    self.assertEqual(self._counts(db),(0,0,0,0))
                finally:
                    db.close()

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

    def test_unrelated_rowid_does_not_affect_enrollment_or_cycle_pin(self):
        db=fixture()
        try:
            # In production the adapter and audit triggers may change the
            # last inserted rowid; the contract must not derive identities
            # from it, including across independently prepared statements.
            db.execute("CREATE TABLE synthetic_audit(id INTEGER PRIMARY KEY, message TEXT)")
            for i in range(1, 21):
                db.execute("INSERT INTO synthetic_audit(id,message) VALUES(?,?)", (i, 'unrelated'))
            db.commit()
            receipt=provision(db)
            self.assertEqual(db.execute("""
                SELECT m.id,cy.id,b.id
                FROM lms_matriculas m
                JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id
                JOIN lms_native_matricula_edicoes b
                  ON b.matricula_id=m.id AND b.ciclo_id=cy.id
            """).fetchone(), receipt)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        finally: db.close()

    def test_second_eligible_employee_can_enroll_with_distinct_pinned_cycle(self):
        db=fixture()
        try:
            first=provision(db)
            second=provision(db,nonce='e'*64,funcionario=71,actor=902)
            self.assertNotEqual(first[:2],second[:2])
            self.assertEqual(self._counts(db),(0,2,2,2))
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        finally:
            db.close()

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
              VALUES(6,11,71)""")
            self.assertEqual(db.execute('SELECT COUNT(*) FROM lms_matriculas').fetchone()[0],1)
        finally: db.close()

    @staticmethod
    def _counts(db):
        return tuple(db.execute(f'SELECT COUNT(*) FROM {tbl}').fetchone()[0] for tbl in (
            'lms_native_enrollment_intents','lms_matriculas',
            'lms_matricula_ciclos','lms_native_matricula_edicoes'))

if __name__=='__main__':
    unittest.main()
