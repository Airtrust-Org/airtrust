# FINAL_GATE_REPORT

- HEAD: 56241da2f70553767dc36bcb01d97c326bc6998c
- Branch: codex/simuladores-composicao-curricular-sonnet-20260713
- Base: 9aa1984d5a0007cb9aa60943cdc3064e4bdb4b01
- Veredito: PRONTO_PARA_PR

## Gates

- G1 matriz íntegra: PASS
- G2 overlay íntegro: PASS
- G3 escopo correto: PASS
- G4 tenant seguro: PASS
- G5 aeronave correta: PASS
- G6 nomes e descrições: PASS
- G7 durações: PASS
- G8 quantidade de itens: PASS
- G9 ordem: PASS
- G10 sessões OPS-NOT-X1: PASS
- G11 diferenciação pedagógica: PASS
- G12 sessões bloqueadas: PASS
- G13 histórico: PASS
- G14 frontend com banco aplicado: PASS
- G15 typecheck: PASS
- G16 diff limpo: PASS
- G17 tenant 8: PASS
- G18 CRED-EXA: PASS
- G19 nenhum banco remoto: PASS
- G20 nenhum PTO ou gerador/template PDF alterado: PASS

## Evidências

- G1-G13, G17-G18: `COMPOSITION_VALIDATION_REPORT.md`, `COMPOSITION_VALIDATION_EVIDENCE.json`, `MULTITENANT_AND_HISTORY_EVIDENCE.json`
- G14: `FRONTEND_VALIDATION_REPORT_V2.md`, `FRONTEND_VALIDATION_EVIDENCE.json`
- G15: `TYPECHECK_DIFF_REPORT.md`
- G16: `git diff --check` sem saída; diff contra a base restrito a scripts/docs da composição e hotfix local de compatibilidade/frontend
- G19: `run-curriculum-sonnet-20260713-local.mjs` executado em banco local (`curriculum_work.sqlite`), sem uso de banco remoto
- G20: diff contra a base não toca PTO nem arquivos de produção em `worker-airtrust/src/services/pdf-generator.ts`, `worker-airtrust/src/services/pdf-ficha.service.ts`, `worker-airtrust/src/services/html-to-pdf.ts` ou templates de PDF; validação visual de PDF permanece DEFERIDA por instrução

## Confirmações específicas

- S76-NOT-01: 18 itens, contém `S76-LOFT-33`, não contém `OPS-NOT-X1`
- S76-NOT-02: 18 itens, contém `S76-LOFT-33`, não contém `OPS-NOT-X1`
- SK76-S-01/02: 18 itens, contém `S76-ILS-00`, não contém `OPS-NOT-X1`
- Preservadas sem alteração: `A139-I-03/12`, `A139-I-12/12`, `A139-P-04/04-CHECK`, `TRE-INST`, `EXA-01/02`, `EXA-02/02`, `PILOT-MODELO-001`

## Observações

- O frontend local passou a responder sem `4xx/5xx` nas rotas validadas da composição. Os `console_errors` remanescentes em `FRONTEND_VALIDATION_EVIDENCE.json` são abortos de fetch da tela intermediária `/funcionarios` durante a navegação automática e não alteram a composição curricular exibida.
- A validação visual/auditória completa de PDF não foi reaberta. Status formal: DEFERIDA.
