# AirTrust Next Sprints Plan v0.5

Data: 2026-06-02
Branch auditada: `main`
HEAD auditado: `300ecb9b036d153c0da5fa654e7083f09fee412b`
Modo: planejamento de sprints amplos atualizado apos Sprint A.

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

## Sprint G - Repository pilot

- Objetivo: testar o ganho real de uma camada de repository em um dominio critico.
- Escopo: escolher um dominio com alta densidade de SQL e risco claro.
- Fora do escopo: reescrever o worker inteiro.
- Arquivos provaveis: dominio piloto entre `dashboardService`, `escalas`, `qualificacoes` ou `empresas-usuarios`.
- Validacoes: diff controlado, testes existentes verdes, queda de SQL inline na area piloto.
- Modelo recomendado: GPT-5.4 Alta.
- Risco: medio.
- Criterio de aceite: um dominio passa a ter acesso a dados encapsulado e mais testavel.

## Sprint H - Supabase feasibility audit

- Objetivo: avaliar o que pode ser reaproveitado e o que deve ficar fora de uma eventual migracao futura.
- Escopo: auth, tenant, storage, audit trail, FRMS, escalas e modulos com DDL residual.
- Fora do escopo: iniciar migracao, criar schema paralelo, mover dados reais.
- Arquivos provaveis: docs de arquitetura, inventario de schema, planos de rollout futuro.
- Validacoes: mapa de reaproveitamento, riscos de cutover, ordem segura por dominio.
- Modelo recomendado: GPT-5.5 Altissimo.
- Risco: alto se virar escopo de implementacao.
- Criterio de aceite: existe apenas um feasibility audit claro, sem trabalho de migracao prematuro.
