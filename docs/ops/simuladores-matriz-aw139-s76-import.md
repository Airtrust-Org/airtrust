# Importação controlada — matriz final AW139 e S-76

O importador lê os pacotes privados indicados pelo operador. Não copie os ZIPs, planilhas, guias HTML ou PDFs para este repositório. O contrato sanitizado versionado é `worker-airtrust/data/simuladores-matriz/session-contract-51.json` (51/918/22) e o resumo LOFT `loft-summary-22.json` (22/22).

## Estado de referência levantado em 2026-07-21

A matriz final exige 30/540/14 (AW139) e 21/378/8 (S-76). Modelos referenciados por ficha, sessão concluída, agendamento iniciado ou qualificação devem receber versão nova; os vínculos históricos não podem ser atualizados após publicação não-LEGACY.

## Dry-run obrigatório

```sh
task_tmp="$(cat /tmp/airtrust-simuladores-path)"
node worker-airtrust/scripts/prepare-simuladores-matriz-import.mjs \
  --aw139 "$task_tmp/AW139" --sk76 "$task_tmp/SK76" \
  --empresa-id <TENANT_ID> --tenant-state /tmp/airtrust-tenant-state.json \
  --out /tmp/airtrust-simuladores-plan
```

`--tenant-state` é um artefato temporário, sanitizado e gerado pela auditoria
read-only do tenant. Ele deve conter `empresa_id`, versões correntes,
manobras resolvidas, vínculos e o estado real da migration 0440. O planejador
recusa arrays vazios, estado de migration ausente ou tenant divergente: nunca
gera um fingerprint de produção com placeholders. Não versionar esse arquivo.

O plano sanitizado inclui contrato 51/918/22, 61 hashes de fonte (incluindo 51 HTML), `plan_sha256`, fingerprint da base, versões correntes esperadas, resumo LOFT, safeguards e o bloco `manobra_resolution`. Qualquer adulteração de hash/contrato/fingerprint/resolução falha fechado.

## Resolução de manobras (301 códigos canônicos)

As matrizes finais referenciam 301 códigos de manobra distintos (918 posições).
`prepare-simuladores-matriz-import.mjs` classifica cada código contra o
catálogo do próprio tenant (via `tenant-state.resolved_manoeuvres`) em exatamente
uma categoria — `EXACT_UNIQUE`, `FORMAL_ALIAS`, `LEGACY_EQUIVALENT`,
`TRUE_MISSING`, `COLLISION` ou `CROSS_TENANT_ONLY` — usando
`scripts/lib/matriz-manobra-resolution.mjs`. `FORMAL_ALIAS`/`LEGACY_EQUIVALENT`
exigem revisão humana e nunca são inferidos automaticamente; passe-os via
`tenant-state.manobra_resolution_overrides` com evidência.

A migration `0441` cria `simuladores_matriz_manobra_resolution`
(`UNIQUE(empresa_id, versao_matriz, codigo_canonico)`, imutável após inserção).
O aplicador cria manobras tenant-scoped para os tipos que exigem criação
*antes* dos 918 vínculos, registra a resolução, e só então cria os vínculos —
sempre pelo `manobra_id` resolvido, nunca por `manobras.codigo` diretamente.

Reaplicações (mesmo `versao_matriz`) nunca aceitam silenciosamente uma
resolução já registrada: cada campo (`resolution_type`, `source_hash` e,
conforme o caso, `manobra_id` ou o `create_payload` da manobra já criada — código
físico, nome, categoria, tipo_aeronave, descrição) é comparado byte a byte
contra o bloco aprovado do plano antes de reusá-la. Qualquer divergência falha
fechado: nenhum vínculo é criado e a linha imutável nunca é sobrescrita. O
`create_payload` completo (nome, categoria, tipo_aeronave, descrição,
referência técnica) é persistido em `manobras` (`descricao`,
`referencias_json`); `fase_voo`/`tipo_conteudo` são persistidos por vínculo em
`modelos_sessao_manobras_contexto`, pois descrevem o uso da manobra *nesta*
sessão, não uma propriedade inerente ao catálogo.

Reconciliação real de 2026-07-22 (tenant 6): 278/301 códigos já tinham
resolução única por código exato (`EXACT_UNIQUE`). Dos 23 restantes, uma
segunda auditoria semântica (nome normalizado, aeronave, domínio de
categoria, descrição e vínculos históricos) confirmou 5 como
`LEGACY_EQUIVALENT` de manobras já cadastradas sob nomenclatura antiga —
por exemplo o código canônico `WAR-TMP-30A` equivale à manobra legada de
código `WAR-TMP-30`, mesma aeronave e mesmo conteúdo, apenas sem o sufixo de
página do QRH. Os 18 códigos restantes foram confirmados `TRUE_MISSING`:
ausentes tanto no tenant quanto em toda a base (nenhuma outra empresa os
possui) e sem candidato semântico seguro — serão criados pelo aplicador a
partir das fontes canônicas, sem inventar conteúdo técnico. Total: 278 + 5 +
18 = 301.

## Aplicação local controlada

```sh
node worker-airtrust/scripts/apply-simuladores-matriz-import.mjs \
  --plan /tmp/airtrust-simuladores-plan/plan.json \
  --aw139 "$task_tmp/AW139" --sk76 "$task_tmp/SK76" \
  --empresa-id <TENANT_ID> --d1-local <arquivo-sqlite-local> \
  --import-uuid <uuid> --dry-run

node worker-airtrust/scripts/apply-simuladores-matriz-import.mjs \
  ... --apply
```

Regras: somente D1 local explícito; recusa `--remote`/staging/produção; ordem atômica modelo→vínculos→contextos→versão; segundo apply com o mesmo UUID/hash é idempotente.

## Rollback compensatório append-only

```sh
node worker-airtrust/scripts/rollback-simuladores-matriz-import.mjs \
  --d1-local <arquivo-sqlite-local> --empresa-id <TENANT_ID> \
  --import-uuid <uuid>
```

Cria V3 compensatória equivalente à V1 (`COMPENSATE`), preserva V1/V2, não apaga fichas/sessões/qualificações/auditoria e é idempotente na segunda execução.

## Guias do instrutor (51/51)

```sh
node worker-airtrust/scripts/relink-simuladores-guias-instrutor.mjs \
  --d1-local <arquivo-sqlite-local> --empresa-id <TENANT_ID>
```

Resolve cada uma das 51 sessões a exatamente um guia ativo — por código
canônico exato quando o guia carrega o código atual, ou por assinatura
estruturada (aeronave + programa + ciclo + sessão) quando o guia usa
nomenclatura legada. O código exato nunca é aceito sozinho: mesmo com match
de código, aeronave/programa/ciclo precisam ser compatíveis (`scripts/lib/matriz-guia-resolution.mjs`).
`ciclo` ausente no contrato é derivado do próprio `codigo_canonico`
(ex.: `S76-P-01/04-C1` → ciclo 1) quando necessário — não é inferência de
conteúdo novo, apenas leitura do mesmo código canônico já confiável em todo
o pipeline. `programa` do guia é comparado tanto contra o programa curricular
amplo quanto contra o `tipo_qualificacao_estruturado` da sessão, pois dados
reais usam os dois de forma inconsistente entre AW139 e S-76.

No relink: qualquer vínculo ativo antigo (apontando para uma versão não
corrente) é sempre desativado por soft delete, mesmo quando o vínculo correto
já existe; o resultado final é validado para exatamente 1 vínculo ativo por
guia e por modelo corrente, 30 AW139 + 21 S-76, sem órfãos.

## Executor de produção (tenant-scoped, desabilitado por padrão)

`POST /api/admin/simuladores-matriz-import/{dry-run,apply,rollback}`
(`worker-airtrust/src/routes/admin-simuladores-matriz-executor.ts`) é a
contraparte HTTP do aplicador local, restrita a `empresa_id=6`. Usa as MESMAS
funções puras de validação e geração de SQL do aplicador local
(`scripts/lib/matriz-apply-core.mjs`), de modo que os dois nunca possam
divergir silenciosamente; a escrita é um único `D1Database.batch()` atômico.

Exige, nesta ordem: `ENABLE_SIMULADORES_MATRIZ_EXECUTOR=true` (desabilitado
por padrão — nunca setar em produção sem autorização explícita para a
execução específica), autenticação admin do próprio tenant 6, e todas as
validações do plano (schema, 61 hashes, 301 resoluções, 51/918/22,
fingerprint, migrations 0440/0441) antes de qualquer escrita. Rate-limited a
3 requisições/minuto. Testado integralmente contra um double de D1 local
(`src/__tests__/routes/admin-simuladores-matriz-executor.test.ts`); nunca
invocado contra produção.

### Incidente 2026-07-24: SQLITE_AUTH no apply (causa e correção)

Uma janela autorizada de execução em produção (empresa_id=6) falhou com
`SQLITE_AUTH` ao chamar `db.batch()`. Auditoria forense read-only confirmou
zero escrita de domínio (o batch falhou atomicamente antes do primeiro
statement commitar) e ledger/schema de 0440/0441/0442 intactos — ver
`/Users/filipedaumas/AirTrust_Operational_Archive/2026-07-24-sqlite-auth-incident/forensic-readonly-report.json`.

Causa raiz: `buildModelAndLinkStatements` (`scripts/lib/matriz-apply-core.mjs`)
gerava `CREATE TEMP TABLE` para preparar dados de trabalho por modelo/vínculo
antes de inserir nas tabelas permanentes. O autorizador de query remota do D1
rejeita qualquer DDL — incluindo `CREATE TEMP TABLE` — e `PRAGMA` avulso, com
`SQLITE_AUTH`, tanto em produção quanto no emulador local (reproduzido de
forma idêntica com `PRAGMA integrity_check` e com um `CREATE TEMP TABLE`
isolado via `env.DB.batch()` real).

Correção: os dados de trabalho por modelo/vínculo agora são computados em
JS antes da geração de SQL e inlineados como CTEs
(`WITH _models(...) AS (VALUES ...)`, `WITH _links(...) AS (VALUES ...)`),
repetidos em cada statement que precisa deles — sem nenhuma tabela
temporária, DDL, `PRAGMA`, `BEGIN` ou `COMMIT` no batch. Achado adicional
durante a validação: unir a CTE `_links` inteira (918 linhas) contra tabelas
permanentes com `CASE`/`json_object` num único statement excede o limite de
complexidade do D1 (`SQLITE_TOOBIG`), mesmo com o texto SQL bem abaixo do
limite de tamanho (~68KB); por isso os vínculos são fatiados em lotes de 150
(`LINKS_CHUNK_SIZE`) — ainda dentro do mesmo `db.batch()` atômico.

## LOFT 22/22

```sh
node worker-airtrust/scripts/validate-simuladores-matriz-loft.mjs \
  --aw139 "$task_tmp/AW139" --sk76 "$task_tmp/SK76" \
  --report /tmp/airtrust-loft-report.json
```

Relatório detalhado somente em `/tmp`. No repositório permanece apenas o resumo sanitizado 22/22.

Não há comando de staging ou produção nesta mudança. A migration `0440` não contém carga de dados e não deve ser executada remotamente sem revisão operacional.
