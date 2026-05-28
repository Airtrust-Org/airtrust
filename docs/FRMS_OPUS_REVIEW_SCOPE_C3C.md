# FRMS C3-C — Escopo de Revisao Futura com Opus

## Quando usar Opus

Usar Opus apenas em fase de revisao cientifica aprofundada, apos consolidacao da documentacao C3-C e antes de alteracoes estruturais de formula/arquitetura de risco.

## Decisoes que Opus deve revisar

1. Revisao completa de `calcEffectiveness` (validade conceitual, limites e interpretacao operacional).
2. Revisao cientifica de pesos e thresholds do score diario.
3. Desenho do indicador acumulado de quinzena para operacao offshore.
4. Criterios minimos para alertas persistentes antes da Fase D.
5. Decisao de produto/ciencia: alcool, medicacao e sintomas como score, alerta ou gating.
6. Calibracao de risco offshore com variaveis operacionais acumuladas.

## Arquivos-base para enviar na revisao Opus

- `worker-airtrust/src/lib/frms/calculos.ts`
- `worker-airtrust/src/lib/frms/fadiga-score.ts`
- `worker-airtrust/src/lib/frms/fadiga-frms-sync.ts`
- `worker-airtrust/src/lib/frms/operational-snapshot.ts`
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/src/routes/frms-fira.ts`
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
- `worker-airtrust/src/routes/frms-fadiga-checkin.schema.ts`
- `src/react-app/pages/frms/FrmsCheckinFadiga.tsx`
- `src/react-app/pages/frms/components/FrmsHeatmap.tsx`
- `src/react-app/pages/frms/components/FrmsEffectivenessPanel.tsx`
- `src/react-app/pages/frms/FrmsControleOperacional.tsx`
- `worker-airtrust/src/__tests__/frms/fadiga-score.v2.test.ts`
- `worker-airtrust/src/__tests__/frms/fadiga-frms-sync.test.ts`
- `worker-airtrust/src/__tests__/frms/calculos-alertas.test.ts`
- `docs/FRMS_SCIENTIFIC_LIMITATIONS_AND_INTERPRETATION_C3C.md`
- `docs/FRMS_NOMENCLATURE_AND_UI_LABELS_C3C.md`

## Perguntas que Opus deve responder

1. O proxy de efetividade atual esta corretamente delimitado como proxy e tecnicamente coerente?
2. Quais pesos e thresholds do score diario devem ser recalibrados, com qual metodo e com quais dados?
3. Qual o desenho minimo viavel do indicador acumulado de quinzena offshore?
4. Quais criterios cientificos e operacionais devem habilitar alertas persistentes?
5. Alcool/medicacao/sintomas devem influenciar score, alerta, gating ou combinacao?
6. Quais variaveis offshore (setores, sit periods, sequencias cedo, repouso) entram primeiro e por quê?

## O que NAO usar Opus para esta fase

- Documentacao simples.
- Ajuste de labels e copy.
- Packaging de arquivos.
- Ajustes de UI sem impacto cientifico.
- Fluxo de commit/push/deploy.
