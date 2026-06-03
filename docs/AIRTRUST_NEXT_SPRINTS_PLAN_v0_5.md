# AirTrust Next Sprints Plan v0.5

Data: 2026-06-02
Branch auditada: `main`
HEAD auditado: `871a140e47ec8eb53a21b169956c7fdd5d149179` → Sprint J em execucao sobre `bdbc200`
Modo: planejamento de sprints amplos atualizado apos Sprint J (Supabase Preparation).

## Sprint A - RBAC/Suporte

- Status: concluido na camada sem-migration em 2026-06-02.
- Objetivo: reduzir a dependencia operacional de `userId === 1` e desenhar `support` read-only por tenant.
- Escopo entregue: inventario dos call sites, centralizacao do fallback legado, testes de fronteira plataforma, teste de `support` ainda inativo e documento de modelo.
- Fora do escopo: criar empresa, criar usuario, executar migration, aplicar permissao em producao.
- Arquivos alterados: `worker-airtrust/src/routes/auth.ts`, `worker-airtrust/src/routes/empresas.ts`, `worker-airtrust/src/middleware/tenant.ts`, testes e `docs/AIRTRUST_RBAC_SUPPORT_MODEL_v0_5.md`.
- Validacoes: guard arquitetural sem novos atalhos diretos, testes de fronteira RBAC e contrato de suporte documentado.
- Modelo recomendado para remover fallback via migration: GPT-5.5 Altissimo.
- Risco: alto, porque auth/tenant e sensivel.
- Criterio de aceite restante: migration para `platform_admin`/`support`, eventos auditados e remocao de `LEGACY_PLATFORM_ADMIN_USER_ID`.

## Sprint B - Audit Trail/LGPD

- Objetivo: padronizar `empresa_id`, `request_id`, sanitizacao e retencao minima do audit trail.
- Escopo: comparar `auditoria`, `audit_logs`, `auditoria_avancada_v2`, definir writer canonico e eventos criticos.
- Fora do escopo: migration executada, purge real ou alteracao em dados reais.
- Arquivos efetivamente usados nesta fase: `worker-airtrust/src/lib/audit/*`, `worker-airtrust/src/routes/auth.ts`, `worker-airtrust/src/routes/admin.ts`, `worker-airtrust/src/routes/assets.ts`, `worker-airtrust/src/routes/empresas.ts`, testes e docs LGPD/auditoria.
- Validacoes: tabela de eventos criticos, contrato minimo do writer, testes de sanitizacao e evidencia de request correlation via metadata sem schema novo.
- Modelo recomendado: GPT-5.5 Alta.
- Risco: alto por compliance e dados sensiveis.
- Estado apos esta fase: `audit_logs` e `admin_actions` ganharam sanitizacao/minimizacao no perimetro tocado; `auditoria` ficou encapsulada apenas em rotas de `empresas`; FRMS e demais call sites seguem classificados como adaptar em sprint proprio.
- Criterio de aceite: cada writer existente fica classificado como manter, adaptar ou aposentar.

## Sprint C - Status Enum

- Status: concluido parcialmente em 2026-06-02 na camada critica do worker, sem migration.
- Objetivo: centralizar status criticos e migrar primeiro metrica/contagem.
- Escopo entregue nesta fase: modulo central `worker-airtrust/src/lib/status/status-codes.ts`, compatibilidade aplicada em `dashboardService`, simuladores, qualificacoes e treinamentos planejados, mais testes focados de compatibilidade.
- Fora do escopo: normalizacao completa do banco e de todos os modulos em uma vez.
- Arquivos efetivamente tocados: `worker-airtrust/src/lib/status/status-codes.ts`, `worker-airtrust/src/services/dashboardService.ts`, `worker-airtrust/src/routes/simuladores-*`, `worker-airtrust/src/routes/qualificacoes/*`, `worker-airtrust/src/services/qualificacoes-historico-ficha.ts`, `worker-airtrust/src/services/treinamentos-planejados-integration.ts`, testes e `docs/AIRTRUST_STATUS_ENUM_COMPATIBILITY_v0_5.md`.
- Validacoes: testes de compatibilidade de status, suites existentes de dashboard/simuladores/qualificacoes/treinamentos planejados e inventario dos status magicos remanescentes.
- Modelo recomendado: GPT-5.4 Alta.
- Risco: medio.
- Criterio de aceite restante: expandir a mesma disciplina para cron jobs, alertas e demais modulos que ainda usam strings soltas fora da camada critica atual.

## Sprint D - Testes dos modulos beta

- Objetivo: elevar a cobertura minima de Hospedagem, SGSO, LMS e EVD.
- Escopo: tenant-scope, caminhos criticos, contratos de leitura/escrita e erros controlados.
- Fora do escopo: suite e2e completa ou redesign desses modulos.
- Arquivos provaveis: `worker-airtrust/src/routes/hospedagem.ts`, `worker-airtrust/src/routes/sgso-*`, `worker-airtrust/src/routes/lms-*`, `worker-airtrust/src/routes/escalas-*`, testes correspondentes.
- Validacoes: `npm run test:worker`, novos testes de tenant-scope e erro.
- Modelo recomendado: GPT-5.4 Alta.
- Risco: medio.
- Progresso em 2026-06-02: Hospedagem, SGSO e LMS/EAD ganharam contratos minimos de tenant-scope e fluxo simples; EVD permanece fora desta rodada.
- Criterio de aceite: Hospedagem deixa de ter 0 testes e os demais modulos cobrem o fluxo minimo acordado sem liberar beta para cliente externo.

## Sprint E - DDL residual

- Objetivo: preparar a remocao segura do DDL runtime residual.
- Escopo: SIGVOOS, treinamentos planejados, documentos e schemas legados de qualificacoes.
- Fora do escopo: executar migrations ou deployar a remocao.
- Arquivos provaveis: `worker-airtrust/src/services/sigvoos-frms.ts`, `worker-airtrust/src/services/treinamentos-planejados-integration.ts`, `worker-airtrust/src/utils/auto-migration-documentos.ts`, `worker-airtrust/src/routes/qualificacoes/*`, docs de plano DDL.
- Validacoes: mapa de call sites, dependencia por tabela/indice, ordem segura de corte.
- Modelo recomendado: GPT-5.5 Altissimo.
- Risco: alto.
- Criterio de aceite: cada ensure residual tem migration alvo, risco conhecido e ordem de remocao definida.

## Sprint F - Data Quality

- Status: executado parcialmente em 2026-06-02, com SQL validado, runner local seguro criado, documento de execucao atualizado e evidencia sanitizada preparada; a execucao local mostrou cobertura parcial por ausencia de algumas tabelas no snapshot local atual.
- Objetivo: transformar checks read-only em rotina operacional executavel fora do Codex.
- Escopo: runner local/staging, classificacao blocker/warn/info, registro sem PII.
- Fora do escopo: execucao em producao por Codex, automacao destrutiva, qualquer mutacao de dados.
- Arquivos provaveis: `docs/AIRTRUST_DATA_QUALITY_CHECKS_v0_5.md`, `docs/AIRTRUST_DATA_QUALITY_EXECUTION_GUIDE_v0_5.md`, `docs/AIRTRUST_DATA_QUALITY_RUNBOOK_v0_5.md`, `scripts/validation/data-quality-checks-readonly.sql`, `scripts/validation/run-data-quality-local.sh`.
- Validacoes: `bash scripts/validation/validate-data-quality-sql.sh`, `npm run validate:data-quality-sql`, `npm run data-quality:local`, checklist operacional aprovado.
- Modelo recomendado: GPT-5.4 Alta.
- Risco: medio.
- Criterio de aceite: operador autorizado consegue executar e registrar o pacote sem violar guard rails.

## Sprint H - Repository pilot

- Status: executado parcialmente em 2026-06-02 com piloto em `dashboardService`; as metricas `taxaConclusaoMensal` e `utilizacaoSimuladores` passaram a usar repository read-only com contrato publico preservado.
- Objetivo: testar o ganho real de uma camada de repository em um dominio critico.
- Escopo: escolher um dominio com alta densidade de SQL e risco claro.
- Fora do escopo: reescrever o worker inteiro.
- Arquivos efetivamente tocados nesta fase: `worker-airtrust/src/repositories/dashboardMetricsRepository.ts`, `worker-airtrust/src/services/dashboardService.ts`, testes de repository/service e `docs/AIRTRUST_REPOSITORY_PILOT_DASHBOARD_v0_5.md`.
- Validacoes: diff controlado, testes existentes verdes, queda de SQL inline na area piloto e tenant-scope preservado nas metricas extraidas.
- Modelo recomendado: GPT-5.4 Alta.
- Risco: medio.
- Criterio de aceite restante: expandir o piloto apenas para outras queries read-only do dashboard ou para um segundo dominio quando houver cobertura equivalente.

## Sprint I - Supabase feasibility audit

- **Status: CONCLUIDO em 2026-06-02.**
- Objetivo: avaliar o que pode ser reaproveitado e o que deve ficar fora de uma eventual migracao futura.
- Escopo: auth, tenant, storage, audit trail, FRMS, escalas e modulos com DDL residual.
- Fora do escopo: iniciar migracao, criar schema paralelo, mover dados reais.
- Arquivos produzidos: `docs/AIRTRUST_SUPABASE_FEASIBILITY_AUDIT_v0_5.md`, `docs/AIRTRUST_SUPABASE_MIGRATION_DECISION_RECORD_v0_5.md`, `docs/AIRTRUST_SUPABASE_RISK_MATRIX_v0_5.md`.
- Validacoes: mapa de reaproveitamento, riscos de cutover, ordem segura por dominio.
- Modelo utilizado: Claude Code DeepSeek v4 Pro + exploracao automatizada do codebase.
- Risco: alto se virar escopo de implementacao.
- **Decisao: NAO MIGRAR AGORA / HIBRIDO FUTURO.** Workers + D1 + R2 mantidos. Auth custom mantido. Supabase Postgres como caminho futuro.
- **Acoes preparatorias imediatas:** Repository pattern, auditoria tenant isolation, Cloudflare Queues (domain_events).
- **Gatilhos de reavaliacao:** D1 80% limite, incidente tenant isolation, ou 2027-06-02.
- Criterio de aceite: existe apenas um feasibility audit claro, sem trabalho de migracao prematuro. ✅ CONCLUIDO.

## Sprint J - Supabase Preparation

- **Status: CONCLUIDO em 2026-06-02.**
- Objetivo: executar acoes preparatorias identificadas no Sprint I sem iniciar migracao.
- **Repository pattern:** `lmsRelatoriosRepository` criado com 3 queries read-only + 8 testes. ✅
- **Tenant isolation audit:** 14 gaps identificados em documentos/assets (7 criticos). ✅ Plano de correcao pronto.
- **Cloudflare Queues:** Plano de arquitetura e fases criado. Implementacao postergada para Sprint L+. ✅
- **R2 metadata:** Plano de politica, call sites e backfill criado. Depende de Sprint K. ✅
- Fora do escopo: criar projeto Supabase, migrar schema, alterar auth, alterar storage. ✅ Respeitado.
- Documentos: 4 novos docs + 2 atualizados. ✅
- Criterio de aceite: repository criado, auditoria concluida, planos documentados. ✅ CONCLUIDO.

## Sprint K - Tenant Isolation Hardening (2026-06-02)

- Status: criticos concluidos.
- Objetivo: corrigir primeiro os 7 gaps criticos de tenant isolation identificados no Sprint J.
- Escopo executado: adicionar JOIN `funcionarios.empresa_id` em queries de documentos/certificados antes de R2 ou mutation.
- Fora do escopo: alterar schema, migration, auth/tenant middleware, R2 metadata, R2 objetos reais.
- Modelo recomendado: GPT-5.5 Alta.
- Deploy necessario?: sim, executado quando implementado e testado.
- Migration necessaria?: nao.
- Risco: alto (runtime sensivel — documentos, certificados, R2 access, cascading deletes).
- Documento referencia: `docs/AIRTRUST_TENANT_ISOLATION_DOCUMENTS_AUDIT_v0_5.md`.
- Criterio de aceite: 7 gaps criticos corrigidos, testes de tenant isolation para stream/download/export/delete, sem regressao em upload/download/stream.
- Pendente apos Sprint K: GAP-014, gaps medios e decisao de integracao de `lmsRelatoriosRepository`.

## Sprint K.1 - Tenant Isolation Residuals (2026-06-02)

- Status: concluido.
- Objetivo: fechar GAP-014, classificar/corrigir os 2 gaps medios e decidir integracao de `lmsRelatoriosRepository`.
- Escopo executado: rotas admin de recuperacao/limpeza de certificados orfaos e guard adicional na listagem de metadado de certificado por historico.
- Fora do escopo: schema, migration, R2 metadata, objetos R2 reais, deploy Pages.
- Modelo recomendado: GPT-5.5 Alta.
- Deploy necessario?: sim, se runtime for alterado.
- Migration necessaria?: nao.
- Resultado: GAP-014 corrigido; MED-001 (`limpar-refs-orfas`) e MED-002 (`historico/:id/certificados`) classificados e corrigidos; testes de isolamento ampliados.
- Decisao LMS: `lmsRelatoriosRepository` nao integrado no K.1 para nao competir com runtime sensivel de documentos/certificados; permanece como proxima opcao read-only.
- Criterio de aceite: pendencias de Sprint K zeradas ou reclassificadas com evidencia.
