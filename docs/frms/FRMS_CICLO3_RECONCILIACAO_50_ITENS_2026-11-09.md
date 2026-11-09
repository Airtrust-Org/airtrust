# FRMS — Reconciliação dos 50 itens do ciclo 3 contra o estado vivo (2026-11-09)

Base: `origin/main` = `53644f8f6431e34585e708027e8e767020b71fd5`. Produção Worker/Pages = `1bd48d1c88bc9d88570ecb3a098a912e1175a0b6` (deploy #42585083642).

## 1. O que foi verificado nesta execução (fatos)

- Suíte `worker-airtrust/src/__tests__/frms` em `53644f8f6`: **118 arquivos / 1085 testes, todos PASS** (execução local nesta data).
- CI da `main` em `53644f8f6`: CI fast #42613994095 e CI heavy #42613994090, ambos SUCCESS.
- Delta produção→main (`1bd48d1c8..53644f8f6`): **2 commits, 2 arquivos** (`preferred-operational-source.ts` + teste): #2122 (fallback CV/SIGVOOS em erro síncrono) e #2124 (igualdade de tenant nas jornadas SIGVOOS de fallback). **Integrados, ainda NÃO publicados.** Sem schema, sem LMS, sem migration.
- P08 e P36 executados com sucesso e read-only (runs #42560410082 e #42560412779). Não repetir sem autorização nova.

## 2. Correções ao relatório do ciclo 3

O relatório `AIRTRUST_FRMS_CICLO3_RELATORIO_COMPROVACOES.md` **não deve ser usado como fonte** sem esta correção:
1. SHAs desatualizados (cita main `c86619fa` e produção `a02e8326`; realidade acima).
2. O Markdown e o JSON divergem em 7 itens (P01, P09, P30, P33, P37, P38, P39). O JSON cita arquivos reais e é a base usada aqui; todos os arquivos citados foram conferidos no repositório (3 nomes imprecisos: `preferred-operational-source.ts`, `frms-f0b-new-cases.test.mjs`, `case-treatment-lifecycle.test.ts`).
3. O Markdown cita artefatos que não existem no repositório (ex.: “Nota técnica jurídica FRMS-LEG-01”, “protocolo de teste breve (3 minutos)” — o protocolo implementado é 60 s) e descrições genéricas (P46 “D1 encryption at rest”, P47 “retenção 5 anos”) sem prova de código. Essas linhas **não** contam como evidência.
4. PR #2103 consta como “OPEN” no relatório; está MERGED.
5. Os itens P08 e P36 constam como “AGUARDA_RELEASE_AUTORIZADO”; já foram executados.

## 3. Estado por item (JSON do ciclo 3 + correções verificadas)

“Estado” aqui é a classificação do ciclo 3 corrigida onde há prova contrária. Código/testes dos itens `JA_RESOLVIDO_COMPROVADO` estão na `main` e passam na suíte acima; a publicação em produção cobre tudo exceto #2122/#2124.

| Item | Estado | Evidência primária (ciclo 3) | Observação |
|---|---|---|---|
| P01 | `PENDENTE_VALIDACAO_AUTENTICADA` | curl -i https://api.airtrust.online/api/version (HTTP 200, sourceSha a02e8326...); curl -i /api/me/operational-access (HTTP 401) | O ciclo 3 divergiu (JSON: bloqueado; MD: resolvido). Evidência real é só HTTP 200/401 sem token. Falta QA autenticada com tenant sintético em staging; depende de fixture/grant (ver §4). |
| P02 | `JA_RESOLVIDO_COMPROVADO` | PR #2103 (commit d8798c0d3, 3/3 tests PASS, typecheck PASS), operational-snapshot-readiness.test.ts, frms-operational-decision.test.ts | Fluxo integrado das 5 fases consecutivas testado e comprovado com 100% de sucesso sem falsos normais. |
| P03 | `JA_RESOLVIDO_COMPROVADO` | PR #2067 (merged 0b4e6abb), frms-daily-fatigue-fortnight-roster.test.ts, fadigaAcumuladaVisual.test.ts | Comportamento preservado e sem regressao nos 8 gates oficiais. |
| P04 | `JA_RESOLVIDO_COMPROVADO` | frms-d1-error-classification.test.mjs (27 tests PASS), frms-guards-fail-closed.test.ts | D1 indisponivel gera UNKNOWN/erro seguro, nunca normalidade inferida. |
| P05 | `JA_RESOLVIDO_COMPROVADO` | PR #2074 (merged e34ab6de), useOperationalAccess.ts, staging QA #42529658194 | Mitigacao bounded fail-closed integrada e incidente diagnosticado sem necessidade de mudanca em transporte HTTP. |
| P06 | `IMPLEMENTADO_AGUARDA_QA` | Run #42032889232 (staging-frms-maintenance-readonly PASS), maintenance-management-access.test.ts (4 tests PASS), frmsMaintenanceDecision.test.ts (9 tests PASS) | Homologado em browser QA historico; revalidacao no runtime atual a02e832 aguarda janela governada de staging sem delta de qualificacoes. |
| P07 | `JA_RESOLVIDO_COMPROVADO` | frms-access.test.ts, frms-tenant-scope-guard.test.ts, frms-fadiga-checkin-dynamic-permissions.contract.test.ts | Bloqueio fail-closed em tentativas cross-tenant demonstrado em testes adversariais. |
| P08 | `EXECUTADO_READONLY_SUCCESS` | scripts/production/frms-cv-20261027-readonly-checkin.mjs, scripts/__tests__/frms-cv-20261027-readonly-checkin.test.mjs, workflow frms-cv-20261027-readonly-check | Run #42560410082 SUCCESS no SHA 2ed22cb37 (autorização consumida). Diagnóstico: 2 voos/2 pessoas, 1 recebido/1 pendente (SIC). Causa do SIC NÃO provada; esta PR adiciona o discriminador created_at→dia BRT para a próxima leitura autorizada. |
| P09 | `BLOQUEADO_DECISAO_EXTERNA` | ops/production/frms-historical-reprocess.mjs, frms-historical-reprocess-workflow.test.ts, frms-historical-reprocess.yml | Alteracao retroativa em massa no D1 de producao exige deliberacao e autorizacao formal do comite de seguranca operacional. |
| P10 | `JA_RESOLVIDO_COMPROVADO` | PR #2053, PR #2067, frmsDailyMonitorRisk.test.ts, FrmsFadigaPainel.refresh.test.tsx | Fila de coordenacao e roster atualizados sem discrepancias visuais. |
| P11 | `JA_RESOLVIDO_COMPROVADO` | npm run guard:frms-no-direct-sigvoos (103 arquivos sem bypass direto), controle-voos-source-frms.test.ts | FRMS consome dados exclusivamente do Controle de Voos como fonte canonica. |
| P12 | `JA_RESOLVIDO_COMPROVADO` | flight-coverage-ledger.test.ts, frms-fortnight-coverage.test.ts | Ausencia de confirmacao do ledger resulta em UNKNOWN. |
| P13 | `JA_RESOLVIDO_COMPROVADO` | frms-reprocess-enqueue.ts, frms-sigvoos-retrospective-ingestion.test.ts | Chave composta (empresa_id, flight_id, data_operacional) impede duplicidade. |
| P14 | `JA_RESOLVIDO_COMPROVADO` | preferred-operational-source-resilience.ts, frms-source-policy.test.ts | Fonte nao comprovada gera UNKNOWN, nunca zero presumido. |
| P15 | `JA_RESOLVIDO_COMPROVADO` | duty-boundary.ts, frms-duty-boundary-config-0511.json, duty-boundary.test.ts | Calculo estrito da jornada cumprida com limites legais. |
| P16 | `JA_RESOLVIDO_COMPROVADO` | frms-recovery.ts, recovery-activity-atomic.test.ts, RecoveryActivityCard.test.tsx | Horarios declarados sem presuncao de termino. |
| P17 | `JA_RESOLVIDO_COMPROVADO` | frms-daily-fatigue-fortnight-roster.test.ts, frms-daily-team-roster-sqlite.test.mjs | Denominador do dia (escalados) vs denominador da quinzena (ativos) preservado. |
| P18 | `JA_RESOLVIDO_COMPROVADO` | frms-daily-operational-date.test.ts, readiness-operational-date.route.test.ts, frmsOperationalDate.test.ts | Pousos na madrugada de D+1 atribuídos à jornada iniciada em D. |
| P19 | `JA_RESOLVIDO_COMPROVADO` | frms-daily-check.ts, frms-fadiga-reminder.ts, frms-resilient-safety.test.ts | Deduplicacao funcional sem envios repetidos. |
| P20 | `JA_RESOLVIDO_COMPROVADO` | case-write-lifecycle-sqlite.test.ts, frms-f0b-new-cases.test.ts, run #42052122424 | FRMS_F0C_REAL_API_LIFECYCLE_PASS comprovado em staging. |
| P21 | `JA_RESOLVIDO_COMPROVADO` | case-treatment-lifecycle.ts, case-treatment-lifecycle.test.ts | Trilha de eventos mantida sem duplicar casos em recalculados. |
| P22 | `JA_RESOLVIDO_COMPROVADO` | sgso-frms-decision-neutralization.test.ts | Notificacao de seguranca sem vazar dados medicos sensiveis. |
| P23 | `JA_RESOLVIDO_COMPROVADO` | frmsReportInsights.test.ts, FrmsRelatorios.test.tsx | Metricas coerentes com denominadores reais. |
| P24 | `JA_RESOLVIDO_COMPROVADO` | FrmsRelatorios.test.tsx, report-source-scope.test.ts, run #42529658194 | Export e visualizacao aprovados em QA autenticada. |
| P25 | `JA_RESOLVIDO_COMPROVADO` | FrmsSourcePolicyBanner.test.ts, frms-explicacao-dia-trace.test.ts, FrmsDataTransparency.test.tsx | Identificacao transparente de origem e latencia dos dados. |
| P26 | `JA_RESOLVIDO_COMPROVADO` | FrmsDayExplanationPanel.test.tsx, frmsDayExplanationCopy.test.ts, FrmsConceitos.test.tsx | Explicacao de limites, scores e acoes sem ambiguidades. |
| P27 | `JA_RESOLVIDO_COMPROVADO` | fadigaAcumuladaVisual.test.ts, FrmsVisualTriage.test.tsx, run #42529658194 | Escala visual ordenada por gravidade e compativel com WCAG. |
| P28 | `JA_RESOLVIDO_COMPROVADO` | schema-v2/frms-checkin-kss-provenance-0573.json, kss-checkin-provenance.test.ts | Submissao do tripulante preservada integralmente. |
| P29 | `BLOQUEADO_DECISAO_EXTERNA` | FRMS_F2_PARAMETER_PROVENANCE_REGISTER_2026-11-08.md, parameter-governance.test.ts | Validacao cientifica de parametros biomatematicos depende de parecer metodologico formal sob issue #1476. |
| P30 | `JA_RESOLVIDO_COMPROVADO` | frms-operational-decision.ts, FrmsRegulatoryCompliancePanel.test.tsx | Violaçao normativa soberana nao compensavel por score favoravel. |
| P31 | `BLOQUEADO_DECISAO_EXTERNA` | FRMS_F2_PARAMETER_PROVENANCE_REGISTER_2026-11-08.md, fadiga-score.v2.test.ts | Aprovacao da revisao da formula quinzenal sob deliberacao do comite FRMS. |
| P32 | `JA_RESOLVIDO_COMPROVADO` | frms-fadiga-checkin-legacy.ts (L1847), frms-operational-decision.ts | O sistema nunca declara tripulante apto de forma automatica sem avaliacao humana. |
| P33 | `LIMITADO_CONSERVADOR_DECISAO_CIENTIFICA` | OperationalVigilanceTest.test.tsx (17 tests PASS), PVTB_V2_PROTOCOL.md, OPERATIONAL_READINESS_PVT_V1.md | JSON diz IMPLEMENTADO_AGUARDA_QA, MD diz BLOQUEADO. Código: teste breve 60 s rotulado “protocolo AirTrust”, texto “não determina aptidão isoladamente”; NÃO é PVT-B de 3 min validado. |
| P34 | `JA_RESOLVIDO_COMPROVADO` | PR #1973, PR #1978, frms-sleep-opportunity-0552.json, frms-daily-fatigue-zero-sleep-self.test.ts | Preservado 0h de sono legitimo; sem fabricacao de horarios. |
| P35 | `JA_RESOLVIDO_COMPROVADO` | ima-v3-shadow.test.ts, frms-v3-shadow-preview.test.ts, FrmsEffectivenessPanel.test.tsx | Shadow preview nao afeta escalas ou liberacoes de voo. |
| P36 | `EXECUTADO_READONLY_SUCCESS` | scripts/__tests__/frms-ux-30d-readonly.test.mjs, workflow frms-ux-30d-production-aggregate.yml | Run #42560412779 SUCCESS no SHA 2ed22cb37: agregação 14/09–13/10, 30/30 dias, zero writes. É extração agregada, não homologação de UX. |
| P37 | `JA_RESOLVIDO_COMPROVADO` | frms-assignment-readonly-inventory.mjs, frms-production-assignment-readonly-inventory.test.mjs | Leitura dinamica no D1 sem hardcode de parametros no runtime. |
| P38 | `JA_RESOLVIDO_COMPROVADO` | frms-iogp-compliance-builder.test.ts, FRMS_F2_PARAMETER_PROVENANCE_REGISTER_2026-11-08.md | Shadow setorial adotado sem forcar enforcement canonico indevido. |
| P39 | `BLOQUEADO_DECISAO_EXTERNA` | costa-do-sol-frms-regulatory-source-manifest-2026-09-27.json, frms-regulatory-scenario-matrix.test.ts | Depende de formalizacao documental de opcao pelo operador Costa do Sol perante a ANAC. |
| P40 | `BLOQUEADO_DECISAO_EXTERNA` | docs/frms/frms-scientific-audit.md (L213), calculos.ts (L739) | Exige alteracao de schema D1 governada para registro de fusos cruzados e deliberacao de escopo pelo operador. |
| P41 | `JA_RESOLVIDO_COMPROVADO` | workforce-profile.test.ts, frms-regulatory-scenario-matrix.test.ts | Nunca presume tripulacao de revezamento sem evidencia explicita. |
| P42 | `BLOQUEADO_DECISAO_EXTERNA` | law-art42-madrugadas.ts, law-art42-madrugadas.test.ts (11 tests PASS) | Ativacao da flag law_art42_enforced condicionada a parecer formal da assessoria juridica do operador. |
| P43 | `JA_RESOLVIDO_COMPROVADO` | legal-work-service.ts, legal-work-service.test.ts | Conformidade legal comprovada na suite regulatória. |
| P44 | `JA_RESOLVIDO_COMPROVADO` | costa-do-sol-frms-regulatory-source-manifest-2026-09-27.json, frms-regulatory-scenario-matrix.test.ts | Regime offshore 21x17 e limites de 176h mensais aplicados estritamente na vigencia. |
| P45 | `JA_RESOLVIDO_COMPROVADO` | schema-v2/frms-regulatory-evidence-location-catalog-0512.json, FRMS_F2_PARAMETER_PROVENANCE_REGISTER_2026-11-08.md | Rastreabilidade formal de todas as fontes primarias da aviacao offshore. |
| P46 | `JA_RESOLVIDO_COMPROVADO` | scripts/guard-tenant-mutations.mjs, frms-tenant-scope-guard.test.ts | Queries parametrizadas com injecao obrigatoria de empresa_id. |
| P47 | `JA_RESOLVIDO_COMPROVADO` | frms-access.test.ts, frms-alerts-tenant-read.test.ts, frms-individual-scope.test.ts | Comprovada negacao fail-closed em tentativa de acesso desautorizado. |
| P48 | `JA_RESOLVIDO_COMPROVADO` | frms-fadiga-checkin.schema.ts, frms-fadiga-checkin-normalization.test.ts | Compatibilidade retroativa com consumidores mobiles preservada. |
| P49 | `JA_RESOLVIDO_COMPROVADO` | daily-fatigue-team-roster.ts, frms-shared.ts, 100% testes unitarios PASS | Refatoracao governada mantendo contratos e integridade de regressao. |
| P50 | `JA_RESOLVIDO_COMPROVADO` | operational-snapshot.ts, frms-governance-readiness.test.ts | Logs operacionais sem vazamento de PII emitidos nos pontos criticos. |

## 4. Dependências externas reais (comportamento conservador já ativo)

| Tema | Decisão exata necessária | Responsável | Comportamento atual |
|---|---|---|---|
| P29/P31/P33 pesos, limiares 45/75, PVT | Parecer científico formal (IOGP/HeliOffshore ou comitê) aprovando ou recalibrando pesos F2, descontos e limiares; validação do PVT breve | Comitê científico / SMS | Parâmetros rotulados `INTERNO/HIPÓTESE` no registro de proveniência; UI chama o teste de “protocolo AirTrust” e declara que não determina aptidão isoladamente; check-in/PVT incompleto nunca vira “apto” |
| P39 perfil regulatório | Operador declarar formalmente o apêndice RBAC 117 B/C aplicável | Costa do Sol / compliance | Manifesto `UNCONFIRMED_OPERATOR_SELECTION`; limites condicionais não são impostos como normativos |
| P40 fusos A117.23(d) | Decidir se há operação cruzando ≥3 fusos; se sim, aprovar migration Schema V2 (`origin_tz`/`dest_tz`) | Operações + engenharia | Limitação D-09 documentada em `calculos.ts` e na auditoria científica; piso de repouso nunca menor que o declarado |
| P42 art. 42 Lei 13.475 (madrugadas) | Parecer jurídico sobre aplicação ao regime offshore 15x15 | Jurídico | Implementado e testado, **desligado** por padrão (`law_art42_enforced`, `compliance-policy.ts`); ativação exige decisão explícita |
| P09 reprocessamento histórico | Autorização específica com plano e recuperação | Proprietário | Workflow `frms-historical-reprocess.yml` pronto, sem execução |
| P01/P02/P06 QA autenticada em staging | Fixture 999013 (8×CAS) depende de grant independente e assinador privado (`docs/ops/FRMS_QA_PRIVATE_ADAPTER.md`) | Administrador independente | Sem QA autenticada; nenhum PASS funcional é declarado |

## 5. SIC de 27/10/2026

Fatos (run #42560410082): 2 voos, 2 pessoas distintas, PIC 1/1 recebido, SIC 0/1; sem vínculo inválido e sem duplicidade; há check-in em dia adjacente em 1 caso. A rota de check-in usa `reference_date || data_checkin || operationalToday`; até a #1871 (29/10) o padrão era UTC. A UI envia a data explicitamente, logo a hipótese de bug de data **não está provada nem refutada**. Esta PR estende o script read-only existente com `adjacentCheckinSubmissionDayBrt` (dia BRT em que o check-in adjacente foi realmente enviado, só agregados):
- `labelAheadOfSubmission > 0` (rótulo 28/10, enviado em 27/10 BRT) ⇒ defeito de atribuição de data (a corrigir em código);
- `retrospectiveD1Inconclusive` (rótulo 26/10, enviado em 27/10) ⇒ **inconclusivo**: a rota permite envio retrospectivo D−1 com justificativa (`RETROSPECTIVE_D1`), que não é persistida na linha; não prova defeito e a pendência de 27/10 permanece real;
- `submittedOnOwnLabelDay > 0` ⇒ envio legítimo em outro dia; a pendência é real e deve permanecer.
Executar exige nova autorização read-only para o SHA da `main` posterior a esta PR.
