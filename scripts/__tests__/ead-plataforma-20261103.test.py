#!/usr/bin/env python3
"""PII-free deterministic tests for EAD Plataforma historical D1 reconciliation."""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2] if Path(__file__).resolve().parent.name == '__tests__' else Path('/mnt/data')
SCRIPT = ROOT / 'scripts/production/ead-plataforma-20261103.py'
if not SCRIPT.exists():
    SCRIPT = ROOT / 'ead_platform_governed_reconciler.py'
spec = importlib.util.spec_from_file_location('ead_plataforma_reconcile', SCRIPT)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)


class TestContract(unittest.TestCase):
    def test_dates_only_real_completion(self):
        self.assertEqual(mod.date_only('2025-05-10'), '2025-05-10')
        for value in ('2025-02-30', '2025-01-01 12:00', '1/1/2025', '2200-01-01', '', None):
            with self.subTest(value=value), self.assertRaises((ValueError, TypeError)):
                mod.date_only(value)

    def test_sql_quote_and_provenance(self):
        self.assertEqual(mod.sql_quote("João d'Ávila"), "'João d''Ávila'")
        self.assertEqual(mod.sql_quote(None), 'NULL')
        self.assertIn('EAD Plataforma', mod.note_append_sql('observacoes', 'Treinamento realizado na plataforma anterior EAD Plataforma.'))
        self.assertIn('AIRTRUST_EAD_PLATAFORMA_CAS_GUARD_FAILED', mod.guard('1=0'))

    def test_dispatch_input_is_not_shell_source(self):
        import os
        import subprocess
        workflow=(ROOT / '.github/workflows/production-ead-plataforma-qualification-reconciliation.yml').read_text()
        self.assertNotIn("[[ '${{ inputs.reviewed_dry_run_run_id }}'", workflow)
        self.assertIn('[[ "$REVIEWED_RUN" =~ ^[1-9][0-9]*$ ]]', workflow)
        self.assertIn('REVIEWED_RUN: ${{ inputs.reviewed_dry_run_run_id }}', workflow)
        payload="' =~ .* ]] ; printf 'INJECTED'; #"
        result=subprocess.run(['bash','-c','[[ "$REVIEWED_RUN" =~ ^[1-9][0-9]*$ ]]'],
                              env={**os.environ,'REVIEWED_RUN':payload},capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('INJECTED',result.stdout)
        # Keep secrets out of job-level env, before immutable SHA and 8/8 gates.
        job_env=workflow.split('    steps:',1)[0]
        self.assertNotIn('secrets.CLOUDFLARE_D1_MIGRATION_API_TOKEN',job_env)
        self.assertNotIn('secrets.AIRTRUST_EAD_20261103_PLAN_B64',job_env)

    def test_missing_private_payload_fails_closed(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'plan.json'
            path.write_text('{"operations": []}')
            with self.assertRaisesRegex(ValueError, 'APPROVED_PROJECTION_HASH_MISMATCH'):
                mod.load_plan(path)

    def test_synthetic_complete_cohort_sql(self):
        """Prove exactly 471 mutations + 3 models + 474 audit events in SQLite."""
        db = sqlite3.connect(':memory:')
        db.executescript('''
        CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,empresa_id INTEGER,deleted_at TEXT);
        CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT,codigo TEXT UNIQUE,nome TEXT,descricao TEXT,categoria TEXT,categoria_id INTEGER,area_id INTEGER,classe_requisito TEXT,carga_horaria INTEGER,carga_horaria_inicial INTEGER,carga_horaria_recorrente INTEGER,validade INTEGER,vencimento_fim_mes INTEGER,ativo INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
        CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY AUTOINCREMENT,funcionario_id INTEGER,qualificacao_id INTEGER,qualificacao_codigo TEXT,tipo TEXT,categoria TEXT,categoria_id INTEGER,data_conclusao TEXT,data_vencimento TEXT,validade_meses INTEGER,observacoes TEXT,status TEXT,renovada INTEGER,carga_horaria INTEGER,numero_certificado TEXT,arquivo_url TEXT,origem_tipo TEXT CHECK(origem_tipo IS NULL OR origem_tipo IN ('LMS','PRESENCIAL','SIMULADOR','IMPORTADO_EDAPP','MANUAL')),lms_matricula_id INTEGER,empresa_id INTEGER,created_at TEXT,updated_at TEXT,deleted_at TEXT);
        CREATE TABLE audit_logs (user_id INTEGER,action TEXT,entity_type TEXT,entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT);
        CREATE UNIQUE INDEX uq ON qualificacoes_historico(funcionario_id,qualificacao_codigo,data_conclusao) WHERE deleted_at IS NULL;
        ''')
        models = [dict(codigo=code,nome=code,descricao='Curso importado',categoria_id=13,area_id=1,
                       carga_horaria_inicial=8,carga_horaria_recorrente=8,validade=None) for code in sorted(mod.NEW_CODES)]
        for code, model_id in [('BASE',1),('FDM-EAD',119),('FDM_TRIP',199),('SGSO',23)]:
            db.execute("INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,categoria_id,ativo,empresa_id) VALUES(?,?,?,'EAD',13,1,6)",(model_id,code,code))
        specs = [('INSERT_HISTORICAL_CYCLE',181),('INSERT_MISSING',180),('INSERT_AFTER_MODEL_CREATE',20),('CORRECT_DATE',69),('RECLASSIFY_FDM',18),('FIX_COMPLETION_STATUS',3)]
        selected = []
        for action, n in specs:
            for _ in range(n):
                fid = len(selected) + 1
                db.execute('INSERT INTO funcionarios(id,empresa_id) VALUES(?,6)',(fid,))
                if action == 'INSERT_AFTER_MODEL_CREATE':
                    model_id=None; code=models[fid%3]['codigo']
                elif action == 'RECLASSIFY_FDM':
                    model_id=199; code='FDM_TRIP'
                elif action == 'FIX_COMPLETION_STATUS':
                    model_id=23; code='SGSO'
                else:
                    model_id=1; code='BASE'
                source_date='2025-05-10'; old=None
                existing = action in {'CORRECT_DATE','RECLASSIFY_FDM','FIX_COMPLETION_STATUS'}
                if existing:
                    old_id=8000+fid
                    old_type=119 if action=='RECLASSIFY_FDM' else model_id
                    old_code='FDM-EAD' if action=='RECLASSIFY_FDM' else code
                    old_date='2025-05-11' if action=='CORRECT_DATE' else source_date
                    old={'id':old_id,'funcionario_id':fid,'qualificacao_id':old_type,'qualificacao_codigo':old_code,
                         'data_conclusao':old_date,'status':None,'origem_tipo':None,'lms_matricula_id':None,
                         'observacoes':'Observação original','numero_certificado':None,'arquivo_url':None,'renovacao_de':None}
                    db.execute('INSERT INTO qualificacoes_historico(id,funcionario_id,qualificacao_id,qualificacao_codigo,data_conclusao,status,observacoes,empresa_id) VALUES(?,?,?,?,?,?,?,6)',(old_id,fid,old_type,old_code,old_date,None,'Observação original'))
                op={'action':action,'completion_date':source_date,'source_row':fid+2,
                    'source_certificate_code':f'EAD{fid:05d}',
                    'source_certificate_url':f'https://example.invalid/certificate/{fid}',
                    'source_workload_minutes':480,
                    'observation_append':f'Treinamento realizado na plataforma anterior EAD Plataforma. Código do certificado: EAD{fid:05d}.',
                    'existing': {'expected_completion_date':old_date} if existing else None}
                selected.append({'op':op,'employee_id':fid,'model_id':model_id,'model_code':code,
                                 'type':{'nome':code,'categoria':'EAD','categoria_id':13},'old':old})
        self.assertEqual(len(selected),471)
        script=mod.compile_sql(selected,models)
        self.assertNotIn('UPDATE lms_',script)
        self.assertNotIn('INSERT INTO lms_',script)
        db.executescript(script)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0],474)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM qualificacoes_historico WHERE origem_tipo NOT IN ('MANUAL') AND origem_tipo IS NOT NULL").fetchone()[0],0)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM qualificacoes_historico').fetchone()[0],471)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM qualificacoes_historico WHERE data_vencimento IS NOT NULL').fetchone()[0],0)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM qualificacoes_historico WHERE observacoes LIKE 'Observação original%' ").fetchone()[0],90)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM qualificacoes_tipos WHERE codigo LIKE 'EAD_%' ").fetchone()[0],3)
        # Reapply must fail atomically on the first fail-closed guard.
        with self.assertRaises(sqlite3.OperationalError):
            db.executescript(script)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0],474)

if __name__ == '__main__':
    unittest.main(verbosity=2)