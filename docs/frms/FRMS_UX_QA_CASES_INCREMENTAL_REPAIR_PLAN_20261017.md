# FRMS QA 999013 — inspeção e plano de reparo incremental (17/10/2026)

**Escopo:** exclusivamente os quatro casos fictícios do tenant QA `999013`. Autoridade: GitHub `main`, issues #1426 e #1476. Não é autorização para escrita.

## Causa e estado confirmado

A PR #1550 corrigiu o **gerador** de dados de QA, mas não a fixture já aplicada ao staging D1. Na carga antiga, os casos fictícios tinham `jornada_id=NULL` e viagens de origem `MANUAL`. A consulta canônica `buscarAlertas` exige jornada ativa vinculada e `origem=SIGVOOS`; logo o QA poderia parecer vazio. A PR #1554 passou a exigir quatro casos realmente visíveis em vez de aceitar lista vazia.

O workflow de aceite #39070133133 falhou antes de consultar Casos: o badge da fila de Operação ainda era verde apesar da PR #1549 ter tornado o sinal do drawer informativo; causa corrigida na PR #1555. **Não há preflight remoto concluído dos quatro casos nesta data.**

## Etapa 1 — preflight obrigatório, apenas leitura

Executar unicamente o novo workflow `staging-frms-ux-cases-preflight.yml` após merge, em `main`, passando os exatos `expected_main_sha`, `aggregate_run_id`, `source_aggregate_sha` e confirmação. Usa um único lock de staging, verifica a procedência do artefato sanitizado, UUID D1 e token de staging; lê apenas casos e jornadas sintéticos, sem nomes ou credenciais nos logs.

O script deriva as quatro datas e tripulantes fictícios do artefato revisado, verifica IDs, associação de mesma pessoa/data/tenant, fonte simulada `SIGVOOS`, marcador QA, situação aberta e a ausência de alerta FDP stale. Resultado `READONLY_ACCEPTANCE_READY` só vale com **4/4** vínculos válidos. Qualquer diferença retorna `GOVERNED_INCREMENTAL_REPAIR_REQUIRED`, preservando contagem e causas sem mutar D1.

## Etapa 2 — preparar reparo, sem executar nesta PR

Quando o preflight comprovar divergências, criar **PR de execução separada**, com conjunto preciso de `frms_alerta` e `frms_jornada` do tenant 999013 a modificar. Procedimento obrigatório:

1. Confirmar manutenção do tenant, identidade de login QA e 14 tripulantes fictícios. **Não executar** `buildRollbackSql` existente (inclui exclusão/desativação do tenant), nem `assertEmptyTenant`, nem `seed --apply`, nem recriar usuários.
2. Capturar preimagem e hash de cada linha a alterar (`qa-frms-ux-case-1..4`, jornadas do mesmo tripulante/data). Guardar preimagem em artefato protegido e de retenção curta; logs exibem só IDs sintéticos e contagens.
3. Verificar backup D1 Time Travel e bookmark, identidade do banco, inexistência de migração/deploy concorrente e invariantes tenant/RBAC. Congelar exatamente o SHA e o artefato de dados aprovados.
4. Aplicar **somente** atualizações condicionais das quatro referências de casos e, se necessário, da origem simulada das jornadas identificadas; exigir idempotência e condições de revisão (`UPDATE ... WHERE old_values ...`) com contagem exata. Não modificar fontes SIGVOOS reais, score FRMS ou checks-in.
5. Validar 4/4 casos, inexistência de alerta stale, mesmas identidades QA e ausência de alterações fora do conjunto QA; ter compensação **por linha** baseada na preimagem. Não restaurar todo D1 em staging concorrente sem coordenação.
6. Garantir autorização/allowlist de staging e workflow versionado governado para qualquer `UPDATE`, rollback ou reprocessamento. Este documento e o preflight **não autorizam** executar essas operações.

## Etapa 3 — aceite visual humano

Com Worker e Pages comprovadamente no mesmo SHA e casos válidos, repetir workflow read-only autenticado: Operação (check-in informativo e KSS/alertas), Casos (quatro linhas, motivos, datas, responsáveis e modal sem write), Administração/Relatórios (carregamento, explicações, filtros e fonte), Manutenção sob identidade autorizada e link real EVD→FRMS para dia e tripulante selecionados.

**Ciclo completo** (responsável → mitigação → prazo → acompanhamento → verificação de eficácia → encerramento) exige QA de **mutação separada** e governada, com novo caso sintético e prova de auditoria. Não inferir ciclo validado da mera abertura de modal.

**Ciência IMA V3** continua na issue #1476 (pesos, limites, calibração e governança FRMS/GAGEF). Indicadores shadow são apenas diagnósticos, não aptidão operacional.
