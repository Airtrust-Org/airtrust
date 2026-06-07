# AIRTRUST — Lote 3 Dry-Run: `frms_jornada` sem tenant

**Data:** 2026-06-07  
**Branch:** `main`  
**HEAD:** `53c232b`  
**Produção auditada:** D1 `airtrust-db` (somente `SELECT`)  
**Escrita executada:** nenhuma  
**Status:** LOTE 3 DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO

## 1. Escopo e restrições

- Objetivo: auditar resíduos de `frms_jornada` com `empresa_id IS NULL` e separar o que é auto-aplicável do que exige revisão manual.
- Proibido nesta sessão: `UPDATE`, `DELETE`, `INSERT`, migration, backfill, deploy, push obrigatório e qualquer reaplicação da 0391.
- FIRA 0391 foi tratado como trilha separada. Registros rotulados com `FIRA_HISTORICO` ficaram fora do auto-apply.

## 2. Estado inicial confirmado

- `HEAD == origin/main == 53c232b161ab9e7883be70e43e7bb35625015ee2`
- `ahead/behind = 0/0`
- tracked changes: nenhuma
- untracked esperados apenas em `artifacts/`

## 3. Documentos lidos antes dos SELECTs

- `docs/AIRTRUST_TENANT_WRITE_PATH_FIX_20260607.md`
- `docs/AIRTRUST_SANITIZATION_DRY_RUN_PREP_20260607.md`
- `docs/AIRTRUST_QUALIFICATION_TENANT_RECONCILIATION_DRY_RUN_20260607.md`
- `docs/AIRTRUST_QUALIFICATION_TENANT_RECONCILIATION_APPLY_20260607.md`
- `docs/AIRTRUST_DOCUMENTS_TENANT_RECONCILIATION_DRY_RUN_20260607.md`
- `docs/AIRTRUST_DOCUMENTS_TENANT_RECONCILIATION_APPLY_20260607.md`
- `docs/AIRTRUST_FIRA_0391_SEPARATE_AUDIT_20260607.md`

## 4. Schema real confirmado

### `frms_jornada`

Colunas relevantes medidas em produção:

- `id`
- `tripulante_id`
- `data`
- `status`
- `hora_apresentacao`
- `hora_termino`
- `duracao_jornada_minutos`
- `horas_voo_minutos`
- `observacao`
- `origem`
- `created_at`
- `updated_at`
- `deleted_at`
- `empresa_id`

Observações:

- A tabela usa `tripulante_id`, não `funcionario_id`.
- Não existe coluna `tipo`; o campo operacional real é `status`.
- O tenant da jornada é `frms_jornada.empresa_id`; o tenant do empregado continua em `funcionarios.empresa_id`.

### Tabelas relacionadas realmente encontradas

- `funcionarios`
- `frms_alerta`
- `frms_fadiga_checkin`
- `frms_fatorizacao_jornada`
- `frms_acumulo_rolling`
- `horas_voo_lancamentos`
- `sgso_relatos`
- `escala_eventos`

Notas de nomenclatura:

- Não existe `frms_alertas`; o nome real é `frms_alerta`.
- Não existe `frms_checkins`; o nome real é `frms_fadiga_checkin`.

## 5. Contagens gerais reconciliadas

| Métrica | Valor |
|---|---:|
| Total físico `frms_jornada` | 5210 |
| `empresa_id IS NULL` total | 2378 |
| `empresa_id IS NULL` ativos | **667** |
| `empresa_id IS NULL` soft-deleted | 1711 |
| `empresa_id = 1` ativos | **0** |
| `empresa_id = 6` ativos | 259 |
| `empresa_id` outros ativos | 0 |
| `NULL + funcionário empresa 6 ativo` | **534** |
| `NULL + funcionário empresa 6 soft-deleted` | 0 |
| `NULL + funcionário empresa 6 inativo/status` | **133** |
| `NULL + funcionário inexistente` | 0 |
| `NULL + funcionário sem empresa` | 0 |
| `NULL + funcionário outro tenant` | 0 |
| Soft-deleted total | 4284 |

Leitura principal:

- O resíduo atual é exclusivamente `NULL -> empresa 6`.
- Não restaram ativos em `empresa_id = 1`.
- O bloqueio operacional relevante não é órfão nem soft-delete; é funcionário inativo em 133 linhas.

## 6. Classificação por origem

| Origem | Total | Ativos | Soft-deleted | Funcionários distintos | Período | Candidatos automáticos |
|---|---:|---:|---:|---:|---|---:|
| `FIRA` | 4068 | 531 | 3537 | 31 | 2021-08-01 → 2026-08-31 | 0 |
| `SIGVOOS` | 455 | 261 | 194 | 18 | 2026-01-01 → 2026-06-05 | 10 |
| `MANUAL` | 297 | 134 | 163 | 18 | 2026-01-16 → 2026-08-16 | 66 |
| `APUS` | 389 | 0 | 389 | 16 | 2026-01-01 → 2026-05-01 | 0 |
| `SIMULADOR` | 1 | 0 | 1 | 1 | 2026-02-20 → 2026-02-20 | 0 |

Detalhe do conjunto automático:

| Origem | Total | Funcionários distintos | Período | Marcador |
|---|---:|---:|---|---:|
| `MANUAL` | 66 | 8 | 2026-05-01 → 2026-05-31 | 66 com `observacao` `[ESCALA:...][EVENTO:...]` |
| `SIGVOOS` | 10 | 5 | 2026-05-01 → 2026-05-03 | 10 com `Reconstrução FRMS SIGVOOS 2026` |

## 7. Funcionários

Distribuição dos `667` ativos sem tenant:

- `534` ligados a funcionário da empresa 6 ativo
- `133` ligados a funcionário da empresa 6 inativo
- `0` ligados a funcionário soft-deleted
- `0` órfãos
- `0` ligados a outro tenant

Os 133 de revisão manual se concentram em sete pessoas inativas:

| Tripulante | Nome | Jornadas NULL ativas |
|---|---|---:|
| 40 | Jheter Pontes E Silva Junior | 42 |
| 36 | Eduardo Luiz Brandão Ribeiro | 30 |
| 24 | Rafael Siegmann Paradeda | 22 |
| 9 | Fernando Augusto Vieira Lage | 15 |
| 4 | Bernardo Freire Antunes | 9 |
| 2 | Allan Fernandes Da Silva | 8 |
| 8 | Eduardo Scolari Fausto Raposo | 7 |

## 8. Soft-deleted, duplicidades e inconsistências

### Soft-deleted

- `1711` linhas `empresa_id IS NULL` estão soft-deleted.
- Regra mantida: soft-deleted não entra em apply automático.

### Duplicidades

Chave canônica usada:

- `tripulante_id`
- `data`
- `origem`
- `hora_apresentacao`
- `hora_termino`
- `duracao_jornada_minutos`
- `horas_voo_minutos`

Resultado:

- duplicado exato: `0` grupos / `0` linhas
- duplicado provável: `0` grupos / `0` linhas

### Inconsistências de jornada

Nos `667` candidatos ativos `empresa_id IS NULL`:

- `horas_voo_minutos > duracao_jornada_minutos` com jornada positiva: `0`
- `duracao_jornada_minutos = 0` e `horas_voo_minutos > 0`: `5`
- `data` nula: `0`
- `origem` nula: `0`
- `data` futura: `0`
- `observacao LIKE '%FIRA_HISTORICO%'`: `523`

Observação importante:

- As 5 jornadas `jornada=0 / HV>0` já caem fora do auto-apply por revisão manual; 4 estão em FIRA ativo rotulado e 1 está em funcionário inativo.

## 9. Classificação final do dry-run

### Aplicável automaticamente

Critérios exigidos:

- `empresa_id IS NULL`
- `frms_jornada.deleted_at IS NULL`
- `funcionarios.empresa_id = 6`
- funcionário ativo (`deleted_at IS NULL`, `ativo = 1`, `status = 'ATIVO'`)
- sem duplicidade
- sem inconsistência bloqueante
- sem `FIRA_HISTORICO`

Resultado:

- **76** linhas auto-aplicáveis
- composição:
  - `66` `MANUAL` geradas por Escala
  - `10` `SIGVOOS`

### Revisão manual

Resultado:

- **591** linhas em revisão manual
- composição:
  - `523` `FIRA` com label 0391 (`FIRA_HISTORICO`)
  - `68` `MANUAL` com funcionário inativo

### Não aplicar automaticamente

- todo `FIRA_HISTORICO`
- funcionário inativo
- qualquer soft-deleted
- qualquer duplicidade futura
- qualquer inconsistência de jornada fora do escopo tenant

## 10. Impacto operacional mapeado

### FRMS

- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts:132` usa `COALESCE(j.empresa_id, f.empresa_id) = ?`.
  - Efeito: jornadas `NULL` de empregados e6 já entram no cálculo. Mover para `6` não deve duplicar resultado; só normaliza o tenant persistido.
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts:616` busca jornada do dia por `tripulante_id + data`, sem filtro de tenant.
  - Efeito: check-in do dia já encontra jornadas `NULL`.
- `worker-airtrust/src/cron/frms-daily-check.ts:94` e `:124` consultam `frms_jornada` por `tripulante_id + data`, sem `empresa_id`.
  - Efeito: notificações e checagens diárias já enxergam essas linhas.
- `worker-airtrust/src/services/escala-mensal-integrada.ts:846` usa `LEFT JOIN frms_jornada j` e ancora o tenant em `funcionarios`.
  - Efeito: alertas integrados já conseguem derivar data via jornada quando o empregado é e6.

### Escala

- `worker-airtrust/src/routes/escalas-status.ts:296` já grava `frms_jornada.empresa_id` no `INSERT OR IGNORE`.
  - Efeito: o resíduo atual é legado, não fluxo novo.
- `worker-airtrust/src/routes/escalas/index.ts:245` e `worker-airtrust/src/routes/escalas-core.ts:261` calculam score FRMS sem filtro de tenant na jornada.
  - Efeito: horas e dias já contam linhas `NULL`; o apply futuro não tende a inflar score, apenas a normalizar propriedade.
- `worker-airtrust/src/routes/escalas-evd.ts:833` usa `UNION ALL` com `frms_jornada` sem `empresa_id`.
  - Efeito: repouso mínimo do EVD já pode usar corte motor vindo dessas jornadas `NULL`.

### SGSO / horas de voo

- `worker-airtrust/src/routes/sgso.ts:191` exige `fj.empresa_id = ?`.
  - Efeito: SGSO não auto-vincula hoje essas jornadas `NULL`; passará a vincular após um apply autorizado.
- `worker-airtrust/src/routes/sgso-kpi.ts:177` constrói filtro estrito `empresa_id = ?`.
  - Efeito: KPIs de horas FRMS excluem hoje as jornadas `NULL`; um apply futuro aumentará os totais do KPI.
- `worker-airtrust/src/shared/handlers/horasVooFromFrms.handler.ts:21` exige `WHERE id = ? AND empresa_id = ?`.
  - Efeito: `horas_voo_lancamentos` não sincroniza jornadas `NULL`.
- `worker-airtrust/src/lib/frms/fira-horas-voo.ts:15` também exige `fj.empresa_id = ?`.
  - Efeito: sincronização FIRA→horas de voo ignora jornadas `NULL`.

## 11. Evidência de vínculos já persistidos no conjunto automático

Entre os 76 auto-candidatos:

- `10` jornadas já têm `frms_fatorizacao_jornada`
- `4` jornadas já têm `frms_alerta` associado (`6` linhas de alerta no total)
- `3` têm `frms_fadiga_checkin` da empresa 6 no mesmo dia
- `0` já aparecem em `horas_voo_lancamentos`
- `0` já aparecem em `sgso_relatos.frms_jornada_id`

Conclusão operacional:

- o apply futuro altera visibilidade real em SGSO/KPI/sync de horas de voo;
- FRMS e Escala já enxergam boa parte do resíduo por `tripulante_id`, `COALESCE` ou ausência de filtro de tenant;
- não há indício de duplicação por FK já materializada fora do FRMS para os 76 IDs.

## 12. Scripts gerados

- `scripts/sanitization/dry-run-frms-lote3.sql`
- `scripts/sanitization/apply-frms-lote3.sql`
- `scripts/sanitization/rollback-frms-lote3.sql`

Regras dos scripts:

- dry-run: somente `SELECT` / `PRAGMA`
- apply: apenas os `76` IDs automáticos de alta confiança
- rollback: lista explícita dos mesmos `76` IDs, restaurando `empresa_id = NULL`

## 13. Conclusão

O Lote 3 não está pronto para apply amplo. O que existe hoje é:

- um subconjunto **seguro e estrito** de `76` jornadas (`MANUAL` via Escala + `SIGVOOS`) para eventual `NULL -> 6`;
- um bloco **manual** de `591` jornadas fora do auto-apply, dominado por FIRA 0391 e funcionários inativos.

## 14. Confirmações desta sessão

- nenhum `UPDATE`, `DELETE`, `INSERT`, `UPSERT` executado em produção
- nenhuma migration aplicada
- nenhum deploy executado
- nenhum push executado
- nenhum apply do Lote 3 executado

## Classificação final

```text
LOTE 3 DRY-RUN CONCLUÍDO — PRONTO PARA REVISÃO
```
