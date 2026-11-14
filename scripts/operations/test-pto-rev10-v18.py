#!/usr/bin/env python3
"""Contract tests for PTO Rev10 V18 read-only parity audit."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('audit-pto-rev10-v18.py')
spec = importlib.util.spec_from_file_location('pto_v18_audit', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ParityContractTests(unittest.TestCase):
    def test_duration_practice_is_compatible_with_total_check(self):
        self.assertTrue(module.duration_equivalent('2 horas práticas em FFS',
            '4 horas por tripulação: 1 hora de exame oral individual, 30 min de briefing, 2 horas práticas em FFS e 30 min de debriefing'))
        self.assertFalse(module.duration_equivalent('2 horas','3 horas'))

    def test_missing_session_and_guide_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            aw=root/'aw'; s76=root/'s76'
            for d in [aw,s76]:
                d.mkdir()
                (d/'html').mkdir()
                (d/'sessoes.json').write_text('[]')
                (d/'matriz_tecnica.json').write_text('[]')
            pto={'A139-I-01/12':{'codigo':'A139-I-01/12','titulo':'VFR',
                'carga':'2 horas','itens':[{'ordem':i,'perna':'1 - PF A','codigo':f'PRE-{i}','nome':f'Procedimento {i}'} for i in range(1,19)]}}
            issues=module.compare(pto,{'AW139':aw,'S76':s76})
            self.assertEqual([i['kind'] for i in issues],['SESSION_MISSING','GUIDE_MISSING'])

    def test_changed_technical_code_and_guide_detected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            aw=root/'aw';s76=root/'s76'
            for d in [aw,s76]:
                d.mkdir();(d/'html').mkdir()
                (d/'sessoes.json').write_text('[]');(d/'matriz_tecnica.json').write_text('[]')
            code='A139-I-01/12'
            pto={code:{'codigo':code,'titulo':'VFR','carga':'2 horas','itens':[
                {'ordem':i,'perna':'1 - PF A','codigo':f'PRE-{i}','nome':f'Procedimento {i}'} for i in range(1,19)]}}
            (aw/'sessoes.json').write_text(json.dumps([{'sessao':code,'titulo':'VFR','carga_sessao':'2 horas'}]))
            (aw/'matriz_tecnica.json').write_text(json.dumps([
                {'sessao':code,'ordem':str(i),'perna_pf':'1 - PF A','codigo':f'PRE-{i}' if i!=7 else 'OLD-7',
                 'manobra_procedimento':f'Procedimento {i}'} for i in range(1,19)]))
            (aw/'html'/'Guia_Instrutor_AW139_A139-I-01_12.html').write_text(
                ' '.join(f'PRE-{i}' for i in range(1,19) if i!=7))
            issues=module.compare(pto,{'AW139':aw,'S76':s76})
            self.assertEqual(sorted(i['kind'] for i in issues),
                             ['CODIGO','GUIDE_EVENT_MISSING'])

if __name__=='__main__':
    unittest.main()
