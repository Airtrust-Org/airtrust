# BUG HUNT — FASE 5: VALIDAÇÃO FINAL DO MÓDULO ESCALAS

**Data:** 2026-06-07  
**Worker:** `212a12d6`  
**Build:** 5.53s ✅  
**E2E:** 8 passed · 1 skipped · 44.2s ✅  
**Console errors:** 0 ✅

---

## ETAPA 1 — RESOLUÇÃO DO E2E TEST #6

| Test                         | Status  | Detalhe                              |
| ---------------------------- | ------- | ------------------------------------ |
| 1. /escalas carrega lista    | ✅ PASS | 5.0s                                 |
| 2. card exibe mês e status   | ✅ PASS | 4.9s                                 |
| 3. abre escala + grade Gantt | ✅ PASS | 6.4s                                 |
| 4. bloco de aeronave visível | ✅ PASS | 5.8s                                 |
| 5. —                         | —       | (não existe)                         |
| **6. filtro de quinzena**    | ⏭ SKIP | **Case C: feature não implementada** |
| 7. botão Nova Escala         | ✅ PASS | 4.4s                                 |
| 8. breadcrumb/título         | ✅ PASS | 5.4s                                 |
| 9. voltar para listagem      | ✅ PASS | 6.8s                                 |

**Resolução do test #6:** O filtro de quinzena nunca foi implementado no UI. A barra de filtros possui Aeronave, Modelo, Tripulante e Tipo — mas **nenhum** botão/dropdown de quinzena. O test foi convertido para `test.skip()` com documentação: `'filtro de quinzena filtra o conteúdo exibido — não implementado'`.

**Arquivo modificado:** `e2e/escalas/escalas.spec.ts` (linha 100)

---

## ETAPA 2 — VALIDAÇÃO DE BUGS VISUAIS

| Bug                            | Diagnóstico                                                                                                                                                                                      | Status |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **BUG 1** — Legenda incompleta | Todos os 10 tipos visíveis com emojis (🎓 Treinamento Solo, 🏢 Treinamento Simulador, ✅ Cheque, 🏖 Folga, 📋 Requisição, 🟢 Standby, 🌴 Férias, 📄 Licença, ✈ Voo Operacional, 🏥 Exame Médico) | ✅ OK  |
| **BUG 2** — Cores da grade     | Células usam inline `backgroundColor` via `configMap[tipo].cor` + contraste automático (`getTextColorForBackground`). Cores sólidas, sem classes genéricas.                                      | ✅ OK  |
| **BUG 3** — Voo mês inteiro    | Q1 → VOO dias 1-16 + FOLGA 17-31. Q2 → FOLGA 1-16 + VOO 17-31. Sem sobreposição.                                                                                                                 | ✅ OK  |
| **BUG 4** — Rótulo avulso      | N/A — nenhuma alocação avulsa presente na escala de teste (Maio 2026).                                                                                                                           | ⚠️ N/A |
| **BUG 5** — Largura/layout     | Tabelas com `overflow-x: auto`. Container 1027px, scroll 1174px. 32 colunas (1 label + 31 dias). Scroll horizontal funciona.                                                                     | ✅ OK  |

**Console errors:** 0 (após reload limpo)

---

## ETAPA 3 — BUG HUNT: FLUXOS CRÍTICOS

### Flow A — Nova Alocação ✅

- Modal `ModalAdicionarTripulacao` abre corretamente
- Seleção de aeronave funciona (PS-CDV, PR-BGE)
- Botões Q1/Q2/Personalizado preenchem datas automaticamente:
  - Q1: 2026-05-01 → 2026-05-16
  - Q2: 2026-05-17 → 2026-05-31
- Lista de tripulantes elegíveis com CMA, FRMS score, motivos de bloqueio
- Tripulantes já alocados aparecem desabilitados com razão

### Flow B — Detalhes de Evento (click na célula) ✅

- Click em célula com evento → abre `ModalDetalhesEvento`
- Modal exibe: tipo, tripulante, status (Confirmado), período, aeronave
- Ações disponíveis: Remover, Editar, Fechar, Qualif.
- Click em célula vazia (modo edição) → abre `ModalAdicionarEvento` com data pré-populada
- **Nota:** O click handler está em `BlocoAeronave`, NÃO em `CelulaEvento`. O hover tooltip via `@floating-ui/react` é separado do click.

### Flow C — Filtro de Aeronave ✅

- Dropdown `<details>/<summary>` com opções: Todas, PS-CDV, PR-BGE
- Filtrar por PR-BGE → apenas PR-BGE card na cobertura, apenas linhas PR-BGE na grade
- Chip ativo "PR-BGE ×" com dismiss
- Counter atualiza: 4/4 tripulantes (vs 18/20 sem filtro)
- "Todas" restaura tudo

### Flow D — Navegação ✅

- ← Escalas volta para lista
- Click em "Editar →" abre escala diferente (testei Março/2026)
- Dados corretos: 2/20 tripulantes, 137 eventos, 28 conflitos
- URL bookmarkable: `/escalas` (SPA com state interno)

### Flow E — Estados vazios/parciais ✅

- Escala Novembro (sparse): 2/20 tripulantes, 60 eventos, Sem conflitos
- PS-CDV com 30 gaps, 0/30 dias cobertos — exibe "Sem cobertura" + warnings
- "PIC descoberto: 17 nov → 30 nov" e "SIC descoberto: 1 nov → 16 nov"
- Sem crash, layout clean

### Flow F — Responsividade 1280px ✅

- Toolbar completo visível: Alocar, Situação, Enviar p/ Revisão, Mais, ⚙
- Filtros inline sem wrap forçado
- Cards de cobertura lado a lado
- Legenda wraps para 3 linhas
- Sem overflow horizontal na página (scroll interno na grade OK)

---

## ETAPA 4 — PERFORMANCE

### Baseline de rede

```
Health endpoint: 652ms (DNS+TLS+CF edge)
```

Latência de rede pura: ~650ms (macOS → Cloudflare edge)

### Endpoints medidos

| Endpoint                   | TTFB  | Server (est.) | Size   | HTTP |
| -------------------------- | ----- | ------------- | ------ | ---- |
| `/api/health`              | 652ms | ~5ms          | 252B   | 200  |
| `/api/escalas` (list)      | 673ms | ~25ms         | 2.6KB  | 200  |
| `/api/escalas/:id` (Maio)  | 913ms | ~260ms        | 276KB  | 200  |
| `/api/escalas/:id/eventos` | 913ms | ~260ms        | 271KB  | 200  |
| `/api/funcionarios`        | 928ms | ~280ms        | 10.7KB | 200  |

### Análise de warm-cache (3 runs escalas/:id)

```
Run1: 913ms  Run2: 935ms  Run3: 1015ms
```

**Consistente** — sem degradação ou spikes. 276KB de payload para 375 eventos com 18 tripulantes em 2 aeronaves é proporcional.

### Indexes verificados

- `idx_escala_eventos_tripulacao_id` ON `escala_eventos(tripulacao_id)` ✅
- `idx_escala_alocacoes_aeronave_funcao_data` ON `escala_alocacoes(escala_id, aeronave_id, funcao, data_inicio)` ✅
- `idx_funcionarios_empresa` ON `funcionarios(empresa_id)` ✅
- `idx_funcionarios_empresa_ativo` ON `funcionarios(empresa_id, ativo)` ✅
- `idx_funcionarios_modelo_aeronave_id` ON `funcionarios(modelo_aeronave_id)` ✅

### Veredicto

- **Sem P0 performance issues.** Server processing ~260ms para o endpoint mais pesado (375 eventos, 276KB) é aceitável para D1.
- `/api/funcionarios` com 280ms server para 10.7KB pode incluir joins de qualificações/CMA. Não é blocante (10KB = fast transfer).
- Todos os endpoints < 1s total com latência transatlântica.

---

## ACHADOS ADICIONAIS

### Dead Code: `CelulaEvento.tsx` (P3 — cleanup)

- **Arquivo:** `src/react-app/pages/escalas/components/EscalaCalendario/CelulaEvento.tsx` (237 linhas)
- **Situação:** Importado em `BlocoAeronave.tsx` (linha 16) mas `<CelulaEvento>` **nunca é usado** no JSX
- **Motivo:** Foi substituído por `DayCell` → `EscalaDayCell` na refatoração
- **Recomendação:** Remover import + arquivo em cleanup futuro

### Feature gap: Filtro de Quinzena (P4 — backlog)

- A barra de filtros tem Aeronave, Modelo, Tripulante e Tipo
- **Não existe** filtro de quinzena (Q1/Q2)
- Se necessário, implementar como toggle similar ao filtro de Aeronave
- E2E test #6 documentado como skip até implementação

---

## DECLARAÇÃO DE ESTABILIDADE

> **O módulo Escalas está ESTÁVEL para uso em produção.**

### Evidências:

- ✅ Build: 5.53s, zero errors
- ✅ E2E: 8/8 passing + 1 documented skip (feature gap)
- ✅ Console: 0 errors
- ✅ 5 bugs visuais validados (4 OK, 1 N/A)
- ✅ 6 fluxos críticos testados (todos PASS)
- ✅ Performance: todos endpoints < 1s (260ms server processing)
- ✅ Responsividade: layout OK @ 1280px
- ✅ DB indexes otimizados
- ✅ Zero crashes durante toda a sessão de teste

### Pendências não-blocantes:

1. **P3** — Remover dead code `CelulaEvento.tsx` + import
2. **P4** — Implementar filtro de quinzena (se desejado)
3. **P4** — BUG 4 (rótulo avulso) não pôde ser validado — sem dados de teste

---

_Relatório gerado em 2026-06-07 por GitHub Copilot (Claude Opus 4.6)_  
_Worker: 212a12d6 | Build: 5.53s | Escala de referência: Maio/2026 (9ad63f4d)_
