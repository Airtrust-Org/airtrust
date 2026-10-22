"""SQL generator rehearsal only: SQLite fixture, NEVER staging D1."""
import json
import sqlite3
import stat
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"scripts/learning-factory"))
sys.path.insert(0,str(ROOT/"scripts/staging"))
from prepare_player3_technical_candidate import prepare
from build_player3_qa_publication_plan import compose
from build_player3_qa_catalog_sql_plan import (
    bootstrap, edition, main, Denied, COURSE_TITLE, CATEGORY, TYPE,
)

RELEASE="a"*40
ORIGIN="https://qa-player3-staging.pages.dev"


class SqlCatalogTest(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory(prefix="player3-qa-sql-")
        self.addCleanup(tmp.cleanup)
        self.path=Path(tmp.name)
        self.candidate=self.path/"candidate"
        prepare(self.candidate,"https://staging.airtrust.pages.dev")
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.addCleanup(self.db.close)
        self.db.executescript("""
            CREATE TABLE empresas(id INTEGER PRIMARY KEY,codigo TEXT,ativo INTEGER,deleted_at TEXT);
            CREATE TABLE airtrust_schema_changes_v2(change_id TEXT);
            CREATE TABLE qualificacoes_categorias(
              id INTEGER PRIMARY KEY,nome TEXT,codigo TEXT,descricao TEXT,cor TEXT,
              ativo INTEGER,empresa_id INTEGER,dominio_codigo TEXT,lms_integrada INTEGER,
              created_at TEXT,updated_at TEXT,deleted_at TEXT);
            CREATE TABLE qualificacoes_tipos(
              id INTEGER PRIMARY KEY,tipo TEXT,codigo TEXT,nome TEXT,descricao TEXT,
              categoria_id INTEGER,categoria TEXT,carga_horaria INTEGER,validade INTEGER,
              vencimento_fim_mes INTEGER,observacoes TEXT,ativo INTEGER,empresa_id INTEGER,
              created_at TEXT,updated_at TEXT,deleted_at TEXT);
            CREATE TABLE lms_cursos(
              id INTEGER PRIMARY KEY,empresa_id INTEGER,titulo TEXT,descricao TEXT,
              categoria TEXT,carga_horaria_minutos INTEGER,qualificacao_tipo_id INTEGER,
              gerar_qualificacao_ao_concluir INTEGER,ativo INTEGER,publicado INTEGER,
              version_tag TEXT,tipo_conteudo TEXT CHECK(tipo_conteudo IN ('scorm','pdf','h5p')),
              scorm_package_r2_prefix TEXT,scorm_launch_file TEXT,observacoes TEXT,
              created_at TEXT,updated_at TEXT,deleted_at TEXT);
            CREATE TABLE lms_native_catalog_activation(
              curso_id INTEGER PRIMARY KEY,empresa_id INTEGER);
            CREATE TRIGGER native_activation_valid BEFORE INSERT ON lms_native_catalog_activation
            BEGIN
              SELECT RAISE(ABORT,'ONLY_EMPTY_SCORM_QA') WHERE NOT EXISTS(
                SELECT 1 FROM lms_cursos c WHERE c.id=NEW.curso_id AND
                c.empresa_id=NEW.empresa_id AND c.tipo_conteudo='scorm'
                AND c.scorm_package_r2_prefix IS NULL AND c.scorm_launch_file IS NULL);
            END;
            CREATE TABLE lms_native_edicoes(
              id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,
              artifact_sha256 TEXT,package_version TEXT,r2_prefix TEXT,
              status TEXT,reviewed_at TEXT,published_at TEXT,
              UNIQUE(empresa_id,curso_id,artifact_sha256));
            CREATE TRIGGER native_edition_valid BEFORE INSERT ON lms_native_edicoes
            BEGIN
              SELECT RAISE(ABORT,'EDITION_WITHOUT_MARKER') WHERE NOT EXISTS(
                SELECT 1 FROM lms_native_catalog_activation
                WHERE empresa_id=NEW.empresa_id AND curso_id=NEW.curso_id);
            END;
            CREATE TABLE lms_player3_politicas(
              id INTEGER PRIMARY KEY,edicao_id INTEGER,empresa_id INTEGER,
              curso_id INTEGER,source_sha256 TEXT,policy_sha256 TEXT,
              bank_sha256 TEXT,estado TEXT,approved_at TEXT,
              approver_user_id INTEGER);
            CREATE TABLE usuarios(id INTEGER PRIMARY KEY,email TEXT,deleted_at TEXT,active INTEGER);
            CREATE TABLE usuarios_empresas(usuario_id INTEGER,empresa_id INTEGER,role TEXT);
            INSERT INTO empresas VALUES (999006,'qa_examiner_training',1,NULL);
            INSERT INTO airtrust_schema_changes_v2 VALUES ('lms-native-catalog-activation-0561');
            INSERT INTO airtrust_schema_changes_v2 VALUES ('lms-player3-canonical-terminal-0562');
        """)

    def create_catalog(self):
        script=bootstrap(self.candidate,RELEASE)
        self.db.executescript(script)
        return self.db.execute("SELECT id FROM lms_cursos WHERE titulo=?", (COURSE_TITLE,)).fetchone()[0]

    def generate_plan(self,course):
        plan=compose(self.candidate,999006,course,RELEASE,ORIGIN)
        path=self.path/"publication.json"
        path.write_text(json.dumps(plan))
        return path,plan

    def test_synthetic_catalog_exact_tenant_and_no_scorm_package(self):
        course=self.create_catalog()
        row=self.db.execute("""
        SELECT c.empresa_id,c.tipo_conteudo,c.scorm_package_r2_prefix,c.gerar_qualificacao_ao_concluir,
               qc.lms_integrada,qt.categoria,a.empresa_id
        FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id
        JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id
        JOIN lms_native_catalog_activation a ON a.curso_id=c.id
        """).fetchone()
        self.assertEqual(row,(999006,"scorm",None,1,1,"TREINAMENTO EAD",999006))
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(bootstrap(self.candidate,RELEASE))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM lms_cursos").fetchone()[0],1)

    def test_existing_v1_course_and_edition_survive_v2_bootstrap(self):
        # Synthetic old QA data mimics the already-published course 327.
        self.db.execute("""INSERT INTO qualificacoes_categorias
          (id,codigo,empresa_id,ativo) VALUES
          (301,'QA-PLAYER3-NATIVE-CAT',999006,1)""")
        self.db.execute("""INSERT INTO qualificacoes_tipos
          (id,codigo,empresa_id,categoria_id,ativo) VALUES
          (302,'QA-PLAYER3-NATIVE-TYPE',999006,301,1)""")
        self.db.execute("""INSERT INTO lms_cursos
          (id,empresa_id,titulo,version_tag,tipo_conteudo,
           qualificacao_tipo_id,ativo,publicado)
          VALUES (327,999006,'QA-PLAYER3-NATIVE-ONLY-SYNTHETIC',
                  'qa-player3-native-synthetic-v1','scorm',302,1,1)""")
        self.db.execute("""INSERT INTO lms_native_catalog_activation
          (curso_id,empresa_id) VALUES (327,999006)""")
        old_hash = '0dcbbb7d50235d2e37d2c1ddda16c1f55cb2482551a6cf3a3a420829cf642b8f'
        self.db.execute("""INSERT INTO lms_native_edicoes
          (id,empresa_id,curso_id,artifact_sha256,package_version,
           r2_prefix,status) VALUES (45,999006,327,?,'n-old',
           ?, 'PUBLISHED')""",
          (old_hash, 'lms/native/999006/327/' + old_hash + '/'))
        self.db.execute("""INSERT INTO lms_player3_politicas
          (edicao_id,empresa_id,curso_id,source_sha256,
           policy_sha256,bank_sha256,estado)
           VALUES (45,999006,327,?,?,?,'APPROVED')""",
           ('b'*64,'c'*64,'d'*64))
        course = self.create_catalog()
        self.assertNotEqual(course, 327)
        self.assertEqual(self.db.execute(
          "SELECT COUNT(*) FROM lms_cursos WHERE empresa_id=999006"
        ).fetchone()[0], 2)
        self.assertEqual(self.db.execute(
          "SELECT artifact_sha256,status FROM lms_native_edicoes WHERE id=45"
        ).fetchone(), (old_hash,'PUBLISHED'))
        self.assertEqual(self.db.execute(
          "SELECT estado FROM lms_player3_politicas WHERE edicao_id=45"
        ).fetchone(), ('APPROVED',))
        self.assertEqual(self.db.execute(
          "SELECT COUNT(*) FROM lms_native_catalog_activation WHERE empresa_id=999006"
        ).fetchone()[0], 2)

    def test_wrong_tenant_or_unapplied_schema_fail_closed(self):
        self.db.execute("DELETE FROM empresas")
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(bootstrap(self.candidate,RELEASE))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM lms_cursos").fetchone()[0],0)
        self.db.execute("INSERT INTO empresas VALUES (999006,'qa_examiner_training',1,NULL)")
        self.db.execute("DELETE FROM airtrust_schema_changes_v2 WHERE change_id LIKE '%0562'")
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(bootstrap(self.candidate,RELEASE))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM qualificacoes_tipos").fetchone()[0],0)

    def test_published_edition_and_policy_are_pinned_to_hashed_artifact(self):
        course=self.create_catalog()
        plan_file,plan=self.generate_plan(course)
        self.db.execute("INSERT INTO usuarios VALUES(888,?,NULL,1)",
                        ("qa-examiner-admin@staging.airtrust.invalid",))
        self.db.execute("INSERT INTO usuarios_empresas VALUES (888,999006,'admin')")
        script=edition(self.candidate,plan_file,888)
        self.db.executescript(script)
        ed=self.db.execute("SELECT status,artifact_sha256,r2_prefix FROM lms_native_edicoes").fetchone()
        pol=self.db.execute("SELECT estado,source_sha256,policy_sha256,bank_sha256,approver_user_id FROM lms_player3_politicas").fetchone()
        self.assertEqual(ed,("PUBLISHED",plan["artifactSha256"],plan["stagedR2Prefix"]))
        self.assertEqual(pol,("APPROVED",plan["sourceZipSha256"],
            next(o["sha256"] for o in plan["privateR2Objects"] if o["key"].endswith("/player3-approved-policy.json")),
            next(o["sha256"] for o in plan["privateR2Objects"] if o["key"].endswith("/player3-server-private-bank.json")),888))
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(script)

    def test_reject_unapproved_approver_and_drift(self):
        course=self.create_catalog()
        path,plan=self.generate_plan(course)
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.executescript(edition(self.candidate,path,888))
        path.write_text(json.dumps({**plan,"targetTenantId":6}))
        with self.assertRaises(Exception):
            edition(self.candidate,path,888)
        with self.assertRaises(Denied):
            edition(self.candidate,self.path/"absent.json",888)
        with self.assertRaises(Denied):
            bootstrap(self.candidate,"development")

    def test_generator_never_contacts_d1_or_r2(self):
        course=self.create_catalog()
        plan_file,_=self.generate_plan(course)
        from unittest.mock import patch
        import subprocess
        with patch.object(subprocess,"run",side_effect=AssertionError("remote")):
            generated=edition(self.candidate,plan_file,888)
        self.assertIn("REVIEW_ONLY",generated)
        self.assertNotIn("correctOptionId",generated)
        self.assertNotIn("privateSyntheticAnswerKeys",generated)


if __name__=="__main__":
    unittest.main()
