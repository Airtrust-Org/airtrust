# Production Deploy Runbook — AirTrust

## Objetivo

Executar deploy controlado em produção somente após aprovação humana explícita
e cumprimento de todas as condições documentadas em `docs/PRODUCTION_READINESS_REPORT.md`.

**Este runbook NÃO autoriza deploy automático. Cada passo requer verificação humana.**

## Pré-requisitos

- Aprovação humana explícita (ver seção Aprovação)
- Janela de manutenção definida e comunicada
- **Backup/snapshot D1 produção executado e verificado** (ver seção Backup abaixo — OBRIGATÓRIO)
- Staging validado (todos os endpoints críticos 200)
- Testes passando (suite completa)
- TypeScript 0 erros
- Build PASS (worker + frontend)
- Rollback definido e documentado (ver `docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`)
- Responsável técnico presente durante todo o procedimento
- Canal de comunicação aberto para notificar usuários

## PASSO ZERO: Backup obrigatório antes de qualquer deploy

**Este passo é OBRIGATÓRIO. Nenhum deploy deve ocorrer sem backup confirmado.**

O plano completo de backup e rollback está em `docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`.

Resumo do procedimento (templates — não executar sem autorização):

```bash
# 1. Timestamp
DATE_STAMP=$(date -u +%Y%m%d-%H%M%S)
echo "Backup timestamp: $DATE_STAMP"

# 2. Backup completo D1 produção (schema + dados)
# ATENÇÃO: contém dados reais. NÃO commitar. Mover para fora do repositório.
npx wrangler d1 export airtrust-db \
  --env production \
  --remote \
  --output /secure/backups/airtrust/production/pre_deploy_${DATE_STAMP}.sql

# 3. Verificar integridade
ls -lh /secure/backups/airtrust/production/pre_deploy_${DATE_STAMP}.sql
grep -c "CREATE TABLE" /secure/backups/airtrust/production/pre_deploy_${DATE_STAMP}.sql

# 4. Backup lista de secrets (apenas nomes, não valores)
npx wrangler secret list --env production \
  > /secure/backups/airtrust/production/secrets_list_${DATE_STAMP}.txt
```

Checklist de backup:
- [ ] Arquivo de backup existe com tamanho > 10 MiB
- [ ] `grep -c "CREATE TABLE"` > 200 (schema presente)
- [ ] `grep -c "INSERT INTO"` > 100 (dados presentes)
- [ ] Arquivo movido para fora do repositório
- [ ] Timestamp do backup registrado neste documento
- [ ] Rollback Scenario A e B revisados (`docs/PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`)

**Backup timestamp:** _____________________ (preencher quando executado)

## Comandos proibidos

Estes comandos NUNCA devem ser executados sem aprovação explícita e plano documentado:

- Qualquer `wrangler d1 execute airtrust-db` com escrita (INSERT/UPDATE/DELETE/DROP/ALTER)
- Migrations em produção sem plano de rollback testado
- `DROP TABLE`, `DROP VIEW`, `TRUNCATE` em produção
- `DELETE FROM` sem `WHERE` ou com `WHERE` não validado
- `UPDATE` sem `WHERE` ou com `WHERE` não validado
- Deploy Pages produção sem aprovação
- Deploy Worker produção sem aprovação
- Alteração de secrets produção (`wrangler secret put/delete`) sem aprovação
- `wrangler d1 execute airtrust-db` com `--file` não revisado
- Qualquer comando que use `airtrust-db` (produção) quando o objetivo for staging
- Commit de senha, token, hash ou dump com dados reais

**Regra de ouro para D1:** sempre usar nomes de banco explícitos:
- Produção: `airtrust-db`
- Staging: `airtrust-db-staging`
- Nunca confundir os dois. O `--env` do wrangler NÃO substitui o nome do banco.

## Checklist pré-deploy

### Ambiente local
- [ ] `git status` limpo (sem arquivos modificados ou não rastreados)
- [ ] Branch correta: `main`
- [ ] Commit alvo identificado e anotado
- [ ] `git diff` revisado (todas as alterações são intencionais)
- [ ] Nenhum secret/token/senha/hash nos diffs
- [ ] `npx tsc --noEmit` → 0 erros (worker-airtrust/)
- [ ] `npm run test:all` → 750/750 passando
- [ ] `npm run build` (frontend) → PASS
- [ ] `npx wrangler deploy --dry-run` (worker) → PASS
- [ ] `npm run guard:auth-boundaries` → PASS
- [ ] `npm run guard:tracked-secrets` → PASS

### Staging
- [ ] Deploy staging executado e verificado
- [ ] `GET /api/health` → 200
- [ ] `GET /api/version` → 200
- [ ] `POST /api/auth/login` → 200 (usuário staging)
- [ ] `GET /api/auth/me` → 200 (com token staging)
- [ ] Smoke funcional dos módulos críticos: funcionários, empresas, qualificações
- [ ] Nenhum dado real em staging

### Produção (antes do deploy)
- [ ] Backup/snapshot D1 produção executado e verificado
- [ ] `GET /api/health` → 200 (pré-deploy baseline)
- [ ] `GET /api/version` → 200
- [ ] Timestamp do backup registrado
- [ ] Janela de manutenção iniciada

### Rollback
- [ ] Tag ou commit de rollback identificado (versão atual estável)
- [ ] Procedimento de rollback documentado
- [ ] Backup restaurado com sucesso em staging (teste de restauração)
- [ ] Tempo estimado de rollback: < 15 minutos

## Backup

### D1 produção — DDL + dados

**Não executar agora.** Quando autorizado, o procedimento esperado é:

```bash
# 1. Registrar timestamp
DATE_STAMP=$(date -u +%Y%m%d-%H%M%S)
echo "Backup timestamp: $DATE_STAMP"

# 2. Export schema + dados do D1 produção
# ATENÇÃO: este arquivo contém dados reais. NÃO commitar.
npx wrangler d1 export airtrust-db --env production --remote \
  --output backups/production/pre_deploy_${DATE_STAMP}.sql

# 3. Verificar integridade do dump
wc -l backups/production/pre_deploy_${DATE_STAMP}.sql
head -20 backups/production/pre_deploy_${DATE_STAMP}.sql

# 4. Mover para local seguro (fora do repositório)
mv backups/production/pre_deploy_${DATE_STAMP}.sql \
  /secure/backups/airtrust/production/
```

### Configs e secrets

```bash
# Listar secrets configurados (não captura valores, apenas nomes)
npx wrangler secret list --env production > backups/production/secrets_list_${DATE_STAMP}.txt
```

### Verificações pós-backup

- [ ] Arquivo de backup existe e tem tamanho > 0
- [ ] Backup contém CREATE TABLE e INSERT INTO
- [ ] Backup movido para fora do repositório (nunca commitado)
- [ ] Timestamp registrado em log de operações

## Deploy Worker produção

**Não executar agora.** Comando esperado:

```bash
# Deploy do worker para produção
cd worker-airtrust
npx wrangler deploy --env production

# Verificar deploy
curl -s https://api.airtrust.online/api/health
curl -s https://api.airtrust.online/api/version
```

**Antes de executar:**
- [ ] Commit alvo confirmado
- [ ] `wrangler deploy --dry-run` bem-sucedido
- [ ] Backup concluído

## Deploy Frontend produção

**Não executar agora.** O frontend é deployado via Cloudflare Pages.

Comando esperado (via `wrangler pages deploy` ou via Git integration):

```bash
# Build e deploy do frontend
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=airtrust --branch=main
```

**Cuidados:**
- Confirmar que o token Cloudflare tem permissão `Pages:Write`
- Verificar que o build aponta para API produção (`api.airtrust.online`), não staging
- Verificar que variáveis de ambiente de produção estão corretas

## Pós-deploy smoke produção

**Somente depois do deploy autorizado e concluído.**

### Smoke API (30 segundos)

```bash
PROD_API="https://api.airtrust.online"

# Health check
curl -sf $PROD_API/api/health && echo "health OK" || echo "HEALTH FAIL"

# Version check
curl -sf $PROD_API/api/version && echo "version OK" || echo "VERSION FAIL"

# Auth check (sem token — deve retornar 401)
curl -s -o /dev/null -w "%{http_code}" $PROD_API/api/auth/me
# Esperado: 401

# CORS preflight
curl -s -o /dev/null -w "%{http_code}" \
  -X OPTIONS \
  -H "Origin: https://airtrust.online" \
  -H "Access-Control-Request-Method: GET" \
  $PROD_API/api/funcionarios
# Esperado: 204
```

### Smoke funcional (2 minutos)

- [ ] Login com usuário real autorizado → 200, JWT retornado
- [ ] `GET /api/auth/me` com token → 200, perfil correto
- [ ] `GET /api/funcionarios` → 200, dados reais presentes
- [ ] `GET /api/empresas` → 200
- [ ] `GET /api/qualificacoes/tipos` → 200
- [ ] `GET /api/frms/alertas` → 200
- [ ] `GET /api/simuladores` → 200
- [ ] Logout → 200

### Monitoramento (5 minutos)

- [ ] Verificar logs de erro (5xx) nos primeiros 5 minutos
- [ ] Verificar latência (não deve exceder baseline pré-deploy)
- [ ] Verificar ausência de tenant leak (dados de empresa A visíveis para empresa B)
- [ ] Verificar se dados reais estão corretos e completos

### Smoke frontend

- [ ] `https://airtrust.online` carrega com HTTP 200
- [ ] Login funcional com credenciais reais
- [ ] Dashboard carrega sem erros
- [ ] Navegação entre módulos funciona
- [ ] DevTools confirma chamadas para `api.airtrust.online` (não staging)

## Critério de rollback

Executar rollback IMEDIATO se qualquer um destes ocorrer:

- **Login falha** em produção (POST /api/auth/login retorna 5xx ou falha de autenticação)
- **5xx generalizado** — qualquer endpoint crítico retorna erro
- **Tenant leak** — dados de uma empresa aparecem em outra
- **Dados reais incorretos** — registros faltando ou corrompidos
- **Erro de auth** — tokens JWT inválidos ou middleware de auth quebrado
- **Erro D1** — queries falhando ou retornando dados incorretos
- **Performance grave** — latência P95 > 5x baseline pré-deploy
- **Rotas críticas quebradas** — funcionários, empresas, qualificações, FRMS
  retornando erro

## Rollback

### Estratégia de rollback

**Cenário A: Rollback de Worker (sem alteração de banco)**

```bash
# 1. Identificar commit estável anterior
git log --oneline -5

# 2. Deploy da versão anterior
git checkout <commit-estavel>
cd worker-airtrust
npx wrangler deploy --env production

# 3. Verificar health
curl -sf https://api.airtrust.online/api/health

# 4. Smoke básico (3 endpoints críticos)
curl -sf https://api.airtrust.online/api/funcionarios
curl -sf https://api.airtrust.online/api/empresas

# 5. Voltar ao HEAD
git checkout main
```

**Cenário B: Rollback com restauração de banco**

```bash
# 1. Restaurar backup pré-deploy
# ATENÇÃO: comando real depende do método de backup usado
# Consultar arquivo de backup em /secure/backups/airtrust/production/

# 2. Reverter worker para versão compatível com o backup
git checkout <commit-estavel>
cd worker-airtrust
npx wrangler deploy --env production

# 3. Smoke funcional completo
# Verificar login, dados, módulos críticos

# 4. Voltar ao HEAD
git checkout main
```

### Comunicação durante rollback

- Notificar imediatamente os usuários sobre indisponibilidade
- Informar tempo estimado de recuperação
- Atualizar a cada 5 minutos até resolução
- Documentar timeline do incidente

## Comunicação

### Antes do deploy
- Notificar usuários com 24h de antecedência (mínimo)
- Informar janela de manutenção (início, duração estimada, impacto)
- Informar funcionalidades potencialmente afetadas

### Durante o deploy
- Início: "Deploy iniciado. Sistema pode apresentar instabilidade por até 15 minutos."
- Progresso: atualizar a cada etapa concluída
- Smoke: "Verificações pós-deploy em andamento."
- Conclusão: "Deploy concluído com sucesso. Sistema operacional." ou "Rollback iniciado."

### Em caso de incidente
- Reconhecer imediatamente
- Informar impacto (quais funcionalidades afetadas)
- Informar ETA de resolução
- Atualizar a cada 5-10 minutos
- Post-mortem em até 48h

### Canais
- Email para todos os usuários cadastrados
- Canal interno de alertas (Slack/Teams)
- Status page (se disponível)

## Aprovação

Este deploy requer aprovação humana explícita. Preencher antes de executar:

| Campo | Valor |
|-------|-------|
| Aprovado por | Filipe Passaroni Daumas (proprietário do projeto AirTrust) |
| Data | 2026-05-16 |
| Janela de manutenção | [HH:MM] — [HH:MM] UTC — a confirmar no dia |
| Commit alvo | 0f2efc103 (ou HEAD no dia do deploy) |
| Branch | main |
| Rollback validado | documentado — procedimento em PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md |
| Backup verificado | SIM — 76 MB, SHA256 bb833c7f..., 2026-05-15 18:55 |
| Staging validado | SIM — 11/11 rotas 200, 19/20 browser PASS (Fase 16) |
| Observações | CONDITIONAL GO aprovado em Fase 17. Ver docs/PRODUCTION_GO_NO_GO_DECISION.md |

---

**Este runbook é um documento de planejamento. Nenhum comando de deploy,**
**migration ou alteração de produção foi executado durante sua criação.**

**ATENÇÃO:** Consulte `docs/PRODUCTION_READINESS_REPORT.md` para a lista
completa de riscos remanescentes e condições antes da produção.

---

## Histórico de revisões

| Versão | Data | Fase | Descrição |
|--------|------|------|-----------|
| 1.0 | 2026-05-15 | Fase 12 | Criação inicial do runbook |
| 1.1 | 2026-05-15 | Fase 13 | Confirmação de pré-requisitos via re-validação completa. Staging: 11/11 rotas 200, TypeScript 0 erros, 355/355 testes. Nenhuma alteração no procedimento. |
| 1.2 | 2026-05-16 | Fase 17 | Decisão formal Go/No-Go: CONDITIONAL GO. Aprovação registrada. Todos os bloqueios operacionais resolvidos ou formalmente aceitos. Seção de Aprovação preenchida. |
| 1.3 | 2026-05-16 | Fase 19 | **DEPLOY EXECUTADO.** Worker (v13f22eb5) e Frontend (8d1328d6.airtrust.pages.dev) implantados em produção. Todos os smokes passaram. Smoke funcional (login real) pendente verificação humana. Ver `docs/PRODUCTION_DEPLOY_EXECUTION_REPORT.md`. |
| 1.4 | 2026-05-16 | Pós-Fase 19 | **PRODUÇÃO VALIDADA.** Validação humana completa por Filipe Passaroni Daumas — todos os itens PASS. D1 rollback drill executado com sucesso: backup restaurado em SQLite local, SHA256 verificado, 224 tabelas, integrity_check ok. Ver `docs/D1_ROLLBACK_DRILL_REPORT.md`. |

**Estado atual (Pós-Fase 19):** PRODUÇÃO VALIDADA. Deploy concluído e validado humanamente. D1 rollback drill aprovado — backup de 76 MB é restaurável. Rollback necessário: não.
