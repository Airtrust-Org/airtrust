# AIRTRUST — Qualificações Planejadas Calendar Hotfix

**Data**: 2026-06-07  
**Executor**: Claude Code (Sonnet 4.6) sob autorização explícita  
**Commit**: d872c83  
**Operação**: UI/code fix — aba Planejadas no módulo de Qualificações  
**Classificação**: HOTFIX UI — SEM ALTERAÇÕES DE DADOS

---

## 1. Contexto

Após o hotfix anterior (commit ce973d9), quatro novos problemas foram identificados na aba Planejadas:

| # | Problema | Causa | Status |
|---|---|---|---|
| 1 | Sub-tab "Turmas" redundante com "Calendário" | Turmas era aba visível desnecessária | CORRIGIDO |
| 2 | Botão "Novo treinamento" — nome errado | String hard-coded incorreta | CORRIGIDO |
| 3 | Antônio SK76 FFS (25/06) aparecia na Lista mas não no Calendário | `historicoPlanejadoRelacionado` herdava filtros do tab Histórico | CORRIGIDO |
| 4 | Sessões de simulador de junho não apareciam no Planejadas/Calendário | Mesmo problema: filtros herdados mascaravam resultados | CORRIGIDO |

---

## 2. Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/react-app/pages/Qualificacoes.tsx` | UI fix — 5 pontos corrigidos |
| `src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts` | Atualizado — 18 testes (era 14) |

Sem alterações de backend. Sem migration. Sem escrita em banco.

---

## 3. Mudanças Detalhadas

### 3.1 — Sub-tabs visíveis: Lista | Calendário (Turmas oculta)

Sub-tabs visíveis passaram de `['lista', 'calendario', 'turmas']` para `['lista', 'calendario']`.

Turmas permanece como `plannedView` válido — acessível via botão "Nova turma" — mas não é mais renderizada como aba no loop de sub-tabs.

O Calendário fica ativo (estilo `border-blue-600`) quando `plannedView === 'turmas'` também, para feedback visual correto.

```jsx
// antes
{(['lista', 'calendario', 'turmas'] as const).map((view) => { ... })}

// depois
{(['lista', 'calendario'] as const).map((view) => {
  // Calendário fica ativo se plannedView é 'turmas' (botão Nova turma foi clicado)
  const isActive = plannedView === view || (view === 'calendario' && plannedView === 'turmas');
})}
```

### 3.2 — Botão renomeado "Nova turma"

```diff
- <span>Novo treinamento</span>
+ <span>Nova turma</span>
```

Referência no empty-state também atualizada:

```diff
- Use <strong>Novo treinamento</strong> para criar um planejamento.
+ Use <strong>Nova turma</strong> para criar um planejamento.
```

### 3.3 — Botão "Voltar ao Calendário" na view Turmas

Quando o usuário acessa a view Turmas (via "Nova turma"), um botão de retorno é exibido:

```jsx
{plannedView === 'turmas' && (
  <>
    <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100">
      <button onClick={() => setPlannedView('calendario')} ...>
        <ChevronLeft className="w-4 h-4" />
        <span>Voltar ao Calendário</span>
      </button>
    </div>
    <Suspense ...>
      <TreinamentosPlanejadosPage asTab={true} sourceFilter="TURMA" />
    </Suspense>
  </>
)}
```

### 3.4 — Fix do `historicoPlanejadoRelacionado` (root cause principal)

**Causa do problema 3 e 4**: A chamada ao hook `useQualificacoesHistorico` para a aba Planejadas usava os mesmos filtros da aba Histórico (`debouncedSearch`, `aeronaveFilter`, `categoriaFilter`). Quando qualquer filtro estava ativo (ex: aeronave "SK76"), os itens planejados desapareciam pois não havia match com o filtro, incluindo o G2 de Antônio e as sessões de simulador.

**Fix aplicado** (linha ~277): parâmetros limpos — sem herança dos filtros do tab Histórico:

```js
// Antes (herdava filtros do Histórico):
const { historico: historicoPlanejadoRelacionado } = useQualificacoesHistorico(
    undefined, 500, 1, false,
    debouncedSearch,           // filtro herdado
    sortConfig.column || 'data_vencimento',
    sortConfig.direction,
    aeronaveFilter,             // filtro herdado
    categoriaFilter,            // filtro herdado
    ['PLANEJADA'],
);

// Depois (filtros limpos):
const { historico: historicoPlanejadoRelacionado } = useQualificacoesHistorico(
    undefined, 500, 1, false,
    '',                         // sem filtro de busca
    'data_conclusao',           // ordena por data planejada
    'ASC',
    undefined,                  // sem filtro de aeronave
    undefined,                  // sem filtro de categoria
    ['PLANEJADA'],
);
```

### 3.5 — Migração de preferência `plannedView: 'turmas'`

Preferências antigas com `plannedView: 'turmas'` agora migram para `'calendario'` (não `'turmas'`), evitando tela em branco se o usuário retornar com a preferência antiga salva.

```js
const migratedPlannedView =
    rawStoredView === 'turmas' || rawStoredTab === 'turmas'
      ? 'calendario'  // antes retornava 'calendario' só para rawStoredTab; rawStoredView ficava 'turmas'
      : ...
```

---

## 4. Por que Antônio aparecia na Lista mas não no Calendário

Antônio tem uma qualificação PLANEJADA (id=4534, G2, SK76 FFS, 25/06/2026, empresa_id=6, sessao_id=75).

- **Lista**: renderiza a tabela `historicoPlanejadoRelacionado` diretamente — fetched com statuses=['PLANEJADA'], sem filtros herdados após a correção.
- **Calendário (pills)**: mesma fonte `historicoPlanejadoRelacionado` — agora também funciona.
- **Calendário (TreinamentosPlanejadosPage)**: sessão id=75 aparece via `loadSimulatorSessionItems` (SIMULADOR source), pois o item tem `sessao_id=75` e portanto é EXCLUÍDO do `loadStandalonePlannedQualificationItems` (que só traz PLANEJADA sem sessao_id).

**Por que sessões de simulador de junho não apareciam**: `loadSimulatorSessionItems` retorna ALL sessões para a empresa com status AGENDADO (que normaliza para PLANEJADO). Elas aparecem no `/api/treinamentos/planejados/calendario` sem filtro de status. O problema era o `historicoPlanejadoRelacionado` que, ao receber `aeronaveFilter='SK76'`, filtrava para zero resultados — e a UI percebia erroneamente como "sem dados".

---

## 5. Sessões de Simulador — Como Funcionam

| Campo | Valor esperado para aparecer |
|---|---|
| `deleted_at` | NULL |
| `status` | AGENDADO → normaliza para PLANEJADO |
| `gera_qualificacao` | Irrelevante para aparição em Planejadas/Calendário |
| empresa_id | Deve corresponder ao tenant (empresa_id=6) |

Junho/2026: 27 sessões (ids 71-97), todas AGENDADO, datas 25-30/06. Apenas sessão 75 tem `gera_qualificacao=1` (gera PLANEJADA no historico).

---

## 6. Testes

| Suite | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros ✓ |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | 0 erros ✓ |
| `npm run lint` | PASS ✓ |
| `npm run build` | Build em 12.98s ✓ |
| `npm run test:run` (665 frontend) | PASS ✓ |
| `npm run test:worker` (1017 worker) | PASS ✓ |
| Planejadas UI spec (18 testes) | 18/18 PASS ✓ |

---

## 7. Confirmações de Escopo

| Item | Status |
|---|---|
| DB writes (UPDATE/DELETE/INSERT) | 0 — NENHUM |
| Migrations executadas | 0 — NENHUMA |
| Backend (worker) alterado | 0 — NENHUM |
| FRMS alterado | 0 — NENHUM |
| FIRA alterado | 0 — NENHUM |
| Backfill executado | 0 — NENHUM |
| Email enviado | 0 — NENHUM |
