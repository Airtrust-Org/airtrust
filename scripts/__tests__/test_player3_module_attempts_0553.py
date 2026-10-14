"""Player3 Schema V2 0553 module ledger, synthetic SQLite ONLY; no remote IO."""
import sqlite3
import unittest
from pathlib import Path
from test_lms_native_v1_evidence_0552 import db_fixture, create_edition, publish, bind

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'worker-airtrust/schema-v2/changes/0552_lms_native_v1_evidence.sql'
MIGRATION=ROOT/'worker-airtrust/schema-v2/changes/0553_lms_player3_module_attempts.sql'
HASH='a'*64

def approve(db,ed,company=6,course=10):
    p=db.execute("""INSERT INTO lms_player3_politicas
      (edicao_id,empresa_id,curso_id,source_sha256,policy_sha256,bank_sha256)
      VALUES (?,?,?,?,?,?)""",(ed,company,course,'b'*64,'c'*64,'d'*64)).lastrowid
    db.execute("""UPDATE lms_player3_politicas
       SET estado='APPROVED',approved_at=datetime('now'),approver_user_id=55
       WHERE id=?""",(p,))
    return p

def attempt(db,b,p,stage='mod1',n=1,event='e1',pct=100,passed=1):
    return db.execute("""INSERT INTO lms_player3_tentativas_modulares
       (vinculo_id,politica_id,etapa_id,tentativa_numero,event_id,answers_json,
        answers_sha256,score_pct,passed)
       VALUES (?,?,?,?,?,?,?,?,?)""",(b,p,stage,n,event,'[]',HASH,pct,passed))

class Player3SchemaV2Tests(unittest.TestCase):
    def setUp(self):
        self.db=db_fixture()
        self.db.executescript(BASE.read_text(encoding='utf-8'))
        self.db.executescript(MIGRATION.read_text(encoding='utf-8'))
        self.ed=create_edition(self.db)
        publish(self.db,self.ed)
        self.binding=bind(self.db,self.ed)
        self.policy=approve(self.db,self.ed)
    def tearDown(self):
        self.db.close()
    def test_additive_only(self):
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_matriculas').fetchone()[0],2)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_native_tentativas').fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'lms_player3_%'").fetchone()[0],2)
    def test_repeated_apply_rejected(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript(MIGRATION.read_text(encoding='utf-8'))
    def test_policy_starts_draft_and_requires_published_matching_edition(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO lms_player3_politicas
              (edicao_id,empresa_id,curso_id,source_sha256,policy_sha256,bank_sha256,estado)
              VALUES (?,?,?,?,?,?,'APPROVED')""",(self.ed,6,10,HASH,HASH,HASH))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("""INSERT INTO lms_player3_politicas
              (edicao_id,empresa_id,curso_id,source_sha256,policy_sha256,bank_sha256)
              VALUES (?,?,?,?,?,?)""",(self.ed,7,10,HASH,HASH,HASH))
    def test_approved_policy_is_immutable_and_delete_denied(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_player3_politicas SET bank_sha256=? WHERE id=?",('e'*64,self.policy))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_player3_politicas WHERE id=?",(self.policy,))
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_player3_politicas SET estado='DRAFT' WHERE id=?",(self.policy,))
    def test_stage_sequences_independent(self):
        attempt(self.db,self.binding,self.policy,'mod1',1,'e1',60,0)
        attempt(self.db,self.binding,self.policy,'mod2',1,'e2',100,1)
        attempt(self.db,self.binding,self.policy,'mod1',2,'e3',100,1)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM lms_player3_tentativas_modulares').fetchone()[0],3)
        for kwargs in [
            {'stage':'mod1','n':4,'event':'e4'},
            {'stage':'mod1','n':2,'event':'e5'},
            {'stage':'mod2','n':2,'event':'e1'},
        ]:
            with self.subTest(kwargs=kwargs),self.assertRaises(sqlite3.IntegrityError):
                attempt(self.db,self.binding,self.policy,**kwargs)
    def test_no_writes_after_completion_cancel_or_cycle_drift(self):
        for table,field,value,original in [
            ('lms_matriculas','status',"'CONCLUIDO'","'EM_ANDAMENTO'"),
            ('lms_matriculas','status',"'CANCELADO'","'EM_ANDAMENTO'"),
            ('lms_matricula_ciclos','ciclo_atual','0','1'),
            ('lms_matricula_ciclos','status',"'NAO_INICIADO'","'EM_ANDAMENTO'"),
            ('lms_matricula_ciclos','funcionario_id','999','69')
        ]:
            with self.subTest(table=table,field=field,value=value):
                key='1000' if table=='lms_matricula_ciclos' else '100'
                self.db.execute(f'UPDATE {table} SET {field}={value} WHERE id={key}')
                with self.assertRaises(sqlite3.IntegrityError):
                    attempt(self.db,self.binding,self.policy)
                self.db.execute(f'UPDATE {table} SET {field}={original} WHERE id={key}')
    def test_cross_tenant_policy_and_binding_denied(self):
        ed2=create_edition(self.db,7,11,'lms/native/7/11/'+HASH+'/')
        publish(self.db,ed2)
        b2=bind(self.db,ed2,7,11,110,1100)
        with self.assertRaises(sqlite3.IntegrityError):
            attempt(self.db,b2,self.policy)
    def test_unapproved_policy_denied(self):
        ed2=create_edition(self.db,7,11,'lms/native/7/11/'+HASH+'/')
        publish(self.db,ed2)
        p2=self.db.execute("""INSERT INTO lms_player3_politicas
          (edicao_id,empresa_id,curso_id,source_sha256,policy_sha256,bank_sha256)
          VALUES (?,?,?,?,?,?)""",(ed2,7,11,HASH,HASH,HASH)).lastrowid
        b2=bind(self.db,ed2,7,11,110,1100)
        with self.assertRaises(sqlite3.IntegrityError):
            attempt(self.db,b2,p2)
    def test_resume_query_reads_latest_and_earliest_passed_without_losing_pass(self):
        # Exercises the actual SQL string embedded in the Worker reader.
        import ast
        import re
        source=(ROOT/'worker-airtrust/src/services/lms-player3-module-progress-reader.ts').read_text()
        segment=source.split('const LAST_AND_FIRST_PASS=[',1)[1].split("].join(' ');",1)[0]
        parts=re.findall(r'^\s*(\'[^\']*\'|"[^"]*")',segment,re.MULTILINE)
        statement=' '.join(ast.literal_eval(part) for part in parts)
        attempt(self.db,self.binding,self.policy,'mod1',1,'e1',100,1)
        attempt(self.db,self.binding,self.policy,'mod1',2,'e2',50,0)
        attempt(self.db,self.binding,self.policy,'mod2',1,'e3',100,1)
        output=self.db.execute(statement,(self.binding,)).fetchall()
        self.assertEqual([(r[1],r[2],r[7]) for r in output],
                         [('mod1',1,1),('mod1',2,0),('mod2',1,1)])
    def test_immutable_attempt_ledger(self):
        attempt(self.db,self.binding,self.policy)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE lms_player3_tentativas_modulares SET passed=0")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM lms_player3_tentativas_modulares")
    def test_forbid_untrusted_stage_ids_and_scores(self):
        for kwargs in [
            {'stage':'../bad'},{'stage':'  a'},
            {'pct':110},{'passed':2},{'n':0}
        ]:
            with self.subTest(kwargs=kwargs),self.assertRaises(sqlite3.IntegrityError):
                attempt(self.db,self.binding,self.policy,**kwargs)
if __name__=='__main__': unittest.main()
