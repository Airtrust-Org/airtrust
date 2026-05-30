# FRMS Tripulante Design Polish (HXX)

## 1) HEAD inicial/final
- HEAD inicial desta fase: `51059ee0f203895ff4e9d8dc75a18b2e423c234b`
- HEAD final desta fase: commit local `style(frms): polish crew fatigue page interactions` (registrado no resumo de execução)

## 2) Arquivos alterados
- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/pages/frms/components/FrmsEffectivenessPanel.tsx`

## 3) Achados corrigidos
- Barra de compliance na ficha (`ProgressBar`) trocada de `transition-all duration-700` para transição específica:
  - `transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none`
- Barras de efetividade em `FrmsEffectivenessPanel` trocadas de `transition-all` para:
  - `transition-[width] duration-200 ease-out motion-reduce:transition-none`
- Botões de navegação de mês (anterior/próximo) receberam:
  - `transition-colors duration-150`
- Botões de paginação receberam:
  - `transition-colors duration-150`
- Ações da tabela (`Explicar`, `Editar`, `Excluir`) receberam:
  - `transition-colors duration-150`
- Botão `Voltar` na ficha saiu de `transition-all` para transição específica de cores:
  - `transition-colors duration-150`

## 4) Achados não corrigidos e motivo
- Há ocorrências de `transition-all` em múltiplos arquivos FRMS e componentes globais fora da ficha do tripulante (ex.: `FrmsFadigaAcumulada`, `FrmsConfiguracoes`, `FrmsMetricCards`, `src/react-app/components/*`).
- Nesta fase, ficaram sem alteração por escopo: objetivo focado em polish da ficha do tripulante FRMS e componentes diretamente usados por ela.
- Item de modal com `transition-all`: não foi encontrado `transition-all` no modal local da ficha (`FrmsFichaTripulante`) nem no modal de lançamento de jornada (`FrmsFormJornada`) que exigisse troca nesta fase.

## 5) Confirmação de preservação das duas fases anteriores
- Fase 1 (simplificação de navegação e correções de copy/compliance/janelas/KSS/fator basal/guardrails) permanece preservada no histórico local por commit equivalente já aplicado anteriormente nesta branch: `86b837e`.
- Fase 2 (explicação diária didática no painel do dia) permanece preservada pelo commit `51059ee`.
- Não houve reversão da navegação FRMS, da página "Como funciona o FRMS", da explicação diária nova ou dos guardrails operacionais.

## 6) Confirmação de que backend/fórmulas/thresholds/banco não foram alterados
- Nenhuma alteração em backend/worker, fórmulas FRMS, thresholds, banco, migrations, seeds, payload operacional, autenticação ou rotas operacionais.
- Mudanças restritas a frontend visual/microinterações.

## 7) Validações executadas
- `npm ci` ✅
- `npx tsc --noEmit` ✅
- `npm run lint` ✅
- `npm run build` ✅
- `npx vitest run src/react-app/pages/frms/__tests__` ✅ (9 arquivos, 94 testes)
- `git diff --check` ✅
- Validação visual autenticada da rota `/frms/tripulante/19?mes=2026-05` ⚠️ não executada neste ambiente CLI por ausência de sessão autenticada compartilhável; validação estrutural feita via código-fonte e build/testes.

## 8) Resultado do grep de `transition-all`
Comando executado:
- `grep -R "transition-all" -n src/react-app/pages/frms src/react-app/components | head -50`

Resultado:
- Persistem ocorrências em áreas fora do escopo desta fase (dashboard/cartões/componentes globais e outras páginas FRMS).
- Nos arquivos alterados nesta fase (`FrmsFichaTripulante.tsx` e `FrmsEffectivenessPanel.tsx`), os pontos-alvo do polish foram removidos/substituídos por transições específicas.

## 9) Riscos residuais
- Por manter foco local, ainda existem `transition-all` em outros módulos FRMS e componentes compartilhados que podem impactar consistência geral de microinterações no produto.
- Alterações em `FrmsEffectivenessPanel` afetam qualquer tela que reutilize esse componente (mudança segura: somente animação de largura).

## 10) Recomendação de deploy
- Recomendado para próximo deploy **frontend/pages-only** após QA visual em ambiente autenticado da rota:
  - `/frms/tripulante/19?mes=2026-05`
- Nesta fase não foi feito deploy nem push, conforme solicitado.
