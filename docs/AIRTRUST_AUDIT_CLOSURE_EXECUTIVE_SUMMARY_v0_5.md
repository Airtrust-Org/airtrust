# AirTrust — Audit Closure Executive Summary v0.5

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `c3328b59ab4d683d94a7fcbb4cfb30ceec77461f`
**Modo:** Documental/read-only. Este resumo consolida 16 sprints de auditoria e remediação executados entre maio e junho de 2026, incluindo os Sprints O (Audit Trail/LGPD v2 design-only) e P (RBAC/Suporte v2 design-only).

---

## 1. Estado geral

O AirTrust passou por um ciclo intenso de auditoria e remediação. Partimos de uma auditoria geral independente (2026-06-01) que identificou 1 P0 ativo (reset admin cross-tenant), 4 P1 (FRMS fail-open, `escala_alocacoes` sem `empresa_id`, scripts DB destrutivos, fallback `userId===1`), e dezenas de achados P2/P3.

**Hoje, 2026-06-02, o estado é:**

- **Nenhum P0 ativo.** O reset admin cross-tenant foi corrigido e testado.
- **Nenhum P1 de código ativo.** Todos os P1 de runtime foram mitigados ou corrigidos.
- **3 P2 residuais em scripts operacionais** (foot-guns que exigem invocação manual + credencial).
- **Achados abertos remanescentes** continuam sem bloquear piloto interno controlado.
- **Achados parciais** agora incluem os desenhos documentais concluídos do Audit Trail/LGPD v2 e do RBAC/Suporte v2, ainda sem implementação.

O código em produção permanece estável; nesta fase o avanço foi documental, sem alteração de runtime, schema ou deploy.

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
| **RBAC/Suporte** | `userId===1` centralizado; Sprint P definiu `platform_admin`, `support_read_only`, integração com audit trail e plano de migração conceitual | Migration para `platform_admin` persistido, grants de suporte, enforcement runtime, dual-read e remoção do fallback legado |
| **Audit Trail/LGPD** | Sanitização em `auth.ts`, `admin.ts`, `assets.ts`, `empresas.ts`; camada `lib/audit`; Sprint O criou design v2, taxonomia, retenção draft e plano de migration | Implementar contrato único dos 3 writers com colunas dedicadas e validação jurídica de retenção |
| **Status Enum** | Helpers centrais em dashboard, simuladores, qualificações e treinamentos | Expandir para cron jobs, alertas e EVD |
| **Data Quality** | SQL validado, runner local criado, 10 checks executados (5 PASS, 4 WARN, 5 SKIPPED) | Executar em ambiente com schema completo para zerar SKIPPED |
| **DDL Runtime** | 8 hot paths limpos, funções órfãs removidas | 3 residuais mantidos: SIGVOOS, treinamentos-planejados, documentos (exigem migrations) |
| **Repository Pattern** | Piloto em 2 domínios (dashboard, LMS reports) | Expandir gradualmente para lms-cursos, qualificações |
| **Scripts DB** | Wrapper seguro criado para scripts críticos | Scripts shell legados ainda sem wrapper |
| **`escala_alocacoes`** | Tenant-scope por JOIN garantido e testado | Migration opcional P3 para coluna `empresa_id` própria + UNIQUE parcial |

---

## 4. O que permanece aberto

### Bloqueadores para cliente externo

1. **RBAC de plataforma**: o design v2 agora existe, mas `userId===1` ainda é o fallback em runtime e os papéis persistidos de plataforma/suporte ainda não existem.
2. **Audit trail**: o desenho v2 já existe, mas os writers ainda não foram padronizados nem migrados; `support_reason` continua ausente no runtime/schema atual.
3. **Data quality**: execução operacional completa pendente (5 checks SKIPPED).
4. **Cobertura de testes beta**: EVD sem cobertura; Hospedagem, SGSO, LMS com cobertura mínima.
5. **Smoke autenticado**: validação funcional executada (PASS=11/11). Pendente: configurar `AIRTRUST_EXPECTED_EMPRESA_ID`.

### Não bloqueadores (para piloto interno)

6. **DDL runtime residual** em SIGVOOS, treinamentos e documentos (bloqueia 5+ empresas).
7. **Status residual** em cron/alertas/EVD (bloqueia escala, não piloto).
8. **R2 metadata** de tenant ausente (defense-in-depth, não critério de segurança).
9. **Performance/bundle/N+1** sem auditoria (dívida estrutural).
10. **Admin backfill** sem tenant-scope (admin-gated, idempotente, P3).

---

## 5. O que bloqueia nova empresa externa

**Sim, bloqueia.** Os seguintes itens precisam ser resolvidos antes de liberar acesso a um cliente externo real:

1. **RBAC/Suporte formal** — sem `platform_admin` persistido e `support` read-only, não há governança para multiempresa.
2. **Audit trail padronizado** — sem `empresa_id`, `request_id` e `support_reason` em todos os eventos, não há compliance.
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

## 8. Próximas 5 ações recomendadas

1. **Executar Data Quality completo** em ambiente staging aprovado com schema completo → zerar checks SKIPPED.
2. **Configurar `AIRTRUST_EXPECTED_EMPRESA_ID`** e reexecutar smoke autenticado para fechar pendência de validação de empresa esperada.
3. **Preparar a sprint de implementação segura do RBAC/Suporte v2** — migration, dual-read, rollback e migração do operador legado.
4. **Obter revisão jurídica do draft de retenção** e fechar o contrato de `support_reason`/retenção antes da implementação.
5. **Preparar a sprint de implementação segura do Audit Trail v2** — migration, dual-write controlado, rollback e data quality de auditoria.

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

**Observação sobre contagem:** a matriz legacy consolidada mistura grupos históricos e subconjuntos resumidos. Após os Sprints O e P, usar a tabela detalhada da matriz mestre como fonte primária para status por achado.

---

**Fim do resumo executivo.** Documento gerado em 2026-06-02. Nenhum código alterado, nenhum deploy, nenhuma migration.
