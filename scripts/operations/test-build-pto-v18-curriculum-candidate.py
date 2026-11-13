#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

FILE=Path(__file__).with_name('build-pto-v18-curriculum-candidate.py')
spec=importlib.util.spec_from_file_location('pto_v18_candidate',FILE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA='040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912'

def fixture():
    sessions=[]; rows=[]; reconciled=[]
    for aircraft,count,prefix in [('AW139',37,'A139'),('S76',45,'S76')]:
        for index in range(count):
            code=f'{prefix}-I-{index+1:02}/99'
            items=[]
            for ordinal in range(1,19):
                man=f'{prefix}-MAN-{ordinal}'
                name=f'Procedimento {ordinal}'
                perna='1 - PF A' if ordinal<=9 else '2 - PF B'
                row={'sessao':code,'aeronave':aircraft,'ordem':ordinal,'codigo':man,
                     'nome':name,'perna':perna}
                items.append({'ordem':ordinal,'codigo':man,'nome':name,'perna':perna})
                rows.append(row)
                reconciled.append({'sessao':code,'ordem':ordinal,'codigo':man,
                  'manobra_procedimento':name,'perna_pf':perna,
                  'reconciliation_status':'EXACT_CATALOG_CODE_AND_NAME',
                  'legacy_reference_metadata':{'categoria':'PROCEDIMENTO'}})
            sessions.append({'codigo':code,'aeronave':aircraft,'titulo':'Treino',
              'programa':'Inicial','carga':'2 horas','itens':items})
    notechs=[{'codigo':f'NTS-{i}'} for i in range(15)]
    codes=['INST-E01','INST-E02','EXA-01/04','EXA-02/04','EXA-03/04','EXA-04/04']
    functional={'codigos_canonicos':[{'codigo':f'FUNC-{i}'} for i in range(94)],
        'relacoes_por_sessao':[{'sessao':code,'ordem':i} for code in codes for i in range(1,19)]}
    return sessions,rows,notechs,{'all_items':reconciled},functional

class CandidateTest(unittest.TestCase):
    def test_builds_88_models_without_claiming_approval(self):
        result=module.build(*fixture(),SHA)
        self.assertEqual(result['status'],'DRAFT_NOT_IMPORTABLE_NOT_PUBLISHED')
        t=result['totals']
        self.assertEqual((t['aircraft_sessions'],t['total_models'],t['total_technical_links'],t['notechs_links']),
                         (82,88,1584,1230))
        self.assertEqual(t['unresolved_technical_positions'],0)
        self.assertTrue(all(item['operational_validation']=='PENDENTE'
                            for s in result['sessions'] for item in s['technical_items']))
    def test_rejects_ambiguous_catalog_resolution(self):
        items=fixture()
        items[3]['all_items'][0]['codigo']='DIFFERENT'
        with self.assertRaisesRegex(ValueError,'reconciliação distinta'):
            module.build(*items,SHA)
    def test_no_missing_positions(self):
        items=fixture()
        items[1].pop()
        with self.assertRaisesRegex(ValueError,'1476 eventos'):
            module.build(*items,SHA)
    def test_unapproved_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'PTO diferente'):
            module.build(*fixture(),'bad')
    def test_classifies_s76_additional_as_conditional(self):
        s={'codigo':'S76-P-AD-01/01-C1','aeronave':'S76','titulo':'Treino',
           'programa':'Periódico','carga':'3 horas'}
        c=module.classify(s)
        self.assertTrue(c['condicional'])
        self.assertEqual(c['minutos_pratica_ffs'],180)

if __name__=='__main__':
    unittest.main()
