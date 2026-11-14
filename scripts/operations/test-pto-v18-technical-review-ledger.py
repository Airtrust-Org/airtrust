#!/usr/bin/env python3
import importlib.util
import unittest
from pathlib import Path

BASE=Path(__file__).parent
def load(stem):
    path=BASE/(stem+'.py')
    spec=importlib.util.spec_from_file_location(stem.replace('-','_'),path)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
builder=load('build-pto-v18-technical-review-ledger')
auditor=load('audit-pto-v18-technical-review-ledger')
fixtures=load('test-build-pto-v18-curriculum-candidate')
candidate_module=load('build-pto-v18-curriculum-candidate')

def setup():
    candidate=candidate_module.build(*fixtures.fixture(),
        builder.APPROVED_SHA)
    guides=[]
    for s in candidate['sessions']:
        guides.append({'sessao':s,'items':[
            {**i,'provenance':'PENDING_SOURCE_REVIEW','legacy_fields':{},
             'operational_validation':'PENDENTE'}
             for i in s['technical_items']
        ]})
    return candidate,{'guides':guides}

class ReviewGateTests(unittest.TestCase):
    def test_register_starts_as_pending_for_all_1476_and_82(self):
        c,e=setup()
        rows,guides,status=builder.build_ledger(c,e)
        self.assertEqual(len(rows),1476)
        self.assertEqual(len(guides),82)
        self.assertEqual(status['reviewed_positions'],0)
        self.assertEqual(status['approved_guides'],0)
        result=auditor.audit_rows(rows,guides,c)
        self.assertEqual(result['status'],'NO_GO_REVISAO_PENDENTE')
        self.assertEqual(result['posicoes_pendentes'],1476)
        self.assertEqual(result['guias_pendentes'],82)

    def test_rejects_fake_validated_without_manual_evidence(self):
        c,e=setup()
        rows,guides,_=builder.build_ledger(c,e)
        rows[0]['resultado_revisao']='VALIDADO'
        guides[0]['status']='VALIDADO'
        result=auditor.audit_rows(rows,guides,c)
        self.assertEqual(result['posicoes_pendentes'],1476)
        self.assertEqual(result['guias_pendentes'],82)

    def test_documentary_check_cannot_create_approval_artifact(self):
        c,e=setup()
        rows,guides,_=builder.build_ledger(c,e)
        for row in rows:
            row.update({
                'manual_controlado':'SOP','revisao_manual':'Rev. controlada',
                'referencia_secao':'Seção comprovada','revisor_tecnico':'Revisor autorizado',
                'data_revisao':'2026-11-12','evidencia_revisao':'Evidência real',
                'resultado_revisao':'VALIDADO'
            })
        for row in guides:
            row.update({
                **{k:'SIM' for k in auditor.GUIDE_REQUIREMENTS},
                'status':'VALIDADO','responsavel_tecnico':'Revisor autorizado',
                'data_aceite':'2026-11-12','evidencia_aceite':'Evidência real',
            })
        result=auditor.audit_rows(rows,guides,c)
        self.assertEqual(result['posicoes_pendentes'],0)
        self.assertEqual(result['guias_pendentes'],0)
        self.assertIn('NAO_EQUIVALE_A_ACEITE_FINAL',result['status'])
        self.assertNotIn('VALIDADO_PARA_PRODUCAO',str(result))

    def test_functional_register_is_never_implicitly_approved(self):
        catalog={
          'codigos_canonicos':[{'codigo':f'F-{n}'} for n in range(94)],
          'relacoes_por_sessao':[
            {'sessao':session,'ordem':ordem,'codigo':f'F-{ordem}',
             'atividade':f'Atividade {ordem}'}
            for session in ('INST-E01','INST-E02','EXA-01/04','EXA-02/04','EXA-03/04','EXA-04/04')
            for ordem in range(1,19)
          ],
        }
        rows,guides=builder.build_functional_ledger(catalog)
        self.assertEqual(len(rows),108)
        self.assertEqual(len(guides),6)
        self.assertEqual(auditor.audit_functional_rows(rows,guides,catalog),{
          'functional_positions':108,'functional_positions_pending':108,
          'functional_guides':6,'functional_guides_pending':6,
          'functional_notechs_links':90,
        })

    def test_functional_instructor_examiner_counts_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'94 códigos'):
            builder.build_functional_ledger({'codigos_canonicos':[], 'relacoes_por_sessao':[]})

    def test_rejects_manipulated_code(self):
        c,e=setup()
        rows,guides,_=builder.build_ledger(c,e)
        rows[0]['codigo']='PROCEDIMENTO-NAO-PTO'
        with self.assertRaisesRegex(ValueError,'posição alterada'):
            auditor.audit_rows(rows,guides,c)

    def test_rejects_duplicate_guide(self):
        c,e=setup()
        rows,guides,_=builder.build_ledger(c,e)
        guides[-1]['sessao']=guides[0]['sessao']
        with self.assertRaisesRegex(ValueError,'guia repetido'):
            auditor.audit_rows(rows,guides,c)

if __name__=='__main__':
    unittest.main()
