# FRMS Daily Explanation Copy Refinement (HXX)

## 1. HEAD inicial/final
- HEAD inicial: `078925b5142218a7a24ad3b53cf7a2243fe19ae5`
- HEAD final: `078925b5142218a7a24ad3b53cf7a2243fe19ae5` (antes do commit local deste pacote)

## 2. Arquivos alterados
- `src/react-app/pages/frms/components/FrmsDayExplanationPanel.tsx`
- `src/react-app/pages/frms/__tests__/FrmsDayExplanationPanel.test.tsx`
- `docs/FRMS_DAILY_EXPLANATION_COPY_REFINEMENT_HXX.md`

## 3. O que foi preservado do layout anterior
- Estrutura de dois cards superiores foi mantida:
  - `Síntese do Dia` à esquerda;
  - card lateral de explicação à direita (agora `Explicação operacional`).
- Cards de penalização de base e intrajornada preservados.
- Cards menores de tempo crítico, sono efetivo e fator principal preservados.
- Ações operacionais preservadas.
- Blocos inferiores `Principais fatores` e `O que verificar antes de agir` preservados.
- Não houve reforma visual para tabela seca.

## 4. Redundâncias removidas
- Redução de repetição do índice percentual no texto da síntese.
- Removida repetição desnecessária de frases idênticas sobre acúmulo de voo.
- Separação clara entre síntese e explicação operacional para evitar duplicidade.

## 5. Como a explicação do cálculo foi melhorada
- Síntese do dia agora é construída em linguagem operacional com base nos dados disponíveis (fator principal, ciclo embarcado, janela circadiana, sono).
- Explicação operacional detalha origem dos impactos (em `pp`) sem repetir a síntese.
- Card de fator principal passou a explicitar `Maior impacto: X,X pp`.
- Penalização de base passou a explicar origem dos componentes de forma didática.
- Penalização intrajornada passou a descrever claramente o que representa.

## 6. Como datas foram formatadas
- Mantido uso de `formatFrmsDate()` para datas `YYYY-MM-DD` -> `DD/MM/YYYY`.
- Textos de janela 7d/28d convertidos para linguagem didática com data BR quando houver dado.
- Datas ISO técnicas permanecem ocultas na copy principal.

## 7. Como vazamentos técnicos foram removidos
- Mantida sanitização de termos proibidos na UI principal:
  - `fator_basica_pct`
  - `7d pior dia`
  - `28d pior dia`
- Substituição por linguagem operacional equivalente.
- Campos técnicos brutos não foram expostos na explicação principal.

## 8. Testes adicionados/atualizados
- Atualizado `FrmsDayExplanationPanel.test.tsx` para validar:
  - presença de `Explicação operacional`;
  - ausência de `Explicação pela IA`;
  - ausência de `fator_basica_pct`, `7d pior dia`, `28d pior dia`;
  - data em formato BR no cabeçalho;
  - presença de guardrails obrigatórios;
  - copy didática da penalização de base;
  - exibição de `Maior impacto: ... pp` no fator principal.

## 9. Confirmação de escopo técnico
- Backend não alterado.
- Fórmulas FRMS não alteradas.
- Thresholds não alterados.
- Banco/D1/migration/seed/backfill não alterados.
- Rotas/payload/check-in/read-ack não alterados.

## 10. Validações executadas
- `npm ci` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx vitest run src/react-app/pages/frms/__tests__` ✅
- `git diff --check` ✅

## 11. Riscos residuais
- A inferência textual de pior ponto 7d/28d depende de padrões conhecidos do texto de entrada; novos formatos podem exigir ampliação de regex/sanitização.
- Copy operacional adaptativa depende da presença de dados no payload; em casos incompletos, usa fallback explícito.

## 12. Recomendação de deploy
- Realizar smoke visual em `/frms/tripulante/:id` com cenário degradado e cenário neutro para validar clareza da copy e consistência de datas.
- Após validação visual, seguir pipeline normal de release.
