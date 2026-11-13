#!/usr/bin/env python3
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT=Path(__file__).with_name('audit-pto-v18-production-snapshot.py')
spec=importlib.util.spec_from_file_location('pto_v18_production', SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ProductionSnapshotTests(unittest.TestCase):
    def _export(self, path, changed=False, written=0):
        path.write_text(json.dumps([{'results':[{'id':1}],'success':True,
            'meta':{'changed_db':changed,'rows_written':written}}]))

    def test_readonly_evidence_required(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'data.json'
            self._export(p)
            self.assertEqual(len(module.load_readonly_export(p)),1)
            self._export(p,changed=True)
            with self.assertRaisesRegex(ValueError,'exclusivamente de leitura'):
                module.load_readonly_export(p)
            self._export(p,written=1)
            with self.assertRaisesRegex(ValueError,'exclusivamente de leitura'):
                module.load_readonly_export(p)

    def test_real_version_is_selected_over_legacy(self):
        code='A139-I-01/12'
        items=[{'ordem':i,'codigo':f'MAN-{i}','nome':f'Evento {i}'} for i in range(1,19)]
        pto={code:{'itens':items}}
        models=[
            {'id':1,'codigo':code,'codigo_corrente':code,'versao':0},
            {'id':2,'codigo':code+'@M2026.07-V2','codigo_corrente':code,'versao':2},
        ]
        links=[{'modelo_id':1,'ordem':i,'manobra_codigo':'LEGACY',
                'manobra_nome':'Outra atividade'} for i in range(1,19)]
        links += [{'modelo_id':2,'ordem':i,'manobra_codigo':f'MAN-{i}',
                   'manobra_nome':f'Evento {i}'} for i in range(1,19)]
        guides=[{'modelo_id':2,'guia_codigo':code,'guia_status':'ATIVO','html_status':'VALIDO'}]
        r=module.compare(pto,models,links,guides)
        self.assertEqual(r['counts']['status_counts'],{'TECHNICAL_MATCH':1})
        self.assertEqual(r['per_session'][0]['current_candidate']['modelo_id'],2)
        self.assertEqual(r['counts']['matched_models_with_guide'],1)

    def test_mismatching_code_is_not_treated_as_equivalent(self):
        code='S76-I-01/12'
        pto={code:{'itens':[{'ordem':1,'codigo':'S76-PRE-001','nome':'Preflight'}]}}
        models=[{'id':1,'codigo':'SK76-I-01/12','codigo_corrente':'SK76-I-01/12','versao':2}]
        out=module.compare(pto,models,[],[])
        self.assertEqual(out['counts']['status_counts'],{'NO_CANONICAL_CODE_MATCH':1})

if __name__=='__main__':
    unittest.main()
