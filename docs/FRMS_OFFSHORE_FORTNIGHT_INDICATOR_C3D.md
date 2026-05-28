# AirTrust FRMS — Indicador Operacional Acumulado de Quinzena (C3-D)

## 1) Objetivo
Definir a primeira versão do indicador operacional acumulado de quinzena para apoio à coordenação offshore, sem diagnóstico automático e sem classificação de fadiga fisiológica.

## 2) Contexto offshore/quatorzena
Na operação offshore, a carga operacional tende a se acumular ao longo do período embarcado. Nesta fase C3-D, o AirTrust passa a expor um indicador descritivo para leitura de período, mantendo separação entre:

- compliance regulatório (HV/jornada);
- risco operacional diário;
- indicador acumulado de quinzena.

## 3) Fontes de dados usadas nesta versão

- `frms_fatorizacao_jornada`:
  - `dia_periodo_embarcado`
  - `total_dias_periodo`
  - `effectiveness_pct`
- `frms_jornada`:
  - `data`, `hora_apresentacao`, `hora_termino`
  - `duracao_jornada_minutos`, `horas_voo_minutos`
- `frms_fadiga_checkin`:
  - presença/pendência de check-in
  - indicação de dado real/estimado na leitura diária
- snapshot operacional já existente:
  - status diário `OK/ATENCAO/CRITICO/INCOMPLETO`
  - fontes `REAL/ESTIMADO/AUSENTE/INCONSISTENTE`

## 4) Campos disponíveis hoje (implementados)

- `periodo_inicio`, `periodo_fim` (derivados de dia/total)
- `dia_periodo`, `total_dias_periodo`
- `dias_consecutivos_com_jornada`
- `dias_com_checkin_pendente`
- `dias_com_dado_estimado`
- `duty_time_periodo_min`
- `duty_time_168h_min`
- `horas_voo_periodo_min`
- `horas_voo_168h_min`
- `jornadas_periodo`
- `apresentacoes_antes_0600`
- `apresentacoes_antes_0700`
- `menor_descanso_entre_jornadas_min`
- `fonte_periodo` (`DERIVADO` / `INCOMPLETO` / `AUSENTE`)
- `status_quinzena` (`OK` / `ATENCAO` / `CRITICO` / `INCOMPLETO`)
- `alertas_quinzena` (descritivos)
- `limitation_notes`

## 5) Campos ausentes nesta fase

- `setores_periodo` (robusto)
- `sit_periods_estimados` (robusto)
- qualidade de repouso por contexto (base/hotel/alojamento)
- leitura estruturada de cochilo
- marcador persistente de fonte por campo em banco

## 6) Contrato do indicador

O snapshot operacional passa a incluir, por item:

- `fortnight_indicator: FrmsFortnightIndicator | null`

Sem quebra do contrato anterior: o campo é adicional.

## 7) Limitações científicas e operacionais

- Indicador é **descritivo operacional** e de **triagem**.
- Não é modelo biomatemático validado.
- Não é diagnóstico de fadiga fisiológica.
- Sem cobertura completa da janela da quinzena consultada, o indicador marca `INCOMPLETO`.
- Acumulados refletem a janela disponível no snapshot consultado.

## 8) Por que não é diagnóstico de fadiga

O cálculo atual agrega exposição operacional observável e status diários já existentes. Não há, nesta fase, medição objetiva de sono/fase circadiana nem modelagem validada para inferência fisiológica individual.

## 9) Roadmap técnico recomendado

- C3-E: setores/trechos/sit periods com estrutura robusta
- C3-F: revisão IA/resumo para refletir limitações por fonte
- C3-G: source flags por campo (exige evolução de schema)
- C3-H: calibração científica de pesos/thresholds com dados longitudinais
- Antes da Fase D: revisão especializada (Opus) para desenho final de gatilhos persistentes

