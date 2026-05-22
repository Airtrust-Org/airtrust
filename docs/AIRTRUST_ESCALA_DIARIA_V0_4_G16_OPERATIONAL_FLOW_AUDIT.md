# AIRTRUST v0.4-G16 — Auditoria ampla do fluxo operacional da Escala Diária (D-1), quinzena e FRMS

Data da auditoria: 2026-05-22  
Projeto: AirTrust  
Escopo: Escala Diária de Voo (`/escalas/diaria`) com foco em domínio operacional D-1

## 1) Problema reportado
A coordenação monta a EDV no dia anterior (ex.: 22/05/2026 às 19h para operar 23/05/2026). A ausência de check-in do dia futuro não pode gerar alerta operacional na montagem. O sistema estava sinalizando `SC` para dia futuro e induzindo decisão errada.

## 2) Fluxo operacional real D-1/D+1
Definições:
- `data_escala`: dia da operação planejada na EDV.
- `data_montagem`: dia em que a EDV está sendo montada.
- `data_frms_referencia`: data usada para consulta de FRMS no momento da montagem.
- `status_frms_futuro`: não aplicável antes do check-in do dia futuro.

Regra aplicada:
- Se `data_escala > hoje`, FRMS consulta `hoje` (referência D-1).
- Se `data_escala <= hoje`, FRMS consulta `data_escala`.

Fluxo:
1. SIGVOOS/FRMS consolida estado conhecido do dia corrente.
2. Coordenação abre EDV do dia seguinte.
3. Sistema filtra elegibilidade macro (quinzena/modelo/situações).
4. Sistema exibe alertas FRMS de referência (D-1), não check-in futuro.
5. Coordenação define PIC/SIC.
6. Conflitos/alertas exigem justificativa operacional quando aplicável.
7. Publicação da EDV.
8. No dia D, eventos novos de check-in geram alerta posterior para ajuste operacional.

## 3) Datas e referência FRMS
Implementado em frontend:
- `getFrmsReferenceDate(dataEscala)`:
  - `dataEscala > today` => `today`
  - `dataEscala <= today` => `dataEscala`
- Chamadas FRMS da EDV passaram a usar `data_frms_referencia`.

## 4) Regra de quinzena
Regra operacional adotada nesta fase:
- Selecionáveis normais: tripulantes elegíveis e na quinzena alvo.
- Fora da quinzena: não selecionáveis como opção normal (podem aparecer bloqueados com motivo quando `incluir_bloqueados=true`).

Ajuste aplicado no backend `tripulantes-operacionais`:
- `quinzena` deixou de ser só ordenação.
- Fora da quinzena vira `pode_ser_alocado=false` + `conflict_code=OUT_OF_QUINZENA` + motivo explícito.

## 5) Regra Escala Mensal -> EDV
Mantida a diretriz já consolidada:
- Escala mensal é base de disponibilidade planejada.
- Divergência com mensal gera `soft_conflict` (aviso), não bloqueio duro.
- Férias/afastamentos reais continuam bloqueio duro.

## 6) Regra FRMS na EDV
Regra aplicada:
- FRMS é fonte de risco/alerta para decisão operacional, não bloqueio automático.
- `attention`, `critical`, `unfit_for_duty`, alerta ativo, `not_submitted` aplicável na data de referência: podem exigir justificativa operacional.
- Ausência de check-in futuro (D+1 antes do dia começar): não deve gerar alerta na montagem D-1.

## 7) Hard blocks vs soft conflicts
Hard blocks (não selecionar):
- Férias/afastamento real.
- Situação bloqueante real.
- Fora da quinzena operacional (nesta fase).
- Incompatibilidade modelo/habilitação já refletida em elegibilidade.
- PIC = SIC (validação de publicação/salvamento).

Soft conflicts (selecionável com aviso):
- Divergência com alocação mensal em outra aeronave/situação.
- Conflitos de planejamento mensal que não são impeditivos operacionais imediatos.

## 8) Bugs e UX encontrados
P0/P1:
- P1: FRMS consultado por `data_escala` futura, gerando `SC` indevido na montagem D-1.
- P1: legenda FRMS induzia leitura de `SC` sem contexto de data de referência.
- P1: ausência de explicação explícita da referência FRMS na tela.

P2:
- P2: campo de observações duplicado no formulário de criação de EDV.

## 9) Correções aplicadas
Frontend (`src/react-app/pages/escalas/EvdPage.tsx`):
- FRMS `daily-fatigue` e `alerts` agora usam `data_frms_referencia`.
- Banner informativo de referência FRMS (D-1 vs mesmo dia).
- Mensagens FRMS com data de referência explícita.
- `getFrmsRosterLabel` com fallback `Sem referência` (em vez de `SC` implícito sem contexto).
- Justificativa operacional FRMS mostra causa com data de referência.
- Removida duplicidade de campo de observações no formulário.

Backend (`worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`):
- Quinzena aplicada como elegibilidade (fora da quinzena => não selecionável normal).
- Preservação de bloqueio prévio ao aplicar conflitos de escala mensal.
- Conflito mensal permanece `soft_conflict` (não bloqueio duro).

Script (`scripts/diagnose-evd-availability-frms.sh`):
- Inclui `data_escala`, `data_montagem`, `data_frms_referencia`.
- FRMS chamado com `data_frms_referencia`.
- Resumo separado para `elegiveis`, `fora_quinzena`, `hard_blocks`, `soft_conflicts`.
- Destaque de `not_submitted_futuro_ignorado` quando em contexto D-1.

## 10) Pendências
- Refinar UX para separar visualmente listas: elegíveis, fora da quinzena e bloqueios duros (atualmente fora da quinzena aparece no grupo de bloqueados).
- Definir política oficial para exceções fora de quinzena (desbloqueio por justificativa versus manutenção de bloqueio).
- Eventual ajuste de texto de conflito mensal para distinguir "conflito de planejamento" de "impedimento operacional".

## 11) Cenários mínimos de teste
A. D-1 normal: escala futura usa FRMS de hoje.  
B. Mesmo dia: escala usa FRMS do próprio dia.  
C. Fora da quinzena: não aparece como selecionável normal.  
D. Conflito mensal: permanece selecionável com `soft_conflict`.  
E. Férias/afastamento: bloqueio duro.  
F. FRMS attention/critical/unfit: alerta + justificativa, sem bloqueio automático.  
G. FRMS indisponível: banner técnico; EDV não é bloqueada automaticamente.  
H. PIC = SIC: bloqueio de validação.  
I. Modelo AW139/SK76: elegibilidade por modelo correta.  
J. Alias SK76/S76: normalização preservada.

## 12) Próximos passos
1. Executar diagnóstico com token seguro em data D-1 e D para validar comportamento em produção.
2. Validar com coordenação operacional se fora de quinzena deve ficar bloqueado ou virar "conflito suave com justificativa".
3. Após validação operacional, fechar ajuste de UX de seções separadas para reduzir erro humano.
