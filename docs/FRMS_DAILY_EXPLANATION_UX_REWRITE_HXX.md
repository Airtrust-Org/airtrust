# FRMS Daily Explanation UX Rewrite (HXX)

## 1) HEAD inicial/final
- HEAD inicial da branch de trabalho: `86b837ec2fc87186c7dce9e75de3bb0da7b04c25`
- HEAD final antes do commit desta fase: `86b837ec2fc87186c7dce9e75de3bb0da7b04c25` + alterações locais listadas abaixo

## 2) Arquivos alterados
- `src/react-app/pages/frms/components/FrmsDayExplanationPanel.tsx`
- `src/react-app/pages/frms/__tests__/FrmsDayExplanationPanel.test.tsx`

## 3) Diagnóstico da redundância anterior
- A explicação diária misturava resultado, orientação, limitações e trace técnico em blocos redundantes.
- O índice final era repetido em excesso em partes da leitura principal.
- Impactos em pp apareciam sem sempre conectar de forma direta com dado bruto disponível no payload.

## 4) Nova estrutura de explicação
- Cabeçalho curto com contexto operacional e índice principal.
- Bloco único "Como chegamos ao índice" em tabela com 4 colunas:
  - Componente
  - Dado usado
  - Como entrou no cálculo
  - Impacto
- Bloco "O que mais pesou" com maior impacto operacional observado.
- Bloco "O que verificar antes de agir" com checklist objetivo.
- Bloco único de limitações/guardrails (sem duplicação em múltiplos cards).
- "Trace técnico" mantido em `<details>` colapsável e secundário.

## 5) Campos de dados usados na explicação
- `jornada.effectiveness_pct`
- `diagnostico.fatores[].codigo`
- `diagnostico.fatores[].titulo`
- `diagnostico.fatores[].impacto_pct`
- `diagnostico.fatores[].resumo`
- `jornada.hora_apresentacao`
- `jornada.hora_acordou`
- `jornada.hora_despertar_estimada`
- `jornada.duracao_sono_efetiva_min`
- `jornada.dia_periodo_embarcado`
- `jornada.total_dias_periodo`
- `jornada.tempo_abaixo_limiar_min`
- `jornada.dias_criticos_consecutivos`
- `timelineRow.fator_basica_pct`
- `trace.inputs.priorDaysWindow`
- `trace.sourceFlags.*`

## 6) Campos ausentes (não inventados)
- Horas brutas consolidadas de voo (especialmente 7d/28d/mês) não estão sempre disponíveis diretamente no payload usado pelo painel.
- Quando ausentes, a UI exibe fallback explícito: "dado bruto não disponível neste payload".

## 7) Confirmação de não alteração de fórmula/backend/thresholds
- Nenhuma alteração em worker/backend, fórmulas FRMS, thresholds, banco, migrações, seeds ou rotas operacionais.
- Mudança restrita a frontend/copy/estrutura de apresentação e testes do painel.

## 8) Validações executadas e resultados
- `npm ci` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx vitest run src/react-app/pages/frms/__tests__` ✅ (9 arquivos, 94 testes)
- `git diff --check` ✅

## 9) Riscos residuais
- Qualidade explicativa de "acúmulo de horas" continua limitada pela disponibilidade real do dado bruto no payload atual.
- Sem novos campos no endpoint, parte da narrativa permanece com fallback explícito.

## 10) Próximo passo recomendado
- Expor no payload do dia os acumulados de voo por janela (7d/28d/mês/365d, quando aplicável) já calculados no backend, apenas para leitura, sem recalcular no frontend.
