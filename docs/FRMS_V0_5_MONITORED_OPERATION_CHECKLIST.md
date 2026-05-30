# FRMS v0.5 — Checklist de Operação Monitorada

## 1) Status
- FRMS v0.5 liberado para **coleta de dados novos** como ferramenta de triagem operacional.
- Uso obrigatório com revisão humana.

## 2) O que observar nos primeiros dias
- Check-ins novos entrando no sistema.
- Fatorização criada/atualizada para os registros novos.
- Ficha do tripulante refletindo os dados recentes.
- Histórico de fadiga atualizado.
- Dashboard FRMS atualizado.
- Explicação do dia carregando sem erro.

## 3) O que o operador deve conferir
- Fonte do sono (`informado` vs `estimado/padrão`).
- Hora em que acordou.
- Hora de apresentação.
- Sinalização de dado estimado/ausente.
- Recálculo pendente, quando houver.
- Divergência entre tripulantes com contexto operacional distinto.

## 4) O que NÃO fazer
- Não usar FRMS como diagnóstico médico.
- Não usar FRMS como decisão automática.
- Não usar FRMS isoladamente para restrição operacional.
- Não ignorar contexto operacional e revisão humana.

## 5) Critérios para abrir bug
Abrir bug quando houver evidência de:
- Check-in novo não aparece.
- Índice não muda quando deveria.
- Explicação do dia não carrega.
- Dado novo aparece como legado indevidamente.
- Rota em branco.
- Erro global de UI/API.
- POST/SGSO/read-ack inesperado no fluxo monitorado.

## 6) Critérios para não abrir bug
Não abrir bug quando:
- Índices diferem por sono/HV/janelas diferentes.
- Dado estimado está corretamente sinalizado.
- O sistema não conclui quando o dado está incompleto.

## 7) Rotina sugerida
- Revisão diária dos indicadores por 7 dias corridos.
- Revisão semanal após a primeira semana.
- Relatório simples de anomalias com evidências objetivas (data, endpoint/tela, comportamento esperado vs observado).
