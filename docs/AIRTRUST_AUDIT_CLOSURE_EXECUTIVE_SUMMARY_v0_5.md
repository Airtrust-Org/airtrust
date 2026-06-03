# AirTrust — Audit Closure Executive Summary v0.5

**Data:** 2026-06-03
**Branch:** `main`
**HEAD:** `c12d8bf63c7bc9bede27ad6238459a9d921edb50`
**Modo:** Consolidado. Este resumo inclui sprints documentais e sprints de implementação pontual, incluindo o Sprint V (design), Sprint W (remoção dos DDL runtime já cobertos por migration) e Sprint X.5 (apply 0385/0386 + deploy Worker/API).

---

## 1. Estado geral

O AirTrust passou por um ciclo intenso de auditoria e remediação. Partimos de uma auditoria geral independente (2026-06-01) que identificou 1 P0 ativo (reset admin cross-tenant), 4 P1 (FRMS fail-open, `escala_alocacoes` sem `empresa_id`, scripts DB destrutivos, fallback `userId===1`), e dezenas de achados P2/P3.

**Hoje, 2026-06-02, o estado é:**

- **Nenhum P0 ativo.** O reset admin cross-tenant foi corrigido e testado.
- **Nenhum P1 de código ativo.** Todos os P1 de runtime foram mitigados ou corrigidos.
- **3 P2 residuais em scripts operacionais** (foot-guns que exigem invocação manual + credencial).
- **Achados abertos remanescentes** continuam sem bloquear piloto interno controlado.
- **Achados parciais** agora incluem os desenhos documentais concluídos do Audit Trail/LGPD v2 e do RBAC/Suporte v2, com readiness gate fechado e ordem de implementação definida, ainda sem runtime.

O código em produção permanece estável; o Sprint W removeu DDL runtime já coberto por migration e foi seguido de deploy do Worker/API.

---

## 2. O que foi resolvido

### Segurança e isolamento de tenant (7 correções críticas)

- **Reset admin cross-tenant** (P0 original): agora exige `tenant_scope` válido e filtra todas as queries por `empresa_id`.
- **7 gaps críticos de tenant isolation em documentos/certificados**: download, stream, export e delete agora verificam `funcionarios.empresa_id` antes de acessar R2.
- **5 gaps altos** de acesso/modificação indevida: corrigidos junto com os críticos.
- **2 gaps médios** de metadado/limpeza residual: corrigidos.
- **Asset gateway**: deny-by-default com classificação por prefixo (público, tenant-scoped, bloqueado).
- **FRMS fail-open**: campos de sono/aptidão agora obrigatórios; payload incompleto retorna 400.
- **`escala_alocacoes`**: todas as queries escopadas por JOIN `escalas_mensais.empresa_id`.

### Governança operacional (4 correções)

- **Deploy com `--commit-dirty=true`** removido do caminho principal.
- **Scripts DB destrutivos** protegidos por wrapper com allowlist, confirmação dupla e branch limpa.
- **Scripts legados** (seed, purge, cleanup, import) bloqueados por padrão.
- **Preflight e ops:guard** implementados como gates de deploy.

### Funcionalidades (6 entregas)

- **Module gating**: menu, rotas diretas e worker protegidos; `/api/auth/empresas` retorna `modulos_ativos` normalizado.
- **Contratos funcionais mínimos** para Hospedagem, SGSO, LMS/EAD e Treinamentos Planejados.
- **DDL runtime removido** de 8 hot paths (preferências, matriz, alertas, convocações, etc.).
- **Status enum centralizado** em `status-codes.ts` com compatibilidade para variantes PT/EN e gênero.
- **Repository pattern** em `dashboardService` (2 queries) e `lmsRelatoriosRepository` (3 queries).
- **RBAC/suporte**: fallback `userId===1` centralizado, helpers canônicos, guard arquitetural.

### Decisões estratégicas (2)

- **Supabase**: NÃO MIGRAR AGORA. HÍBRIDO FUTURO quando gatilhos de escala forem atingidos.
- **Segunda empresa**: CONDITIONAL GO — autorizado apenas piloto interno controlado.

---

## 3. O que ainda está parcial

| Área | O que foi feito | O que falta |
|---|---|---|
| **RBAC/Suporte** | `userId===1` centralizado; Sprint P definiu `platform_admin` e `support_read_only`; Sprint Q definiu dual-read, enforcement e rollback por fases | Migration para `platform_admin` persistido, grants de suporte, shadow dual-read, enforcement runtime e remocao do fallback legado |
| **Audit Trail/LGPD** | Sanitização em `auth.ts`, `admin.ts`, `assets.ts`, `empresas.ts`; Sprint O criou design v2; Sprint Q definiu schema aditivo, canonical writer e rollout audit-first; Sprint R versionou schema; Sprint S criou writer; Sprint X.5 aplicou migration `0385` em produção | Ativar flag, validar paridade, ampliar cobertura dual-write e validação jurídica de retenção |
| **Status Enum** | Helpers centrais em dashboard, simuladores, qualificações e treinamentos | Expandir para cron jobs, alertas e EVD |
| **Data Quality** | SQL validado, runner local criado, 10 checks executados (5 PASS, 4 WARN, 5 SKIPPED); OP-1 e OP-2 repetiram a evidencia local com o mesmo perfil agregado | Executar em ambiente com schema completo para zerar SKIPPED |
| **DDL Runtime** | 15 hot paths/helpers limpos, guard endurecido | Sprint V inventariou 20 ocorrências; Sprint W removeu os 6 caminhos cobertos (R02, R05, R06, R07, R08, R10); Sprint X.4 versionou `0386` e removeu o fallback de R03; Sprint X.5 aplicou `0386` em produção e deployou o Worker/API. R03 = RESOLVED. Sprint Z0 mapeou integralmente R01 (SIGVOOS), Sprint Z1 criou `0387` e Sprint Z1.1 provou a falha da cadeia limpa na `0354`. R01 = MIGRATION_CHAIN_BLOCKED_BY_0354. Sprint R09 removeu o ALTER TABLE de `shared.ts`; R09 = RESOLVED. Sprint R04.1 mapeou integralmente R04 (Documentos) — 9 lacunas confirmadas, probe remoto OBRIGATÓRIO antes da 0388. R04 = READINESS_MAPPED. |
| **Repository Pattern** | Piloto em 2 domínios (dashboard, LMS reports) | Expandir gradualmente para lms-cursos, qualificações |
| **Scripts DB** | Wrapper seguro criado para scripts críticos | Scripts shell legados ainda sem wrapper |
| **`escala_alocacoes`** | Tenant-scope por JOIN garantido e testado | Migration opcional P3 para coluna `empresa_id` própria + UNIQUE parcial |

---

## 4. O que permanece aberto

### Bloqueadores para cliente externo

1. **RBAC de plataforma**: o design e a readiness agora existem, mas `userId===1` ainda é o fallback em runtime e os papéis persistidos de plataforma/suporte ainda não existem.
2. **Audit trail**: o desenho v2 já existe, mas os writers ainda não foram padronizados nem migrados; `support_reason` continua ausente no runtime/schema atual.
3. **Data quality**: execução operacional completa pendente (5 checks SKIPPED).
4. **Cobertura de testes beta**: EVD sem cobertura; Hospedagem, SGSO, LMS com cobertura mínima.
5. **Smoke autenticado**: validacao funcional historica existe (PASS=11/11), mas as sessoes OP-1 e OP-2 ficaram `SKIPPED_AUTH_REQUIRED` por ausencia de credencial e de `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`.

### Não bloqueadores (para piloto interno)

6. **DDL runtime residual** em SIGVOOS e documentos. R03 = RESOLVED (Sprint X.5: `0386` aplicada + deploy). R09 = RESOLVED (Sprint R09: ALTER TABLE removido de `shared.ts`). R04 = READINESS_MAPPED (Sprint R04.1: 9 lacunas confirmadas, probe remoto OBRIGATÓRIO antes da 0388). R01 = MIGRATION_CHAIN_BLOCKED_BY_0354 (Sprint Z1.1).
7. **Status residual** em cron/alertas/EVD (bloqueia escala, não piloto).
8. **R2 metadata** de tenant ausente (defense-in-depth, não critério de segurança).
9. **Performance/bundle/N+1** sem auditoria (dívida estrutural).
10. **Admin backfill** sem tenant-scope (admin-gated, idempotente, P3).

---

## 5. O que bloqueia nova empresa externa

**Sim, bloqueia.** Os seguintes itens precisam ser resolvidos antes de liberar acesso a um cliente externo real:

1. **Audit trail padronizado** — schema `audit_events_v2` já aplicado em produção via `0385`, mas writer canônico e flag ainda não ativados. `support_reason` presente no schema mas não em uso operacional ainda.
2. **RBAC/Suporte formal** — sem `platform_admin` persistido e `support` read-only, não há governança para multiempresa.
3. **Data quality executado** — sem validação operacional completa, não há garantia de integridade dos dados.
4. **Smoke autenticado** — sem validação funcional, não há confirmação de que o tenant funciona ponta-a-ponta.
5. **Aceite legal/compliance** — DPA, ToS, política de privacidade e retenção pendentes de definição.

---

## 6. O que não bloqueia piloto interno controlado

Os seguintes itens **não bloqueiam** um piloto interno/controlado ( empresa atual, time interno, sem cliente externo):

- DDL runtime residual (não afeta operação atual).
- Status residual em cron/alertas (não afeta operação principal).
- R2 metadata (defense-in-depth, não requisito).
- Performance audit (escala atual não justifica).
- Repository pattern incompleto (código funciona, só é menos organizado).
- Cobertura beta parcial (módulos permanecem ocultos para cliente).

**Condição para piloto interno:** manter módulos beta ocultos, não liberar acesso a cliente externo, executar smoke autenticado com empresa esperada, e obter aceite legal mínimo.

---

## 7. Riscos técnicos remanescentes

| Risco | Severidade | Probabilidade | Impacto |
|---|---|---|---|
| Script shell legado executado manualmente com `wrangler d1 execute --remote` | P2 | Mitigado (Sprint N — 12 bloqueados, guard ativo, wrapper) | Destruição de dados em produção |
| `deploy:all` com `--commit-dirty=true` (2 scripts) | P2 | Resolvido (flag removida) | Deploy de build não versionado |
| Query futura em `escala_alocacoes` esquecer JOIN `escalas_mensais` | P3 | Baixa (testes de regressão) | Vazamento cross-tenant |
| D1 atingir limite de 5GB ou 1M statements/dia | S3 | Média (crescimento) | Degradação de performance |
| DDL runtime residual causar drift de schema entre ambientes | P3 | Baixa (código existe mas raramente executa) | Inconsistência entre dev/staging/prod |

**Nenhum risco P0 ou P1 ativo em código de produção.**

---

## 8. Proximas 5 acoes recomendadas

1. **Fornecer credencial efemera/read-only + `AIRTRUST_EXPECTED_EMPRESA_ID`/`CODIGO`** e reexecutar o smoke autenticado.
2. **Executar Data Quality completo** em ambiente staging aprovado com schema completo para zerar checks `SKIPPED`.
3. **Executar o Audit v2 staging flag test** com schema ja aplicado, rollback por flag e validacao de paridade minima.
4. **Executar a foundation de RBAC/Suporte v2** somente depois do Audit v2 staging flag test aprovado.
5. **Fechar o bloco DDL residual restante** na ordem `R04 -> R01`, mantendo a abordagem conservadora para schema/migrations. R09 = RESOLVED (Sprint R09). R04 = READINESS_MAPPED (Sprint R04.1). Próximo passo: probe estrutural remoto (PRAGMA table_info(documentos)) → criar/aplicar 0388.

**Decisao operacional OP-1/OP-2:** `CONDITIONAL GO`.

---

## 9. Decisão sobre Supabase

**Decisão: NÃO MIGRAR AGORA. HÍBRIDO FUTURO.**

- Workers + D1 + R2 mantidos como plataforma atual.
- Auth custom mantido (muito integrado para portar).
- Supabase Postgres como caminho futuro quando gatilhos forem atingidos.
- Ações preparatórias concluídas: repository pattern, tenant isolation audit, Cloudflare Queues planejado.
- **Reavaliar em 2027-06-02** ou se D1 atingir 80% de qualquer limite.

---

## 10. Conclusão

**Classificação final:**

| Pergunta | Resposta |
|---|---|
| Pronto para piloto interno/controlado? | **Sim, com condições** (CONDITIONAL GO) |
| Pronto para cliente externo amplo? | **Não ainda** (RBAC/suporte, audit trail, data quality pendentes) |
| Pronto para múltiplas empresas sem governança adicional? | **Não** (requer RBAC formal, DDL residual removido, observabilidade) |
| Riscos P0/P1 conhecidos ativos? | **Nenhum** |
| Riscos P2 ativos? | **2** (scripts shell legados, smoke pendente por empresa esperada) — todos exigem ação manual |

O AirTrust está em um estado sólido para continuar operação e evolução. O ciclo de auditoria identificou e corrigiu os riscos mais graves. O caminho para cliente externo e multiempresa passa por investimento em governança (RBAC, audit trail, data quality) — itens que não exigem reescrita, mas sim disciplina de engenharia e decisões de produto.

**Observação sobre contagem:** a matriz legacy consolidada mistura grupos históricos e subconjuntos resumidos. Após os Sprints O, P e Q, usar a tabela detalhada da matriz mestre como fonte primária para status por achado.

---

**Fim do resumo executivo.** Documento gerado em 2026-06-02. Atualizado com Sprint X.5 closure em 2026-06-03 (migrations 0385/0386 aplicadas em produção, Worker/API deployado, APP_VERSION=2026-06-03T17:00:27Z-c12d8bf, smoke pós-deploy PASS, R03=RESOLVED).
