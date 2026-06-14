# Controle de Voos N1 — Runbook: D1 Dedicado e Descartável para o Piloto

Data de criação: 2026-06-14  
Escopo: planejamento controlado, **sem execução**. Nenhum D1 criado, nenhuma migration aplicada, nenhum deploy, nenhum secret alterado, nenhuma alteração de código ou configuração.  
Documentos base:
- `docs/CONTROLE_DE_VOOS_N1_STAGING_MIGRATION_LEDGER_DIAGNOSIS.md`
- `docs/CONTROLE_DE_VOOS_N1_DIA0_STAGING_EXECUTION_REPORT.md`
- `docs/CONTROLE_DE_VOOS_N1_PILOTO_PREFLIGHT_TECNICO.md`
- `docs/CONTROLE_DE_VOOS_N1_PILOTO_PREVIEW_STAGING_EXECUTION_PACK.md`

---

## 1. Sumário Executivo

### Por que o staging atual não deve ser usado

O D1 `airtrust-db-staging` possui schema AirTrust materializado (231 tabelas) mas o ledger `d1_migrations` contém apenas 4 entradas — enquanto a cadeia local tem 381 arquivos SQL. O Wrangler vê 377 migrations pendentes, incluindo a `0410_controle_voos_n1_schema.sql`. Aplicar migrations nesse estado arrastaria até 377 pendências fora do escopo do piloto, com risco alto de falhas em DDL, dados inconsistentes e impossibilidade de rollback limpo. O Dia 0 de staging foi interrompido corretamente por esse gate, conforme `docs/CONTROLE_DE_VOOS_N1_DIA0_STAGING_EXECUTION_REPORT.md`.

Adicionalmente:
- O staging atual pode conter dados de outras operações que não devem ser misturados com o piloto.
- Corrigir o ledger manualmente exige uma fase separada de rebaseline com aprovação própria.
- Bypassar o Wrangler aplicando a `0410` por SQL direto deixaria o ledger falso e criaria ambiguidade para futuras migrations.

### Por que D1 dedicado é a opção recomendada

Um D1 dedicado e descartável para o piloto oferece:

- **Ledger limpo**: nenhuma pendência histórica; o Wrangler enxerga apenas a cadeia canônica a partir de um baseline conhecido.
- **Escopo controlado**: aplica-se apenas o baseline mínimo necessário para login/RBAC e a `0410`. Nada mais.
- **Rollback trivial**: o D1 pode ser descartado integralmente ao final do piloto sem afetar staging ou produção.
- **Isolamento total**: nenhuma dependência de estado do staging atual, nenhuma contaminação de dados.
- **Rastreabilidade**: snapshot antes e depois documentado; qualquer anomalia é contida no ambiente descartável.

Essa é a **Opção B** descrita no diagnóstico, marcada como GO condicionado.

### O que este runbook autoriza e o que não autoriza

**Autoriza (apenas planejamento):**
- Leitura e análise dos arquivos de referência.
- Definição de estratégia, nomes, comandos propostos e baseline mínimo.
- Criação deste documento.

**Não autoriza — exige decisão humana explícita antes de executar:**
- Criar qualquer D1 no Cloudflare.
- Alterar `wrangler.toml`, `wrangler.dev.toml` ou qualquer arquivo de configuração.
- Aplicar qualquer migration.
- Fazer qualquer deploy.
- Alterar secrets.
- Tocar `airtrust-db` (produção).
- Tocar `airtrust-db-staging` (não é o alvo deste runbook).
- Aplicar ou criar a migration `0411`.
- Integrar SIGVOOS, FRMS, MRO, eDB, SDRMe ou Records Core.
- Fazer commit de código ou configuração.

---

## 2. Decisão de Ambiente

### Proposta de D1 dedicado

| Atributo | Valor proposto |
|---|---|
| **Nome do D1** | `airtrust-db-pilot-cv-n1` |
| **Nome lógico do ambiente** | `pilot-cv-n1` |
| **Duração prevista** | 5 dias de piloto + até 3 dias de preparação (Dia 0) = máximo 8 dias corridos |
| **Data prevista de criação** | Após aprovação explícita deste runbook |
| **Data prevista de descarte** | Após decisão GO/NO-GO do Dia 5 do piloto, com aprovação do sponsor |
| **Escopo de dados** | Apenas dados controlados de piloto: 1 empresa-tenant fictícia, 3–5 usuários de teste, 5–20 voos sintéticos, catálogos mínimos |
| **Dados proibidos** | Dados reais de produção, CPF/matrícula reais, registros operacionais vigentes |
| **Quem pode acessar o D1** | Admin técnico do piloto (via Wrangler CLI); nenhum outro acesso direto ao banco |
| **Quem pode acessar a API** | Apenas usuários de teste listados no briefing do piloto |
| **Destruição ao final** | D1 descartado via `wrangler d1 delete` após GO/NO-GO; snapshot exportado antes do descarte |
| **O que é preservado** | Snapshot exportado (`wrangler d1 export`), documentação, feedbacks operacionais, templates preenchidos |

### Observação sobre o nome

O nome `airtrust-db-pilot-cv-n1` é explicitamente descritivo para evitar confusão com `airtrust-db` (produção) e `airtrust-db-staging`. O prefixo `pilot-cv-n1` sinaliza ambiente temporário e finalidade. Qualquer pessoa vendo o nome no painel Cloudflare deve reconhecer que é piloto descartável.

---

## 3. Estratégia de Configuração

### Como o D1 dedicado seria criado

O D1 seria criado por comando explícito `wrangler d1 create` com o nome proposto. O comando retorna o UUID do D1 criado, que seria usado no binding temporário.

### Como o binding seria configurado — opções

Há quatro abordagens para configurar o binding sem alterar os arquivos canônicos:

#### Opção 3A — Arquivo temporário `wrangler.pilot-cv-n1.toml` (recomendada)

Criar um arquivo temporário `worker-airtrust/wrangler.pilot-cv-n1.toml` com apenas o binding do D1 do piloto e referência ao `main = "src/index.ts"`. Esse arquivo:
- Não altera `wrangler.toml` nem `wrangler.dev.toml`.
- É explicitamente temporário e pode ser adicionado ao `.gitignore` ou simplesmente não comitado.
- Todos os comandos Wrangler usariam `--config wrangler.pilot-cv-n1.toml` explicitamente.
- Elimina risco de o binding apontar para staging ou produção por engano.

**Vantagem:** isolamento máximo, sem risco de contaminar a configuração canônica.  
**Risco:** arquivo temporário pode ser esquecido no repo ou comitado acidentalmente. Mitigação: adicionar ao `.gitignore` ou destruir após o piloto.

#### Opção 3B — Env dedicado em `wrangler.toml`

Adicionar `[env.pilot-cv-n1]` em `wrangler.toml` com o binding do D1 do piloto.

**Vantagem:** usa a estrutura existente de envs do Wrangler.  
**Risco:** altera `wrangler.toml`, arquivo canônico rastreado. Qualquer erro tipográfico no UUID ou no `database_name` pode criar ambiguidade. Fica visível em `git diff` e exige cuidado no commit. **Não recomendado** — preferir Opção 3A.

#### Opção 3C — Wrangler Pages/Workers Preview isolado

Usar `wrangler dev --remote --config wrangler.pilot-cv-n1.toml` para rodar um Worker isolado que aponta apenas para o D1 do piloto.

**Vantagem:** simula ambiente de preview sem deploy formal.  
**Risco:** requer configuração adicional de rotas e JWT_SECRET próprio para o Worker de piloto. Mais complexo que necessário para o escopo N1.

#### Opção 3D — Comando explícito com `--d1 DB=<uuid>` inline

Alguns comandos Wrangler aceitam override de binding inline. Não recomendado para migrations, pois o controle de ledger depende da configuração declarada no TOML.

### Recomendação

**Opção 3A**: criar `worker-airtrust/wrangler.pilot-cv-n1.toml` temporário. Todos os comandos do piloto referenciam esse arquivo explicitamente. O arquivo não entra no commit canônico.

### Riscos de alterar `wrangler.toml`

- Alterar `wrangler.toml` com UUID errado pode fazer o deploy de staging ou produção apontar para o D1 do piloto.
- Um `wrangler deploy --env staging` executado por erro usaria o D1 do piloto, corrompendo o ambiente ou enviando dados de piloto para o Worker de staging.
- O risco é assimétrico: errar no arquivo temporário afeta apenas o piloto. Errar em `wrangler.toml` pode afetar staging ou produção.

### Não misturar com produção nem staging atual

O wrangler.toml canônico define:
- `airtrust-db-staging`, id `b7f50907-c110-45f5-ad17-e97ea47f2826` — staging atual, não tocar neste fluxo.
- `airtrust-db`, id `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` — produção, absolutamente proibido.

O D1 do piloto terá UUID distinto, gerado na criação, e estará apenas em `wrangler.pilot-cv-n1.toml`.

---

## 4. Baseline Mínimo de Schema

O piloto requer apenas o subconjunto de schema suficiente para:

1. Fazer login com JWT.
2. Resolver RBAC e empresa_id via middleware.
3. Servir os endpoints de Controle de Voos (`cv_*`).

### Tabelas obrigatórias para login e RBAC

```text
empresas
usuarios
user_platform_roles
```

`empresas` e `usuarios` são as tabelas centrais do sistema de autenticação. `user_platform_roles` controla permissões de plataforma (admin, manager, etc.). Essas três tabelas são suficientes para o middleware `auth` + `tenantMiddleware` funcionarem.

### Tabelas `cv_*` da migration 0410

Todas as 8 tabelas criadas por `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`:

```text
cv_aeroportos
cv_tipos_voo
cv_naturezas_voo
cv_motivos_operacionais
cv_voos
cv_rdv_operacional
cv_voo_tripulantes
cv_voo_eventos
```

Mais os índices associados a cada tabela.

### Seeds controlados mínimos

**Na tabela `empresas`:**
- 1 registro: empresa fictícia do piloto (ex: `Piloto Airtrust CV N1 Ltda`), `id = 1`.

**Na tabela `usuarios`:**
- 1 usuário admin: `admin-pilot@pilot.airtrust.local` com senha hasheada controlada.
- 1 usuário editor: `editor-pilot@pilot.airtrust.local`.
- 1 usuário viewer: `viewer-pilot@pilot.airtrust.local`.
- Todos com `empresa_id = 1`.

**Nos catálogos `cv_*`:**
- 3–5 aeroportos de piloto em `cv_aeroportos` (ex: SBBR, SBGR, SBSP).
- 2–3 tipos de voo em `cv_tipos_voo` (ex: Regular, Fretamento).
- 2–3 naturezas de voo em `cv_naturezas_voo` (ex: Doméstico, Internacional).
- 2–3 motivos operacionais em `cv_motivos_operacionais`.

**Em `cv_voos`:**
- 5–10 voos passados sintéticos (datas anteriores à data do piloto) para exercitar o fluxo de RDV sem pressão operacional.
- Todos com `empresa_id = 1`.

### O que não precisa existir

Os módulos abaixo **não precisam** ter tabelas no D1 do piloto:

```text
funcionarios e toda a cadeia de qualificacoes_*
frms_jornada, frms_acumulo_rolling e toda cadeia FRMS
lms_cursos, lms_matriculas e toda cadeia LMS
escalas_*, evd_*
documentos
audit_events_v2
support_access_sessions
sigvoos_*, integracoes_sigvoos_*
regulated_* (absolutamente proibido)
cv_voo_etapas, cv_sigvoos_staging, cv_conflitos_integracao (schema 0411, proibido)
```

---

## 5. Estratégia para Aplicar Migrations

### Cinco opções comparadas

#### Opção A — Aplicar cadeia completa no D1 novo (381 migrations)

Criar D1 novo vazio e executar `wrangler d1 migrations apply` sem filtro, aplicando toda a cadeia histórica.

| Critério | Avaliação |
|---|---|
| Vantagem | Ledger fica 100% sincronizado com a cadeia local; ambiente mais próximo da produção |
| Risco | Muitas migrations históricas podem ter dependências entre si ou dados que não existem no banco novo; tempo de execução longo; falhas em migrations antigas podem bloquear toda a cadeia |
| Complexidade | Alta — exige resolver qualquer falha individual antes de avançar |
| Impacto no piloto | Atrasa significativamente; traz tabelas e dados irrelevantes ao escopo |
| Recomendação | **Não recomendado** para o piloto N1 |

#### Opção B — Aplicar baseline mínimo + 0410 (recomendada)

Criar D1 novo vazio. Aplicar manualmente, via `wrangler d1 execute --file`, apenas:
1. Um SQL de baseline mínimo com DDL de `empresas`, `usuarios` e `user_platform_roles`.
2. A migration `0410_controle_voos_n1_schema.sql`.
3. Registrar manualmente as 2 entradas no `d1_migrations` para o Wrangler não marcar como pendente futuro.

| Critério | Avaliação |
|---|---|
| Vantagem | Escopo mínimo; setup rápido (< 30 min); rollback trivial; sem risco de migration antiga falhar |
| Risco | O ledger terá apenas 2 entradas; se o Wrangler for executado futuramente sem controle, mostrará 379 pendentes — exige disciplina de uso do arquivo temporário de config |
| Complexidade | Baixa — 3 arquivos SQL, 2 `INSERT` no ledger |
| Impacto no piloto | Mínimo — ambiente pronto rapidamente, scope exato do piloto |
| Recomendação | **Recomendado** |

#### Opção C — Importar dump controlado do banco local

Executar `npm run setup:local` para preparar o banco local (que já aplica `0410`), exportar via `sqlite3 .dump` e importar no D1 remoto via `wrangler d1 execute --file dump.sql`.

| Critério | Avaliação |
|---|---|
| Vantagem | Reutiliza o fluxo já existente e testado do `setup-local-db.sh`; inclui seed local já validado |
| Risco | O dump do banco local inclui dados de desenvolvimento (usuários de dev, senhas de dev, registros mock) que não devem ir para ambiente de piloto com usuários reais; conversão SQLite→D1 pode ter incompatibilidades de pragma |
| Complexidade | Média — requer sanitização do dump antes de importar |
| Impacto no piloto | Possível contaminação de dados de dev no ambiente de piloto; não recomendado sem sanitização explícita |
| Recomendação | Viável como variante da Opção B, **somente com sanitização rigorosa do dump** |

#### Opção D — Usar local apenas (sem D1 remoto)

Executar o piloto inteiramente no banco local via `wrangler dev --local`.

| Critério | Avaliação |
|---|---|
| Vantagem | Sem risco de tocar nenhum recurso remoto; setup mais rápido |
| Risco | Banco local é por máquina — usuários remotos (OCC real, gestor, piloto) não conseguem acessar; não é um ambiente de piloto formal com múltiplos usuários |
| Complexidade | Baixa tecnicamente, mas inviável operacionalmente para piloto com equipe |
| Impacto no piloto | Impossibilita o piloto multi-usuário real |
| Recomendação | **Não recomendado** para piloto formal; adequado apenas para testes de desenvolvedor |

#### Opção E — Usar staging atual corrigido (rebaseline do ledger)

Corrigir o ledger do `airtrust-db-staging` inserindo as 377 migrations como aplicadas, depois aplicar apenas a `0410`.

| Critério | Avaliação |
|---|---|
| Vantagem | Reutiliza o D1 existente; sem criação de novo recurso |
| Risco | Mutação manual do ledger em banco de staging que pode ser compartilhado; requer análise arquivo-a-arquivo para garantir que o schema remoto é compatível com o ledger corrigido; altíssimo risco de divergência |
| Complexidade | Muito alta — é a fase de rebaseline mencionada no diagnóstico como trabalho separado |
| Impacto no piloto | Atrasa o piloto; não é o caminho correto para o N1 |
| Recomendação | **Não recomendado** para este piloto; fazer em fase separada se necessário |

### Recomendação consolidada

**Opção B**: baseline mínimo + `0410`. É o caminho mais rápido, mais seguro e com escopo exato para o piloto N1. Qualquer desvio exige autorização explícita adicional.

---

## 6. Snapshot e Rollback

### Snapshot antes do uso

Após criar o D1 e antes de qualquer uso por usuários:

```bash
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
cd worker-airtrust
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --output ../docs/snapshots/pilot-cv-n1-pre-seed-$(date +%Y%m%d%H%M%S).sql
```

O arquivo de snapshot deve ser armazenado fora do repositório (ou em pasta ignorada pelo `.gitignore`) se contiver dados fictícios que não devem ser comitados.

### Snapshot após seed

Após aplicar o seed controlado e antes de liberar acesso aos usuários:

```bash
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
cd worker-airtrust
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --output ../docs/snapshots/pilot-cv-n1-post-seed-$(date +%Y%m%d%H%M%S).sql
```

### Como descartar o D1 ao final

Após decisão GO/NO-GO do Dia 5 e com snapshots preservados:

```bash
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
npx wrangler d1 delete airtrust-db-pilot-cv-n1
```

O comando pedirá confirmação. Confirmar somente após verificar que o snapshot pós-seed foi salvo e que o sponsor aprovou o descarte.

### Como restaurar se necessário durante o piloto

Se o ambiente for corrompido durante o piloto e precisar ser restaurado ao estado pós-seed:

```bash
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
# 1. Deletar e recriar o D1
npx wrangler d1 delete airtrust-db-pilot-cv-n1
npx wrangler d1 create airtrust-db-pilot-cv-n1
# 2. Importar o snapshot pós-seed
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --file ../docs/snapshots/pilot-cv-n1-post-seed-<timestamp>.sql
```

### Como garantir que produção não seja tocada

- Todo comando de piloto usa `--config wrangler.pilot-cv-n1.toml` explicitamente.
- `wrangler.pilot-cv-n1.toml` não contém referência a `airtrust-db` (produção) nem a `airtrust-db-staging`.
- Nenhum comando usa `--env production`.
- O UUID do D1 do piloto é diferente dos UUIDs de staging e produção.
- Antes de qualquer comando, confirmar visualmente o `database_name` no arquivo de config.

---

## 7. Dados Controlados

### Quantidade de voos

- **Mínimo:** 5 voos sintéticos.
- **Máximo:** 20 voos sintéticos.
- **Recomendado:** 10 voos, todos com datas passadas (antes da data de início do piloto), para exercitar RDV sem pressão de tempo operacional.
- Cada voo deve ter: `prefixo` único, `origem_id` e `destino_id` de aeroportos do catálogo seed, `tipo_voo_id` e `natureza_voo_id` dos catálogos seed, `status = 'planejado'` ou `'concluido_operacionalmente'`, `empresa_id = 1`.

### Usuários de teste

| Usuário | Email | Perfil | Empresa |
|---|---|---|---|
| Admin piloto | `admin-pilot@pilot.airtrust.local` | `admin` | 1 |
| Editor OCC | `editor-pilot@pilot.airtrust.local` | `editor` (com permissão `controle_voos_write`) | 1 |
| Viewer gestor | `viewer-pilot@pilot.airtrust.local` | `viewer` | 1 |

Todos os usuários têm senhas hashed conhecidas apenas pelo admin técnico do piloto. Senhas nunca em plain text no repositório ou em documentos.

### Perfis viewer/editor/admin

- **viewer**: pode acessar dashboard, lista de voos, detalhe, RDV em leitura. Não pode criar, editar ou finalizar voos nem RDV.
- **editor** (com `controle_voos_write`): pode criar e editar voos, preencher e finalizar RDV. Não pode administrar usuários.
- **admin**: acesso completo ao módulo. Usado pelo admin técnico para configuração e validação.

### Empresa/tenant

- Apenas 1 empresa-tenant fictícia: `empresa_id = 1`.
- Nome sugerido: `Piloto Interno CV-N1`.
- Nenhum CNPJ real ou nome de operador real.

### Dados que não devem ser usados

- CPFs, matrículas ou nomes reais de tripulantes.
- Dados de voos reais da operação.
- Dados exportados de produção.
- Qualquer dado que identifique passageiros, clientes ou operação vigente.
- Registros de operação regulada ou fiscal.

### Regra de sanitização

Todo dado inserido no D1 do piloto deve ser:

1. **Fictício ou sintético**: sem correspondência com operação real.
2. **Identificado**: prefixos como `PILOT-`, `TEST-` em campos de texto livre onde aplicável.
3. **Sem PII**: nenhum dado pessoal identificável real.
4. **Reversível**: ao descartar o D1, todos os dados de piloto desaparecem sem rastro em produção ou staging.

---

## 8. Comandos Propostos — NÃO EXECUTAR

Esta seção lista todos os comandos relevantes. Eles estão organizados por categoria de risco. **Nenhum comando foi executado.**

### 8.1 Comandos read-only (auditoria e verificação)

Estes comandos podem ser executados para auditoria sem risco:

```bash
# Verificar UUID do D1 criado (após criação autorizada)
npx wrangler d1 list

# Verificar migrations pendentes no D1 do piloto
cd worker-airtrust
npx wrangler d1 migrations list airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote

# Verificar tabelas presentes no D1 do piloto
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT name, type FROM sqlite_master WHERE type = 'table' ORDER BY name;"

# Verificar tabelas cv_*
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%' ORDER BY name;"

# Verificar ausência de regulated_*
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT COUNT(*) AS regulated_count FROM sqlite_master WHERE type = 'table' AND name LIKE 'regulated_%';"

# Verificar ledger de migrations
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT * FROM d1_migrations ORDER BY id;"

# Verificar contagem de voos no seed
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT COUNT(*) AS voos FROM cv_voos WHERE deleted_at IS NULL;"

# Verificar ausência de 0411 no workspace
rg --files worker-airtrust/migrations | rg '(^|/)0411|0411_'

# Confirmar que wrangler.pilot-cv-n1.toml não aponta para producao
grep -E "database_name|database_id" worker-airtrust/wrangler.pilot-cv-n1.toml
```

### 8.2 Comandos que criam D1 — EXIGEM AUTORIZAÇÃO HUMANA EXPLÍCITA

```bash
# ============================================================
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
# ============================================================

# Criar o D1 dedicado ao piloto
npx wrangler d1 create airtrust-db-pilot-cv-n1

# IMPORTANTE: guardar o UUID retornado pelo comando acima.
# Ele será necessário para o binding em wrangler.pilot-cv-n1.toml.
```

### 8.3 Conteúdo proposto do arquivo temporário de config

Este arquivo **não deve ser criado** sem autorização. O conteúdo proposto é:

```toml
# wrangler.pilot-cv-n1.toml
# Arquivo temporário para o piloto Controle de Voos N1.
# NÃO COMITAR. NÃO USAR COM --env production.
# Destruir após o encerramento do piloto.

name = "airtrust-api"
main = "src/index.ts"
compatibility_date = "2025-11-22"
compatibility_flags = ["nodejs_compat"]

[vars]
ENVIRONMENT = "pilot-cv-n1"

[[d1_databases]]
binding = "DB"
database_name = "airtrust-db-pilot-cv-n1"
database_id = "<UUID-GERADO-NA-CRIACAO>"
migrations_dir = "./migrations"

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage-staging"
preview_bucket_name = "airtrust-storage-staging"

[ai]
binding = "AI"
```

O `<UUID-GERADO-NA-CRIACAO>` deve ser substituído pelo UUID real retornado pelo `wrangler d1 create`, após autorização.

### 8.4 Comandos que aplicam migrations — EXIGEM AUTORIZAÇÃO HUMANA EXPLÍCITA

```bash
# ============================================================
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
# ============================================================

cd worker-airtrust

# Passo 1: Aplicar baseline mínimo de schema (DDL de empresas, usuarios, user_platform_roles)
# O arquivo scripts/pilot-cv-n1-baseline.sql deve ser criado antes com autorização.
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --file ../scripts/pilot-cv-n1-baseline.sql

# Passo 2: Aplicar a migration 0410
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --file migrations/0410_controle_voos_n1_schema.sql

# Passo 3: Registrar as entradas no ledger d1_migrations
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('pilot-cv-n1-baseline.sql'), ('0410_controle_voos_n1_schema.sql');"

# Passo 4: Aplicar seed de dados controlados
# O arquivo scripts/pilot-cv-n1-seed.sql deve ser criado antes com autorização.
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --file ../scripts/pilot-cv-n1-seed.sql
```

### 8.5 Comandos de snapshot — EXIGEM AUTORIZAÇÃO HUMANA EXPLÍCITA

```bash
# ============================================================
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
# ============================================================

# Snapshot pré-seed
cd worker-airtrust
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --output ../docs/snapshots/pilot-cv-n1-pre-seed-$(date +%Y%m%d%H%M%S).sql

# Snapshot pós-seed (antes de liberar usuários)
cd worker-airtrust
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote \
  --output ../docs/snapshots/pilot-cv-n1-post-seed-$(date +%Y%m%d%H%M%S).sql
```

### 8.6 Comandos de validação (pós-autorização, read-only no D1 do piloto)

```bash
# Confirmar 8 tabelas cv_*
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%' ORDER BY name;"
# Esperado: cv_aeroportos, cv_motivos_operacionais, cv_naturezas_voo, cv_rdv_operacional,
#           cv_tipos_voo, cv_voo_eventos, cv_voo_tripulantes, cv_voos

# Confirmar ausência de regulated_*
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT COUNT(*) AS regulated_count FROM sqlite_master WHERE type = 'table' AND name LIKE 'regulated_%';"
# Esperado: regulated_count = 0

# Confirmar ausência de tabelas 0411
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT COUNT(*) AS schema_0411_count FROM sqlite_master WHERE type = 'table' AND name IN ('cv_voo_etapas','cv_sigvoos_staging','cv_conflitos_integracao');"
# Esperado: schema_0411_count = 0

# Confirmar empresa e usuarios do seed
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT id, nome FROM empresas WHERE deleted_at IS NULL;"

npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT id, email, empresa_id FROM usuarios WHERE deleted_at IS NULL;"

# Confirmar voos do seed
cd worker-airtrust
npx wrangler d1 execute airtrust-db-pilot-cv-n1 \
  --config wrangler.pilot-cv-n1.toml \
  --remote --json \
  --command "SELECT COUNT(*) AS voos, MIN(data_programacao) AS data_min, MAX(data_programacao) AS data_max FROM cv_voos WHERE deleted_at IS NULL;"
```

### 8.7 Comandos de descarte — EXIGEM AUTORIZAÇÃO HUMANA EXPLÍCITA

```bash
# ============================================================
# NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA
# Executar SOMENTE após snapshot confirmado e aprovação do sponsor
# ============================================================

# Verificar que snapshot foi salvo antes de deletar
ls -la docs/snapshots/pilot-cv-n1-post-seed-*.sql

# Deletar o D1 do piloto
npx wrangler d1 delete airtrust-db-pilot-cv-n1
# O comando pedirá confirmação interativa. Confirmar apenas após verificação.

# Remover arquivo temporário de config após descarte do D1
rm worker-airtrust/wrangler.pilot-cv-n1.toml
```

### 8.8 Comandos proibidos — NUNCA EXECUTAR NESTE FLUXO

```bash
# PROIBIDO — Nunca executar neste fluxo do piloto

# Qualquer comando contra airtrust-db (producao)
npx wrangler d1 execute airtrust-db --remote ...          # PROIBIDO
npx wrangler d1 migrations apply airtrust-db --remote ... # PROIBIDO

# Qualquer comando com --env production
npx wrangler d1 ... --env production                      # PROIBIDO
npx wrangler deploy --env production                      # PROIBIDO
npm run deploy                                            # PROIBIDO

# Aplicar 0411
npx wrangler d1 execute ... --file migrations/0411_*.sql  # PROIBIDO (0411 não existe e não deve ser criada)

# Migrations em staging atual
npx wrangler d1 migrations apply airtrust-db-staging ...  # PROIBIDO neste fluxo

# Scripts perigosos legados
npm run d1:migrate:staging                                # PROIBIDO (aponta para nome errado)
npm run d1:migrate:prod                                   # PROIBIDO
npm run deploy:staging                                    # PROIBIDO
npm run deploy:prod                                       # PROIBIDO
bash scripts/clone-production-d1-to-local.sh              # PROIBIDO

# Alterar secrets
npx wrangler secret put JWT_SECRET --env production       # PROIBIDO
npx wrangler secret put JWT_SECRET --env staging          # PROIBIDO neste fluxo
```

---

## 9. Validação Pós-Preparo

Checklist a executar após o preparo do D1 do piloto, antes de liberar usuários:

### Infraestrutura

- [ ] D1 criado com nome `airtrust-db-pilot-cv-n1` e UUID registrado.
- [ ] `wrangler.pilot-cv-n1.toml` criado com UUID correto.
- [ ] `grep database_name worker-airtrust/wrangler.pilot-cv-n1.toml` retorna `airtrust-db-pilot-cv-n1`.
- [ ] `grep database_id worker-airtrust/wrangler.pilot-cv-n1.toml` retorna o UUID gerado, **não** `7c8a788e` (produção) nem `b7f50907` (staging atual).

### Schema

- [ ] Tabelas `cv_aeroportos`, `cv_tipos_voo`, `cv_naturezas_voo`, `cv_motivos_operacionais`, `cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`, `cv_voo_eventos` existem.
- [ ] `SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'regulated_%'` retorna `0`.
- [ ] `SELECT COUNT(*) FROM sqlite_master WHERE name IN ('cv_voo_etapas','cv_sigvoos_staging','cv_conflitos_integracao')` retorna `0` (ausência de 0411).
- [ ] Tabelas `empresas`, `usuarios`, `user_platform_roles` existem.

### Produção e staging

- [ ] `wrangler d1 list` confirma que `airtrust-db` (produção) não foi alterado.
- [ ] Nenhum comando com `--env production` foi executado nesta fase.
- [ ] `airtrust-db-staging` não foi tocado neste fluxo.

### Dados

- [ ] Empresa de piloto existe em `empresas` com `id = 1`.
- [ ] Usuários admin, editor e viewer existem em `usuarios` com `empresa_id = 1`.
- [ ] Voos sintéticos existem em `cv_voos` (mínimo 5).
- [ ] Aeroportos de piloto existem em `cv_aeroportos`.
- [ ] Nenhum CPF ou dado pessoal real em qualquer tabela.

### Funcional (requer Worker apontando para D1 do piloto)

- [ ] Login do admin-pilot funciona e retorna JWT válido.
- [ ] `GET /api/controle-voos/dashboard` retorna `success: true` e `nao_regulado: true`.
- [ ] `GET /api/controle-voos/voos` retorna lista dos voos do seed.
- [ ] `POST /api/controle-voos/voos` funciona com usuário editor.
- [ ] `PUT /api/controle-voos/:id/rdv` funciona com usuário editor.
- [ ] `POST /api/controle-voos/:id/rdv/finalizar-preenchimento` funciona com usuário editor.
- [ ] Usuário viewer não consegue criar voo (retorna 403).
- [ ] Usuário viewer não consegue criar/editar RDV (retorna 403).

### Snapshot

- [ ] Snapshot pré-seed exportado e arquivo salvo.
- [ ] Snapshot pós-seed exportado e arquivo salvo.
- [ ] Ambos os snapshots têm tamanho > 0 e são legíveis.

---

## 10. Riscos

| # | Risco | Probabilidade | Severidade | Mitigação |
|---|---|---|---|---|
| R01 | `wrangler.pilot-cv-n1.toml` comitado acidentalmente com UUID real do D1 de produção ou staging copiado por engano | Média | Alta | Revisar `database_id` antes de qualquer commit; não comitar o arquivo; adicioná-lo ao `.gitignore` |
| R02 | Comando executado sem `--config wrangler.pilot-cv-n1.toml`, usando a config padrão `wrangler.toml` | Alta | Muito alta | Todos os comandos do piloto devem incluir `--config` explicitamente; nunca usar `wrangler d1 ...` sem especificar o config file |
| R03 | `JWT_SECRET` de produção usado no Worker de piloto, dando acesso a tokens reais | Baixa | Muito alta | Usar secret de piloto próprio; nunca reutilizar `JWT_SECRET` de produção; usuários de piloto têm emails `@pilot.airtrust.local` que não existem em produção |
| R04 | Cadeia completa de migrations (381) aplicada por engano no D1 do piloto | Baixa | Alta | Usar `--file` específico, nunca `wrangler d1 migrations apply` sem especificação do arquivo no fluxo de Opção B |
| R05 | Baseline mínimo de auth/RBAC insuficiente — middleware rejeita todas as requisições | Média | Alta | Testar login antes de liberar usuários; incluir `empresas`, `usuarios`, `user_platform_roles` no baseline; verificar com checklist da Seção 9 |
| R06 | Seed insuficiente — nenhum voo no D1 do piloto, usuários não conseguem exercitar RDV | Média | Média | Verificar contagem de voos antes de liberar; ter mínimo de 5 voos sintéticos |
| R07 | Confusão entre `airtrust-db-staging` (staging atual) e `airtrust-db-pilot-cv-n1` (D1 do piloto) | Alta | Alta | Nome explicitamente distinto; checklist de confirmação de `database_name` antes de qualquer comando destrutivo |
| R08 | D1 descartável do piloto vira "permanente" sem governança | Média | Média | Definir data de descarte no início; incluir no Dia 5 o comando de deleção; documentar que o D1 é descartável |
| R09 | Worker de piloto apontando para D1 do piloto recebe tráfego de usuários reais além dos participantes | Baixa | Alta | URL do Worker de piloto deve ser comunicada apenas aos participantes; não publicar a URL nem criar route canônica |
| R10 | Migration `0411` aplicada por engano no D1 do piloto | Muito baixa | Alta | `0411` não existe como arquivo; verificar com `rg '0411' worker-airtrust/migrations/` antes de qualquer apply |
| R11 | Snapshot não capturado antes de descarte do D1 | Média | Alta | Checklist da Seção 9 inclui confirmação de snapshot; não executar `wrangler d1 delete` sem `ls` de snapshots |
| R12 | `wrangler.pilot-cv-n1.toml` não removido após o piloto | Alta | Baixa | Incluir no Dia 5 o comando `rm wrangler.pilot-cv-n1.toml`; o arquivo sem D1 associado não causa dano mas gera confusão |

---

## 11. Go/No-Go para Execução deste Runbook

### GO — Criar D1 dedicado

Condições para GO:

- [ ] Este runbook foi lido e aprovado pelo responsável técnico e pelo sponsor do piloto.
- [ ] Nenhum item de risco tem mitigação pendente não documentada.
- [ ] A data de início do piloto está definida.
- [ ] O responsável técnico do piloto está disponível para executar os comandos.
- [ ] Os snapshots serão armazenados fora do repositório ou em pasta ignorada pelo `.gitignore`.
- [ ] `wrangler.pilot-cv-n1.toml` não será comitado.
- [ ] Os usuários de teste têm emails `@pilot.airtrust.local` (sem correspondência em produção).
- [ ] O canal de suporte do piloto está definido.

**Próxima ação:** executar os comandos da Seção 8.2 (criar D1), Seção 8.3 (criar arquivo de config), Seção 8.4 (aplicar baseline + 0410 + seed) e Seção 8.5 (snapshot), nessa ordem.

### GO com ressalvas

Condições para GO com ressalvas (requer ajustes antes de avançar):

- O runbook foi lido mas a data do piloto não está definida — agendar antes de criar o D1.
- O responsável técnico do piloto não está disponível — definir substituto antes de criar o D1.
- Os snapshots ainda não têm local de armazenamento definido fora do repositório — definir antes de criar o D1.

**Próxima ação:** fechar as ressalvas e retornar ao GO.

### NO-GO

Condições para NO-GO (não criar D1 agora):

- A decisão de ambiente ainda não foi aprovada pelo sponsor.
- Há dúvida sobre qual `JWT_SECRET` usar no Worker de piloto.
- `wrangler.pilot-cv-n1.toml` seria commitado no repositório.
- O piloto seria executado apontando para `--env staging` ou `--env production`.
- A migration `0411` seria aplicada junto com a `0410`.

**Próxima ação se NO-GO:** resolver o bloqueador específico, atualizar este runbook e retornar à decisão.

---

## 12. Próximo Passo Recomendado

Se este runbook for aprovado pelo responsável técnico e pelo sponsor:

### Modelo recomendado para execução

**Codex 5.5, nível alto.**

O Codex 5.5 é indicado para execução porque a fase envolve:
- Criação real de D1 no Cloudflare.
- Criação de arquivo temporário de Wrangler (`wrangler.pilot-cv-n1.toml`).
- Criação de scripts de baseline e seed SQL.
- Execução de comandos remotos contra D1 real.
- Captura e verificação de snapshot.

### Sequência de execução após aprovação

1. **Criar D1**: executar `wrangler d1 create airtrust-db-pilot-cv-n1` e guardar o UUID.
2. **Criar `wrangler.pilot-cv-n1.toml`**: substituir `<UUID-GERADO-NA-CRIACAO>` pelo UUID real.
3. **Criar `scripts/pilot-cv-n1-baseline.sql`**: DDL de `empresas`, `usuarios`, `user_platform_roles` com dados mínimos.
4. **Criar `scripts/pilot-cv-n1-seed.sql`**: dados controlados de piloto (aeroportos, tipos, voos sintéticos, usuários).
5. **Aplicar baseline + 0410**: comandos da Seção 8.4 em ordem.
6. **Capturar snapshot pré-seed** (Seção 8.5).
7. **Aplicar seed** (Seção 8.4, Passo 4).
8. **Capturar snapshot pós-seed** (Seção 8.5).
9. **Executar checklist de validação** (Seção 9).
10. **Criar relatório de execução**: documento `docs/CONTROLE_DE_VOOS_N1_DEDICATED_D1_EXECUTION_REPORT.md` com evidências de cada passo.
11. **Liberar Dia 1 do piloto**: somente após checklist 100% marcado.

### Sugestão de commit (somente para este runbook de documentação)

Não fazer commit sem autorização explícita.

Quando autorizado, sugestão de commit escopado apenas para esta documentação:

```bash
git add docs/CONTROLE_DE_VOOS_N1_PILOT_DEDICATED_D1_RUNBOOK.md
git commit -m "docs(controle-voos): add dedicated D1 runbook for N1 pilot"
```

---

## 13. Confirmações Finais

- Produção não foi tocada.
- `airtrust-db-staging` não foi tocado.
- Nenhum D1 foi criado.
- Nenhum arquivo de configuração foi alterado.
- Nenhuma migration foi aplicada.
- Nenhum deploy foi executado.
- Nenhuma secret foi lida, alterada ou listada.
- `0411` não foi aplicada.
- Nenhuma integração SIGVOOS/FRMS/eDB/SDRMe/MRO foi criada.
- Nenhum código frontend ou backend foi alterado.
- Nenhum commit foi criado.
- Apenas este documento de runbook foi criado nesta fase.
