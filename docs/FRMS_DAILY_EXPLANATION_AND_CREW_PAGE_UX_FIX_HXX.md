# FRMS Daily Explanation and Crew Page UX Fix (HXX)

## 1) HEAD inicial/final
- HEAD inicial: `d9c64f1c98ea4c3eec9cb7365203792b0700c4e4`
- HEAD final: `d9c64f1c98ea4c3eec9cb7365203792b0700c4e4` (antes do commit local deste pacote)

## 2) Arquivos alterados
- `src/react-app/pages/frms/frmsUtils.ts`
- `src/react-app/pages/frms/components/FrmsEffectivenessPanel.tsx`
- `src/react-app/pages/frms/components/FrmsDayExplanationPanel.tsx`
- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/pages/frms/__tests__/frmsUtils.test.ts`
- `src/react-app/pages/frms/__tests__/FrmsDayExplanationPanel.test.tsx`
- `src/react-app/pages/frms/__tests__/FrmsEffectivenessPanel.test.tsx`

## 3) Problemas visuais identificados
- Badge de status `Escala de Serviço` quebrando linha e aumentando altura da tabela.
- Indicador circular do índice mantendo visual verde em cenários degradados/críticos.
- Espaço superior da ficha pouco eficiente (distribuição desigual entre painel A e cards de compliance).
- Datas visíveis em ISO em partes da explicação.
- Frases técnicas cruas de janela (`7d pior dia...`, `28d pior dia...`).
- Vazamento técnico (`fator_basica_pct`) na explicação principal.
- Explicação diária com baixa hierarquia visual para leitura operacional.

## 4) Correções aplicadas
- Badge `ES` compactada para `Escala`, com `whitespace-nowrap`, `inline-flex`, `leading-none` e `title="Escala de Serviço"`.
- Reorganização de grid superior da ficha para reduzir vazio: layout desktop em 12 colunas, painel de efetividade em coluna lateral consistente.
- Painel diário com card de síntese por status (tons verde/âmbar/vermelho suaves).
- Renomeação visual para leitura didática (`Principais Fatores`, `O que verificar antes de agir`).
- Inclusão do bloco curto de interpretação com guardrail explícito (não diagnóstico/não decisão automática).

## 5) Como datas passaram a ser formatadas
- Novo helper `formatFrmsDate` em `frmsUtils.ts` (`YYYY-MM-DD` -> `DD/MM/YYYY`).
- Aplicado em:
  - cabeçalho da explicação diária;
  - comparação entre dias;
  - tabela de jornadas na ficha;
  - data no bloco de justificativa.

## 6) Como campos técnicos foram ocultados/traduzidos
- Introduzida sanitização de copy operacional na explicação principal:
  - remove referência literal `fator_basica_pct: <valor>` da UI principal;
  - converte para linguagem operacional (`contexto circadiano basal auxiliar`).
- Fator `basica` passa a ser apresentado como `Contexto circadiano basal` na área principal.

## 7) Como a cor do índice foi corrigida
- No `FrmsEffectivenessPanel`, o anel do círculo deixou de usar gradiente fixo verde.
- O `stroke` passou a usar `getEffectivenessHex(pct, config)`, garantindo coerência com status.

## 8) Como a badge “Escala de Serviço” foi corrigida
- Troca de rótulo exibido de `Escala de Serviço` para `Escala` na tabela.
- Mantido significado completo via `title` no elemento do badge.
- Ajustes de classe para impedir quebra vertical e preservar alinhamento da linha.

## 9) Como o layout da ficha foi ajustado
- Grid superior alterado de `md:grid-cols-5` para `lg:grid-cols-12`.
- Painel A (efetividade) passou para `lg:col-span-4 xl:col-span-3`.
- Painel B (compliance) passou para `lg:col-span-8 xl:col-span-9` quando painel A existe.
- Resultado: melhor preenchimento horizontal e menor área ociosa antes da curva.

## 10) Confirmação de escopo técnico
- Não houve alteração em backend/worker.
- Não houve alteração de fórmulas FRMS.
- Não houve alteração de thresholds.
- Não houve alteração de banco/migration/seed/backfill.
- Não houve alteração de payload operacional, rotas, FIRAS, SGSO, check-in ou read/ack.

## 11) Validações executadas e resultados
- `npm ci` -> OK
- `npx tsc --noEmit` -> OK
- `npm run lint` -> OK
- `npm run build` -> OK
- `npx vitest run src/react-app/pages/frms/__tests__` -> OK (3 arquivos, 48 testes)
- `git diff --check` -> OK

## 12) Riscos residuais
- A sanitização textual atua por padrões conhecidos (`fator_basica_pct`, frases `7d/28d pior dia`). Se novos formatos técnicos diferentes chegarem no payload textual, pode ser necessário ampliar o mapeamento de tradução.
- Mudança de layout foi focada na ficha e explicação diária; outras telas FRMS não foram alteradas.

## 13) Recomendação de deploy
- Recomendado smoke visual em `/frms/tripulante/:id` (desktop e mobile) com pelo menos um caso em faixa crítica para validar coerência completa entre badge, rótulo e cor do anel.
- Após smoke aprovado, seguir fluxo normal de release (sem push/deploy automático neste pacote).
