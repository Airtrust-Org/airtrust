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
- não há `requireRole(...)` explícito nas escritas de `sgso-auditorias-ncs`; política de role depende de contrato global atual e merece validação funcional dedicada (H32-C/H29-B).

Próximo domínio recomendado:
- SGSO Next Gen (relatos/ações CAPA) com foco em guards de escrita e isolamento tenant.
