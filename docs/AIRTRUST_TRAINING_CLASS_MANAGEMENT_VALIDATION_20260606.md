# AirTrust Training Class Management - Validation 2026-06-06

## Escopo e ambiente

- Branch: `main`
- HEAD inicial: `e221493f39d1c60ebf57f153c3bc7e82985a1168`
- `origin/main` inicial: `e221493f39d1c60ebf57f153c3bc7e82985a1168`
- Banco: D1 local isolado `airtrust-db-local`
- Nenhuma operação remota ou de produção foi executada.
- A migration `0390` foi mantida aditiva, sem backfill.

## Testes e comandos

- TypeScript frontend: passou.
- TypeScript worker: falhou somente no baseline preexistente de FRMS.
- ESLint dos arquivos alterados: passou.
- `npm run lint`: passou.
- Build de produção: passou durante o preflight.
- Testes direcionados finais: 31/31 passaram.
- Suíte worker final: 146 arquivos e 940/940 testes passaram.
- Guard de DDL em runtime: passou.
- Migration 0390 em SQLite temporário e D1 local: passou.

## Fluxo E2E local controlado

Dados sanitizados:

- turma: `1`;
- modelo real: `57`;
- participantes: `1` elegível e `3` não elegível;
- dias: `2026-06-15` e `2026-06-16`;
- histórico elegível: `4029`;
- histórico planejado do reprovado: `4030`.

Resultados:

1. Turma criada com dois dias, modalidade mista e horário `08:00-17:00`: PASS.
2. Calendário de Treinamentos mostrou os dois dias: PASS.
3. Visão mensal retornou 4 eventos, equivalentes a 2 dias x 2 pessoas: PASS.
4. Presença diária do elegível registrada como presente: PASS.
5. Segundo participante registrado como ausente e reprovado: PASS.
6. Elegível concluído em `2026-06-16`: PASS.
7. Vencimento oficial calculado para `2027-06-16`: PASS.
8. Reprovado não recebeu vínculo em `treinamentos_qualificacoes_geradas`: PASS.
9. Repetição da conclusão manteve um único vínculo e o histórico `4029`: PASS.
10. Origem registrada como `Origem: Turma E2E-20260606`: PASS.

## Reconciliações

- Dias ativos no banco: `2`.
- Eventos por participante esperados: `2`.
- Participantes ativos: `2`.
- Eventos TREINAMENTO observados: `4`.
- Qualificações geradas elegíveis: `1`.
- Vínculos idempotentes observados: `1`.
- Listagem: 1 turma, 2 dias, 2 participantes em 0,028 s.
- Visão mensal: 24 pessoas, 172 eventos em 0,022 s.

## Navegador

- Rota `/treinamentos`: renderizou a área de gestão.
- Título, calendário, detalhe, conclusão e origem foram conferidos.
- Formulário exibiu `08:00` e `17:00`.
- Editor adicionou e removeu dias específicos.
- Layout em 390 px não apresentou overflow horizontal.
- Visão mensal exibiu a turma em cada dia.
- Nenhum erro de console foi observado.

## Falsos positivos pesquisados

- Presença sem aprovação não conclui.
- Turma concluída não aprova todos.
- Reprovado não gera vínculo de qualificação.
- Repetição não duplica histórico nem vínculo.
- Turma cancelada é excluída da fonte ativa.
- Turma vinculada à sessão local `30` gerou 2 eventos de treinamento e suprimiu os 2 eventos
  canônicos de simulador para as mesmas pessoas.
- Sobreposição no mesmo local entre pessoas diferentes foi marcada como conflito de recurso.

## Falsos negativos pesquisados

- Dias adicionais aparecem no calendário e na visão mensal.
- Participantes são emitidos individualmente na visão mensal.
- Instrutores entram no read model de treinamentos.
- Origem e data efetiva são preservadas.
- Conflitos de sala/local são identificados entre turmas com pessoas diferentes.

## Limitações

- A UI de múltiplos instrutores e vínculo de sessão é parcial.
- A ocupação de recursos é sinalizada na visão mensal, sem uma matriz dedicada por recurso.
- A rota histórica de treinamentos possui teto arquitetural explícito de 2.207 linhas.
- O typecheck global do worker mantém erros preexistentes no módulo FRMS.

## Classificação

`VALIDADO COM LIMITAÇÕES`

Motivo: o fluxo crítico foi comprovado localmente, incluindo idempotência, elegibilidade
individual, calendário multidia, deduplicação com simulador e conflito de recurso. As limitações
restantes são de interface, visualização especializada e dívida arquitetural, sem risco crítico
conhecido para o fluxo validado.
