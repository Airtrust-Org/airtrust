# SIGVOOS -> Controle de Voos: Pre-Implementation Decision Report

Data: 2026-06-15

## 1. Estado pos-merge

PR #22 foi mergeado em `main`.

| Item | Valor |
|---|---|
| Merge commit esperado | `6495cd409583872bb58ae79c36c737441298a7f6` |
| `HEAD` local no momento deste relatorio | `6495cd409583872bb58ae79c36c737441298a7f6` |
| `origin/main` | `6495cd409583872bb58ae79c36c737441298a7f6` |
| `HEAD` contem o merge commit | Sim |
| Branch local usada para o relatorio | `main` |

Confirmacoes operacionais mantidas:

- Nenhum deploy foi executado nesta etapa.
- Nenhuma migration foi aplicada.
- Staging e producao nao foram tocados.
- Cloudflare, D1 remoto, R2 e secrets nao foram usados.
- `frms-source-policy.ts` nao foi alterado.
- FRMS canonico nao foi alterado nesta etapa.

## 2. Documentos revisados

Foram revisados os documentos ja versionados:

- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`
- `docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md`

Leitura consolidada:

- O Controle de Voos N1 ja possui base operacional manual, mas nao possui ponte SIGVOOS -> CV nem CV -> FRMS.
- O pipeline atual SIGVOOS -> FRMS continua separado e nao deve ser desligado nesta fase.
- A 0411 e uma mudanca de schema proposta para preparar granularidade por etapa, staging raw sanitizado, rastreabilidade, idempotencia e conflitos.
- O design da 0411 ainda tem gates tecnicos pendentes antes de execucao nao-local.

## 3. Veredito

**Veredito: GO PARA DESIGN 0411.**

Isto significa:

- Pode-se avancar para fechar o desenho tecnico executavel da 0411 e seus testes.
- A 0411 **nao deve ser aplicada agora** em staging ou producao.
- A 0411 **nao deve ser criada/aplicada nesta etapa**.
- O proximo passo e transformar a decisao em um escopo tecnico fechado de migration e teste, ainda sem deploy e sem mudanca no FRMS canonico.

## 4. A 0411 deve ser implementada agora?

**Ainda nao como migration aplicada.**

A implementacao so deve comecar depois de uma decisao explicita separada para a 0411. Mesmo nessa decisao futura, a primeira execucao deve ser local, com D1 local e fixtures sanitizadas.

Bloqueios para aplicar agora:

- `flight_report.id` pode estar ausente em payload real; o teste T1 de janela de 7 dias ainda precisa confirmar prevalencia.
- Timezone dos horarios SIGVOOS ainda nao esta confirmado.
- `staff.canac` nao existe nos payloads reais revisados; resolucao de tripulante depende de `staff.id`, `staff.inscription` e fallback controlado.
- Piloto tecnico N1/manual precisa informar se a modelagem de etapas cobre os campos operacionais reais.
- Testes de migration, isolamento tenant, idempotencia, fallback sem ID, hash e retrocompatibilidade ainda precisam existir antes de qualquer execucao nao-local.

## 5. Tabelas e campos minimos

Escopo minimo para a futura 0411:

| Entidade | Decisao minima |
|---|---|
| `cv_voo_etapas` | Entra como nova tabela para granularidade por `flight_report_leg`. |
| `cv_voos` | Recebe rastreabilidade SIGVOOS nullable e flags de confianca/hash. |
| `cv_voo_tripulantes` | Recebe `etapa_id` nullable, `sigvoos_staff_id`, `sigvoos_staff_inscription`, origem da funcao e hash. |
| `cv_sigvoos_staging` | Entra para staging raw sanitizado, hash, status e janela de sync. |
| `cv_conflitos_integracao` | Entra para registrar divergencias entre dado AirTrust e novo dado SIGVOOS. |

Campos minimos em `cv_voos`:

- `sigvoos_flight_report_id INTEGER NULL`
- `sigvoos_flight_report_id_confident INTEGER NOT NULL DEFAULT 0`
- `sigvoos_report_number TEXT NULL`
- `sigvoos_flight_number TEXT NULL`
- `sigvoos_importado_em TEXT NULL`
- `sigvoos_content_hash TEXT NULL`
- `origem_importacao TEXT NOT NULL DEFAULT 'MANUAL'`
- `campos_editados_json TEXT NULL`

Campos minimos em `cv_voo_tripulantes`:

- `etapa_id INTEGER NULL`
- `sigvoos_staff_id INTEGER NULL`
- `sigvoos_staff_inscription TEXT NULL`
- `funcao_origem TEXT NULL`
- `resolucao_funcionario_fonte TEXT NULL`
- `sigvoos_content_hash TEXT NULL`

Campos minimos em `cv_sigvoos_staging`:

- `id TEXT PRIMARY KEY`
- `empresa_id INTEGER NOT NULL`
- `sigvoos_flight_report_id INTEGER NULL`
- `sigvoos_leg_number INTEGER NULL`
- `sigvoos_staff_id INTEGER NULL`
- `data_operacional TEXT NOT NULL`
- `source_window_start TEXT NOT NULL`
- `source_window_end TEXT NOT NULL`
- `payload_hash TEXT NOT NULL`
- `payload_sanitizado_json TEXT`
- `import_status TEXT NOT NULL DEFAULT 'PENDING'`
- referencias opcionais para `cv_voo_id`, `cv_etapa_id`, `cv_tripulante_id`
- `tentativas`, `erro_msg`, `processado_em`, timestamps e `deleted_at`

## 6. `cv_voo_etapas` entra agora?

**Entra no design da 0411. Nao entra como migration aplicada nesta etapa.**

Racional:

- O SIGVOOS entrega dados na granularidade de etapa/perna.
- O CV N1 atual e plano demais para preservar todos os dados de etapa.
- O futuro adaptador CV -> FRMS precisara somar tempos por etapa e tripulante.
- `cv_voo_tripulantes.etapa_id` deve ser nullable para preservar retrocompatibilidade com voos manuais N1.

## 7. `sigvoos_flight_report_id` deve ser nullable?

**Sim. Deve ser nullable sem excecao nesta fase.**

Motivo:

- Ha evidencia de payload real sem o objeto `flight_report`.
- Tornar `sigvoos_flight_report_id` `NOT NULL` agora criaria risco de falha de importacao.
- A presenca em 100% dos registros so deve ser assumida depois de teste empirico de janela real.

Decisao consequente:

- `cv_voos.sigvoos_flight_report_id`: nullable.
- `cv_voo_etapas.sigvoos_leg_number`: nullable.
- `cv_sigvoos_staging.sigvoos_flight_report_id`: nullable.
- `cv_sigvoos_staging.sigvoos_leg_number`: nullable.

## 8. Indice unico parcial

**Sim, deve ser usado.**

Indice minimo em `cv_voos`:

```sql
CREATE UNIQUE INDEX idx_cv_voos_empresa_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;
```

Racional:

- Garante unicidade quando `flight_report.id` existe.
- Nao bloqueia voos manuais nem registros importados sem ID.
- Mantem idempotencia forte separada de fallback fraco.

Indices parciais adicionais esperados:

- `cv_voo_etapas (empresa_id, voo_id, sigvoos_leg_number)` quando `sigvoos_leg_number IS NOT NULL`.
- `cv_voo_tripulantes (empresa_id, etapa_id, sigvoos_staff_id)` quando ambos existem.

## 9. Idempotencia por `(flight_report.id, flight_report_leg.number)`

Quando `flight_report.id` e `flight_report_leg.number` existirem:

- `cv_voos` deve deduplicar por `(empresa_id, sigvoos_flight_report_id)`.
- `cv_voo_etapas` deve deduplicar por `(empresa_id, voo_id, sigvoos_leg_number)`.
- `cv_voo_tripulantes` deve deduplicar por `(empresa_id, etapa_id, sigvoos_staff_id)`.

Quando `flight_report.id` vier ausente:

- Nao abortar automaticamente.
- Calcular fallback key deterministica com campos normalizados.
- Armazenar fallback em `cv_sigvoos_staging.payload_hash`.
- Marcar `sigvoos_flight_report_id_confident = 0`.
- Registrar evento interno informando ausencia de ID e uso de fallback.
- Se nem fallback puder ser calculado, marcar staging como `ERROR` ou `CONFLICT`, com erro sanitizado.

Fallback minimo:

```text
empresa_id
+ data_operacional
+ aircraft_registration, se existir
+ engine_start_time_str
+ departure_location.icao_code
```

O fallback nao deve virar decisao silenciosa definitiva. Ele e mecanismo de continuidade controlada ate o contrato de IDs ficar claro.

## 10. `staff.id`, `staff.inscription` e ausencia de CANAC

Decisao:

- Nao depender de CANAC.
- `staff.canac` e `staff.codigo_anac` nao devem ser usados como chave primaria porque nao aparecem nos payloads reais revisados.
- Resolver tripulante por cascata controlada.

Cascata proposta:

1. `sigvoos_staff_id`, quando houver mapeamento interno confiavel.
2. `staff.inscription` normalizado para matricula local.
3. Fuzzy match por nome apenas como fallback de baixa confianca.
4. Mapeamento manual.

Normalizacao obrigatoria:

```text
String(staff.inscription ?? '')
  -> remover nao digitos
  -> padStart(5, '0')
```

Exemplo: `252` vira `00252`.

Se nao houver mapeamento:

- Nao criar `cv_voo_tripulantes` sem `funcionario_id` valido.
- Registrar staging como `CONFLICT`.
- Registrar evento interno do tipo sistema.
- Expor pendencia para resolucao operacional futura.

## 11. Dados que precisam ficar em staging raw antes do mapeamento

O staging deve preservar o payload original sanitizado antes de qualquer normalizacao destrutiva.

Devem ficar no staging:

- Identificadores SIGVOOS recebidos: `flight_report.id`, `flight_report.report_number`, `flight_report.flight_number`, `flight_report_leg.number`, `staff.id`.
- Dados de tripulante recebidos: `staff.inscription` bruto, nome sanitizado/tokenizado se armazenado.
- Datas e janela de sync: `data_operacional`, `source_window_start`, `source_window_end`.
- Origem/destino de etapa: `departure_location.icao_code`, `arrival_location.icao_code`.
- Horarios brutos: motor ligado, decolagem, pouso, motor desligado.
- Tempos brutos: navegacao, total, IFR, noturno.
- Contadores fisicos: pousos, starts, pax.
- Combustivel e carga, com unidade marcada como nao confirmada quando aplicavel.
- Hash do payload e status de processamento.
- Erros sanitizados e referencias internas criadas.

Nao armazenar tokens, secrets ou credenciais. Payload bruto sem sanitizacao deve existir apenas em memoria durante processamento.

## 12. Riscos que impedem implementacao imediata

Riscos bloqueantes para aplicar 0411 agora:

- Falta de aceite explicito para criar/aplicar a migration 0411.
- `flight_report.id` ausente ou inconsistente em amostras reais.
- Ausencia de confirmacao sobre estabilidade de `flight_report_leg.number`.
- Timezone de horarios SIGVOOS nao confirmado.
- `staff.inscription` pode vir como integer e precisa de normalizacao testada contra dados locais.
- CANAC nao pode ser premissa de resolucao.
- Sem testes implementados para migration, tenant isolation, idempotencia, fallback, hash e retrocompatibilidade.
- Rollback de colunas em SQLite/D1 e limitado; rollback completo pode exigir recriacao de tabela.
- O piloto tecnico N1/manual ainda pode revelar campos operacionais que mudem o desenho.

## 13. Ambiente para piloto tecnico

Ambiente recomendado agora:

1. Repositorio local em `main`.
2. D1 local apenas quando uma etapa futura autorizar a migration.
3. Fixtures sanitizadas para testes de schema e importador.
4. Se for necessario consultar SIGVOOS, usar ambiente controlado de leitura, janela curta e sem gravacao em AirTrust remoto.

Nao usar nesta fase:

- Producao.
- Staging.
- D1 remoto.
- Cloudflare deploy.
- R2.
- Secrets.
- `workflow_dispatch`.

## 14. Rollback

Rollback antes de aplicar migration:

- Nenhum rollback de banco necessario; a decisao atual e documental.
- Descartar ou revisar o design da 0411 antes de qualquer execucao.

Rollback de uma futura 0411 local:

- `DROP TABLE cv_voo_etapas`.
- `DROP TABLE cv_sigvoos_staging`.
- `DROP TABLE cv_conflitos_integracao`.
- `DROP INDEX` dos indices novos.
- Para colunas adicionadas em tabelas existentes, aceitar residuo em local ou recriar tabela em ambiente descartavel.

Rollback de fases futuras de importador/adaptador:

- Desligar feature flag ou endpoint do importador.
- Limpar dados importados marcados com `origem_importacao = 'SIGVOOS'` apenas em ambiente de teste.
- Manter o caminho atual SIGVOOS -> FRMS intacto ate fim de shadow mode futuro.

## 15. Proximo passo recomendado

Sequencia recomendada:

1. Fechar formalmente o design executavel da 0411.
2. Listar os testes obrigatorios como contrato da futura PR.
3. Preparar, em etapa separada, a migration 0411 e testes locais.
4. Executar apenas localmente ate haver nova decisao explicita.
5. So depois tratar importador SIGVOOS -> CV.
6. Nao alterar FRMS canonico nem `frms-source-policy.ts` nesta frente.

## 16. Fronteiras explicitas

Este relatorio nao:

- Implementa 0411.
- Cria migration.
- Altera codigo.
- Altera FRMS.
- Substitui SIGVOOS, APUS, Diario de Bordo, eDB, SDRMe ou papel.
- Declara qualquer status regulatorio.
- Autoriza deploy, migration, staging ou producao.
