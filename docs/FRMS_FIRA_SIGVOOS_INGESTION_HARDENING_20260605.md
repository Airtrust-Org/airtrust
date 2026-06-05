# FRMS FIRA/SIGVOOS Ingestion Hardening - 2026-06-05

## Problema

O D1 de producao contem linhas FRMS importadas de FIRA/SIGVOOS com horas de voo positivas e jornada zerada, ausente ou menor que a HV. Esses dados nao podem ser apresentados como operacao normal nem corrigidos silenciosamente, porque a origem bruta precisa permanecer auditavel.

## Escopo

- Auditoria read-only do D1 remoto de producao.
- Hardening de classificacao de integridade em FRMS/Fadiga Acumulada.
- Propagacao de status/codigo/mensagem de auditoria para API e UI.
- Marcacao de integridade em previews FIRA/SIGVOOS futuros, sem alterar schema e sem escrever em dados historicos.
- Testes unitarios, contrato de rota e preview SIGVOOS.

Fora do escopo: migration, UPDATE/INSERT/DELETE em producao, backfill/correcao retroativa de dados reais.

## Queries SELECT Usadas

Todas as execucoes remotas bem-sucedidas reportaram `changed_db=false` e `rows_written=0`.

```sql
PRAGMA table_info(frms_jornada);

SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND duracao_jornada_minutos = 0
  AND COALESCE(horas_voo_minutos,0) > 0;

SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND COALESCE(horas_voo_minutos,0) > COALESCE(duracao_jornada_minutos,0);

SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND duracao_jornada_minutos IS NULL
  AND COALESCE(horas_voo_minutos,0) > 0;

SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND COALESCE(horas_voo_minutos,0) > 0
  AND (hora_apresentacao IS NULL OR hora_termino IS NULL);

SELECT origem, COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
GROUP BY origem;

SELECT tripulante_id, data, origem, COUNT(*)
FROM frms_jornada
WHERE deleted_at IS NULL
GROUP BY tripulante_id, data, origem
HAVING COUNT(*) > 1;

SELECT COUNT(*) FROM frms_jornada
WHERE deleted_at IS NULL
  AND hora_apresentacao IS NOT NULL
  AND hora_termino IS NOT NULL
  AND hora_termino < hora_apresentacao;

PRAGMA table_info(horas_voo_lancamentos);
PRAGMA table_info(frms_importacao_fira);

SELECT COUNT(*) FROM horas_voo_lancamentos WHERE deleted_at IS NULL;

SELECT COUNT(*) FROM (
  SELECT empresa_id, funcionario_id, data_voo, prefixo_aeronave, origem, destino,
         duracao_total_min, origem_registro, frms_jornada_id, fira_importacao_id, COUNT(*)
  FROM horas_voo_lancamentos
  WHERE deleted_at IS NULL
  GROUP BY empresa_id, funcionario_id, data_voo, prefixo_aeronave, origem, destino,
           duracao_total_min, origem_registro, frms_jornada_id, fira_importacao_id
  HAVING COUNT(*) > 1
);

SELECT status, importado_por, COUNT(*)
FROM frms_importacao_fira
WHERE deleted_at IS NULL
GROUP BY status, importado_por;
```

## Contagens

- `duracao_jornada_minutos = 0 AND horas_voo_minutos > 0`: 6.
- `horas_voo_minutos > duracao_jornada_minutos`: 23.
- `duracao_jornada_minutos IS NULL AND horas_voo_minutos > 0`: 0.
- horario incompleto com HV positiva: 5.
- origem FIRA em `frms_jornada`: 731.
- origem SIGVOOS em `frms_jornada`: 21.
- duplicidade por `tripulante_id + data + origem`: 0 grupos.
- cruzamento de meia-noite por `hora_termino < hora_apresentacao`: 0.
- `horas_voo_lancamentos` ativos: 0; duplicidade por trecho: 0.
- `frms_importacao_fira`: 269 `IMPORTADO/SIGVOOS`, 11 `REVISAO/SIGVOOS`.
- data operacional diferente da data de voo: nao auditavel nas tabelas atuais; nao ha `data_operacional` em `frms_jornada`, `frms_importacao_fira` ou `horas_voo_lancamentos`.

## Exemplos Minimizados

- 2026-06-01, origem FIRA, registrado_por SIGVOOS: jornada 595 min, HV 1537 min.
- 2026-05-23, origem FIRA, registrado_por SIGVOOS: jornada 0 min, HV 18 min.
- 2026-01-30, origem FIRA, registrado_por SYSTEM_FIRA_REAL: hora_inicio ausente, jornada 0 min, HV positiva.
- 2026-05-02, origem SIGVOOS, registrado_por SIGVOOS: jornada 44 min, HV 85 min.

## Diagnostico Causal

Categorias observadas:

- HV importada sem jornada associada: confirmada nos casos com jornada 0 e HV positiva.
- jornada zerada por fonte: confirmada em linhas FIRA/SIGVOOS ja persistidas.
- horario incompleto com HV positiva: confirmado em 5 linhas.
- HV associada ao dia errado: nao comprovada pela auditoria; permanece hipotese para investigacao operacional.
- duplicidade de trecho: nao observada; tabela relacionada esta vazia em producao.
- virada de data/timezone: nao observada por `hora_termino < hora_apresentacao`; schema atual nao tem data operacional separada para confirmar outros casos.
- join incorreto: nao observado diretamente; a mistura `origem='FIRA'` e `registrado_por='SIGVOOS'` indica fluxo SIGVOOS reaproveitando importador FIRA.
- schema legado: relevante porque nao ha campo persistido de integridade; a classificacao precisa ser derivada em leitura/preview nesta fase.
- dado incompleto de origem: confirmado por horario ausente/incompleto.

Causa provavel: o pipeline SIGVOOS normaliza etapas por dia e converte preview para o fluxo FIRA. Quando faltam horarios ou quando o intervalo calculado e menor que a HV somada, o sistema persistia os minutos brutos e so a etapa de leitura anterior sinalizava parcialmente `HV_MAIOR_QUE_JORNADA`.

## Patch Implementado

- Novo helper central `worker-airtrust/src/lib/frms/integridade.ts`.
- Codigos estaveis:
  - `HV_MAIOR_QUE_JORNADA`
  - `JORNADA_ZERO_COM_HV`
  - `JORNADA_AUSENTE_COM_HV`
  - `HORARIO_INCOMPLETO_COM_HV`
- Fadiga acumulada agora retorna `integridade_status`, `integridade_codigo`, `integridade_codigos`, `integridade_mensagem`, `integridade_mensagens` e `valores_brutos`.
- A rota `/api/frms/fadiga-acumulada` deixou de aplicar `COALESCE` no SELECT de jornada/HV para preservar `null` na classificacao.
- Previews FIRA e SIGVOOS passam a marcar integridade por linha antes da confirmacao.
- A UI de Fadiga Acumulada mostra label claro para linha inconsistente e mantem o codigo/mensagem no tooltip.

## Testes Adicionados/Ajustados

- Unidade/helper em `fadiga-acumulada-legal.test.ts`:
  - jornada 0 + HV positiva;
  - jornada `null` + HV positiva;
  - horario incompleto + HV positiva;
  - HV > jornada positiva;
  - HV 0 + jornada 0 sem falso `HV_MAIOR_QUE_JORNADA`;
  - percentuais diario/mensal preservados.
- Contrato de rota em `frms-fadiga-acumulada-contract.test.ts`:
  - campos explicitos/legacy mantidos;
  - resposta diaria e resumo incluem integridade;
  - caso `jornada=0/HV>0` retorna codigo correto.
- Ingestao/preview em `sigvoos-frms.test.ts`:
  - preview normal segue `OK`;
  - preview SIGVOOS com HV sem jornada fica `INCONSISTENTE` e preserva valores brutos.

## Decisao Sobre Dados Historicos

Nenhum dado real foi alterado. As inconsistencias historicas continuam no D1 para auditoria operacional. A aplicacao passa a trata-las como inconsistentes em leitura/preview, sem transformar o valor bruto em dado valido.

## Auditoria de Riscos Semelhantes

- Corrigido nesta fase: FRMS/Fadiga Acumulada, preview FIRA/SIGVOOS e UI da tabela diaria.
- Risco real para fase futura: dashboard/operational snapshot ainda pode ter leituras FRMS agregadas que nao exibem subcodigo de integridade; `horas_voo_lancamentos` esta vazio hoje, mas precisara da mesma politica quando populado.
- Falso positivo: usos de `Math.min`, `Math.max`, `toFixed`, `COALESCE`, minutos/horas e percentuais em simuladores, qualificacoes, LMS, paginacao e componentes visuais sem relacao com FRMS/FIRA/SIGVOOS.

## Risco Operacional Remanescente

Ainda falta decidir uma politica operacional persistente para novas importacoes inconsistentes: permitir importacao com alerta, colocar em pendencia/quarentena, ou bloquear confirmacao. Essa decisao pode exigir migration para armazenar integridade de origem, e por isso nao foi feita nesta fase.
