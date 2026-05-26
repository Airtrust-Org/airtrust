# AIRTRUST v0.5-H32 — Expansão de testes por domínio

Data: 2026-05-26

## 1. Domínio escolhido
- **backup/admin-migrations guard tests**.

## 2. Motivo da priorização
- rotas de backup e migração têm superfície de risco operacional alta;
- são fluxos de escrita/sensíveis e exigem fail-closed consistente;
- cobertura dedicada era baixa em comparação ao risco.

## 3. Testes adicionados
Arquivos:
- [backup-guards.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/backup-guards.test.ts)
- [admin-apply-migration-guards.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/admin-apply-migration-guards.test.ts)

Cenários cobertos:
1. `POST /backup/manual` retorna `401` sem autenticação.
2. `POST /backup/manual` bloqueia role sem permissão com `403` (RBAC fail-closed).
3. `POST /backup/manual` retorna `503 BUCKET_NOT_BOUND` quando storage não está configurado.
4. `POST /backup/manual` valida payload e retorna `400 VALIDATION_ERROR` para tipo inválido.
5. `POST /backup/manual` retorna `400 INVALID_MODULES` para módulo inválido (antes de qualquer orquestração).
6. `POST /apply-migration` retorna `401` sem autenticação.
7. `POST /apply-migration` retorna `400` sem `migration_sql`.
8. `POST /apply-migration` executa SQL quando autenticado e payload válido.
9. `POST /apply-migration` retorna `500` explícito quando `db.exec` falha.

## 4. Riscos cobertos
- redução do risco de execução acidental de rotas perigosas sem autenticação;
- validação de fail-closed em autorização por role;
- garantia de erro explícito em falhas internas (sem sucesso silencioso).

## 5. Lacunas restantes
- outras rotas administrativas/migração ainda sem cobertura dedicada;
- benchmark autenticado de `/api/simuladores/sessoes` continua pendente para decidir H30-D.

## 6. Próximo domínio recomendado
- **SGSO auditorias/NC guard + negativos de escrita** (auth/role/erro explícito/tenant), em fase H32-B.

## 7. H32-B — SGSO auditorias/NC guards
Domínio escolhido:
- SGSO auditorias e não conformidades (`sgso-auditorias-ncs`).

Rotas cobertas:
- `POST /sgso/auditorias`
- `GET /sgso/auditorias`
- `POST /sgso/nao-conformidades`

Arquivo de teste:
- [sgso-auditorias-ncs-guards.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/sgso-auditorias-ncs-guards.test.ts)

Cenários adicionados:
1. sem autenticação em escrita retorna `401`;
2. tenant ausente falha fechado com erro explícito (sem sucesso silencioso);
3. criação de auditoria válida preserva contrato `201` e propaga `empresa_id` no bind;
4. listagem de auditorias filtra por `empresa_id` do tenant;
5. payload inválido em NC retorna `400`;
6. falha de DB em criação de NC retorna `500` com `success:false` (sem fail-open).

Riscos cobertos:
- auth obrigatório em escrita SGSO auditável;
- isolamento de tenant por bind de `empresa_id` em listagem/criação;
- garantia de erro explícito em falha interna.

Lacunas restantes:
- não há `requireRole(...)` explícito nas escritas de `sgso-auditorias-ncs`; política de role depende de contrato global atual e merece validação funcional dedicada (H32-D/H29-B).

Próximo domínio recomendado:
- simuladores sessões/fichas (update/delete) com foco em guards de escrita e isolamento tenant.

## 8. H32-C — Simuladores sessões/fichas guards
Domínio escolhido:
- simuladores (`simuladores-sessoes` e `simuladores-fichas`), com foco em escrita de sessão e guard de tenant em fichas.

Rotas cobertas:
- `PUT /sessoes/:id`
- `DELETE /sessoes/:id`
- `GET /fichas` (negativo de tenant ausente)

Arquivo de teste:
- [simuladores-sessoes-guards.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/simuladores-sessoes-guards.test.ts)

Cenários adicionados:
1. sem autenticação em `PUT /sessoes/:id` retorna `401`;
2. role insuficiente em `DELETE /sessoes/:id` retorna `403` (fail-closed);
3. `PUT /sessoes/:id` com horário inválido retorna `400` explícito;
4. falha de DB em `PUT /sessoes/:id` retorna `500` com `success:false`;
5. `/fichas` sem tenant válido falha fechado com erro explícito (`500`, sem sucesso silencioso).

Riscos cobertos:
- auth obrigatório em escrita de sessão;
- bloqueio de delete para role sem permissão;
- contrato de erro explícito em falha interna de update;
- validação de fail-closed quando contexto tenant está ausente em fluxo de fichas.

Lacunas restantes:
- teste de isolamento cross-tenant para `PUT /sessoes/:id` (empresa A não editar sessão da B) depende de harness mais fiel ao tenant middleware global;
- cobertura adicional de fluxos de fichas (`PUT/DELETE`) pode entrar em H32-D.

Próximo domínio recomendado:
- SGSO Next Gen (relatos/ações CAPA) ou simuladores fichas-edicoes, priorizando negativos de role/tenant.

## 9. H32-D — SGSO Next Gen relatos/ações guards
Domínio escolhido:
- SGSO Next Gen (`relprev` workflow/listagem de relatos).

Rotas cobertas:
- `PATCH /sgso/relprev/submissoes/:id/workflow`
- `GET /sgso/relprev/submissoes`

Arquivo de teste:
- [sgso-nextgen-relatos-acoes-guards.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/sgso-nextgen-relatos-acoes-guards.test.ts)

Cenários adicionados:
1. sem autenticação em escrita de workflow retorna `401`;
2. tenant ausente falha fechado com erro explícito (`500`, `success:false`, `code: SGSO_NEXT_ERROR`);
3. listagem de submissões usa `empresa_id` do tenant no bind;
4. update cross-tenant é bloqueado por escopo e retorna `404` (relato não encontrado para a empresa);
5. workflow válido preserva contrato de sucesso e propaga `empresa_id` no update;
6. falha de DB em listagem retorna erro explícito (`500`, `success:false`), sem sucesso silencioso.

Riscos cobertos:
- autenticação obrigatória em escrita de workflow de relatos;
- isolamento tenant explícito em leitura e update de relatos;
- garantia de erro explícito em falha interna (sem fail-open).

Lacunas restantes:
- cobertura de role específico em ações SGSO Next Gen extras (`FRAT/MoC`) pode entrar numa fase posterior dedicada;
- benchmark autenticado de `/api/simuladores/sessoes` segue pendente para decidir H30-D.

Próximo domínio recomendado:
- consolidar bloco H32 e decidir entre novo domínio crítico (se houver lacuna real) ou pausa para frente de arquitetura/modularização com diagnóstico próprio.

## 10. Fechamento do bloco H32
- Bloco H32 concluído com cobertura por domínio:
  - H32-A: backup/admin-migrations;
  - H32-B: SGSO auditorias/NC;
  - H32-C: simuladores sessões/fichas;
  - H32-D: SGSO Next Gen relatos/workflow.
- Baseline final do bloco:
  - `worker-airtrust` com `483` testes passando;
  - sem alteração de runtime nas fases H32;
  - fases executadas como tests-only + docs, sem necessidade de deploy neste fechamento.
- Transição de fase:
  - próximo passo recomendado é H33 (diagnóstico/plano de modularização segura), sem refactor de código nesta etapa.
