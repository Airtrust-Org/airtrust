# FRMS Safe Current Fixes + Auditoria Atual

## 1. Estado atual auditado: branch, HEAD, origin
- Worktree: `/tmp/airtrust-frms-safe-current-fixes`
- Branch: `fix/frms-safe-current-fixes`
- HEAD auditado: `342c8ecc03a63e33cb3c6e6d73b42557f9320c12`
- `origin/main`: `342c8ecc03a63e33cb3c6e6d73b42557f9320c12`
- Divergência no início da fase: `0 ahead / 0 behind`

## 2. Diferenças entre auditoria antiga e código atual
- O estado atual já trouxe neutralização parcial de semântica decisória em FRMS (mensagens de triagem operacional e warnings legados em endpoints).
- O sync check-in -> FRMS já usa `MINUTOS_ANTES_APRESENTACAO` via `resolverFrmsConfig` em `fadiga-frms-sync.ts`.
- Persistiam resíduos relevantes no estado atual:
  - `computeContextoPiloto()` com limites `45/90` hardcoded.
  - `computeWakeFromPresentation()` no snapshot operacional com `90` hardcoded.
  - labels fortes (`APTO/INAPTO/NAO_APTO`) ainda expostas em telas de check-in/histórico.
  - parâmetros decorativos exibidos como configuráveis sem aviso de "sem efeito".
  - `frms_score` paralelo ainda exposto em Escalas sem rótulo explícito de legado.

## 3. Achados confirmados

### 3.1 Sync check-in -> FRMS pode usar função de repouso errada/divergente
- Classificação: `JA_CORRIGIDO_NA_MAIN`
- Evidência: `worker-airtrust/src/lib/frms/fadiga-frms-sync.ts` usa `calcularFatorRepouso()` da mesma base usada no ajuste de `calcEffectiveness()` em `worker-airtrust/src/lib/frms/calculos.ts`.
- Observação: não houve alteração científica nesta fase.

### 3.2 `HV_28_DIAS_HORAS` declarado mas não usado corretamente
- Classificação: `CONFIRMADO_CORRIGIDO_NESTA_FASE`
- Evidência: `computeContextoPiloto()` retornava `limite_7d_horas: 45` e `limite_28d_horas: 90` fixos.
- Correção: agora carrega limites reais com fallback seguro (`resolveContextoPilotoLimites` + `carregarLimites`).

### 3.3 Dados estimados podendo parecer reais
- Classificação: `CONFIRMADO_CORRIGIDO_NESTA_FASE`
- Evidência: snapshot já tinha `sleep_data_source/wake_data_source/jornada_data_source`, mas o fallback de wake no snapshot usava `90` fixo.
- Correção: snapshot agora usa `MINUTOS_ANTES_APRESENTACAO` configurável também para wake estimado.

### 3.4 Labels fortes (`APTO/INAPTO/NAO_APTO`) com risco regulatório
- Classificação: `CONFIRMADO_CORRIGIDO_NESTA_FASE`
- Evidência: telas FRMS exibiam `status_operacional` cru em tabelas.
- Correção: mapeamento visual seguro:
  - `APTO` -> `Prontidao normal`
  - `APTO_COM_RESSALVA` -> `Atencao - revisar com gestor`
  - `INAPTO` -> `Requer revisao operacional`
  - `NAO_APTO` -> `Requer revisao imediata`

### 3.5 Parâmetros decorativos na UI de configuração
- Classificação: `CONFIRMADO_CORRIGIDO_NESTA_FASE`
- Evidência: campos apareciam sem sinalização de não implementação operacional.
- Correção: badge `Reservado` + aviso `Sem efeito nesta versão` para chaves decorativas.

### 3.6 Score paralelo FRMS em SQL/EVD com metodologia incompatível
- Classificação: `CONFIRMADO_CORRIGIDO_NESTA_FASE` (somente rotulagem)
- Evidência: `frms_score` calculado por fórmula paralela em `worker-airtrust/src/shared/getTripulanteOperacional.ts`.
- Correção segura aplicada: exibição/mensagens alteradas para `Indicador FRMS legado` em pontos de Escalas.
- Pendência: unificação metodológica completa permanece fora desta fase.

### 3.7 Integração FRMS <-> EVD profunda
- Classificação: `CONFIRMADO_DECISAO_PRODUTO`
- Evidência: integração atual consome status/resumos FRMS; desenho profundo de governança e decisão operacional é arquitetural.

## 4. Achados já corrigidos/desatualizados
- `JA_CORRIGIDO_NA_MAIN`: sync check-in -> FRMS já usa fallback configurável e função consistente de ajuste de repouso no pipeline atual.
- `DESATUALIZADO`: hipótese de ausência total de sinalização de fonte estimada (a UI operacional já possui `REAL/ESTIMADO/AUSENTE/INCONSISTENTE`).

## 5. Correções aplicadas
- Backend
  - `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
    - remove hardcode 45/90 em contexto.
    - adiciona `resolveContextoPilotoLimites()` com fallback seguro.
  - `worker-airtrust/src/lib/frms/operational-snapshot.ts`
    - fallback wake estimado deixa de usar 90 fixo; passa a usar config real.
  - `worker-airtrust/src/routes/escalas-alocacoes.ts`
  - `worker-airtrust/src/shared/handlers/escalasHandlers.ts`
    - mensagens alteradas para `indicador FRMS legado`.
- Frontend
  - `src/react-app/pages/frms/FrmsCheckinFadiga.tsx`
  - `src/react-app/pages/frms/FrmsFadigaHistorico.tsx`
    - labels visuais seguros para `status_operacional`.
  - `src/react-app/pages/frms/FrmsConceitos.tsx`
    - `960h` -> `930h`; exemplo numérico ajustado; reforço conceitual (triagem/apoio operacional).
  - `src/react-app/pages/frms/FrmsConfiguracoes.tsx`
    - parâmetros decorativos marcados como `Reservado` e `Sem efeito nesta versão`.
  - `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`
  - `src/react-app/pages/escalas/components/Paineis/PainelDisponibilidade.tsx`
    - `FRMS <score>` -> `Indicador FRMS legado <score>`.

## 6. Correções bloqueadas por reprocessamento
- Classificação: `CONFIRMADO_BLOQUEADO_REPROCESSAMENTO`
- Itens bloqueados nesta fase:
  - C2 completo (revisão histórica plena de `effectiveness_pct` quando exigido por mudança metodológica).
  - C4 completo (revisão histórica plena de `pct_limite_28d` quando exigida por recálculo legado/histórico).
- Motivo: exigem reprocessamento histórico; fora do escopo seguro desta fase.

## 7. Correções bloqueadas por Opus
- Classificação: `CONFIRMADO_BLOQUEADO_OPUS`
- Itens:
  - validação/recalibração científica profunda da metodologia do índice de efetividade;
  - eventual convergência metodológica avançada entre score paralelo legado e modelo FRMS oficial.
- Motivo: demanda desenho científico/arquitetural avançado, não patch seguro incremental.

## 8. Correções bloqueadas por decisão de produto
- Classificação: `CONFIRMADO_DECISAO_PRODUTO`
- Itens:
  - integração FRMS <-> EVD profunda com regras de decisão operacional unificadas;
  - política de exibição/convivência de indicadores legados vs oficiais em todos os módulos.

## 9. Parâmetros ativos
- Evidência de uso no cálculo/alerta/pipeline atual:
  - `HV_7_DIAS_HORAS`, `HV_28_DIAS_HORAS`, `HV_MES_HORAS`, `HV_365_DIAS_HORAS`
  - `MINUTOS_ANTES_APRESENTACAO`, `HORAS_SONO_PADRAO`
  - thresholds de effectiveness (`EFFECTIV_VERDE_MIN`, `EFFECTIV_AMARELO_MAX`, `EFFECTIV_VERMELHO_MAX`)
  - fatores operacionais efetivos (`FATOR_BASE_AWAY_PCT`, `FATOR_ACLIMATADO_NAO_PCT`, `FATOR_TRIPULACAO_AUM_HORAS` em alertas/FDP)
  - fatores de apresentação/duração/repouso/noturno/HV usados em `calculos.ts`.

## 10. Parâmetros decorativos
- Marcados explicitamente na UI como reservados/sem efeito nesta versão:
  - `EFFECTIV_PERIODO_PCT`
  - `REPOUSO_MIN_PRE_APRESENTACAO`
  - `REPOUSO_MIN_POS_LIBERACAO`
  - `REPOUSO_QUALIDADE_HOTEL`

## 11. Pontos de integração escala/EVD
- Leitura operacional por tripulante na Escala diária usa sinais FRMS para atenção/revisão.
- `frms_score` legado ainda existe em consultas compartilhadas de tripulante operacional.
- Nesta fase, foi aplicado apenas hardening semântico (`indicador legado`) para reduzir ambiguidade regulatória.

## 12. Próximo pacote recomendado
1. Planejar pacote com reprocessamento controlado (janela, rollback, auditoria) para C2/C4.
2. Definir estratégia de convivência e/ou depreciação do `frms_score` legado.
3. Especificar contrato único FRMS oficial para consumo por Escalas/EVD.
4. Rodar validação científica orientada por dados reais (sem alterar produção automaticamente).

## 13. Quando usar Codex 5.3
- Auditoria de código atual + patch seguro incremental + testes + documentação técnica rastreável.
- Correções locais sem migration/reprocessamento e sem redesign científico.

## 14. Quando usar GPT-5.5
- Consolidação executiva de trade-offs de produto/compliance entre múltiplos módulos.
- Planejamento de rollout faseado com comunicação para stakeholders não técnicos.

## 15. Quando usar Sonnet 4.6
- Revisão crítica de hipóteses/auditorias prévias e calibração de severidade.
- Segunda opinião sobre risco de regressão e consistência de evidências.

## 16. Quando usar Opus 4.8
- Redesenho metodológico/científico profundo do índice de efetividade.
- Propostas de unificação arquitetural ampla FRMS/EVD com governança formal de risco.
