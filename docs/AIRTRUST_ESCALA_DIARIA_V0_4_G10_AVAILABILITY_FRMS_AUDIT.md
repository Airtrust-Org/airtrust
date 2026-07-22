# AIRTRUST v0.4-G10 — Auditoria de Disponibilidade e FRMS na Escala Diária

Data da auditoria: 2026-05-21  
Projeto: AirTrust  
Escopo: `/escalas/diaria` + integrações com Escala Mensal, Alocações e FRMS

## 1) Problema reportado pelo usuário
Na Escala Diária:
- aeronaves ativas carregam;
- após selecionar aeronave, maioria dos tripulantes aparece bloqueada;
- mensagens frequentes: `Indisponíveis (bloqueados)`, `Em Simulador`, `Alocado em PR-SEC Q2`, `Indisponível`;
- banner FRMS: `FRMS indisponível no momento...`;
- necessidade de auditoria ponta a ponta de filtros de disponibilidade, quinzena e FRMS.

## 2) Sintomas observados
Sintomas confirmados por leitura de código:
- Frontend monta URL de disponibilidade com `aeronave_id`, `data_inicio`, `data_fim`, `quinzena`, `incluir_bloqueados=true` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:1475)).
- Frontend separa retorno em aptos vs bloqueados por `pode_ser_alocado` e exibe `motivo_bloqueio` no `<optgroup>` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:1486), [EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:1773)).
- FRMS indisponível é ativado por erro de qualquer um dos endpoints `daily-fatigue` ou `daily-fatigue/alerts` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:520)).

## 3) Fluxo frontend -> backend
### 3.1 Aeronaves ativas
- Frontend: `GET /api/aeronaves?somente_ativas=1` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:513)).
- Uso: seleção por prefixo/modelo no modal.

### 3.2 Tripulantes operacionais
- Frontend: `GET /api/escalas/tripulantes-operacionais?...` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:1475)).
- Rota backend: `/api/escalas/tripulantes-operacionais` montada por [escalas-core.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-core.ts:72), implementada em [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:83).

### 3.3 FRMS daily-fatigue
- Frontend: `GET /api/frms/daily-fatigue?date=YYYY-MM-DD&scope=team` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:507)).
- Backend: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:667).

### 3.4 FRMS alerts
- Frontend: `GET /api/frms/daily-fatigue/alerts?date=YYYY-MM-DD` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:511)).
- Backend: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:815).

## 4) Endpoint de aeronaves
- Query usada: `somente_ativas=1`.
- Frontend ainda reforça filtro local de ativo via `isAeronaveAtiva` ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:396)).

## 5) Endpoint de tripulantes operacionais (auditoria)
## 5.1 Query params esperados
- `aeronave_id` (obrigatório, ou `__sem_aeronave__`)
- `escala_id` (opcional)
- `funcao` (opcional)
- `data_inicio`, `data_fim` (opcional, usados para conflito)
- `quinzena` (opcional)
- `incluir_bloqueados` (opcional)

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:83).

## 5.2 Como define `pode_ser_alocado`
Vem do status operacional do CTE de tripulante:
- `APTO`, `ATENCAO_CMA`, `ATENCAO_FRMS` => `true`
- `BLOQUEADO_CMA`, `BLOQUEADO_FRMS` => `false`

Fonte: [getTripulanteOperacional.ts](<AIRTRUST_ROOT>/worker-airtrust/src/shared/getTripulanteOperacional.ts:319).

## 5.3 Como define motivo de bloqueio
Quando há conflito de alocação/situação/férias no período, o endpoint sobrescreve para `pode_ser_alocado=false` e preenche `motivo_bloqueio` com:
- situação especial (`Em Simulador`, etc.) + período;
- ou `Alocado em <prefixo> Q<quinzena>`.

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:305).

## 5.4 Simulador / outra aeronave / férias / situação
Todos entram como conflito por sobreposição de período (`data_inicio`/`data_fim`) quando bloqueadores.

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:210).

## 5.5 Quinzena (Q1/Q2)
- `quinzena` no endpoint **não bloqueia**. Só ordena prioridade (preferencial / personalizada / oposta).
- `Q1/Q2` no motivo vem de `escala_alocacoes.quinzena_id -> escalas_quinzenas.numero`.

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:175).

## 5.6 Modelo da aeronave (AW139/SK76/S76)
- Normalização: `S76`/`SK76` => `SK76`; `AW139` => `AW139`.
- Filtro aceita aliases e múltiplas fontes de habilitação (novo + legado).

Fonte: [getTripulanteOperacional.ts](<AIRTRUST_ROOT>/worker-airtrust/src/shared/getTripulanteOperacional.ts:44), [getTripulanteOperacional.ts](<AIRTRUST_ROOT>/worker-airtrust/src/shared/getTripulanteOperacional.ts:416).

## 6) Endpoint FRMS daily-fatigue
## 6.1 Parâmetros
- `date` (opcional, default hoje)
- `scope` (usar `team` para visão de equipe)

Fonte: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:670).

## 6.2 Dependência de tenant/autenticação
- Rota protegida por `auth()` e depende de `getEmpresaId()` (tenant context).
- Sem tenant válido: erro e retorno 500 genérico da rota.

Fontes: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:22), [tenant.ts](<AIRTRUST_ROOT>/worker-airtrust/src/middleware/tenant.ts:378).

## 6.3 Regras de status
- `normal`, `attention`, `critical`, `unfit_for_duty`
- sem check-in com jornada => `not_submitted`
- sem jornada => `no_duty`

Fonte: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:755).

## 7) Endpoint FRMS alerts
- Para gestor: combina alertas persistidos com sintéticos de `not_submitted`.
- Para não-gestor: retorna no máximo alerta próprio.

Fonte: [frms-fadiga-checkin.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/frms-fadiga-checkin.ts:815).

## 8) Causa provável dos tripulantes indisponíveis
### Causa principal confirmada por código
O frontend EVD **não envia `escala_id`** ao consultar disponibilidade ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:1475)).

No backend, quando existe conflito de período em `escala_alocacoes`, só libera se for `mesmoEscalaAtual` (`conflito.escala_id === escala_id`); sem `escala_id` isso nunca ocorre, então vira bloqueio.

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:323).

Impacto direto:
- tripulante já alocado na escala mensal pode aparecer como bloqueado na EVD mesmo quando deveria ser candidato;
- mensagens como `Alocado em PR-SEC Q2` tendem a inflar.

### Causa secundária
Conflito é calculado por **sobreposição de período** e não por "mesma aeronave"; alocação em outra aeronave no período também bloqueia.

Fonte: [escalas-tripulantes-operacionais.ts](<AIRTRUST_ROOT>/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts:245).

## 9) Causa provável do FRMS indisponível
## 9.1 O que dispara o banner
`frmsUnavailable = frmsDailyError || frmsAlertsError`.

Fonte: [EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:520).

## 9.2 Hipóteses técnicas mais prováveis
1. erro de tenant/auth em `/api/frms/daily-fatigue` ou `/alerts`;  
2. erro SQL interno (schema/coluna ausente no bloco de daily fatigue);  
3. role sem `scope=team` (degrada para retorno próprio; não deveria quebrar, mas pode gerar sensação de vazio);
4. payload de erro `{ success:false }` tratado como exception pelo `useApi`.

Sem `TOKEN` neste ambiente, não foi possível confirmar por chamada real.

## 10) Tabela de tradução FRMS -> EVD
| FRMS bruto | Exibição escala | Coluna F (proposta) | Ação |
|---|---|---|---|
| `normal` | FRMS OK | `OK` | sem ação |
| `attention` | Atenção | `ATN` | justificativa recomendada |
| `critical` | Revisão operacional | `REV` | justificativa obrigatória |
| `unfit_for_duty` | Revisão operacional/Inapto | `IND` | bloqueio operacional + justificativa |
| `not_submitted` | Sem check-in | `SC` | alerta e revisão |
| `no_duty` | Sem jornada | `—` | sem bloqueio EVD por FRMS |
| endpoint error | FRMS indisponível | `?` | banner amarelo, não mascarar como OK |
| auth/tenant error | erro técnico | `?` | corrigir fluxo de auth/tenant |

Privacidade: não expor `KSS`, horas de sono, sintomas, medicação, álcool, observações pessoais na EVD pública/snapshot.

## 11) Comunicação Escala Mensal <-> Escala Diária
- UI EVD calcula quinzena por data (`<=15 => primeira; >15 => segunda`) ([EvdPage.tsx](<AIRTRUST_ROOT>/src/react-app/pages/escalas/EvdPage.tsx:354)).
- Backend de disponibilidade usa `quinzena` só para ordenação, não para bloqueio.
- Bloqueios Q2 vistos na UI vêm de conflito de `escala_alocacoes` no período, não da regra de quinzena em si.

## 12) Matriz de bloqueio por tripulante (com base nos sintomas reportados)
| Tripulante | Motivo visto | Classificação | Leitura técnica |
|---|---|---|---|
| Diego | Em Simulador 17/05/2026 -> 22/05/2026 | A (correto) | conflito de situação bloqueadora no período |
| Magioli | Alocado em PR-SEC Q2 | B (suspeito) | provável bloqueio inflado por ausência de `escala_id` na chamada EVD |
| Negreiros | Indisponível | C | sem payload real não dá para rastrear fonte exata |
| Dieter | Indisponível | C | idem |
| La Rocque | Indisponível | C | idem |
| Marinho | Indisponível | C | idem |
| Nery | Indisponível | C | idem |
| Ramos | disponível para PIC no SK76 com FRMS indisponível | B | elegibilidade operacional ok; problema provável no endpoint FRMS |

## 13) Cenários operacionais mínimos projetados
A) operação normal SK76 -> salva/publica  
B) PIC = SIC -> bloqueio  
C) fora da quinzena -> bloqueado com motivo claro  
D) alocado outra aeronave mesmo período -> bloqueio/alerta  
E) FRMS attention -> ATN + justificativa  
F) FRMS critical/unfit -> REV/IND + justificativa obrigatória  
G) FRMS sem check-in -> SC + alerta  
H) endpoint FRMS indisponível -> banner sem inventar OK  
I) AW139 -> só habilitados AW139  
J) SK76/S76 -> alias preservado  
K) sem aeronave ativa -> mensagem adequada

## 14) Testes executados nesta auditoria
- Auditoria estática completa frontend/backend das rotas e filtros.
- Verificação de montagem de rotas no worker e dependência de tenant/auth.
- Teste em API real: **não executado** (TOKEN ausente no ambiente atual).

## 15) Bugs confirmados
1. **Bloqueio indevido por ausência de `escala_id` na chamada EVD de tripulantes operacionais** (impacto alto).  
2. **Acoplamento frágil da UI FRMS**: qualquer falha em um endpoint derruba status resumido com banner único, sem granularidade de causa (impacto médio).  
3. **Ambiguidade de quinzena**: `quinzena` enviada pela UI não atua como bloqueio no endpoint (impacto médio de entendimento/UX).

## 16) Hipóteses descartadas
- "Filtro de aeronaves ativas não carrega" -> descartada (carrega e ainda filtra local).  
- "Alias S76/SK76 inexistente" -> descartada (normalização existe em frontend e backend).

## 17) Recomendações de correção (priorizadas)
P0:
- Enviar `escala_id` na consulta de `/api/escalas/tripulantes-operacionais` usada pela EVD.
- Revisar regra de conflito para EVD: distinguir alocação mensal base vs indisponibilidade real.

P1:
- Melhorar retorno de `motivo_bloqueio` com códigos (`ALOCACAO_OUTRA_ESCALA`, `SIMULADOR`, `FERIAS`, etc.).
- FRMS: diferenciar no frontend `erro técnico` vs `sem check-in` vs `sem jornada`.

P2:
- Harmonizar quinzena: definir contrato único (`primeira/segunda` ou `Q1/Q2`) e uso explícito para regra operacional.

## 18) Correções por camada
Frontend:
- incluir `escala_id` na chamada de disponibilidade EVD;
- tratar separadamente erro de `daily-fatigue` e `alerts`;
- mapear mensagens de bloqueio por código.

Backend:
- ajustar lógica de conflito para contexto EVD;
- enriquecer payload de bloqueio;
- auditar robustez SQL do `daily-fatigue` para evitar 500 silencioso.

Dados/cadastro:
- padronizar `funcao/cargo` canônico (comandante/copiloto);
- revisar consistência de alocações de situação e período;
- garantir habilitações por modelo em fonte canônica.

## 19) Próximos passos
1. Rodar `scripts/diagnose-evd-availability-frms.sh` com `TOKEN` seguro em homolog/prod para evidência real por tripulante.  
2. Aplicar correção mínima de contrato (`escala_id`) e repetir cenários A-K.  
3. Só após isso validar publicação EVD com FRMS e justificativas estruturadas.
