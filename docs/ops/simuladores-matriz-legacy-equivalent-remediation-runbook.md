# Runbook — Compensação das 5 resoluções LEGACY_EQUIVALENT da matriz AW139

Status: **PRONTO PARA REVISÃO — NÃO EXECUTADO EM PRODUÇÃO.**

Este runbook cobre a janela operacional completa da remediação compensatória:
migration 0443, o plano privado, e as chamadas `dry-run` → `apply` →
`rollback` do executor
`worker-airtrust/src/routes/admin-simuladores-matriz-remediation-executor.ts`.

Nenhum ID, UUID ou hash real de produção aparece neste documento. Esses
valores vivem apenas em artefatos privados fora do repositório.

## 0. Causa raiz

O import original da matriz AW139/S-76 (migrations 0440/0441, executor
`admin-simuladores-matriz-executor.ts`) resolve cada código canônico de
manobra para exatamente um `manobra_id` do tenant, classificando cada código
como `EXACT_UNIQUE`, `FORMAL_ALIAS`, `LEGACY_EQUIVALENT`, `TRUE_MISSING`,
`COLLISION` ou `CROSS_TENANT_ONLY`. Cinco códigos que deveriam ter sido
classificados como `LEGACY_EQUIVALENT` (reaproveitando uma manobra legada já
existente) foram classificados como `TRUE_MISSING` e uma manobra nova foi
criada por engano para cada um. O efeito: 13 vínculos, espalhados por 9
modelos correntes, apontam para essas 5 manobras "erradas" em vez das 5
manobras legadas corretas.

## 1. Por que um `UPDATE` direto é proibido

Duas camadas de trigger no schema tornam qualquer correção direta impossível:

1. `simuladores_matriz_manobra_resolution` tem um `BEFORE UPDATE` incondicional
   (`trg_matriz_manobra_resolution_imutavel`, migration 0441) que aborta
   qualquer tentativa de alterar uma resolução já registrada. A resolução é
   um fato histórico auditado, nunca reescrito.
2. `modelos_sessao_manobras` (os vínculos modelo↔manobra) tem triggers
   (`trg_modelo_manobra_versionada_imutavel*`, migration 0440) que abortam
   qualquer INSERT/UPDATE/DELETE assim que o `modelo_id` tem uma linha em
   `modelos_sessao_versionamento` com `versao_matriz <> 'LEGACY'` — ou seja,
   uma vez que um modelo é "publicado" sob uma versão real da matriz, seus
   vínculos ficam congelados. Isso vale para os 9 modelos afetados, todos já
   publicados sob a versão corrente.

## 2. Por que rollback+reapply da mesma versão também falha

A resolução é insert-only e única por `(empresa_id, versao_matriz,
codigo_canonico)` (`uq_matriz_manobra_resolution_codigo`). Um rollback
compensatório do import original (que já existe,
`rollback-simuladores-matriz-import.mjs`) desativa os modelos correntes, mas
**não apaga** a linha de resolução `TRUE_MISSING` já registrada para os 5
códigos sob a mesma `versao_matriz`. Um replano corrigido, sob a mesma
`versao_matriz`, colide com essa linha imutável e falha fechado
(`resolution_type divergente da resolução já registrada`). Isso não é um bug
— é exatamente a garantia fail-closed funcionando como projetada.

## 3. O padrão COMPENSATE usado aqui

A única forma segura de corrigir é o mesmo padrão copy-on-write já usado pelo
rollback oficial da matriz e do relink de guias:

- Para cada um dos 9 modelos afetados: criar uma **nova linha física** em
  `modelos_sessao` (`<codigo>@<versao>-REMEDIATION-<uuid>`), copiar os 18
  vínculos do modelo corrente — substituindo apenas os vínculos que apontavam
  para uma das 5 manobras erradas pela manobra legada correta — copiar os
  contextos, e transferir `is_current` via um novo INSERT em
  `modelos_sessao_versionamento` (nunca um UPDATE na linha antiga além de
  `is_current=0`).
- A resolução histórica (`simuladores_matriz_manobra_resolution`) nunca é
  tocada. A correção efetiva vive num overlay append-only,
  `simuladores_matriz_resolution_corrections` (migration 0443): uma linha por
  código, com `is_current=1` marcando qual correção vale agora. Ler a
  "resolução efetiva" de um código = overlay corrente, ou a resolução
  original se não houver overlay.
- O guia de instrutor de cada um dos 9 modelos é relinkado (mesmo
  `simuladores_modelos_sessao_guias` + `buildGuiaRelinkApplyStatements`,
  scripts/lib/matriz-guia-relink-core.mjs — nenhuma lógica de matching
  duplicada).
- Rollback é, ele mesmo, um novo COMPENSATE: como uma versão histórica nunca
  pode voltar a ser corrente (`trg_modelo_versao_integridade_update` proíbe
  `is_current` 0→1), desfazer a remediação cria **outra** linha física nova
  restaurando os vínculos originais, supersede os 5 overlays de correção
  (`is_current` 1→0), e relinka os guias de novo — desta vez apontando para
  os modelos recém-restaurados. Nada é literalmente desfeito; tudo é uma nova
  ação compensatória para frente, auditável.

## 4. Descoberta genérica, sem IDs hardcoded

O executor nunca recebe uma lista de IDs de produção. O arquivo privado de
mapeamento carrega apenas `{codigo_canonico, correct_legacy_manobra_codigo}`
por código — nenhum `manobra_id` numérico. Em tempo de execução:

- o `manobra_id` "errado" é lido da resolução corrente do próprio tenant;
- o `manobra_id` legado correto é resolvido pelo código informado, também no
  próprio tenant;
- os 9 modelos e os 13 vínculos afetados são descobertos via JOIN ao vivo,
  nunca por uma lista fixa.

O plano falha fechado se não encontrar exatamente 5 mappings, 9 modelos, 13
vínculos, e 18 vínculos totais em cada modelo afetado.

## 5. Fingerprint, hash e plano congelado

- `base_fingerprint`: mesmo fingerprint tenant-scoped usado pelo import
  original (`matriz-base-fingerprint.mjs`), sobre todas as versões correntes,
  manobras e vínculos do tenant.
- `expected_hash`: fingerprint específico da remediação
  (`buildRemediationFingerprint`), sobre os 5 mappings resolvidos e os 13
  vínculos descobertos — sensível a qualquer drift no conjunto-alvo entre
  plano e apply.
- `plan_sha256`: hash do plano inteiro, verificado por comparação
  tempo-constante (`assertRemediationPlanIntegrity`).

Um plano gerado é congelado: nenhum desses três valores é recalculado a
partir da resposta do próprio endpoint depois de aprovado.

## 6. Endpoints

```
POST /api/admin/simuladores-matriz-remediation/dry-run
POST /api/admin/simuladores-matriz-remediation/apply
POST /api/admin/simuladores-matriz-remediation/rollback
GET  /api/admin/simuladores-matriz-remediation/status/:uuid
```

Gates, todos verificados antes de qualquer escrita:

- `ENABLE_SIMULADORES_MATRIZ_REMEDIATION_EXECUTOR=true` (default `false`,
  verificado antes de qualquer processamento caro);
- autenticado, role admin, `empresa_id=6` (hardcoded — este não é um executor
  de migração genérico);
- migration 0443 presente;
- `source_matrix_import_uuid` e `source_guide_import_uuid` do plano devem
  estar `APPLIED`;
- nenhuma outra remediação `APPLYING` para o mesmo tenant/versão (índice
  único parcial, migration 0443);
- `base_fingerprint`, `expected_hash` e `plan_sha256` batem com o estado ao
  vivo;
- zero drift de uso posterior (ficha/agendamento criado depois do plano
  referenciando um dos 9 modelos).

## 7. Dry-run

Totalmente read-only. Valida tudo acima e devolve uma prévia determinística:
9 modelos, 162 vínculos copiados, 13 substituições, 9 relinks de guia, 5
overlays de resolução.

## 8. Apply

Um único `D1Database.batch()` atômico. Idempotente pelo mesmo
`remediation_uuid` + `plan_sha256` (replay não duplica nada). Um
`remediation_uuid` diferente com correção corrente já `APPLIED` para o mesmo
código falha fechado — exige rollback explícito primeiro.

Resultado esperado: 51 modelos correntes / 918 vínculos / 18 por modelo
inalterados no total da matriz; resolução histórica original preservada tal
como estava; resolução efetiva com o overlay aplicado.

## 9. Rollback

Compensatório (seção 3). Idempotente pelo mesmo `remediation_uuid`.

## 10. Backup, janela e stop conditions

Idênticos em espírito ao runbook do import original
(`simuladores-matriz-aw139-s76-guias-relink-runbook.md`): backup oficial
recente, sem sessão de simulador ativa, checagem PRE/POST de
`foreign_key_check` — com uma diferença importante: **o baseline correto de
produção não é zero.** O `foreign_key_check` de produção já contém um
conjunto conhecido de violações pré-existentes, não relacionadas a esta
remediação. A validação correta é: mesma contagem, mesmo conjunto exato,
antes e depois — nunca "zero".

Qualquer divergência de fingerprint, hash, contagem, ou FK interrompe a
janela sem escrita. Falha após apply aciona rollback compensatório antes de
qualquer outra ação.

## 11. Aplicando a migration 0443 remotamente: `wrangler d1 migrations apply` falha

Uma primeira janela de produção autorizada tentou aplicar a migration 0443
via `wrangler d1 migrations apply` (o mesmo mecanismo ledger-aware já usado
com sucesso para 0441/0442). A tentativa falhou, antes de qualquer escrita,
com:

```
SQLITE_ERROR: incomplete input [code: 7500]
```

Nenhuma tabela/trigger da 0443 chegou a existir em produção e nenhuma linha
foi gravada no ledger `d1_migrations` — confirmado por leitura direta
pós-falha. Zero estado parcial.

### Causa raiz confirmada

Investigação num banco D1 remoto totalmente descartável (nunca staging, nunca
produção) reproduziu o erro de forma determinística e isolou a causa no
próprio código do `wrangler` (não na migration 0443, nem em 0440/0441/0442):

`wrangler d1 migrations apply` lê o conteúdo do arquivo de migration, concatena
em memória um `INSERT INTO d1_migrations (name) VALUES (...)` no final, e
envia o texto combinado inteiro pela **ação `query` da API do D1** — o mesmo
caminho leve usado por `wrangler d1 execute --command`. Esse caminho não
processa de forma confiável um script multi-statement grande/complexo: tanto
a migration 0440 (502 linhas, muitos triggers) quanto a 0443 (222 linhas,
vários triggers com múltiplos `SELECT CASE ... END` no mesmo corpo)
reproduzem o mesmo `SQLITE_ERROR: incomplete input` por esse caminho no banco
descartável. As migrations 0441/0442, menores e estruturalmente mais simples,
por coincidência ficam abaixo do que quer que seja o teto de
complexidade/tamanho desse caminho — o que explica por que aplicaram
corretamente em produção antes, mesmo com o mesmo defeito latente.

O **exato mesmo texto combinado** (conteúdo da migration + `INSERT` no
ledger), quando submetido pela **ação `import` da API do D1** —
`wrangler d1 execute --remote --file <arquivo>`, que faz upload do arquivo
para processamento no servidor — funciona corretamente e de forma atômica em
100% dos testes, incluindo um teste de falha forçada (SQL propositalmente
inválido) que confirmou zero estado parcial em caso de erro.

### Correção

`scripts/production/apply-simuladores-matriz-0443-remote-migration.sh`
substitui `wrangler d1 migrations apply` por essa combinação comprovada:
constrói o mesmo texto "migration + INSERT no ledger" (via
`scripts/lib/migration-remote-apply.mjs`, a mesma função usada pelos testes),
escreve num arquivo temporário isolado, e submete via
`wrangler d1 execute --remote --file`. O `INSERT` no ledger faz parte da
mesma unidade atômica da mudança de schema — nunca um passo manual separado.
Mantém todos os gates do runner anterior (alvo de produção travado,
`AIRTRUST_ALLOW_PROD_DB_WRITE`/`AIRTRUST_CONFIRM_PROD_DB_WRITE`, `main` limpa
== `origin/main`, backup oficial validado por tamanho+SHA-256) e adiciona um
gate de idempotência: se `0443` já estiver ledgerada, o script sai sem
reenviar nada.

`scripts/apply-migration-production.sh` (o caminho genérico de
`d1 execute --remote --file` cru) agora recusa explicitamente 0443 pelo mesmo
motivo que já recusava 0440/0441/0442: aquele caminho não inclui o `INSERT`
no ledger, então nunca deve ser usado para estas migrations.

Nem a migration 0443 nem 0440/0441/0442 foram alteradas.
