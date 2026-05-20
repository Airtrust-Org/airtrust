# Production D1 Incident Audit Report

## Data
- Data/hora: 2026-05-15T17:00-17:30 UTC
- Branch: main
- Commit checkpoint: 94e08fae2
- Commit final: (este commit)

## Resumo do incidente
- O que aconteceu: comandos D1 iniciais da Fase 10.1 foram executados contra `airtrust-db` producao em vez de `airtrust-db-staging`
- Banco producao tocado? sim
- Tipo de operacao indevida: INSERT de usuario teste `admin.staging.test@example.invalid` no banco de producao
- Registro criado: 1 usuario (perfil ADMIN, email ficticio)
- Correcao imediata: DELETE executado via `wrangler d1 execute airtrust-db --env production`
- DELETE executado: sim, confirmado `changes: 1`
- Resultado informado: usuario removido com sucesso
- Dados reais copiados? nao
- Dados reais expostos? nao (apenas emails visualizados no terminal, nao salvos em arquivo)

## Causa raiz
- Confusao entre `airtrust-db` (producao) e `airtrust-db-staging` (staging)
- Uso de comando D1 com nome de banco errado: `wrangler d1 execute airtrust-db` conecta ao banco global de producao independentemente de `--env staging`
- Falta de guardrail operacional: o wrapper `create-test-user.sh` tinha protecao (recusa qualquer nome diferente de `airtrust-db-staging`) mas os comandos manuais de auditoria nao passaram pelo wrapper

## Auditoria de producao apos correcao
| Verificacao | Resultado | Evidencia |
|-------------|-----------|-----------|
| usuario teste ausente de producao | 0 registros | SELECT com email retornou results: [] |
| empresa teste ausente de producao | 0 empresas do incidente | 5 empresas com "Test" no nome sao pre-existentes e nao relacionadas ao incidente (ids 1-7) |
| vinculos orfaos relevantes | 0 | `usuarios_empresas WHERE usuario_id NOT IN (SELECT id FROM usuarios)` retornou 0 |
| mencoes em audit_logs (old_values/new_values) | 0 | SELECT com LIKE '%admin.staging.test@example.invalid%' retornou 0 |
| mencoes em auditoria (dados_antes/dados_depois) | 0 | SELECT com LIKE '%admin.staging.test@example.invalid%' retornou 0 |
| producao recebeu somente SELECT nesta auditoria | sim | Nenhum INSERT/UPDATE/DELETE executado nesta fase contra producao |

## Staging
| Verificacao | Resultado |
|-------------|-----------|
| usuario staging existe | sim, id=1, admin.staging.test@example.invalid, perfil=ADMIN, active=1 |
| senha rotacionada apos exposicao | sim, nova senha gerada e hash atualizado em `airtrust-db-staging` |
| login nova senha | 200 OK |
| senha exposta rejeitada | 401 Unauthorized |
| auth/me com novo token | 200 OK |

## Acoes corretivas aplicadas
- usuario teste removido da producao (DELETE imediato na Fase 10.1)
- senha staging rotacionada novamente (Fase 10.2)
- script e relatorio sanitizados: 4 ocorrencias da senha exposta removidas de `docs/LOGIN_UI_STAGING_AUDIT_REPORT.md`
- relatorio de incidente criado (este documento)

## Acoes preventivas recomendadas
- criar guardrail em scripts para recusar `airtrust-db` quando objetivo for staging
- usar variaveis explicitas `D1_DATABASE_NAME=airtrust-db-staging`
- adicionar confirmacao interativa para qualquer comando D1 remoto
- separar aliases/scripts de staging e producao
- nunca usar comandos manuais D1 sem wrapper
- considerar conta/token Cloudflare com permissao limitada para staging

## Risco residual
- Nao ha mencao ao email ficticio em audit_logs nem auditoria
- Nao ha residuo do usuario teste em tabelas de producao
- Producao foi tocada (INSERT + DELETE), portanto risco operacional documentado
- Empresas com "Test" no nome em producao (5 registros) sao pre-existentes e nao relacionadas ao incidente

## Conclusao
Incidente corrigido e sem residuo detectado.

## Como verificar novamente
```bash
# Confirmar usuario teste ausente em producao
npx wrangler d1 execute airtrust-db --env production \
  --command "SELECT id, email, nome, perfil, active FROM usuarios WHERE email = 'admin.staging.test@example.invalid';" \
  --remote

# Confirmar vinculos orfaos
npx wrangler d1 execute airtrust-db --env production \
  --command "SELECT COUNT(*) FROM usuarios_empresas WHERE usuario_id NOT IN (SELECT id FROM usuarios);" \
  --remote

# Confirmar mencoes em auditoria
npx wrangler d1 execute airtrust-db --env production \
  --command "SELECT COUNT(*) FROM auditoria WHERE dados_antes LIKE '%admin.staging.test@example.invalid%' OR dados_depois LIKE '%admin.staging.test@example.invalid%';" \
  --remote

# Confirmar mencoes em audit_logs
npx wrangler d1 execute airtrust-db --env production \
  --command "SELECT COUNT(*) FROM audit_logs WHERE old_values LIKE '%admin.staging.test@example.invalid%' OR new_values LIKE '%admin.staging.test@example.invalid%';" \
  --remote
```
