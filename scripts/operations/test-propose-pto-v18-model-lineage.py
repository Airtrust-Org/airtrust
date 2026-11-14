#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

FILE=Path(__file__).with_name('propose-pto-v18-model-lineage.py')
spec=importlib.util.spec_from_file_location('pto_lineage',FILE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fixture():
    contract=[{'codigo':'A139-I-01/12','aeronave':'AW139'}]
    contract.extend({'codigo':f'S76-I-{i:02}/12','aeronave':'S76'} for i in range(1,13))
    contract.extend({'codigo':f'A139-RQ-{i:02}/99','aeronave':'AW139'} for i in range(1,70))
    assert len(contract)==82
    models=[{'id':2,'codigo':'A139-I-01/12@V2','codigo_corrente':'A139-I-01/12','versao':2},
      {'id':1,'codigo':'A139-I-01/12','codigo_corrente':'A139-I-01/12','versao':0}]
    models.extend({'id':30+i,'codigo':f'SK76-I-{i:02}/12@V1',
                   'codigo_corrente':f'SK76-I-{i:02}/12','versao':1} for i in range(1,13))
    return contract,models

class LineageTests(unittest.TestCase):
    def test_versions_and_aliases_not_automatically_applied(self):
        result=module.classify(*fixture())
        self.assertEqual(result['totals'],{
            'pto_sessions':82,'exact_code_matches':1,
            'syntactic_sk76_aliases':12,'unresolved_lineage':69})
        rows=result['sessions']
        self.assertEqual(rows[0]['model_candidates'][0]['id'],2)
        self.assertTrue(all(x['manual_approval_required'] and not x['safe_to_auto_retire_or_merge'] for x in rows))
    def test_only_explicit_sk76_initial_alias_is_proposed(self):
        self.assertEqual(module.safe_candidate_alias('S76-I-03/12'),'SK76-I-03/12')
        self.assertIsNone(module.safe_candidate_alias('S76-P-01/03-C1'))
        self.assertIsNone(module.safe_candidate_alias('A139-I-01/12'))
    def test_rejects_incomplete_contract(self):
        with self.assertRaisesRegex(ValueError,'82'):
            module.classify([],[])
    def test_rejects_duplicate_codes(self):
        contracts,models=fixture()
        contracts[-1]=dict(contracts[0])
        with self.assertRaisesRegex(ValueError,'duplicado'):
            module.classify(contracts,models)

if __name__=='__main__':
    unittest.main()
