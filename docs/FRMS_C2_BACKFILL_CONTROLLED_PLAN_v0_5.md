# FRMS C2 Backfill Controlled Plan v0.5

## 1) Objetivo do backfill
Corrigir historicamente registros pré-C2 afetados por lógica antiga de sincronização de check-in/effectiveness, com execução controlada e totalmente auditável, sem alterar fórmula/threshold e sem acoplamento a fluxos operacionais de escrita fora do escopo.

## 2) Fora de escopo
- SGSO.
- read/ack.
- geração/reprocesso de alertas operacionais.
- despacho de notificações.
- alteração de fórmula.
- alteração de thresholds.

## 3) Pré-condições obrigatórias
- Snapshot/export antes da execução.
- Rollback testado em ambiente controlado.
- Ambiente alvo explicitamente definido (não produção direta sem piloto).
- Query de candidatos validada (read-only).
- Dry-run completo com relatório.
- Lote piloto pequeno aprovado.
- Validação antes/depois documentada.
- Janela operacional definida.
- Autorização explícita de execução.

## 4) Critérios de candidato
- Registros pré-C2.
- Registros com sinalizador `processado_com_bug`, quando confiável.
- Registros com dados mínimos suficientes para recálculo seguro.
- Registros sem `hora_apresentacao`: tratar como pendente/revisão, sem recálculo cego.

## 5) Critérios de exclusão
- Falta de hora de apresentação válida.
- Dados insuficientes para recálculo consistente.
- Fonte ambígua/baixa confiança sem regra explícita.
- Registro já corrigido em lógica C2.
- Risco de sobrescrever dado informado pelo usuário.

## 6) Queries read-only propostas (planejamento)
1. Contagem de candidatos por período/empresa:
```sql
SELECT empresa_id, COUNT(*)
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL
  AND data_jornada < :c2_cutoff_date
GROUP BY empresa_id;
```
2. Candidatos com flag técnica legada:
```sql
SELECT COUNT(*)
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL
  AND processado_com_bug = 1;
```
3. Candidatos com dados insuficientes (exclusão):
```sql
SELECT COUNT(*)
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL
  AND (hora_apresentacao IS NULL OR TRIM(hora_apresentacao) = '');
```
4. Faixa temporal e cobertura:
```sql
SELECT MIN(data_jornada), MAX(data_jornada), COUNT(*)
FROM frms_fatorizacao_jornada
WHERE deleted_at IS NULL;
```

## 7) Plano de snapshot
- Extrair dataset pré-execução para `/tmp` com:
  - ids técnicos,
  - empresa_id,
  - data_jornada,
  - effectiveness_pct/nivel/componentes,
  - flags de origem/confiança relevantes,
  - hash técnico para comparação.
- Snapshot deve ser imutável e versionado por timestamp.

## 8) Plano de rollback
- Gerar artefato de reversão baseado no snapshot pré-execução.
- Definir rollback por lote (não global cego).
- Validar rollback em ambiente controlado antes de produção.
- Critério de rollback: divergência acima do limite esperado ou anomalia estrutural.

## 9) Plano de lote piloto
- Selecionar amostra pequena representativa (por empresa/período/caso).
- Executar dry-run e depois execução real apenas no lote piloto autorizado.
- Comparar antes/depois com revisão humana técnica.
- Só ampliar para lote expandido após aceite explícito.

## 10) Métricas pós-backfill
- Quantidade alterada.
- Quantidade pulada.
- Quantidade pendente para revisão manual.
- Distribuição antes/depois de effectiveness.
- Casos com maior variação absoluta/relativa.

## 11) Smoke pós-backfill (planejado)
- Verificar `/api/version` e integridade de endpoints FRMS read-only.
- Verificar consistência de ficha/histórico/modal explicação para amostras do lote.
- Confirmar ausência de regressão em copy/guardrails.

## 12) Critérios de abortar
- Falha de snapshot/rollback.
- Inconsistência de cardinalidade no lote.
- Variação anômala fora do envelope previsto.
- Evidência de sobregravação indevida de dados informados.
- Erro em validações de integridade.

## 13) Critérios de sucesso
- Lote piloto concluído sem regressão funcional/metodológica.
- Diferenças explicáveis e auditáveis.
- Métricas dentro do envelope aprovado.
- Rollback comprovadamente viável.

## 14) Status desta fase
`BACKFILL_NOT_AUTHORIZED_IN_THIS_PHASE`
