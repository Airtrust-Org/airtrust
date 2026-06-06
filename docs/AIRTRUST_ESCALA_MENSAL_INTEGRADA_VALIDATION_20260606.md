# AirTrust Escala Mensal Integrada - Implementacao e Validacao 2026-06-06

## Resultado

Classificacao: **VALIDADO COM LIMITACOES**

Motivo: a rota, a UI e os helpers puros foram implementados e validados localmente. A validacao com fonte real controlada encontrou dados reais de qualificacoes no tenant local `cds` e reconciliou contagens sem divergencia. O dataset local consultado para `2026-06` nao apresentou eventos reais das demais fontes na resposta final (`ESCALA`, `TREINAMENTO`, `SIMULADOR`, `FRMS`), portanto esses cenarios permanecem documentados como nao exercitados com fonte real nesta execucao.

## Arquivos principais

- `worker-airtrust/src/services/escala-mensal-integrada.ts`
- `worker-airtrust/src/routes/escala-mensal-integrada.ts`
- `worker-airtrust/src/routes/escalas-core.ts`
- `worker-airtrust/src/__tests__/services/escala-mensal-integrada.test.ts`
- `src/react-app/pages/escalas/VisaoMensalIntegradaPage.tsx`
- `src/react-app/pages/escalas/components/EscalasTabBar.tsx`
- `src/react-app/App.tsx`

## Contrato entregue

- `GET /api/escalas/visao-mensal-integrada`
- Parametros: `mes=YYYY-MM`, `colaborador_id`, `base_id`, `funcao_id`, `incluir_frms`, `severidade`
- Tenant vem do contexto autenticado via middleware global; a rota nao aceita tenant arbitrario.
- Resposta com `summary`, `employees`, eventos por dia, `source`, `sourceId`, `sourceRoute`, `severity`, `blocksAllocation`, `requiresAction` e `diagnostics`.

## Validacao executada

### Testes automatizados

Comando:

```sh
cd worker-airtrust && npx vitest run src/__tests__/services/escala-mensal-integrada.test.ts
```

Resultado:

- 1 arquivo de teste passou.
- 9 testes passaram.

Casos cobertos:

- primeiro e ultimo dia do mes;
- eventos adjacentes sem falso conflito;
- evento atravessando meia-noite;
- cancelado sem conflito ativo;
- deduplicacao positiva e negativa por chave de origem;
- conflito escala x compromisso;
- indisponibilidade bloqueante x escala;
- resumo reconciliado com itens;
- agrupamento por tripulante/dia.

### Lint dos arquivos alterados

Comando:

```sh
npx eslint worker-airtrust/src/services/escala-mensal-integrada.ts worker-airtrust/src/routes/escala-mensal-integrada.ts worker-airtrust/src/__tests__/services/escala-mensal-integrada.test.ts src/react-app/pages/escalas/VisaoMensalIntegradaPage.tsx src/react-app/pages/escalas/components/EscalasTabBar.tsx src/react-app/App.tsx
```

Resultado: passou sem erros.

### API local

Comando:

```sh
npm run dev:worker:local
curl -sS 'http://localhost:8787/api/escalas/visao-mensal-integrada?mes=2026-06&incluir_frms=true'
```

Resultado final:

```json
{
  "success": true,
  "summary": {
    "employees": 24,
    "events": 168,
    "warnings": 26,
    "conflicts": 0,
    "blockingIssues": 142
  }
}
```

### Reconciliacao API x itens renderizaveis

Resultado:

```json
{
  "summary": {
    "employees": 24,
    "events": 168,
    "warnings": 26,
    "conflicts": 0,
    "blockingIssues": 142
  },
  "reconciled": {
    "employees": 24,
    "events": 168,
    "warnings": 26,
    "conflicts": 0,
    "blockingIssues": 142
  },
  "bySource": {
    "QUALIFICACAO": 168
  }
}
```

### Reconciliacao com fonte SQLite local

Banco local:

```text
worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite
```

Tenant local autenticado por dev bypass: `empresa_id=6`, `codigo=cds`.

Consulta read-only equivalente para qualificacoes retornou:

```text
total  blocking  warning
-----  --------  -------
168    142       26
```

Comparacao:

- API `events`: 168 = fonte `total`: 168
- API `blockingIssues`: 142 = fonte `blocking`: 142
- API `warnings`: 26 = fonte `warning`: 26
- API `sourceId` de qualificacao: 168 ids distintos, sem duplicidade detectada.

### Interface local

Comandos:

```sh
npm run dev -- --port 3000 --host 127.0.0.1
```

Browser do Codex abriu:

```text
http://127.0.0.1:3000/escalas/visao-mensal
```

Observado na tela:

- titulo `Visao Mensal Integrada`;
- aba `Visao Integrada`;
- mes `2026-06`;
- cards: `24` tripulantes, `168` compromissos, `26` avisos, `0` conflitos, `142` bloqueios;
- grade mensal por tripulante;
- links de origem para qualificacoes, por exemplo `/qualificacoes?id=3241`;
- sem erros de console no Browser.

## Ajustes feitos durante a validacao

- Queries removidas de colunas nao presentes no D1 local: `funcionarios.nome_guerra`, `funcionarios.funcao_id`, `escala_situacao_tipos.empresa_id`, `simulador_agendamentos.tipo_dispositivo`.
- Alertas de qualificacao vencidos antes do mes foram ancorados no primeiro dia do mes.
- Alertas de qualificacao vencendo dentro da janela apos o mes foram ancorados no ultimo dia do mes.
- A data real de vencimento permanece preservada em `metadata.dueDate`.

## Limitacoes e cenarios nao exercitados com fonte real

- Sem evidencia real local, nesta execucao, para `ESCALA`, `TREINAMENTO`, `SIMULADOR` e `FRMS` no mes `2026-06`.
- Sem validacao ponta-a-ponta de conflito real entre escala e treinamento/simulador por ausencia de dados concorrentes no dataset local.
- Sem validacao real de permissao FRMS negada; a execucao local usou `ENABLE_DEV_AUTH_BYPASS`.
- `funcao_id` e aceito no contrato, mas a implementacao evita referenciar a coluna quando o schema local nao a possui; nesta base o filtro por funcao_id nao foi exercitado.
- Typecheck global do worker permanece bloqueado por erros preexistentes fora desta entrega em arquivos FRMS/tests.
- Typecheck global do frontend permanece bloqueado por erros preexistentes fora desta entrega em `Header.tsx`, `EditarFicha.tsx`, `LogsViewer.tsx` e `PDFGenerator.tsx`.

## Comandos com falhas relevantes

```sh
npx tsc --noEmit --project worker-airtrust/tsconfig.json
```

Falhas preexistentes observadas:

- `worker-airtrust/src/__tests__/frms/acumulo-frota-rolling-fields.test.ts`
- `worker-airtrust/src/__tests__/frms/frms-rebuild-from-sigvoos-script.test.ts`
- `worker-airtrust/src/cron/frms-daily-check.ts`
- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`

```sh
npx tsc --noEmit --project tsconfig.app.json
```

Falhas preexistentes observadas:

- `src/react-app/components/layout/Header.tsx`
- `src/react-app/pages/EditarFicha.tsx`
- `src/react-app/pages/LogsViewer.tsx`
- `src/react-app/pages/simuladores/components/PDFGenerator.tsx`

## Conclusao

Nao ha falso positivo conhecido na parcela validada contra fonte real local de qualificacoes. A entrega nao deve ser classificada como totalmente `VALIDADO` porque os demais modulos nao tiveram casos reais exercitados nesta execucao local.
