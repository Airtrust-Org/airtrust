# FRMS SIGVOOS Post-Production Verification — 2026-06-05

## Escopo

Verificacao pos-producao, somente leitura, da correcao FRMS que promoveu SIGVOOS como fonte canonica operacional no recorte `2026-01-01` a `2026-06-05` (`America/Sao_Paulo`).

Guardrails respeitados nesta verificacao:

- nenhuma migration executada;
- nenhuma escrita em banco;
- nenhum `UPDATE`, `INSERT` ou `DELETE`;
- nenhum deploy;
- nenhum commit;
- nenhum `git add`;
- consultas D1 apenas `SELECT`.

## Status consolidado

**Status recomendado:** `VERDE COM RESSALVA`

Conclusao:

- a producao publicada esta coerente com os commits `dd7600c` e `bdb0730`;
- a API publicada responde com a versao esperada;
- as derivacoes operacionais do FRMS estao ancoradas em SIGVOOS no recorte auditado;
- nao ha alertas operacionais ativos ligados a jornadas nao-SIGVOOS;
- nao ha rolling operacional sem base SIGVOOS;
- permanecem pendencias reais de origem em linhas nao canonicas/historicas, exibiveis apenas como auditoria/pendencia.

## 1. Estado local/remoto

Comandos executados:

```bash
git status --short --untracked-files=all
git log --oneline -8
git rev-parse HEAD origin/main
```

Resultado observado antes desta documentacao:

- `HEAD == origin/main == bdb0730bdc74c3ae76e1330f32c51172a2a1ea5a`
- commit publicado mais recente em `main`: `bdb0730 fix(frms): clear orphan alerts from sigvoos rebuild`
- commit imediatamente anterior: `dd7600c fix(frms): rebuild operational data from sigvoos`

Observacoes de worktree:

- no encerramento desta verificacao, o `git status --short --untracked-files=all` mostra apenas artefatos/docs nao rastreados, incluindo este documento
- havia diversos artefatos/docs nao rastreados de trabalhos anteriores
- esta verificacao adiciona apenas este documento como alteracao intencional local

## 2. Versao em producao

Consultas executadas:

```bash
curl -sS -D - https://api.airtrust.online/api/health
curl -sS -D - https://api.airtrust.online/api/version
```

Resultado:

### `/api/health`

- HTTP: `200`
- `status`: `healthy`
- `environment`: `production`
- `version` / `APP_VERSION`: `2026-06-06T00:43:55Z-bdb0730`
- timestamp de health payload: `2026-06-06T00:48:20.648Z`

### `/api/version`

- HTTP: `200`
- `version`: `2026-06-06T00:43:55Z-bdb0730`
- `builtAt`: `2026-06-06T00:43:55Z`
- `deploymentId`: `2026-06-06T00:43:55Z-bdb0730`
- hash exposto: `bdb0730` (hash curto; nao expõe SHA completo)

Leitura: a versao publicada bate com o worker informado para producao.

## 3. D1 read-only pos-producao

Banco consultado: `airtrust-db --remote`

### Queries executadas

```sql
SELECT origem, COUNT(*) AS total
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
GROUP BY origem
ORDER BY origem;
```

```sql
SELECT COUNT(*) AS sigvoos_operacionais
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND origem = 'SIGVOOS';
```

```sql
SELECT COUNT(*) AS nao_operacionais_fira_manual
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND origem IN ('FIRA', 'MANUAL');
```

```sql
SELECT COUNT(*) AS alertas_jornada_nao_sigvoos
FROM frms_alerta a
JOIN frms_jornada j
  ON j.id = a.jornada_id
 AND j.deleted_at IS NULL
WHERE a.deleted_at IS NULL
  AND a.resolvido = 0
  AND a.jornada_id IS NOT NULL
  AND j.data BETWEEN '2026-01-01' AND '2026-06-05'
  AND COALESCE(j.origem, '') <> 'SIGVOOS';
```

```sql
SELECT COUNT(*) AS alertas_orfaos_ativos_operacionais
FROM frms_alerta
WHERE deleted_at IS NULL
  AND resolvido = 0
  AND jornada_id IS NULL
  AND date(created_at) BETWEEN '2026-01-01' AND '2026-06-05'
  AND mensagem NOT LIKE '[FADIGA_DIARIA]%';
```

```sql
SELECT COUNT(*) AS rolling_sem_sigvoos
FROM frms_acumulo_rolling ar
LEFT JOIN frms_jornada j
  ON j.tripulante_id = ar.tripulante_id
 AND j.data = ar.data_referencia
 AND j.deleted_at IS NULL
WHERE ar.deleted_at IS NULL
  AND ar.data_referencia BETWEEN '2026-01-01' AND '2026-06-05'
  AND (j.id IS NULL OR COALESCE(j.origem, '') <> 'SIGVOOS');
```

```sql
SELECT COUNT(*) AS hv_maior_que_jornada
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND COALESCE(horas_voo_minutos, 0) > COALESCE(duracao_jornada_minutos, 0);
```

```sql
SELECT COUNT(*) AS jornada_zero_com_hv
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND COALESCE(duracao_jornada_minutos, 0) = 0
  AND COALESCE(horas_voo_minutos, 0) > 0;
```

```sql
SELECT COUNT(*) AS pendencias_exibiveis
FROM frms_jornada
WHERE deleted_at IS NULL
  AND data BETWEEN '2026-01-01' AND '2026-06-05'
  AND origem IN ('FIRA', 'MANUAL');
```

```sql
SELECT
  tripulante_id,
  data,
  origem,
  status,
  duracao_jornada_minutos,
  horas_voo_minutos,
  fonte_resolucao_sigvoos,
  fonte_resolucao
FROM frms_jornada
WHERE deleted_at IS NULL
  AND tripulante_id = 7
  AND data BETWEEN '2026-06-01' AND '2026-06-05'
ORDER BY data;
```

### Resultados

| Verificacao | Resultado |
| --- | ---: |
| Jornadas por fonte no recorte | `FIRA 525`, `MANUAL 134`, `SIGVOOS 261` |
| Jornadas SIGVOOS operacionais | `261` |
| Jornadas FIRA/MANUAL nao operacionais | `659` |
| Alertas ativos ligados a jornada nao-SIGVOOS | `0` |
| Alertas orfaos ativos operacionais no recorte | `0` |
| Rolling/acumulo sem base SIGVOOS | `0` |
| Casos `horas_voo_minutos > duracao_jornada_minutos` | `13` |
| Casos `duracao_jornada_minutos = 0 AND horas_voo_minutos > 0` | `5` |
| Casos nao operacionais exibiveis como pendencia | `659` |

### Caso Dieter (`tripulante_id = 7`)

| Data | Origem | Status | Jornada | HV | Leitura |
| --- | --- | --- | ---: | ---: | --- |
| `2026-06-01` | `FIRA` | `ES` | `595` | `1537` | inconsistente, nao operacional |
| `2026-06-02` | `SIGVOOS` | `ES` | `375` | `189` | operacional SIGVOOS |
| `2026-06-03` | `SIGVOOS` | `ES` | `451` | `282` | operacional SIGVOOS |
| `2026-06-04` | `SIGVOOS` | `ES` | `462` | `190` | operacional SIGVOOS |
| `2026-06-05` | `SIGVOOS` | `ES` | `316` | `203` | operacional SIGVOOS |

Detalhe de origem:

- `2026-06-01`: `fonte_resolucao_sigvoos = MATRICULA`, `fonte_resolucao = null`
- `2026-06-02` a `2026-06-05`: `fonte_resolucao_sigvoos = REBUILD_SIGVOOS_2026`, `fonte_resolucao = SIGVOOS`

Leitura: a janela de Dieter confirma o comportamento esperado do rebuild. O dia `2026-06-01` permanece como pendencia/auditoria de origem; `2026-06-02` a `2026-06-05` estao canonicamente em SIGVOOS.

## 4. Coerencia UI/API por codigo

### Tela FRMS / Monitor de Fadiga

Tela: `src/react-app/pages/frms/FrmsFadigaPainel.tsx`

Endpoints consumidos diretamente:

1. `GET /api/frms/daily-fatigue?date=YYYY-MM-DD&scope=team`
2. `GET /api/frms/daily-fatigue/alerts?date=YYYY-MM-DD`
3. `GET /api/frms/fadiga-checkin/analytics?dias=30`

Campos principais lidos pela UI:

- `/daily-fatigue`
  - `data.items[]`
  - `funcionario_id`, `funcionario_nome`
  - `status`
  - `data_source`
  - `score_fadiga`
  - `requires_operational_review`
- `/daily-fatigue/alerts`
  - `data.items[]`
  - `id`, `tripulante_id`, `tripulante_nome`
  - `nivel`, `tipo_limite`, `mensagem`
- `/fadiga-checkin/analytics`
  - `data.serie[]`
  - `data_checkin`, `media_score`, `alto_critico`, `requer_frat`

Escopo:

- `daily-fatigue`: diario
- `daily-fatigue/alerts`: diario
- `fadiga-checkin/analytics`: serie historica agregada (`dias=30` no painel)

Observacao:

- esta tela nao consome os campos de jornada SIGVOOS/FIRA diretamente; ela consome status diario de check-in e alertas sinteticos/persistidos.

### Tela de validacao manual do caso Dieter

Tela: `src/react-app/pages/frms/FrmsFichaTripulante.tsx`

Endpoints usados para a pagina que mostra Dieter e a tabela mensal:

1. `GET /api/frms/jornadas/:tripulante_id?mes=YYYY-MM&data_inicio=YYYY-MM-01&data_fim=YYYY-MM-DD`
2. `GET /api/frms/acumulo/:tripulante_id?mes=YYYY-MM`
3. `GET /api/frms/alertas?tripulante_id=:id&data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD&limit=500`
4. `GET /api/frms/tripulante/:id/jornadas?dias=7`
5. `GET /api/frms/tripulante/:id/explicacao-dia?data=YYYY-MM-DD&origem=ficha`

Campos de `jornadas` efetivamente lidos pela UI:

- base: `data`, `status`, `origem`, `hora_apresentacao`, `hora_termino`, `duracao_jornada_minutos`, `horas_voo_minutos`
- integridade/fonte: `integridade_status`, `integridade_codigo`, `integridade_mensagem`, `fonte_original`, `source_status`, `usado_no_frms_operacional`
- percentuais diarios explicitos: `pct_jornada_diaria`, `pct_voo_diaria`

Campos de `acumulo` efetivamente lidos pela UI:

- rolling diario/janelas: `hv_dia_min`, `pct_limite_dia`, `hv_7_dias_min`, `hv_28_dias_min`, `hv_mes_calendario_min`, `pct_limite_mes_calendario`, `hv_365_dias_min`
- mensal: `jornada_realizada_min`, `hv_realizada_min`, `jornada_fatorizada_pct`, `hv_fatorizada_pct`
- configuracao: `limites.HV_DIARIA_HORAS`, `limites.HV_MES_HORAS`

Escopo dos campos:

- diario:
  - `pct_voo_diaria`
  - `pct_jornada_diaria`
  - `hv_dia_min`
  - `pct_limite_dia`
- mensal:
  - `hv_mes_calendario_min`
  - `pct_limite_mes_calendario`
  - `jornada_realizada_min`
  - `hv_realizada_min`
  - `jornada_fatorizada_pct`
  - `hv_fatorizada_pct`

### Campos explicitos novos vs legacy

Leitura por codigo:

- a tabela mensal de jornadas usa **campos diarios explicitos**:
  - `pct_jornada_diaria`
  - `pct_voo_diaria`
- a funcao de apresentacao `buildJornadaMensalPresentation()` nao faz fallback silencioso para percentual mensal quando o diario nao vem
- ha cobertura automatizada para isso em `src/react-app/pages/frms/__tests__/frmsJornadasMensaisPresentation.test.ts`

Evidencias de codigo:

- `FAT.HV% dia` na ficha mensal vem de `pct_voo_diaria`
- `Uso mes HV` nos cards vem de `rolling.pct_limite_mes_calendario`
- o limite de `Uso mes HV` vem de `limites.HV_MES_HORAS`, default `90`

Ressalva:

- a tela `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx` ainda aceita fallback legacy em pontos especificos:
  - `pct_jornada_diaria ?? pct_jornada`
  - `pct_voo_diaria ?? pct_voo`
- no backend atual, os campos diarios explicitos estao sendo retornados; portanto o fallback nao ficou ativo no caso auditado, mas a compatibilidade legada continua no componente.

## 5. Checklist manual autenticado

URL base da aplicacao:

- app: `https://airtrust.online`
- API: `https://api.airtrust.online`

Checklist para execucao manual no navegador:

1. Abrir `https://airtrust.online`.
2. Entrar com usuario autorizado.
3. Abrir FRMS.
4. Abrir `Monitor de Fadiga` / `Fadiga Diaria` e confirmar que a tela carrega sem erro visual.
5. Abrir a ficha do tripulante **Dieter**.
6. Selecionar o mes `2026-06`.
7. Verificar as linhas de `2026-06-01` a `2026-06-05`.
8. Confirmar que `2026-06-02`, `2026-06-03`, `2026-06-04` e `2026-06-05` aparecem como `SIGVOOS`.
9. Confirmar que `2026-06-01` aparece apenas como linha nao operacional / inconsistencia / pendencia de origem, se a UI a exibir.
10. Confirmar que `FAT.HV% dia` do grid mensal nao reflete percentual mensal de `90h`.
11. Confirmar que `Uso mes HV` usa a referencia mensal de `90h`.
12. Confirmar que linhas `FIRA` nao aparecem como alimentando indicador operacional ativo.
13. Confirmar que nao ha alertas operacionais ativos associados a jornadas nao-SIGVOOS.
14. Confirmar que alertas orfaos antigos do rebuild nao aparecem na tela.
15. Abrir `Explicar` em pelo menos um dia SIGVOOS e validar que a explicacao abre sem erro.
16. Tirar prints de evidencia:
    - lista mensal de Dieter;
    - card/indicador de `Uso mes HV`;
    - coluna `FAT.HV% dia`;
    - ausencia de alerta operacional FIRA;
    - ausencia de alertas orfaos.

## 6. Riscos remanescentes e decisoes

### 659 linhas nao canonicas

Decisao recomendada:

- **manter como historico/auditoria nao operacional**
- **nao reativar para calculo operacional**
- tratar saneamento apenas na origem SIGVOOS/FIRA/MANUAL, fora desta fase

Justificativa:

- as derivacoes operacionais ja estao limpas em SIGVOOS
- essas 659 linhas ainda sao uteis como trilha de auditoria e pendencia
- misturar correcao de origem com a fase pos-producao aumentaria risco sem necessidade imediata

### Dieter `2026-06-01`

Decisao recomendada:

- manter `2026-06-01` como **pendencia de origem nao operacional**
- nao promover esse dia para operacional enquanto a origem continuar inconsistente (`1537 > 595`)

### Necessidade de patch

Com base nesta verificacao:

- **nao ha necessidade de patch corretivo imediato em producao**

### Necessidade de saneamento de origem SIGVOOS

Com base nesta verificacao:

- **sim, ha necessidade de saneamento de origem/upstream**
- foco inicial: os `13` casos `HV > jornada`, incluindo os `5` casos `jornada = 0 com HV > 0`
- isso e acao de qualidade de dados, nao de hotfix operacional do rebuild

## 7. Recomendacao de monitoramento

Monitorar nas proximas 24-72h:

1. novas jornadas operacionais entrando como `SIGVOOS`;
2. reaparicao de alertas ativos ligados a jornada nao-SIGVOOS;
3. reaparicao de alertas orfaos operacionais nao relacionados a `FADIGA_DIARIA`;
4. crescimento dos casos `HV > jornada`;
5. evidencias manuais de UI para Dieter e para pelo menos mais 2 tripulantes com jornadas no periodo.

Queries sentinela recomendadas:

- contagem por `origem` no recorte corrente;
- alertas ativos com `jornada_id` ligado a origem nao-SIGVOOS;
- rolling sem jornada SIGVOOS de mesma data;
- `horas_voo_minutos > duracao_jornada_minutos`.

## 8. Confirmacao final desta verificacao

- nenhuma escrita em banco foi realizada;
- nenhuma migration foi executada;
- nenhum dado de producao foi alterado;
- nenhum deploy/commit foi realizado nesta fase;
- o resultado desta verificacao e compatível com seguir apenas com validacao manual autenticada.
