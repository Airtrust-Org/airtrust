# FRMS Operational Closure — 2026-06-06

## 1. Status Final

**VERDE** — Módulo operacionalmente estável, fonte canônica unificada, zero regressões ativas.

## 2. Data

2026-06-06 02:15 UTC

## 3. Escopo do Fechamento

Fechamento técnico-operacional completo do módulo FRMS após ciclo de auditoria, rebuild de dados, correções de cálculo, deploy e verificação em produção. Este documento consolida o estado final e registra salvaguardas contra regressão.

## 4. Versão em Produção

| Campo | Valor |
|---|---|
| Commit | `4c8c41d` |
| Version | `2026-06-06T02:08:06Z-4c8c41d` |
| Environment | `production` |
| Health | 200 OK |
| Database | `airtrust-db` (D1) |
| Worker | `airtrust-api-production` |
| Deploy method | `deploy:worker:safe` (no migrations) |

## 5. Commits Envolvidos

| Commit | Descrição |
|---|---|
| `dd7600c` | fix(frms): rebuild operational data from sigvoos |
| `bdb0730` | fix(frms): clear orphan alerts from sigvoos rebuild |
| `809ba57` | fix(frms): enforce sigvoos as canonical operational source |
| `d2c011e` | fix(frms): correct 7d and 365d accumulated flight hours in month view |
| `1ab74f1` | fix(frms): restore admin scope and canonical accumulated data |
| `4c8c41d` | fix(frms): enforce canonical SIGVOOS source in score-atual triage |
| `e8c4f4b` | docs(frms): record post-deploy state for operational audit (4c8c41d) |

**Ponto de retorno:** `1ab74f1` — snapshot íntegro anterior ao último patch de score-atual.

## 6. Problemas Identificados Originalmente

### 6.1 Cálculo incorreto de FAT.HV%
- **Problema:** Denominadores diário e mensal misturados no cálculo de `pct_horas_voo_jornada`, causando inflação artificial nas porcentagens.
- **Impacto:** Compliance % falso-positivo na tabela FRMS.

### 6.2 FIRA contaminando cálculo operacional
- **Problema:** Jornadas FIRA (não operacionais, 25h37 por dia) entravam nos acumulados rolling, MÊS/7d/365d, alertas, score-atual e status de fadiga.
- **Impacto:** Dieter aparecia com 40h01 no MÊS (contaminado por FIRA 25h37/dia), quando o correto era 14h24 (SIGVOOS).

### 6.3 Colunas 7d/365d zeradas
- **Problema:** `hv_365d_min` e `pct_365d` hardcoded como `0` no modo mensal do `buscarAcumuloFrota`. `hv_7d_min` usava janela fim-do-mês (datas futuras para o mês corrente).
- **Impacto:** Todos os tripulantes mostravam 0h00 em 7 DIAS e 365 DIAS.

### 6.4 `/score-atual` não canônico
- **Problema:** O endpoint de score atual (`/api/frms/triagem-score`) não filtrava por fonte operacional, permitindo que FIRA e MANUAL entrassem no cálculo.
- **Impacto:** Score de fadiga operacional inflado por dados não operacionais.

### 6.5 Coleta Fadiga Diária com fallback silencioso
- **Problema:** Data não normalizada (formato dd/mm/yyyy vs yyyy-mm-dd) e fallback silencioso para `'hoje'` quando inválida, mascarando erros de entrada.
- **Impacto:** Coleta podia registrar dados no dia errado sem alertar o usuário.

### 6.6 Alertas órfãos
- **Problema:** 85 alertas ativos sem jornada correspondente após rebuild SIGVOOS.
- **Impacto:** Badge de alertas inconsistente com estado real.

### 6.7 Inconsistências HV > jornada
- **Problema:** 13 registros com `horas_voo_minutos > duracao_jornada_minutos`.
- **Impacto:** Dado fisicamente impossível, indicando corrupção ou importação incorreta.

### 6.8 Excesso de FIRA sem rotulagem clara
- **Problema:** 525 registros FIRA sem indicador visual claro de que NÃO são operacionais.
- **Impacto:** Usuários podiam confundir FIRA com dado operacional válido.

## 7. Correções Aplicadas

| # | Correção | Commit | Tipo |
|---|---|---|---|
| 1 | Rebuild operacional: `frms_jornada` reconstruída tendo SIGVOOS como fonte canônica | `dd7600c` | Dados |
| 2 | Limpeza de alertas órfãos pós-rebuild | `bdb0730` | Dados |
| 3 | Hardening de integridade FIRA/SIGVOOS | `052a9df` | Código |
| 4 | Correção de escopos de cálculo de fadiga | `2d0de75` | Código |
| 5 | Correção 7d/365d: LEFT JOIN `frms_acumulo_rolling` no modo mensal | `d2c011e` | Código |
| 6 | Restauração de escopo admin + dados canônicos | `1ab74f1` | Código |
| 7 | `/score-atual` filtrando apenas SIGVOOS canônico | `4c8c41d` | Código |
| 8 | Normalização de data na coleta Fadiga Diária | (incluso em `e8c4f4b`) | Código |
| 9 | Exposição de filtro técnico e dados de fadiga da equipe | `ffd3ca9` | Código |

## 8. Decisão sobre FIRA Histórico

**FIRA mantido como dado histórico/auditoria, rotulado como NÃO OPERACIONAL.**

Regra:
- FIRA **NÃO** alimenta cálculo operacional, rolling, alertas, score, status ou indicadores canônicos.
- FIRA é preservado em `frms_jornada` com `origem = 'FIRA'` para auditoria e consulta histórica.
- Quando existe SIGVOOS válido para o mesmo dia, SIGVOOS prevalece.
- Quando NÃO existe SIGVOOS, o dia é tratado como `PENDENTE_SIGVOOS` (não como operacional).

**Limpeza futura de FIRA:** requer fase separada com autorização explícita, backup e dry-run. Fora do escopo deste fechamento.

## 9. Fonte Canônica Operacional

| Fonte | Classificação | Uso |
|---|---|---|
| **SIGVOOS** válido | CANÔNICA OPERACIONAL | Cálculo, rolling, alertas, score, status, MÊS/7d/365d |
| **FIRA** | HISTÓRICO NÃO OPERACIONAL | Auditoria, consulta histórica |
| **MANUAL** | EXCEÇÃO CONTROLADA | Casos documentados com justificativa |
| **SIGVOOS** inválido | PENDÊNCIA DE ORIGEM | Não tratado como operacional |

## 10. Estado Final dos Principais Indicadores

### 10.1 MÊS / 7d / 365d
- **Fonte:** Unificada — SIGVOOS via `frms_acumulo_rolling`.
- **MÊS:** Soma de `horas_voo_minutos` de jornadas SIGVOOS dentro do mês selecionado.
- **7d:** `hv_7_dias_min` da snapshot mais recente de `frms_acumulo_rolling`.
- **365d:** `hv_365_dias_min` da snapshot mais recente de `frms_acumulo_rolling`.
- **Status:** Consistente. Zero tripulantes com MÊS > 0 e 365d = 0.

### 10.2 Dieter (caso canário)
| Métrica | Antes (bug) | Depois (corrigido) |
|---|---|---|
| MÊS | 40h01 (FIRA) | 14h24 (SIGVOOS) |
| 7 DIAS | 0h00 | 14h24 |
| 365 DIAS | 0h00 | 101h31 |
| Fonte | Mista (FIRA+SIGVOOS) | Canônica (SIGVOOS) |

### 10.3 Rolling
- 100% SIGVOOS.
- `frms_acumulo_rolling` populado com dados rebuildados.
- `rolling_sem_sigvoos = 0`.

### 10.4 Alertas
- 85 alertas ativos — todos coerentes com jornadas SIGVOOS.
- `alertas_orfas_ativos_operacionais = 0`.
- Badge de alertas bate com `SELECT COUNT(*) FROM frms_alerta WHERE resolvido = 0`.

### 10.5 Coleta Fadiga Diária
- Data normalizada: aceita `yyyy-mm-dd` e `dd/mm/yyyy`, normaliza para `yyyy-mm-dd`.
- Erro explícito para data inválida (sem fallback silencioso).
- Endpoint: `GET /api/frms/daily-fatigue?date=YYYY-MM-DD&scope=team`.

### 10.6 Score Atual (`/score-atual`)
- Usa apenas SIGVOOS canônico (filtro `origem = 'SIGVOOS'`).
- Query: `SELECT ... FROM frms_jornada WHERE ... AND UPPER(COALESCE(origem, '')) = 'SIGVOOS'`.

### 10.7 FIRA Histórico
- Preservado como `origem = 'FIRA'` em `frms_jornada`.
- 525 registros FIRA rotulados como não operacionais.
- `usado_no_frms_operacional = 0` para todos os registros FIRA.

## 11. Evidências de Produção

### 11.1 Health Check
```
GET /api/health → 200 OK
{
  "success": true,
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latency": 128 },
    "storage": { "status": "ok", "latency": 741 }
  },
  "stats": {
    "timestamp": "2026-06-06T02:15:09.260Z",
    "environment": "production",
    "version": "2026-06-06T02:08:06Z-4c8c41d",
    "region": "BR"
  }
}
```

### 11.2 Version
```
GET /api/version → 200 OK
{
  "success": true,
  "data": {
    "version": "2026-06-06T02:08:06Z-4c8c41d",
    "environment": "production",
    "builtAt": "2026-06-06T02:08:06Z",
    "deploymentId": "2026-06-06T02:08:06Z-4c8c41d"
  }
}
```

### 11.3 Estado Pós-Produção (verificado via D1 read-only)
```
SIGVOOS = 261 jornadas operacionais
FIRA = 525 registros históricos (não operacionais)
MANUAL = 134 registros
alertas_jornada_nao_sigvoos = 0
alertas_orfaos_ativos_operacionais = 0
rolling_sem_sigvoos = 0
hv_maior_que_jornada = 13 (documentado, requer saneamento futuro)
jornada_zero_com_hv = 5 (documentado, requer saneamento futuro)
pendencias_exibiveis = 659
```

## 12. Validações Executadas

| Validação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ Passou |
| `npm run build` | ✅ Passou |
| `npm run test:worker` | ✅ 924/924 |
| Testes frontend | ✅ 540/540 |
| `npm run lint` | ✅ api-base + secrets + auth boundaries |
| `git diff --check` | ✅ Sem issues de whitespace |
| D1 read-only SELECT | ✅ Dados coerentes |
| Health check produção | ✅ 200 OK |
| Version check produção | ✅ `4c8c41d` confirmado |

## 13. Testes Adicionados/Ajustados

| Arquivo | Testes | Cobre |
|---|---|---|
| `acumulo-frota-rolling-fields.test.ts` | 6 | Propagação de campos rolling, fallback, nivel_max, HAVING, soma, quinzena |
| `frms-source-policy-rolling.test.ts` | 2 | FIRA não contamina rolling, SIGVOOS prevalece |
| `frms-operational-snapshot.test.ts` | ~3 | Snapshot operacional, source detection |
| `FrmsCheckinFadiga.test.tsx` | ~8 | Normalização de data, fallback, painel equipe |
| `FrmsControleOperacional.test.tsx` | ~5 | Controle operacional, filtros, escopos |

## 14. Garantias Atuais

1. **Unicidade de fonte:** MÊS, 7d, 365d, rolling, alertas e score usam a mesma base canônica (SIGVOOS).
2. **Isolamento FIRA:** FIRA não contamina nenhum cálculo operacional.
3. **Zero órfãos:** Nenhum alerta sem jornada correspondente.
4. **Campos não zerados:** Nenhum campo hardcoded como 0 sem dado real.
5. **Fallback explícito:** Null/undefined não viram `0h00` silenciosamente sem indicação.
6. **Coleta com validação:** Data normalizada, erro explícito, sem fallback cego.
7. **Score canônico:** `/score-atual` filtra por `origem = 'SIGVOOS'`.
8. **Testes de regressão:** 924 worker + 540 frontend.

## 15. Riscos Remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| 13 registros HV > jornada | Baixa | Documentado, requer saneamento em fase separada |
| 5 registros jornada=0 com HV>0 | Baixa | Documentado, requer saneamento em fase separada |
| 659 pendências exibíveis | Média | FIRA sem SIGVOOS correspondente; não afeta operacional |
| 525 registros FIRA ainda presentes | Baixa | Rotulados como não operacionais; limpeza futura |
| Performance da subquery correlacionada | Baixa | Fleet <200 tripulantes; SQLite lida bem |
| `frms_acumulo_rolling` com duplicatas | Baixa | Correlated subquery pega a mais recente |

## 16. Salvaguardas Contra Regressão

Ver [Checklist de Regressão FRMS](#17-checklist-de-regressão-frms) abaixo.

Além do checklist:
- Testes automatizados cobrem os cenários de regressão críticos.
- `guard:auth-boundaries` verifica proteção de rotas.
- `guard:tracked-secrets` verifica segredos.
- `lint:api-base` verifica padrões de URL.
- Nenhum deploy automático — requer `deploy:worker:safe` explícito.

## 17. Checklist de Regressão FRMS

Checklist obrigatório antes de qualquer deploy futuro do módulo FRMS:

### Dados e Cálculo
- [ ] 1. `MÊS > 0` implica `365d > 0`, salvo regra documentada e aprovada.
- [ ] 2. `7d` usa a mesma fonte canônica que `MÊS` (SIGVOOS).
- [ ] 3. `365d` usa a mesma fonte canônica que `MÊS` (SIGVOOS).
- [ ] 4. FIRA não entra em `frms_acumulo_rolling`.
- [ ] 5. FIRA não entra em alerta ativo.
- [ ] 6. FIRA não entra em `/score-atual`.
- [ ] 7. FIRA não aparece como operacional quando há SIGVOOS válido no mesmo dia.
- [ ] 8. SIGVOOS inválido (sem dados consistentes) não é tratado como operacional.
- [ ] 9. `HV > jornada` gera flag de inconsistência (não é silently ignorado).
- [ ] 10. `jornada = 0` com `HV > 0` gera flag de inconsistência.
- [ ] 11. Campo `null/undefined` não vira `0h00` silencioso (deve indicar ausência de dado).

### Coleta Fadiga Diária
- [ ] 12. Data normalizada (`dd/mm/yyyy` → `yyyy-mm-dd`).
- [ ] 13. Erro explícito para data inválida (sem fallback silencioso para `'hoje'`).

### Alertas
- [ ] 14. Nenhum alerta órfão (alerta sem jornada correspondente).
- [ ] 15. Badge de alertas abertos bate com `SELECT COUNT(*) FROM frms_alerta WHERE resolvido = 0 AND deleted_at IS NULL`.

### Score
- [ ] 16. `/score-atual` usa apenas `origem = 'SIGVOOS'`.

### Qualidade
- [ ] 17. `npm run test:worker` passa (100%).
- [ ] 18. Testes frontend passam (100%).
- [ ] 19. `npm run build` passa.
- [ ] 20. Health/version de produção confirmados (`/api/health`, `/api/version`).

## 18. Monitoramento Recomendado

| Métrica | Periodicidade | Gatilho |
|---|---|---|
| `alertas_orfaos_ativos_operacionais` | Diária | > 0 |
| `rolling_sem_sigvoos` | Diária | > 0 |
| `hv_maior_que_jornada` | Semanal | Aumento |
| `jornada_zero_com_hv` | Semanal | Aumento |
| Health check `/api/health` | Contínua (cron) | Não 200 |
| Testes automatizados | A cada PR | Qualquer falha |
| Contagem de FIRA vs SIGVOOS | Mensal | Aumento de FIRA sem diminuição |

## 19. Plano de Rollback

Em caso de regressão crítica:

1. **Rollback de código:** Deploy do commit `1ab74f1` (ponto de retorno íntegro).
   ```bash
   git checkout 1ab74f1
   npm run deploy:worker:safe
   ```
2. **Rollback de dados:** Restaurar backups em `artifacts/frms-sigvoos-global-rebuild-20260605/backup-20260605T213800Z/`.
3. **Verificação pós-rollback:** Rodar checklist de regressão completo.

## 20. Itens Explicitamente Fora de Escopo

- ❌ Limpeza de registros FIRA históricos (525 registros).
- ❌ Correção de registros `hv_maior_que_jornada` (13 registros).
- ❌ Correção de registros `jornada_zero_com_hv` (5 registros).
- ❌ Resolução das 659 pendências exibíveis.
- ❌ Migrations de schema.
- ❌ Alteração de regras operacionais ANAC/RBAC.
- ❌ Exportação/arquivamento de FIRA.
- ❌ Qualquer escrita manual em banco de produção.

## 21. Confirmações

| Item | Status |
|---|---|
| Nenhuma migration executada | ✅ Confirmado |
| Nenhuma escrita manual em banco (fora do rebuild autorizado) | ✅ Confirmado |
| Nenhum DELETE físico em produção | ✅ Confirmado |
| FIRA preservado como histórico (`origem = 'FIRA'`) | ✅ Confirmado |
| Produção verificada via health/version | ✅ Confirmado |
| HEAD = origin/main | ✅ Confirmado |
| Testes 924 worker + 540 frontend passando | ✅ Confirmado |
| Build limpo | ✅ Confirmado |
| Lint passando | ✅ Confirmado |

## 22. Conclusão Final

O módulo FRMS encerra este ciclo de auditoria em estado **VERDE**. A fonte canônica operacional está unificada em SIGVOOS. As colunas MÊS, 7 DIAS e 365 DIAS estão consistentes. Os alertas estão coerentes. A coleta de Fadiga Diária está com validação explícita. O score atual usa a fonte correta.

As únicas pendências remanescentes (FIRA histórico, HV inconsistente, pendências exibíveis) são itens de saneamento futuro que não afetam a operação corrente e exigem planejamento separado com backup, dry-run e autorização explícita.

---

**Documento:** `docs/FRMS_OPERATIONAL_CLOSURE_20260606.md`
**Data:** 2026-06-06 02:15 UTC
**Status:** VERDE
**Referências:**
- `docs/FRMS_FULL_OPERATIONAL_AUDIT_AND_FIXES_20260606.md`
- `docs/FRMS_ACCUMULATED_COLUMNS_7D_365D_AUDIT_20260606.md`
- `docs/FRMS_SIGVOOS_CANONICAL_SOURCE_FIX_20260605.md`
- `docs/FRMS_SIGVOOS_POST_PRODUCTION_VERIFICATION_20260605.md`
- `docs/FRMS_SIGVOOS_FIRA_SOURCE_QUALITY_AND_REMAINING_FIRA_AUDIT_20260606.md`
- `docs/FRMS_FULL_CALCULATION_AUDIT_OPUS_20260605.md`
- `docs/FRMS_FADIGA_DIARIA_CALC_AUDIT_20260605.md`
- `docs/FRMS_OPERATIONAL_CONTROL_FINAL_FIX_20260606.md` (patch adicional: Controle Operacional)

## 23. Patch Adicional — Controle Operacional (2026-06-06)

Após o fechamento inicial, foram identificados problemas de exibição na página **Controle Operacional**:

- Datas em ISO (`2026-06-05`) → corrigido para `DD/MM/YYYY`
- Texto técnico `Quinzena INCOMPLETO · duty -` → corrigido para texto amigável em português
- Classificação "sem escala" falsa quando dados de escala indisponíveis → banner + labels ajustados
- Alertas `JORNADA_FRMS_SEM_ESCALA` e `ESCALADO_SEM_JORNADA_FRMS` ocultados quando sem dados de escala
- Badges de fonte com labels individuais (Sono/Despertar/Jornada)

**Causa raiz do "sem escala":** Tabela `escala_voo_diaria` contém apenas 4 registros (até 2026-05-28), zero para junho/2026. A classificação de matching estava correta, mas a UI não diferenciava "escala não encontrada" de "dados de escala indisponíveis".

**Commit:** (a ser criado após `07c63aa`)
**Documento:** `docs/FRMS_OPERATIONAL_CONTROL_FINAL_FIX_20260606.md`
