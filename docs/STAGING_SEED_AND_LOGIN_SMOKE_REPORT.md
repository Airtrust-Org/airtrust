# Staging Seed and Login Smoke Report

## Data
- Data/hora: 2026-05-15
- Branch: main
- Commit checkpoint: 14cd6f6c8
- Commit final: (to be filled after commit)
- Producao tocada? nao
- Dados reais usados? nao

## Objetivo
Criar seed minimo ficticio em staging e validar login/smoke com token.

## Schema usado
- D1 staging: airtrust-db-staging (b7f50907)
- Schema sincronizado na Fase 7: sim, 223 tabelas
- Tabelas usadas:
  - empresas
  - usuarios
  - usuarios_empresas
  - funcionarios

## Seed criado
- Empresa teste criada: AirTrust Staging Test Company (codigo: staging-test, id: 1)
- Usuario teste criado: Admin Staging Test (id: 1)
- Email ficticio: admin.staging.test@example.invalid
- Senha exposta no relatorio? nao
- Hash exposto? nao
- Dados reais usados? nao
- Script criado: scripts/staging/create-test-user.sh
- Idempotente? sim (INSERT OR IGNORE + UPDATE para rotacao de senha)
- Funcionario vinculado: Funcionario Teste Staging (email: funcionario.staging.test@example.invalid)

## Password rotation (2026-05-15)
- Motivo: senha inicial apareceu na saida do terminal durante a Fase 8
- Acao: senha rotacionada para novo valor aleatorio
- Nova senha commitada? nao
- Hash commitado? nao
- Script corrigido: hash generation agora usa process.stdout.write (nao captura stderr)
- Script corrigido: adicionado UPDATE para suportar rotacao de senha em usuarios existentes
- Login com nova senha: 200 (validado)
- Login com senha antiga: 401 (rejeitado)
- Uso: `STAGING_TEST_PASSWORD='<set locally, do not commit>' bash scripts/staging/create-test-user.sh`

## Validacao de login
| Teste | Resultado | Observacao |
|-------|-----------|------------|
| login com usuario teste | 200 | accessToken JWT retornado com role=ADMIN, empresa_id=1 |
| login senha errada | 401 | rejeitado corretamente |
| rota protegida sem token | 401 | auth middleware funcionando |
| token invalido | 401 | JWT verification funcionando |

## Smoke API com token
| Rota | Resultado | Observacao |
|------|-----------|------------|
| /api/auth/me | 200 | perfil do usuario retornado |
| /api/funcionarios | 200 | lista de funcionarios (1 seed) |
| /api/empresas | 200 | lista de empresas (1 seed) |
| /api/qualificacoes/tipos | 200 | lista vazia, schema ok |
| /api/lms/cursos | 200 | lista vazia, schema ok |
| /api/frms/maintenance (sem secret) | 503 | fail-closed, seguro |

## Seguranca
- Producao tocada? nao
- Token commitado? nao
- Senha commitada? nao
- Hash consultado/commitado? nao
- Dados reais copiados? nao
- Script usa apenas dados ficticios
- Dominios usados: example.invalid (RFC 6761 reserved)

## Bloqueios remanescentes
- frontend smoke manual ainda necessario
- MAINTENANCE_SECRET ausente, se continuar ausente
- migrations historicas ainda precisam saneamento definitivo
- RBAC instrutor -> manager ainda decisao de produto

## Recomendacao
staging pronto para smoke funcional frontend.

## Como remover seed de staging
```bash
npx wrangler d1 execute airtrust-db-staging --env staging \
  --command "DELETE FROM usuarios_empresas WHERE usuario_id IN (SELECT id FROM usuarios WHERE email = 'admin.staging.test@example.invalid');" \
  --remote

npx wrangler d1 execute airtrust-db-staging --env staging \
  --command "DELETE FROM usuarios WHERE email = 'admin.staging.test@example.invalid';" \
  --remote

npx wrangler d1 execute airtrust-db-staging --env staging \
  --command "DELETE FROM funcionarios WHERE email = 'funcionario.staging.test@example.invalid';" \
  --remote

npx wrangler d1 execute airtrust-db-staging --env staging \
  --command "DELETE FROM empresas WHERE codigo = 'staging-test';" \
  --remote
```
