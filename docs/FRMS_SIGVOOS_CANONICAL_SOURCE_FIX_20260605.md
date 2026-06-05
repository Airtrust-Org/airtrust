# FRMS SIGVOOS Canonical Source Fix - 2026-06-05

## Problema

O FRMS/Fadiga Diaria estava exibindo e calculando jornada, horas de voo, rolling, alertas e percentuais a partir de linhas `frms_jornada` com `origem='FIRA'`. Isso gerou incoerencias operacionais para Dieter Johny Kuhr (`tripulante_id=7`) em junho/2026:

- 2026-06-01: HV de `25h37` em uma jornada de `09h55`.
- 2026-06-02: coluna com `03h09`, mas alerta operacional com `HV diaria 15h15min`.
- Percentuais, alertas e tabela usavam bases diferentes.

## Evidencia Read-Only

Todas as consultas remotas foram `SELECT` ou `PRAGMA`, sem migrations e sem escrita. O metadado D1 retornou `changed_db=false`, `rows_written=0` nas consultas executadas.

Queries usadas:

```sql
PRAGMA table_info(frms_jornada);
SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%fira%' OR name LIKE '%sigvoos%' OR name LIKE 'frms_%') ORDER BY name;
SELECT j.id,j.empresa_id,j.tripulante_id,j.data,j.status,j.origem,j.fonte_resolucao,j.fonte_resolucao_sigvoos,j.hora_apresentacao,j.hora_termino,j.duracao_jornada_minutos,j.horas_voo_minutos,j.deleted_at FROM frms_jornada j WHERE j.tripulante_id=7 AND j.data IN ('2026-06-01','2026-06-02','2026-06-03') ORDER BY j.data,j.created_at,j.id;
SELECT f.id,f.jornada_id,j.data,j.origem,j.horas_voo_minutos,j.duracao_jornada_minutos,f.total_fatorizado_jornada,f.total_fatorizado_hv,f.effectiveness_pct,f.created_at,f.deleted_at FROM frms_fatorizacao_jornada f JOIN frms_jornada j ON j.id=f.jornada_id WHERE j.tripulante_id=7 AND j.data IN ('2026-06-01','2026-06-02','2026-06-03') ORDER BY j.data,f.created_at,f.id;
PRAGMA table_info(frms_alerta);
PRAGMA table_info(frms_acumulo_rolling);
PRAGMA table_info(frms_importacao_fira);
PRAGMA table_info(integracoes_sigvoos_eventos);
SELECT a.id,a.jornada_id,j.data,j.origem,j.horas_voo_minutos,j.duracao_jornada_minutos,a.tipo_limite,a.nivel,a.percentual_atingido,a.valor_atual_min,a.valor_limite_min,a.mensagem,a.created_at,a.deleted_at FROM frms_alerta a LEFT JOIN frms_jornada j ON j.id=a.jornada_id WHERE (a.tripulante_id=7 OR j.tripulante_id=7) AND (j.data IN ('2026-06-01','2026-06-02','2026-06-03') OR a.created_at LIKE '2026-06-0%') ORDER BY COALESCE(j.data,a.created_at),a.created_at,a.id;
SELECT id,tripulante_id,data_referencia,hv_dia_min,hv_7_dias_min,hv_28_dias_min,hv_365_dias_min,hv_mes_calendario_min,pct_limite_dia,pct_limite_7d,pct_limite_28d,pct_limite_365d,pct_limite_mes_calendario,created_at,deleted_at FROM frms_acumulo_rolling WHERE tripulante_id=7 AND data_referencia IN ('2026-06-01','2026-06-02','2026-06-03') ORDER BY data_referencia,created_at,id;
SELECT id,tripulante_id,canac,nome_fira,ano,mes,arquivo_nome,status,total_dias_extraidos,total_dias_importados,total_dias_substituidos,total_dias_ignorados,total_dias_erro,created_at,updated_at,deleted_at,substr(preview_json,1,800) AS preview_prefix FROM frms_importacao_fira WHERE (tripulante_id='7' OR ano=2026 AND mes=6 AND nome_fira LIKE '%Dieter%') ORDER BY created_at DESC LIMIT 5;
SELECT id,empresa_id,tipo_evento,status,created_at,updated_at,substr(payload_json,1,1000) AS payload_prefix,substr(resposta_json,1,1000) AS resposta_prefix FROM integracoes_sigvoos_eventos WHERE deleted_at IS NULL AND (payload_json LIKE '%Dieter%' OR payload_json LIKE '%2026-06-01%' OR payload_json LIKE '%2026-06-02%' OR payload_json LIKE '%2026-06-03%' OR resposta_json LIKE '%Dieter%' OR resposta_json LIKE '%2026-06-01%' OR resposta_json LIKE '%2026-06-02%' OR resposta_json LIKE '%2026-06-03%') ORDER BY created_at DESC LIMIT 20;
```

Principais achados:

- `frms_jornada` tem linhas ativas para 2026-06-01, 2026-06-02 e 2026-06-03 com `origem='FIRA'`.
- Nao havia linha ativa `origem='SIGVOOS'` em `frms_jornada` para essas tres datas.
- `25h37` vem de `frms_jornada.horas_voo_minutos=1537` em 2026-06-01 e tambem aparece no `preview_json` da importacao (`voo":"25:37"`).
- `15h15` vem de `frms_acumulo_rolling.hv_dia_min=915` e de `frms_alerta.valor_atual_min=915` no alerta `HV_DIARIA` de 2026-06-02.
- O `915` foi produzido pela janela rolling de 24h antes da apresentacao de 2026-06-02, contaminada pela linha FIRA de 2026-06-01 com `1537` minutos.
- A coluna de 2026-06-02 vinha de `frms_jornada.horas_voo_minutos=189` (`03h09`), enquanto o alerta vinha de `frms_acumulo_rolling.hv_dia_min=915`.

## Regra Operacional

SIGVOOS e a fonte canonica para jornada e horas de voo operacionais no FRMS.

FIRA nao alimenta jornada operacional, horas de voo operacional, FAT.HV%, FAT.JORNADA%, alertas operacionais, rolling, curva de efetividade, cards superiores ou prontidao operacional.

Quando so existe FIRA e nao existe SIGVOOS, a linha fica marcada como `PENDENTE_SIGVOOS`/`FONTE_NAO_CANONICA`, pode ser exibida como auditoria, mas nao participa de calculo operacional.

## Alteracoes

- Criada politica central `frms-source-policy.ts` com `SIGVOOS` como unica fonte canonica operacional.
- `calcAcumuloRolling` agora descarta linhas com `origem` nao canonica quando o campo esta presente.
- `recalcularPipeline` retorna sem alertas/rolling/fatorizacao operacional para fontes nao canonicas.
- `buscarJornadas` inclui `fonte_original`, `fonte_canonica`, `source_status`, `integridade_fonte`, `usado_no_frms_operacional`, `usado_em_alertas` e `usado_em_rolling`.
- Percentuais diarios/mensais e fatorizacao operacional ficam nulos/ausentes para FIRA.
- Listagem de alertas operacionais passa a retornar apenas alertas ligados a jornadas `SIGVOOS`.
- UI mostra `Pendente SIGVOOS`/`Fonte nao canonica` e exibe valores FIRA apenas como auxiliar/auditoria.

## Testes

Testes adicionados/ajustados:

- `worker-airtrust/src/__tests__/frms/frms-source-policy.test.ts`
- `worker-airtrust/src/__tests__/frms/frms-source-policy-rolling.test.ts`
- `worker-airtrust/src/__tests__/routes/frms-jornadas-contract.test.ts`
- `src/react-app/pages/frms/__tests__/frmsJornadasMensaisPresentation.test.ts`

Cobertura:

- SIGVOOS prevalece como unica fonte operacional.
- FIRA sem SIGVOOS vira pendencia e nao alimenta FRMS operacional.
- FIRA nao alimenta rolling nem alertas.
- Dieter 2026-06-01 `25h37` nao vira HV operacional validada.
- Dieter 2026-06-02 nao herda `15h15` de rolling contaminado.
- Rota `/api/frms/jornadas/:tripulante_id` retorna fonte/status/flags claros.
- UI mostra fonte pendente e nao renderiza FIRA como operacao normal.

## Sem Alteracao De Dados

Nao houve migration, backfill ou saneamento historico. Nenhum `UPDATE`, `INSERT`, `DELETE`, `UPSERT`, `ALTER`, `DROP` ou `CREATE` foi executado no D1 durante a investigacao/correcao.

## Riscos Remanescentes

- Dados historicos FIRA e alertas/rolling/fatorizacao persistidos continuam no D1 como legado. A correcao de codigo impede uso operacional, mas nao saneia historico.
- Se o negocio quiser remover ou reconciliar os registros antigos, sera necessario saneamento historico autorizado explicitamente.
- A tabela `frms_importacao_fira` ainda armazena imports com arquivo `SIGVOOS_...`, o que deve ser tratado em fase propria de nomenclatura/modelagem para reduzir ambiguidade operacional.
