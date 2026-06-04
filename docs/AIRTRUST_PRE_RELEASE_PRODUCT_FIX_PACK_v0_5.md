# AirTrust — Pre-Release Product Fix Pack v0.5

**Data:** 2026-06-04
**Branch:** `main`
**HEAD base reconciliado:** `36dc2a63159183dca7edbb4549aa3b25957f4e84`
**Release-gate/smoke encontrado:** `36dc2a6 chore(audit): record authenticated staging smoke readiness`
**Status:** `PRE_RELEASE_PRODUCT_FIXES = COMPLETE`
**Release gate após alterações funcionais:** `RELEASE_GATE = READY_FOR_CONTROLLED_RELEASE_PENDING_FINAL_SMOKE_RECHECK`

## 1. Git state reconciliado

- `git fetch origin` executado.
- Branch confirmada: `main`.
- `HEAD == origin/main` antes do fix pack: `36dc2a63159183dca7edbb4549aa3b25957f4e84`.
- Divergência antes do fix pack: `0 0`.
- Sem tracked changes antes do fix pack.
- Untracked históricos fora de escopo preservados.
- O pacote release-gate/smoke já estava versionado em `origin/main`; não foi recriado.

## 2. Problemas corrigidos

1. **E-mail de sessão de simulador**
   - Novo serviço `sendSimulatorSessionEmailNotifications`.
   - Criação de sessão enfileira e-mail para instrutor e tripulantes.
   - Edição de sessão enfileira e-mail apenas quando há mudança operacional relevante.
   - Destinatário sem e-mail é marcado como `skipped` e não quebra o fluxo.
   - Provider ausente não executa envio real.

2. **Agenda semanal de simuladores**
   - Modo `monthly | weekly | agenda` passou a ser persistido.
   - Re-save/remount preserva visualização semanal ou mensal.
   - Data base e filtros existentes continuam no estado do componente.

3. **Fadiga diária**
   - Sucesso redireciona para a home correta por perfil.
   - `INSTRUTOR`, `ALUNO`, `TRIPULANTE`, aliases equivalentes -> `/home`.
   - `GESTOR`/admin/outros -> `/`, usando o `HomeRouter` existente.
   - Erro permanece no formulário.
   - Mutation pendente bloqueia double submit.

4. **Impressão A4 da agenda de simuladores**
   - Relatório mensal detalhado ajustado para `@page A4 landscape`.
   - Margem de impressão real (`10mm`), fontes compactas e tabela com layout fixo.
   - `thead` repetível e regras `break-inside`/`page-break-inside` em linhas e blocos.
   - Impressão continua isolada em iframe, sem imprimir a UI inteira.

5. **Ícones de pasta para Pasta 360**
   - Utilitário central `buildPasta360Url`.
   - Modal de certificado e modal de certificados apontam para `/funcionarios/:id/ficha?tab=pasta`.
   - Ficha do funcionário chama a aba/documentos como Pasta 360 e remove atalho para `/pasta-virtual/:id`.
   - Endpoints `/api/pasta-virtual/...` permanecem apenas para operações de arquivo legado (`stream`, `upload`, `delete`), não como navegação de ícone.

## 3. Arquivos alterados

- `worker-airtrust/src/services/simuladores-session-notifications.ts`
- `worker-airtrust/src/routes/simuladores-sessoes.ts`
- `worker-airtrust/src/routes/simuladores-sessoes-update.ts`
- `src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx`
- `src/react-app/pages/simuladores/agenda/calendarViewState.ts`
- `src/react-app/pages/simuladores/agenda/monthlyAgendaPrint.ts`
- `src/react-app/pages/frms/FrmsCheckinFadiga.tsx`
- `src/react-app/pages/frms/frmsPostSaveNavigation.ts`
- `src/react-app/utils/pasta360.ts`
- Componentes de certificados, ficha e pasta do funcionário.

## 4. Testes criados/alterados

- `worker-airtrust/src/__tests__/services/simuladores-session-notifications.test.ts`
- `src/react-app/pages/frms/__tests__/FrmsCheckinFadiga.test.tsx`
- `src/react-app/pages/simuladores/agenda/__tests__/calendarViewState.test.ts`
- `src/react-app/pages/simuladores/agenda/__tests__/monthlyAgendaPrint.test.ts`
- `src/react-app/utils/__tests__/pasta360.test.ts`
- `src/react-app/utils/__tests__/pasta360Usage.test.ts`

Cobertura adicionada:

- Instrutor recebe notificação.
- Tripulante recebe notificação.
- E-mail ausente não quebra.
- Provider ausente não envia real.
- Update sem mudança relevante não duplica notificação.
- Semanal/mensal preservados via estado persistido.
- Pós-fadiga navega por perfil, erro permanece, pending evita double submit.
- A4 contém regras print-friendly.
- Pasta 360 não regressa para navegação `/pasta-virtual/:id` nos fluxos alterados.

## 5. Limitações e riscos residuais

- Envio real depende de `BREVO_API_KEY` e `BREVO_FROM_EMAIL`; em ambiente sem provider, o envio é corretamente `skipped`.
- O envio automático usa `waitUntil`; falhas de provider são registradas e não bloqueiam criação/edição.
- O release gate anterior continua válido como evidência de Bloco 6.2, mas deve haver smoke final após este commit funcional entrar no payload de release.
- A rota legada `/pasta-virtual/:id` e endpoints de armazenamento continuam existentes para compatibilidade operacional.

## 6. Validações

Executadas até a criação deste documento:

- Testes frontend específicos: **PASS** (`36` testes).
- Teste worker específico: **PASS** (`4` testes).
- `cd worker-airtrust && npx tsc --noEmit --pretty false`: **PASS**.

Validações finais completas devem ser registradas na entrega da sessão:

- `npm run ops:guard`
- `npm run preflight` ou `NOT_AVAILABLE`
- `npm run test:worker`
- `npm run build`, se seguro
- `git diff --check`
- buscas finais de Pasta 360, impressão e e-mail

## 7. Confirmações de escopo

- Deploy: **NÃO**.
- Migration/apply: **NÃO**.
- DQ/MIG: **NÃO**.
- Produção mutante: **NÃO**.
- Secrets/token/cookie versionados: **NÃO**.

## 8. Próximo passo

Após commit/push do Product Fix Pack, executar Controlled Release / Deploy Gate Execution com smoke final público + autenticado read-only antes de qualquer deploy controlado.
