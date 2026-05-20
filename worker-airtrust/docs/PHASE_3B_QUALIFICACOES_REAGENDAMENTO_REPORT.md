# Phase 3B Qualificações Reagendamento Fix Report

## Data
- Data/hora: 2026-05-14
- Branch: main
- Commit checkpoint: `c7b079df2`

## Escopo

**Corrigido:**
`qualificacoes-historico-write.test.ts > reagenda uma qualificacao planejada para uma nova data futura`

## Baseline

- Comando: `npx vitest run src/__tests__/routes/qualificacoes-historico-write.test.ts`
- Resultado antes: 1 failed | 3 passed (4)
- Erro: `AssertionError: expected 400 to be 200` (linha 438)
- Suíte completa antes: 354/355 passando

## Diagnóstico

**Causa raiz:**
Data hardcoded no teste (`2026-05-10`) tornou-se passada em relação à data atual (`2026-05-14`).

A rota `PATCH /historico/:id/reagendar` valida corretamente que a nova data planejada deve ser futura (`novaDataDate <= hoje` → 400). Quando o teste foi escrito, `2026-05-10` era futuro. Com o passar do tempo, a data passou, e a validação passou a rejeitar o request com 400 ao invés de 200.

**Arquivo da rota:** `src/routes/qualificacoes/historico-write.ts` — linhas 1016–1027:
```typescript
const hoje = new Date();
hoje.setHours(0, 0, 0, 0);
const novaDataDate = new Date(`${novaDataPlanejada}T00:00:00`);
if (Number.isNaN(novaDataDate.getTime()) || novaDataDate <= hoje) {
  return c.json({ success: false, error: 'A nova data planejada deve ser futura' }, 400);
}
```

A lógica da rota está correta — não foi alterada.

## Correção Aplicada

**Arquivo:** `src/__tests__/routes/qualificacoes-historico-write.test.ts`

**Mudanças:** 3 ocorrências de `2026-05-10` → `2099-05-10` dentro do teste `reagenda uma qualificacao planejada para uma nova data futura`:

1. **Body do request** (linha 432):
   ```diff
   - body: JSON.stringify({ nova_data_planejada: '2026-05-10' }),
   + body: JSON.stringify({ nova_data_planejada: '2099-05-10' }),
   ```

2. **Expectativa da resposta** (linha 444):
   ```diff
   - data_conclusao: '2026-05-10',
   + data_conclusao: '2099-05-10',
   ```

3. **Expectativa dos args do UPDATE** (linha 455):
   ```diff
   - expect(updateCall?.args).toEqual(['2026-05-10', '2027-05-10', 654]);
   + expect(updateCall?.args).toEqual(['2099-05-10', '2027-05-10', 654]);
   ```

**Nota:** `data_vencimento: '2027-05-10'` permanece inalterado — é o valor fixo retornado pelo `calcularDataVencimentoMock.mockReturnValue('2027-05-10')`, independente da data de entrada.

**Por que não altera regra de negócio:**
Apenas o arquivo de teste foi alterado. A rota permanece intacta. A data `2099-05-10` é suficientemente futura para não se tornar obsoleta novamente.

## Validação

| Comando | Resultado | Observação |
|---|---|---|
| `npx vitest run src/__tests__/routes/qualificacoes-historico-write.test.ts` | ✅ PASS 4/4 | Todos os 4 testes do arquivo passam |
| `npm test` | ✅ **355/355** | Meta alcançada — suíte completa verde |
| `./node_modules/.bin/tsc --noEmit` | ✅ PASS 0 erros | TypeScript limpo |
| `npx wrangler deploy --dry-run` | ✅ PASS | Build passa |

## Como Reverter

```bash
git revert <commit-final>
```
