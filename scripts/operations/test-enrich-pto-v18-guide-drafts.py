#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

MODULE=Path(__file__).with_name('enrich-pto-v18-guide-drafts.py')
spec=importlib.util.spec_from_file_location('pto_enriched_guides',MODULE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fixture():
    items=[
        {'ordem':1,'codigo':'A139-NRM-01','nome':'Voo básico','perna_pf':'1 - PF A',
         'operational_validation':'PENDENTE'},
        {'ordem':2,'codigo':'A139-NRM-02','nome':'Subida','perna_pf':'2 - PF B',
         'operational_validation':'PENDENTE'}
    ]
    candidate={'status':'DRAFT_NOT_IMPORTABLE_NOT_PUBLISHED','sessions':[
        {'codigo':'A139-I-01/12','aeronave':'AW139','titulo':'Treinamento de revisão',
         'carga_pto':'2 horas','natureza_candidata':'INSTRUCAO',
         'technical_items':items}]}
    legacy={'AW139':[{'sessao':'A139-I-01/12','codigo':'A139-NRM-01',
      'manobra_procedimento':'Voo básico','cenario_instrutor':'Condição legada A',
      'padrao_esperado':'<script>alert(1)</script>','como_observar':'Observação',
      'foco_avaliacao':'Foco','referencia_tecnica':'SOP antigo'},
      {'sessao':'A139-I-02/12','codigo':'A139-NRM-02',
       'manobra_procedimento':'Subida','cenario_instrutor':'Procedimento B',
       'padrao_esperado':'Padrão','como_observar':'Observação B',
       'foco_avaliacao':'Foco B','referencia_tecnica':'Referência B'}], 'S76':[]}
    return candidate,legacy

class GuideReviewTests(unittest.TestCase):
    def test_extracts_exact_session_without_operational_approval(self):
        candidate,legacy=fixture()
        result=module.enrich(candidate,legacy)
        self.assertEqual(result['totals']['sessions'],1)
        self.assertEqual(result['totals']['technical_items'],2)
        self.assertEqual(result['totals']['exact_session_context_matches'],1)
        self.assertEqual(result['totals']['cross_session_context_matches'],1)
        self.assertTrue(all(row['operational_validation']=='PENDENTE'
                    for row in result['guides'][0]['items']))
        self.assertEqual(result['guides'][0]['status'],'REVIEW_ONLY_NOT_APPROVED')

    def test_conflicting_legacy_scenarios_fail_closed(self):
        candidate,legacy=fixture()
        legacy['AW139'].append({**legacy['AW139'][-1],
          'sessao':'A139-I-03/12','cenario_instrutor':'Cenário divergente'})
        result=module.enrich(candidate,legacy)
        self.assertEqual(result['totals']['items_requiring_context_review'],1)
        self.assertIsNone(result['guides'][0]['items'][1]['legacy_fields']['cenario_instrutor'])

    def test_code_alone_not_sufficient_to_copy_procedure(self):
        candidate,legacy=fixture()
        legacy['AW139'][0]['manobra_procedimento']='Manobra distinta'
        result=module.enrich(candidate,legacy)
        self.assertEqual(result['totals']['items_requiring_context_review'],1)
        self.assertEqual(result['guides'][0]['items'][0]['provenance'],'PENDING_SOURCE_REVIEW')

    def test_html_escapes_source_and_shows_15_notechs(self):
        candidate,legacy=fixture()
        guide=module.enrich(candidate,legacy)['guides'][0]
        notechs=[{'codigo':f'NTS-{x}','elemento':f'Elemento {x}',
                  'categoria':'CRM','evidencia':'Conferir PTO'} for x in range(15)]
        output=module.guide_html(guide,notechs)
        self.assertNotIn('<script>',output)
        self.assertIn('&lt;script&gt;',output)
        self.assertIn('NÃO UTILIZAR EM INSTRUÇÃO OU CHECK',output)
        self.assertEqual(output.count('<tr><td>NTS-'),15)

    def test_wrong_source_status_is_rejected(self):
        candidate,legacy=fixture()
        candidate['status']='APPROVED'
        with self.assertRaisesRegex(ValueError,'não publicável'):
            module.enrich(candidate,legacy)

if __name__=='__main__':
    unittest.main()
