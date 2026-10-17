"""Player3 Schema V2 0554 module ledger, synthetic SQLite ONLY; no remote IO."""
import sqlite3
import unittest
from pathlib import Path
from test_lms_native_v1_evidence_0553 import db_fixture, create_edition, publish, bind

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'worker-airtrust/schema-v2/changes/0553_lms_native_v1_evidence.sql'
MIGRATION=ROOT/'worker-airtrust/schema-v2/changes/0554_lms_player3_module_attempts.sql'
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
    def test_exact_transaction_guard_against_real_sqlite_ledger(self):
        # Execute the same SQL array exported by the TypeScript guard, not a
        # hand-written approximation of its clauses. No cloud D1 writes.
        import ast, json, re
        source=(ROOT/'worker-airtrust/src/services/lms-player3-terminal-transaction-guard.ts').read_text()
        block=source.split('const SQL=[',1)[1].split("].join(' ');",1)[0]
        parts=re.findall(r'^\s*(?:\x27[^\x27]*\x27|"[^"]*")(?=,?\s*$)',block,re.MULTILINE)
        sql=' '.join(ast.literal_eval(part.strip()) for part in parts)
        self.assertIn('lms_player3_tentativas_modulares',sql)
        self.assertEqual(sql.count('?'),23)
        self.db.executescript("""
            ALTER TABLE lms_cursos ADD COLUMN gerar_qualificacao_ao_concluir INTEGER DEFAULT 0;
            ALTER TABLE lms_cursos ADD COLUMN qualificacao_tipo_id INTEGER;
            CREATE TABLE usuarios(id INTEGER PRIMARY KEY,funcionario_id INTEGER,active INTEGER,deleted_at TEXT);
            CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,status TEXT,deleted_at TEXT);
            CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT,categoria_id INTEGER);
            CREATE TABLE qualificacoes_categorias(id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT,lms_integrada INTEGER);
            INSERT INTO usuarios VALUES (99,69,1,NULL);
            INSERT INTO funcionarios VALUES (69,6,1,'ATIVO',NULL);
        """)
        for n,unit in enumerate(['intro','end'],1):
            self.db.execute("""INSERT INTO lms_native_eventos
               (vinculo_id,event_id,sequencia,unidade_id,payload_sha256)
               VALUES (?,?,?,?,?)""",(self.binding,'visit-'+str(n),n,unit,HASH))
        ids=[]
        for num,stage in enumerate(['mod1','mod2'],1):
            ids.append(attempt(self.db,self.binding,self.policy,stage,1,'event'+str(num),100,1).lastrowid)
        receipts=[
            {'stageId':stage,'attemptId':aid,'attemptNumber':1,'answersHash':HASH,'scorePct':100}
            for stage,aid in zip(['mod1','mod2'],ids)
        ]
        args=[
            99,100,6,10,69,1000,self.binding,self.ed,HASH,self.policy,
            'b'*64,'d'*64,'c'*64,
            0,0,0,0,0,
            2,2,json.dumps(['intro','end']),
            json.dumps(receipts),2,
        ]
        self.assertEqual(self.db.execute(sql,args).fetchone()[0],'null')
        bads=[
          (8,'x'*64),  # other edition digest
          (10,'z'*64), # altered private source SHA
          (19,3),     # missed/late content event
          (20,json.dumps(['intro','missing'])),
          (21,json.dumps([{**receipts[0],'answersHash':'e'*64},receipts[1]])),
          (22,1),     # hidden second stage
        ]
        for slot,bad in bads:
            with self.subTest(slot=slot),self.assertRaises(sqlite3.OperationalError):
                mutated=list(args);mutated[slot]=bad
                self.db.execute(sql,mutated).fetchone()
        self.db.execute("UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1000")
        with self.assertRaises(sqlite3.OperationalError):
            self.db.execute(sql,args).fetchone()

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
