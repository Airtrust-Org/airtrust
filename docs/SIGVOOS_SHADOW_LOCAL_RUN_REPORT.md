# SIGVOOS Shadow Local Run Report

**Veredito:** `SHADOW LOCAL EXECUTADO`

Data: 2026-06-15
Branch documental: `codex/sigvoos-shadow-local-run-report`
Executado por: Claude Sonnet 4.6 (modo controlado)

---

## 1. Status Pós-Merge do PR #37

| Campo | Valor |
|---|---|
| PR | [#37 — Invocador local protegido SIGVOOS shadow](https://github.com/airtrustsystem-alt/airtrust/pull/37) |
| Estado | `MERGED` |
| Merge em | 2026-06-15T21:27:33Z |
| Merge commit | `93b9414ea4099045025d20be367c41dbf42460ec` |
| Commit principal | `53ad94c1 test(controle-voos): add protected SIGVOOS shadow local invoker` |

### Checks pós-merge

| Workflow | Status | Observação |
|---|---|---|
| CI | `success` ✓ | |
| Tests | `success` ✓ | |
| Lint and Prettier Check | `success` ✓ | |
| Demo Data Prevention Check | `success` ✓ | |
| Deploy to GitHub Pages | `failure` | Falha pré-existente — não bloqueante |
| Cloudflare Deploy | Não rodou | Esperado — sem deploy autorizado |
| workflow_dispatch | Não disparado | Confirmado |

---

## 2. Fixtures Usadas

Diretório: `worker-airtrust/src/__tests__/fixtures/sigvoos/`
Total: **13 fixtures sintéticas versionadas**

| Fixture | Cenário |
|---|---|
| `sigvoos-com-flight-report-id.json` | Voo com `flight_report.id` presente |
| `sigvoos-multileg-flight-report-id.json` | Voo multi-leg com `flight_report.id` |
| `sigvoos-multileg-sem-flight-report-id.json` | Voo multi-leg sem `flight_report.id` |
| `sigvoos-sem-flight-report-id.json` | Voo sem `flight_report.id` |
| `sigvoos-com-staff-id.json` | Tripulante resolvido por `staff.id` |
| `sigvoos-apenas-staff-inscription.json` | Tripulante resolvido só por `inscription` |
| `sigvoos-staff-id-inscription-conflict.json` | Conflito: `staff.id` e `inscription` divergem |
| `sigvoos-staff-normalization-variants.json` | Variantes de normalização de inscrição |
| `sigvoos-sem-canac.json` | Tripulante sem `canac` (ausente empiricamente) |
| `sigvoos-leg-number-duplicado.json` | `leg.number` duplicado na mesma etapa |
| `sigvoos-multiple-null-legs.json` | Múltiplos legs com number `null` |
| `sigvoos-tripulante-repetido-mesma-etapa.json` | Tripulante repetido na mesma etapa |
| `sigvoos-optional-missing-extra-sensitive.json` | Campos opcionais ausentes + extras sensíveis |

Todos os payloads são sintéticos. Nenhum dado real de operador foi utilizado.

---

## 3. Métricas do Shadow Local

### Suíte: `controle-voos-sigvoos-shadow-local-invoker.test.ts`

| Métrica | Valor |
|---|---|
| Fixtures processadas (1ª execução) | 2 (LOADED: 2, FAILED: 0) |
| Payloads totais | 2 |
| Payloads processados | 2 |
| Payloads com falha | 0 |
| Modo retornado | `LOCAL_SHADOW` |
| Status de cada arquivo | `LOADED / PROCESSED` |
| Idempotência (2ª execução) | `reusedPayloads: 2`, `reusedRecords > 0` |
| Status na 2ª execução | `REUSED / REUSED` |

### Suíte: `controle-voos-sigvoos-importer-runner.test.ts`

| Métrica | Valor |
|---|---|
| Batch multi-fixture | Executado e métricas agregadas por payload |
| Idempotência de batch | Payloads e etapas reutilizados na 2ª execução |
| Isolamento por empresa_id | Confirmado (sem vazamento cross-tenant) |
| FRMS writes | 0 (frms_jornada + frms_alerta = 0) |
| Network calls | 0 |
| `frms-source-policy` | Não invocado |

### Suíte: `controle-voos-sigvoos-importer.test.ts`

16 cenários cobertos:
- Import com `flight_report.id` → sem duplicação;
- Idempotência de import duplo;
- `flight_report.id` ausente + leg numbers nulos;
- Resolução por `staff.id` anterior;
- Resolução por `staff.inscription` normalizada;
- Conflito explícito quando tripulante não é resolvível;
- Hash determinístico após strip de secrets;
- Isolamento por `empresa_id` sem FRMS ou `frms-source-policy`;
- Multi-leg com mesmo `flight_report.id` sem duplicar voo;
- Multi-leg sem `flight_report.id` com idempotência;
- Reutilização de etapa quando `leg.number` duplicado;
- Etapas distintas para múltiplos legs `null` no mesmo voo;
- Normalização de inscrições variantes com conflito explícito para valores inválidos;
- Conflito quando `staff.id` e `inscription` resolvem funcionários distintos;
- Sem duplicação de tripulante repetido na mesma etapa;
- Campos opcionais ausentes + strip de sensíveis com extras benignos em staging.

### Suíte: `controle-voos-sigvoos-integration-0411-schema.test.ts`

9 cenários de integração de schema:
- Criação de tabelas, colunas e índices do design 0411;
- Aditividade sobre dados N1 manuais sem alterar defaults;
- `flight_report_id`: múltiplos NULL permitidos, duplicados não-NULL bloqueados por empresa;
- Idempotência de etapas e tripulantes SIGVOOS quando external IDs presentes;
- Isolamento de tenant em etapas, staging links e conflitos;
- `staff.inscription` armazenado como TEXT raw e normalizado deterministicamente (sem dependência de CANAC);
- Hash de staging derivado de payload sanitizado com strip de secrets;
- Tripulante não-resolvível → conflito explícito (não insert silencioso);
- Rollback documentado de novas tabelas, índices e triggers em DB descartável.

---

## 4. Proteções Confirmadas

| Proteção | Status |
|---|---|
| Rejeição de URL externa (`https://`) | CONFIRMADO — warning `EXTERNAL_URL_REJECTED` |
| Bloqueio de caminho fora de fixtures sem flag dev | CONFIRMADO — warning `UNSAFE_LOCAL_PATH_REJECTED` |
| Liberação com `allowUnsafeLocalPathForDevOnly: true` | CONFIRMADO — funciona apenas explicitamente |
| JSON inválido → warning controlado, não crash | CONFIRMADO — warning `INVALID_JSON` |
| Isolamento `empresa_id` 6 vs 7 | CONFIRMADO — `cv_voos` separado por empresa |
| Sem writes FRMS (`frms_jornada` / `frms_alerta`) | CONFIRMADO — count = 0 em ambas |
| Sem chamada de rede (fetch mockado e inerte) | CONFIRMADO |
| Sem `frms-source-policy` invocado | CONFIRMADO |
| Idempotência na 2ª execução | CONFIRMADO — `REUSED` em todos os payloads |

---

## 5. Testes Executados

| Suite | Arquivo | Testes | Resultado |
|---|---|---|---|
| Shadow Local Invoker | `controle-voos-sigvoos-shadow-local-invoker.test.ts` | 3/3 | ✓ PASS |
| Importer Runner | `controle-voos-sigvoos-importer-runner.test.ts` | 3/3 | ✓ PASS |
| Importer | `controle-voos-sigvoos-importer.test.ts` | 16/16 | ✓ PASS |
| Schema 0411 | `controle-voos-sigvoos-integration-0411-schema.test.ts` | 9/9 | ✓ PASS |
| **Total** | | **31/31** | **✓ PASS** |

---

## 6. Validações Técnicas

| Validação | Resultado |
|---|---|
| `npx tsc --noEmit` | Limpo (sem erros) |
| `npm run build` | Sucesso (`built in 6.21s`) |
| `git diff --check` | Limpo (sem erros de whitespace) |
| `bash scripts/check-tracked-secrets.sh` | `[tracked-secrets] OK` |
| `bash scripts/validation/audit-deploy-scripts.sh` | Sem falhas críticas |
| `bash scripts/audit-dangerous-ops.sh` | `RESULT: PASS` (1 warning pré-existente em sync-production) |

---

## 7. Confirmações de Escopo

| Restrição | Status |
|---|---|
| API real SIGVOOS não chamada | CONFIRMADO |
| Sem credenciais SIGVOOS | CONFIRMADO |
| Sem deploy | CONFIRMADO |
| Sem migrations aplicadas (staging/produção) | CONFIRMADO |
| Sem D1 remoto | CONFIRMADO |
| Sem Cloudflare executado | CONFIRMADO |
| Sem R2 ou secrets reais | CONFIRMADO |
| Staging/produção intocados | CONFIRMADO |
| FRMS canônico intocado | CONFIRMADO |
| `frms-source-policy.ts` intocado | CONFIRMADO |
| Sem endpoint público criado | CONFIRMADO |
| Sem RBAC backend/multi-tenant alterado | CONFIRMADO |
| Sem schema alterado | CONFIRMADO |
| Sem migrations 0410/0411 aplicadas | CONFIRMADO |
| Sem dados reais em fixtures | CONFIRMADO |

---

## 8. Próxima Recomendação Macro

O invocador shadow local está validado e o canal técnico de ingestão SIGVOOS → Controle de Voos está coberto por testes em SQLite/D1 local descartável.

O próximo bloco recomendado é a **Fase de Schema (0410/0411)** — aplicação controlada das migrations em ambiente de desenvolvimento/staging com autorização explícita, seguida de validação de integração real antes de qualquer avaliação de produção.

Escopo da próxima fase:
- Autorização explícita para `wrangler d1 execute --local` com 0410 e 0411;
- Validação de integridade referencial em D1 local persistente;
- Testes de importer com D1 local (não SQLite descartável);
- Documentação de rollback confirmado.

Esta fase NÃO está autorizada neste ciclo.
