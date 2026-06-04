# AirTrust — Product / Performance / Scale Hardening v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `6cef1edbc2675695f0d3de87d5546ebc31edbb50`  
**Modo:** local-only. Sem D1 remoto. Sem deploy. Sem backfill. Sem rebaseline. Sem apply da `0389`.

## 1. Veredito

```text
PRODUCT_PERFORMANCE_SCALE = MITIGATED_WITH_LOCAL_GUARDS_AND_SMOKE
```

Leitura correta do status:
- houve mitigação local relevante com guards e smoke tests em rotas críticas;
- não houve medição real de latência/carga em staging;
- portanto este stream não está “resolvido”, apenas protegido localmente contra regressões mais óbvias.

## 2. Riscos mapeados

| Área | Arquivo | Risco | Evidência | Impacto operacional | Correção segura | Teste necessário | Status |
|---|---|---|---|---|---|---|---|
| Simuladores | `worker-airtrust/src/routes/simuladores-fichas-extras.ts` | `limit` cru sem teto em histórico de notas | query usava `parseInt()` direto | resposta grande demais e degradação local em histórico individual | clamp local para `200` mantendo default `100` | contrato de limit/default | `MITIGATED_LOCALLY` |
| Dashboard | `worker-airtrust/src/routes/dashboard.ts` | métricas operacionais sem smoke route-level para qualificações/licenças | cobertura anterior focava `taxa-conclusao-mensal` e `utilizacao-simuladores` | regressão silenciosa de agregados ou cache | smoke local de rota com bind tenant e consistência numérica | smoke local | `MITIGATED_WITH_SMOKE` |
| EVD | `worker-airtrust/src/routes/escalas-evd.ts` | leitura principal por data sem smoke explícito | havia PUT/publicação, mas não GET básico | regressão em leitura diária operacional | smoke local de GET por data com bind tenant | smoke local | `MITIGATED_WITH_SMOKE` |
| Arquitetura crítica | rotas FRMS/EVD/simuladores/LMS/escalas/funcionários/aeronaves | `SELECT *` ainda espalhado em áreas críticas | allowlist real detectada no guard | crescimento silencioso de payload e acoplamento de schema | guard explícito com allowlist e caps por arquivo | guard de arquitetura | `MITIGATED_WITH_GUARDS` |
| Arquitetura crítica | `routes/frms.ts`, `services/sigvoos-frms.ts`, `routes/lms-cursos.ts`, `routes/escalas-*` | God files e alta concentração de `.prepare(` | guard existente já mostrava hotspots > 2.000 linhas e > 40 prepares | manutenção lenta e risco de regressão | preservado nesta etapa; só guard reforçado | guard de arquitetura | `PRESERVED_WITH_ALLOWLIST` |
| FRMS | `lib/frms/fira-service.ts`, `services/sigvoos-frms.ts` | queries com `LIMIT 2000/5000` em trilhas herdadas | allowlist de limites altos permanece necessária | risco de custo alto sob volume real | preservado com cap explícito e sem aumento permitido | guard de arquitetura | `PRESERVED_WITH_ALLOWLIST` |

## 3. Correções aplicadas

### 3.1 Simuladores

Arquivo:
- `worker-airtrust/src/routes/simuladores-fichas-extras.ts`

Mudança:
- `GET /historico-notas/:funcionarioId` agora aplica:
  - default seguro `100`;
  - teto explícito `200`;
  - fallback para default quando `limit` é inválido.

Motivo:
- era uma correção local, de baixo risco e sem mudança de regra operacional;
- o endpoint já aceitava `limit`, mas sem bound.

### 3.2 Smoke tests adicionados/ampliados

Novos/alterados:
- `worker-airtrust/src/__tests__/routes/simuladores-fichas-extras-limit.test.ts`
- `worker-airtrust/src/__tests__/routes/dashboard-metrics-integrity.test.ts`
- `worker-airtrust/src/__tests__/routes/escalas-evd-regression.test.ts`

Cobertura adicionada:
- clamp de `limit` em simuladores;
- `dashboard/qualificacoes` com `no-store`, bind de tenant e agregados coerentes;
- `dashboard/licencas` com bind de tenant e soma coerente entre buckets;
- `GET /evd?data=...` com bind explícito de `empresa_id`.

### 3.3 Guard arquitetural reforçado

Arquivo:
- `worker-airtrust/src/__tests__/architecture/architecture-performance-guard.test.ts`

Novo congelamento:
- `SELECT *` em rotas críticas agora precisa permanecer dentro de uma allowlist explícita e com contagem máxima por arquivo.

Allowlist atual documentada:
- `routes/aeronaves.ts`
- `routes/escalas-alocacoes.ts`
- `routes/escalas-padroes.ts`
- `routes/escalas-shared.ts`
- `routes/escalas-tripulacoes.ts`
- `routes/frms-fadiga-checkin.ts`
- `routes/funcionarios-mutations.ts`
- `routes/lms-matriculas.ts`
- `routes/simuladores-catalogo.ts`
- `routes/simuladores-equipamentos.ts`
- `routes/simuladores-fichas-acoes.ts`
- `routes/simuladores-fichas-edicoes.ts`
- `routes/simuladores-fichas-simulador.ts`
- `routes/simuladores-fichas.ts`
- `routes/simuladores-modelos.ts`
- `routes/simuladores-sessoes-update.ts`

Leitura correta:
- isso não “aprova” o legado;
- apenas impede crescimento silencioso sem inventar falso positivo inútil.

## 4. Itens preservados de propósito

- não houve refatoração massiva de God files;
- não houve troca estrutural de queries FRMS/SGSO/LMS herdadas sem cobertura suficiente;
- não houve mudança de schema;
- não houve migration nova;
- não houve alteração de regra operacional;
- não houve medição de tempo real, `EXPLAIN`, carga ou concorrência em staging.

## 5. Validações desta etapa

- targeted vitest dos arquivos novos/alterados: `PASS`
- `architecture-performance-guard.test.ts`: `PASS`

Validação final obrigatória da etapa:
- `npm run ops:guard`
- `npm run preflight` ou `NOT_AVAILABLE`
- `npx tsc --noEmit`
- `npm run test:worker`
- `git diff --check`

## 6. Riscos residuais

- FRMS, SGSO, LMS e escalas ainda têm hotspots de tamanho e SQL concentrado que exigem medição real antes de qualquer conclusão de escala;
- a allowlist de `SELECT *` em rotas críticas ainda é grande, então o problema foi contido, não removido;
- os limites altos de FRMS permanecem aceitos apenas como baseline legado, não como padrão desejado;
- dashboard, compliance score, demanda e atividades recentes ainda não têm cobertura de contrato tão forte quanto a trilha principal;
- EVD continua candidato a extração/refino futuro, mas sem justificativa para refactor amplo nesta etapa.

## 7. Próxima etapa recomendada

1. Medir em staging os hotspots herdados de FRMS, SGSO, LMS e escalas com payload e paginação reais.
2. Reduzir gradualmente `SELECT *` em rotas críticas começando por arquivos pequenos e já cobertos.
3. Expandir smoke/contratos para `compliance-score`, `demanda-treinamento`, `atividades-recentes` e cobertura EVD adicional.
4. Tratar refactor estrutural só em sprint dedicada, sem misturar com `DQ-01`, `MIG-01` ou `0389`.
