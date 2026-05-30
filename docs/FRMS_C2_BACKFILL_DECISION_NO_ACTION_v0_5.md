# FRMS C2 Backfill — Decisão de Não Ação (v0.5)

## 1) Resultado do SELECT autorizado
Leitura remota autorizada (somente SELECT) consolidou:
- `processado_com_bug = 1`: **0**
- `processado_com_bug = 0`: **749** (ativos relacionados)
- sem `hora_apresentacao`: **174**
- `FRMS_RECALCULO_NECESSARIO`: **0**
- `FRMS_SYNC`: **0**

## 2) Decisão
- **Não executar backfill C2 agora**.

## 3) Justificativa
- Falta critério confiável de candidato real para backfill histórico.
- Data pré-C2 isolada não é suficiente para mutação segura.
- Há risco de write desnecessário no histórico sem ganho operacional comprovado.

## 4) Condição para reabrir
Reabrir decisão apenas se houver:
- Critério inequívoco de candidato;
- Evidência de bug real em histórico;
- Necessidade operacional explícita aprovada;
- Snapshot + rollback + lote piloto aprovados.

## 5) Status
`BACKFILL_C2_NO_ACTION_CURRENTLY_RECOMMENDED`
