# FRMS V3 — Adaptador seguro de evidências do snapshot (15/10/2026)

**Situação:** código puro e testes; não há nova rota, leitura real de banco, armazenamento, flag, migração ou mudança visual nesta etapa. Ref.: issue #1476, fases integradas #1477, #1478 e #1480.

## Contrato e origem real

O snapshot canônico `worker-airtrust/src/lib/frms/operational-snapshot.ts` reúne registros por empresa, tripulante e dia. A montagem atual do snapshot aplica RBAC e tenant na rota `routes/frms-operational-snapshot.ts`, **mas a função pura nova não é um mecanismo de autorização**. O consumidor futuro precisa manter essas duas verificações **antes** de qualquer leitura.

`ima-v3-operational-snapshot-bridge.ts` recebe itens já autorizados para **uma empresa e um único tripulante**, exige `empresa_id` e `funcionario_id` exatamente iguais ao escopo informado pelo backend e rejeita duplicidades por dia. Dados de identidade não são incluídos na saída: somente contagens, duração, cobertura e motivos de lacuna.

### Detalhe importante confirmado no código legado

`preferred-operational-source.ts` calcula frequentemente `hora_apresentacao` como **primeiro acionamento − 30 minutos** e `hora_termino` como **último corte + 30 minutos**, fazendo fallback para SIGVOOS em certos casos. Assim, a origem `CONTROLE_VOOS`/`SIGVOOS` prova a existência do evento operacional, **não necessariamente os limites exatos da jornada observados pessoalmente**.

Por isso, o bridge atual marca essas **janelas temporais** como `ESTIMATED`, contabilizando separadamente `reconstructedOperationalRows`. `mappedActualRows` continuará zero no snapshot atual até existir fonte de apresentação/dispensa com proveniência independente e testada. Um evento `EVD` sem jornada concluída permanece `PLANNED`; período sem documentação continua **lacuna**, não folga e muito menos sono. Em caso de sobreposição, o motor rejeita todo o cenário, sem contar duas vezes.

### Check-in e sono

O snapshot fornece duração autodeclarada, despertar, KSS e status do check-in, mas não certifica um episódio sono-vigília com duas bordas verificadas. O bridge reutiliza `auditImaDailyEvidence` para calcular cobertura agregada, passando sempre `observedSleepStartAt = null`, `observedSleepEndAt = null` e `sleepEpisodeProvenance = UNKNOWN`. Um check-in pendente não entra como sono/KSS observado. A falta de histórico longitudinal não vira score 100, prontidão ou conclusão de aptidão.

### Saída

O resultado traz `exposure` (horas `ACTUAL`/`PLANNED`/`ESTIMATED`, faixa noturna ilustrativa, lacunas), `dailyEvidence` (cobertura de sono informado, despertar, KSS e dados insuficientes), contagens de jornadas reconstruídas e de linhas excluídas, e invariantes `operationalDecision = NOT_ASSESSED` e `modelValidation = NOT_VALIDATED`.

Nenhuma métrica de exposição equivale a risco fisiológico, avaliação PVT, limite ANAC ou autorização de despacho. Um horário local de offset fixo é **referência de pesquisa**, não solução de fuso/horário de verão.

## Critério para a próxima fase (ainda não feito)

1. **Fonte temporal e perfil:** reconciliar apresentação/dispensa observadas versus janelas inferidas, reservar códigos distintos para sobreaviso, reserva e jornada; testar equivalência entre CV, SIGVOOS e EVD. Não resolver `RE/SA` por palpite.
2. **Chamada autenticada no backend:** somente após fechar política de horário/fuso e comprovar `empresa_id`/RBAC por teste de rota, adicionar executor read-only limitado em janela e volume e preferencialmente sem identificação individual exportada.
3. **Qualidade histórica:** medir cobertura real em 60–90 dias **somente se autorizado e disponível**, e produzir agregados com proteção de privacidade para coortes pequenas. Nunca converter estimativa em horário observado ou preencher sono a partir de duração.
4. **Calibração FRMS/GAGEF:** manter IMA numérico sintético até conclusão da validação prospectiva, interpretação humana e critérios de aceitação. Só então planejar UI em staging e possível autorização específica de produção.
