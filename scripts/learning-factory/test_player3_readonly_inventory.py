"""Fixed, SELECT-only Player 3 D1 inventory query — focused schema smoke."""
import json
import sqlite3
import unittest
from pathlib import Path

SQL = (Path(__file__).parent / 'player3-active-enrollments-readonly.sql').read_text()

class InventorySqlTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
        CREATE TABLE lms_matriculas(
          id INTEGER, empresa_id INTEGER, curso_id INTEGER, funcionario_id INTEGER,
          status TEXT, progresso_pct INTEGER, score_final INTEGER, tentativas INTEGER,
          updated_at TEXT, data_inicio TEXT, data_conclusao TEXT, ultimo_slide INTEGER,
          ultima_pagina INTEGER, deleted_at TEXT);
        CREATE TABLE lms_cursos(id INTEGER,empresa_id INTEGER,tipo_conteudo TEXT,
          scorm_versao TEXT,version_tag TEXT);
        CREATE TABLE lms_matricula_ciclos(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,
          numero_ciclo INTEGER,status TEXT,progresso_pct INTEGER,score_final INTEGER,
          tentativas INTEGER,ciclo_atual INTEGER,updated_at TEXT,deleted_at TEXT,
          data_inicio TEXT,data_conclusao TEXT,qualificacao_historico_id INTEGER);
        CREATE TABLE lms_xapi_statements(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,created_at TEXT);
        CREATE TABLE lms_scorm_package_versions(id TEXT,empresa_id INTEGER,curso_id INTEGER,status TEXT,package_sha256 TEXT,package_version TEXT,activated_at TEXT);
        CREATE TABLE lms_progresso_scorm(id INTEGER,empresa_id INTEGER,matricula_id INTEGER,
          lesson_status TEXT,completion_status TEXT,success_status TEXT,score_raw INTEGER,
          last_commit_at TEXT,suspend_data TEXT,cmi_json TEXT);
        INSERT INTO lms_cursos VALUES(57,6,'scorm','1.2','RC8'),(90,7,'scorm','1.2','RC1');
        INSERT INTO lms_matriculas VALUES
          (911,6,57,33,'EM_ANDAMENTO',80,0,0,'2026-10-14',NULL,NULL,34,34,NULL),
          (912,7,90,34,'NAO_INICIADO',0,NULL,0,'2026-10-14',NULL,NULL,0,0,NULL),
          (913,6,57,34,'CONCLUIDO',100,90,1,'2026-10-14',NULL,'2026-10-14',42,42,NULL),
          (914,6,57,35,'NAO_INICIADO',0,NULL,0,'2026-10-14',NULL,NULL,0,0,NULL),
          (915,6,999,36,'EM_ANDAMENTO',20,NULL,0,'2026-10-14',NULL,NULL,4,4,NULL);
        INSERT INTO lms_scorm_package_versions VALUES
          ('package_rc8',6,57,'ACTIVE','test-sha-active','RC8.1','2026-10-12'),
          ('package_rc7',6,57,'SUPERSEDED','test-sha-older','RC7','2026-09-01'),
          ('package_outside',7,90,'ACTIVE','test-sha-outside','RC1','2026-10-10');
        INSERT INTO lms_matricula_ciclos(id,empresa_id,matricula_id,numero_ciclo,
          status,progresso_pct,score_final,tentativas,ciclo_atual,updated_at,deleted_at) VALUES
          (1002,6,911,1,'EM_ANDAMENTO',80,0,0,1,'2026-10-14',NULL),
          (1003,7,912,1,'NAO_INICIADO',0,NULL,0,1,'2026-10-14',NULL),
          (1004,6,914,1,'NAO_INICIADO',0,NULL,0,1,'2026-10-14',NULL),
          (1006,6,915,1,'EM_ANDAMENTO',20,NULL,0,1,'2026-10-14',NULL);
        INSERT INTO lms_matricula_ciclos(id,empresa_id,matricula_id,numero_ciclo,
          status,progresso_pct,score_final,tentativas,ciclo_atual,updated_at,
          deleted_at,data_conclusao,qualificacao_historico_id) VALUES
          (1000,6,911,0,'CONCLUIDO',100,90,1,0,'2026-09-12',NULL,
           '2026-09-12',778),
          (1005,7,911,0,'CONCLUIDO',100,100,1,0,'2026-09-12',NULL,
           '2026-09-12',999);
        INSERT INTO lms_xapi_statements VALUES (9,7,912,'2026-10-14');
        INSERT INTO lms_progresso_scorm VALUES
          (800,6,911,'incomplete',NULL,NULL,NULL,'2026-10-14','private_resume','private_cmi');
        """)
    def tearDown(self):
        self.db.close()
    def test_sql_is_one_readonly_select(self):
        code = '\n'.join(line for line in SQL.splitlines()
          if not line.lstrip().startswith('--')).strip()
        self.assertTrue(code.upper().startswith('SELECT'))
        self.assertEqual(code.count(';'), 1)
        forbidden = ('UPDATE ', 'DELETE ', 'INSERT ', 'ALTER ', 'DROP ', 'CREATE ', 'ATTACH ')
        self.assertFalse(any(token in code.upper() for token in forbidden))
    def test_inventory_only_authorized_tenant_with_both_active_statuses(self):
        rows = list(self.db.execute(SQL))
        self.assertEqual([(r['empresa_id'], r['matricula_id']) for r in rows],
          [(6,911),(6,914),(6,915)])
        self.assertEqual(rows[0]['inventory_total_expected'],3)
        self.assertTrue(all(row['inventory_total_expected']==3 for row in rows))
        self.assertEqual(rows[0]['matricula_progresso_pct'],80)
        self.assertEqual(rows[0]['ciclo_progresso_pct'],80)
        self.assertEqual(rows[0]['scorm_suspend_data_PRIVATE'],'private_resume')
        histories=json.loads(rows[0]['ciclos_historicos_json_PRIVATE'])
        self.assertEqual(len(histories),2)
        self.assertEqual({cycle['id'] for cycle in histories},{1000,1002})
        self.assertTrue(all(cycle['empresa_id']==6 and
          cycle['matricula_id']==911 for cycle in histories))
        self.assertEqual(next(h['qualificacao_historico_id'] for h in histories
          if h['id']==1000),778)
        self.assertEqual(rows[1]['ciclo_id'],1004)
        self.assertEqual(rows[1]['xapi_statement_count'],0)
        self.assertEqual(rows[0]['xapi_statement_count'],0)
        self.assertEqual(rows[0]['catalog_current_scorm_sha256'],'test-sha-active')
        self.assertEqual(rows[0]['catalog_current_scorm_version'],'RC8.1')
        self.assertIsNone(rows[2]['tipo_conteudo'])
        self.assertIsNone(rows[2]['catalog_current_scorm_sha256'])
        self.assertNotIn('nome',rows[0].keys())
        self.assertTrue(all(row['empresa_id']==6 for row in rows))

if __name__ == '__main__':
    unittest.main()
