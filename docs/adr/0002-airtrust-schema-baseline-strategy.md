# ADR 0002 — Estratégia de baseline schema-only para reconstrução de staging/DR

| Campo | Valor |
|---|---|
| **Status** | Proposto |
| **Data** | 2026-07-01 |
| **Decisores** | Arquiteto técnico AirTrust |
| **Referência canônica** | `docs/MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701.md` |
| **Escopo desta ADR** | Infraestrutura D1, migrations, staging/DR rebuild |

---

## Contexto

O release do PR #216 (`draft: feat(qualificacoes): classificação por categoria, formato e modelo`, squash-merged em `main` como `8e4a5dc`) está bloqueado — não por defeito do PR, mas por um problema estrutural na cadeia histórica de migrations do AirTrust.

Duas tentativas de aplicar a migration `0412_qualificacoes_classificacao.sql` em staging falharam:

1. **Staging antigo** (`airtrust-db-staging`): o ledger `d1_migrations` tem apenas 4 entras registradas enquanto o schema físico (244 tabelas) está muito à frente — drift de proveniência, provável dump/restore ou execução manual fora do fluxo oficial. A migração `0016_habilitacoes_renovacao.sql` tentou adicionar coluna `habilitacao_anterior_id` que já existia fisicamente (`duplicate column name`).

2. **Staging novo do zero** (`airtrust-db-staging-sane-20260701`): replay completo da cadeia no D1 novo falhou na migration `0060_recreate_integrated_view_funcionarios.sql` com `error in view qualificacoes_historico_v: no such column: f.nome_guerra`. A coluna `funcionarios.nome_guerra` nunca é criada por nenhuma migration no intervalo `0001`–`0058`, mas é assumida como existente a partir da `0058` — um problema de dependência implícita introduzido antes da existência do ledger formal.

Em ambos os casos a `0412` nunca chegou a ser executada — a cadeia quebra ~350 migrations antes dela. O diagnóstico completo está documentado em `docs/MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701.md`.

**Problema central**: a cadeia de migrations commitada no repositório não é capaz de reconstruir o schema real de produção (nem de nenhum ambiente maduro) a partir de um banco vazio. Esse bloqueio afeta staging, disaster recovery e onboarding de qualquer novo ambiente.

---

## Decisão

Adotar **baseline schema-only pré-0412** como estratégia oficial para criar ambientes novos (staging, DR, desenvolvimento), em vez de tentar replayar a cadeia histórica completa.

### Regras do baseline

1. **Fonte**: produção exclusivamente como fonte de DDL (schema-only). Nenhum dado é exportado.
2. **Conteúdo**: apenas `CREATE TABLE`, `CREATE VIEW`, `CREATE INDEX`, `CREATE TRIGGER` — sem `INSERT`, `UPDATE`, `DELETE`, `REPLACE` ou `UPSERT`.
3. **Exclusões obrigatórias**: `d1_migrations`, `_cf_%` (Cloudflare internal), secrets ou quaisquer tabelas de controle interno.
4. **PII**: proibido qualquer payload com nomes, emails, CPF, telefones, endereços, fotos ou dados biométricos.
5. **Versionamento**: o arquivo baseline é versionado em `scripts/schema-baseline-pre-0412.sql`.
6. **Pré-0412**: o baseline não inclui as mudanças da migration `0412_qualificacoes_classificacao.sql`. A `0412` é aplicada *depois* do baseline, como migração regular, para validar o PR #216 separadamente.
7. **Produção intocada**: o schema de produção é lido uma vez (read-only), validado e versionado. Produção não recebe nenhuma alteração.

### Fluxo de reconstrução de staging

```
produção (schema-only)
    ↓ export read-only
scripts/schema-baseline-pre-0412.sql
    ↓ aplicação via wrangler d1 execute
D1 staging novo (vazio)
    ↓
baseline aplicado (ledger NÃO é alimentado)
    ↓ wrangler d1 migrations apply (a partir da 0412)
d1_migrations registra 0412 em diante
    ↓ deploy worker + frontend
staging pronto para smoke
```

---

## Alternativas rejeitadas

| Alternativa | Motivo de rejeição |
|---|---|
| Reescrever migrations antigas `0058–0077` | Risco alto de regressão em produção; alteração retroativa de histórico; não é seguro sem lock operacional |
| Editar ledger `d1_migrations` manualmente em staging | Inconsistência não rastreável; qualquer erro corrompe staging sem rollback confiável |
| Validar direto em produção | Violação absoluta de segurança; produção contém dados reais de tripulantes e operações |
| Migration corretiva só para staging | Criaria terceiro schema incoerente; staging e produção divergiriam ainda mais |
| Manter staging atual com schema adiantado | Ledger continuaria atrasado; qualquer migration futura tentaria aplicar DDL já existente e falharia |
| Manter staging vazio atual e pular migrations problemáticas | `wrangler d1 migrations apply` não suporta skip seletivo; exigiria hack do ledger |

---

## Consequências

### Positivas

- Staging e DR passam a ter um caminho estrutural de reconstrução determinístico.
- Produção não é alterada — mantém seu ledger histórico intacto.
- PR #216 pode ser validado isoladamente depois do baseline + smoke staging.
- A cadeia histórica de migrations permanece como está, sem risco de regressão por edição retroativa.
- Migrações futuras são validadas contra o baseline em CI, não contra um banco já maduro com drift.

### Negativas / trade-offs

- O baseline precisa de revisão humana do DDL exportado antes da primeira aplicação.
- Produção terá dois caminhos de schema (ledger histórico + baseline futuro) — requer runbook operacional claro.
- Script de export schema-only precisa ser desenvolvido e testado.
- Staging atual (driftado) fica obsoleto até o rebuild completo.

### Riscos

- Export de produção pode capturar DDL com variáveis específicas de ambiente (ex.: nomes de bucket R2 hardcoded). Revisão humana mitigante.
- Baseline manual pode omitir tabela/esquema que existe em produção mas não está no diretório `migrations/`. O dump schema-only de produção cobre isso, desde que seja completo.
- Aplicação do baseline em staging novo via `wrangler d1 execute --file` é destrutiva (substitui schema existente) — staging novo deve ser D1 vazio ou recém-criado.

---

## Segurança e privacidade

- Baseline é **DDL-only**. Nenhuma instrução DML é emitida.
- **Proibido** qualquer `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `UPSERT` no arquivo baseline.
- **Proibido** incluir PII: nomes, emails, CPF, telefones, endereços, fotos, dados biométricos.
- **Proibido** incluir tabelas de controle interno: `d1_migrations`, qualquer tabela `_cf_%`.
- **Proibido** incluir secrets, tokens, chaves de API ou strings de conexão.
- O script de export deve filtrar essas exclusões automaticamente e a saída deve passar por revisão humana antes de versionamento.

---

## Relação com PR #216

- PR #216 não é a causa do bloqueio e não precisa de alteração.
- PR #216 fica **aguardando** staging reconstruído para validação.
- Depois do baseline aplicado em staging novo, a migration `0412_qualificacoes_classificacao.sql` é aplicada via `wrangler d1 migrations apply` no fluxo oficial.
- Smoke staging após `0412` confirma ou rejeita o PR para produção.
- O SHA do PR em `main` (`8e4a5dc`) já contém todo o código — nenhum novo merge é necessário.

---

## Próximos passos

1. Desenvolver script de export schema-only read-only (`scripts/export-d1-schema-only.sh` — a ser criado).
2. Executar export contra produção (read-only, sem dados, em janela controlada).
3. Revisão humana do DDL exportado.
4. Criar D1 staging novo (via `wrangler d1 create`).
5. Aplicar baseline via `wrangler d1 execute --file`.
6. Aplicar `0412` via `wrangler d1 migrations apply`.
7. Deploy worker + frontend staging.
8. Smoke staging.
9. Decisão GO/NO-GO para produção.

Cada passo possui runbook próprio em `docs/STAGING_REBUILD_FROM_SCHEMA_BASELINE_RUNBOOK.md`.
