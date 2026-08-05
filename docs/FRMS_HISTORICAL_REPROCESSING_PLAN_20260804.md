# FRMS — Plano de diagnóstico e reprocessamento histórico

**Destino:** Frente 10 — diagnóstico e reconciliação de dados históricos  
**Estado:** somente planejamento e dry-run local; nenhuma escrita remota autorizada.

## 1. Objetivo

Mensurar registros calculados com convenções antigas e preparar um reprocessamento auditável sem substituir, apagar ou reescrever silenciosamente decisões passadas.

## 2. População candidata

Devem ser inventariados, por empresa e período:

1. jornadas com apresentação e término em que `hora_termino <= hora_apresentacao`;
2. jornadas cuja fatorização possui `processado_com_bug = 1`;
3. acumulados com `repouso_anterior_min < 0` e `repouso_suficiente = 1`;
4. jornadas com horas de voo na data de referência e `hv_dia_min = 0`;
5. fatorizações com `ABS(fator_hv_basica_pct) > 1`;
6. jornadas com duração persistida exatamente 60 minutos menor que apresentação→término e sem pausa registrada verificável;
7. registros com `hora_acordou` real, mas eventos ou fatorizações indicando estimativa;
8. effectiveness em 0 ou 100 com delta bruto potencialmente saturado;
9. registros usados em alerta, bloqueio, liberação, override ou decisão operacional.

A query de diagnóstico está em `scripts/diagnostics/frms-calculation-impact-readonly.sql`.

## 3. Dry-run proposto

O dry-run deve operar somente em SQLite/D1 local ou dump anonimizado autorizado.

Para cada jornada candidata:

```text
identificar empresa/tripulante de forma pseudonimizada
→ carregar configuração efetiva da época
→ calcular resultado V1 preservado
→ calcular resultado V2 sem persistir
→ registrar delta por variável
→ classificar materialidade
→ indicar se houve decisão dependente do valor
```

Saída mínima em CSV/JSON local não versionado:

- `empresa_hash`;
- `jornada_hash`;
- período mensal;
- versão anterior da fórmula;
- versão proposta;
- repouso antes/depois;
- estado de repouso antes/depois;
- HV diária antes/depois;
- effectiveness antes/depois e delta bruto;
- nível antes/depois;
- flags de dado real/estimado/desconhecido;
- flag `usado_em_decisao_passada`;
- motivo da divergência;
- severidade.

## 4. Estimativas obrigatórias

Antes de qualquer escrita, produzir:

- total de jornadas candidatas;
- empresas afetadas;
- menor e maior data;
- contagem por mês;
- contagem por cada causa;
- quantidade que muda nível de effectiveness;
- quantidade que muda repouso suficiente→insuficiente/desconhecido;
- quantidade que muda HV diária abaixo→acima de alerta/limite;
- quantidade associada a alertas, overrides ou ciência do gestor;
- amostra anonimizada de no máximo vinte registros por causa.

## 5. Versionamento

Não sobrescrever o valor original.

Estratégia recomendada para uma futura migration governada:

- adicionar ou reutilizar `formula_version`;
- preservar `effectiveness_pct_original`, componentes originais e timestamp de cálculo;
- gravar cálculo novo em versão separada ou snapshot de reconciliação;
- relacionar a execução a `reprocessing_run_id`;
- registrar SHA do código, hash da configuração e ator/workflow;
- marcar `historical_reprocessed_at` somente após pós-condições;
- impedir reexecução não idempotente.

A necessidade de migration e o desenho físico pertencem à Frente 10/Frente 0 e não são implementados nesta PR.

## 6. Decisões passadas

Registros usados para bloquear, liberar ou mitigar uma operação não devem ser silenciosamente reinterpretados. O reprocessamento deve:

- preservar a decisão e o valor disponíveis naquele momento;
- anexar a divergência recalculada;
- exigir revisão humana quando a classificação mudar materialmente;
- não apagar override, ciência, alerta ou justificativa;
- registrar se a correção teria alterado a decisão.

## 7. Rollback

Rollback de dados significa desativar a versão nova e restaurar a leitura da versão anterior, não apagar a trilha de reconciliação.

Pré-condições:

1. backup/ponto de recuperação do ambiente autorizado;
2. contagens antes da execução;
3. execução idempotente e allowlisted;
4. tabela/snapshot de originais;
5. pós-condições por empresa e período;
6. capacidade de reverter por `reprocessing_run_id`;
7. smoke funcional e revisão de amostra.

## 8. Ordem operacional futura

```text
query somente leitura
→ dump anonimizado/local
→ dry-run V1 × V2
→ revisão de especialista FRMS
→ plano de migration/versionamento
→ staging governado
→ validação de amostra
→ autorização separada
→ produção por workflow oficial
→ pós-condições e caso real
```

## 9. Proibições desta PR

- não executar query em produção;
- não aplicar migration;
- não alterar histórico;
- não gerar backfill automático;
- não fazer deploy;
- não inferir que todo registro candidato está errado sem reconstruir seus dados e configuração.
