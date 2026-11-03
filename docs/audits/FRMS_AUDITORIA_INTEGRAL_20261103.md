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
