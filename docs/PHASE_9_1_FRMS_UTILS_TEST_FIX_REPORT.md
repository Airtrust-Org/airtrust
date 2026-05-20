# Phase 9.1 FRMS Utils Test Fix Report

## Data
- Data/hora: 2026-05-15
- Branch: main
- Commit checkpoint: a260018e7
- Commit final: bea04e0e2

## Escopo
Corrigir falhas em:
`src/react-app/pages/frms/__tests__/frmsUtils.test.ts > getComplianceHex/Color/Label`

Fora do escopo:
- banco, producao, staging seed, auth, RBAC, SERA, migrations, SIGVOOS

## Baseline
- Comando: `npx vitest run src/react-app/pages/frms/__tests__/frmsUtils.test.ts`
- Falhas antes: 3 (de 44)
- Casos falhos:

| Teste | Input | Esperado | Recebido |
|-------|-------|----------|----------|
| getComplianceColor < 85% | 84.9 | text-teal-700 | text-amber-700 |
| getComplianceHex < 85% | 80 | #0F766E | #D97706 |
| getComplianceLabel < 85% | 84 | Dentro do Limite | Aviso Preventivo |

## Diagnostico

- Funcoes analisadas: `getComplianceColor`, `getComplianceHex`, `getComplianceLabel` em `frmsUtils.ts`
- Causa raiz: O default de `ALERTA_AVISO_PCT` na implementacao eh **80**, mas o teste assumia **85**
- Classificacao: **Teste stale (A)**
- O default foi alterado de 85 para 80 durante o FRMS rewrite (Phase 0-3, commit 46fa7f018), tornando o sistema mais conservador em relacao a fadiga de tripulantes. Avisos disparam mais cedo (80% em vez de 85%).
- Os outros thresholds (ATENCAO=90, CRITICO=95, VIOLACAO=101) permanecem identicos entre implementacao e testes.

## Correcao aplicada

- Arquivo: `src/react-app/pages/frms/__tests__/frmsUtils.test.ts`
- Mudancas:
  1. Comentario de defaults: `AVISO=85` → `AVISO=80`
  2. getComplianceColor: `84.9` → `79.9`, renomeado `< 85%` → `< 80%`
  3. getComplianceHex: `80` → `79.9`, renomeado `< 85%` → `< 80%`
  4. getComplianceLabel: `84` → `79`, renomeado `< 85%` → `< 80%`
- Nao altera regra de negocio: apenas alinha expectativas de teste com o default real da implementacao
- Nao afeta FRMS 28d: `pct_limite_28d` eh calculado externamente e passado como input para essas funcoes
- Testes nao foram afrouxados: os valores de entrada foram ajustados para respeitar o novo threshold (79.9 < 80 → teal), mantendo o mesmo nivel de cobertura de boundary

## Validacao

| Comando | Resultado | Observacao |
|---------|-----------|------------|
| frmsUtils test especifico | 44/44 passed | 0 falhas |
| npx tsc --noEmit | 0 errors | limpo |
| npm run test:all | 395+355 passed | frontend 35+3skip, worker 38 files |
| wrangler dry-run | PASS | 5487 KiB |
| staging health/version | 200/200 | nao afetado |

## Riscos remanescentes

- Nenhum. Apenas alinhamento de testes com implementacao existente.

## Como reverter

```bash
git revert bea04e0e2
```
