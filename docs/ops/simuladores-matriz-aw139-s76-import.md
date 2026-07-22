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
Reaplicações (mesmo `versao_matriz`) reusam a resolução já registrada em vez
de duplicar a manobra.

Reconciliação real de 2026-07-22 (tenant 6): 278/301 códigos já tinham
resolução única (`EXACT_UNIQUE`); os 23 restantes foram confirmados ausentes
tanto no tenant quanto em toda a base (nenhuma outra empresa os possui) e
classificados `TRUE_MISSING` — serão criados pelo aplicador a partir das
fontes canônicas, sem inventar conteúdo técnico.

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

## LOFT 22/22

```sh
node worker-airtrust/scripts/validate-simuladores-matriz-loft.mjs \
  --aw139 "$task_tmp/AW139" --sk76 "$task_tmp/SK76" \
  --report /tmp/airtrust-loft-report.json
```

Relatório detalhado somente em `/tmp`. No repositório permanece apenas o resumo sanitizado 22/22.

Não há comando de staging ou produção nesta mudança. A migration `0440` não contém carga de dados e não deve ser executada remotamente sem revisão operacional.
