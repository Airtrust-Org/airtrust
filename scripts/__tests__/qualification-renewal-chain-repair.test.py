import importlib.util,sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('repair',ROOT/'scripts/production/qualification-renewal-chain-repair.py')
repair=importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)

def entry(hid,date,prev=None,status='CONCLUIDA',flag=0,employee=29):
 return dict(id=hid,funcionario_id=employee,qualificacao_id=180,code='STOP_WORK',model_code='STOP_WORK',completed=date,previous=prev,flag=flag,status=status,employee_status='ATIVO',employee_deleted=None)

def setup(rows):
 db=sqlite3.connect(':memory:')
 db.executescript('''CREATE TABLE qualificacoes_historico (
 id INTEGER PRIMARY KEY,empresa_id INTEGER,funcionario_id INTEGER,qualificacao_id INTEGER,
 qualificacao_codigo TEXT,data_conclusao TEXT,status TEXT,renovada INTEGER,renovacao_de INTEGER,
 deleted_at TEXT,updated_at TEXT);
 CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,user_id INTEGER,action TEXT,entity_type TEXT,
 entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT);''')
 for r in rows:
  db.execute('''INSERT INTO qualificacoes_historico(id,empresa_id,funcionario_id,qualificacao_id,qualificacao_codigo,
    data_conclusao,status,renovada,renovacao_de) VALUES(?,6,?,?,?,?,?,?,?)''',
    (r['id'],r['funcionario_id'],r['qualificacao_id'],r['code'],r['completed'],r['status'],r['flag'],r['previous']))
 db.commit()
 return db

def plan(rows):
 older,latest=rows
 changes=[dict(id=older['id'],expected_prev=None,expected_status='RENOVADA',expected_flag=1,
  old_prev=older['previous'],old_status=older['status'],old_flag=older['flag']),
 dict(id=latest['id'],expected_prev=older['id'],expected_status='CONCLUIDA',expected_flag=0,
  old_prev=latest['previous'],old_status=latest['status'],old_flag=latest['flag'])]
 safe=[{'employee_id':29,'code':'STOP_WORK','model_id':180,'changes':changes,
        'evidence_dates':[r['completed'] for r in rows]}]
 keyed={(29,'STOP_WORK'):rows}
 return repair.sql_for(safe,keyed,'a'*64)[0]

class RepairSqlTest(unittest.TestCase):
 def test_executor_import_does_not_create_untracked_bytecode(self):
  # The production apply rejects any untracked file in its Git checkout.
  import os,shutil,subprocess,sys,tempfile
  with tempfile.TemporaryDirectory() as tmp:
   directory=Path(tmp)/'scripts'/'production'
   directory.mkdir(parents=True)
   for name in ('qualification-renewal-chain-repair.py','reconcile-qualification-evidence-20261004.py'):
    shutil.copyfile(ROOT/'scripts'/'production'/name,directory/name)
   env=os.environ.copy()
   env.pop('PYTHONDONTWRITEBYTECODE',None)
   code=("import runpy,sys;"
         "runpy.run_path('scripts/production/qualification-renewal-chain-repair.py',"
         "run_name='test_import');"
         "assert sys.dont_write_bytecode")
   subprocess.run([sys.executable,'-c',code],cwd=tmp,env=env,check=True,capture_output=True)
   self.assertFalse((directory/'__pycache__').exists())

 def test_atomic_repair_and_audit(self):
  rows=[entry(11,'2023-05-10'),entry(12,'2026-08-10')]
  db=setup(rows)
  db.executescript('BEGIN;'+plan(rows)+'COMMIT;')
  self.assertEqual(db.execute('SELECT id,status,renovada,renovacao_de FROM qualificacoes_historico ORDER BY id').fetchall(),
       [(11,'RENOVADA',1,None),(12,'CONCLUIDA',0,11)])
  self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0],2)
 def test_cas_rejects_stale_changes_without_any_mutation(self):
  rows=[entry(11,'2023-05-10'),entry(12,'2026-08-10')]
  db=setup(rows)
  db.execute("UPDATE qualificacoes_historico SET status='RENOVADA' WHERE id=11")
  db.commit()
  with self.assertRaises(sqlite3.DatabaseError):
   db.executescript('BEGIN;'+plan(rows)+'COMMIT;')
  db.rollback()
  self.assertEqual(db.execute('SELECT renovacao_de FROM qualificacoes_historico WHERE id=12').fetchone()[0],None)
  self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0],0)
 def test_new_group_member_rejected(self):
  rows=[entry(11,'2023-05-10'),entry(12,'2026-08-10')]
  db=setup(rows)
  extra=entry(13,'2024-05-10')
  db.execute('INSERT INTO qualificacoes_historico(id,empresa_id,funcionario_id,qualificacao_id,qualificacao_codigo,data_conclusao,status,renovada,renovacao_de) VALUES(13,6,29,180,\'STOP_WORK\',\'2024-05-10\',\'CONCLUIDA\',0,NULL)')
  db.commit()
  with self.assertRaises(sqlite3.DatabaseError):
   db.executescript('BEGIN;'+plan(rows)+'COMMIT;')
  db.rollback()
  self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0],0)
 def test_multi_tenant_isolation(self):
  rows=[entry(11,'2023-05-10'),entry(12,'2026-08-10')]
  db=setup(rows)
  db.execute("INSERT INTO qualificacoes_historico(id,empresa_id,funcionario_id,qualificacao_id,qualificacao_codigo,data_conclusao,status,renovada) VALUES (99,7,29,180,'STOP_WORK','2022-02-02','CONCLUIDA',0)")
  db.commit()
  db.executescript('BEGIN;'+plan(rows)+'COMMIT;')
  self.assertEqual(db.execute('SELECT status FROM qualificacoes_historico WHERE id=99').fetchone()[0],'CONCLUIDA')

if __name__=='__main__':unittest.main()
