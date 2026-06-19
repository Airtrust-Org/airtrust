# Escala Mensal — Quinzena Ativa em Aeronaves

Data: 2026-06-19
Worktree: `/tmp/airtrust-escala-quinzena-clean`
Base: `origin/main`

## Resumo

Corrigido o caminho de renderização `Aeronaves > Tripulantes sem Aeronaves` para projetar a disponibilidade base da quinzena ativa quando não existe evento real no dia.

## Causa raiz

- `GradeGantt` já recebia `quinzenaPreferencial` e `quinzenasMes`.
- `LinhaSituacao` só renderizava célula ativa quando existia item em `situacoesVisiveis`.
- Sem situação no dia, a linha caía em células vazias e no fallback `Sem situação registrada no período`.
- `FOLGA` manual na quinzena ativa também podia ser filtrada indevidamente em `buildTripulantesSemAeronaveRows`.

## Correção

- Extraído helper reutilizável `activeFortnightBase.ts`.
- Reaproveitada a regra de quinzena ativa entre `GradeTripulantes` e `LinhaSituacao`.
- `LinhaSituacao` agora projeta `Disponível · Em escala` dentro da quinzena ativa quando não há evento real.
- O fallback textual some quando existe disponibilidade base visível no período.
- `FOLGA` manual permanece visível para bloquear disponibilidade base.

## Arquivos

- `src/react-app/pages/escalas/components/EscalaCalendario/activeFortnightBase.ts`
- `src/react-app/pages/escalas/components/EscalaCalendario/LinhaSituacao.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeGantt.test.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeGantt.utils.test.ts`

## Validações

- `npx vitest run src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeGantt.test.tsx src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeGantt.utils.test.ts src/react-app/pages/escalas/components/EscalaCalendario/__tests__/GradeTripulantes.test.tsx src/react-app/pages/escalas/components/EscalaCalendario/__tests__/DayCell.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `npm run guard:tracked-secrets`
- `npm run ops:guard`

## Segurança

- Sem migration.
- Sem backfill.
- Sem alteração de Worker ou banco.
- Sem geração de hora de voo ou jornada.
- Sem source policy.
- Sem CV→FRMS.
- Sem PII, tokens ou secrets.
