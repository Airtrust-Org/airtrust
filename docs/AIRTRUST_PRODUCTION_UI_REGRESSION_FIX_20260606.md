# AirTrust — Correção de Regressão de UI em Produção

**Data:** 2026-06-06
**Branch:** main
**HEAD antes da correção:** 6f40af7 (23f893e deploy)

## Problemas Reportados

### 1. EVD — Aeronaves ativas: 0
A página Escala Diária de Voo não exibia as aeronaves reais da empresa.
Mensagem: "Não há aeronaves ativas cadastradas para a empresa."

### 2. Visão Mensal — Eventos incorretos
- 309 Compromissos (inflados)
- 230 Bloqueios (qualificações vencidas empilhadas no dia 1)
- Calendário poluído com qualificações como eventos all-day

### 3. Formulário de Turma — Legado single-day
O formulário "Incluir turma planejada" usava apenas data única, instrutor
em texto livre, sem suporte a múltiplos dias. O novo formulário multi-dia
existia mas não era acessível pela navegação.

## Causas Raiz

### Causa 1 — Filtro `somenteAtivas` restritivo
**Arquivo:** `worker-airtrust/src/routes/aeronaves.ts:25`

O filtro SQL era:
```sql
UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'
```
Este filtro só aceitava status literal 'ATIVO' ou NULL/vazio. O frontend
(`isAeronaveAtiva()`) considera ativa qualquer aeronave cujo status NÃO seja
'I'/'INATIVO'/'INDISPONIVEL'. Status como 'D' (Disponível) eram filtrados
pelo backend mas aceitos pelo frontend, resultando em "0 aeronaves" se a
empresa usasse status não-'ATIVO'.

### Causa 2 — Clamp de data em qualificações vencidas
**Arquivo:** `worker-airtrust/src/services/escala-mensal-integrada.ts:786-791`

O código clampava qualificações vencidas para `month.startDate`:
```typescript
date:
  dataVencimento < month.startDate
    ? month.startDate   // ← todas as vencidas no dia 1!
    : dataVencimento > month.endDate
      ? month.endDate
      : dataVencimento,
```
Isso empilhava TODAS as qualificações já vencidas no primeiro dia do mês
como eventos all-day com severidade BLOCKING, poluindo o calendário.

### Causa 3 — Navegação sem link para o novo formulário
**Arquivo:** `src/react-app/navigation.config.ts`

O novo gerenciador de turmas multi-dia em `/treinamentos/planejados` não
estava listado na barra de navegação. O formulário legado em Qualificacoes.tsx
era o único fluxo acessível ao usuário.

## Correções Aplicadas

### Fix 1 — Filtro de aeronaves alinhado com frontend
```sql
-- Antes:
UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) = 'ATIVO'

-- Depois:
UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')
```
Agora o backend exclui apenas aeronaves indisponíveis, alinhado com a
função `isAeronaveAtiva()` do frontend.

### Fix 2 — Data real de vencimento sem clamp
```typescript
// Antes: clamp ternário para month.startDate/month.endDate
// Depois: data real de vencimento
date: dataVencimento,
```
Qualificações vencidas antes do mês não aparecem mais no grid (sua data
real está fora do mês), mas continuam contabilizadas no sumário do
tripulante.

### Fix 3 — Sumário com buckets corretos
- **Compromissos** = operationalAssignments + commitments (escala + treinamentos + simuladores)
- **Avisos** = alertas com severidade WARNING
- **Conflitos** = eventos com severidade CONFLICT
- **Bloqueios** = alertas com severidade BLOCKING ou blocksAllocation

### Fix 4 — Navegação e link para formulário multi-dia
- Adicionada entrada "Treinamentos > Turmas Planejadas" na sidebar
- Adicionado notice no formulário legado com link para o novo gerenciador
- Adicionado botão "Gerenciar Turmas" ao lado do botão legado

## Testes Adicionados

12 novos testes de contrato (M11–M14 + qualificação date integrity +
aeronaves somenteAtivas + evd error handling):

- `M11`: qualificação vencida NÃO é clampada para primeiro dia do mês
- `M12`: qualificação vencida não bloqueia alocação quando tem renovação planejada
- `M13`: sumário usa buckets corretos (compromissos ≠ alertas ≠ conflitos)
- `M14`: TREINAMENTO CANCELADO não aparece como compromisso ativo
- 2 testes de integridade de data em qualificações
- 3 testes de contrato do filtro somenteAtivas
- 3 testes de tratamento de erro no endpoint de aeronaves

## Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `worker-airtrust/src/routes/aeronaves.ts` | Filtro somenteAtivas menos restritivo |
| `worker-airtrust/src/services/escala-mensal-integrada.ts` | Remove clamp de data em qualificações |
| `src/react-app/pages/escalas/VisaoMensalIntegradaPage.tsx` | Sumário com buckets corretos |
| `src/react-app/navigation.config.ts` | Adiciona Treinamentos na sidebar |
| `src/react-app/pages/Qualificacoes.tsx` | Notice legado + botão Gerenciar Turmas |
| `worker-airtrust/src/__tests__/services/escala-mensal-integrada.test.ts` | +12 testes |

## Resultados dos Testes

- TypeScript: ✅ 0 erros
- Build: ✅ sucesso
- Worker tests: ✅ 146 files, 968 tests
- Frontend tests: ✅ 62 files, 556 tests

## Riscos Residuais

1. **Aeronaves — sem smoke autenticado**: Não foi possível validar em
   produção com sessão autenticada. A correção do filtro é correta do
   ponto de vista lógico, mas o teste real depende de deploy.

2. **Visão Mensal — dados reais**: Os novos contadores de sumário dependem
   dos dados de produção para validação final. O comportamento do código
   está correto nos testes unitários.

3. **Formulário multi-dia — usabilidade**: O novo formulário em
   `/treinamentos/planejados` precisa de validação de usabilidade com
   dados reais.
