# AirTrust Restore Drill Runbook

Data: 2026-06-21
Escopo: staging/local apenas
Proibido neste runbook: restore real em producao, SQL remoto de escrita, migration, alteracao manual de D1/R2 produtivos.

## Gate de autorizacao

Qualquer pedido de excecao envolvendo producao fica fora deste runbook e exige autorizacao operacional explicita do responsavel tecnico antes de qualquer acao.

Sem essa autorizacao explicita:

- nao abrir janela de producao;
- nao executar restore;
- nao executar SQL remoto;
- nao tocar D1/R2 produtivos.

## Objetivo

Executar um drill seguro para responder se os artefatos de backup permitem restaurar e validar o AirTrust sem improviso.

## Pre-checks

1. Confirmar janela segura fora de producao.
2. Confirmar snapshot/backup alvo, checksum e origem do artefato.
3. Confirmar que o drill usa ambiente local ou staging controlado.
4. Confirmar que o operador nao precisa abrir secrets, dumps sensiveis ou credenciais em terminal compartilhado.
5. Confirmar que o rollback do proprio drill esta definido antes do inicio.

## Artefatos esperados

- Backup D1 identificado e com checksum verificado.
- Manifesto de backup R2 quando aplicavel.
- Evidencias locais existentes em `docs/d1-rollback-drill/`.
- Plano documental associado em `docs/controlled-execution/` quando o drill estiver ligado a uma janela controlada.

## Passos do drill

1. Rodar [scripts/audit-observability-dr-readiness.sh](../../scripts/audit-observability-dr-readiness.sh) para inventario read-only.
2. Verificar integridade do artefato D1 por checksum e leitura local.
3. Restaurar o artefato em SQLite local ou D1 local controlado, nunca em producao.
4. Validar integridade basica:
   - `PRAGMA integrity_check = ok`
   - presenca das tabelas criticas
   - contagens agregadas minimas das tabelas criticas
5. Validar a camada de aplicacao no ambiente restaurado:
   - `/api/health`
   - `/api/version`
   - smoke publico read-only
6. Registrar desvios sem expor PII.

## Pos-checks

1. `health` responde sem erro estrutural.
2. `version` responde e identifica ambiente correto.
3. Tabelas criticas estao presentes.
4. O drill nao introduziu migration, deploy ou escrita remota.
5. O ambiente temporario pode ser descartado sem impacto.

## GO / NO-GO

### GO

- checksum confere;
- restore local/staging conclui;
- integridade e contagens agregadas batem com o esperado;
- health/version passam;
- sem evidencias de perda de dados no escopo do drill.

### NO-GO

- checksum divergente;
- artefato incompleto;
- falha em `integrity_check`;
- tabela critica ausente;
- dependencia de SQL remoto de escrita;
- necessidade de tocar D1/R2 de producao;
- duvida sobre rollback do proprio drill.

## Comunicacao minima

- inicio do drill;
- artefato usado;
- resultado GO ou NO-GO;
- principais desvios;
- proxima acao recomendada.

## Observacoes importantes

- O `RestoreService` em [worker-airtrust/src/services/backup/restore.ts](../../worker-airtrust/src/services/backup/restore.ts) nao substitui este runbook operacional.
- O objetivo aqui e provar recuperabilidade em ambiente seguro, nao automatizar restore produtivo.
