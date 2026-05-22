## Tokens criados

- escalaTokens.ts: Q1, Q2, EVENT_TOKENS, EVENT_PRIORITY, CELL
- escala-theme.ts: apontado para os tokens canônicos
- quinzena-tokens.ts: alinhado aos novos tokens de Q1/Q2

## Normalizador

- buildDayCellState.ts: criado
- DayCell.tsx: adaptador legado recriado para traduzir EscalaEvento -> DayEvent
- dayCellState.ts: mantido no fluxo antigo existente; não foi removido nesta rodada

## Componente atômico

- EscalaDayCell.tsx: criado e integrado via DayCell.tsx
- Componentes centrais usando a nova base: BlocoAeronave, LinhaSituacao, GradeTripulantes

## Hardcodes removidos

- Núcleo migrado: headers Q1/Q2, pills de quinzena nos modais principais, legenda, células diárias do núcleo da grade
- Auditoria residual após a rodada:
  - 90 ocorrências restantes de classes cromáticas sky/amber/cyan em src/react-app/pages/escalas fora de escalaTokens.ts
  - 125 ocorrências restantes de classes geométricas diretas em src/react-app/pages/escalas/components fora de EscalaDayCell.tsx
- Conclusão: a padronização estrutural do núcleo foi aplicada, mas a limpeza global do módulo ainda não chegou a zero hardcodes

## Componentes refatorados

| Arquivo                                                                      | Problema                                                        | Solução                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| src/react-app/pages/escalas/constants/escalaTokens.ts                        | Não havia source of truth único                                 | Tokens canônicos de Q1/Q2, eventos e geometria criados  |
| src/react-app/pages/escalas/utils/buildDayCellState.ts                       | Não havia normalizador atômico no formato novo                  | Função criada com prioridade e tooltip consolidada      |
| src/react-app/pages/escalas/components/EscalaDayCell.tsx                     | Célula diária atômica inexistente                               | Componente novo com geometria fixa e estado único       |
| src/react-app/pages/escalas/components/EscalaCalendario/DayCell.tsx          | Arquivo corrompido e acoplado ao formato antigo                 | Refeito como adaptador limpo para EscalaDayCell         |
| src/react-app/pages/escalas/components/EscalaCalendario/BlocoAeronave.tsx    | Badges Q1/Q2 inconsistentes e slots vazios fora da base atômica | Tokens aplicados e células vazias migradas para DayCell |
| src/react-app/pages/escalas/components/EscalaCalendario/LinhaSituacao.tsx    | Situações usavam linha própria sem estado diário unificado      | Placeholder tipado para usar a mesma célula atômica     |
| src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.tsx | Headers, dots e chips heterogêneos                              | Headers Q1/Q2, chips e dots padronizados                |
| src/react-app/pages/escalas/components/Paineis/PainelLegenda.tsx             | Marcadores Q1/Q2 divergentes da grade                           | Marcadores ligados aos mesmos tokens da grade           |
| src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx   | Botões Q1/Q2 com hardcode                                       | Pills migrados para Q1/Q2.pill e pillActive             |
| src/react-app/pages/escalas/components/Modais/ModalNovaSituacao.tsx          | Botões Q1/Q2 com hardcode                                       | Pills migrados para Q1/Q2.pill e pillActive             |

## Testes

- A (Q1/Q2 padronizados): ✅
  - Validado em DOM da aba Tripulantes: header Q1 = bg-sky-50/text-sky-700/border-sky-200; header Q2 = bg-amber-50/text-amber-700/border-amber-200
  - Validado em DOM do modal de alocação: Q1 inativo = bg-sky-100/text-sky-800; Q2 ativo = bg-amber-500/text-white
  - Validado em DOM do modal de situação: Q1 ativo = bg-sky-500/text-white; Q2 inativo = bg-amber-100/text-amber-800
- B (barras uniformes): ✅
  - Núcleo da grade usa EscalaDayCell/DayCell com CELL.width, CELL.height e CELL.pillHeight
- C (1 evento por célula): ❌
  - Regra implementada, mas o cenário manual de conflito induzido não foi executado no browser nesta rodada
- D (avulsas alinhadas): ✅
  - Bloco Alocações Avulsas validado na tela de Escala 5/2026 com a mesma grade diária e cells padronizadas
- E (legenda): ❌
  - Tokens aplicados em código, mas a inspeção manual específica do rodapé não foi concluída nesta rodada
- F (regressão funcional): ❌
  - Login, navegação até Escalas e abertura dos modais principais OK
  - Fluxos completos de confirmação de alocação/situação não foram executados de ponta a ponta nesta rodada

## Build e Deploy

- tsc: 0 erros ✅
- build: ✅
- deploy: ✅
- versão publicada em Pages: 41e1b4fa
- versão publicada no Worker /api/health: 41e1b4fa
- HEAD local após auto-commit do pipeline: 7fc485c8
- observação: o script de deploy criou auto-commit pós-publicação; o hash publicado e o HEAD local divergem por causa desse passo automático
- security headers confirmados em produção:
  - strict-transport-security presente
  - content-security-policy presente

## Veredicto

REPROVADO — o núcleo do design system de Escalas foi migrado e publicado com sucesso, mas a auditoria automática ainda encontra hardcodes residuais fora do núcleo principal e os testes manuais C, E e F não foram concluídos integralmente.
