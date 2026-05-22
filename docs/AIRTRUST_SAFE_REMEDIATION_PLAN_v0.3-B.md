# AIRTRUST — Plano de Contenção e Remediação Segura
## v0.3-B · Planejamento Somente Leitura
**Data:** 2026-05-20  
**Baseado em:** `docs/AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md`  
**Branch:** `main`  
**HEAD no momento do planejamento:** `47181cc04f1f38ec877fefbf225ec11af0971c1d`  
**HEAD na auditoria:** `757be1bcd4476d7bdeb433b21ce53a64bfe50f87`  
**origin:** `git@github.com:airtrustsystem-alt/airtrust.git`  

> **ATENÇÃO:** Este documento é exclusivamente um plano de contenção. Nenhuma ação foi tomada. Nenhum arquivo foi alterado, deletado, movido, renomeado ou commitado nesta fase.

---

## 1. Sumário Executivo

A auditoria v0.3-A revelou problemas que exigem remediação estruturada e cuidadosa. Em uma experiência anterior de organização/limpeza direta no `main`, o repositório foi quebrado. Por isso, **nenhuma limpeza será feita diretamente no `main`**.

Este plano define:
- O que pode e não pode ser feito agora;
- A sequência correta de fases;
- Os critérios de autorização humana para cada fase;
- Os critérios de rollback;
- Os comandos proibidos nesta fase.

O único risco que requer ação externa imediata (fora do Git) é a **rotação de credenciais** no painel Cloudflare — sem tocar no repositório.

**Nota sobre divergência de HEAD:** Entre a auditoria (`757be1b`) e este planejamento (`47181cc`), houve um único commit legítimo: correção de compatibilidade da migração `0362_frms_daily_fatigue_v01.sql` com o D1 (remoção de `IF NOT EXISTS` em `ALTER TABLE`). Sem impacto nos achados de segurança.

---

## 2. Estado Git no Momento do Planejamento

| Item | Valor |
|---|---|
| Branch atual | `main` |
| HEAD local | `47181cc` |
| HEAD origin/main | `47181cc` (sync) |
| `git status` | Limpo — apenas `docs/AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md` untracked |
| Arquivos modified tracked | **0** — nenhum tracked modified inesperado |
| Remoto | `git@github.com:airtrustsystem-alt/airtrust.git` |

---

## 3. Por Que NÃO Será Feita Limpeza Direta no `main`

### 3.1 Histórico de Quebra

O repositório já foi quebrado em uma tentativa anterior de organização direta no `main`. Isso demonstra que:
- O source tree tem dependências não óbvias entre arquivos que parecem obsoletos;
- Ações "simples" como `git rm --cached` em batch podem remover referências que o build precisa;
- `git filter-repo` e BFG exigem `git push --force` no remote, o que desfaz commits de outros colaboradores se houver sincronização em paralelo;
- Scripts de deploy, workers e build podem referenciar arquivos via paths que só aparecem em runtime.

### 3.2 Risco de Force Push

A remoção de arquivos do histórico Git (BFG/filter-repo) exige `git push --force`. Isso:
- Reescreve o histórico do remote;
- Invalida todos os clones existentes;
- Pode quebrar pipelines de CI que usam SHA-specific references;
- É irreversível sem um backup explícito do estado anterior.

### 3.3 Princípio de Segurança

> **Nenhuma ação destrutiva no `main` sem:**
> 1. Clone isolado testado e validado;
> 2. Build completo comprovado no clone;
> 3. Lista explícita de arquivos afetados revisada por humano;
> 4. Janela de manutenção acordada;
> 5. Autorização explícita do responsável pelo sistema.

---

## 4. Matriz de Risco

### A. Risco de Segurança Imediato

| Achado | Arquivo | Credenciais Expostas | Severidade |
|---|---|---|---|
| Credenciais R2 de produção rastreadas | `.env.local.production` | R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY [REDACTED] | **CRÍTICA** |
| Token de banco de produção rastreado | `.env.local.production` | D1_AUTH_TOKEN [REDACTED] | **CRÍTICA** |
| Segredo JWT de sessão rastreado | `.env.local.production` | JWT_SECRET [REDACTED] | **CRÍTICA** |
| Credencial de conta de teste | `.env.test` | TEST_PASSWORD [REDACTED] | Alta |
| URL de API em env de produção | `.env.production` | Sem chaves de acesso — baixo risco, má prática | Média |
| URL de API frontend | `src/.env.production` | Apenas VITE_API_URL — baixo risco | Baixa |

**Impacto de `.env.local.production`:** Qualquer pessoa com acesso de leitura ao repositório (colaboradores, agentes de CI, ferramentas de terceiros) tem acesso a credenciais que permitem:
- Leitura e escrita no bucket R2 de produção (documentos, PDFs, vídeos de tripulantes);
- Leitura e escrita no banco D1 de produção (dados pessoais de tripulantes);
- Criação de tokens JWT válidos — equivalente a acesso admin ao sistema.

**Ação imediata recomendada (FORA DO GIT):** Ver Fase 2.

### B. Risco LGPD / Dados Pessoais

| Arquivo/Pasta | Conteúdo Estimado | Risco |
|---|---|---|
| `scripts/legacy/d1-prod-20260315-193839.sql` (18 MB) | Dump completo de produção — nomes, CPFs, licenças, qualificações de tripulantes | **LGPD P0** |
| `scripts/seed-local.sql` (19 MB) | Possivelmente derivado de dados reais de produção | **LGPD P0** |
| `scripts/legacy/backup_pre_multitenant_20251207_142032.sql` (4.7 MB) | Backup de produção pré-multitenant | **LGPD P0** |
| `_arquivos_nao_usados/sql_backups/prod_backup_20251122_*.sql` (5 × 1.7 MB) | Backups diretos de produção de novembro/2025 | **LGPD Alta** |
| `_arquivos_nao_usados/migrations/data-export/*.sql` (múltiplos ~700 KB) | Exportações de dados de produção | **LGPD Média** |

**Observação:** Esses arquivos estão no histórico Git e não podem ser "simplesmente deletados" — mesmo após `git rm`, permanecem em commits antigos e acessíveis via `git checkout <sha>`. A remoção real exige reescrita de histórico (BFG/filter-repo), que deve ser feita em clone isolado com autorização.

### C. Risco de Quebrar Produção ao Mexer

| Arquivo/Pasta | Risco se Removido Sem Verificação |
|---|---|
| Diretórios de cursos (CGA, Emergências, Offshore, PBN) | **Alto** — podem ser servidos como assets pelo worker-frontend ou referenciados por URLs em produção. Verificar se `/public/h5p-standalone` ou worker usa esses paths antes de remover. |
| `eng.traineddata`, `por.traineddata` | **Médio** — dados OCR. Verificar se algum serviço de extração de PDF usa esses arquivos em runtime. |
| `scripts/seed-local.sql` | **Médio** — pode ser usado por `npm run setup:local`. Verificar script antes de remover. |
| `worker-airtrust/.tmp-worker-bundle/` | **Baixo** — build artifact, mas verificar se wrangler referencia esse path em alguma config. |
| `.wrangler-dry/` | **Baixo** — provavelmente só usado em dry-runs locais. |
| Migrações `0367_` (conflito) | **Alto** — renomear uma migração que já foi aplicada em produção cria inconsistência entre D1 e o histórico de migrações. Verificar tabela `d1_migrations` antes de qualquer ação. |
| Migração `9999_` | **Médio** — número especial pode ser intencional no runner. Verificar se o wrangler usa ordering numérico ou alfabético. |
| `_arquivos_nao_usados/` | **Baixo** — o nome indica descarte intencional, mas verificar se algum script importa algo dali. |
| `__Arquivos - Upload/` (PDFs) | **Médio** — podem ser servidos por URL em produção. Verificar se há referência no banco ou no worker. |
| Páginas frontend órfãs | **Médio** — podem ter links hardcoded em outros componentes não encontrados pelo roteador. Verificar `grep -r` antes de remover. |
| Rotas `fix-renovadas.ts`, `deduplicate.ts` | **Médio** — mesmo sendo one-shot, podem ser chamadas por scripts operacionais. Verificar antes de desativar. |
| `debug-purge.ts` | **Baixo** — bloqueada em produção por env guard, mas presente no bundle. Remover é seguro, mas requer validação de build. |

### D. Risco Técnico

| Achado | Risco | Detalhe |
|---|---|---|
| 67 erros TypeScript no worker | **Alto** — silencioso em produção | `frms.ts` (~35), `frms-fira.ts` (6), `frms-relatorios-config.ts` (3), `alertas.ts` (1), `importacao.ts`, `qualificacoes/historico-write.ts`, `services/html-to-pdf.ts`, `services/pdf-generator.ts`, `utils/security.ts`. Padrão: `string | undefined` não tratado — pode causar runtime error em requisições malformadas. |
| Build mascarando erros TS | **Alto** — invisível no pipeline | `tsc --noEmit false` no build de produção ignora erros de tipo. Não há barreira de CI para tipos no worker. |
| Conflito `0367_` | **Alto** — não determinístico | Dois arquivos com mesmo prefixo. Se o runner usa ordenação alfabética, `0367_classificar` vem antes de `0367_sk76`. Se estiver por tamanho ou hash, pode variar. Resultado: comportamento de migração dependente de plataforma. |
| Migrações sem sequência (`132_`, `9999_`, `purge-soft-deleted`) | **Médio** | Podem nunca ser detectadas como "não aplicadas" pelo runner se o runner filtra por padrão `^\d{4}_`. |
| Rotas de admin ambíguas (4 arquivos `admin-migrate*`) | **Baixo** | Não estão registradas em `index.ts` — não são rotas ativas. Mas criam confusão sobre qual usar em emergência. |
| `debug-purge.ts` ativo no bundle | **Baixo** | Env guard presente mas aumenta superfície de ataque. |

---

## 5. Matriz "Pode Fazer Agora / Não Pode Fazer Agora"

| Ação | Pode Fazer Agora? | Por Quê? |
|---|---|---|
| **Rotacionar R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY no painel Cloudflare** | **SIM** (fora do Git) | Ação externa, reversível, não toca no repo. Reduz risco imediatamente. Requer rollback plan: manter chaves antigas por 15 min para drain de requests em voo. |
| **Rotacionar D1_AUTH_TOKEN no painel Cloudflare** | **SIM** (fora do Git) | Idem. Requer atualizar Wrangler Secrets antes de revogar o token antigo. |
| **Rotacionar JWT_SECRET via `wrangler secret put`** | **SIM** (fora do Git) | Invalida **todas as sessões ativas** — usuários precisarão fazer login novamente. Planejar janela de baixo tráfego. |
| **Adicionar `.env.local.production` ao `.gitignore`** | **SIM** (commit seguro) | Previne futuros commits acidentais. Não remove o arquivo do histórico, mas impede novos incidentes. |
| **Corrigir os 67 erros TypeScript no worker** | **SIM** (em branch separado) | Mudança de código pura, sem reescrita de histórico. Requer: branch dedicada, validação de typecheck, testes, PR revisado por humano. |
| **Adicionar `tsc --noEmit` ao CI/lint** | **SIM** (em branch separado) | Mudança de configuração, sem impacto destrutivo. |
| **Criar `docs/INDICE.md`** | **SIM** (commit seguro) | Adição de arquivo, sem remover nada. |
| **Criar tag de segurança `pre-cleanup-v1` no HEAD atual** | **SIM** (somente local/push de tag) | Preserva ponto de retorno antes de qualquer cirurgia futura. Não destrutivo. |
| **Remover `.env.local.production` do histórico Git (BFG)** | **NÃO agora** | Requer force push. Invalida histórico do remote. Deve ser feito em clone isolado com autorização e janela de manutenção. |
| **`git rm --cached` em qualquer arquivo** | **NÃO agora** | Gera commit que altera estado rastreado. Deve ser planejado em clone isolado primeiro. |
| **`git rm -r --cached _arquivos_nao_usados/`** | **NÃO agora** | Mesmo sendo "não usados", pode quebrar referências não documentadas. Verificar primeiro. |
| **Remover diretórios de cursos (CGA, Emergências, Offshore, PBN)** | **NÃO agora** | Alto risco de quebrar assets servidos em produção. Verificar URLs e referências antes. |
| **Renomear migration `0367_`** | **NÃO agora** | Verificar primeiro se foi aplicada em produção via tabela `d1_migrations`. |
| **Remover SQL dumps de produção** | **NÃO agora** | LGPD urgente mas requer clone isolado + BFG + autorização + force push. |
| **`git filter-repo`** | **NÃO nesta fase** | Reescreve SHA de todos os commits — invalida todos os clones e pipelines. |
| **Force push para `main`** | **NÃO sem autorização** | Irreversível se não houver backup. |
| **Executar deploy** | **NÃO** | Fora do escopo desta fase. |
| **Executar migrations** | **NÃO** | Fora do escopo desta fase. |
| **Apagar arquivos do filesystem** | **NÃO** | Qualquer deleção deve passar pelo processo de clone isolado. |

---

## 6. Plano Faseado Conservador

### FASE 0 — Congelamento e Ancoragem (Fazer Agora, Não Destrutivo)

**Objetivo:** Registrar o estado atual e criar ponto de retorno antes de qualquer ação futura.

**Ações autorizadas:**

```bash
# 1. Criar tag de segurança local (não modifica nada, apenas cria referência)
git tag -a pre-cleanup-v1 HEAD -m "Safety anchor before cleanup — 2026-05-20"

# 2. Verificar que a tag foi criada
git tag -l "pre-cleanup*"

# 3. Para publicar a tag (requer autorização separada):
# git push origin pre-cleanup-v1
```

**Verificações antes de prosseguir:**
- [ ] Confirmar que produção está funcionável (`curl https://api.airtrust.online/health`)
- [ ] Confirmar que não há deploy em andamento
- [ ] Confirmar que não há outros colaboradores com trabalho não sincronizado (`git branch -r` para branches remotas ativas)
- [ ] Confirmar que CI/CD não está rodando

**Critério de autorização:** Apenas o responsável do sistema. Nenhuma automação.

---

### FASE 1 — Rotação de Credenciais (Fora do Git)

**Objetivo:** Neutralizar o risco P0 de credenciais expostas sem tocar no repositório.

**Por que primeiro:** As credenciais no `.env.local.production` estão no histórico Git e acessíveis por qualquer pessoa com acesso ao repo. Mesmo após a limpeza futura do histórico, as credenciais antigas permanecerão válidas a menos que sejam rotacionadas. A rotação deve preceder qualquer outra ação.

**Sequência obrigatória:**

#### 1.1 — Preparação (antes de revogar)
```bash
# Verificar quais secrets estão atualmente configurados no worker de produção
cd worker-airtrust
npx wrangler secret list --env production
```
Confirmar que os secrets já estão configurados no Wrangler antes de revogar os do .env.

#### 1.2 — Rotação de R2 (Cloudflare Dashboard)
1. Acessar **Cloudflare Dashboard → R2 → Manage R2 API Tokens**
2. Criar novo par de chaves (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY)
3. Atualizar o worker via Wrangler Secrets **antes** de revogar as chaves antigas:
   ```bash
   npx wrangler secret put R2_ACCESS_KEY_ID --env production
   npx wrangler secret put R2_SECRET_ACCESS_KEY --env production
   ```
4. Validar que o worker ainda acessa o bucket corretamente
5. Revogar as chaves antigas no dashboard R2

#### 1.3 — Rotação de D1_AUTH_TOKEN
1. Acessar **Cloudflare Dashboard → D1 → API Tokens**
2. Gerar novo token com as mesmas permissões
3. Atualizar via Wrangler Secrets:
   ```bash
   npx wrangler secret put D1_AUTH_TOKEN --env production
   ```
4. Validar acesso ao banco
5. Revogar token antigo

#### 1.4 — Rotação de JWT_SECRET (impacto: todas as sessões serão invalidadas)
1. Gerar novo segredo seguro (mínimo 256 bits):
   ```bash
   openssl rand -hex 32
   ```
2. **Planejar janela de baixo tráfego** (ex: 3h–5h horário local)
3. Atualizar via Wrangler Secrets:
   ```bash
   npx wrangler secret put JWT_SECRET --env production
   ```
4. Validar que o login ainda funciona com o novo secret
5. **Todos os usuários logados precisarão fazer login novamente** — comunicar se necessário

#### 1.5 — Atualização do .gitignore (único commit autorizado nesta fase)
Após a rotação, adicionar regras ao `.gitignore` para prevenir novos commits acidentais de env files:
```gitignore
# Adicionar ao bloco ENVIRONMENT VARIABLES
.env.local.*
.env.production
.env.test
```
> **Nota:** Isso não remove os arquivos do histórico, apenas impede futuros commits. A remoção do histórico ocorre na Fase 3.

**Critério de autorização:** Responsável do sistema + confirmação de que produção continua funcionando após cada passo.

**Critério de rollback:**
- Se o worker falhar após rotação de R2: reverter secret para o valor anterior (chave antiga ainda válida durante janela de transição de 15 min)
- Se o worker falhar após rotação de D1: idem
- Se o login falhar após rotação de JWT: o problema está no valor do secret — recriar e tentar novamente

---

### FASE 2 — Correção dos 67 Erros TypeScript (Branch Normal)

**Objetivo:** Eliminar erros TS silenciosos no worker antes que causem runtime errors em produção.

**Por que em fase separada:** Misturar correção de código com limpeza estrutural aumenta blast radius de qualquer bug introduzido. Cada mudança deve ser isolada e reversível.

**Estratégia:**

```bash
# Criar branch dedicada
git checkout -b fix/worker-ts-errors

# Verificar estado atual
npx tsc -p worker-airtrust/tsconfig.json --noEmit 2>&1 | wc -l
# Esperado: 67 erros
```

**Prioridade de correção:**
1. `worker-airtrust/src/utils/security.ts` — security utils com erros = risco direto
2. `worker-airtrust/src/routes/alertas.ts` (1 erro) — correção rápida
3. `worker-airtrust/src/routes/frms-relatorios-config.ts` (3 erros)
4. `worker-airtrust/src/routes/frms-fira.ts` (6 erros)
5. `worker-airtrust/src/routes/frms.ts` (~35 erros) — maior volume, padrão repetitivo
6. `worker-airtrust/src/services/html-to-pdf.ts`, `pdf-generator.ts`
7. Demais arquivos

**Padrão de correção esperado:** `string | undefined` → adicionar guard `?? ''` ou validação de query params com Zod antes do processamento.

**Validação antes de PR:**
```bash
npx tsc -p worker-airtrust/tsconfig.json --noEmit
# Deve retornar 0 erros

npm run test:worker
# Deve passar todos os testes existentes
```

**Critério de autorização:** PR com diff revisado por humano. Nenhum merge automático.

**Critério de rollback:** `git revert` do commit de correção ou `git checkout main` da branch.

---

### FASE 3 — Clone Isolado para Ensaio de Limpeza de Histórico

**Objetivo:** Provar em ambiente isolado que o BFG/filter-repo pode remover os arquivos sensíveis sem quebrar o build.

**IMPORTANTE:** Esta fase NÃO afeta o repositório original. É um ensaio completo.

**Procedimento:**

```bash
# 1. Clonar em diretório temporário SEPARADO
git clone git@github.com:airtrustsystem-alt/airtrust.git /tmp/airtrust-clean-test
cd /tmp/airtrust-clean-test

# 2. Instalar dependências
npm install
cd worker-airtrust && npm install && cd ..

# 3. Registrar estado inicial
git ls-files | wc -l  # baseline de arquivos
du -sh . --exclude=.git --exclude=node_modules  # baseline de tamanho

# 4. Executar BFG para remoção de .env.local.production do histórico
# (apenas no clone, nunca no repo original)
bfg --delete-files .env.local.production
git reflog expire --expire=now --all && git gc --prune=now --aggressive

# 5. Verificar que o arquivo não existe mais em NENHUM commit
git log --all --full-history -- .env.local.production
# Esperado: nenhum resultado

# 6. Verificar que o build ainda funciona
npx tsc --noEmit  # frontend
npx tsc -p worker-airtrust/tsconfig.json --noEmit  # worker
npm run test:run  # testes frontend
npm run test:worker  # testes worker

# 7. Comparar lista de arquivos com original
git ls-files | sort > /tmp/clean-files.txt
# Comparar com lista original do main
```

**Arquivos candidatos para remoção em batch no clone:**
```
# Lote 1 — Credenciais e env (BFG por nome exato)
.env.local.production
.env.test  # verificar se TEST_PASSWORD é conta real

# Lote 2 — SQL dumps de produção (BFG por tamanho > 10 MB)
scripts/seed-local.sql
scripts/legacy/d1-prod-20260315-193839.sql

# Lote 3 — Binários pesados (BFG por tamanho > 5 MB, verificar exceções)
# ATENÇÃO: verificar se algum binário é necessário antes de incluir
eng.traineddata
por.traineddata
backup-*.tar.gz

# Lote 4 — Build artifacts (git rm --cached, não reescrita de histórico)
.wrangler-dry/index.js.map
worker-airtrust/.tmp-worker-bundle/index.js
worker-airtrust/.tmp-worker-bundle/index.js.map

# Lote 5 — Diretórios de cursos (SOMENTE após confirmar que não são servidos em produção)
# CGA - Conhecimentos Gerais de Aeronaves/
# Emergências Gerais/
# Operações Offshore/
# Operações PBN/
# NÃO incluir no lote 1 — verificar primeiro
```

**Critério de autorização para aplicar no repo real:**
- [ ] Build passa 100% no clone
- [ ] Todos os testes passam no clone
- [ ] Lista de arquivos removidos revisada e aprovada por humano
- [ ] Janela de manutenção acordada
- [ ] Backup do repo original em local separado antes de force push
- [ ] Comunicar todos os colaboradores sobre reescrita de histórico
- [ ] Todos os clones existentes devem ser descartados e re-clonados após o push

**Critério de rollback:**
- Se o build falhar no clone: identificar qual arquivo causou a falha, excluir do lote, repetir
- Se o force push para o remote quebrar algo: restaurar do backup do estado pré-BFG

---

### FASE 4 — Auditoria e Contenção das Migrações

**Objetivo:** Entender o estado real das migrações conflitantes antes de qualquer ação.

**Comandos de leitura autorizados:**

```bash
# Verificar quais migrações foram aplicadas em produção
# (somente leitura — não executa nada)
npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT name, applied_at FROM d1_migrations ORDER BY applied_at DESC LIMIT 20;"

# Verificar especificamente se 0367_ foi aplicada
npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT name FROM d1_migrations WHERE name LIKE '0367_%';"

# Verificar se 132_ e 9999_ foram aplicadas
npx wrangler d1 execute airtrust-db --remote \
  --command "SELECT name FROM d1_migrations WHERE name LIKE '132_%' OR name LIKE '9999_%';"
```

**Decisão baseada no resultado:**
- Se **ambas 0367_** foram aplicadas: o conflito não causou problema prático. Documentar e deixar como está, ou renomear a segunda para `0370_` em branch normal.
- Se **apenas uma 0367_** foi aplicada: a outra está pendente — verificar qual e aplicar manualmente com cuidado.
- Se **nenhuma 0367_** foi aplicada: renomear a segunda para `0370_` em branch normal antes de qualquer deploy que rode migrações.
- Para `132_`, `9999_`, `purge-soft-deleted`: mesma lógica — verificar se foram aplicadas antes de qualquer ação.

**Critério de autorização:** Nenhuma migração é executada até que o estado atual seja completamente compreendido. Qualquer execução de migração requer backup explícito do D1 antes.

---

### FASE 5 — Limpeza de Binários e Arquivos Pesados (Pós-Fase 3)

**Objetivo:** Reduzir tamanho do repositório removendo binários que não contribuem para o desenvolvimento.

**Pré-requisitos obrigatórios:**
- Fase 3 (ensaio em clone) concluída e aprovada;
- Para cada diretório de cursos: confirmar que não há URL de produção que serve esses arquivos diretamente do repo (verificar `worker-frontend/src`, scripts de deploy, e banco de dados);
- Para `eng.traineddata`/`por.traineddata`: confirmar que nenhum serviço de extração de texto usa esses arquivos em runtime.

**Verificações de segurança antes de remover cursos:**
```bash
# Verificar se há referências aos paths dos cursos nos workers
grep -r "CGA\|Emergências\|Offshore\|PBN" worker-airtrust/src/ --include="*.ts"
grep -r "CGA\|Emergências\|Offshore\|PBN" worker-frontend/src/ --include="*.ts"
grep -r "traineddata" worker-airtrust/src/ --include="*.ts"
grep -r "traineddata" src/ --include="*.ts" --include="*.tsx"
```

**Critério de autorização:** Cada grupo de arquivos removidos requer build + teste antes de avançar para o próximo grupo.

---

### FASE 6 — Limpeza de Documentação e Arquivos Órfãos

**Objetivo:** Organizar `docs/`, remover `perplexity_airtrust_sources/`, `.audit/`, `.dev-logs/`.

**Abordagem conservadora:** Começar por adições (criar `docs/INDICE.md`) antes de qualquer remoção. Remoções via `git rm --cached` em batch pequenosapós validação individual.

---

## 7. Critérios de Autorização Humana por Fase

| Fase | Quem Autoriza | Como Autorizar | O Que Deve Ser Validado Antes |
|---|---|---|---|
| Fase 0 (Tag de segurança) | Responsável do sistema | Confirmação verbal/escrita | Produção funcionando |
| Fase 1 (Rotação de credenciais) | Responsável do sistema | Autorização explícita por escrito | Wrangler Secrets configurados antes de revogar |
| Fase 2 (Correção TS) | Revisão de PR | Aprovação de PR no GitHub | typecheck + testes passando |
| Fase 3 (Clone isolado) | Responsável do sistema | Revisão da lista de arquivos afetados | Build passa 100% no clone |
| Fase 3 → Apply (Force push) | Responsável do sistema | Autorização explícita + janela de manutenção | Todos colaboradores notificados, backup do remote |
| Fase 4 (Auditoria migrações) | Automático (somente leitura) | N/A | Acesso wrangler d1 --remote configurado |
| Fase 4 → Ação (renomear migration) | Responsável do sistema | Autorização explícita | Status de aplicação verificado no D1 |
| Fase 5 (Binários) | Responsável do sistema | Revisão item a item | Fase 3 concluída, referências verificadas |
| Fase 6 (Docs) | Responsável do sistema | Aprovação de PR | Nenhum script referencia os caminhos removidos |

---

## 8. Critérios de Rollback por Fase

| Fase | Sinal de Problema | Ação de Rollback |
|---|---|---|
| Fase 0 | N/A | Deletar a tag local (`git tag -d pre-cleanup-v1`) |
| Fase 1 — R2 rotation | Worker retorna erro 403 em R2 | Restaurar chave anterior (ainda válida durante janela) |
| Fase 1 — D1 rotation | Queries ao banco falham | Restaurar token anterior |
| Fase 1 — JWT rotation | Login retorna 401 | Re-criar secret com valor anterior (requer que o valor tenha sido salvo antes) |
| Fase 2 — TS fix | Testes falham ou runtime error em staging | `git revert <commit-sha>` |
| Fase 3 — Clone | Build falha no clone | Identificar arquivo causador, excluir do lote, repetir |
| Fase 3 — Force push | Deploy falha após reescrita | Restaurar do backup pré-BFG, force push de volta |
| Fase 4 — Migration | Query retorna resultado inesperado | Nenhuma ação adicional — apenas documentar |
| Fase 5 | Asset quebrado em produção | Restaurar arquivo do backup local (`git show <sha>:<path> > arquivo`) |

---

## 9. Comandos Explicitamente Proibidos Nesta Fase

Os comandos abaixo **não devem ser executados** enquanto este plano não for explicitamente aprovado e cada fase não tiver sido autorizada individualmente:

```bash
# PROIBIDOS — reescrita de histórico
git filter-repo [qualquer argumento]
bfg [qualquer argumento] aplicado no repo original
git push --force
git push --force-with-lease

# PROIBIDOS — remoção de arquivos
git rm [qualquer argumento]
git rm --cached [qualquer argumento]
rm -rf [qualquer caminho do repo]
git clean -f
git clean -fd

# PROIBIDOS — reversão de estado
git reset --hard
git reset --soft HEAD~N
git checkout -- [arquivo]
git restore [arquivo]
git restore --source HEAD [arquivo]

# PROIBIDOS — modificação de commits
git commit --amend
git rebase -i

# PROIBIDOS — operações remotas de escrita
git push (exceto tag de segurança, com autorização)
wrangler deploy
wrangler d1 execute --remote (exceto SELECT em Fase 4)
npx wrangler pages deploy

# PROIBIDOS — migrações e banco
qualquer script que execute SQL de escrita remota
npm run db:qualificacoes:legacy-safe
npm run db:qualificacoes:fap14-sk76

# PROIBIDOS — alterações de source code nesta fase
editar qualquer arquivo .ts, .tsx, .sql, .toml, .json
```

---

## 10. Próximo Passo Recomendado

**Imediato — sem tocar no repo:**

> **FASE 1.2: Rotação de R2 credentials** no painel Cloudflare.

Motivo: É a ação de maior impacto de segurança que pode ser feita agora, sem risco de quebrar o repositório, sem reescrita de histórico, sem force push. As credenciais R2 dão acesso de escrita ao bucket de produção (documentos, PDFs de tripulantes). Devem ser rotacionadas antes de qualquer outra ação.

**Sequência recomendada:**
1. Criar tag de segurança `pre-cleanup-v1` localmente (Fase 0)
2. Rotacionar R2, D1, JWT no painel Cloudflare (Fase 1) — seguir a sequência 1.2 → 1.3 → 1.4
3. Adicionar regras ao `.gitignore` para env files (único commit desta fase)
4. Criar branch `fix/worker-ts-errors` e corrigir os 67 erros TypeScript (Fase 2)
5. Solicitar autorização formal para execução da Fase 3 (clone isolado + BFG)

---

## 11. Lista Explícita do que NÃO foi Alterado

Esta fase foi **exclusivamente de leitura e planejamento**. Os seguintes tipos de ação **não foram realizados**:

- ❌ Nenhum arquivo foi editado, criado além deste relatório, movido ou renomeado.
- ❌ Nenhum arquivo foi deletado.
- ❌ Nenhum `git add` foi executado.
- ❌ Nenhum `git commit` foi executado.
- ❌ Nenhum `git push` foi executado.
- ❌ Nenhum `git reset` foi executado.
- ❌ Nenhum `git clean` foi executado.
- ❌ Nenhum `git checkout` destrutivo foi executado.
- ❌ Nenhum `git restore` foi executado.
- ❌ Nenhum `git rm` foi executado.
- ❌ Nenhum BFG executado.
- ❌ Nenhum `git filter-repo` executado.
- ❌ Nenhum `wrangler deploy` executado.
- ❌ Nenhuma migration executada.
- ❌ Nenhuma escrita remota em banco de dados.
- ❌ Nenhuma credencial revogada automaticamente.
- ❌ Nenhum segredo impresso no output.
- ❌ Nenhum arquivo `.env` alterado.
- ❌ Nenhum arquivo de migration alterado.
- ❌ Nenhum source code alterado.
- ❌ Nenhum binário removido.
- ❌ Nenhum dump SQL removido.

**Únicos arquivos criados nesta fase:**
- `docs/AIRTRUST_REPOSITORY_HEALTH_AUDIT_v0.3-A.md` (criado na auditoria anterior)
- `docs/AIRTRUST_SAFE_REMEDIATION_PLAN_v0.3-B.md` (este documento)

Ambos são untracked (não commitados).

---

## Apêndice A — Lista Rápida de Arquivos Sensíveis para Referência

> Os valores reais dos secrets estão REDACTED. Este documento não imprime secrets.

| Arquivo | Tipo de Risco | Prioridade de Remoção do Histórico |
|---|---|---|
| `.env.local.production` | Credenciais de produção [REDACTED] | P0 — Fase 3, Lote 1 |
| `.env.test` | TEST_PASSWORD [REDACTED] | P1 — Fase 3, Lote 1 |
| `.env.production` | Configuração de produção (sem chaves) | P2 — Fase 3, Lote 1 |
| `src/.env.production` | URL de API apenas | P3 — Fase 3, Lote 1 |
| `scripts/legacy/d1-prod-20260315-193839.sql` | Dump de produção com dados pessoais | P0 LGPD — Fase 3, Lote 2 |
| `scripts/seed-local.sql` | Possíveis dados reais | P0 LGPD — Fase 3, Lote 2 |
| `scripts/legacy/backup_pre_multitenant_*.sql` | Backup de produção | P0 LGPD — Fase 3, Lote 2 |
| `_arquivos_nao_usados/sql_backups/*.sql` | Backups de produção | P1 LGPD — Fase 3, Lote 2 |

---

## Apêndice B — Checklist de Pré-Requisitos para Fase 3

Antes de executar qualquer limpeza de histórico em clone isolado:

- [ ] Produção está estável (health check OK)
- [ ] Fase 1 (rotação de credentials) concluída
- [ ] Fase 2 (correção TS) concluída ou em PR aprovado
- [ ] Nenhum deploy planejado nas próximas 4 horas
- [ ] Backup do estado do remote criado (`git clone --mirror`)
- [ ] Lista de arquivos para remoção aprovada por humano
- [ ] Todos os colaboradores notificados sobre reescrita de histórico
- [ ] Janela de manutenção acordada

---

*Gerado em 2026-05-20 · Airtrust Safe Remediation Plan v0.3-B · Somente leitura*
