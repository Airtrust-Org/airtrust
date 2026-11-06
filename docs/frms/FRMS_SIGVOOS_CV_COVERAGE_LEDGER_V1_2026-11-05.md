# FRMS — comprovação operacional de cobertura SIGVOOS/CV (AUD-005/025)

## Decisão e fronteiras de confiança
Esta correção é **fail-closed** e prospectiva. A ausência de voos no Controle de Voos ou no acumulado FRMS não demonstra ausência real de voos. Uma data só pode ser considerada coberta quando uma consulta externa completa do SIGVOOS, com escopo e credenciais comprovadamente abrangentes para o operador, tiver sua importação ao Controle de Voos concluída sem erro, registros inválidos, tripulantes não mapeados ou conflitos.

A configuração `FRMS_SIGVOOS_CV_COVERAGE_APPROVED_TENANTS` é uma allowlist de IDs de empresa separados por vírgula. Sem aprovação documentada do operador, **não configurar**. `all` e `*` são rejeitados. A flag CV de importação não equivale à aprovação da cobertura operacional. O código não seleciona apêndices RBAC 117 e não altera limites ou índices de fadiga.

## Fonte e persistência
O cron resiliente reutiliza a resposta única `syncSigvoosForFrms` → importação governada CV. Para cada dia operacional encerrado, grava projeção tenant-scoped em `integracoes_sigvoos_eventos` (migração 0387, já existente), tipo `FRMS_COVERAGE_DAY`, chave determinística `frms_coverage_day:<empresa>:<data>`. A gravação é idempotente e mantém contagens agregadas, sem dados pessoais. Estados: `CONSOLIDADO` ou `FALHOU`. Uma nova tentativa fracassada revoga a confirmação anterior no respectivo intervalo; zero voos só recebe `CONSOLIDADO` após consulta completa e importação CV aceita. Para dias com registros, a aceitação exige **readback tenant-scoped** de cada estágio CV (estado `PROCESSED`, voo/etapa/tripulante existentes e coerentes, sem conflito `ABERTO`). Contadores `REUSED` e `OK` da importação não bastam: uma repetição de `CONFLICT` ou `PENDING` não certifica cobertura.

A leitura da decisão canônica consulta datas com comprovação por empresa, exige versão/origem/estado e confere quatro janelas independentes: **mês civil, ano civil, 28 dias e 365 dias consecutivos**. Além disso, exige que `frms_acumulo_rolling.updated_at` seja igual ou posterior à verificação da fonte; caso contrário, os totais podem estar desatualizados e resultam `UNKNOWN`. Extrapolações já comprovadas continuam `VIOLATION` ainda que haja outras janelas incompletas.

## Restrições remanescentes
- **Não efetuar backfill histórico automático.** Dias anteriores sem atestação auditada permanecem `UNKNOWN`; a prova de 365 dias depende de reconciliação controlada de todo o período, incluindo correções/cancelamentos retroativos, fronteiras de data e integridade da fonte externa.
- A origem SIGVOOS não é considerada universalmente exaustiva apenas pela resposta HTTP; a abrangência de todas as aeronaves, pilotos e operações da empresa requer aceite operacional documentado. Divergências ou CV import desativado nunca produzem `CONSOLIDADO`.
- Uma nova fonte nativa CV fechada deverá ter contrato de atestação específico, não ser inferida desta integração externa.
- A aprovação regulatória de apêndice RBAC 117, art. 42, ACT, IOGP adicional e estudo científico do índice são tarefas independentes e permanecem condicionadas a evidências próprias.
- Não aplicar SQL ad hoc nem alterar D1 remoto fora dos workflows de release. Publicação somente após oito gates, homologação staging, release conjunto e autorização específica de produção.

## Aceite técnico
Vitest deve cobrir casos de zero voo confirmado, janela errada, falha, conflito, lacuna de tripulante, divergência entre fonte e CV, isolamento por empresa, retorno histórico sem proveniência, quatro janelas e frescor do rolling. O teste unitário não substitui ensaio de dados e API reais no staging, nem garante completude histórica.
