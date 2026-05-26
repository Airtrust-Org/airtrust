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
- domínio SGSO auditorias/NC segue como candidato de alto valor;
- benchmark autenticado de `/api/simuladores/sessoes` continua pendente para decidir H30-D.

## 6. Próximo domínio recomendado
- **SGSO auditorias/NC guard + negativos de escrita** (auth/role/erro explícito/tenant), em fase H32-B.
