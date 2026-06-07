# Auditoria FRMS SIGVOOS/FIRA - qualidade de origem e FIRA remanescentes

Data da auditoria: 2026-06-06  
Timezone operacional do recorte: America/Sao_Paulo  
Recorte auditado: 2026-01-01 a 2026-06-05  
Ambiente: producao AirTrust / D1 remoto `airtrust-db`

## 1. Contexto

Foi concluido em producao o rebuild operacional FRMS usando SIGVOOS como fonte canonica para jornadas e horas de voo no recorte 2026-01-01 a 2026-06-05. A fase atual foi uma verificacao read-only/manual-guided para explicar os FIRA remanescentes, auditar inconsistencias `HV > jornada` e confirmar se dados nao canonicos ainda contaminam calculos, alertas, rolling, cards ou telas.

Commits informados como base de producao:

- `dd7600c fix(frms): rebuild operational data from sigvoos`
- `bdb0730 fix(frms): clear orphan alerts from sigvoos rebuild`

## 2. Escopo

Escopo coberto:

- Estado local/remoto.
- Versao publicada em `/api/health` e `/api/version`.
- Schema relevante por `sqlite_master` e `PRAGMA table_info`.
- Contagens read-only em `frms_jornada`, `frms_alerta`, `frms_acumulo_rolling`, `frms_fatorizacao_jornada`, `frms_importacao_fira`, `frms_jornada_pendente`, `integracoes_sigvoos_eventos`.
- Classificacao dos 525 FIRA remanescentes.
- Auditoria dos 13 casos `horas_voo_minutos > duracao_jornada_minutos`.
- Auditoria dos 5 casos `duracao_jornada_minutos = 0 AND horas_voo_minutos > 0`.
- Agregacao das 659 linhas nao canonicas.
- Mapeamento de endpoints e frontend FRMS/Fadiga.
- Lacunas de teste e checklist manual.

Fora de escopo:

- Correcao de dados.
- Correcao de codigo.
- Deploy.
- Commit.
- Smoke autenticado automatizado, por ausencia de credenciais.

## 3. Regras de seguranca aplicadas

- Nenhuma migration executada.
- Nenhum `UPDATE`, `INSERT`, `DELETE`, `UPSERT`, `REPLACE`, `TRUNCATE`, `DROP` ou `ALTER` executado.
- Nenhuma escrita em banco local ou remoto.
- Todas as consultas D1 foram `SELECT` ou `PRAGMA`.
- Nenhum deploy.
- Nenhum commit.
- Nenhum push.
- Nenhum `git add`.
- Nenhum script de saneamento executavel criado.
- Nenhuma regra operacional alterada.

Observacao: `wrangler d1 execute --remote` reportou `changed_db: false` e `rows_written: 0` nas consultas executadas.

## 4. Ambiente e versao

### Git local/remoto

Comandos executados:

```bash
git status --short --untracked-files=all
git log --oneline -10
git rev-parse HEAD origin/main
git diff --stat
git diff --name-status
```

Resultado:

- `HEAD == origin/main == ffd3ca99aa57ad9215c60a6e6288395f2f9b5b32`.
- HEAD local/origin esta em commit posterior ao informado como producao: `ffd3ca9 fix(frms): expose technical filter and restore team fatigue data`.
- Producao exposta pelo worker ainda esta em `bdb0730`.
- Ha tracked modified no worktree em 9 arquivos que nao foram alterados por esta auditoria:
  - `src/react-app/hooks/useFadigaCheckin.ts`
  - `src/react-app/hooks/useFrmsOperationalSnapshot.ts`
  - `src/react-app/pages/frms/FrmsControleOperacional.tsx`
  - `src/react-app/pages/frms/__tests__/FrmsCheckinFadiga.test.tsx`
  - `src/react-app/pages/frms/__tests__/FrmsControleOperacional.test.tsx`
  - `worker-airtrust/src/__tests__/routes/frms-operational-snapshot.test.ts`
  - `worker-airtrust/src/lib/frms/db-service-acumulo.ts`
  - `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
  - `worker-airtrust/src/routes/frms-operational-snapshot.ts`

Essa divergencia de worktree foi tratada como alteracao pre-existente/do usuario. Nenhum desses arquivos foi modificado por esta auditoria.

### Producao

`GET https://api.airtrust.online/api/health`

- HTTP: 200
- `success`: true
- `status`: healthy
- `environment`: production
- `version`: `2026-06-06T00:43:55Z-bdb0730`
- `timestamp`: `2026-06-06T01:15:12.678Z`
- checks: database ok, storage ok

`GET https://api.airtrust.online/api/version`

- HTTP: 200
- `version`: `2026-06-06T00:43:55Z-bdb0730`
- `builtAt`: `2026-06-06T00:43:55Z`
- `deploymentId`: `2026-06-06T00:43:55Z-bdb0730`
- `environment`: production

Conclusao de versao:

- Worker de producao esta coerente com `bdb0730`, que foi informado como versao publicada.
- Local/origin esta um commit adiante (`ffd3ca9`). Se `ffd3ca9` deveria estar em producao, ha defasagem de deploy; se `bdb0730` era a versao esperada do worker, a versao de producao esta coerente com o contexto inicial.

## 5. Politica de fonte observada no codigo

Arquivo relevante: `worker-airtrust/src/lib/frms/frms-source-policy.ts`

- Fonte canonica operacional: `SIGVOOS`.
- `shouldUseForOperationalFrms(row)` retorna true apenas para `origem='SIGVOOS'`.
- FIRA recebe status `FIRA_NAO_OPERACIONAL` ou `PENDENTE_SIGVOOS`.
- FIRA/MANUAL/APUS/SIMULADOR retornam:
  - `usado_no_frms_operacional: false`
  - `usado_em_alertas: false`
  - `usado_em_rolling: false`

Arquivo relevante: `worker-airtrust/src/lib/frms/db-service-jornadas.ts`

- `recalcularPipeline` retorna fatorizacao/acumulo/alertas vazios para fonte nao SIGVOOS.
- `buscarJornadas` anexa fatorizacao somente se a jornada for operacional.
- Para fonte nao canonica, percentuais diarios/mensais sao nulos e a linha recebe integridade `FONTE_NAO_CANONICA`.

## 6. Schema/tabelas relevantes

Principais tabelas mapeadas:

- `frms_jornada`: jornadas, fonte (`origem`), tempos, HV, soft-delete.
- `frms_alerta`: alertas por jornada.
- `frms_acumulo_rolling`: rolling operacional.
- `frms_fatorizacao_jornada`: fatorizacao por jornada.
- `frms_importacao_fira`: lotes/importacoes FIRA.
- `frms_jornada_pendente`: pendencias de importacao/matching.
- `integracoes_sigvoos_eventos`: eventos de integracao SIGVOOS.
- `integracoes_sigvoos_config`, `integracoes_sigvoos_mapeamentos`, `sigvoos_mapeamento_manual`.
- `funcionarios`: tripulantes.
- `escala_*`, `escalas_*`: tabelas de escala.

Colunas relevantes de `frms_jornada`:

- `id`, `tripulante_id`, `data`, `status`
- `hora_apresentacao`, `hora_termino`
- `duracao_jornada_minutos`, `horas_voo_minutos`
- `hora_primeira_decolagem`, `hora_ultimo_pouso`
- `origem`, `fonte_resolucao_sigvoos`, `fonte_resolucao`
- `created_at`, `updated_at`, `deleted_at`
- `empresa_id`, `matricula_aeronave`

Nao ha coluna persistida de `operacional/canonico`; a decisao operacional e derivada da fonte no codigo.

## 7. Consultas read-only executadas

Consultas executadas somente com `SELECT`/`PRAGMA`, incluindo:

```sql
SELECT name,type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name;
PRAGMA table_info(frms_jornada);
PRAGMA table_info(frms_alerta);
PRAGMA table_info(frms_acumulo_rolling);
PRAGMA table_info(frms_fatorizacao_jornada);
PRAGMA table_info(frms_importacao_fira);
PRAGMA table_info(frms_jornada_pendente);
```

```sql
SELECT origem, COUNT(*) AS total,
       SUM(CASE WHEN UPPER(COALESCE(origem,''))='SIGVOOS' THEN 1 ELSE 0 END) AS operacional_pela_politica,
       SUM(CASE WHEN UPPER(COALESCE(origem,''))<>'SIGVOOS' OR origem IS NULL THEN 1 ELSE 0 END) AS nao_operacional_pela_politica
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
GROUP BY origem;
```

```sql
SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND COALESCE(horas_voo_minutos,0) > COALESCE(duracao_jornada_minutos,0);
```

```sql
SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND COALESCE(duracao_jornada_minutos,0)=0
  AND COALESCE(horas_voo_minutos,0)>0;
```

```sql
SELECT COUNT(*)
FROM frms_alerta a
JOIN frms_jornada j ON j.id=a.jornada_id
WHERE a.deleted_at IS NULL
  AND a.resolvido=0
  AND j.deleted_at IS NULL
  AND j.data BETWEEN '2026-01-01' AND '2026-06-05'
  AND UPPER(COALESCE(j.origem,''))<>'SIGVOOS';
```

```sql
SELECT COUNT(*)
FROM frms_acumulo_rolling ar
LEFT JOIN frms_jornada j
  ON j.tripulante_id=ar.tripulante_id
 AND j.data=ar.data_referencia
 AND j.deleted_at IS NULL
 AND UPPER(COALESCE(j.origem,''))='SIGVOOS'
WHERE ar.deleted_at IS NULL
  AND ar.data_referencia BETWEEN '2026-01-01' AND '2026-06-05'
  AND j.id IS NULL;
```

Tambem foram executadas consultas de classificacao FIRA/SIGVOOS por match exato, D-1, D+1; agregacoes por fonte/mes/tripulante; casos Dieter 2026-06-01 a 2026-06-05; e comparativos de totais all vs SIGVOOS-only para endpoints de acumulado.

## 8. Resultados gerais de D1

### Jornadas por fonte

| Fonte | Total | Operacional pela politica | Nao operacional pela politica | SIGVOOS validos |
| --- | ---: | ---: | ---: | ---: |
| FIRA | 525 | 0 | 525 | 0 |
| MANUAL | 134 | 0 | 134 | 0 |
| SIGVOOS | 261 | 261 | 0 | 261 |

### Derivados persistidos

| Checagem | Resultado |
| --- | ---: |
| FIRA com fatorizacao ativa | 0 |
| Alertas ativos ligados a jornada nao-SIGVOOS | 0 |
| Alertas orfaos ativos | 0 |
| Rolling/acumulo sem SIGVOOS | 0 |
| FIRA com alerta ativo | 0 |
| FIRA com rolling no mesmo dia | 0 |
| FIRA com fatorizacao | 0 |
| MANUAL com alerta ativo | 0 |
| MANUAL com rolling no mesmo dia | 0 |
| MANUAL com fatorizacao | 0 |

### Inconsistencias

| Checagem | Resultado |
| --- | ---: |
| `horas_voo_minutos > duracao_jornada_minutos` | 13 |
| `duracao_jornada_minutos = 0 AND horas_voo_minutos > 0` | 5 |
| Linhas nao canonicas/pendencias exibiveis | 659 |
| Duplicados por tripulante/data/origem | 0 grupos |

## 9. Por que ainda ha tantos FIRA

Os 525 FIRA permanecem porque o rebuild operacional nao tinha como objetivo apagar historico/auditoria FIRA. A regra atual isola FIRA como fonte nao canonica e usa SIGVOOS como unica fonte operacional.

A auditoria nao encontrou FIRA com SIGVOOS exato valido que tenha ficado operacional ou principal por falha de rebuild. A maioria dos FIRA nao tem SIGVOOS correspondente exato no recorte.

Resultado objetivo:

- 525 FIRA permanecem.
- 0 FIRA operacional pela politica.
- 0 FIRA com fatorizacao ativa.
- 0 FIRA alimentando rolling persistido.
- 0 FIRA alimentando alerta ativo.
- 0 FIRA com SIGVOOS exato valido correspondente.
- 0 FIRA com SIGVOOS exato invalido correspondente em `frms_jornada`.
- 506 FIRA sem nenhum SIGVOOS D-1/D/D+1 para o mesmo tripulante.
- 19 FIRA com candidato SIGVOOS em D-1/D+1 para o mesmo tripulante.

Portanto, os FIRA remanescentes sao esperados como historico/pendencia/auditoria no modelo de dados, mas ha risco real de UI/API porque algumas rotas ainda somam `frms_jornada` diretamente sem filtrar fonte.

## 10. Classificacao dos 525 FIRA remanescentes

Classificacao por match:

| Classificacao | Total |
| --- | ---: |
| `SEM_MATCH_SIGVOOS` | 506 |
| `MATCH_DATA_PROXIMA_DIA_MAIS_1` | 8 |
| `MATCH_DATA_PROXIMA_AMBOS` | 7 |
| `MATCH_DATA_PROXIMA_DIA_MENOS_1` | 4 |
| `MATCH_EXATO_SIGVOOS_VALIDO` | 0 |
| `MATCH_EXATO_SIGVOOS_INVALIDO` | 0 |

Classificacao operacional:

| Categoria solicitada | Total | Observacao |
| --- | ---: | --- |
| `FIRA_HISTORICO_SUBSTITUIDO_POR_SIGVOOS` | 0 | Nao houve match exato valido no recorte. |
| `FIRA_SEM_SIGVOOS_CORRESPONDENTE` | 506 | Historico/pendencia; sem candidato D-1/D/D+1. |
| `FIRA_COM_SIGVOOS_INVALIDO` | 0 | Nenhum SIGVOOS exato invalido persistido em `frms_jornada`. |
| `FIRA_COM_MATCH_AMBIGUO` | 7 | Ha SIGVOOS D-1 e D+1; precisa decisao manual/timezone. |
| `FIRA_POSSIVEL_TIMEZONE_DATA_OPERACIONAL` | 12 | Match somente D-1 ou somente D+1. |
| `FIRA_DUPLICADO` | 0 | Sem duplicidade FIRA por tripulante/data/origem. |
| `BUG_REBUILD_NAO_PRIORIZOU_SIGVOOS_VALIDO` | 0 | Nenhum FIRA com SIGVOOS exato valido ficou operacional. |
| `FIRA_IMPACTO_OPERACIONAL_RESIDUAL` | 0 em derivados persistidos; >0 em API/UI direta | Ver secao de impacto UI/API. |

Decisao sobre os 525 FIRA:

- Preservar como historico/pendencia/auditoria neste momento.
- Nao reclassificar como operacional.
- Nao apagar sem plano de saneamento com backup e dry-run.
- Investigar manualmente os 19 casos D-1/D+1 antes de qualquer unificacao por data operacional.

## 11. Agregacao das 659 linhas nao canonicas

As 659 linhas nao canonicas sao:

- 525 FIRA.
- 134 MANUAL.

Agregacao por mes/fonte:

| Mes | Fonte | Total | Com HV | Com jornada | HV > jornada | Jornada 0 com HV |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 2026-01 | FIRA | 175 | 149 | 144 | 5 | 5 |
| 2026-02 | FIRA | 201 | 111 | 111 | 0 | 0 |
| 2026-03 | FIRA | 109 | 80 | 80 | 3 | 0 |
| 2026-04 | FIRA | 36 | 24 | 24 | 1 | 0 |
| 2026-05 | FIRA | 2 | 2 | 2 | 2 | 0 |
| 2026-05 | MANUAL | 134 | 0 | 0 | 0 | 0 |
| 2026-06 | FIRA | 2 | 2 | 2 | 2 | 0 |

Agregacao de impacto potencial em endpoints que somam todas as jornadas:

| Mes | Tripulantes com nao-SIGVOOS | Tripulantes com HV nao-SIGVOOS | Linhas nao-SIGVOOS | HV nao-SIGVOOS total | Jornada nao-SIGVOOS total |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-01 | 19 | 19 | 175 | 37232 | 57556 |
| 2026-02 | 19 | 14 | 201 | 30720 | 49707 |
| 2026-03 | 8 | 7 | 109 | 22862 | 37020 |
| 2026-04 | 8 | 7 | 36 | 5884 | 9648 |
| 2026-05 | 14 | 2 | 136 | 714 | 560 |
| 2026-06 | 2 | 2 | 2 | 3074 | 1190 |

Decisao sobre as 659 linhas:

- Em derivados persistidos, permanecem isoladas.
- Como historico/pendencia/auditoria, podem permanecer.
- Como entrada de rotas diretas de acumulado, nao podem ser somadas; isso requer patch de API antes de status verde.

## 12. Caso Dieter 2026-06-01 a 2026-06-05

| Data | Fonte | Jornada min | HV min | Operacional pela politica |
| --- | --- | ---: | ---: | ---: |
| 2026-06-01 | FIRA | 595 | 1537 | 0 |
| 2026-06-02 | SIGVOOS | 375 | 189 | 1 |
| 2026-06-03 | SIGVOOS | 451 | 282 | 1 |
| 2026-06-04 | SIGVOOS | 462 | 190 | 1 |
| 2026-06-05 | SIGVOOS | 316 | 203 | 1 |

Decisao sobre Dieter 2026-06-01:

- Nao promover para operacional.
- Manter como FIRA nao operacional/pendencia/inconsistencia.
- O valor `1537 min HV > 595 min jornada` e invalido para calculo operacional.
- O dia 2026-06-01 deve ser saneado na origem SIGVOOS/FIRA em fase futura, com backup e dry-run.
- Ate o patch de API, essa linha pode contaminar a tela/rota de fadiga acumulada.

Comparativo Dieter junho, all vs SIGVOOS-only:

| Tripulante | Jornada all | HV all | % HV mes all | Jornada SIGVOOS | HV SIGVOOS | % HV mes SIGVOOS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dieter | 2199 min | 2401 min | 44.463% | 1604 min | 864 min | 16.000% |

Paloma 2026-06-01:

| Tripulante | Jornada all | HV all | % HV mes all | Jornada SIGVOOS | HV SIGVOOS | % HV mes SIGVOOS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Paloma | 595 min | 1537 min | 28.463% | 0 | 0 | 0% |

## 13. Tabela dos 13 casos `HV > jornada`

Todos os 13 casos sao FIRA, sem rolling no mesmo dia, sem alerta ativo e sem SIGVOOS exato.

| Data | Tripulante | Fonte | Jornada | HV | Diff | HV/Jornada | Grupo | Causa provavel | Impacto derivado |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 2026-01-03 | Fernando La Rocque De Freitas Filho | FIRA | 0 | 200 | 03:20 | n/a | Jornada zero | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-01-03 | Karl Martin Kuhr | FIRA | 0 | 200 | 03:20 | n/a | Jornada zero | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-01-30 | Max Monteiro Magioli | FIRA | 0 | 110 | 01:50 | n/a | Jornada zero | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-01-30 | Rafael Siegmann Paradeda | FIRA | 0 | 335 | 05:35 | n/a | Jornada zero | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-01-30 | Vitor De Almeida Costa | FIRA | 0 | 225 | 03:45 | n/a | Jornada zero | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-03-01 | Vitor De Almeida Costa | FIRA | 90 | 120 | 00:30 | 133.33% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-03-26 | Wilson Maciel Martins Nery | FIRA | 69 | 70 | 00:01 | 101.45% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-03-30 | Wilson Maciel Martins Nery | FIRA | 140 | 170 | 00:30 | 121.43% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-04-19 | Jheter Pontes E Silva Junior | FIRA | 30 | 40 | 00:10 | 133.33% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-05-15 | Dieter Johny Kuhr | FIRA | 280 | 357 | 01:17 | 127.50% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-05-15 | Fernando La Rocque De Freitas Filho | FIRA | 280 | 357 | 01:17 | 127.50% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` | Sem alerta/rolling/fatorizacao |
| 2026-06-01 | Dieter Johny Kuhr | FIRA | 595 | 1537 | 15:42 | 258.32% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` / origem invalida | Sem alerta/rolling/fatorizacao; contamina API de acumulado |
| 2026-06-01 | Paloma Goncalves Magioli | FIRA | 595 | 1537 | 15:42 | 258.32% | Jornada positiva | `FIRA_HISTORICO_INVALIDO` / origem invalida | Sem alerta/rolling/fatorizacao; contamina API de acumulado |

## 14. Subanalise dos 5 casos jornada zero com HV

Padrao observado:

- Todos sao FIRA.
- Todos tem `duracao_jornada_minutos = 0`.
- Todos tem `horas_voo_minutos > 0`.
- Nenhum tem SIGVOOS exato.
- Nenhum tem alerta ativo.
- Nenhum tem rolling no mesmo dia.
- Nenhum tem fatorizacao ativa.

Classificacao: `FIRA_HISTORICO_INVALIDO`.

Hipoteses causais:

- Parsing incompleto de apresentacao/termino.
- FIRA historico com voo sem jornada.
- Dado de origem incompleto ou com data operacional divergente.

Impacto:

- Derivados persistidos: sem impacto.
- UI/API direta de acumulado: pode impactar se o endpoint somar todas as jornadas do mes sem fonte.

## 15. Subanalise dos 8 casos jornada positiva com HV maior que jornada

Padrao observado:

- Todos sao FIRA.
- Nenhum tem SIGVOOS exato.
- Nenhum tem alerta ativo.
- Nenhum tem rolling no mesmo dia.
- Nenhum tem fatorizacao ativa.

Classificacao predominante: `FIRA_HISTORICO_INVALIDO`.

Hipoteses causais:

- Pequenos deltas de 1, 10 ou 30 minutos: duracao de jornada subestimada ou HV arredondada de origem.
- Casos 2026-05-15 e 2026-06-01: valores repetidos entre tripulantes e HV muito acima da jornada, sugerindo erro de fonte/importacao/agregacao.
- Caso Dieter 2026-06-01: conhecido como invalido para operacional.

Impacto:

- Derivados persistidos: sem impacto.
- API/UI de acumulado: impacto residual real enquanto as rotas somarem `frms_jornada` sem filtro SIGVOOS.

## 16. Impacto operacional

Classificacao por superficie:

| Superficie | Status | Evidencia |
| --- | --- | --- |
| Rebuild operacional persistido | OK | 261 SIGVOOS operacionais, 0 FIRA/MANUAL operacionais pela politica. |
| Fatorizacao | OK | 0 FIRA/MANUAL com fatorizacao ativa. |
| Alertas ativos | OK | 0 alertas ativos ligados a jornada nao-SIGVOOS; 0 orfaos ativos. |
| Rolling persistido | OK | 0 rolling sem SIGVOOS; 0 FIRA/MANUAL com rolling no mesmo dia. |
| `/api/frms/jornadas/:tripulante_id` | OK | Usa `buscarJornadas`; expõe flags `source_status`, `usado_no_frms_operacional`, percentuais nulos para nao canonico. |
| `/api/frms/heatmap` | OK provavel | Baseia-se em `frms_acumulo_rolling`; FIRA sem rolling nao entra. |
| `/api/frms/alertas` | OK | Filtra `j.origem = SIGVOOS`. |
| `/api/frms/fadiga-acumulada` | FALHA | Busca todas as jornadas do mes sem `origem='SIGVOOS'`. |
| `/api/frms/fadiga-acumulada/frota` | FALHA | Soma todas as jornadas do mes sem `origem='SIGVOOS'`. |
| `/api/frms/acumulo/:tripulante_id` | FALHA parcial | Rolling limpo, mas mensal usa todas as jornadas sem fonte. |
| `/api/frms/acumulo-frota?mes=...` | FALHA parcial | No modo mensal/quinzena, `hv_mes_min` soma jornadas sem fonte. |

Classificacao final de impacto: `IMPACTO_RESIDUAL_CARD` / `IMPACTO_RESIDUAL_VISUAL`, com potencial de calculo mensal/diario incorreto em telas que usam as rotas acima.

Pela matriz de status solicitada, isso rebaixa o resultado para `VERMELHO`, porque FIRA remanescente ainda pode alimentar cards/percentuais de UI/API apesar de nao alimentar alertas/rolling persistidos.

## 17. Impacto visual/UI

Telas/fluxos relevantes:

### Ficha do Tripulante / Jornadas Mensais

Frontend:

- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/pages/frms/frmsJornadasMensaisPresentation.ts`
- `src/react-app/hooks/useFrms.ts`

Endpoints:

- `/api/frms/jornadas/:tripulante_id`
- `/api/frms/acumulo/:tripulante_id`
- `/api/frms/alertas`

Resultado:

- Tabela mensal de jornadas esta coerente para fonte, pois usa `/api/frms/jornadas/:tripulante_id`.
- Percentuais diarios da tabela mensal usam campos explicitos `pct_jornada_diaria` e `pct_voo_diaria`.
- Linhas FIRA recebem status de pendencia/nao operacional e percentuais nulos.
- Cards de acumulado mensal podem ficar incoerentes se usarem `acumulo.mensal`, pois `/api/frms/acumulo/:tripulante_id` soma todas as jornadas no mensal.
- Cards de `% HV Mes` baseados em `rolling` estao limpos.

### Fadiga Acumulada Legal

Frontend:

- `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx`

Endpoints:

- `/api/frms/fadiga-acumulada/frota?mes=YYYY-MM`
- `/api/frms/fadiga-acumulada?mes=YYYY-MM&tripulante_id=...`

Resultado:

- Tela consome endpoints que somam todas as jornadas sem filtrar fonte.
- `FAT.HV% dia` usa divisor diario de 8h nos campos explicitos quando recebidos.
- `Uso mes HV` usa divisor mensal de 90h.
- O problema nao e denominador; e universo de dados, pois FIRA/MANUAL entram no calculo.

### Monitor/Dashboard FRMS

Frontend:

- `src/react-app/pages/frms/FrmsDashboard.tsx`
- `src/react-app/pages/frms/components/FrmsTripulantesTable.tsx`

Endpoints:

- `/api/frms/acumulo-frota`
- `/api/frms/heatmap`
- `/api/frms/alertas`
- `/api/frms/tripulante/:id/jornadas`

Resultado:

- Heatmap e alertas estao ancorados em rolling/alertas limpos.
- `acumulo-frota` em modo mensal/quinzena usa soma direta de jornadas para `hv_mes_min`, sem filtro de fonte. Isso pode contaminar cards/tabela da frota.

## 18. Endpoints e campos principais

| Endpoint | Parametros | Campos principais | Escopo | Fonte/legacy |
| --- | --- | --- | --- | --- |
| `/api/frms/jornadas/:tripulante_id` | `mes`, `data_inicio`, `data_fim`, `page`, `pageSize` | `origem`, `fonte_original`, `source_status`, `usado_no_frms_operacional`, `pct_voo_diaria`, `pct_voo_mes`, `pct_jornada_diaria`, `pct_jornada_mes` | Diario e mensal por linha | Coerente; campos novos explicitos; legacy mitigado. |
| `/api/frms/acumulo/:tripulante_id` | `mes` | `rolling`, `mensal`, `limites`, `effectiveness` | Rolling e mensal | Rolling limpo; mensal legacy recalculado sem fonte. |
| `/api/frms/acumulo-frota` | `mes`, `periodo`, `quinzena` | `hv_mes_min`, `pct_mes`, `hv_7d_min`, `pct_7d`, `hv_dia_min`, `pct_dia` | Frota mensal/rolling | Modo mensal soma jornadas sem fonte; rolling usa tabela limpa. |
| `/api/frms/fadiga-acumulada` | `mes`, `tripulante_id` | `evolucao`, `resumo`, `pct_voo_diaria`, `pct_voo_mes`, integridade | Diario e mensal | Campos explicitos, mas sem filtro de fonte. |
| `/api/frms/fadiga-acumulada/frota` | `mes` | `frota`, `resumo`, `pct_jornada`, `pct_voo`, `dias_jornada` | Frota mensal | Soma jornadas sem fonte. |
| `/api/frms/heatmap` | `mes` ou `periodo` | `pct`, `pct7d`, `pct28d`, `hvDia`, `effectiveness` | Diario/rolling | Base rolling; sem impacto FIRA observado. |
| `/api/frms/alertas` | `tripulante_id`, `nivel`, `resolvido`, `data_inicio`, `data_fim` | alertas ativos/historico | Alertas | Filtra SIGVOOS. |
| `/api/frms/tripulante/:id/jornadas` | `dias` ou `inicio`/`fim` | fatorizacao/effectiveness | Timeline | Depende de fatorizacao; FIRA sem fatorizacao nao entra. |

## 19. Lacunas de teste

Coberturas existentes relevantes:

- `worker-airtrust/src/__tests__/frms/frms-source-policy.test.ts`
- `worker-airtrust/src/__tests__/frms/frms-source-policy-rolling.test.ts`
- `worker-airtrust/src/__tests__/routes/frms-jornadas-contract.test.ts`
- `worker-airtrust/src/__tests__/frms/fadiga-acumulada-legal.test.ts`
- `worker-airtrust/src/__tests__/routes/frms-fadiga-acumulada-contract.test.ts`
- `src/react-app/pages/frms/__tests__/frmsJornadasMensaisPresentation.test.ts`

Coberto:

- SIGVOOS como fonte canonica.
- FIRA fora de rolling/alertas.
- `pct_voo_diaria` vs `pct_voo_mes`.
- Tabela mensal nao faz fallback silencioso para percentual mensal.
- Jornada zero com HV gera integridade.

Lacunas:

- `/api/frms/fadiga-acumulada` deve excluir FIRA/MANUAL do calculo operacional.
- `/api/frms/fadiga-acumulada/frota` deve excluir FIRA/MANUAL.
- `/api/frms/acumulo/:tripulante_id` deve excluir FIRA/MANUAL de `mensal`.
- `/api/frms/acumulo-frota?mes=...` deve excluir FIRA/MANUAL em `hv_mes_min`.
- Teste de Dieter 2026-06-01 FIRA 1537 min nao contaminando Fadiga Acumulada.
- Teste de cards de Ficha/Dashboard contra fonte nao canonica.

## 20. Plano futuro de saneamento, sem executar

Patch recomendado antes de saneamento de dados:

1. Alterar rotas/servicos de acumulado para aplicar fonte canonica:
   - `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`
   - `worker-airtrust/src/lib/frms/db-service-acumulo.ts`
2. Incluir `AND UPPER(COALESCE(j.origem,''))='SIGVOOS'` ou usar helper centralizado de policy nas consultas.
3. Quando precisar preservar exibicao de pendencia, retornar linhas nao canonicas separadas em bloco de auditoria, sem entrar em calculos.
4. Adicionar testes de contrato para Dieter 2026-06-01 e frota mensal.

Saneamento de origem, apenas propositivo:

1. Backup read-only/export das linhas FIRA problemáticas e candidatos SIGVOOS D-1/D+1.
2. Dry-run de classificacao:
   - sem match,
   - match D-1,
   - match D+1,
   - match ambiguo,
   - invalidos `HV > jornada`,
   - jornada zero com HV.
3. Validar manualmente 19 casos D-1/D+1.
4. Validar Dieter/Paloma 2026-06-01 na origem SIGVOOS/FIRA.
5. Decidir representacao de historico:
   - manter FIRA como auditoria,
   - marcar invalidade,
   - nunca promover sem SIGVOOS valido.
6. Recalcular derivados somente depois de patch e com autorizacao explicita.
7. Validar pos-saneamento com as mesmas queries deste relatorio.

Nenhum script destrutivo foi criado ou executado nesta fase.

## 21. Checklist manual de producao

Executar com usuario autorizado e registrar prints:

1. Abrir `https://airtrust.online`.
2. Fazer login com usuario autorizado.
3. Acessar FRMS.
4. Abrir Monitor de Fadiga.
5. Selecionar junho/2026.
6. Abrir Fadiga Diaria/Jornadas Mensais.
7. Abrir ficha do Dieter.
8. Conferir Dieter de 2026-06-01 a 2026-06-05.
9. Confirmar que 2026-06-02 a 2026-06-05 aparecem como SIGVOOS.
10. Confirmar que 2026-06-01 aparece como FIRA nao operacional/pendencia/inconsistencia, se exibido.
11. Confirmar que FIRA remanescente nao aparece como dado principal quando ha SIGVOOS valido.
12. Confirmar que `FAT.HV% dia` nao usa divisor mensal de 90h.
13. Confirmar que `Uso mes HV` usa divisor mensal de 90h.
14. Confirmar que FIRA nao operacional nao gera alerta operacional ativo.
15. Confirmar ausencia de alerta orfao antigo.
16. Confirmar que pendencia nao parece jornada operacional normal.
17. Abrir Fadiga Acumulada Legal em junho/2026.
18. Verificar se Dieter aparece com `HV all` contaminada por 1537 min em 2026-06-01; se sim, anexar print como evidencia do bug UI/API.
19. Abrir Dashboard/Monitor em modo mensal junho/2026.
20. Verificar se `hv_mes_min`/cards de frota incluem FIRA nao SIGVOOS.
21. Prints obrigatorios:
    - lista mensal de Dieter,
    - detalhe do dia 2026-06-01,
    - cards superiores da ficha,
    - Fadiga Acumulada Legal expandida,
    - Monitor/Dashboard mensal,
    - alertas do periodo,
    - ausencia de alerta indevido.
22. Registrar data/hora, usuario e navegador.

## 22. Riscos remanescentes

- Risco alto de incoerencia visual/API em acumulados mensais e Fadiga Acumulada Legal ate patch.
- Risco de usuario interpretar FIRA historico como dado operacional em telas que nao exibem `source_status`.
- Risco de `hv_mes_min` de frota mensal inflado por FIRA antigo.
- Risco especifico Dieter/Paloma 2026-06-01 por `1537 min` de HV FIRA.
- Risco de defasagem de versao se `ffd3ca9` deveria estar publicado.
- Smoke autenticado automatizado segue pendente por ausencia de credenciais.
- Worktree local tem tracked modified pre-existentes; qualquer patch futuro deve isolar essas alteracoes antes de aplicar correcao.

## 23. Status final

Status: `VERMELHO`.

Motivo:

- Dados persistidos de rolling/alertas/fatorizacao estao limpos.
- Porem, endpoints/telas de acumulado ainda podem calcular cards e percentuais diretamente sobre `frms_jornada` sem filtrar `SIGVOOS`.
- Isso permite que FIRA remanescente, inclusive Dieter/Paloma 2026-06-01 com `1537 min` de HV, contamine UI/API de Fadiga Acumulada e acumulado mensal.
- Pelos criterios da tarefa, qualquer FIRA remanescente alimentando cards/calculos operacionais de UI/API implica `VERMELHO`.

## 24. Confirmacoes finais

- Nao houve escrita em banco.
- Nao houve migration.
- Nao houve deploy.
- Nao houve commit.
- Nao houve push.
- Nao houve `git add`.
- Nao houve patch de codigo.
- Este documento foi criado como artefato de auditoria.
