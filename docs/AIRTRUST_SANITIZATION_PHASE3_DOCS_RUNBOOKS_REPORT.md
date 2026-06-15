# AirTrust Sanitization Phase 3 Docs Runbooks Report

Data local: 2026-06-14 22:57:40 -03

Modo: saneamento documental local. Nenhum deploy, push, migration, D1 remoto, R2, secret ou Cloudflare foi executado.

## Veredito

**FASE 3 COM RESSALVAS**

`docs/LOCAL_PROD_CLONE.md` foi reescrito como runbook sanitizado nao executavel. Os docs arquiteturais foram classificados, mas a maioria ainda precisa revisao humana antes de commit porque expoe estrutura operacional, rotas sensiveis, integrações, RBAC, FRMS, deploy ou detalhes de seguranca. As validacoes locais passaram.

## Inventario Git

- Branch atual: `main`
- HEAD local: `a1145e87e9992f50fcda8b64592fddc74beabee7`
- `origin/main`: `971f95fe8082d32d4621272c95d4468a28fcdd7f`
- Divergencia `origin/main...HEAD`: `0 31` ou seja, local 31 commits a frente e 0 atras.
- Staged: nenhum arquivo.
- Working tree ainda contem frentes nao relacionadas: branding/layout, regulated records experimental, LMS/SCORM, Controle de Voos/SIGVOOS docs e docs arquiteturais.

## Decisao Sobre `docs/LOCAL_PROD_CLONE.md`

### Achado antes do saneamento

O documento original continha:

- fluxo de clone local de D1 de producao;
- referencia a script de clone ja removido do working tree;
- comandos executaveis com `--remote`;
- criacao de dump SQL local;
- referencias a dados reais de producao;
- validacoes com `wrangler d1 execute`;
- risco de commit acidental de dump.

Nao foi identificado valor de secret exposto, mas o documento era operacionalmente sensivel.

### Classificacao

Risco antes: **alto**.

Risco depois: **medio**, porque ainda menciona conceitos proibidos para fins de governanca, mas nao fornece receita executavel de clone/export.

### Decisao

Reescrito como runbook seguro sanitizado:

- removeu comandos reais de clone/export/import;
- substituiu por checklist e pseudocodigo;
- proibiu explicitamente uso sem autorizacao formal;
- registrou que nao autoriza Cloudflare, D1 remoto, secrets, dump, staging, deploy ou migration;
- registrou que nao deve conter valores sensiveis nem dados reais.

Classificacao para commit: **commitavel com ressalvas**. Deve ser commitado apenas como documento interno de governanca, junto do relatorio desta fase, se a equipe aceitar manter esse tipo de runbook no repo.

## Classificacao Dos Docs Arquiteturais

| Documento | Achados | Classificacao | Decisao |
|---|---|---|---|
| `API_REFERENCE.md` | Exemplos de bearer token placeholder e CPF de exemplo; endpoints funcionais. Sem atribuicao de secret real detectada. | commitavel com ressalvas | Revisar exemplos e evitar dados que parecam reais. |
| `ARCHITECTURE_OVERVIEW.md` | Expoe topologia, nomes de ambientes, D1/R2, cron, deploy, secrets por nome e fluxo auth. Tambem parece conter dados possivelmente desatualizados de runtime/pipeline. | precisa revisao humana | Nao commitar antes de alinhar com Fases 1-3 e reduzir superficie operacional. |
| `AUTH_RBAC_MULTITENANCY.md` | Expoe JWT/RBAC/multi-tenant, rotas publicas/protegidas, rotas de manutencao e nomes de secrets. Sem valores reais detectados. | precisa revisao humana | Nao commitar sem revisao de seguranca/RBAC. |
| `DATABASE_SCHEMA.md` | Expoe nomes/ids parciais de bancos, tabelas, migrations, FRMS/SIGVOOS e convencoes. | precisa revisao humana | Nao commitar sem revisao de schema/governanca. |
| `DEPLOYMENT_AND_DEVOPS.md` | Contem comandos e descricoes de deploy/migrations de producao, fluxo desatualizado com push/pipeline e `--env production`/`--remote`. | manter fora do repo ate reescrever | Precisa sanitizacao forte em fase posterior. |
| `FRMS_ARCHITECTURE.md` | Expoe regras FRMS, endpoints, SIGVOOS como fonte canonica, referencias regulatórias e fluxo operacional. | precisa revisao humana | Nao commitar antes de revisao FRMS/regulatoria. |
| `FRONTEND_ARCHITECTURE.md` | Expoe fluxo de token no frontend, rotas e organizacao. Baixo risco relativo, sem secret real detectado. | commitavel com ressalvas | Pode seguir apos revisao de aderencia ao codigo atual. |
| `INTEGRATIONS.md` | Expoe SIGVOOS, rotas de maintenance, nomes de secrets, Brevo/Twilio/Cloudflare Browser/AI. Sem valores reais detectados. | precisa revisao humana | Nao commitar sem revisao de seguranca/integracoes. |
| `LMS_ARCHITECTURE.md` | Expoe arquitetura LMS, R2, cookies JWT e CSP. Sem valores reais detectados. | commitavel com ressalvas | Revisar detalhes de seguranca antes de publicar fora do time. |
| `MODULES_AND_FEATURES.md` | Catalogo de modulos, flags e rotas. Menor risco, mas menciona FRMS/SIGVOOS/backup. | commitavel com ressalvas | Pode seguir apos revisao de produto/aderencia. |
| `SECURITY.md` | Expoe modelo auth, RBAC, secrets por nome, rotas de manutencao, hashing, cookies e integrações. Sem valores reais detectados. | precisa revisao humana | Nao commitar sem revisao de seguranca. |

## Docs Aptos Para Commit Seletivo

Grupo seguro minimo:

- `docs/LOCAL_PROD_CLONE.md`
- `docs/AIRTRUST_SANITIZATION_PHASE3_DOCS_RUNBOOKS_REPORT.md`

Status: **seguro com ressalva**, desde que o repo aceite runbooks de governanca interna.

Grupo documental possivel apos revisao leve:

- `API_REFERENCE.md`
- `FRONTEND_ARCHITECTURE.md`
- `LMS_ARCHITECTURE.md`
- `MODULES_AND_FEATURES.md`

Status: **aguardar revisao humana** antes do commit, porque ainda podem expor detalhes internos ou divergir do estado real.

## Docs Que Devem Aguardar Revisao Humana

- `ARCHITECTURE_OVERVIEW.md`
- `AUTH_RBAC_MULTITENANCY.md`
- `DATABASE_SCHEMA.md`
- `DEPLOYMENT_AND_DEVOPS.md`
- `FRMS_ARCHITECTURE.md`
- `INTEGRATIONS.md`
- `SECURITY.md`

Motivo: superficie operacional/sensivel alta. Eles mencionam seguranca, deploy, D1, staging/producao, secrets por nome, RBAC, maintenance, FRMS, SIGVOOS ou integrações externas.

## Docs Controle De Voos/SIGVOOS

Nao alterados nesta fase, conforme escopo:

- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`

Devem aguardar fase propria. Nao criar `0411`; nao alterar SIGVOOS/FRMS/RBAC/multi-tenant.

## Bloqueios Restantes Antes De Staging/Deploy

1. Working tree ainda esta misturada em varias frentes.
2. Branch local esta 31 commits a frente de `origin/main`.
3. `DEPLOYMENT_AND_DEVOPS.md` precisa reescrita/sanitizacao antes de commit.
4. Docs de seguranca, RBAC, database, FRMS e integracoes precisam revisao humana.
5. Controle de Voos/SIGVOOS docs ainda exigem fase propria.
6. Regulated records experimental segue fora de qualquer plano de migration/staging.
7. LMS/SCORM ainda precisa decisao de versionamento/licenca/tamanho.
8. Guard operacional passa, mas ainda reporta warning em scripts historicos de sync.

## Validacoes

- `git diff --check`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como inventario
- `bash scripts/audit-dangerous-ops.sh`: PASS com warning residual em scripts historicos de sync

## Confirmacoes

- Nenhum comando remoto foi executado.
- Nenhum Cloudflare foi executado.
- Nenhum D1 remoto foi tocado.
- `airtrust-db-staging` nao foi tocado.
- Nenhum R2 foi tocado.
- Nenhum secret foi lido, listado, alterado ou exibido.
- Nenhum valor de secret foi exibido.
- Nenhum deploy foi feito.
- Nenhum push foi feito.
- Nenhuma migration foi aplicada.
- `git add .` e `git add -A` nao foram usados.
- Nenhum commit foi criado automaticamente.
- `0411` nao foi criado.
- Docs de Controle de Voos/SIGVOOS nao foram alterados.
- Codigo de SIGVOOS, FRMS, RBAC e multi-tenant nao foi alterado.
- Nenhum arquivo de `/tmp` foi movido para o repo.

## Recomendacao Objetiva Da Fase 4

Executar **Fase 4: Revisao e sanitizacao dos docs arquiteturais de alta sensibilidade**, com foco em:

1. Reescrever `DEPLOYMENT_AND_DEVOPS.md` para refletir gates atuais e remover comandos executaveis perigosos.
2. Revisar `SECURITY.md`, `AUTH_RBAC_MULTITENANCY.md` e `INTEGRATIONS.md` com postura de seguranca: manter nomes conceituais, remover rotas de manutencao sensiveis quando desnecessarias e evitar receitas operacionais.
3. Revisar `FRMS_ARCHITECTURE.md` com dono funcional/regulatorio antes de qualquer commit.
4. Separar docs publicos de docs internos.

Comando de commit seletivo seguro sugerido, se aprovado:

```bash
git add -- docs/LOCAL_PROD_CLONE.md docs/AIRTRUST_SANITIZATION_PHASE3_DOCS_RUNBOOKS_REPORT.md
git commit -m "docs: sanitize local production clone runbook"
```

Nao incluir docs arquiteturais nesse commit.
