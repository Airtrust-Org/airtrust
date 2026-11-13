#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

file=Path(__file__).with_name('reconcile-pto-v18-technical-catalog.py')
spec=importlib.util.spec_from_file_location('reconcile_pto',file)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReconcileTests(unittest.TestCase):
    def test_different_code_or_name_is_not_falsely_reused(self):
        rows=[{'aeronave':'AW139','sessao':'A139-I-01/12','ordem':i,
               'perna':'1 - PF A','codigo':'MAN-001','nome':'Procedimento A'} for i in range(1476)]
        rows[0]['codigo']='MAN-002'
        rows[1]['nome']='Procedimento diferente'
        old=[{'codigo':'MAN-001','descricao_canonica':'Procedimento A',
              'categoria':'Normal','fonte_principal':'SOP controlado'}]
        result=module.reconcile(rows,{'AW139':old,'S76':[]})
        self.assertEqual(result['totals']['technical_links'],1476)
        self.assertEqual(result['totals']['exact_prior_catalog_matches'],1474)
        self.assertEqual(result['totals']['technical_links_requiring_review'],2)
        self.assertEqual(result['totals']['distinct_maneuver_codes_requiring_review'],2)
        self.assertEqual(result['status'],'DRAFT_NOT_APPROVED_NOT_IMPORTABLE')
        self.assertTrue(all(x['operational_validation']=='PENDENTE' for x in result['all_items']))

    def test_fails_on_short_contract(self):
        with self.assertRaisesRegex(ValueError,'1476'):
            module.reconcile([],{'AW139':[],'S76':[]})

    def test_fails_on_duplicate_catalog_code(self):
        rows=[{'aeronave':'AW139','sessao':'S','ordem':i,
               'perna':'1 - PF A','codigo':'X','nome':'X'} for i in range(1476)]
        with self.assertRaisesRegex(ValueError,'duplicado'):
            module.reconcile(rows,{'AW139':[
                {'codigo':'X','descricao_canonica':'X'},
                {'codigo':'X','descricao_canonica':'X'}], 'S76':[]})

if __name__=='__main__':
    unittest.main()
