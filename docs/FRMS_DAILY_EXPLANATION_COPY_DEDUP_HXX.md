# FRMS Daily Explanation Copy Dedup (HXX)

## 1. HEAD inicial/final
- HEAD inicial: `81f125c88d674d1bcde7cf9592c5028067048f8d`
- HEAD final: `81f125c88d674d1bcde7cf9592c5028067048f8d` (antes do commit desta fase)

## 2. Arquivos alterados
- `src/react-app/pages/frms/components/FrmsDayExplanationPanel.tsx`
- `src/react-app/pages/frms/__tests__/FrmsDayExplanationPanel.test.tsx`
- `docs/FRMS_DAILY_EXPLANATION_COPY_DEDUP_HXX.md`

## 3. Redundâncias removidas
- Separação clara entre papéis da `Síntese do Dia` e da `Explicação operacional`.
- Remoção do texto corrido repetitivo na explicação operacional.
- Síntese reduzida para duas frases focadas na leitura e principal redutor.

## 4. Nova regra de papéis
- **Síntese do dia**: resumo curto da leitura operacional em até 2 frases.
- **Explicação operacional**: lista curta por componente (`componente: efeito`) em bloco compacto “Como interpretar esta leitura”.

## 5. Confirmação de datas DD/MM/YYYY
- Datas visíveis seguem formato BR (ex.: `30/05/2026`).
- Não há exibição de ISO em textos operacionais principais.

## 6. Remoção de termos técnicos crus
- Sanitização mantida para bloquear termos:
  - `fator_basica_pct`
  - `7d pior dia`
  - `28d pior dia`
- UI principal mantém linguagem operacional.

## 7. Validações
- `npm ci` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx vitest run src/react-app/pages/frms/__tests__` ✅
- `git diff --check` ✅

## 8. Escopo técnico preservado
- Backend não alterado.
- Fórmulas FRMS/thresholds não alterados.
- Banco/D1/migrations/seeds/backfill não alterados.

## 9. Deploy realizado e URL
- Deploy frontend Cloudflare Pages production executado após push.
- URL registrada no relatório final da execução do turno.

## 10. Smoke HTTP e smoke visual pendente
- Smoke HTTP executado após deploy (status 200 nas rotas principais).
- Smoke visual pendente em:
  - `https://airtrust.online/frms`
  - `https://airtrust.online/frms/tripulante/19?mes=2026-05`
