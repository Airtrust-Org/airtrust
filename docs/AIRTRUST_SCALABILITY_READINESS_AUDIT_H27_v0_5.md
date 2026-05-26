# AIRTRUST v0.5-H27 — Scalability readiness audit with production safety

Data: 2026-05-26  
Escopo: auditoria **read-only** (sem mudanças de runtime, banco, deploy, migrations, commit ou push)

## 1. Sumário executivo
O baseline operacional está estável (tsc/build/lint/test verdes), mas há riscos de escala e segurança multi-tenant que devem ser tratados antes de ampliar carga e times de uso.

Pontos fortes atuais:
- pipeline técnico saudável (436 testes worker passando);
- guardrails operacionais de deploy e segredos ativos;
- runbook de deploy seguro consolidado.

Principais riscos para escalar:
- inconsistência de escopo tenant em endpoints/serviços específicos;
- superfícies de fail-open retornando sucesso em erro;
- arquivos de rota muito grandes e com alto acoplamento;
- cobertura de testes insuficiente para módulos críticos com escrita e integrações.

## 2. Estado baseline
## 2.1 Git
- Branch: `main`
- HEAD: `03bc221ca7fb251c5cc952eaa0174b76601e1cf1`
- `origin/main`: `03bc221ca7fb251c5cc952eaa0174b76601e1cf1`
- Divergência: `0/0`
- Alterações locais pré-existentes fora do escopo: presentes e preservadas.

## 2.2 Validações técnicas
Executado nesta fase:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:worker` ✅ (`436` testes)

## 3. O que está seguro hoje
- Endpoint de sessão simplificado já não mascara erro como sucesso (`/api/sessoes` retorna `success: false` em erro).
- Deploy seguro do worker sem migration já institucionalizado (`deploy-worker-safe.sh` + runbook).
- Guardrails de auth boundaries e tracked secrets ativos no lint.
- Middleware de request-id ativo no início da cadeia (`worker-airtrust/src/index.ts:149`, `worker-airtrust/src/middleware/requestId.ts:3-9`).

## 4. Riscos para escalar
### 4.1 Concentração arquitetural (manutenibilidade/risco de regressão)
Arquivos de rota com tamanho elevado (LOC):
- `worker-airtrust/src/routes/frms.ts` (3232)
- `worker-airtrust/src/routes/lms-cursos.ts` (2266)
- `worker-airtrust/src/routes/escalas-alocacoes.ts` (2248)
- `worker-airtrust/src/routes/escalas-evd.ts` (2039)
- `worker-airtrust/src/routes/lms-assets.ts` (1931)

### 4.2 Segurança multi-tenant e integridade
Há endpoints e serviços com baixa evidência de escopo por `empresa_id` em operações de leitura/escrita críticas, especialmente no fluxo de importação e endpoint legado de sessões.

### 4.3 Observabilidade
Há mistura de logs estruturados e `console.log/error` ad-hoc em rotas críticas, reduzindo consistência de diagnóstico sob carga.

### 4.4 Cobertura de testes
- `worker-airtrust/src/routes`: 137 arquivos de rota.
- `worker-airtrust/src/__tests__/routes`: 16 arquivos de teste de rota.

Há lacunas em módulos com escrita, integrações e operações administrativas.

## 5. Top 10 achados
## 5.1 [P0] Endpoint de assistente sem auth explícita
- Evidência: `worker-airtrust/src/routes/assistente.ts:11-13` (sem `auth()`), rota montada em `worker-airtrust/src/index.ts:778`.
- Impacto: risco de acesso não autenticado/abuso de endpoint com custo computacional e potencial exposição indireta de contexto.
- Probabilidade: alta.
- Proposta: exigir `auth()` no sub-router e validar `empresaId/userId` obrigatórios.
- Risco de mexer: baixo.
- Teste necessário: contrato 401/403 para não autenticado + smoke autenticado.
- Deploy: sim.
- Migration: não.

## 5.2 [P0] Fluxo de importação sem escopo tenant explícito
- Evidência: `worker-airtrust/src/routes/importacao.ts` não usa `getTenantContext/getEmpresaId`; `QualificacaoHistoricoImportacaoService.list` sem `empresa_id` (`worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts:557-634`).
- Impacto: risco de leitura cruzada e inconsistência multi-tenant.
- Probabilidade: alta.
- Proposta: propagar `empresa_id` obrigatório do contexto para validação/listagem/import.
- Risco de mexer: médio (fluxo operacional sensível).
- Teste necessário: regressão multi-tenant (empresa A não vê/altera dados de B).
- Deploy: sim.
- Migration: não (se schema já comportar filtro).

## 5.3 [P0] Auto-criação em importação sem vínculo de empresa evidente
- Evidência: inserts automáticos sem `empresa_id` em funcionários/tipos (`worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts:246-247`, `278-280`).
- Impacto: contaminação de dados e acoplamento cross-tenant.
- Probabilidade: média-alta.
- Proposta: bloquear auto-create sem contexto tenant ou inserir com `empresa_id` explícito.
- Risco de mexer: médio.
- Teste necessário: import por tenant + verificação de ownership dos registros criados.
- Deploy: sim.
- Migration: depende de constraints atuais (avaliar antes).

## 5.4 [P1] Endpoint simplificado `/api/sessoes` sem filtro por empresa
- Evidência: query em `sessoes` sem `empresa_id` (`worker-airtrust/src/index.ts:1047-1061`).
- Impacto: potencial vazamento de listagem entre empresas.
- Probabilidade: média.
- Proposta: filtrar por tenant e/ou descontinuar endpoint simplificado em favor de rota já escopada.
- Risco de mexer: médio.
- Teste necessário: contrato de listagem multi-tenant + paginação.
- Deploy: sim.
- Migration: não.

## 5.5 [P1] Fail-open retornando sucesso em erro na matriz de treinamento
- Evidência: catch com `success: true` fallback (`worker-airtrust/src/routes/matriz-treinamento.ts:769-788`).
- Impacto: erro operacional vira “sem dados”, mascarando falha real.
- Probabilidade: média.
- Proposta: retornar `success: false` com código estável e fallback controlado apenas quando explicitamente sinalizado.
- Risco de mexer: baixo-médio.
- Teste necessário: cenário de erro de query/schema deve retornar status de falha.
- Deploy: sim.
- Migration: não.

## 5.6 [P2] Endpoint `/api/templates` devolve sucesso com dados fake/fallback silencioso
- Evidência: query de template hardcoded (`worker-airtrust/src/index.ts:1003-1011`) e catch com `success: true` + array vazio (`1023-1029`).
- Impacto: monitoramento e consumidores podem interpretar endpoint como saudável mesmo sem dados reais.
- Probabilidade: alta.
- Proposta: contrato explícito (`success:false`/503 quando indisponível) ou remoção controlada.
- Risco de mexer: baixo.
- Teste necessário: contrato de erro sem falso positivo.
- Deploy: sim.
- Migration: não.

## 5.7 [P2] Listagens sem paginação real em simuladores
- Evidência: `/agendamentos` sem `LIMIT/OFFSET` (`worker-airtrust/src/routes/simuladores-sessoes.ts:181-185`), `/instrutores` sem limite (`202-215`).
- Impacto: degradação de latência e memória com crescimento de base.
- Probabilidade: média-alta.
- Proposta: paginação obrigatória + limites máximos + ordenação estável.
- Risco de mexer: médio.
- Teste necessário: performance smoke + contratos de paginação.
- Deploy: sim.
- Migration: não.

## 5.8 [P2] Query pesada com agregação JSON e limite fixo alto
- Evidência: `/sessoes` com `json_group_array` + joins múltiplos + `LIMIT 500` para perfis não full-access (`worker-airtrust/src/routes/simuladores-sessoes.ts:239-347`).
- Impacto: custo alto por request e variabilidade sob pico.
- Probabilidade: média.
- Proposta: paginação por cursor + payload enxuto por default + endpoint detalhado sob demanda.
- Risco de mexer: médio-alto.
- Teste necessário: benchmark comparativo e regressão funcional de calendário.
- Deploy: sim.
- Migration: não.

## 5.9 [P2] Superfície administrativa de mutação disponível em produção (protegida, mas extensa)
- Evidência: mounts de rotas administrativas/migração (`worker-airtrust/src/index.ts:1103-1113`), com operações DDL/DML em `worker-airtrust/src/routes/migrations.ts:11-220`.
- Impacto: blast radius alto em caso de credencial admin comprometida/erro operacional.
- Probabilidade: média.
- Proposta: feature flag por ambiente + dupla confirmação operacional + auditoria forte de uso.
- Risco de mexer: médio.
- Teste necessário: autorização/negação em produção e staging.
- Deploy: sim.
- Migration: não (para hardening de acesso).

## 5.10 [P2] Observabilidade inconsistente (requestId não propagado no handler global)
- Evidência: requestId middleware existe (`requestId.ts:5-7`), mas `errorHandler` gera novo id no erro (`error-handler.ts:88`) em vez de reutilizar contexto.
- Impacto: rastreamento parcial e correlação dificultada em incidentes de escala.
- Probabilidade: alta.
- Proposta: padronizar logging estruturado e sempre incluir `c.get('requestId')`.
- Risco de mexer: baixo.
- Teste necessário: teste de contrato de erro contendo requestId original.
- Deploy: sim.
- Migration: não.

## 6. Quick wins seguros (top 5)
1. Adicionar testes de autorização para `/api/assistente` e hard-fail se não autenticado.
2. Criar testes de isolamento tenant para importação/listagem de histórico.
3. Padronizar `requestId` em respostas de erro e logs estruturados.
4. Introduzir paginação obrigatória em `/api/simuladores/agendamentos` e `/api/simuladores/instrutores` (limit cap).
5. Trocar fail-open críticos (`matriz-treinamento`, `/api/templates`) por contratos explícitos de falha.

## 7. Refactors que NÃO devem ser feitos ainda
- Quebra ampla dos arquivos gigantes de rota sem baseline de testes de contrato/perf.
- Reescrita completa de FRMS/Simuladores/LMS em uma fase única.
- Mudanças de schema/migration para “resolver tudo” sem plano incremental.
- Troca de camada de acesso a dados em massa durante operação ativa.

## 8. Endpoints que precisam paginação (prioridade)
1. `GET /api/simuladores/agendamentos` (`worker-airtrust/src/routes/simuladores-sessoes.ts:95-199`) — sem `LIMIT/OFFSET`.
2. `GET /api/simuladores/instrutores` (`worker-airtrust/src/routes/simuladores-sessoes.ts:202-221`) — sem limite.
3. `GET /api/importacao/historico/list` (`worker-airtrust/src/routes/importacao.ts:1107-1125`) — limite sem cap explícito e total baseado em `rows.length`.
4. `GET /api/sessoes` simplificado (`worker-airtrust/src/index.ts:1037-1069`) — tem paginação, mas precisa também escopo tenant; revisar contrato.

## 9. Rotas que precisam mais testes
Prioridade alta (sem cobertura de rota dedicada equivalente):
- `worker-airtrust/src/routes/assistente.ts`
- `worker-airtrust/src/routes/importacao.ts`
- `worker-airtrust/src/routes/simuladores-sessoes.ts`
- `worker-airtrust/src/routes/backup.ts`
- `worker-airtrust/src/routes/sgso-auditorias-ncs.ts`
- `worker-airtrust/src/routes/migrations.ts`

## 10. Plano de fases H28-H33 (proposto)
## H28 — Tenant safety contracts (sem refactor estrutural)
- Foco: corrigir/auth+tenant em `assistente`, `importacao`, `/api/sessoes` simplificado.
- Critério: testes multi-tenant + auth verdes; sem migration.

## H29 — Fail-open hardening
- Foco: remover `success:true` em erros operacionais críticos (`matriz-treinamento`, `/api/templates`).
- Critério: contratos HTTP explícitos + regressões de frontend consumidor.

## H30 — Paginação e payload controlado
- Foco: `simuladores/agendamentos`, `instrutores`, `importacao/historico/list`.
- Critério: limites máximos, paginação estável, benchmark básico latência.

## H31 — Observabilidade padronizada
- Foco: `requestId` de ponta a ponta, logs estruturados em rotas críticas.
- Critério: erros correlacionáveis por requestId; smoke de logs.

## H32 — Test coverage expansion (risk-based)
- Foco: backup, importação, simuladores-sessões, SGSO auditorias/NC, assistente.
- Critério: novos testes de rota para fluxos críticos e negativos.

## H33 — Modularização segura (somente após cobertura)
- Foco: decompor arquivos gigantes (FRMS, LMS cursos, escalas-alocações).
- Critério: nenhuma regressão funcional/perf; rollout incremental.

## 11. Critérios de segurança para cada fase
- Nenhuma fase inicia sem baseline verde (`tsc/build/lint/test`).
- Alterações com potencial cross-tenant exigem teste de isolamento explícito.
- Alterações de contrato de erro exigem teste de consumidor e smoke read-only.
- Deploy sempre via runbook seguro (`deploy:worker:safe`) e sem migration, salvo fase autorizada.

## 12. Recomendação de próxima fase
Próxima fase recomendada: **H28 — Tenant safety contracts**.

Motivo: há riscos P0/P1 de escopo e autenticação que impactam segurança e confiança de dados; corrigir isso primeiro reduz risco sistêmico antes de qualquer refactor de escala/manutenibilidade.

## Follow-up H28 — Tenant safety contracts
- Execução registrada em [AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md](/Users/filipedaumas/SAAS/Airtrust/docs/AIRTRUST_TENANT_SAFETY_CONTRACTS_H28_v0_5.md).
- Tratado nesta fase:
  - contrato explícito de auth + tenant em `assistente`;
  - isolamento por `empresa_id` no `/api/sessoes` simplificado, com fail-closed.
- Importação mantida para subfase dedicada **H28-B** por risco estrutural maior (auto-create e escopo tenant no serviço).
