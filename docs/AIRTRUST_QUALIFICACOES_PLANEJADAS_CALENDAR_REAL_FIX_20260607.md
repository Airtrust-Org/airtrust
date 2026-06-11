# AIRTRUST — Qualificações Planejadas Calendar Real Fix

**Data**: 2026-06-07  
**Base git**: `d872c83489d845f6c70ca9d4abf08e8d044d3ed9`  
**Versão publicada**: `2026-06-07T21:15:44Z-d872c83`  
**Classificação**: HOTFIX REAL VALIDADO EM PRODUÇÃO  
**Escopo de dados**: sem writes em D1, sem migrations aplicadas, sem alterações em FRMS/FIRA/lotes

---

## 1. Problema real

O estado anterior era um falso positivo por dois motivos independentes:

1. O frontend em produção ainda renderizava Planejadas em duas superfícies diferentes:
   - uma lista separada de qualificações planejadas fora da célula do calendário
   - o grid de `TreinamentosPlanejadosPage`
2. O worker publicado ainda falhava ao carregar sessões de simulador em produção porque a query referenciava `aeronaves.matricula`, coluna inexistente no schema real de produção.

Efeito observado antes da correção real:

- Antônio aparecia fora da célula do dia `25/06/2026`
- o dia `25` mostrava `Sem treinamentos planejados`
- as sessões de simulador de junho não populavam as células
- havia duplicidade de ação visual (`Nova turma` + `Novo treinamento`)

---

## 2. Correções aplicadas

### Frontend

Arquivos:

- `src/react-app/pages/Qualificacoes.tsx`
- `src/react-app/pages/TreinamentosPlanejadosPage.tsx`
- `src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts`

Mudanças principais:

- Lista e Calendário passaram a usar a mesma superfície embutida: `TreinamentosPlanejadosPage`
- a renderização separada de qualificações planejadas fora do grid foi removida
- a barra de ações interna foi ocultada quando a página é embutida em Qualificações
- ficou apenas o botão externo `Nova turma`
- `Turmas` deixou de aparecer como subaba visível
- os cards do calendário passaram a exibir:
  - participante(s)
  - qualificação planejada vinculada, quando existir
  - rótulo da sessão de simulador vinculada

### Worker

Arquivos:

- `worker-airtrust/src/routes/treinamentos-planejados.ts`
- `worker-airtrust/src/__tests__/routes/treinamentos-planejados.test.ts`

Mudança principal:

- `loadSimulatorSessionItems` agora detecta em runtime se `aeronaves.matricula` existe
- quando a coluna não existe, a query usa fallback compatível com o schema real de produção

---

## 3. Oráculo de produção

### Banco

Confirmações read-only em produção:

- `PRAGMA table_info(aeronaves)` confirmou ausência da coluna `matricula`
- Antônio:
  - `funcionario_id=3`
  - `nome="Antonio Luiz Simões Ramos"`
  - `matricula="00074"`
- qualificação planejada vinculada:
  - `historico_id=4534`
  - `qualificacao_tipo_id=40`
  - `qualificacao_nome="SK76 — Currículo de Voo (FFS)"`
  - `status="PLANEJADA"`
  - `data_prevista="2026-06-25"`
  - `sessao_id=75`
- sessões válidas de simulador em junho/2026:
  - 25 itens de `SIMULADOR`
  - 1 turma teórica em `15/06` e `16/06`
  - total consolidado no calendário: `26` itens

### API

Endpoint efetivo do calendário:

- `GET /api/treinamentos/planejados/calendario?mes=2026-06`

Resposta validada após o deploy:

- `total=26`
- Antônio aparece no payload em `25/06/2026`
- a sessão vinculada `source_id=75` traz:
  - `hora_inicio="11:00"`
  - `hora_fim="13:00"`
  - `qualificacao_nome="SK76 — Currículo de Voo (FFS)"`
- o payload também traz as demais sessões de simulador dos dias `25` a `30`

### Produção publicada

- frontend `build-version`: `2026-06-07T21:15:44Z-d872c83`
- worker `/api/version`: `2026-06-07T21:15:44Z-d872c83`
- `sw.js`: `cf-cache-status: BYPASS`
- `https://airtrust.online`: `cf-cache-status: DYNAMIC`

---

## 4. Validação visual real

Tela validada:

- `https://airtrust.online/qualificacoes?tab=planejados&view=calendario`

Resultado observado autenticado em produção:

- o dia `25` mostra `5 evento(s)`
- Antônio aparece dentro da célula do dia `25`
- a card vinculada ao histórico planejado mostra:
  - `Antonio Luiz Simões Ramos — SK76 — Currículo de Voo (FFS)`
  - `11:00 - 13:00`
  - `Antonio Luiz Simões Ramos • Vargas`
  - `SK76 - PERIÓDICO - 03/03: LOFT E CHECK`
  - `Sessão de simulador`
- os dias `26`, `27`, `28`, `29` e `30` também aparecem preenchidos com sessões de simulador
- não há botão `Novo treinamento` duplicado
- há apenas `Nova turma`
- `Turmas` não aparece como subaba

Evidência visual local:

- `artifacts/validation/planejadas-calendar-prod-day25-pagecoords-20260607.png`

---

## 5. Testes executados

Passaram:

- `npx tsc --noEmit`
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npm run lint`
- `npm run build`
- `npm run test:worker`
- `npx vitest run src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts src/react-app/pages/__tests__/TreinamentosPlanejadosPage.presenca-diaria.test.ts`
- `cd worker-airtrust && npx vitest run src/__tests__/routes/treinamentos-planejados.test.ts`

Observação:

- o frontend suite completo `npm run test:run` já tinha 3 falhas por timeout fora do escopo de Planejadas (`ModalAtribuirQualificacao` e `FRMS Checkin Fadiga`) e não foi usado como critério de bloqueio deste hotfix.

---

## 6. Classificação final

**CORRIGIDO E VALIDADO EM PRODUÇÃO**

Critérios de aceite confirmados:

1. Antônio `25/06/2026` aparece dentro da célula do dia `25`
2. sessões de simulador de junho aparecem nas células dos dias corretos
3. não existe `Novo treinamento` duplicado
4. existe apenas `Nova turma`
5. `Turmas` não aparece como subaba visível
