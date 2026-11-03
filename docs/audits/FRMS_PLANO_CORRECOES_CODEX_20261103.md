# AIRTRUST FRMS — Plano mestre de correções (para execução no Codex)

Auditoria de 03/11/2026. Evidência completa em `docs/audits/FRMS_AUDITORIA_INTEGRAL_20261103.md` (Partes I, II e III). Este documento é autossuficiente: lista **tudo o que ainda precisa ser feito**, em ordem, com onde mexer, como corrigir e como testar.

## 0. Antes de começar

- **Base de código:** as correções já feitas estão na branch `fix/frms-audit-integral-20261103` (PR #1922, aberta, **não mergeada**, sem deploy). Opções: (a) mergear a #1922 primeiro e criar as novas branches a partir da `main`; ou (b) continuar na mesma branch. Não refazer os itens da seção 1.
- **Regras do repositório:** seguir `AGENTS.md` e `CLAUDE.md`. Oito gates obrigatórios: `lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`. Mudança de schema só por Schema V2 (`worker-airtrust/schema-v2/` + workflow `apply-schema-change-v2.yml`). Produção só com autorização explícita de SHA/escopo.
- **Comandos:** `npm run lint`; `cd worker-airtrust && npx tsc --noEmit && npx vitest run src/__tests__/frms src/__tests__/routes/frms-*`; frontend `npx vitest run src/react-app/pages/frms`.
- **Guard de arquitetura:** `src/__tests__/architecture/architecture-performance-guard.test.ts` falha se um arquivo do Worker passar de 2 000 linhas sem registro. `lib/frms/operational-snapshot.ts` está com 1 993 e `routes/frms.ts` já está na lista — novas lógicas devem ir para módulos próprios.
- **Camadas:** `services|lib|repositories` não importam `routes/` nem `hono` (`npm run guard:layer-boundaries`).

## 1. Já corrigido na PR #1922 (não refazer)

| ID | O que foi feito |
|---|---|
| AUD-001 | Lei 13.475 art. 42 (madrugadas) calculado em `lib/frms/law-art42-madrugadas.ts`; aparece como "pendente de validação" até o perfil ter `law_art42_enforced: true` |
| AUD-002 | Painel "Conformidade legal e contratual" no detalhe do tripulante (`components/FrmsRegulatoryCompliancePanel.tsx`) |
| AUD-003/004 | Pousos SIGVOOS ausentes não viram "0 observados" (`operational-load-resolver.ts`, `operational-load.ts`) |
| AUD-006 | Acumulado nulo/incoerente vira evidência ausente (`sanitizeRollingRegulatoryEvidence`) |
| AUD-008 (parcial) | Jornada > 18 h = violação legal; 11–18 h com perfil > 11 h = não verificável |
| AUD-009 (parcial) / AUD-010 | Limites de missão com fonte LAW; ACT citado só na vigência 01/12/2025–30/11/2027 |
| AUD-015/018 | Escopo de setor em `assertTripulanteEmpresa`/`assertJornadaEmpresa`/`score-atual` (`routes/frms-shared.ts` → `assertFuncionarioNoEscopoFrms`) |
| AUD-016 | FIRA upload/exclusão exigem `requirePermission('frms','editar','admin','manager')` |
| AUD-017 | Ciência (ack) só do próprio evento para não gestor (`routes/frms-read-ack.ts`) |
| AUD-019 | Recálculo preserva casos trabalhados (`lib/frms/alert-case-preservation.ts`, `db-service-jornadas.ts`) |
| AUD-020 | Dedupe do cron diário não suprime escalada de nível (`cron/frms-daily-check.ts`) |

**Verificação obrigatória antes do deploy da #1922:** listar gestores (`usuarios_empresas.role` gerencial) sem linha ativa em `setores_gestores`; eles passam a receber 403 `FRMS_INDIVIDUAL_SCOPE_DENIED` nas fichas individuais. Só leitura; não alterar dados para "consertar" sem decisão.

## 1b. PRIORIDADE MÁXIMA — cálculo de fadiga e coleta de dados

Pedido do responsável pelo produto: **a prioridade é a fadiga (cálculo e coleta), não as horas.** Executar estes itens antes da seção 2. Evidência completa: Parte III do relatório (`FRMS-FAD-001` a `FRMS-FAD-014`).

| Ordem | ID | P | Correção | Onde |
|---|---|---|---|---|
| 1 | FAD-001 | P0 | Passar as **horas de sono do check-in** para o índice de efetividade; não sobrescrever `sono_efetivo_min` com 8 h; `fonte_sono = INFORMADO` só quando a duração foi informada | `lib/frms/db-service-jornadas.ts` (chamada de `calcEffectiveness` e `UPDATE frms_jornada` final), `lib/frms/fadiga-score.ts` `calcularSono`, `lib/frms/calculos.ts` `calcEffectiveness` |
| 2 | FAD-004 | P0 | KSS entra em `evaluateDailyRisk` como gatilho próprio (proposta: 7 → atenção; 8–9 → revisão obrigatória, a validar); parar de enviar fadiga subjetiva como `sleepiness_level` | `routes/frms-fadiga-checkin-legacy.ts` (`evaluateDailyRisk`, `normalizeCheckinInput`), `src/react-app/pages/frms/FrmsFlightCheckinFadiga.tsx` (payload) |
| 3 | FAD-003 | P1 | KSS obrigatório; remover default 5 e conversão 0–10→KSS; gravar `kss_provenance` na linha (Schema V2); tratar `DERIVED/DEFAULTED` legados como ausentes | `normalizeCheckinInput`, `lib/frms/kss-checkin-provenance.ts`, schema `frms_fadiga_checkin` |
| 4 | FAD-002 | P1 | Rejeitar janela de sono inválida (0 h ou > 14 h) no check-in; no cálculo, inválido = indisponível, nunca 8 h/16 h | `fadiga-score.ts` `calcularSono`, `routes/frms-fadiga-checkin-validation.ts` |
| 5 | FAD-008 | P1 | Prontidão: lapsos elevados sozinhos bastam para "atenção"; linha de base pessoal (mediana de RT, % lapsos) com detecção de desvio; limiar absoluto durante a construção da linha de base | `lib/frms/readiness.ts` `deriveReadinessAssessment` |
| 6 | FAD-007 | P1 | Adotar o PVT-B validado (3 min, lapso > 355 ms) ou renomear o teste de 60 s para "teste breve de atenção (não validado)" e não classificar com ele | `src/react-app/lib/frms/operationalReadiness.ts` `PVTB_V2_PROTOCOL`, `lib/frms/readiness.ts` `READINESS_PROTOCOL` |
| 7 | FAD-005 | P2 | Status operacional derivado do nível final (não do score base) | `frms-fadiga-checkin-legacy.ts` ≈l. 983–994 |
| 8 | FAD-006 | P2 | `SONO_INSUFICIENTE` também para 0 h (`horasSono != null && horasSono < 6`) | `lib/frms/operational-snapshot.ts` ≈l. 846 |
| 9 | FAD-012 | P2 | Primeira resposta pré-voo imutável + correções versionadas; `data_checkin` só a data operacional (D−1 com justificativa); classificar relato pós-apresentação como não pré-voo; separar fadiga (Samn-Perelli 1–7 ou 0–10) de sonolência (KSS) | `frms-fadiga-checkin-legacy.ts`, `frms-fadiga-checkin.schema.ts`, formulários |
| 10 | FAD-009 | P1 | Renomear `processo_s/processo_c` (ciclo embarcado/circadiano); remover ou calcular `tempo_abaixo_limiar` (hoje constantes 45/30/30); acrescentar "horas acordado no fim da jornada" com despertar e término reais | `lib/frms/calculos.ts` `calcEffectiveness`, telas de efetividade |
| 11 | FAD-010 | P2 | Crédito de recuperação pelo **sono relatado**, não pela oportunidade; remover crédito de horas de voo entre dias | `lib/frms/operational-policy-v2.ts` `computeRecoveryCredit`, `computeFlightHoursDelta` |
| 12 | FAD-011 / AUD-022 / AUD-023 | P1 | Reestruturar o score do check-in em gatilhos explícitos de revisão + indicadores descritivos; sem rótulo APTO/INAPTO; dado ausente rebaixa confiança e não soma pontos | `fadiga-score.ts`, `fortnight-indicator.ts` (depende de #1476 e decisão da Coordenação) |

**Testes obrigatórios destes itens** (casos de referência já calculados na Parte III, seção 19):
- `calcularScoreFadiga`: KSS 9 com 8 h hoje dá 35 VERDE APTO; depois da correção, o resultado da rota tem que ser revisão obrigatória.
- `calcularSono`: só despertar → não pode resultar em 480 `INFORMADO`; dormiu 04:30 e acordou 04:00 → inválido.
- Pipeline: check-in com 4 h → efetividade com 240 min e `frms_jornada.sono_efetivo_min = 240`.
- Prontidão: 50 % de lapsos com KSS 5 e 8 h → "atenção".

**Medir o impacto em produção (somente leitura, com autorização):** ajustar nomes de colunas ao schema atual antes de rodar.
```sql
-- FAD-001: jornadas com sono "informado" de 8 h sem horário de dormir (provável padrão mascarado)
SELECT COUNT(*) FROM frms_jornada
 WHERE deleted_at IS NULL AND fonte_sono = 'INFORMADO' AND hora_dormiu IS NULL AND sono_efetivo_min = 480;
-- FAD-001: divergência entre o sono do check-in e o sono usado no índice
SELECT COUNT(*) FROM frms_jornada j
  JOIN frms_fadiga_checkin c ON c.funcionario_id = CAST(j.tripulante_id AS INTEGER) AND c.data_checkin = j.data AND c.deleted_at IS NULL
 WHERE j.deleted_at IS NULL AND c.horas_sono IS NOT NULL AND ABS(c.horas_sono * 60 - j.sono_efetivo_min) > 30;
-- FAD-003: proveniência do KSS gravado
SELECT json_extract(payload_json, '$.kss_field_provenance') AS prov, COUNT(*) FROM frms_fadiga_evento
 WHERE tipo IN ('CHECKIN_CRIADO','CHECKIN_ATUALIZADO') GROUP BY prov;
-- FAD-004: check-ins com KSS alto classificados como aptos
SELECT kss_score, status_operacional, COUNT(*) FROM frms_fadiga_checkin
 WHERE deleted_at IS NULL AND kss_score >= 7 GROUP BY kss_score, status_operacional;
-- FAD-008: sessões de prontidão com lapsos ≥ 20 % classificadas como preservadas (ajustar tabela/colunas de readiness)
```

## 2. Ordem de execução recomendada

| Ordem | ID | Prioridade | Tipo | Bloqueio |
|---|---|---|---|---|
| 0 | **Seção 1b inteira (fadiga)** | P0/P1 | código | ver 1b |
| 1 | AUD-025 Ingestão SIGVOOS sem retroação | P1 | código | nenhum |
| 2 | AUD-005 Cobertura dos acumulados de voo | P1 | Schema V2 + código | depende de AUD-025 (status por dia) |
| 3 | AUD-021 Prazo vencido, reabertura, SGSO, métricas | P2 | código | definir fluxo SGSO para (c) |
| 4 | AUD-031 Matriz de testes por papel | P2 | testes | nenhum |
| 5 | AUD-014 Defesa em profundidade SQL + RBAC do PATCH sono | P3 | código | nenhum |
| 6 | AUD-027 Frescor dos dados na UI | P2 | UI | AUD-025 |
| 7 | AUD-030 Pendências do art. 42 no relatório | P3 | código + UI | nenhum |
| 8 | AUD-026 Data do voo × data da jornada (pousos) | P3 | código | decisão de regra |
| 9 | AUD-009 restante (outros tenants) | P2 | código | confirmar regime por operador |
| 10 | AUD-008 restante (composição da tripulação) | P2 | Schema V2 + UI | decisão de produto |
| 11 | AUD-022/023/024 Scores e rótulos | P1/P2 | científico + UX | decisão Coordenação/SGSO + #1476 |
| 12 | AUD-001 ativação | P1 | configuração | parecer jurídico |
| 13 | AUD-011/012/013 regras por interpretação | P2/P3 | regulatório | parecer jurídico |
| 14 | AUD-015 residual (autosserviço de escrita) | P2 | código | decisão de produto |
| 15 | AUD-028/029 Consolidação/simplificação | P2 | refatoração | inventário de consumidores |
| 16 | AUD-007 residual | P3 | código | nenhum |
| 17 | QA visual/acessibilidade (#1426) | — | QA | staging com dados |

## 3. Fichas de correção

### AUD-025 — Ingestão SIGVOOS importa só o dia corrente e nunca revisita (P1)
- **Onde:** `worker-airtrust/src/cron/resilient/sigvoos-frms.ts` — `resolveNextSigvoosDay` (≈l. 113), `shouldRunSigvoosAtCurrentHour` (≈l. 129), job `sigvoos-ingest` (≈l. 240–300); cron legado `worker-airtrust/src/cron/scheduled-handler.ts` (≈l. 935–965); sync em `services/sigvoos-frms.ts` `syncSigvoosForFrms` (≈l. 2380).
- **Problema:** importa `last_sync_to + 1` até a data de São Paulo do momento da execução (default 19 UTC = 16:00 BRT) e avança o marcador. Voos após 16:00, relatórios fechados depois e correções/cancelamentos retroativos nunca entram sem sincronização manual. Esses dias contam como zero nos acumulados legais.
- **Correção:**
  1. A cada execução, processar a janela de dias **encerrados** `[D−3, D−1]` (D = data de São Paulo) além de avançar o marcador; o dia D, se importado, é marcado `PROVISORIO`.
  2. Garantir upsert idempotente por etapa (chave natural do SIGVOOS / `sigvoos_flight_report_id`) em `cv_voos`/`cv_voo_etapas`/`cv_voo_tripulantes` e `frms_jornada` origem SIGVOOS; cancelamento no SIGVOOS → soft-delete da etapa.
  3. Reprocessar (`reprocessarTripulanteCompleto`) apenas tripulantes cujo conteúdo importado mudou (hash por tripulante/dia).
  4. Persistir status por empresa/dia: `PROVISORIO`, `CONSOLIDADO`, `FALHOU` (nova tabela via Schema V2, ex.: `frms_sigvoos_dia_status(empresa_id, data, status, ultima_sync_em, tentativas)`), usado por AUD-005 e AUD-027.
  5. Aplicar a mesma janela no cron legado ou desativá-lo se o resiliente for o único em uso (verificar `scheduled-handler.ts`).
- **Testes:** unitário de `resolveNextSigvoosDay`/nova função de janela (D−3..D−1, virada de mês/ano); integração com mock SIGVOOS: voo alterado em D−2 é atualizado, voo cancelado some, reimportação idêntica não duplica nem reprocessa; status do dia muda para `CONSOLIDADO`.
- **Risco:** volume de chamadas à API SIGVOOS (3× por execução) — medir e respeitar limites.

### AUD-005 — Acumulados de voo somam só dias importados (P1)
- **Onde:** `worker-airtrust/src/lib/frms/calculos.ts` `calcAcumuloRolling` (≈l. 819); persistência `db-service-jornadas.ts` `persistirAcumuloRolling` (≈l. 900–955); leitura `operational-snapshot.ts` (consulta a `frms_acumulo_rolling`) e `regulatory-compliance.ts`.
- **Problema:** 7/28/365 dias, mês e ano somam `horas_voo_minutos` das jornadas existentes; dia sem importação vale zero e nada registra a cobertura → `COMPLIANT` possível com histórico incompleto.
- **Correção:**
  1. Schema V2: adicionar em `frms_acumulo_rolling` as colunas de cobertura (ex.: `cobertura_28d_dias_esperados`, `cobertura_28d_dias_confirmados`, idem mês/ano/365), ou uma coluna JSON `cobertura_json`.
  2. Dia "esperado" = dia em que o tripulante estava escalado/em missão (escala/quinzena); "confirmado" = dia com status SIGVOOS `CONSOLIDADO` (AUD-025) ou jornada CV nativa fechada.
  3. Em `evaluateRegulatoryCompliance`: se não houver violação positiva e a cobertura de qualquer janela < 100 %, adicionar `ROLLING_FLIGHT_COVERAGE_INCOMPLETE` (status `UNKNOWN`). Violação positiva continua sendo violação (dados faltantes só podem aumentar a soma).
  4. Adicionar o rótulo do novo motivo em `lib/frms/frms-operational-decision.ts` (`COMPLIANCE_REASON_LABELS`) e em `src/react-app/pages/frms/frmsRegulatoryCompliance.ts` (`UNKNOWN_REASON_LABELS`).
  5. Backfill governado das linhas existentes (Schema V2 com plano de recuperação).
- **Testes:** janela de 28 dias com 1 dia esperado não confirmado → `UNKNOWN`; mesma janela já acima do limite → `VIOLATION`; cobertura total → `COMPLIANT`.

### AUD-021 — Lacunas do processo de casos (P2)
- **Onde:** `worker-airtrust/src/routes/frms-cases.ts`, `lib/frms/case-resolution.ts`, `lib/frms/db-service-alertas.ts`, `src/react-app/pages/frms/FrmsAlertasPainel.tsx`, crons em `worker-airtrust/src/cron/`.
- **Correção:**
  - (a) **Prazo vencido:** cron diário (seguir padrão de `cron/resilient/job-runner.ts`) lista alertas com tratamento registrado (`notas_resolucao` com prazo), `resolvido = 0` e prazo < hoje (data de São Paulo); notifica responsável e gestores do setor (mesmo mecanismo de `frms_notificacao_destinatario`); destaque "Prazo vencido" no painel de Casos.
  - (b) **Reabertura:** `PUT /api/frms/alertas/:id/reabrir` com `requirePermission('frms','editar','admin','manager')`, `assertAlertaEmpresa`, justificativa obrigatória, volta para `EM_TRATAMENTO` preservando histórico em `logAuditoria`.
  - (c) **Encaminhar ao SGSO:** ação no caso que cria relato/perigo no módulo SGSO com referência ao caso FRMS, sem copiar dados de sono/saúde (só tipo de perigo, data, contexto operacional). Definir com a Coordenação quais casos devem ir ao SGSO.
  - (d) **Métricas de efetividade do processo:** endpoint de leitura com tempo alerta→ciência, alerta→tratamento, % encerrados com eficácia avaliada, reincidência por tripulante/tipo em 90 dias, alertas sem ação. Exibir em Relatórios.
- **Testes:** cron encontra só casos vencidos do tenant; reabrir exige justificativa e registra auditoria; tenant cruzado → 403.

### AUD-031 — Testes de autorização por papel dentro da mesma empresa (P2)
- **Onde:** `worker-airtrust/src/__tests__/routes/`.
- **Correção:** criar matriz `piloto × gestor de outro setor × gestor do setor × admin` para cada endpoint de escrita e de leitura individual do FRMS (lista na seção 8 do relatório de auditoria). Exemplos já existentes para copiar o padrão: `frms-individual-scope.test.ts`, `frms-read-ack-events.test.ts` (caso AUD-017), `frms-fira-tenant.test.ts` (caso AUD-016).
- **Aceite:** cada endpoint tem ao menos um teste 403 para papel indevido e um 200 para papel correto.

### AUD-014 — Defesa em profundidade e RBAC do PATCH de sono (P3)
- **Onde:** `routes/frms.ts` `PATCH /jornada/:jornadaId/sono` (consulta e `UPDATE frms_jornada ... WHERE id = ?`); `routes/frms-fira.ts` consultas por `id`/`tripulante_id`; `routes/frms-fadiga-checkin-legacy.ts` consultas por `tripulante_id`/`funcionario_id` sem `empresa_id`.
- **Correção:** incluir no próprio SQL o filtro de tenant (`AND tripulante_id IN (SELECT id FROM funcionarios WHERE empresa_id = ?)` ou JOIN com `funcionarios.empresa_id`). No PATCH de sono, trocar a lista fixa `ADMIN|MANAGER|GESTOR` por `assertFuncionarioNoEscopoFrms` (já inclui o próprio tripulante).
- **Testes:** atualização com id de outra empresa altera 0 linhas.

### AUD-027 — Frescor dos dados não aparece para a coordenação (P2)
- **Onde:** `src/react-app/pages/frms/FrmsFlightDashboard.tsx` (cabeçalho da Operação), snapshot `lib/frms/operational-snapshot.ts` (resumo), dependência de AUD-025.
- **Correção:** mostrar "SIGVOOS sincronizado até DD/MM HH:MM · dias consolidados até DD/MM"; marcar itens de dias `PROVISORIO`/`FALHOU`; texto: "Dados do dia ainda provisórios — não presumir ausência de voo".
- **Testes:** componente com dia provisório exibe aviso; com falha exibe alerta.

### AUD-030 — Relatório de conformidade não conta pendências do art. 42 (P3)
- **Onde:** `worker-airtrust/src/lib/frms/db-service-relatorios.ts` (agregação por tripulante ≈l. 80–135) e `src/react-app/pages/frms/FrmsRelatorios.tsx`.
- **Correção:** novo contador `dias_pendente_validacao` (itens com `compliance_pending_validation.length > 0`) e coluna "Possível desconformidade a validar".
- **Teste:** item `COMPLIANT` com pendência conta 1 em `dias_conformes` e 1 em `dias_pendente_validacao`.

### AUD-026 — Pousos atribuídos pela data de programação (P3)
- **Onde:** `lib/frms/operational-load-resolver.ts` `resolveJornadaLandings` (`v.data_programacao = ?`).
- **Correção:** definir a regra canônica (data da apresentação da jornada) e, quando houver vínculo etapa→jornada, usar o vínculo em vez da data de programação.
- **Teste:** voo programado em D e realizado após 00:00 de D+1 conta na jornada correta.

### AUD-009 restante — Limites de missão para outros operadores (P2)
- **Onde:** `lib/frms/operational-snapshot.ts` (`deriveCostaDoSolMissionEvidenceForDate` só roda com ACT CDS) e `regulatory-compliance.ts`.
- **Correção:** Lei 13.475 art. 41 §§2º–4º vale para todo operador dos serviços II–V. Após confirmar o regime de missão de cada tenant, generalizar a derivação dos períodos (escala/quinzena) para tenants com perfil `HELICOPTER_OFFSHORE`; sem período confirmado → `UNKNOWN`, nunca conforme.
- **Bloqueio:** confirmar com cada operador como a missão é registrada na escala.

### AUD-008 restante — Composição da tripulação (P2)
- **Problema:** art. 37 depende de tripulação simples (11 h), composta (14 h) ou revezamento (18 h); o dado não existe. Hoje 11–18 h com perfil > 11 h fica "não verificável".
- **Correção:** Schema V2 com campo de composição na jornada/escala (ou derivação a partir do número de pilotos na etapa do Controle de Voos); aplicar 11/14/18 h conforme a composição. Considerar também a prorrogação de 60 min do art. 40 (comandante, com comunicação em 24 h) como estado "prorrogação registrada".

### AUD-022 — Score do check-in emite rótulo de aptidão sem calibração (P1, requer decisão)
- **Onde:** `worker-airtrust/src/lib/frms/fadiga-score.ts` `calcularScoreFadiga` (`status_operacional`, `recomendacao`, `frat_sugerido_nivel`); telas de check-in (`FrmsCheckinFadiga.tsx`, `FrmsFlightCheckinFadiga.tsx`), painel do gestor e exportação.
- **Correção proposta:** trocar `APTO / APTO_COM_RESSALVA / INAPTO` por linguagem de triagem (`SEM_SINAL`, `REVISAR`, `REVISAO_OBRIGATORIA`); manter "inapto" só quando o próprio tripulante declarar `apto = 0`; KSS ≥ 7 vira gatilho explícito de revisão, fora da soma ponderada. Manter compatibilidade da API (campo antigo deprecado por uma versão).
- **Bloqueio:** decisão da Coordenação/SGSO (muda a comunicação com o tripulante).

### AUD-023 — Qualidade de dado misturada a sinal fisiológico (P2, requer #1476)
- **Onde:** `lib/frms/fortnight-indicator.ts` (check-in pendente +10, dado estimado +7, dados completos −4); `fadiga-score.ts` (sono não informado = 0,6); `calculos.ts` `calcEffectiveness` (sono padrão de 8 h quando não informado).
- **Correção:** separar em todos os scores `exposicao_fadiga` (só fatores fisiológicos/operacionais) e `qualidade_evidencia` (completude, estimativas, pendências). Dado ausente não soma nem subtrai pontos; rebaixa a confiança e pode, sozinho, exigir revisão. Não usar sono padrão de 8 h para gerar percentual — sem sono informado, mostrar "não calculável" ou a faixa possível.
- **Bloqueio:** revisão científica da issue #1476; alterar pesos só por parâmetros governados (`parameter-governance.ts`).

### AUD-024 — Nome "effectiveness" e faixas 90/77/65 (P2)
- **Onde:** `calculos.ts` `calcEffectiveness`, `types.ts` (`EFFECTIV_*`), componentes `FrmsEffectivenessPanel.tsx`, `FrmsEffectivenessTimeline.tsx`, `FrmsJornadaEffectivenessCard.tsx`.
- **Correção:** renomear na UI para "Índice de exposição da jornada (regras AirTrust)", mostrar os fatores que compõem o número e o aviso "não é modelo biomatemático validado". Manter nomes internos se a mudança for cara.

### AUD-001 — Ativar art. 42 como violação (P1, requer parecer)
- **O que fazer após o parecer:** gravar `"law_art42_enforced": true` no `limits_json` do perfil regulatório governado da empresa (via fluxo de configuração governada, nunca direto em produção). Pontos para o parecer: apresentações offshore entre 05:00 e 06:00 contam como madrugada (§4º); §1º (terceira madrugada como extra no retorno) não está modelado; exceção do ACT cl. 8ª §2º (aeromédico/manutenção) exige saber o tipo de operação por jornada.

### AUD-011 / AUD-012 / AUD-013 — Regras que dependem de interpretação
- **AUD-011 (P2):** 44 h semanais fora do regime de missão (Lei art. 41; ACT cl. 8ª e 10ª). Definir "semana" (civil ou 7 dias móveis). Depois: usar o candidato `ANAC_BASIC_WORK_7D` já existente em `compliance-policy.ts` e o total semanal de `legal-work-time.ts` (`sumLegalWorkRollingDays`), aplicando só a tripulantes fora da missão.
- **AUD-012 (P2):** Lei art. 52 — mínimo de 8 folgas/mês com sábado+domingo consecutivos. Parecer sobre aplicação junto com a folga de missão (ACT cl. 9ª §1º). Depois: contar folgas de 24 h na base a partir da escala.
- **AUD-013 (P3):** ACT cl. 9ª §3º — escala mensal divulgada com 20 dias de antecedência. Requer registrar a data de publicação da escala mensal (Schema V2) e alertar quando faltar.

### AUD-015 residual — O tripulante pode gravar a própria jornada/escala? (P2, decisão)
- Hoje o modo `self` permite que o tripulante grave a **própria** jornada, escala e importação APUS/simulador. Se não for permitido: em `routes/frms.ts`, nas rotas de escrita (`POST/PUT/DELETE /jornadas`, `/escalas*`, `/importacao/apus`, `/importacao/simulador`), exigir `requirePermission('frms','editar','admin','manager')` antes do assert de escopo. Manter leitura própria.

### AUD-028 / AUD-029 — Consolidação e simplificação (P2)
- **AUD-028:** dois sistemas de check-in (`routes/frms-fadiga-checkin-legacy.ts`, 1 991 linhas; `routes/frms-fadiga-checkin.ts` + `FrmsFlightCheckinFadiga.tsx`). Inventariar chamadas do frontend e do Pilot App, escolher um contrato, migrar e remover o outro.
- **AUD-029:** extrair lógica pura testável de `FrmsImportacaoFira.tsx` (1 661), `FrmsFlightCheckinFadiga.tsx` (1 355), `FrmsFichaTripulante.tsx` (1 098), sem redesign.

### AUD-007 residual (P3)
- `lib/frms/preferred-operational-source.ts` consolida vários registros do Controle de Voos do mesmo dia num único intervalo. Duas jornadas no mesmo dia separadas por repouso legal viram uma só. Se ocorrer na operação, separar jornadas quando o intervalo entre registros for ≥ repouso mínimo.

### QA visual e de acessibilidade (#1426, bloqueado)
- Popular o staging com dataset sintético 15×15 (inclusive madrugadas 05:30, dia sem importação, voo cancelado, correção retroativa, check-in faltante, caso em tratamento), entrar como Coordenação e percorrer Operação → detalhe → Casos → Relatórios em 1920, 1366, 768 e 390 px, com teclado e zoom de 200 %. Registrar screenshots. Não usar dados de produção.

## 4. Decisões que só a empresa pode tomar

| Decisão | Itens afetados | Quem |
|---|---|---|
| Ativar art. 42 como bloqueio | AUD-001 | Jurídico + Coordenação |
| Semana de 44 h, 8 folgas/mês, aviso de 20 dias | AUD-011/012/013 | Jurídico |
| Trocar rótulos APTO/INAPTO do check-in | AUD-022 | Coordenação + SGSO |
| Pesos e lógica dos scores | AUD-023, #1476 | Responsável científico/FRMS |
| Tripulante pode lançar a própria jornada? | AUD-015 residual | Coordenação |
| Quais casos FRMS vão ao SGSO | AUD-021(c) | SGSO |
| Registro do regime de missão em outros operadores | AUD-009 | cada operador |

## 4b. Normas de jornada verificadas no texto do RBAC 117 Emd 01 (registrar no backlog de horas)

- **A117.15(e) redutor noturno:** cada hora noturna conta como 52 min 30 s para fins de jornada. Considera-se noturno o trabalho em terra das 22:00 às 05:00 locais e o voo das 18:00 às 06:00 no fuso da base. Não implementado; jornadas noturnas são subcontadas.
- **A117.15(m):** o limite de madrugadas está no próprio RBAC 117 e só pode ser alterado por manual aprovado pela ANAC (reforça AUD-001).

## 5. O que esta auditoria não cobriu

Interação real nas telas, responsividade, acessibilidade (WCAG 2.2 AA), gráficos e exportações dos Relatórios, desempenho/volume, dados de produção e benchmarking de produtos comerciais. Tudo depende de staging com dados ou de autorização de leitura em produção.
