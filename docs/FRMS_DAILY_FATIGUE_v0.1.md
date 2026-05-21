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
- `reference_date`
- `horas_sono_24h`
- `horas_sono_48h`
- `wake_time`
- `subjective_fatigue_level` (0-10)
- `sleepiness_level` (0-10)
- `fit_for_duty`
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
- `fit_for_duty = false` -> `unfit_for_duty`
- `subjective_fatigue_level >= 8` -> `critical`
- `sleepiness_level >= 8` -> `critical`
- `horas_sono_24h < 4` -> `critical`
- `horas_sono_24h < 5` -> `attention`
- não preenchido -> `not_submitted` (com revisão operacional, sem crítico automático)

Tipos de alerta operacionais expostos:
- `daily_fatigue_not_submitted`
- `daily_fatigue_attention`
- `daily_fatigue_critical`
- `daily_fatigue_unfit_for_duty`

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
- Painel histórico avançado por base/frota/funcão.
- Trilha de auditoria expandida para workflow de revisão operacional.
