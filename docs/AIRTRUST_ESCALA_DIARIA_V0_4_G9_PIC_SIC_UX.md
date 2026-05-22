# AIRTRUST v0.4-G9 — Escala Diária PIC/SIC UX

## 1) Problema reportado
Na tela `/escalas/diaria`, aeronaves ativas apareciam, mas os seletores de PIC/SIC ficavam vazios. A UX ainda mantinha campos manuais indevidos (qualificação, assento e tripulante extra), e os horários exigiam interação fragmentada.

## 2) Causa encontrada para tripulantes não aparecerem
A causa principal foi no frontend (`EvdPage.tsx`):
- `useApi` já desembrulha `result.data` quando a API retorna `{ success: true, data: ... }`.
- A tela tratava a resposta novamente como `{ success, data }` e lia `tripulantesRaw?.data?.tripulantes`.
- Resultado: lista efetiva ficava vazia por leitura em nível incorreto.

Também havia o mesmo padrão em outras chamadas da mesma tela (`/api/evd`, publicações e FRMS), corrigido para o shape real retornado pelo hook.

## 3) Endpoints e parâmetros corrigidos
### Tripulantes elegíveis por aeronave/modelo/data
`GET /api/escalas/tripulantes-operacionais`

Parâmetros utilizados na seleção da aeronave:
- `aeronave_id=<id>`
- `incluir_bloqueados=true`
- `data_inicio=<YYYY-MM-DD>`
- `data_fim=<YYYY-MM-DD>`
- `quinzena=<primeira|segunda>`

### Aeronaves ativas
`GET /api/aeronaves?somente_ativas=1`

### FRMS resumido (sem sensíveis)
- `GET /api/frms/daily-fatigue?date=<YYYY-MM-DD>&scope=team`
- `GET /api/frms/daily-fatigue/alerts?date=<YYYY-MM-DD>`

## 4) Regra PIC implementada
- Opções normais do PIC: apenas tripulantes elegíveis (`pode_ser_alocado=true`) com papel canônico de comandante (`COMANDANTE/PIC/CMT/COMMANDER`).
- Bloqueados retornados pelo backend são mostrados em grupo separado “Indisponíveis (bloqueados)”, desabilitados.
- Se não houver papel canônico disponível no cadastro, aplica fallback heurístico controlado com aviso operacional explícito.

## 5) Regra SIC implementada
- Opções normais do SIC: tripulantes elegíveis com papel de copiloto (`COPILOTO/SIC/COP/COPILOT`) e também comandantes elegíveis quando permitido pelo cadastro.
- Bloqueados também aparecem em seção separada e desabilitada.
- Fallback heurístico controlado com alerta quando o cadastro de função não é canônico.

## 6) Campos removidos
Removidos do formulário:
- Tripulante extra
- Qualificação comandante (input livre)
- Assento comandante (input livre)
- Qualificação copiloto (input livre)
- Assento copiloto (input livre)

Substituição:
- badges automáticas por seleção para Qualificação, Assento (PIC/SIC) e FRMS.

## 7) Input de horário
Implementada normalização de campo único por horário:
- `0730` -> `07:30`
- `730` -> `07:30`
- `07:30` -> `07:30`
- `7:30` -> `07:30`
- `0700` -> `07:00`

Validação:
- hora `00-23`
- minuto `00-59`
- formatação em `blur` para `HH:mm`

Aplicado em:
- Apresentação
- Início
- Término

## 8) UX nova
O formulário foi reorganizado em painel compacto com quatro seções:
1. Aeronave
2. Tripulação (PIC/SIC + badges)
3. Horários
4. Base e observações

Mantido fluxo aircraft-first e removido excesso de campos de digitação operacional indevida.

## 9) Teste funcional
Atualizado `scripts/test-evd-functional.sh`:
- criação por aeronave sem tripulante extra;
- seleção de PIC/SIC distintos por regra de função (com fallback quando necessário);
- bloqueio PIC=SIC;
- publicação por data;
- revisão/snapshot;
- verificação de ausência de campos sensíveis FRMS no snapshot.

## 10) Limitações
- A classificação de função depende da qualidade do cadastro textual (`role`); quando não canônico, usa fallback heurístico com aviso.
- O teste funcional completo continua exigindo `TOKEN` seguro e dados reais elegíveis no ambiente alvo.
