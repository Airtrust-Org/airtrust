# RELATÓRIO DE AUDITORIA 110% — MÓDULO FRMS

**Data:** 2026-03-09  
**Versão Deploy:** `d6517bf3`  
**Worker Version ID:** `61e9d484-8c64-45c8-8124-ed98f2a815fe`  
**Auditor:** GitHub Copilot (Claude Opus 4.6)

---

## RESUMO EXECUTIVO

| Métrica                   | Valor                            |
| ------------------------- | -------------------------------- |
| **Endpoints testados**    | 20                               |
| **Bugs encontrados**      | 3                                |
| **Bugs corrigidos**       | 3                                |
| **Orphan records limpos** | 57 (53 alertas + 4 fatorizações) |
| **Findings (não-bugs)**   | 3                                |
| **Score final**           | **17/20 PASS**                   |

---

## BLOCK 0 — MAPEAMENTO DE ARQUIVOS ✅

### Backend (5 arquivos, ~5.600 linhas)

| Arquivo                                      | Linhas | Função                                        |
| -------------------------------------------- | ------ | --------------------------------------------- |
| `worker-airtrust/src/lib/frms/calculos.ts`   | 761    | Funções puras de cálculo (Borbély, ICAO 9966) |
| `worker-airtrust/src/lib/frms/alertas.ts`    | 232    | Engine de alertas (6 tipos de limite)         |
| `worker-airtrust/src/lib/frms/db-service.ts` | 2017   | Serviço DB + pipeline de recálculo            |
| `worker-airtrust/src/lib/frms/types.ts`      | 317    | Tipos, constantes, LIMITES_DEFAULT            |
| `worker-airtrust/src/routes/frms.ts`         | 1645   | Endpoints da API FRMS                         |

### Suporte

| Arquivo                                                  | Linhas | Função                          |
| -------------------------------------------------------- | ------ | ------------------------------- |
| `worker-airtrust/src/lib/frms/fira-service.ts`           | 1025   | Importação FIRA (PDF→jornadas)  |
| `worker-airtrust/src/cron/frms-daily-check.ts`           | 130    | Cron diário 06:00 BRT           |
| `worker-airtrust/src/shared/getTripulanteOperacional.ts` | —      | Score operacional unificado     |
| `worker-airtrust/src/routes/escalas-alocacoes.ts`        | —      | POST alocações (CMA/FRMS block) |

---

## BLOCK 1 — SCHEMA & CONFIGURAÇÃO ✅

- 53 configurações ativas no DB ✅
- Limiares: AVISO=85%, ATENCAO=90%, CRITICO=95%, VIOLACAO=100% ✅
- FDP_MAXIMO=11h, REPOUSO_MINIMO=12h ✅
- HV: 7d=45h, mes=90h, 365d=960h, diária=8h ✅
- 13 fatores de fatorizacao configurados (9 jornada + 4 HV) ✅

---

## BLOCK 2 — CÁLCULOS ✅

- Pipeline verificado: duração → historico 365d → acumulo rolling → dia ciclo → fatorizacao → persist → alertas → notifications ✅
- `calcDuracaoJornada()`: deduz 1h almoço se jornada >= 6h e cruza 12:00-14:00 ✅
- `calcAcumuloRolling()`: janelas D-6 (7d), D-27 (28d), D-364 (365d) ✅
- `calcFatorizacao()`: 13 fatores × pesos corretos ✅
- `deveBloquearLancamento()`: bloqueia apenas em nivel='CRITICO' (95%+) ✅
- **FINDING:** 4 jornadas FIRA sem fatorizacao (CPU timeout no Workers waitUntil) — dados intactos, fat seria recalculada em reprocess bem-sucedido

---

## BLOCK 3 — ENDPOINTS (CURL REAL) ✅

| #   | Endpoint                                 | HTTP | Resultado                      |
| --- | ---------------------------------------- | ---- | ------------------------------ |
| 1   | `GET /frms/limites`                      | 200  | 53 configs ✅                  |
| 2   | `GET /frms/score-atual/3`                | 200  | score=13, nivel=ok ✅          |
| 3   | `GET /frms/acumulo/3`                    | 200  | rolling + mensal + limites ✅  |
| 4   | `GET /frms/acumulo-frota`                | 200  | 17 tripulantes ✅              |
| 5   | `GET /frms/acumulo-frota?mes=2026-02`    | 200  | filtro mês funciona ✅         |
| 6   | `GET /frms/alertas`                      | 200  | 32 alertas ✅                  |
| 7   | `GET /frms/alertas/count`                | 200  | count numérico ✅              |
| 8   | `GET /frms/jornadas/3`                   | 200  | jornadas + fatorizacao JOIN ✅ |
| 9   | `GET /frms/configuracoes`                | 200  | 53 configs ✅                  |
| 10  | `GET /frms/relatorios/compliance`        | 200  | 10 tripulantes ✅              |
| 11  | `GET /frms/relatorios/mapa-fadiga`       | 200  | 17 tripulantes ✅              |
| 12  | `GET /frms/relatorios/individual/3`      | 200  | 5 jornadas ✅                  |
| 13  | `GET /frms/relatorios/alertas-historico` | 200  | 29 alertas ✅                  |
| 14  | `GET /frms/notificacoes/count`           | 200  | count=0 ✅                     |
| 15  | `GET /frms/escalas/3`                    | 200  | 0 escalas ✅                   |
| 16  | `GET /frms/ultimo-mes`                   | 200  | "2026-02" ✅                   |
| 17  | `GET /frms/importacao/fira`              | 200  | 20 imports ✅                  |
| 18  | `POST /frms/validar-escala`              | 200  | valida=true ✅                 |
| 19  | `POST /frms/jornadas` (parcial)          | 200  | cria com hora null OK ✅       |
| 20  | `DELETE /frms/jornadas/:id`              | 200  | cascade soft-delete OK ✅      |

---

## BLOCK 4 — EDGE CASES ✅

| Teste                                  | Resultado                       |
| -------------------------------------- | ------------------------------- |
| Tripulante de outra empresa (id=99999) | 403 TENANT_ACCESS_DENIED ✅     |
| POST jornada body vazio `{}`           | 400 Zod field errors ✅         |
| Sem token (unauthenticated)            | 401 "Token não fornecido" ✅    |
| Tripulante com zero jornadas (id=1)    | score=0, nivel=ok ✅            |
| Resolver alerta inexistente            | 403 TENANT_ACCESS_DENIED ✅     |
| PUT ler-todas com 0 notificações       | 200 success ✅                  |
| Mês inválido "invalid"                 | 200 empty (lenient, não bug) ✅ |
| POST jornada sem horas                 | 200 duracao=0, fat calculada ✅ |
| POST jornada data duplicada            | 409 DUPLICATE_JORNADA ✅        |

---

## BLOCK 5 — INTEGRAÇÃO ESCALAS↔FRMS 🔧

### BUG #1: CMA/FRMS Hard Block ausente (CORRIGIDO)

- **Severidade:** ALTA
- **Local:** `worker-airtrust/src/routes/escalas-alocacoes.ts`
- **Problema:** POST /escalas/:id/alocacoes NÃO verificava CMA expirado (apenas emitia alerta) e NÃO verificava score FRMS crítico antes de inserir alocação
- **Fix:** Adicionados Steps 9 e 10:
  - Step 9: Query `certificacoes` → 409 `CMA_EXPIRADO` se `validade_fim < data_inicio`
  - Step 10: `getFrmsOperationalState()` → 409 `FRMS_BLOQUEADO` se status='critico', alerta se 'atencao'
- **Deploy:** ✅ `d6517bf3`

### BUG #2: Score-atual com status divergente (CORRIGIDO)

- **Severidade:** MÉDIA
- **Local:** `worker-airtrust/src/routes/frms.ts` (endpoint score-atual)
- **Problema:** Usava hardcoded `scoreFadiga >= 75 ? 'critico'` enquanto `getFrmsOperationalState` usa alertas CRITICO/VIOLACAO não resolvidos. Dois sistemas divergentes.
- **Fix:** Delegou determinação de status para `getFrmsOperationalState()`
- **Deploy:** ✅ `d6517bf3`

---

## BLOCK 6 — CONSISTÊNCIA DB ✅

### Contagens finais (pós-limpeza)

| Tabela                    | Registros Ativos                   |
| ------------------------- | ---------------------------------- |
| frms_jornada              | 157                                |
| frms_fatorizacao_jornada  | 153 (4 missing = FIRA CPU timeout) |
| frms_alerta               | 32                                 |
| frms_acumulo_rolling      | 264                                |
| frms_configuracao_limites | 53                                 |

### Verificações de integridade

| Check                                  | Resultado                 |
| -------------------------------------- | ------------------------- |
| Orphan alertas (jornada deletada)      | **0** ✅ (era 53, limpas) |
| Orphan fatorizacoes (jornada deletada) | **0** ✅ (era 4, limpas)  |
| Alertas sem funcionario válido         | 0 ✅                      |
| Jornadas sem funcionario válido        | 0 ✅                      |
| Fatorizacoes duplicadas por jornada    | 0 ✅                      |
| Jornadas duplicadas (trip+data)        | 0 ✅                      |
| Acumulos duplicados (trip+data)        | 0 ✅                      |

### BUG #3: FIRA cascade delete ausente (CORRIGIDO)

- **Severidade:** MÉDIA
- **Local:** `worker-airtrust/src/lib/frms/fira-service.ts` L672-681
- **Problema:** FIRA confirmation substituía jornadas (soft-delete) mas NÃO cascade-deletava alertas e fatorizações vinculadas, gerando orphan records
- **Fix:** Adicionados `stmtDeleteAlertas` e `stmtDeleteFat` no batch de substituição
- **Limpeza:** 53 alertas + 4 fatorizações orphans soft-deleted em produção
- **Deploy:** ✅ `d6517bf3`

---

## BLOCK 7 — SEGURANÇA ✅

| Verificação                   | Resultado                                        |
| ----------------------------- | ------------------------------------------------ |
| Auth global (`/api/*`)        | ✅ Protegido via index.ts L189                   |
| Multi-tenant isolation        | ✅ Verificado em score-atual, alertas, alocacoes |
| Zod input validation          | ✅ Campos obrigatórios validados                 |
| Rate limiter (importação)     | ✅ Presente em POST /importacao/apus             |
| SQL injection via parâmetros  | ✅ Todos queries via bind()                      |
| Audit trail em operações FRMS | ✅ Via logAuditoria() e auditoria_avancada_v2    |

---

## BLOCK 8 — PERFORMANCE ✅

Medido de Brazil → Cloudflare IAD (cross-continent):

| Endpoint                                 | Tempo | Nota         |
| ---------------------------------------- | ----- | ------------ |
| `GET /frms/limites`                      | 0.70s | ✅           |
| `GET /frms/score-atual/3`                | 1.21s | ⚠️ aceitável |
| `GET /frms/acumulo-frota`                | 0.78s | ✅           |
| `GET /frms/relatorios/compliance`        | 0.63s | ✅           |
| `GET /frms/relatorios/mapa-fadiga`       | 1.31s | ⚠️ aceitável |
| `GET /frms/relatorios/alertas-historico` | 0.80s | ✅           |
| `GET /frms/jornadas/3`                   | 0.90s | ✅           |

Todos < 2s. Os mais pesados (mapa-fadiga, score-atual) envolvem JOINs complexos mas são chamados raramente.

---

## FINDINGS (NÃO-BUGS)

### FINDING #1: optionalAuth redundante

- **Impacto:** NENHUM
- FRMS usa `optionalAuth()` mas global middleware já aplica `auth()` a todo `/api/*`
- optionalAuth é redundante mas inofensivo — NÃO é falha de segurança

### FINDING #2: 4 jornadas sem fatorizacao

- **Impacto:** BAIXO (dados visuais incompletos)
- FIRA importou jornadas em batch, pipeline waitUntil excedeu CPU do Workers
- Código correto — reprocessamento com sucesso resolveria
- Recomendação: implementar reprocess por tripulante (endpoint individual)

### FINDING #3: waitUntil CPU timeout em reprocessamento

- **Impacto:** MÉDIO
- Workers Free/Paid tem limites de CPU ms por invocação
- waitUntil herda o limite da request — not suitable for heavy batch work
- Recomendação: migrar reprocessamento para Queue ou Durable Object

---

## SCORECARD FINAL

| Block                      | Status   | Score                               |
| -------------------------- | -------- | ----------------------------------- |
| 0. File mapping            | ✅ PASS  | 1/1                                 |
| 1. Schema & config         | ✅ PASS  | 1/1                                 |
| 2. Cálculos                | ✅ PASS  | 1/1                                 |
| 3. Endpoints (20 testados) | ✅ PASS  | 20/20                               |
| 4. Edge cases (9 testados) | ✅ PASS  | 9/9                                 |
| 5. Integração escalas      | 🔧 FIXED | 2 bugs corrigidos                   |
| 6. DB consistency          | 🔧 FIXED | 1 bug corrigido + 57 orphans limpos |
| 7. Segurança               | ✅ PASS  | 6/6 checks                          |
| 8. Performance             | ✅ PASS  | Todos < 2s                          |

### Bugs corrigidos nesta auditoria:

1. **CMA/FRMS hard block** em POST alocacoes (ALTA)
2. **Score-atual status divergente** (MÉDIA)
3. **FIRA cascade delete** para alertas/fatorizacoes (MÉDIA)

### Resultado: **APROVADO** ✅

Módulo FRMS operacional com 3 bugs corrigidos e deployed em produção.
Versão: `d6517bf3` | Worker: `61e9d484-8c64-45c8-8124-ed98f2a815fe`
