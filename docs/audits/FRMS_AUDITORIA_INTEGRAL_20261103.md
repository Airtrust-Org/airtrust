# AirTrust FRMS — Auditoria integral e plano mestre de correções (03/11/2026)

Base: `origin/main` `57cf6cc8d`. Branch: `fix/frms-audit-integral-20261103`.
Frentes relacionadas: #1426 (UX etapa 2), #1476 (validação científica do índice), #776 (coordenação), PR #1650 (BOA, draft — escopo distinto, não reutilizada).

## 0. Escopo efetivamente coberto nesta execução

| Dimensão | Cobertura | Método |
|---|---|---|
| Motor regulatório (Lei 13.475, RBAC 117, ACT CDS) | **Executada** | Leitura do código canônico × texto primário da Lei 13.475 (planalto.gov.br) e do ACT Costa do Sol 2025/2027 (PDF íntegro, aeronautas.org.br) |
| Proveniência SIGVOOS → CV → FRMS (pousos, zero confirmado) | **Executada** (código) | `operational-load-resolver.ts`, `operational-load.ts` |
| Apresentação da conformidade no frontend | **Executada** (código + testes de componente) | `FrmsFlightDashboard.tsx` |
| Tenant/RBAC nas rotas FRMS | **Parcial** (varredura estática de SQL) | heurística em `routes/frms*.ts` |
| Interação real (staging, browser, perfis, troca de tenant) | **NOT RUN** | sem sessão autenticada em staging nesta execução; #1426 já registra staging sem população FRMS |
| Dados de produção | **NOT RUN** | nenhuma consulta ou escrita em produção |
| Validação científica do índice de efetividade | **NOT RUN** (fora do que o código permite provar) | permanece em #1476 |
| UX visual, responsividade, WCAG | **NOT RUN** | depende de staging populado (#1426 item 7) |

Nenhuma nota por dimensão é atribuída onde não houve evidência executada.

## 1. Matriz normativa (dispositivos que o motor precisa calcular)

| Fonte | Dispositivo | Parâmetro | Implementação atual | Resultado |
|---|---|---|---|---|
| Lei 13.475 | art. 32 IV | 8 h de voo por jornada, helicóptero, serviços II–V (táxi aéreo) | `LAW_HELI_FLIGHT_DAY_8H` sobre `hv_dia_min` | Conforme (ver AUD-007 sobre janela) |
| Lei 13.475 | art. 33 IV | 90 h/mês e 930 h/ano, helicóptero | `LAW_HELI_FLIGHT_MONTH_90H`, `..._YEAR_930H` | Conforme |
| Lei 13.475 | art. 37 | jornada 11/14/18 h (simples/composta/revezamento, serviços II–V) | piso legal independente do perfil (AUD-008) | Corrigido; composição ausente → não verificável |
| Lei 13.475 | art. 41 caput + ACT cl. 8ª | 176 h/mês de trabalho (jornada, reserva, 1/3 sobreaviso, extra, treinamento, solo) | `legal-work-time.ts` (união ponderada sem dupla contagem) | Conforme |
| Lei 13.475 / ACT | art. 41 §1º, cl. 8ª, cl. 9ª §2º | 44 h/semana fora do regime de missão | candidato existe, **não avaliado** | Lacuna AUD-011 |
| Lei 13.475 / ACT | art. 41 §§2º–3º, cl. 9ª | 21 dias de missão / 17 efetivos no local | fonte LAW; avaliado só para a CDS | AUD-009 parcial |
| Lei 13.475 / ACT | art. 41 §4º, cl. 9ª §1º | folga pós-missão = dias no local − 2 | `ACT_CDS_POST_MISSION_REST` | Conforme (CDS) |
| Lei 13.475 / ACT | art. 42; cl. 8ª §2º | ≤ 2 madrugadas consecutivas e ≤ 4 em 168 h; 48 h livres reiniciam; exceção só aeromédico/manutenção | **inexistente** antes desta PR | **AUD-001 — corrigido (calculado, ativação governada)** |
| Lei 13.475 / RBAC 117 | art. 48; A117.23(b) | repouso 12/16/24 h conforme jornada anterior | `repousoMinimoRequeridoMin` | Conforme |
| Lei 13.475 | art. 49; A117.23(d) | +2 h por fuso (≥3 fusos) | não modelado (documentado) | N/A operação doméstica |
| Lei 13.475 | art. 52 | ≥ 8 folgas/mês com sábado+domingo consecutivos | não avaliado | Lacuna AUD-012 (aplicação ao regime de missão requer parecer) |
| ACT CDS | cl. 1ª | vigência 01/12/2025–30/11/2027 | verificada por data | Corrigido (AUD-010) |
| ACT CDS | cl. 9ª §3º | escala mensal divulgada ≥ 20 dias antes | não monitorado | AUD-013 |
| RBAC 117 | B/C 117.25/117.27 | 93 h/28 d, 930 h/365 d, 60 h/7 d, 100 h/14 d | só com apêndice documentado no perfil | Conforme (fail-closed) |

## 2. Achados

Severidade P0–P3 conforme a missão. "Comprovado" = demonstrado por código e teste reproduzível nesta branch.

### FRMS-AUD-001 — Art. 42 (madrugadas) ausente do motor regulatório
- **P1 · confiança alta · comprovado · implementado e validado (com ativação governada)**
- **Evidência:** nenhuma ocorrência de regra de madrugadas em `lib/frms` (`grep madrugad|art. 42|168` só encontra o fator de apresentação do índice). `evaluateRegulatoryCompliance` retornava `COMPLIANT` para três apresentações 05:30 consecutivas.
- **Causa-raiz:** o motor modelou voo/jornada/trabalho/repouso; a regra de madrugadas nunca foi incluída. A cláusula 8ª §2º do ACT afasta o art. 42 apenas para aeromédico/manutenção — o transporte offshore permanece sujeito.
- **Correção:** `lib/frms/law-art42-madrugadas.ts` (função pura: §4º toque parcial em 00:00–06:00, consecutivas, janela de 168 h a partir da apresentação, reinício por 48 h livres §2º). `regulatory-compliance.ts` recebe `art42` e `art42Enforced`; `operational-snapshot.ts` usa jornada realizada e, na ausência, a escala programada (permite antecipar antes da operação).
- **Decisão de governança:** por ser lei clara mas com efeito potencialmente amplo (qualquer apresentação antes das 06:00 conta como madrugada), o achado **não altera o status** até o perfil regulatório documentado declarar `law_art42_enforced: true`. Até lá aparece como "Possível desconformidade legal — aguardando validação jurídica". Ativar exige parecer sobre: (a) apresentações offshore 05:00–06:00; (b) §1º (extra no retorno, não modelado); (c) exceção da cl. 8ª §2º por tipo de operação.
- **Testes:** `law-art42-madrugadas.test.ts` (8 casos calculados à mão, incl. virada de ano e reinício por 48 h), `regulatory-compliance.test.ts` (pendente × ativado), `compliance-policy.test.ts` (flag estrita).

### FRMS-AUD-002 — Conformidade legal invisível na interface (Dimensão A misturada à B)
- **P1 · alta · comprovado · implementado e validado**
- **Evidência:** a API entrega `compliance_status`, `violacoes_normativas`, `compliance_unknown_reasons`; nenhum arquivo em `src/react-app` os lê. A coordenação via só o bucket agregado (BLOQUEIO/DECISÃO), sem saber se a causa era limite legal, fadiga ou dado ausente.
- **Correção:** `frmsRegulatoryCompliance.ts` + `FrmsRegulatoryCompliancePanel.tsx` no detalhe do tripulante: "Dentro dos limites verificados" (com aviso de que conformidade não prova ausência de fadiga), "Limite ultrapassado" com dispositivo, "Conformidade não verificável" com motivos traduzidos, e pendências do AUD-001. Código desconhecido nunca é traduzido como conforme.
- **Testes:** `FrmsRegulatoryCompliancePanel.test.tsx` (5).
- **Pendente:** aceite visual em staging (#1426 item 7).

### FRMS-AUD-003 — Etapa SIGVOOS sem pousos registrada como "0 pousos observados"
- **P2 · alta · comprovado · implementado e validado**
- **Evidência:** `resolveJornadaLandings` somava `COALESCE(pousos, 0)` e, com `legs > 0`, retornava `SIGVOOS_OBSERVED` mesmo com todos os pousos nulos → carga operacional calculada como se o dia tivesse zero pousos.
- **Correção:** conta etapas com ambos os pousos nulos; qualquer etapa sem pousos, ou total ≤ 0 com etapas voadas, vira `SIGVOOS_UNAVAILABLE` (incompleto). Testes em `operational-load-resolver.test.ts`.
- **Estado do problema histórico `SIGVOOS_CONFIRMED_ZERO`/`legs=0`:** mitigado — o resolvedor não emite mais zero confirmado sem cobertura positiva (retorna indisponível).

### FRMS-AUD-004 — Default fail-open em `computeOperationalLoadV2`
- **P2 · alta · comprovado · implementado e validado**
- Sem `landingsEvidenceQuality`, zero pousos era tratado como `CONFIRMED_ZERO` (dia sem voo). Agora `INCOMPLETE`. Teste em `operational-load.test.ts`.

### FRMS-AUD-005 — Acumulados de voo somam apenas dias importados
- **P1 · média · provável · apenas especificado**
- `calcAcumuloRolling` soma `horas_voo_minutos` das jornadas existentes na janela de 7/28/365 dias e mês/ano. Dia sem importação conta como zero, e `frms_acumulo_rolling` não registra cobertura. Resultado: `COMPLIANT` possível com histórico incompleto.
- **Correção exata:** persistir `cobertura_dias_esperados`/`cobertura_dias_confirmados` por janela (fonte: estado de sincronização SIGVOOS/CV por dia e escala), e `evaluateRegulatoryCompliance` adicionar `ROLLING_FLIGHT_COVERAGE_INCOMPLETE` quando a cobertura < 100% e não houver violação positiva. Exige Schema V2 (`apply-schema-change-v2.yml`) e backfill — fora do escopo desta PR.

### FRMS-AUD-006 — `COALESCE(hv_*, 0)` na leitura da evidência regulatória
- **P2 · alta · comprovado · implementado e validado**
- `frms_acumulo_rolling` (migration 0212) declara `hv_*` como `INTEGER DEFAULT 0` sem `NOT NULL`; a leitura fazia `COALESCE(..., 0)`. Além disso, `hv_ano_calendario_min` (0498, `NOT NULL DEFAULT 0`) vale 0 em linhas anteriores à migration.
- **Correção:** `sanitizeRollingRegulatoryEvidence` — qualquer `hv_*` nulo ou inválido descarta a linha (→ `ROLLING_REGULATORY_EVIDENCE_MISSING`); ano civil menor que o mês civil (impossível) vira ausente só no ano (→ `CALENDAR_YEAR_FLIGHT_EVIDENCE_MISSING`); repouso nulo falha fechado. Testes em `regulatory-compliance.test.ts`.

### FRMS-AUD-007 — Jornada diária comparada como soma das jornadas da data
- **Refutado.** `resolvePreferredOperationalJourneys` agrupa por data+tripulante: o snapshot recebe uma jornada por dia, então a soma é a própria jornada. Residual (P3, não alterado): registros múltiplos do CV no mesmo dia são consolidados num intervalo único (primeira apresentação → último término); jornadas separadas por repouso legal no mesmo dia seriam vistas como uma só.

### FRMS-AUD-008 — Limite legal de jornada (art. 37 I, 11 h) depende só do parâmetro do perfil
- **P2 · alta · comprovado · implementado e validado (parcial)**
- Perfil com `FDP_MAXIMO_HORAS` > 11 suprimia a verificação legal.
- **Implementado e validado:** jornada > 18 h → `LAW_DUTY_18H` (art. 37 III, excede qualquer composição); jornada entre 11 h e 18 h com perfil > 11 h → `UNKNOWN` com `LAW_DUTY_CREW_COMPOSITION_UNKNOWN` (composição simples/composta/revezamento não está no snapshot). Prorrogação de 60 min pelo comandante (art. 40) não é modelada. Pendente: registrar a composição da tripulação na origem para fechar a verificação.

### FRMS-AUD-009 — Limites de missão (art. 41 §§2º–4º) só para o tenant com ACT CDS
- **P2 · alta · comprovado · parcialmente implementado** — os 21/17 dias e a folga pós-missão estão na própria lei. **Feito:** fonte `LAW` com referência ao art. 41 §§2º–4º (e ao ACT dentro da vigência); 176 h/mês idem. Códigos `ACT_CDS_*` mantidos por estabilidade de contrato. **Não feito:** avaliar outros tenants — a derivação de períodos de missão só foi validada para a escala da CDS; estender exige confirmar o regime de cada operador.

### FRMS-AUD-010 — Vigência do ACT não verificada
- **P3 · alta · comprovado · implementado e validado** — `costaDoSolAct2025_2027InForce` (01/12/2025–30/11/2027). O motor recebe `dataReferencia` e só cita o ACT dentro da vigência; a rota de fadiga acumulada só cita o ACT quando o mês intersecta a vigência. Efeito numérico nulo (regras coincidem com a lei).

### FRMS-AUD-011 — 44 h semanais fora do regime de missão não avaliadas
- **P2 · alta · comprovado (código) · requer interpretação** — semana civil × 7 dias móveis não está definida no ACT. Implementar após decisão da coordenação/jurídico.

### FRMS-AUD-012 — Art. 52 (8 folgas/mês com fim de semana) não avaliado
- **P2 · média · requer parecer** sobre aplicação concomitante à folga de missão (cl. 9ª §1º).

### FRMS-AUD-013 — Antecedência de 20 dias da escala mensal (cl. 9ª §3º) não monitorada
- **P3 · média** — requer registrar data de publicação da escala mensal.

### FRMS-AUD-014 — Defesa em profundidade em SQL por `id`
- **P3 · média · não é IDOR comprovado** — `frms.ts` (`PATCH /jornada/:id/sono`) e `frms-fira.ts` consultam/atualizam por `id`/`tripulante_id` após verificação de posse. Correção: incluir `empresa_id` (ou JOIN com `funcionarios.empresa_id`) no próprio `UPDATE`. O mesmo handler usa lista fixa `ADMIN|MANAGER|GESTOR`; alinhar ao guard RBAC canônico.

## 3. Respostas objetivas (com o limite das evidências desta execução)

1. **Calcula corretamente o que afirma?** Os limites de voo, trabalho mensal, repouso e missão conferem com a Lei 13.475 e o ACT. Faltavam o art. 42 (agora calculado) e o art. 37 como piso legal (agora avaliado); os acumulados ainda não provam cobertura de importação (AUD-005).
2. **Dados suficientes?** Não comprovável: o motor falha fechado em vários pontos, mas os acumulados de voo não registram cobertura.
3. **Interpretação cientificamente defensável?** Não validada — índice de efetividade e pesos seguem sem validação empírica (#1476). A interface já afirma que indicadores não substituem decisão humana.
4. **Reconhece falta de dados?** Sim na decisão diária (`UNKNOWN` → `NAO_AVALIADO`), agora também visível ao usuário (AUD-002). Não nos acumulados (AUD-005).
5. **Offshore 15×15?** Missão 21/17 e folga pós-missão modeladas para a CDS; madrugadas (padrão típico de apresentação offshore) estavam ausentes.
6–7. **Gestão do risco e decisão:** a fila separa bloqueio/decisão/confirmação e orienta a ação; responsável e prazo não são atribuídos automaticamente (declarado na UI). Fluxo caso → mitigação → eficácia **não verificado** nesta execução.
8. **Falsa segurança possível?** Sim, antes desta PR: três madrugadas consecutivas, pousos ausentes, acumulados nulos e jornada > 11 h com perfil permissivo eram apresentados como normais. Persiste em AUD-005 (dias não importados contam como zero).
9. **Falhas de segurança/privacidade comprovadas?** Nenhum vazamento cross-tenant comprovado na varredura; pendências de defesa em profundidade (AUD-014).
10. **Corrigir imediatamente:** decidir a ativação do art. 42; AUD-005 (Schema V2); AUD-008.
11. **Simplificar:** a coexistência de rotas `frms-fadiga-checkin-legacy.ts` (1 991 linhas) e `frms-fadiga-checkin.ts` sugere consolidação; não avaliado em profundidade.
12–15. **Validação externa** requer: staging populado com dataset sintético 15×15 (inclusive madrugadas e importação parcial), aceite visual por perfil (#1426), parecer jurídico sobre art. 42/44 h/art. 52 e protocolo de validação do índice (#1476).

## 4. O FRMS acrescenta gerenciamento efetivo além das obrigações legais?

**Parcialmente, e ainda não demonstrado com dados de resultado.** O que ele acrescenta de verificável no código: check-in diário com KSS/sono (informação inexistente em Escalas/CV), apuração legal de trabalho com reserva, sobreaviso e treinamento sem dupla contagem, folga pós-missão do ACT e falha fechada quando falta dado. O que não é possível afirmar: que os alertas mudam decisões (não há métrica de alerta → decisão → mitigação → eficácia acessível nesta execução) e que o índice de efetividade mede fadiga (#1476). A prioridade é tornar a conformidade completa e honesta (AUD-001/005/008) antes de ampliar indicadores.

## 5. Backlog em ondas

| Onda | Itens | Dependência | Autorização |
|---|---|---|---|
| 0 | AUD-001 ativação (`law_art42_enforced`) | parecer jurídico | perfil regulatório governado |
| 1 | AUD-005 | Schema V2 + backfill | workflow `apply-schema-change-v2.yml` |
| 1 | ~~AUD-006, AUD-008, AUD-010~~ (feito), AUD-009 restante (outros tenants), composição da tripulação na origem | confirmação do regime por operador | PR comum |
| 2 | AUD-011, AUD-012, AUD-013 | interpretação/dado novo | coordenação + jurídico |
| 2 | Métricas de efetividade do processo (alerta → caso → decisão → mitigação) | inventário dos casos | — |
| 3 | AUD-014; aceite visual #1426 | staging populado | — |
| 4 | Validação do índice (#1476) | dataset retrospectivo | responsável científico |

## 6. Testes executados nesta branch

- `worker-airtrust`: `vitest run src/__tests__/frms` — 101 arquivos, 925 testes, PASS; rotas/serviços relacionados (snapshot, fadiga acumulada, dispatch gate, sec02) — 10 arquivos, 95 testes, PASS; `tsc --noEmit` PASS.
- Frontend: `vitest run src/react-app/pages/frms src/react-app/hooks` — 67 arquivos, 480 testes, PASS.
- `npm run lint` (todos os guards, incl. layer-boundaries e schema-contract) — PASS.
- Não executados: E2E, staging, produção.

---

# PARTE II — Auditoria ampliada (continuação, 03/11/2026)

## 7. Inventário de superfície (backend)

Montagens em `worker-airtrust/src/index.ts`: `/api/frms` → `frms.ts` (com sub-rotas `frms-cases`, `frms-relatorios-config`, `frms-fira`, `frms-fadiga-acumulada`), `frms-fadiga-checkin` (+ legado), `/api/frms/readiness`, `frms-operational-snapshot`, `frms-read-ack`, `frms-override`, `frms-projection`; `frms-recovery` montado separadamente. Todas as rotas têm `auth()` (em `frms.ts` o `use('*', auth())` da linha 921 vem depois apenas de rotas `/maintenance/*`, que têm `auth()+tenantMiddleware()` próprios — verificado, sem lacuna). **Não existe gate de módulo/RBAC para `/api/frms`**: a autorização por papel é feita, ou não, endpoint a endpoint.

| Arquivo | Endpoints | Linhas |
|---|---|---|
| `frms.ts` | jornadas (CRUD, sono), acúmulo, score-atual, reprocessar, explicação do dia, comparar dias, simular cenário, justificativas, alertas (lista, contagem, envio), escalas FRMS, importação APUS/simulador, validar escala, manutenção (cobertura/materialização) | 3 359 |
| `frms-cases.ts` | `PUT /alertas/:id/{visualizar,tratamento,resolver}` | 133 |
| `frms-relatorios-config.ts` | relatórios (individual, compliance, mapa de fadiga, histórico de alertas), configurações governadas, localidades, notificações | 804 |
| `frms-fira.ts` | upload FIRA (simples, lote, multipágina), confirmar, vincular, listar, excluir, comparativo de fontes, heatmap, timeline | 1 077 |
| `frms-fadiga-checkin-legacy.ts` | check-in (hoje, me, histórico, config, painel, painel-gestor, analytics, resposta do gestor, export, FRAT prefill), daily-fatigue | 1 991 |
| `frms-read-ack.ts` / `frms-override.ts` | eventos de ciência e override operacional | 775 / 250 |
| `frms-readiness.ts` / `frms-recovery.ts` | PVT-B/prontidão e atividade de recuperação (autosserviço) | 348 / 797 |
| `frms-operational-snapshot.ts` / `frms-projection.ts` | snapshot diário e projeção (leitura) | 385 / 178 |

## 8. RBAC, tenant e privacidade — matriz de escrita

| Endpoint de escrita | Guard observado | Avaliação |
|---|---|---|
| `PUT /alertas/:id/visualizar\|tratamento\|resolver` | `requirePermission('frms','editar','admin','manager')` + tenant | OK |
| `PUT /fadiga-checkin/config`, `PATCH /fadiga-checkin/:id/resposta-gestor` | `requirePermission(... 'manager')` | OK |
| `PUT /configuracoes*`, localidades, restaurar | `requireRole('admin')`/`requirePlatformAdmin` | OK |
| `POST /override/:eventId` | `canApplyOverride` (ADMINISTRADOR/GESTOR) | OK |
| `POST /readiness`, `POST /recovery/activity`, check-in `me` | próprio funcionário (`resolveOwnFuncionarioId`) | OK (autosserviço) |
| `PUT /notificacoes/:id/ler` | `WHERE id = ? AND funcionario_id = ?` | OK |
| `POST /importacao/fira/:id/confirmar`, `fonte-calculo`, `reprocessar*`, `DELETE /jornadas/mes/*` | `requireRole('admin')` | OK |
| **`POST /jornadas`, `PUT /jornadas/:id`, `DELETE /jornadas/:id`** | só tenant (`assertTripulanteEmpresa`/`assertJornadaEmpresa`) | **AUD-015** |
| **`POST /escalas`, `PUT/DELETE /escalas/:id`, `POST /importacao/{apus,simulador}`** | só tenant | **AUD-015** |
| **`POST /importacao/fira/upload*`, `DELETE /importacao/fira/:id`** | só tenant | **AUD-016** |
| **`POST /read-ack/events/:id/ack`** | escopo calculado e **não comparado** | **AUD-017** |
| `POST /read-ack/events/generate` | escopo por funcionário para não-gestor | OK |
| `PATCH /jornada/:id/sono` | lista fixa `ADMIN\|MANAGER\|GESTOR` ou próprio | AUD-014 (alinhar RBAC) |

### FRMS-AUD-015 — Qualquer usuário autenticado da empresa grava/apaga jornadas e escalas de qualquer tripulante
- **P1 · alta · comprovado (código) · especificado**
- **Evidência:** `routes/frms.ts` `POST /jornadas` (l. 1175) chama só `assertTripulanteEmpresa`; `PUT /jornadas/:id` (l. 1310) e `DELETE /jornadas/:id` (l. 1539) só `assertJornadaEmpresa`; idem `/escalas*` e importação APUS/simulador. Não há middleware de módulo em `/api/frms`.
- **Impacto:** um tripulante, mecânico ou aluno do LMS da mesma empresa pode alterar ou apagar a jornada de outra pessoa. Isso muda os acumulados legais, a fatorização, os alertas e a decisão operacional — integridade de dados de segurança operacional.
- **Correção exata:** aplicar `requirePermission('frms','editar','admin','manager')` às rotas de escrita de jornada/escala/importação; para autosserviço (se o produto permitir que o tripulante registre a própria jornada), aceitar não-gestor somente quando `resolveFuncionarioId(c) === tripulante_id` e registrar `registrado_por`. Teste: usuário `piloto` recebe 403 ao gravar jornada de outro tripulante; gestor e o próprio tripulante (se permitido) recebem 200.
- **Decisão necessária:** confirmar se o tripulante pode lançar a própria jornada (FrmsFormJornada está na Ficha do Tripulante).

### FRMS-AUD-016 — Upload e exclusão de FIRA sem papel
- **P2 · alta · comprovado** — `frms-fira.ts` l. 78/150/269 (upload) e l. 491 (delete) só verificam tenant. Confirmar exige admin, então o dado não entra no cálculo sem gestor, mas qualquer usuário pode criar/apagar importações em revisão de terceiros. Correção: `requirePermission('frms','editar','admin','manager')` em upload/delete.

### FRMS-AUD-017 — Ciência (ack) de evento de outro tripulante
- **P1 · alta · comprovado (código) · especificado**
- `frms-read-ack.ts` l. 708: `enforceFuncionarioScope(c, empresaId, event.funcionario_id)` devolve o **próprio** funcionário para quem não é gestor, mas o handler não compara esse valor com `event.funcionario_id`. Qualquer usuário da empresa pode dar ciência ao evento de outro tripulante, retirando-o da fila de pendências.
- **Correção:** `if (!canSeeTeam(c) && scopedFuncionarioId !== event.funcionario_id) return 403`. Teste negativo com usuário não gestor.

### FRMS-AUD-018 — Dados individuais de fadiga legíveis por qualquer usuário da empresa (LGPD)
- **P1 · alta · comprovado (código) · especificado**
- `GET /score-atual/:funcionarioid` (l. 924), `GET /jornadas/:tripulante_id` (l. 1562), `GET /acumulo/:tripulante_id` (l. 1605), `GET /tripulante/:id/explicacao-dia` (l. 1926) verificam apenas que o tripulante pertence à empresa. Retornam score, horário de sono, sono estimado e jornadas. Os relatórios (`/relatorios/*`) aplicam escopo por setor (`getEmployeeSectorAccess`); esses endpoints não.
- **Impacto:** dado de sono/fadiga é dado pessoal sensível no contexto de saúde ocupacional; minimização e finalidade (LGPD art. 6º I e III) exigem acesso só do titular e de quem tem a gestão legítima.
- **Correção:** helper único `assertFrmsIndividualAccess(c, tripulanteId)`: titular OU papel gestor com escopo de setor (`getEmployeeSectorAccess`) OU admin. Aplicar a todos os GET individuais. Teste: piloto A → 403 nos dados do piloto B.

## 9. Alertas, casos, mitigação e eficácia

**O que existe e está correto** (`frms-cases.ts`, `case-resolution.ts`, `db-service-alertas.ts`): ciência → tratamento (obrigatórios: responsável, prazo, medida, justificativa) → encerramento (obrigatória: avaliação de eficácia; não reescreve o tratamento); escrita com escopo de tenant e `logAuditoria` com valor anterior. É a cadeia exigida (perigo → decisão → mitigação → responsável → eficácia).

### FRMS-AUD-019 — Recálculo apaga casos em tratamento ou resolvidos e recria alertas abertos
- **P1 · alta · comprovado (código) · especificado (corrigível sem schema)**
- `lib/frms/db-service-jornadas.ts` l. 782–791: a cada `recalcularPipeline` executa `UPDATE frms_alerta SET deleted_at = ? WHERE jornada_id = ? AND deleted_at IS NULL` — sem filtrar `resolvido`, `visualizado` ou `notas_resolucao` — e insere alertas novos. `recalcularPipeline` roda ao salvar qualquer jornada anterior do tripulante (todas as futuras são recalculadas, l. ~995) e no reprocessamento.
- **Impacto:** o tratamento registrado pela coordenação some da fila (fica só no log de auditoria), o caso volta como novo e não tratado, e um caso encerrado com eficácia avaliada reaparece aberto. Quebra a rastreabilidade decisória e gera alertas repetidos sem providência.
- **Correção:** soft-delete apenas de alertas sem tratamento (`COALESCE(resolvido,0)=0 AND notas_resolucao IS NULL AND COALESCE(visualizado,0)=0`); antes de inserir, pular alerta cuja chave (`jornada_id`,`tipo_limite`,`nivel`) já exista preservada; se o nível subiu, inserir novo. Teste: alerta em tratamento sobrevive ao recálculo; nenhum duplicado.

### FRMS-AUD-020 — Deduplicação de 24 h suprime escalada de nível
- **P2 · alta · comprovado** — `cron/frms-daily-check.ts` `inserirAlertaComDedupe24h`: existe alerta do mesmo `tipo_limite` nas últimas 24 h → não insere, **independente do nível**. Um AVISO às 08:00 impede o registro de VIOLAÇÃO às 18:00 do mesmo limite. Correção: suprimir só quando o nível existente for ≥ ao novo (ordem AVISO < ATENCAO < CRITICO < VIOLACAO). A consulta também não filtra tenant (filtra por `tripulante_id`, que é global) — aceitável, mas incluir `empresa_id` por defesa em profundidade.

### FRMS-AUD-021 — Lacunas de processo (não são defeitos de código)
- **P2 · média · observado:** (a) nenhum monitoramento de **prazo vencido** de tratamento (o prazo é exigido, mas nada alerta quando expira; `grep prazo` em `cron/` só encontra SGSO/LMS); (b) não há **reabertura** de caso; (c) não há **encaminhamento ao SGSO** a partir do caso FRMS (a única menção a SGSO no módulo é no check-in de voo); (d) não há métrica de efetividade do processo (tempo alerta→tratamento, % com eficácia avaliada, reincidência).
- **Correção proposta:** (a) cron diário que lista casos `EM_TRATAMENTO` com prazo < hoje e notifica o responsável/gestor; (b) `PUT /alertas/:id/reabrir` com justificativa e auditoria; (c) ação "encaminhar ao SGSO" criando relato vinculado, sem dados pessoais além do necessário; (d) endpoint de indicadores de processo para o relatório de Coordenação.

## 10. Fundamentação científica dos indicadores

### 10.1 Inventário dos indicadores e o que cada um realmente mede

| Indicador | Implementação | Natureza real | Validação |
|---|---|---|---|
| Score de fadiga do check-in (0–100, VERDE/AMARELO/LARANJA/VERMELHO) | `lib/frms/fadiga-score.ts` — soma ponderada de KSS normalizado (peso default 0,35, migration 0287), duração e qualidade do sono, sintomas; +8 medicação, +15 álcool; `apto=0` força vermelho | Triagem autorreferida composta | Nenhuma calibração (o próprio código diz "penalidades provisórias de triagem, não calibradas") |
| KSS (1–9) | entrada do check-in | Sonolência subjetiva momentânea — instrumento validado (Åkerstedt & Gillberg, 1990); KSS ≥ 7 associa-se a queda de desempenho em estudos de privação | Instrumento validado; o *uso* no score não é |
| "Effectiveness" estimada (%) | `calculos.ts` `calcEffectiveness` — produto/soma de fatores (apresentação, duração, repouso, noturno, HV, ciclo embarcado, carga operacional V2) com faixas 90/77/65 | Índice de exposição por regras | Não é SAFTE/FAST; não validado. O nome e as faixas lembram o modelo SAFTE-FAST, o que convida a interpretá-lo como efetividade cognitiva |
| Score quinzenal (0–100, ATENÇÃO 45 / CRÍTICO 75) | `fortnight-indicator.ts` | Exposição acumulada + qualidade de dado | Ver #1476 (pesos sem homologação científica) |
| PVT-B / prontidão | `frms-readiness.ts` | Desempenho psicomotor (PVT é padrão-ouro de vigilância; versão breve de 3 min tem validação na literatura, mas o limiar local não) | Limiar local não validado |
| WOCL | `woclStartMinute=120`, `woclEndMinute=360` | 02:00–05:59 | Conforme definição ICAO (Doc 9966) |

### FRMS-AUD-022 — Score de check-in não calibrado emite rótulo de aptidão
- **P1 · alta · comprovado · requer decisão**
- `fadiga-score.ts` l. ~212: `status_operacional = APTO | APTO_COM_RESSALVA | INAPTO` derivado diretamente do score composto. O próprio código declara que os pesos são provisórios e não calibrados. Um rótulo de aptidão vindo de um score não validado contraria a premissa da missão ("o FRMS não deve decidir unilateralmente sobre aptidão") e as orientações ICAO Doc 9966 / FAA AC 120-103A, que tratam autoavaliação como insumo da decisão, não como decisão.
- **Correção proposta (não implementada — muda texto e contrato visível ao piloto):** renomear os estados para linguagem de triagem (`SEM_SINAL`, `REVISAR`, `REVISAO_OBRIGATORIA`), manter "INAPTO" apenas quando o próprio tripulante declarar `apto=0`, e tratar KSS ≥ 7 como gatilho próprio e explícito de revisão (não diluído na soma ponderada). Requer decisão da Coordenação/SGSO porque altera a comunicação com o tripulante.

### FRMS-AUD-023 — Qualidade de dado misturada a sinal fisiológico nos scores
- **P2 · alta · comprovado** — (a) score quinzenal: check-in pendente +10, dado estimado +7 e "dados completos" −4 pontos (#1476); (b) check-in: sono não informado vale 0,6 (penaliza) em vez de "incompleto"; (c) "effectiveness": sem horário de sono informado, assume a premissa padrão de 8 h (`fonteSono='PADRAO'`, migration 0353) — **hipótese otimista** — e o resultado é exibido como percentual. Em (c) o snapshot marca `sleep_data_source='ESTIMADO'` e a confiança da decisão cai (`frmsOperationalDecision.ts` l. 141), o que mitiga parcialmente.
- **Correção:** separar dois eixos em todos os scores — `exposicao_fadiga` (só fatores fisiológicos/operacionais) e `qualidade_evidencia` (completude, estimativas, pendências). Dado ausente nunca soma nem subtrai pontos de fadiga; ele rebaixa a confiança e pode, isoladamente, exigir revisão. Depende da revisão científica de #1476.

### FRMS-AUD-024 — Nomenclatura "effectiveness" e faixas 90/77/65
- **P2 · média** — usar "efetividade" e faixas semelhantes às do SAFTE-FAST para um índice próprio por regras induz o usuário a ler o número como predição de desempenho cognitivo. Correção: renomear para "Índice de exposição da jornada (regras AirTrust)", exibir os fatores que o compõem e declarar na UI que não é modelo biomatemático validado.

### 10.2 Matriz de aderência científica

| Tema | Referência | Implementação | Lacuna | Recomendação |
|---|---|---|---|---|
| Processo homeostático (vigília prolongada, sono prévio) | Borbély 1982 (modelo de dois processos); Doc 9966 cap. 2 | Sono prévio entra como duração/qualidade autorreferida; vigília contínua não é calculada | Tempo acordado até o fim da jornada não é calculado nem quando o despertar é informado | Calcular "horas acordado no fim da jornada" quando despertar e término forem reais; não estimar sem dado |
| Ritmo circadiano / WOCL | Doc 9966; ICAO Fatigue Management Guide for Helicopter Operators (2020) | Fatores de apresentação na madrugada e janela WOCL 02–06 h | Pesos não calibrados | Manter como fator de exposição, não como percentual de desempenho |
| Débito de sono acumulado e recuperação | Belenky et al. 2003; Van Dongen et al. 2003 (perda cumulativa com 6 h/noite) | "Algum sono < 6 h" +12 na quinzena; créditos de recuperação V2 | Conta ocorrência, não débito acumulado; não há regra de duas noites de sono irrestrito para recuperação | Medir débito cumulativo a partir de check-ins reais (sem estimar ausentes) |
| Sonolência subjetiva | KSS (Åkerstedt & Gillberg 1990); Samn-Perelli | KSS no check-in | Samn-Perelli ausente (é a escala recomendada em vários guias de FRMS para tripulações) | Opcional: adicionar Samn-Perelli no check-in de voo; não exigir ambos diariamente |
| Desempenho objetivo | PVT (Dinges & Powell 1985); PVT-B 3 min (Basner & Dinges 2011) | PVT-B em readiness | Limiar local sem validação | Registrar lapsos/tempo médio e comparar com baseline individual; não usar como apto/inapto |
| Prescritivo × FRMS | Doc 9966; RBAC 117 subparte de GRF/SGRF | Motor prescritivo completo; não há registro de SGRF aprovado | Software chama-se FRMS sem regime aprovado documentado | Exibir regime vigente (prescritivo + GRF) e não sugerir aprovação de SGRF |
| Gestão de risco (preditiva/proativa/reativa) | Doc 9966 cap. 4; Doc 9859 | Preditiva: projeção e escala programada (agora também art. 42); proativa: check-in/PVT; reativa: casos | Reativa sem ligação ao SGSO (AUD-021) | Ver AUD-021 |

Referências bibliográficas citadas são as publicações clássicas e de domínio público do tema; nenhum número delas foi usado para calibrar o produto nesta auditoria.

## 11. Linhagem de dados, integrações, jobs e observabilidade

**Cadeia vigente (verificada no código):** SIGVOOS → `services/sigvoos-frms.ts` (`syncSigvoosForFrms`) → `cv_voos`/`cv_voo_etapas`/`cv_voo_tripulantes` + `frms_jornada` (origem SIGVOOS) → `preferred-operational-source.ts` escolhe por dia/tripulante: Controle de Voos nativo (primário) → SIGVOOS/CV importado (fallback), campo a campo → `recalcularPipeline` (fatorização, acúmulo, alertas) → snapshot operacional → UI. O guard `guard:frms-no-direct-sigvoos` impede leitura direta do SIGVOOS pelo FRMS. Estados de proveniência: `operational_data_source` (`CONTROLE_VOOS`, `SIGVOOS`, `..._COM_FALLBACK_SIGVOOS`, `AUSENTE`), `jornada_data_source` (`REAL`, `MANUAL`, `ESTIMADO`, `AUSENTE`, `INCONSISTENTE`), `sleep/wake_data_source` (`REAL`, `ESTIMADO`, `AUSENTE`), `landings_evidence_quality` (`OBSERVED`, `CONFIRMED_ZERO`, `INCOMPLETE`).

**Robustez do job (positivo):** `cron/resilient/sigvoos-frms.ts` usa lease, estado durável por item, retentativa exponencial (até 1 h), esgotamento após 7 tentativas com alerta deduplicado, `INSERT OR IGNORE` de eventos e shadow-compare CV × legado sem afetar ingestão.

### FRMS-AUD-025 — Ingestão SIGVOOS importa só o dia corrente e nunca revisita
- **P1 · alta · comprovado (código) · especificado**
- `resolveNextSigvoosDay` (l. 113) importa `last_sync_to + 1` até a data operacional de São Paulo **do dia da execução**; a execução ocorre na hora configurada (default 19 UTC = 16:00 BRT, `shouldRunSigvoosAtCurrentHour`). O cron legado (`scheduled-handler.ts` l. ~940) faz o mesmo. Não há janela de retroação.
- **Consequências:** (1) voos realizados depois das 16:00 BRT do dia importado e relatórios de voo fechados depois disso **não entram** sem sincronização manual; (2) correções retroativas e cancelamentos posteriores no SIGVOOS não chegam ao FRMS; (3) como os acumulados somam só o que foi importado (AUD-005), a ausência vira zero nos limites legais. Mitigação existente: Controle de Voos nativo é a fonte primária quando preenchido.
- **Correção:** importar a janela `[D−3, D−1]` (dias encerrados) a cada execução, com upsert idempotente por etapa (`sigvoos_flight_report_id`/chave natural) e recálculo só dos tripulantes cujo hash de dados mudou; manter o dia corrente como "provisório". Registrar por dia/tenant `sync_status` (`PROVISORIO`, `CONSOLIDADO`, `FALHOU`) para alimentar a cobertura do AUD-005.

### FRMS-AUD-026 — Data de programação × data da jornada na contagem de pousos
- **P3 · média** — `resolveJornadaLandings` filtra `v.data_programacao = data da jornada`. Voo programado num dia e realizado após 00:00 do dia seguinte (missão noturna) é atribuído à data de programação. Correção: decidir a regra canônica (data da apresentação da jornada) e usar o vínculo `cv_voo_tripulantes`→jornada quando existir.

### FRMS-AUD-027 — Observabilidade da qualidade do dado para o usuário
- **P2 · média · observado** — já registrado em #1426 item 4: a UI não mostra última sincronização por fonte nem o impacto de atraso na avaliação atual. Com AUD-025 isso passa a ser crítico: a coordenação não sabe se o dia está provisório. Correção: exibir no cabeçalho da Operação "SIGVOOS sincronizado até DD/MM HH:MM (dias consolidados até DD/MM)" e marcar itens de dias provisórios.

## 12. Produto, navegação, relatórios e testes

### 12.1 Mapa de navegação atual (código)
- **Operação** `/frms` → `FrmsDashboard`/`FrmsFlightDashboard` (fila Bloqueio/Decisão/Confirmar/Normal, detalhe lateral com síntese, conformidade legal [novo], explicação do score, evidências).
- **Casos** `/frms/alertas` → `FrmsAlertasPainel` (ciência, tratamento, encerramento com eficácia).
- **Administração** (`FrmsWorkspaceNav`): Configuração (Parâmetros `/frms/configuracoes`, SIGVOOS `/frms/sigvoos`), Dados de entrada (Importar FIRA, Histórico FIRA, Escalas), Consulta (Relatórios `/frms/relatorios`).
- **Fora das três áreas:** `/frms/tripulante/:id` (ficha), `/frms/fadiga-acumulada`, `/frms/checkin`, `/frms/fadiga-painel`, `/frms/fadiga-historico`, `/frms/conceitos` (`/frms/metodologia` redireciona), `/frms/controle-operacional` e `/frms/*` redirecionam para `/frms`; consultas legadas são canonicalizadas (`frmsLegacyOperationalQuery`).
- Todas as rotas do frontend usam apenas `ProtectedRoute` (autenticado). O backend é a autoridade, então isso é aceitável, mas, somado a AUD-015/018, qualquer usuário autenticado abre a ficha de qualquer tripulante.

### 12.2 Achados de produto
- **FRMS-AUD-028 (P2) — Dois sistemas de check-in.** `frms-fadiga-checkin-legacy.ts` (1 991 linhas, score/KSS/FRAT, painel do gestor, export) e `frms-fadiga-checkin.ts` + `FrmsFlightCheckinFadiga.tsx` (1 355 linhas) coexistem. Risco de regras divergentes e manutenção dupla. Recomendação: CONSOLIDAR num único contrato (o legado ainda é o que grava `frms_fadiga_checkin`); só após inventário de chamadas no frontend e no Pilot App.
- **FRMS-AUD-029 (P2) — Páginas grandes demais para manutenção e teste.** `FrmsImportacaoFira.tsx` 1 661, `FrmsFlightCheckinFadiga.tsx` 1 355, `FrmsFichaTripulante.tsx` 1 098 linhas. SIMPLIFICAR por extração de lógica pura testável, sem redesign.
- **FRMS-AUD-030 (P3) — Relatório de conformidade não conta pendências de validação.** `db-service-relatorios.ts` agrega `compliance_status` corretamente (UNKNOWN → "não avaliados", sem virar conforme — positivo), mas não soma `compliance_pending_validation` (art. 42). Correção: coluna "dias com possível desconformidade a validar".
- **Positivo verificado:** relatórios aplicam escopo por setor (`getEmployeeSectorAccess` + `loadFrmsReportCrewScope`) e cabeçalhos `no-store`; o detalhe da Operação declara que indicadores favoráveis com confiança baixa "não comprovam aptidão" e que responsável/prazo não são atribuídos automaticamente.
- **Não verificado (NOT RUN):** renderização real, responsividade (1920→390 px), WCAG 2.2 AA, teclado/leitor de tela, gráficos e exportações dos Relatórios — exige staging com dados (#1426 item 7).

### 12.3 Testes
- Worker: 101 arquivos FRMS (925 testes) + rotas de tenant/guards (`frms-tenant-scope-guard`, `frms-guards-fail-closed`, `frms-escalas-tenant`, `frms-fira-tenant`, `frms-alerts-tenant-read`, `frms-relatorios-config-rbac`). Frontend: 67 arquivos (480 testes).
- **Lacuna (AUD-031, P2):** os testes de autorização cobrem isolamento **entre empresas**, não **entre papéis dentro da mesma empresa** — por isso AUD-015/017/018 passaram despercebidos. Criar matriz de testes negativos `piloto × gestor × admin` para cada endpoint de escrita e de leitura individual.
- Lacuna: nenhum teste garante que um caso em tratamento sobrevive ao recálculo (AUD-019).

## 13. Notas por dimensão (0–10, só com evidência desta auditoria)

| Dimensão | Nota | Base |
|---|---|---|
| Precisão do motor regulatório | 7 | Limites corretos e fail-closed; faltavam art. 42/37 e cobertura dos acumulados |
| Fundamentação científica dos scores | 3 | Pesos não calibrados (declarado no código e em #1476), rótulo de aptidão, mistura com qualidade de dado |
| Integridade dos dados / integrações | 5 | Job robusto e proveniência rica, mas sem retroação (AUD-025) e acumulados sem cobertura (AUD-005) |
| Segurança multi-tenant (entre empresas) | 8 | Escopo por empresa consistente e testado |
| RBAC dentro da empresa / LGPD | 3 | AUD-015/017/018 |
| Gestão de casos | 6 | Fluxo exige responsável/prazo/eficácia; recálculo apaga casos (AUD-019); sem prazo vencido/SGSO |
| Auditabilidade | 6 | `logAuditoria` com valor anterior; parâmetros governados com histórico |
| Testes | 6 | Volume alto, sem matriz de papéis |
| Layout, UX, acessibilidade, desempenho | não avaliável | NOT RUN |

Avaliação global: **não confiável para decisão autônoma; utilizável como apoio à coordenação** após corrigir AUD-015/017/018/019 (P1 de integridade e privacidade) e com a comunicação explícita de AUD-005/025.

## 14. Plano mestre consolidado (ordem recomendada)

| # | Achado | P | Tipo | Precisa de | Pode corrigir já? |
|---|---|---|---|---|---|
| 1 | AUD-019 recálculo apaga casos | P1 | código | — | Sim |
| 2 | AUD-017 ack de evento alheio | P1 | código | — | Sim |
| 3 | AUD-018 leitura individual sem escopo | P1 | código | regra de escopo por setor (já existe) | Sim |
| 4 | AUD-015 escrita de jornada/escala sem papel | P1 | código | decisão: tripulante lança a própria jornada? | Sim, com o padrão "gestor ou o próprio" |
| 5 | AUD-016 upload/exclusão FIRA | P2 | código | — | Sim |
| 6 | AUD-020 dedupe suprime escalada | P2 | código | — | Sim |
| 7 | AUD-025 ingestão sem retroação | P1 | código + operação | janela e custo de API SIGVOOS | Sim (janela D−3..D−1) após validar idempotência |
| 8 | AUD-005 cobertura dos acumulados | P1 | Schema V2 | workflow governado | Não nesta PR |
| 9 | AUD-001 ativar art. 42 | P1 | regulatório | parecer jurídico | Já implementado, ativação pendente |
| 10 | AUD-022/023/024 scores e rótulos | P1/P2 | científico/UX | Coordenação/SGSO + #1476 | Não sem decisão |
| 11 | AUD-021 prazo vencido, reabertura, SGSO, métricas | P2 | produto | definição do fluxo SGSO | Parcial |
| 12 | AUD-027/030 frescor e pendências no relatório | P2/P3 | UX | — | Sim |
| 13 | AUD-011/012/013 regras dependentes de interpretação | P2 | regulatório | parecer | Não |
| 14 | AUD-028/029 consolidação e simplificação | P2 | refatoração | inventário de consumidores | Depois |
| 15 | AUD-031 matriz de testes por papel | P2 | testes | — | Junto com 2–5 |
| 16 | Aceite visual, responsividade, WCAG | — | QA | staging populado (#1426) | Bloqueado |

## 15. Resposta à pergunta final (revisada com a Parte II)

O FRMS acrescenta mecanismos reais além das obrigações legais — check-in com KSS, apuração legal completa do trabalho, folga pós-missão, projeção pela escala e um fluxo de casos que exige responsável, prazo e eficácia. Mas hoje **não pode ser considerado um mecanismo efetivo e confiável de gerenciamento do risco de fadiga** porque: (1) qualquer usuário da empresa pode alterar jornadas e dar ciência a eventos de terceiros (AUD-015/017), o que compromete a integridade da evidência; (2) o recálculo apaga as decisões registradas (AUD-019), quebrando a cadeia decisão → ação → eficácia; (3) dias não importados contam como zero (AUD-005/025); (4) os scores não são validados e ainda emitem rótulo de aptidão (AUD-022). Corrigidos os itens 1–7 do plano, o FRMS passa a ser um apoio confiável à coordenação; a validação científica (#1476) define se os scores podem ir além de triagem.

## 16. Status de execução das correções (atualizado em 03/11/2026)

| Achado | Status | Onde | Testes |
|---|---|---|---|
| AUD-001 art. 42 | Implementado; ativação depende de `law_art42_enforced` | `law-art42-madrugadas.ts`, `regulatory-compliance.ts` | `law-art42-madrugadas.test.ts`, `regulatory-compliance.test.ts` |
| AUD-002 conformidade visível | Implementado | `FrmsRegulatoryCompliancePanel.tsx` | `FrmsRegulatoryCompliancePanel.test.tsx` |
| AUD-003/004 pousos | Implementado | `operational-load-resolver.ts`, `operational-load.ts` | `operational-load*.test.ts` |
| AUD-006 acumulado nulo | Implementado | `sanitizeRollingRegulatoryEvidence` | `regulatory-compliance.test.ts` |
| AUD-007 | Refutado | — | — |
| AUD-008 art. 37 | Implementado (sem composição da tripulação → não verificável) | `regulatory-compliance.ts` | idem |
| AUD-009 | Parcial (fonte LAW; outros tenants pendentes) | idem | idem |
| AUD-010 vigência ACT | Implementado | `compliance-policy.ts`, `frms-fadiga-acumulada.ts` | idem |
| **AUD-015 escrita sem papel** | **Implementado** — `assertTripulanteEmpresa`/`assertJornadaEmpresa` exigem também o escopo de setor: admin = empresa; gestor = seus setores; demais = só o próprio cadastro | `routes/frms-shared.ts` (`assertFuncionarioNoEscopoFrms`) | `frms-individual-scope.test.ts` |
| **AUD-016 FIRA** | **Implementado** — `requirePermission('frms','editar','admin','manager')` em upload (3) e exclusão | `routes/frms-fira.ts` | `frms-fira-tenant.test.ts` (negativo) |
| **AUD-017 ack alheio** | **Implementado** — não gestor só dá ciência ao próprio evento | `routes/frms-read-ack.ts` | `frms-read-ack-events.test.ts` (negativo + positivo) |
| **AUD-018 leitura individual** | **Implementado** — mesma regra do AUD-015, inclusive `GET /score-atual` | `frms-shared.ts`, `frms.ts` | `frms-individual-scope.test.ts` |
| **AUD-019 recálculo apaga casos** | **Implementado** — recálculo só substitui alertas não trabalhados; caso existente de nível ≥ bloqueia duplicata; piora de nível gera alerta novo | `alert-case-preservation.ts`, `db-service-jornadas.ts` | `alert-case-preservation.test.ts` (SQLite real) |
| **AUD-020 dedupe** | **Implementado** — suprime só repetição de nível igual ou menor | `cron/frms-daily-check.ts` | regra coberta por `alert-case-preservation.test.ts`; governança do cron sem regressão |
| AUD-005, 011–014, 021–031 (exceto 030) | Especificados, não implementados | — | — |
| AUD-030 | Não implementado (P3) | — | — |

**Risco de implantação de AUD-015/018 (verificar antes do deploy):** gestores que acessam fichas FRMS precisam estar vinculados aos setores dos tripulantes em `setores_gestores` (mesma regra já aplicada nos Relatórios). Gestor sem vínculo passa a receber 403 nas fichas individuais (`FRMS_INDIVIDUAL_SCOPE_DENIED`). Consulta de leitura recomendada antes do deploy: gestores com papel `manager` sem linha ativa em `setores_gestores`. Se o produto não deve permitir que o tripulante grave a própria jornada/escala, restringir também o modo `self` às leituras (decisão pendente).

---

# PARTE III — Auditoria aprofundada do cálculo de fadiga e da coleta de dados (prioridade do usuário)

Escopo: como o AirTrust coleta o estado do tripulante (check-in, sono, KSS, PVT) e como transforma isso em indicadores de fadiga (score do check-in, índice de efetividade, quinzena, recuperação, prontidão). Todos os achados abaixo foram comprovados por leitura do código e, quando indicado, por **casos de referência executados** contra as funções reais (`calcularScoreFadiga`, `calcularSono`, `calcularFatorRepouso`) com os parâmetros padrão da migration 0287 (`threshold_amarelo=40`, `threshold_vermelho=60`, pesos KSS 0,35 / duração 0,25 / qualidade 0,2 / sintomas 0,2) e a política legada de normalização.

## 17. Mapa da coleta → cálculo

```
Check-in (FrmsFlightCheckinFadiga.tsx / FrmsCheckinFadiga.tsx / Pilot App)
  campos: hora_apresentacao*, hora_acordou*, horas_sono_24h ou hora_dormiu*, qualidade_sono, kss_score,
          subjective_fatigue_level (enviado TAMBÉM como sleepiness_level), fit_for_duty, meds/álcool 12 h,
          oportunidade_sono_horas_24h, PVT (readiness)          (* obrigatórios no servidor)
  └─ POST /api/frms/fadiga-checkin (frms-fadiga-checkin-legacy.ts)
       normalizeCheckinInput → calcularScoreFadiga (score 0–100, VERDE..VERMELHO, APTO/INAPTO)
                             → evaluateDailyRisk (sono <4/<5 h, fadiga subjetiva ≥8/≥6, "sleepiness" ≥8/≥6)
       grava frms_fadiga_checkin (kss_score, horas_sono, score, nível, status_operacional)
  └─ recalcularPipeline (db-service-jornadas.ts) para a jornada do dia
       loadDailyCheckinEvidence → wakeTime + sleepHours24h
       calcEffectiveness(hora_dormiu = jornada.hora_dormiu, hora_acordou = check-in)   ← horas de sono NÃO entram
       grava frms_jornada.sono_efetivo_min/fonte_sono e frms_fatorizacao_jornada.effectiveness_*
  └─ snapshot operacional: alertas KSS_ALTO (KSS ≥7), SONO_INSUFICIENTE (0 < sono < 6 h), EFETIVIDADE_BAIXA…
  └─ indicador quinzenal (fortnight-indicator.ts): agravantes/atenuadores (#1476)
  └─ prontidão (readiness.ts): PVT + KSS + sono → preserved / attention / operational_review
```

## 18. Achados — cálculo e coleta de fadiga

### FRMS-FAD-001 — Horas de sono informadas no check-in são descartadas no índice de efetividade e sobrescritas por 8 h
- **P0 · alta · comprovado (código + caso executado)**
- **Onde:** `worker-airtrust/src/lib/frms/db-service-jornadas.ts` — chamada de `calcEffectiveness` (≈l. 549–560) passa `hora_dormiu: jornada.hora_dormiu` (só preenchido pelo `PATCH /jornada/:id/sono`) e `hora_acordou: checkinEvidence.wakeTime`; `checkinEvidence.sleepHours24h` não é passado. `fadiga-score.ts` `calcularSono` (≈l. 322): sem `horaDormiu` usa `horasSonoPadrao` (8 h, `frms-config.ts`) e marca `fonteSono = 'INFORMADO'` porque `horaAcordou` existe. Depois, o `UPDATE frms_jornada SET ... sono_efetivo_min = ?, fonte_sono = ?` (≈l. 574–592) grava 480 min e `INFORMADO`, **sobrescrevendo** o valor correto que o bloco anterior (≈l. 410–425) havia gravado a partir do check-in.
- **Caso executado:** `calcularSono({ apresentação 05:30, acordou 04:00, sem hora_dormiu })` → `sonoEfetivoMin = 480`, `fonteSono = 'INFORMADO'`, `calcularFatorRepouso(480) = 0`.
- **Impacto:** o tripulante que informa 4 h de sono (o formulário coleta horas, não horário de dormir) tem a efetividade calculada como se tivesse dormido 8 h, sem penalidade de sono, e o banco passa a registrar 8 h "informadas". O índice principal exibido na Operação fica otimista exatamente no cenário de maior risco. Mitigação parcial existente: o snapshot ainda gera `SONO_INSUFICIENTE` a partir de `frms_fadiga_checkin.horas_sono`, e o score quinzenal usa o check-in.
- **Correção exata:**
  1. Em `calcEffectiveness`/`calcularSono`, aceitar `sleepMinutesReported` (de `checkinEvidence.sleepHours24h`) e usá-lo como duração quando `horaDormiu` for nulo.
  2. `fonteSono` passa a descrever só a **duração**: `INFORMADO` apenas com `horaDormiu` ou `sleepMinutesReported`; caso contrário `PADRAO`.
  3. Sem nenhuma duração informada, não calcular `fatorRepouso` com 8 h: marcar `sono_indisponivel` e rebaixar a confiança (ver FAD-008).
  4. O `UPDATE` final não pode sobrescrever `sono_efetivo_min`/`fonte_sono` vindos do check-in com valores padrão.
- **Teste de aceitação:** check-in com `horas_sono_24h = 4`, sem `hora_dormiu` → `duracao_sono_efetiva_min = 240`, `fator_repouso_calibrado_pct = −0,25`, `fonte_sono = INFORMADO`; `frms_jornada.sono_efetivo_min` permanece 240 após o pipeline.

### FRMS-FAD-002 — Horário de sono inválido vira sono máximo (falha aberta)
- **P1 · alta · comprovado (caso executado)**
- `calcularSono`: `dormiu 04:30, acordou 04:00` (inversão/digitação) → 23 h 30 → limitado a **960 min (16 h)** → `fatorRepouso = 0`; `dormiu = acordou` → duração 0 → **substituída por 8 h** com `INFORMADO`.
- **Correção:** duração calculada > 14 h ou = 0 → rejeitar no check-in (`400 sleep_window_invalid`) e, no cálculo, tratar como indisponível. Nunca substituir dado inválido por padrão favorável.

### FRMS-FAD-003 — KSS ausente é gravado como 5 ("nem alerta nem sonolento")
- **P1 · alta · comprovado**
- `frms-fadiga-checkin-legacy.ts` `normalizeCheckinInput` (≈l. 213–218): sem `kss_score` e sem `sleepiness_level`, `kssScore = 5`; com só `sleepiness_level` (0–10), converte por `round(s/10·8)+1`. O valor é gravado em `frms_fadiga_checkin.kss_score` como qualquer outro. A proveniência (`CREW_REPORTED/DERIVED/DEFAULTED`, `kss-checkin-provenance.ts`) vai só para o evento em `frms_fadiga_evento`, não para a linha lida pelo snapshot, pelo score quinzenal (`KSS_ALTO_NO_PERIODO`) e pelos alertas. O próprio auditor IMA v3 já sinaliza `KSS_PERSISTIDO_PODE_SER_DERIVADO_OU_DEFAULT_5`.
- **Impacto:** dado fabricado apresentado como autorrelato; um KSS inexistente nunca gera alerta.
- **Correção:** tornar `kss_score` (1–9) obrigatório no check-in de tripulante; remover o default 5 e a conversão 0–10→KSS; persistir `kss_provenance` na própria linha (Schema V2) e tratar `DERIVED/DEFAULTED` legados como ausentes nos cálculos.

### FRMS-FAD-004 — KSS 9 resulta em VERDE / "APTO" no check-in
- **P0 · alta · comprovado (caso executado)**
- Casos com parâmetros padrão (8 h de sono, qualidade 5, sem sintomas): **KSS 5 → 14 VERDE APTO; KSS 7 → 24 VERDE APTO; KSS 8 → 30 VERDE APTO; KSS 9 → 35 VERDE APTO.** O peso do KSS (0,35) nunca alcança o limiar amarelo (40) sozinho. A regra sobreposta `evaluateDailyRisk` (≈l. 277) usa horas de sono, fadiga subjetiva e `sleepinessLevel` — **não usa o KSS**; e o formulário envia em `sleepiness_level` o valor da **fadiga subjetiva** (`FrmsFlightCheckinFadiga.tsx` ≈l. 718–720), não a sonolência. A função legada `calculateFadigaScore` tinha "KSS ≥ 9 → crítico", mas não é a usada pela rota.
- **Mitigação existente:** o snapshot gera `KSS_ALTO` para KSS ≥ 7 e a fila da Coordenação classifica como "Decisão". Porém o tripulante recebe "Apto para a jornada", o registro fica `status_operacional = 'APTO'`, e KSS 9 tem o mesmo alerta que KSS 7.
- **Correção:** (a) KSS entra em `evaluateDailyRisk` como gatilho explícito, independente da soma ponderada (proposta a validar: KSS 7 → atenção; KSS 8–9 → revisão obrigatória); (b) parar de enviar fadiga subjetiva como `sleepiness_level` — são construtos diferentes; (c) substituir o rótulo de aptidão (ver AUD-022). Os limiares exatos dependem da revisão científica (#1476); **não encontrei validação publicada de "KSS ≥ 7" como ponto de corte de desempenho** — a escala tem âncoras verbais em 1/3/5/7/9 e 7 = "sonolento, sem dificuldade para permanecer acordado"; usar 7 como limiar é decisão de política, não fato científico.

### FRMS-FAD-005 — Status inconsistente: nível AMARELO com status "APTO"
- **P2 · alta · comprovado** — `frms-fadiga-checkin-legacy.ts` ≈l. 983–994: quando `dailyRisk = attention` e o score é VERDE, o nível vira AMARELO mas `finalStatusOperacional` permanece o do score base (`APTO`). Correção: derivar status do nível final.

### FRMS-FAD-006 — 0 h de sono não gera SONO_INSUFICIENTE no snapshot
- **P2 · alta · comprovado** — `operational-snapshot.ts` ≈l. 846: `(horasSono ?? 0) > 0 && < 6`. Noite sem sono (0 h) é tratada como ausente. No check-in, `evaluateDailyRisk` (<4 h → crítico) cobre o caso, mas o alerta específico some. Correção: `horasSono != null && horasSono < 6`.

### FRMS-FAD-007 — "PVT-B" não segue o protocolo validado
- **P1 · alta · comprovado (código + referência verificada)**
- `src/react-app/lib/frms/operationalReadiness.ts` `PVTB_V2_PROTOCOL` e `worker-airtrust/src/lib/frms/readiness.ts`: **60 s**, intervalo 1–4 s, **lapso ≥ 500 ms**, mínimo 10 estímulos. O PVT-B validado (Basner, Mollicone & Dinges, 2011, Acta Astronautica) usa **3 min**, intervalo 1–4 s e **lapso > 355 ms**; os autores aceitaram perda média de 22,7 % no tamanho de efeito em troca da redução de 10 para 3 min e pediram validação adicional em campo. Um teste de 60 s com limiar de 500 ms não é o PVT-B e não tem validação conhecida.
- **Correção:** ou adotar o PVT-B (3 min, 355 ms) no check-in pré-voo, ou renomear para "teste breve de atenção (não validado)" e não usá-lo para classificar.

### FRMS-FAD-008 — Prontidão ignora o PVT isolado e não usa a linha de base individual
- **P1 · alta · comprovado** — `readiness.ts` `deriveReadinessAssessment` (≈l. 228): lapsos ≥ 20 % são apenas **um** sinal de alerta; "attention" exige **dois**. Com KSS e sono normais, **50 % de lapsos → `preserved`**. Nas 5 primeiras sessões (`minimumBaselineSessions`), nenhum sinal de alerta conta (`baseline_building`). A "linha de base individual" é só um contador de sessões: média/variabilidade pessoal de tempo de reação nunca é comparada.
- **Correção:** (a) lapsos elevados (ou queda relevante vs. a própria linha de base) bastam para "atenção"; (b) calcular a linha de base pessoal (mediana do tempo de reação, % lapsos) e sinalizar desvio; (c) durante a construção da linha de base, aplicar limiar absoluto conservador em vez de silenciar; (d) trocar "preserved" por linguagem que não sugira aptidão.

### FRMS-FAD-009 — Índice de efetividade: rótulos científicos sem a ciência correspondente
- **P1 · alta · comprovado**
- `calculos.ts` `calcEffectiveness` (≈l. 378–540): `effectiveness = 100 + 100·Σ(penalidades)` com componentes rotulados `processo_s` e `processo_c`. Na teoria de Borbély, Processo S é a pressão homeostática de sono (tempo acordado vs. dormido). Aqui `processo_s` = penalidade do **dia do ciclo embarcado** (`fator_ciclo_embarcado_pct`) menos créditos de recuperação; não há cálculo de tempo acordado. Vigília contínua até o fim da jornada (o principal determinante de fadiga aguda) **não é calculada**, mesmo quando despertar e término são reais. Débito de sono acumulado entre dias não existe.
- `tempo_abaixo_limiar_pct` é preenchido com **constantes** (45 min se noturno na decolagem, 30 se noturno no pouso, 30 se repouso < −5 %) — não é medido, e o nome diz "pct" mas o valor é minutos.
- Um modelo de dois processos real existe só no módulo de pesquisa `ima-v3-shadow.ts` (corretamente isolado).
- **Correção:** renomear componentes (`ciclo_embarcado`, `circadiano`), remover ou calcular de fato `tempo_abaixo_limiar`, acrescentar "horas acordado no fim da jornada" quando houver despertar e término reais, e exibir o índice como "exposição por regras", não "efetividade" (AUD-024).

### FRMS-FAD-010 — Créditos de recuperação baseados em oportunidade, não em sono; crédito de horas de voo "bancável"
- **P2 · alta · comprovado**
- `operational-policy-v2.ts` `computeRecoveryCredit` (≈l. 259): crédito por dia de sobreaviso proporcional a `absoluteRestHours` (oportunidade de repouso), não ao sono relatado — apesar de o check-in já coletar `horas_sono_24h` separado de `oportunidade_sono_horas_24h`. O módulo `recovery-model.ts` declara que a recuperação é "evidence-only" e **não** deve gerar bônus sem calibração; o `operational-policy-v2` gera bônus numérico que entra no índice (contradição entre módulos).
- `computeFlightHoursDelta` (≈l. 284): voar menos que o limiar num dia gera crédito que **anula a penalidade de horas de voo do dia seguinte**. Não há base fisiológica para compensar exposição de um dia com baixa exposição do dia anterior (a recuperação já é tratada por sono/repouso).
- **Correção:** crédito de recuperação condicionado ao sono relatado e limitado a anular penalidades de sono (não de ciclo); remover o crédito de horas de voo entre dias, ou tratá-lo como hipótese experimental fora do índice.

### FRMS-FAD-011 — Score do check-in: estrutura e validade
- **P1 · média** — (a) soma ponderada de construtos diferentes (sonolência, quantidade e qualidade de sono, sintomas, medicação, álcool) sem validação; (b) álcool/medicação somam pontos fixos (+15/+8) em vez de gatilhos de revisão; (c) sintomas são uma média 0–3 de itens livres; (d) faixas VERDE/AMARELO/LARANJA/VERMELHO por limiares configuráveis sem justificativa documentada; (e) `apto = 0` força só o vermelho do score, mas a regra diária já marca `NAO_APTO` — duas fontes de verdade para o mesmo campo.
- **Correção:** separar (1) gatilhos explícitos de revisão (autodeclaração de inaptidão, KSS alto, sono < limiar, álcool, medicação sedativa), (2) indicadores descritivos sem score, e (3) só depois de validação (#1476), um score.

### FRMS-FAD-012 — Coleta: imutabilidade, horário e duplicidade de conceitos
- **P2 · média · comprovado**
- (a) **Reenvio sobrescreve** o check-in do dia (`UPDATE frms_fadiga_checkin`, ≈l. 1048); há evento `CHECKIN_ATUALIZADO` e auditoria, mas a linha passa a mostrar só o último valor. Para autorrelato de segurança, a primeira resposta pré-voo deve ser imutável e as correções versionadas com horário.
- (b) `reference_date`/`data_checkin` aceitam **qualquer data** (passada ou futura) sem limite (`frms-fadiga-checkin.schema.ts`); permitir só a data operacional atual (e, para correção, D−1 com justificativa).
- (c) O horário do check-in em relação à apresentação (`submitted_at` × `hora_apresentacao`) não classifica se o relato foi pré-voo; relato após a apresentação não deveria contar como avaliação pré-missão.
- (d) **Fadiga ≠ sonolência:** o formulário envia o mesmo valor em `subjective_fatigue_level` e `sleepiness_level`, e a regra diária testa os dois (duplicando o mesmo sinal com rótulos diferentes). A missão pede não confundir os construtos. Correção: coletar Samn-Perelli (fadiga, 1–7) ou manter só a fadiga subjetiva 0–10, e usar o KSS como sonolência.
- (e) Rótulos do KSS em português (`KSS_OPCOES`) correspondem à escala estendida; verificar se há versão brasileira validada antes de afirmar validade da tradução.

### FRMS-FAD-013 — Score quinzenal (complemento à #1476)
- A fórmula e os pesos estão documentados na #1476 (`0,65·%HV168h + agravantes + atenuadores + tendência`, ATENÇÃO 45 / CRÍTICO 75). Acrescento: (a) o agravante "algum KSS ≥ 7" usa o `kss_score` que pode ser o default 5 (FAD-003) — KSS ausente nunca agrava; (b) "algum sono < 6 h" usa o check-in, mas a efetividade do mesmo dia usa 8 h (FAD-001) — dois números contraditórios para o mesmo dia na mesma tela; (c) "alguma efetividade < 70 %" herda o otimismo de FAD-001; (d) qualidade de dado entra como pontos de fadiga (AUD-023).

### FRMS-FAD-014 — Normas de jornada que afetam a exposição (registro)
- Verificado no texto do RBAC 117 Emd 01 (quadro comparativo oficial da ANAC, CP 08/2024):
  - **A117.15(m):** o limite de 2 madrugadas consecutivas / 4 em 168 h também está no RBAC 117. Só pode ser alterado por manual aprovado pela ANAC; isso reforça AUD-001.
  - **A117.15(e) redutor noturno:** cada hora de trabalho noturno conta como 52 min 30 s para fins de jornada. Considera-se noturno o trabalho em terra entre 22:00 e 05:00 local e o voo entre 18:00 e 06:00 no fuso da base. **Não implementado** (nenhuma ocorrência de redutor no código), então jornadas noturnas são subcontadas nos limites.
  - **A117.15(c):** acréscimo de jornada por interrupção fora da base. Há tratamento parcial em `calculos.ts` (`validarRepousoPlataforma`); a conferência completa não foi feita.

## 19. Matriz de testes executados nesta parte

| Caso | Função | Resultado | Status |
|---|---|---|---|
| KSS 5/7/8/9, 8 h, qualidade 5 | `calcularScoreFadiga` | 14/24/30/35 — todos VERDE APTO | FAIL (FAD-004) |
| KSS 9, 4 h, qualidade 2 | idem | 69 LARANJA INAPTO | PASS |
| KSS 3, 3 h, qualidade 5 | idem | 30 VERDE (score); regra diária → crítico | PASS na rota, FAIL no score isolado |
| Só despertar 04:00 | `calcularSono` | 480 min, INFORMADO | FAIL (FAD-001) |
| Dormiu 04:30, acordou 04:00 | `calcularSono` | 960 min, INFORMADO | FAIL (FAD-002) |
| Dormiu = acordou | `calcularSono` | 480 min, INFORMADO | FAIL (FAD-002) |
| Pipeline: check-in 4 h sem horário de dormir | `recalcularPipeline` | efetividade com 8 h e `sono_efetivo_min` sobrescrito | FAIL por leitura de código (FAD-001) — teste automatizado a criar |
| PVT 50 % lapsos, KSS 5, 8 h, linha de base pronta | `deriveReadinessAssessment` | `preserved` | FAIL por leitura de código (FAD-008) |

## 20. Correções na Parte II à luz da verificação de referências

- Seção 10.1: onde se lê que "KSS ≥ 7 associa-se a queda de desempenho", corrigir para: KSS é validado contra desempenho e EEG (Gillberg, Kecklund & Åkerstedt; Kaida et al., 2006), mas **não foi encontrado ponto de corte validado em 7**; o limiar é escolha de política.
- Seção 10.2: PVT-B confirmado como 3 min / lapso > 355 ms (Basner, Mollicone & Dinges, 2011).
- As demais referências (Borbély 1982; Belenky 2003; Van Dongen 2003; ICAO Doc 9966) não foram conferidas na fonte nesta execução e devem ser tratadas como citações a confirmar.

## 21. O que ainda não foi feito (honestidade de escopo)

- **Bloqueado por acesso:**
  - interação real nas telas (staging sem dados FRMS e sem credencial);
  - dados de produção: distribuição real de KSS (quantos são 5 por default), proporção de check-ins sem horário de dormir, impacto de FAD-001 nos índices, lapsos de PVT. As consultas estão no plano.
- **Não lidos:**
  - manuais da Costa do Sol, IS 117, Doc 9966, guia ICAO para helicópteros, FAA AC 120-103A, CASA;
  - módulos `fira-parser`, `redemet-weather`, `environmental-risk`, `frms-dispatch-gate` (Controle de Voos), `parameter-governance` (governança dos parâmetros);
  - o PR do BOA (#1650).
- **Não feitos:** benchmarking de produtos comerciais, desempenho e volume, wireframes.
