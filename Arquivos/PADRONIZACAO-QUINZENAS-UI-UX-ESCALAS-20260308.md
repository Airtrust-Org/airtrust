# Padronização de Quinzenas e UI/UX (Módulo de Escalas) - 2026-03-08

## 1. Tokens de Design (Quinzenas Q1 e Q2)

- Criado o arquivo de tokens globais (`escala-theme.ts`) que exporta `QUINZENA_TOKENS` e `GEOMETRY_TOKENS`.
- **Q1 (1ª Quinzena):** Cor oficial padronizada na família `blue/cyan` (`bg-blue-50`, `text-blue-900`, `border-blue-200`).
- **Q2 (2ª Quinzena):** Cor oficial padronizada na família `amber/gold` (`bg-amber-50`, `text-amber-900`, `border-amber-200`).
- Arquivos como `GradeTripulantes.tsx` deixaram de usar valores _hardcoded_ (ex: `text-gray-500`) em seus cabeçalhos quinzenais e passaram a consumir diretamente os tokens definidos.

## 2. Motor de Prioridade Visual e Renderização (Anti-Colisão)

- Problema Resolvido: Múltiplos eventos caindo no mesmo dia, gerando barras colidindo.
- Solução: Criado o utilitário `dayCellState.ts` com a função `buildDayCellState()`.
- Lógica de Priorização Visual Única por dia:
  1. `CONFLITO` (Vermelho)
  2. `SITUACAO_BLOQUEANTE` (Ex: Férias, Licenças)
  3. `ALOCACAO` (Ex: Voo, Atividade Operacional)
  4. `SITUACAO_COMPLEMENTAR` (Ex: Sobreaviso, Reserva)
  5. `FOLGA_AUTO` / `FOLGA`
  6. `DISPONIVEL` (Vazio)
- Somente a representação de **maior peso** preenche o slot gráfico diário. Os demais continuam informados nos sub-dados acessíveis via Tooltip.

## 3. Geometria Consistente e Celula Atômica (`DayCell.tsx`)

- Desenvolvido o componente Atômico `<DayCell />` para substituir lógicas repetitivas e caóticas de renderização inline de tag `<td>` presentes em diversos lugares (`LinhaSituacao.tsx`, `BlocoAeronave.tsx`, "Alocações Avulsas", coberturas, etc).
- As larguras das barras diárias, os arredondamentos (border-radius), os contornos e espaçamentos internos (paddings) foram isolados nos `GEOMETRY_TOKENS` para assegurar que nenhuma grid tenha um pixel fora do lugar nem distorça na vertical.

## 4. Consistência Visual entre Seções Diferentes

- Diferentes módulos (Avulsas, Coberturas, Grade Aeronaves, Tripulantes e Situações) migraram suas regras de renderização celular para consumir o `<DayCell />`.
- A coesão elimina o "descasamento" que havia entre a interface Gantt das escalas vs a interface de coberturas de situações da quinzena.

## Status da Implementação e Health Check

✅ `npm run build` / compilador TypeScript (TSC) executado com taxa de sucesso (0 erros novos reportados nesse domínio do Escalas).
✅ Aderência Completa ao Tema Apple-Like.

> **Assinatura**: GitHub Copilot & AirTrust Automation (2026-03-08)
