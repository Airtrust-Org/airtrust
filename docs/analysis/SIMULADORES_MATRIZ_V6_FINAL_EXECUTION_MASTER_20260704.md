# Simuladores Matriz V6.1 — Final Execution Master — 2026-07-04

**Discordo apenas de aplicar produção sem gate técnico.**  
Risco: **crítico**.  
Mas o agente não deve voltar só para pedir "próximo passo" se tudo estiver passando.

## Prompt

````markdown id="airtrust-v6-final-execution-master"
Modelo recomendado: Codex 5.4 médio
Esforço: alto
Use subagentes quando útil, especialmente para:
- auditoria de diff/worktree;
- segurança/sanitização de backups;
- validação SQL/D1;
- revisão de rollback;
- revisão final de produção.

Você está trabalhando no repositório AirTrust.

MODO: EXECUÇÃO COMPLETA, NÃO DOCUMENTAÇÃO.

A tarefa é terminar a frente Matriz V6.1 Costa do Sol com autonomia operacional, avançando até onde for tecnicamente seguro, sem voltar ao usuário a cada subetapa.

Não crie apenas mais um documento/prompt. Execute comandos, corrija o que for necessário dentro do escopo, valide, aplique nos ambientes permitidos quando os critérios passarem, e entregue um relatório final único.

## Objetivo final

Finalizar a Matriz V6.1 Costa do Sol:

1. limpar e consolidar o PR;
2. proteger dumps/backups sensíveis;
3. revisar patches operacionais;
4. garantir que setup local e snapshot sanitizado são seguros;
5. validar local já aplicado;
6. preparar e executar staging/preview, se existir ambiente seguro;
7. preparar produção;
8. executar produção somente se todos os critérios objetivos forem cumpridos;
9. validar pós-produção;
10. deixar rollback e evidências documentados;
11. entregar relatório final único.

## Contexto técnico

A Matriz V6.1 já está implementada no loader:

- 49 modelos operacionais;
- 882 linhas técnicas;
- 15 NOTECHS esperados;
- source map 49 modelos / 1078 linhas;
- 8 fichas V6.1 convertidas:
  - `A139-S-01/02`
  - `A139-S-02/02`
  - `A139-REQ-01`
  - `S76-REQ-01`
  - `A139-NOT-01`
  - `A139-NOT-02`
  - `S76-NOT-01`
  - `S76-NOT-02`
- `TRE-INST` e `CRED-EXA` permanecem fora do loader;
- `0414_add_manobras_referencias_json.sql` faz parte do escopo porque o apply grava `manobras.referencias_json`.

Validação local já realizada:

- snapshot sanitizado oficial de produção importado em D1 local;
- empresa 6 presente;
- `manobras.empresa_id` presente;
- `manobras.referencias_json` presente;
- `modelos_sessao.empresa_id` presente;
- `0413` e `0414` aplicadas localmente;
- dry-run local: `READY_FOR_REVIEW`, 0 issues, 49 modelos, 882 linhas técnicas;
- apply local: `APPLY_OK_LOCAL_ONLY`;
- 8 fichas V6.1 com 18 técnicas;
- `TRE-INST` e `CRED-EXA` não tocados;
- testes targeted `16/16`;
- lint passando.

Arquivos/documentos de governança já existentes:

- `docs/analysis/SIMULADORES_MATRIZ_V6_LOCAL_APPLY_NO_GO_20260704.md`
- `docs/analysis/SIMULADORES_MATRIZ_V6_LOCAL_VALIDATION_MASTER_PROMPT_20260704.md`
- `docs/analysis/SIMULADORES_MATRIZ_V6_AUTONOMOUS_RELEASE_PROMPT_20260704.md`

## Regras absolutas

- Não alterar conteúdo pedagógico das fichas.
- Não incluir `TRE-INST` nem `CRED-EXA` no apply.
- Não afirmar homologação, aprovação ou aceitação pela ANAC.
- Não fazer hard delete.
- Não tocar fichas finalizadas.
- Não commitar dump bruto de produção.
- Não commitar backup SQLite com dados reais.
- Não commitar arquivos sensíveis em `backups/`.
- Não mascarar falhas de teste.
- Não fazer merge automático.
- Não fazer deploy de Pages/Worker se a alteração for apenas D1/matriz, salvo se o fluxo oficial exigir e isso for justificado.
- Não executar produção se não houver backup/export remoto verificável.
- Não executar produção se não houver rollback operacional documentado.
- Não executar produção se staging/preview/local representativo falhar.
- Não executar produção se houver arquivos fora de escopo no diff.
- Não executar produção se houver risco de ficha finalizada ser alterada.
- Não executar produção se `0414` não estiver confirmada como segura/idempotente ou já aplicada.

## Escopo permitido

Arquivos principais:

- `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs`
- `scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs`
- `src/__tests__/simuladores-matriz-v6-data.test.ts`
- `worker-airtrust/migrations/0414_add_manobras_referencias_json.sql`
- `scripts/setup-local-db.sh`
- `scripts/schema-local.sql`
- `scripts/sync-d1-production-sanitized.sh`
- documentos de evidência V6/RPEA/PQ-C/local validation em `docs/analysis/`

Qualquer outro arquivo deve ser classificado como:

- `IN_SCOPE`
- `DOC_EVIDENCE`
- `LINT_ONLY`
- `OUT_OF_SCOPE_STASHED`
- `BLOCKER`

Preserve qualquer fora de escopo em stash separado. Não descarte trabalho sem registrar.

---

# Execução autônoma

## 1. Sanear worktree

Executar:

```bash
git status --short
git branch --show-current
git diff --name-only
git ls-files --others --exclude-standard
```

Ações:

* separar/stashar arquivos fora de escopo;
* manter apenas arquivos necessários para V6.1;
* garantir que dumps/backups não aparecem como untracked commitáveis;
* registrar o stash usado;
* não parar para pedir autorização se a ação for apenas stash seguro.

Critério de bloqueio:

* se houver arquivo sensível rastreado ou prestes a entrar no PR, corrigir antes de qualquer outro passo.

---

## 2. Proteger artefatos sensíveis

Verificar:

```bash
git check-ignore -v backups/production-export-*.sql backups/production-sanitize-*.sql backups/local-db/*.sqlite || true
git status --short backups || true
find backups -maxdepth 3 -type f | head -50
```

Obrigatório:

* export bruto de produção não pode ser commitado;
* SQLite local com dados reais não pode ser commitado;
* se necessário, mover para local seguro fora do repo ou garantir `.gitignore`;
* se alterar `.gitignore`, manter patch mínimo e justificar.

Importante:

* registrar corretamente: houve leitura/export sanitizado de produção, mas nenhuma escrita remota;
* não escrever genericamente “sem tocar produção” se houve export/leitura;
* usar: “sem escrita em produção”.

---

## 3. Revisar patches operacionais

Auditar diffs:

```bash
git diff -- scripts/setup-local-db.sh
git diff -- scripts/schema-local.sql
git diff -- scripts/sync-d1-production-sanitized.sh
git diff -- scripts/maintenance/lib/simuladores-matriz-v6-data.mjs
git diff -- scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs
git diff -- src/__tests__/simuladores-matriz-v6-data.test.ts
git diff -- worker-airtrust/migrations/0414_add_manobras_referencias_json.sql
```

Confirmar:

* setup local não depende de `seed-local.sql` inexistente;
* `schema-local.sql` contém dependências necessárias para `0394`;
* `sync-d1-production-sanitized.sh` não força Node incompatível com Wrangler;
* snapshot sanitizado não faz escrita em produção;
* `0414` é aditiva e segura;
* apply exige `--confirm`;
* apply não faz hard delete;
* apply não toca fichas finalizadas;
* apply preserva `empresa_id = 6`;
* `referencias_json` fica separado de `descricao`;
* `TRE-INST`/`CRED-EXA` ficam fora.

Se encontrar bug de segurança claro, corrija.
Se for mudança de escopo/pedagogia, não altere.

---

## 4. Revalidar local representativo

Se o snapshot local ainda existir, validar. Se não existir, recriar usando somente fluxo oficial sanitizado.

Comandos permitidos:

```bash
AIRTRUST_ALLOW_PROD_SYNC=1 AIRTRUST_CONFIRM_PROD_SYNC='I understand this exports production D1 and writes only to the selected non-production target' bash scripts/sync-d1-production-sanitized.sh --target local --yes
```

Depois validar:

```sql
SELECT COUNT(*) FROM d1_migrations;
PRAGMA table_info(manobras);
PRAGMA table_info(modelos_sessao);
SELECT COUNT(*) FROM empresas WHERE id = 6;
SELECT COUNT(*) FROM manobras WHERE empresa_id = 6 AND deleted_at IS NULL;
SELECT COUNT(*) FROM modelos_sessao WHERE empresa_id = 6 AND deleted_at IS NULL;
SELECT COUNT(*) FROM manobras WHERE empresa_id = 6 AND categoria = 'NOTECHS' AND deleted_at IS NULL;
```

Critérios obrigatórios:

* empresa 6 existe;
* `manobras.empresa_id` existe;
* `manobras.referencias_json` existe;
* `modelos_sessao.empresa_id` existe;
* há dados reais/representativos da empresa 6;
* NOTECHS catálogo = 15 ou justificativa objetiva;
* ambiente não é seed manual;
* ambiente não usa DDL parcial.

Se `0413` ou `0414` precisarem ser aplicadas localmente após snapshot, aplicar localmente apenas se:

* a coluna/tabela ainda não existir;
* o comando for local;
* não houver remoto;
* for registrado no relatório.

---

## 5. Reexecutar dry-run local

Executar:

```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --dry-run --empresa-id 6
```
````

## Nota

Este arquivo existe para consolidar o prompt mais abrangente em um artefato canônico de referência. Ele não substitui execução real no repositório.
