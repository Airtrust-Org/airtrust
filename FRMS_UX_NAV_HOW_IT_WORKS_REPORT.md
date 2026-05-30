# FRMS UX/Nav + How It Works Report

## 1) Ferramenta/modelo
- Ferramenta: Codex
- Modelo: GPT-5.3 (high intelligence)
- Modo de execução: ajuste frontend/copy com auditoria de coerência contra código

## 2) Worktree/branch
- Worktree: `/tmp/airtrust-frms-ux-nav-how-it-works`
- Branch: `fix/frms-ux-nav-how-it-works`
- Repositório base: `origin/main`

## 3) HEAD/origin
- `HEAD`: `fa761c528c399c40fb9c5cd7ea2f75ec1e2101c9`
- `origin/main`: `fa761c528c399c40fb9c5cd7ea2f75ec1e2101c9`
- Divergência inicial: `0 ahead / 0 behind`

## 4) Arquivos alterados
- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/FrmsConceitos.tsx`
- `src/react-app/pages/frms/__tests__/FrmsConceitos.test.tsx`
- `src/react-app/hooks/useFrms.ts`
- `src/react-app/pages/frms/components/FrmsEffectivenessPanel.tsx`
- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/pages/frms/FrmsConfiguracoes.tsx`
- `src/react-app/pages/frms/frmsUtils.ts`
- `src/react-app/pages/frms/FrmsFadigaPainel.tsx`

## 5) Auditoria de coerência contra o código

### 5.1 Janelas regulatórias
Achado no código:
- Rolling implementa: HV diária (24h), 7d, 28d, mês calendário e 365d.
- Evidências:
  - `worker-airtrust/src/lib/frms/calculos.ts` (`calcAcumuloRolling`): `pct_limite_dia`, `pct_limite_7d`, `pct_limite_28d`, `pct_limite_mes_calendario`, `pct_limite_365d`
  - `worker-airtrust/src/lib/frms/db-service-acumulo.ts`: visão mensal usa mês calendário + 7d; visão rolling usa também 28d/365d/dia

Ajuste de copy aplicado:
- Página “Como funciona” atualizada para citar janelas reais sem misturar mês e 28d como sinônimos.

### 5.2 Compliance: o que é calculado e o que alimenta UI
Achado no código:
- Compliance é consumo percentual de limite (HV acumuladas / limite da janela).
- Heatmap de compliance usa pior janela entre DIA, 7D e 28D por célula diária.
- Evidência:
  - `worker-airtrust/src/routes/frms-fira.ts` (`/heatmap`): seleção por `max(pctDia, pct7d, pct28d)` com prioridade para janela longa em empate.

Ajuste de copy aplicado:
- Seção de compliance reescrita para explicar:
  - fórmula de consumo;
  - pior percentual no heatmap (dia/7d/28d);
  - demais visões com mês calendário e 365d.

### 5.3 Effectiveness: fórmula real e fatores
Achado no código:
- Fórmula base:
  - `effectiveness = max(0, min(100, 100 + totalCalibrado * 100))`
- `totalCalibrado` inclui:
  - `total_fatorizado_jornada`
  - ajustes de repouso/sono
  - ajuste de apresentação/WOCL
  - ajuste basal circadiano
  - fator progressivo do período embarcado
- Evidência:
  - `worker-airtrust/src/lib/frms/calculos.ts` (`calcEffectiveness`)

Ajuste de copy aplicado:
- Fórmula apresentada como forma simplificada fiel ao código atual.
- Linguagem de proxy local mantida (sem claim científico/diagnóstico/automação decisória).

### 5.4 fator_basica_pct
Achado no código:
- `fator_basica_pct` não entra em `total_fatorizado_jornada` (comentário explícito no código).
- Pode existir ajuste basal circadiano na etapa calibrada de effectiveness.
- Evidência:
  - `worker-airtrust/src/lib/frms/calculos.ts` (`calcFatorizacao` + `calcEffectiveness`)

Ajuste de copy aplicado:
- Texto atualizado para “contexto basal” e ajuste circadiano, sem afirmar impacto direto simplista em pp.

### 5.5 UTC
Achado no código:
- Há uso de UTC em partes do pipeline e integrações.
- Há também uso de datas locais/operacionais em cálculos e visualização frontend.
- Evidências:
  - UTC: `worker-airtrust/src/services/sigvoos-frms.ts`, `worker-airtrust/src/cron/scheduled-handler.ts`
  - Local/operacional: `src/react-app/pages/frms/frmsUtils.ts` (`toDateKeyLocal`, ranges locais) e trechos de cálculo com `new Date(...)` sem normalização UTC estrita.

Ajuste de copy aplicado:
- Removida afirmação absoluta “sempre UTC”; substituída por texto contextual correto.

### 5.6 KSS
Achado no código:
- KSS existe no fluxo de check-in e snapshot operacional.
- KSS não entra na fórmula atual de effectiveness.
- Evidências:
  - Presença: `src/react-app/pages/frms/FrmsCheckinFadiga.tsx`, `src/react-app/hooks/useFrmsOperationalSnapshot.ts`
  - Fórmula effectiveness sem KSS: `worker-airtrust/src/lib/frms/calculos.ts`

Ajuste de copy aplicado:
- KSS tratado como sinal operacional auxiliar, sem destaque indevido como componente de effectiveness.

## 6) Ajustes de navegação
- Header principal FRMS simplificado em `FrmsDashboard`:
  - Mantidos: `Fadiga Diária`, `Controle Operacional`, `Como funciona o FRMS`
  - Removidos do header principal: `Painel de Fadiga`, `Histórico Fadiga`
- Rotas existentes preservadas (sem quebra de navegação).
- Acesso secundário permanece em telas/rotas FRMS já existentes.

## 7) Ajustes da página “Como funciona”
- Reescrita estrutural em camadas para leitura operacional:
  - visão rápida;
  - compliance;
  - effectiveness;
  - leitura do mapa;
  - perguntas rápidas;
  - faixas/limiares e horário de referência;
  - referências.
- Terminologia interna removida na página (sem “Painel A/B”).
- Guardrails pós-Opus mantidos explicitamente.

## 8) Validações executadas
- `npm ci` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx vitest run src/react-app/pages/frms/__tests__` ✅
- `git diff --check` ✅

## 9) Resultado dos greps
### Grep de termos proibidos
Comando alvo em `src/react-app/pages/frms` e `src/react-app/hooks`:
- Ocorrências restantes encontradas apenas em:
  - testes negativos (regex/assert para evitar overclaim);
  - comentários técnicos legados pontuais fora da copy operacional final.
- Sem ocorrência bloqueante na copy operacional da página “Como funciona” ou no header principal FRMS ajustado.

### Grep de termos desejados
- Confirmados no código atual (incluindo nova copy):
  - `Compliance Regulatório`
  - `Efetividade Estimada`
  - `triagem operacional`
  - `revisão humana`
  - `Como funciona o FRMS`
  - `Controle Operacional`
  - `Fadiga Diária`
  - `contexto basal`
  - `limiares configuráveis`
  - `parâmetros metodológicos`

## 10) Confirmações de segurança
- Sem alteração backend/worker de cálculo.
- Sem alteração de banco.
- Sem migration.
- Sem backfill.
- Sem alteração de fórmula/threshold no motor de cálculo.
- Sem deploy.
- Sem push.
- Sem check-in operacional.
- Sem SGSO.
- Sem read/ack operacional.

## 11) Riscos residuais
- Termos legados ainda podem existir em comentários/testes históricos fora da copy principal.
- A UI FRMS tem múltiplas telas com linguagem herdada; esta entrega focou header principal + página “Como funciona” + saneamento pontual relacionado.

## 12) Próximo passo recomendado
- Publicar somente frontend/pages em fase separada (Pages-only), com validação rápida de UX em ambiente de homologação antes de promoção.
