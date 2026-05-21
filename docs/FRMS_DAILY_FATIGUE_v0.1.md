# FRMS Daily Fatigue v0.1

## Objetivo
Implementar o registro diário de fadiga do tripulante como dado operacional para apoio ao FRMS, com sinalização de risco e revisão humana da coordenação, sem decisão automática de afastamento.

## Fluxo do tripulante
1. Acessa o botão **Fadiga Diária** no FRMS.
2. Preenche sono 24h/48h, despertar, fadiga subjetiva, sonolência, condição segura para jornada e observações.
3. Envia o registro do dia.
4. Recebe status operacional de risco (normal/attention/critical/unfit_for_duty).

## Fluxo do gestor/coordenação
1. Acessa o painel diário de fadiga.
2. Visualiza status por tripulante/dia:
   - Preenchida
   - Não preenchida
   - Atenção
   - Crítica
   - Revisão operacional
3. Consulta área de **Alertas de Fadiga Diária**.
4. Aciona CTA **Revisar escala** para decisão operacional humana.

## Campos principais (v0.1)

### Campo canônico: `fit_for_duty`
- Tipo: `boolean`
- Valor `false` → tripulante não apto → risco `unfit_for_duty` (crítico, revisão obrigatória)
- Valor `true` → tripulante apto (risco determinado pelos demais indicadores)

### Campo legado: `apto` (compatibilidade)
- Tipo: `integer` (0 = não apto, 1 = apto)
- Aceito apenas para clientes legados que ainda não usam `fit_for_duty`
- Se **ambos** vierem no payload com valores **conflitantes**, a requisição é rejeitada com HTTP 400:
  ```json
  { "success": false, "error": "payload_conflict", "message": "fit_for_duty e apto possuem valores conflitantes" }
  ```
- Se ambos vierem consistentes (ex: `fit_for_duty=false, apto=0`), aceito normalmente
- Prioridade de resolução: `fit_for_duty` > `apto` > padrão `true`

### Demais campos
- `reference_date`
- `horas_sono_24h`
- `horas_sono_48h`
- `wake_time`
- `subjective_fatigue_level` (0-10)
- `sleepiness_level` (0-10)
- `free_text_notes`/`observacoes`
- Campos legados preservados para compatibilidade (`kss_score`, `qualidade_sono`, etc.)

## Fallback quando não preenchido
Quando não existe check-in para tripulante + data:
- mantém estimativa padrão atual de sono/despertar;
- marca explicitamente `status = not_submitted`;
- marca origem `data_source = default_estimate`;
- define confiança reduzida (`confidence = reduced`);
- sinaliza necessidade de revisão operacional.

## Regra inicial de alerta (v0.1)
Sinalização operacional (não diagnóstica):
- `fit_for_duty = false` → `unfit_for_duty` (crítico)
- `subjective_fatigue_level >= 8` → `critical`
- `sleepiness_level >= 8` → `critical`
- `horas_sono_24h < 4` → `critical`
- `horas_sono_24h < 5` → `attention`
- não preenchido → `not_submitted` (com revisão operacional, sem crítico automático)

Tipos de alerta operacionais expostos:
- `daily_fatigue_not_submitted`
- `daily_fatigue_attention`
- `daily_fatigue_critical`
- `daily_fatigue_unfit_for_duty`

## Idempotência de alertas
- Não são criados alertas duplicados para o mesmo tripulante/data/nível/tipo enquanto o alerta estiver **aberto** (`resolvido = 0`).
- Se o alerta anterior foi **resolvido** (`resolvido = 1`) e o tripulante submete novo check-in com risco, um **novo alerta** é criado normalmente.
- Alertas são criados apenas no POST/submissão do check-in, nunca em GETs.

## GET /daily-fatigue?scope=team — Paginação
O endpoint aceita os parâmetros `limit` e `offset`:
- `limit`: número máximo de tripulantes retornados por chamada (padrão: `100`, máximo: `500`)
- `offset`: posição de início para paginação (padrão: `0`)
- A resposta inclui `pagination: { limit, offset }` para facilitar navegação
- Clientes que não enviam esses parâmetros recebem os primeiros 100 registros (backward-compatible)

Exemplo:
```
GET /daily-fatigue?scope=team&date=2026-05-20&limit=50&offset=50
```

## v0.1.1 — Check-in simplificado

**Branch:** `fix/frms-daily-fatigue-simplify`

Simplificação da tela de Fadiga Diária para check-in operacional de 30–60 segundos, mantendo backend e migration inalterados.

### Campos obrigatórios na UI

| # | Campo | Tipo na UI | Campo backend |
|---|-------|-----------|---------------|
| 1 | Sono nas últimas 24h | 5 botões rápidos | `horas_sono_24h` (mapeado) |
| 2 | Horário em que acordou | Campo hora | `wake_time` + `hora_acordou` |
| 3 | Fadiga agora | Escala 1–5 com rótulos | `subjective_fatigue_level` + `kss_score` |
| 4 | Condição segura para a escala | Sim / Não | `fit_for_duty` (canônico) |

### Campo condicional

**Observação rápida** — exibida automaticamente se:
- `fit_for_duty = false` → obrigatória (vira `motivo_inaptidao`)
- Fadiga ≥ 4 → opcional (vira `free_text_notes`)
- Sono < 5h → opcional (vira `free_text_notes`)

### Mapeamento sono → horas_sono_24h

| Botão | Valor enviado |
|-------|--------------|
| < 4h  | 3.5 |
| 4–5h  | 4.5 |
| 5–6h  | 5.5 |
| 6–8h  | 7.0 |
| > 8h  | 8.5 |

### Mapeamento fadiga 1–5 → subjective_fatigue_level

| UI | Rótulo    | subjective_fatigue_level | kss_score |
|----|-----------|--------------------------|-----------|
| 1  | Normal    | 1                        | 2         |
| 2  | Leve      | 3                        | 4         |
| 3  | Moderada  | 5                        | 5         |
| 4  | Alta      | 8                        | 7         |
| 5  | Extrema   | 10                       | 9         |

`sleepiness_level` recebe o mesmo valor de `subjective_fatigue_level` nesta versão.

### Campos removidos da UI (mantidos no backend)

Os campos abaixo continuam existindo na tabela e no schema, mas não são coletados na tela simplificada. Valores não fornecidos continuam com fallback `default_estimate`.

- KSS slider direto
- Sono 48h (`horas_sono_48h` — enviado como omitido/null)
- Qualidade do sono (`qualidade_sono`)
- Sonolência 0–10 separada
- Sintomas estruturados (fadiga_física, mental, concentração, sonolência diurna, irritabilidade)
- Medicação/álcool últimas 12h
- Risco autoavaliado
- Jornada de início prevista
- Observações sempre abertas

### Payload enviado (v0.1.1)

```json
{
  "reference_date": "YYYY-MM-DD",
  "data_checkin": "YYYY-MM-DD",
  "hora_acordou": "HH:MM",
  "wake_time": "HH:MM",
  "horas_sono_24h": <número mapeado>,
  "subjective_fatigue_level": <mapeado>,
  "sleepiness_level": <mapeado>,
  "kss_score": <mapeado>,
  "fit_for_duty": true | false,
  "motivo_inaptidao": "<texto>" | omitido,
  "free_text_notes": "<texto>" | omitido,
  "meds_ult_12h": 0,
  "alcool_ult_12h": 0,
  "aceite_termos": true,
  "aceite_privacidade": true
}
```

**Nota:** `apto` **não é enviado** para evitar `payload_conflict` — `fit_for_duty` é o campo canônico.

## Migration (0362_frms_daily_fatigue_v01.sql)
- **D1:** usa `ALTER TABLE ADD COLUMN` (sem `IF NOT EXISTS` — não suportado pelo Cloudflare D1)
- Índices usam `CREATE INDEX IF NOT EXISTS`
- Aplicada em produção em 2026-05-21 via `wrangler d1 execute --remote`
- Tracker `d1_migrations` atualizado manualmente após aplicação

## Base conceitual
- FRMS orientado a dados (data-driven).
- Autorrelato de fadiga como dado de segurança operacional em cultura não punitiva.
- Autorrelato complementa cálculo biomatemático/regulatório; não substitui.
- Revisão humana obrigatória para casos de atenção/crítico/unfit e não preenchimento relevante.

## Limitações da v0.1
- Não envia e-mail/SMS/WhatsApp automaticamente.
- Não aplica bloqueio/remoção automática de escala.
- Regras de risco ainda heurísticas (fase inicial).
- Histórico analítico ainda sem calibração científica avançada.

## Pendências futuras
- Notificação multicanal (email/SMS/app) com governança.
- Integração assistida com escala para bloqueio/remoção mediante decisão humana.
- Calibração científica contínua dos thresholds.
- Painel histórico avançado por base/frota/função.
- Trilha de auditoria expandida para workflow de revisão operacional.
