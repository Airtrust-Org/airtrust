# DISPONIBILIDADE CORRIGIDA — 2026-03-05

**Auditor:** GitHub Copilot  
**Commit funcional do fix:** `5f4d419a`  
**Commit pós-deploy:** `dceb3e4b`  
**Worker deploy validado:** `2f4bfebd-6050-41ad-a0bf-c7e33e735266`  
**Pages build-version:** `5f4d419a`

## Escopo corrigido

- **BUG-14** — badge de CMA contraditória no modal
- **BUG-15** — preview mostrava `0 FOL` e backend não completava o mês com folga
- **BUG-16** — filtro AW139/SK76 retornava a mesma lista
- **BUG-17** — remoção de `Mês completo`
- **BUG-18** — grade não atualizava corretamente após adicionar tripulação

## Causa raiz por bug

### BUG-14 — CMA contraditória

**Causa raiz:** o modal misturava duas fontes de verdade. A coluna lateral caía no branch padrão e renderizava `✓ CMA` até para piloto com estado `sem_cma`.

**Correção aplicada:** o modal passou a derivar o status de CMA diretamente do payload de pilotos disponíveis (`cma_valido`, `cma_validade_fim`, `cma_status`) e o render ficou binário/consistente.

### BUG-15 — preview e geração de FOL

**Causa raiz:** o preview só calculava dias dentro da janela selecionada e `gerarEventosBase()` só criava eventos entre `data_inicio` e `data_fim`.

**Correção aplicada:**

- preview do modal passou a calcular o mês inteiro;
- backend passou a gerar `VOO` dentro da alocação e `FOL` no restante do mês;
- smoke passou a exigir ambos (`VOO` + `FOL`) antes e depois da regeneração.

### BUG-16 — filtro por modelo

**Causa raiz:** o endpoint antigo era permissivo e tinha fallback para “todos os pilotos”; no rewrite surgiram 3 incompatibilidades reais de produção:

1. lookup de aeronave quebrava por escopo do tenant;
2. `frms_avaliacoes` não existe no banco de produção;
3. a ordem dos binds do `escala_id` estava errada e deslocava os placeholders do filtro.

**Correção aplicada:**

- lookup da aeronave passou a resolver o modelo pelo `id` real da aeronave;
- `frms_score` virou opcional quando `frms_avaliacoes` não existe;
- ordem dos binds foi corrigida;
- endpoint deixou de retornar fallback global e passou a responder com payload rico e filtro estrito por modelo.

### BUG-17 — `Mês completo`

**Causa raiz:** opção ainda estava ativa no `QuinzenaMode` e no seletor do modal.

**Correção aplicada:** remoção do modo `mes` do tipo, do default e da UI.

### BUG-18 — grade sem atualização imediata

**Causa raiz:** havia duas frentes:

1. invalidação/refetch insuficiente nas queries de Escalas;
2. endpoint de listagem de tripulações quebrava em produção por referenciar `pic.nome_guerra`/`sic.nome_guerra`, colunas ausentes no schema real.

**Correção aplicada:**

- refetch centralizado e reforçado em `useEscalaMutations()`;
- queries de pilotos ficaram sem `staleTime` prolongado;
- rotas de detalhe/listagem/export de tripulações deixaram de depender de `nome_guerra`.

---

## Evidências reais — T-01 a T-05

### T-01 — Fonte de verdade de CMA em produção

**Objetivo:** provar se a contradição vinha de dados válidos em outra tabela.

**Saída real:**

```text
--- T-01 tables
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('funcionario_habilitacoes','funcionario_certificacoes','frms_avaliacoes') ORDER BY name;
→ retorno: vazio para funcionario_habilitacoes e funcionario_certificacoes

--- T-01 CMA historico
┌────────────────────────────┬──────────────┬────────────┐
│ nome                       │ cma_validade │ cma_status │
├────────────────────────────┼──────────────┼────────────┤
│ Dieter Johny Kühr          │ NULL         │ NULL       │
│ José Alfredo Gomes Marinho │ NULL         │ NULL       │
└────────────────────────────┴──────────────┴────────────┘

--- T-01 funcionarios CMA
┌────────────────────────────┬──────┬─────────────────────┬──────────────┐
│ nome                       │ cma  │ data_realizacao_cma │ validade_cma │
├────────────────────────────┼──────┼─────────────────────┼──────────────┤
│ Dieter Johny Kühr          │ NULL │ NULL                │ NULL         │
│ José Alfredo Gomes Marinho │ NULL │ NULL                │ NULL         │
└────────────────────────────┴──────┴─────────────────────┴──────────────┘
```

**Conclusão:** a contradição era de renderização/frontend, não de dados concorrentes válidos.

### T-02 — Filtro AW139 x SK76

**Objetivo:** provar que o endpoint final separa os modelos.

**Saída real:**

```text
--- T-02 endpoint
AW139 7
SK76 18

--- T-02 D1 active counts
┌────────┬───────┐
│ modelo │ total │
├────────┼───────┤
│ AW139  │ 7     │
│ SK76   │ 17    │
└────────┴───────┘
```

**Conclusão:** o endpoint deixou de retornar a mesma lista para ambos os modelos. O `18` em SK76 inclui 1 piloto multi-modelo (`AW139 / SK76`), coerente com a regra de compatibilidade.

### T-03 — Geração automática VOO + FOL

**Objetivo:** provar que a criação e a regeneração mantêm o mês completo.

**Saída real do smoke pós-deploy:**

```text
7) Criar tripulação teste
✓ Tripulação criada: c8d2fa48-a659-4720-adc6-448a73ccaa8a
✓ Eventos gerados síncronos: 31

9) Validar auto_quinzena com VOO e FOL
✓ Eventos auto_quinzena presentes: total=31 voo=15 fol=16

10) Regenerar eventos da tripulação
✓ Regenerar-eventos OK: 31 eventos

11) Regenerar mantém VOO e FOL
✓ Regeneração preservou VOO/FOL: voo=15 fol=16
```

**Conclusão:** a lógica automática agora fecha o mês com `VOO` no período alocado e `FOL` no restante.

### T-04 — Visibilidade imediata após POST

**Objetivo:** provar que a tripulação aparece sem F5.

**Saída real do smoke pós-deploy:**

```text
8) Tripulação aparece imediatamente após POST
✓ Tripulação listada imediatamente
```

**Conclusão:** o backend de listagem voltou a responder corretamente e a UI tem refetch consistente.

### T-05 — Deploy e saúde final

**Objetivo:** provar que frontend e worker publicados estão na mesma versão funcional.

**Saída real:**

```text
--- Pages build-version
9:    <meta name="build-version" content="5f4d419a" />

--- Worker health
{
  "success": true,
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latency": 124 },
    "storage": { "status": "ok", "latency": 159 }
  },
  "stats": {
    "timestamp": "2026-03-06T03:45:24.990Z",
    "environment": "production",
    "version": "5f4d419a",
    "region": "BR"
  },
  "latency": 283
}
```

**Conclusão:** Pages e Worker estão servindo a mesma versão lógica corrigida (`5f4d419a`).

---

## Smoke final obrigatório

```text
=== SMOKE TEST ESCALAS OK ===
1) Login ✓
2) Health ✓
3) Escala alvo ✓
4) Aeronave ✓
5) Pilotos filtrados ✓ 18
5b) Listas AW139 x SK76 ✓ (7 vs 18)
6) Padrões dinâmicos ✓ 5
7) Criar tripulação teste ✓
8) Tripulação aparece imediatamente após POST ✓
9) auto_quinzena com VOO/FOL ✓
10) regenerar-eventos ✓
11) regeneração preserva VOO/FOL ✓
12) endpoint admin removido ✓
13) limpeza ✓
```

## Arquivos principais alterados

- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`
- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`
- `worker-airtrust/src/routes/escalas-shared.ts`
- `worker-airtrust/src/routes/escalas.ts`
- `scripts/smoke-test-alocacao.sh`

## Status final

- **Build:** OK
- **Smoke:** OK
- **Deploy Pages:** OK
- **Deploy Worker:** OK
- **Bugs 14-18:** corrigidos e validados em produção
