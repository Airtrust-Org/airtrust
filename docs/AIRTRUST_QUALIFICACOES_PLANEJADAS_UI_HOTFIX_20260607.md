# AIRTRUST — Qualificações Planejadas UI Hotfix

**Data**: 2026-06-07  
**Executor**: Claude Code (Sonnet 4.6) sob autorização explícita  
**Operação**: UI/code fix — aba Planejadas no módulo de Qualificações  
**Classificação**: HOTFIX UI — SEM ALTERAÇÕES DE DADOS

---

## 1. Contexto

Uma simplificação anterior do componente `Qualificacoes.tsx` removeu funcionalidades indevidas da aba Planejadas. Quatro problemas foram identificados e corrigidos:

| # | Problema | Causa | Status |
|---|---|---|---|
| 1 | Label da aba exibia "Planejados" (masculino) | String hard-coded incorreta | CORRIGIDO |
| 2 | Sub-tabs Lista\|Calendário\|Turmas ocultavam quando não havia turmas | Condicional `temTreinamentos` indevido | CORRIGIDO |
| 3 | Calendário não exibia itens `historicoPlanejadoRelacionado` | Query não renderizada na view calendário | CORRIGIDO |
| 4 | Botão "Novo treinamento" ausente / substituído por hint de texto | Condição errada (`plannedView === 'turmas'`) | CORRIGIDO |

---

## 2. Arquivos Modificados

| Arquivo | Tipo de mudança |
|---|---|
| `src/react-app/pages/Qualificacoes.tsx` | UI fix — 4 pontos corrigidos |
| `src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts` | Novo — 14 testes de especificação |

---

## 3. Mudanças Detalhadas

### 3.1 — Label "Planejadas" (linha ~2383)

```diff
- Planejados
+ Planejadas
```

### 3.2 — Botões de ação na aba Planejadas (linha ~2515)

Substituído hint de texto por botões funcionais:

```jsx
{isPlanejadosTab && plannedView !== 'turmas' && (
  <div className="flex items-center gap-2">
    <button onClick={() => { void carregarHistorico(); treinamentosPlanejadosConvocacaoQuery.refetch(); }}
      className="...border...">
      <RefreshCw className="w-4 h-4" /><span>Atualizar</span>
    </button>
    <button onClick={() => setPlannedView('turmas')}
      className="...bg-primary-600...">
      <Plus className="w-4 h-4" /><span>Novo treinamento</span>
    </button>
  </div>
)}
```

### 3.3 — Sub-tabs sempre visíveis (linha ~3282)

Substituído bloco condicional `{temTreinamentos && ...}` por mapeamento incondicional:

```jsx
<div className="flex items-center gap-1 border-b border-slate-100 px-4 pt-2 pb-0">
  {(['lista', 'calendario', 'turmas'] as const).map((view) => {
    const labels = { lista: 'Lista', calendario: 'Calendário', turmas: 'Turmas' };
    return (
      <button key={view} onClick={() => setPlannedView(view)}
        className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
          plannedView === view ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
        {labels[view]}
      </button>
    );
  })}
</div>
```

Removido também o `setPlannedView('lista')` forçado que resetava a sub-tab ao carregar.

### 3.4 — Calendário exibe qualificações planejadas (linha ~3393)

Adicionada seção de pills roxos com `historicoPlanejadoRelacionado` acima do `TreinamentosPlanejadosPage`:

```jsx
{plannedView === 'calendario' && (
  <>
    {historicoPlanejadoRelacionado.length > 0 && (
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Qualificações planejadas
        </p>
        <div className="flex flex-wrap gap-2">
          {historicoPlanejadoRelacionado.map((item) => (
            <span key={item.id} className="...bg-purple-50...text-purple-700">
              <CalendarDays size={12} />
              {item.data_conclusao ? new Date(item.data_conclusao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
              {' — '}{item.funcionario_nome || '—'}{' — '}{item.qualificacao_nome || item.qualificacao_codigo || '—'}
            </span>
          ))}
        </div>
      </div>
    )}
    <Suspense ...>
      <TreinamentosPlanejadosPage asTab={true} forcedTab="calendario" hideTabNav={true} />
    </Suspense>
  </>
)}
```

---

## 4. Testes

| Suite | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 erros ✓ |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | 0 erros ✓ |
| `npm run lint` | PASS ✓ |
| `npm run build` | Build em 11.53s ✓ |
| `npm run test:run` (660 frontend) | PASS ✓ |
| `npm run test:worker` (1017 worker) | PASS ✓ |

---

## 5. Validação Visual (localhost:3000)

| Check | Resultado |
|---|---|
| Tab label "Planejadas" (feminino) | ✓ PASS |
| Sub-tabs Lista\|Calendário\|Turmas sempre visíveis | ✓ PASS |
| Botões "Atualizar" e "+ Novo treinamento" em Lista e Calendário | ✓ PASS |
| Calendário exibe pills roxos com qualificações planejadas | ✓ PASS |
| Turmas carrega `TreinamentosPlanejadosPage` normalmente | ✓ PASS |
| Na aba Turmas os botões externos são ocultados (correto) | ✓ PASS |

---

## 6. Confirmações de Escopo

| Item | Status |
|---|---|
| DB writes (UPDATE/DELETE/INSERT) | 0 — NENHUM |
| Migrations executadas | 0 — NENHUMA |
| Backend (worker) alterado | 0 — NENHUM |
| FRMS alterado | 0 — NENHUM |
| FIRA alterado | 0 — NENHUM |
| Backfill executado | 0 — NENHUM |
| Email enviado | 0 — NENHUM |
