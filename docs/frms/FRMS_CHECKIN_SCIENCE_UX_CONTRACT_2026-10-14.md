# FRMS AirTrust — contrato verificável de coleta, cálculo e UX (14/10/2026)

**Status:** revisão funcional/científica para PR #1453. **Não é uma homologação científica do score AirTrust, não altera políticas nem autoriza deploy.** Base da comparação: main `1b3f70daca192baed0e77d3dd16c4782268d80cf`; PR #1453 em revisão. Referências: RBAC 117 EMD 01 (ANAC), IS 117-001C (ANAC, 16/07/2026), IOGP 690-2, seção 17, literatura KSS/PVT citada abaixo. Os valores/coeficientes AirTrust são internos, configurados por revisão de política, **não pesos ANAC/IOGP**.

## Filosofia e critério de aceitação
- Perguntar apenas o que o AirTrust não obtém por fonte confiável e o que altera efetivamente **avaliação de risco, indicador de recuperação ou uma decisão formal de segurança**.
- Dado solicitado **sem consumidor verificável**: eliminar a pergunta; fonte já confiável: autopreencher, solicitar intervenção somente em divergência.
- Dado ausente: marcar `NÃO INFORMADO`/`DADO INSUFICIENTE`, sem inferir normalidade ou zero; preservar evidência/tenant/revisão.
- **PVT-B AirTrust diário 60 s obrigatório**, conforme decisão do gerente, com baseline individual e procedimento para falha técnica. O PVT não é decisão isolada de aptidão.
- Nunca misturar *repouso entre jornadas* (normativo), *oportunidade de sono* (condições para dormir) e *sono efetivamente obtido* (relato fisiológico). A origem deve aparecer na explicação.
- A consulta gerencial responde, nesta ordem: **quem precisa de ação → por quê → evidência e confiança → medida, responsável e acompanhamento**, com drill-down técnico opcional.

## Rastreabilidade atual: pergunta → consumidor → decisão → evidência científica

| Resposta/evento | Consumidor real no código | Decisão atual e adequação | Conduta UX |
|---|---|---|---|
| **Sono efetivo 24 h** | `fadiga-score.ts` (duração); `readiness.ts` (sinal); `fortnight-indicator.ts` (padrão de pouco sono); `calculos.ts` / FRMS-sync (despertar/sono) e `recovery-model.ts` | Indica débito de sono; autodeclaração, não medição. Normas e ciência apoiam o conceito, **não validam os coeficientes exatos**. | Manter uma entrada curta; preservar `horas_sono` como sono real, não repouso. |
| **Qualidade do sono (1–5)** | `fadiga-score.ts` (qualidade normalizada); painel do check-in | Pertinente como autodeclaração, mas discretização 1–5 e peso interno carecem de validação empírica AirTrust. | Manter enquanto o peso governa decisões; mostrar significado apenas no detalhe. |
| **KSS (1–9)** | `fadiga-score.ts`, `readiness.ts`, `fortnight-indicator.ts`, alertas | Escala subjetiva com respaldo operacional; **não é objetiva** nem substitui PVT. | Manter KSS completo, descritores claros e escolha compacta. |
| **PVT-B AirTrust 60 s** | `readiness.ts`, `readiness-persistence.ts`, baseline e revisão operacional | Produz tempos de reação/lapses para prontidão; a literatura apoia PVT, **não confirma equivalência psicométrica do protocolo AirTrust de 60 s ao PVT validado de 3 ou 10 min**. | Manter diário, 60 s, sem repetir ou solicitar input manual; coletar dados de validação local e anomalias. |
| **Hora em que acordou** | `calculos.ts` (janela circadiana, sono e estimativas); `frms-fadiga-checkin-readiness-sync.ts` | Relevante a estado circadiano e confiabilidade, mas não converter hora estimada em observada. | Manter apenas se não existir fonte realmente confiável; digitação curta e restaurar rascunho. |
| **Hora de apresentação** | `frms-fadiga-checkin-legacy.ts` e sincronização de jornada/projeções | Referência operacional e potencial janela circadiana; não é percepção subjetiva. | **Autopreencher da escala/Controle de Voos quando fonte confirmada**, confirmar somente se divergente/ausente. Hoje ainda é manual: pendência estrutural. |
| **Condição declarada para iniciar jornada** | `fadiga-score.ts` (eleva para revisão), `frms-fadiga-checkin-legacy.ts` e revisão FRAT | Decisão de segurança adicional ao score, não indicador fisiológico. | Manter; motivo apenas se não apto/solicita Coordenação. **Não automatizar liberação** por um número favorável. |
| **Medicação sedativa / álcool (opcionais)** | `fadiga-score.ts` (acréscimo configurado só em `sim`) | **Risco de semântica:** `NULL` opcional atualmente cai em `0` no legado D1 ao persistir, não preservando ausência da declaração. Pesos não são prescritos pela ANAC/IOGP; dados sensíveis. | Não aumentar formulário; manter eventual canal adequado de autodeclaração e tratamento seguro; **não interpretar silêncio como “não”**. Corrigir contrato/persistência sob governança própria. |
| **Nota/motivo** | revisão humana, auditoria, `motivo_inaptidao` | Não faz parte do cálculo numérico; justifica decisão de segurança. | Somente condicional, se requer revisão, ou livre opcional explicitamente útil. |
| **Oportunidade de sono (repouso absoluto)** | **apenas** `computeRecoveryCredit` via `frms-recovery.ts`, para standby com demais requisitos de elegibilidade; não alimenta score de fadiga diária | ANAC distingue oportunidade e sono efetivo. **Oportunidade não equivale a sono**, nem substitui exame de vigília. Ausência não concede crédito. | **Perguntar opcionalmente somente quando atividade anterior for standby relevante**, em campo colapsado; nunca para voo normal; mudança em PR #1453. |
| **Declaração de veracidade e privacidade** | aceite/aprovação procedimental, não score | Há finalidade de rastreabilidade e tratamento de dados; não é dado de fadiga. | Não retirar sem revisão jurídica; apresentação curta, uma vez quando permitido, sem encher a área de decisão. |
| **Atividade de ontem sem voo** | `RecoveryActivityCard`, `frms-recovery.ts`, `recovery-model.ts` | Alimenta carga, no-work hours e recuperação; risco de interpretação de `sem voo` como `descanso`. | Perguntar **só se fontes operacionais não comprovam voo e classificação ainda falta**; tratar fonte indisponível como desconhecida, não `sem voo`. |

**Campo redundante calculado (não perguntar):** `subjective_fatigue_level` e `sleepiness_level` são derivados de KSS por `mapKssToSubjectiveFatigue`; participam de `evaluateDailyRisk`. A transformação KSS→escala 0–10 e seus gatilhos devem ser submetidos a testes de equivalência e revisão de falsos críticos, **não ganhar pergunta adicional**.

## Lacunas de validação científica que impedem reformular pesos sem análise
1. `fadiga-score.ts` continua com `peso_sintomas`, mas o formulário atual **não solicita sintomas** e o motor converte ausência de sintomas em fator 0. Pode reduzir score na prática. Não alterar pesos silenciosamente: criar versão governada, validação retrospectiva por tenant e avaliação de sensibilidade com histórico e cenários sintéticos, inclusive impacto em falso-negativos, múltiplos alertas e risco de dupla contagem.
2. `meds_ult_12h` e `alcool_ult_12h` tratados como opcionais na UI, porém `null` pode ser gravado como 0 por colunas legadas. Precisam persistência `DESCONHECIDO` inequívoca e acesso de menor privilégio antes de contar como `não`.
3. O PVT-B de **60 s é uma adaptação AirTrust**. Os valores publicados para PVT de 3–10 min não equivalem a validação automática do protocolo de 60 s. Guardar versão, baseline, taxa de respostas e dados de confiabilidade, sem liberar tripulante por PVT isolado.
4. `computeLandingsDeltaPoints`, `computeTemperatureDeltaPoints` e IMC são **políticas internas parametrizadas**, não fórmulas IOGP; verificar calibração, origem, data e cobertura SIGVOOS/REDEMET (METAR aeroportuário não comprova temperatura real no helideck).
5. `score_acumulado` combina carga, fatores repetidos, ausência e tendência; não é a média diária nem diagnóstico médico. Deve permanecer distinto da conformidade RBAC/Lei/CCT e da decisão individual imediata.
6. A adequação regulatória deve discriminar operação e apêndice efetivamente aplicável do RBAC 117. **Não** converter recomendação de IOGP em norma legal brasileira nem mostrar coeficiente interno como obrigação do regulador.

## Critérios UX reaproveitados das auditorias já realizadas (não reiniciar)
**Fonte:** issue #1426 (13/10/2026), auditoria de Coordenação de produção e `docs/FRMS_OPERATIONAL_CONTROL_UX_AUDIT.md`; PRs #1423 e #1444–#1452 já contemplaram correções importantes.

- **Operação / Gestão:** primeiro as pessoas na quinzena ativa, pendências diárias **mesmo sem voo**, alertas reais, fonte ausente/estimada, inconsistência, responsáveis e ação. Proibir “normal/prontidão preservada” quando decisão não confirmável ou fonte pendente. Não misturar efetividade estimada com PVT ou com legalidade.
- **Hierarquia:** mostrar no topo **situação → causa principal → ação**. Detalhe técnico mostra fator, valor, unidade, sentido (score maior = risco pior, efetividade maior = melhor), proveniência, hora, revisão, limitações e janela; sem métricas decorativas.
- **Casos:** total global/filtrado correto (não total da página), recorrência por tripulante e contexto entre páginas, responsável, tratamento, histórico e desfecho, sem dados pessoais desnecessários.
- **Manutenção:** prontidão PVT/sono/check-in por turno/tarefa, horário da última coleta e ação atribuída, distinguindo dado não obtido de resultado normal.
- **Relatórios:** leitura visual autenticada final pendente; medir se exportações/gráficos permitem identificar risco, ação, responsável e evolução temporal sem obrigar a aprender nomes de parâmetros.
- **SIGVOOS / IOGP:** pousos reais e temperatura/IMC como fonte operacional automática, não perguntar ao tripulante. Falta evidência: `INCOMPLETE` / `UNKNOWN`, jamais 0 observado. Expor sincronização e impacto da lacuna por pessoa.
- **Validação 30 dias:** aceite autenticado do tenant sintético `999013` permanece bloqueado por credencial sem autorização. Não ampliar RBAC/tenant por SQL nem mostrar aprovação visual inexistente.
- **Ações humanas:** leitura de alerta não constitui mitigação/FRAT. Sinal → evidência → mitigação/decisão autorizada → acompanhamento → trilha de auditoria, sem liberar pela cor verde de um cartão.

## Testes de aceitação que exigiremos
1. Sem standby relevante: **nenhuma pergunta de oportunidade de sono na tela** e nenhum envio do campo; PVT diário presente e obrigatório.
2. Standby relevante e classificado: opcional de oportunidade acessível; 8h oportunidade / 5h sono são independentes; crédito só se política, período sem trabalho e prontidão/atividades correspondentes realmente permitirem. Ausente = sem crédito inferido.
3. Em KSS alto/PVT crítico/declaração inapto: não exibir “normal” ou autorização de voo por outro indicador; revisão humana claramente atribuída.
4. Dados ausentes/atrasados: fonte exibida, nenhuma falsa normalidade, quinzena incompleta explícita, nenhuma contagem total derivada da paginação.
5. História de 30 dias (tenant sintético autorizado): prioridade, recorrência, efeito de recuperação, múltiplos pousos, temperatura, IMC e reconstrução da explicação com versão de política; testado por papel Coordenação sem writes de produção.
6. Nenhum ajuste de coeficiente/threshold/score histórico sem versão, fundamentação, comparação e governança.

## Referências verificáveis
- ANAC RBAC 117, EMD 01: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac
- ANAC IS 117-001C (16/07/2026): https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2026/bps-v-21-no-28-13-a-17-07-2026/is-117-001c/visualizar_ato_normativo
- IOGP Report 690 / 690-2 `17C.1`: https://idms.iogp.org/Documents/862
- Karolinska Sleepiness Scale in short-haul pilots (2026): https://doi.org/10.1016/j.jairtraman.2026.102982
- Reliability/validity of **3-minute** PVT (2021): https://pubmed.ncbi.nlm.nih.gov/34137863/
- FAA field validation of longer PVT work/rest and SAFTE: https://www.faa.gov/data_research/research/med_humanfacs/oamtechreports/2010s/2012/201212

**Governança:** PR #1453 permanece draft; nova coluna Schema V2 0552 exige fluxo governado e validação em staging antes de merge/deploy de Worker+Pages. Produção não está autorizada. A auditoria do código não substitui aceite visual humano.
