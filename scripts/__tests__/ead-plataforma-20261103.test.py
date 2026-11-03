#!/usr/bin/env python3
"""Non-personal, deterministic guards for the EAD Plataforma governed candidate."""
import datetime
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

PATH = Path(__file__).resolve().parents[1] / 'production' / 'ead-plataforma-20261103.py'
SPEC = importlib.util.spec_from_file_location('ead_platform_reconcile', PATH)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class GuardTests(unittest.TestCase):
    def test_source_hash_is_required(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'not-the-approved-plan.json'
            p.write_text('{"operations":[]}', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'APPROVED_PROJECTION_HASH_MISMATCH'):
                MOD.load_plan(p)

    def test_date_is_completion_only(self):
        self.assertEqual(MOD.date_only('2025-05-11'), '2025-05-11')
        with self.assertRaises(ValueError):
            MOD.date_only('2025-05-11T12:00:00Z')
        with self.assertRaises(ValueError):
            MOD.date_only('2040-01-01')

    def test_unicode_normalization(self):
        self.assertEqual(MOD.normalize_name(' Ana da Silva '), 'ANA DA SILVA')
        self.assertEqual(MOD.normalize_name('João  Oliveira'), 'JOAO OLIVEIRA')

    def test_failed_cas_guard_raises_sql_error(self):
        db = sqlite3.connect(':memory:')
        self.assertEqual(db.execute(MOD.guard('1=1')).fetchone()[0], 1)
        with self.assertRaises(sqlite3.OperationalError):
            db.execute(MOD.guard('1=0'))

    def test_provenance_appends_without_erasing_notes(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE q (observacoes TEXT)')
        db.execute('INSERT INTO q VALUES (?)', ('Nota histórica preservada.',))
        note='Treinamento realizado na plataforma anterior EAD Plataforma. Código do certificado: DEMO123.'
        db.execute('UPDATE q SET observacoes='+MOD.note_append_sql('observacoes',note))
        db.execute('UPDATE q SET observacoes='+MOD.note_append_sql('observacoes',note))
        result=db.execute('SELECT observacoes FROM q').fetchone()[0]
        self.assertTrue(result.startswith('Nota histórica preservada.'))
        self.assertEqual(result.count(note),1)

    def test_compilation_is_only_histories_types_and_audit(self):
        op={'action':'INSERT_MISSING','source_row':1,
            'completion_date':'2025-06-01','source_certificate_code':'DEMO123',
            'source_certificate_url':'https://voecostadosol.eadplataforma.app/certificate/view/DEMO123/2025-06-01',
            'source_workload_minutes':120,
            'observation_append':'Treinamento realizado na plataforma anterior EAD Plataforma. Código do certificado: DEMO123.'}
        model={'id':174,'codigo':'NR-26','nome':'NR-26','categoria':'EAD','categoria_id':13}
        selected=[{'op':op,'employee_id':88,'model_id':174,'model_code':'NR-26',
                   'old':None,'type':model}]
        new_models=[{'codigo':'EAD_AGENTE_RAMPA','nome':'Agente de Atendimento e Rampa',
                     'descricao':'Modelo EAD'}]
        sql=MOD.compile_sql(selected,new_models)
        self.assertIn('INSERT INTO qualificacoes_historico',sql)
        self.assertIn('INSERT INTO qualificacoes_tipos',sql)
        self.assertIn('INSERT INTO audit_logs',sql)
        self.assertNotIn('INSERT INTO lms_',sql)
        self.assertNotIn('UPDATE lms_',sql)
        self.assertIn('NULL,NULL',sql)
        self.assertIn('CAS_GUARD_FAILED',sql)


if __name__ == '__main__':
    unittest.main(verbosity=2)
