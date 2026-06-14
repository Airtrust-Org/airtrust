# Controle de Voos N1 — End-to-End Readiness

> Tipo: validacao macro frontend + backend + governanca
> Data: 2026-06-14
> Escopo: readiness para piloto interno controlado
> Referencias: `docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md`, `docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md`, `docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`, `src/react-app/hooks/useControleVoos.ts`, `src/react-app/pages/controle-voos/`, `worker-airtrust/src/routes/controle-voos.ts`, `worker-airtrust/src/__tests__/routes/controle-voos.test.ts`, `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`

## Veredito

**Nao pronto** para piloto interno controlado no estado atual.

### Motivo executivo

O backend N1 minimo esta consistente e bem testado, mas o fluxo macro ainda falha em tres pontos de readiness:

1. o modulo ainda se apresenta como **N0 / prototipo / previa** no frontend principal;
2. a stack local conectada ao frontend principal nao tem as tabelas `cv_*`, entao a navegacao real cai em erro de API;
3. o fluxo principal de RDV ainda nao permite **criar/editar** o preenchimento na UI conectada, apenas ler e finalizar quando um rascunho ja existe.

Enquanto esses pontos permanecerem, o modulo ainda nao sustenta um piloto controlado com usuarios operacionais reais.

## Top 10 Bloqueios

1. **Bloqueia piloto interno**: o banner e a governanca do modulo continuam N0/prototipo, nao N1. Evidencia em [src/react-app/lib/modules.ts](/Users/filipedaumas/SAAS/Airtrust/src/react-app/lib/modules.ts:237), [src/react-app/pages/controle-voos/components/ControleVoosPrototypeBanner.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/components/ControleVoosPrototypeBanner.tsx:9) e [src/react-app/pages/controle-voos/components/ControleVoosPageShell.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/components/ControleVoosPageShell.tsx:7).
2. **Bloqueia piloto interno**: a stack real validada no navegador retornou `D1_ERROR: no such table: cv_voos` em `GET /api/controle-voos/dashboard`, impedindo dashboard, detalhe de voo e detalhe de RDV com dados reais.
3. **Bloqueia piloto interno**: a tela de RDV conectada trata `data: null`, mas nao oferece criacao nem edicao do RDV; o proprio texto diz que a criacao manual esta em desenvolvimento. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx:99).
4. **Bloqueia piloto interno**: o detalhe do voo ainda informa que a tripulacao nao esta disponivel nesta versao N1 e que o endpoint esta em desenvolvimento. Evidencia em [src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx:204).
5. **Corrigir antes do piloto, mas nao bloqueia codigo**: a lista de RDV nao lista RDVs; ela lista voos e manda o usuario abrir um detalhe por voo. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRdv.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdv.tsx:15).
6. **Corrigir antes do piloto, mas nao bloqueia codigo**: paginas conectadas ainda exibem IDs crus para aeronave, tipo de voo, natureza e responsavel, o que piora leitura operacional. Evidencia em [src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx:145) e [src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx:240).
7. **Corrigir antes do piloto, mas nao bloqueia codigo**: o dashboard principal se descreve como “dados reais”, mas o proprio modulo continua com banner de previa/prototipo. Isso gera contradicao de governanca e expectativa errada. Evidencia em [src/react-app/pages/controle-voos/ControleVoosDashboard.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosDashboard.tsx:93).
8. **Corrigir antes do piloto, mas nao bloqueia codigo**: o subnav mistura telas reais e telas demonstrativas sem marcador visual por item. Para o usuario, Jornadas, Indisponibilidades, Hangaragem, Relatorios e Tabelas ainda parecem parte do mesmo fluxo. Evidencia em [src/react-app/pages/controle-voos/components/ControleVoosSubnav.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/components/ControleVoosSubnav.tsx:4).
9. **Pode ficar para depois**: ainda existem termos sensiveis fora dos disclaimers ideais, principalmente “nao fiscal” no header do dashboard e no botao desabilitado de exportacao. Evidencia em [src/react-app/pages/controle-voos/ControleVoosDashboard.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosDashboard.tsx:93) e [src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx:315).
10. **Pode ficar para depois**: a tela de relatorios continua demonstrativa apesar de o backend B4 ja expor `GET /relatorios/resumo-operacional`, entao ainda ha valor backend sem consumo frontend. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx:23).

## Top 10 Pontos Prontos

1. Os testes de rota de Controle de Voos passaram: `36/36`.
2. Os testes da migration N1 passaram: `11/11`.
3. O teste de migration governance passou: `7/7`.
4. `npx tsc --noEmit` na raiz passou.
5. `npm run build` passou.
6. `npm run lint` passou.
7. `git diff --check` passou.
8. O backend filtra por `empresa_id` e `deleted_at` nas queries criticas de dashboard, relatorio e RDV. Evidencia em [worker-airtrust/src/routes/controle-voos.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/controle-voos.ts:1410).
9. O backend aplica RBAC coerente para N1: `viewer` le; `editor` escreve/finaliza. Evidencia em [worker-airtrust/src/routes/controle-voos.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/controle-voos.ts:262) e nos testes em [worker-airtrust/src/__tests__/routes/controle-voos.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/controle-voos.test.ts:1100).
10. As telas principais tratam loading, erro e empty state de forma explicita, sem quebrar silenciosamente. Evidencia em [src/react-app/pages/controle-voos/ControleVoosDashboard.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosDashboard.tsx:96), [src/react-app/pages/controle-voos/ControleVoosVoos.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVoos.tsx:38), [src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx:82) e [src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx:34).

## Telas Validadas

### Conectadas a API real

- **Dashboard OCC**: usa `useControleVoosDashboard()`, tem loading/erro, mas na stack validada falhou por ausencia de `cv_voos`. Evidencia em [src/react-app/pages/controle-voos/ControleVoosDashboard.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosDashboard.tsx:18).
- **Lista de voos**: usa `useControleVoosVoos()` e `useControleVoosAeroportos()`, com loading/erro/empty state. Evidencia em [src/react-app/pages/controle-voos/ControleVoosVoos.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVoos.tsx:15).
- **Detalhe do voo**: funciona por ID real no codigo, mas a stack validada retornou erro de API por schema ausente. A tela mostra erro de forma clara. Evidencia em [src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosVooDetalhe.tsx:76).
- **Lista RDV**: conectada, mas sobre a lista de voos, nao sobre uma lista real de RDVs. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRdv.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdv.tsx:15).
- **Detalhe RDV**: usa `useControleVoosVoo()`, `useControleVoosRdv()` e `useFinalizarPreenchimentoRdv()`. Trata `rdv === null`, mas nao permite preencher um novo RDV ponta a ponta. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx:26).

### Ainda demonstrativas

- **Jornadas**: mock + narrativa FRMS demonstrativa. Evidencia em [src/react-app/pages/controle-voos/ControleVoosJornadas.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosJornadas.tsx:23).
- **Indisponibilidades**: mock. Evidencia em [src/react-app/pages/controle-voos/ControleVoosIndisponibilidades.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosIndisponibilidades.tsx:26).
- **Hangaragem**: mock. Evidencia em [src/react-app/pages/controle-voos/ControleVoosHangaragem.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosHangaragem.tsx:14).
- **Relatorios**: mock, apesar do backend B4 existir. Evidencia em [src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx:23).
- **Tabelas auxiliares**: mock. Evidencia em [src/react-app/pages/controle-voos/ControleVoosTabelas.tsx](/Users/filipedaumas/SAAS/Airtrust/src/react-app/pages/controle-voos/ControleVoosTabelas.tsx:27).

## Endpoints Validados

- `GET /api/controle-voos/voos`
- `GET /api/controle-voos/voos/:id`
- `PATCH /api/controle-voos/voos/:id`
- `POST /api/controle-voos/voos/:id/status`
- `GET /api/controle-voos/voos/:id/rdv`
- `PUT /api/controle-voos/voos/:id/rdv`
- `POST /api/controle-voos/voos/:id/rdv/finalizar-preenchimento`
- `GET /api/controle-voos/dashboard`
- `GET /api/controle-voos/relatorios/resumo-operacional`
- `GET /api/controle-voos/catalogos/aeroportos`

### Observacoes de coerencia frontend/backend

- Os tipos principais do hook batem com os payloads reais do backend para `voos`, `rdv`, `dashboard` e `aeroportos`. Evidencia em [src/react-app/hooks/useControleVoos.ts](/Users/filipedaumas/SAAS/Airtrust/src/react-app/hooks/useControleVoos.ts:19) e [worker-airtrust/src/routes/controle-voos.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/controle-voos.ts:1217).
- O frontend principal ainda **nao consome** `GET /relatorios/resumo-operacional`.
- O frontend ainda nao faz lookup suficiente para aeronave/tipo/natureza/responsavel.

## Riscos de Governanca

1. O modulo continua rotulado como N0/prototipo nas telas principais, o que contradiz o momento Marco C.
2. O banner atual protege contra confusao regulatoria, mas ao mesmo tempo invalida readiness de piloto operacional.
3. Ainda existem termos sensiveis em texto de UI fora dos disclaimers ideais, principalmente “nao fiscal” em componentes interativos.
4. A coexistencia de telas reais e demonstrativas no mesmo subnav aumenta o risco de o usuario interpretar mock como dado operacional valido.
5. O RDV continua corretamente nao regulado no backend e na maior parte da UX; nao ha linguagem de assinatura juridica nem validacao oficial nas telas principais validadas.

## Riscos de Seguranca

1. **Baixo risco de cross-tenant no codigo backend atual**: as queries criticas usam `empresa_id` e `deleted_at`, e os testes cobrem isolamento por tenant.
2. **RBAC N1 esta coerente**: `viewer` so le; `editor` e `admin` operam.
3. **Risco operacional de ambiente**: a stack conectada usada na validacao nao tinha `cv_*`, o que indica risco de inconsistencias de setup entre ambientes.
4. **Eventos operacionais estao suficientes para N1**: criacao/atualizacao/finalizacao de RDV e mudancas de status registram `cv_voo_eventos`; isso ainda nao e trilha N2/N3, mas esta adequado para N1.

## Riscos de Usabilidade

1. OCC consegue entender o painel, mas nao consegue confiar nele enquanto a mesma UI diz “dados reais” e “prototipo”.
2. OCC consegue listar e abrir voos no codigo, mas a stack validada nao carregou dados por falta de schema.
3. O usuario consegue abrir o detalhe do RDV e ver estado nulo, mas nao consegue preencher o RDV a partir dali.
4. IDs crus reduzem legibilidade e elevam risco de erro humano na leitura.
5. A mistura de subnav unico para telas reais e mock aumenta confusao no piloto.

## Decisao Sobre Piloto Interno Controlado

**Decisao: nao liberar piloto interno controlado ainda.**

### Condicoes minimas antes de liberar

1. Reclassificar o modulo conectado para N1 operacional interno nas telas principais.
2. Garantir que o ambiente candidato do piloto tenha `0410_controle_voos_n1_schema.sql` aplicado e dados minimos `cv_*` acessiveis.
3. Completar o fluxo principal de RDV na UI conectada: pelo menos criar/editar rascunho e depois finalizar preenchimento.
4. Exibir tripulacao real ou esconder o bloco do detalhe do voo enquanto o endpoint nao estiver pronto.

Sem isso, o piloto vira essencialmente um QA tecnicamente conectado, nao um uso operacional controlado.

## Proximos Passos Macro

1. Fechar a **governanca de presentacao** do modulo: N1 nas telas reais, marcador claro nas telas demonstrativas.
2. Fechar a **prontidao de ambiente**: schema `cv_*` e catalogos basicos no ambiente de piloto.
3. Fechar o **fluxo operacional minimo de RDV** no frontend conectado.
4. Fechar **lookups operacionais** de aeronave, tipo, natureza e responsavel.
5. Rodar nova validacao macro no ambiente ja preparado, com massa real controlada e pelo menos um voo com RDV em `rascunho` e outro `preenchimento_finalizado`.

## O Que Nao Fazer Agora

- Nao expandir para eDB, SDRMe, Records Core, RAS ou assinatura juridica.
- Nao puxar exportacao/PDF como resposta ao gap principal; o bloqueio atual nao e export.
- Nao abrir Jornadas, Hangaragem, Indisponibilidades ou Relatorios como “prontas” so porque ja aparecem no subnav.
- Nao tentar resolver readiness com microajustes cosmeticos; os gaps atuais sao de governanca, ambiente e fluxo principal.

## Evidencias e Validacoes Executadas

### Navegacao real

- `http://127.0.0.1:3000/controle-voos`
- `http://127.0.0.1:3000/controle-voos/voos/601`
- `http://127.0.0.1:3000/controle-voos/rdv/601`

Resultado:

- o frontend carregou;
- o modulo apareceu como `PRÉVIA`, `N0`, `A0`, `PROTÓTIPO`;
- a API real respondeu erro `D1_ERROR: no such table: cv_voos` na stack validada;
- as telas exibiram erro explicito, sem tela quebrada silenciosa.

### Comandos obrigatorios

1. `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts`
   Resultado: `36 passed`
2. `cd worker-airtrust && npx vitest run src/__tests__/migrations/controle-voos-n1-schema.test.ts`
   Resultado: `11 passed`
3. `cd worker-airtrust && npx vitest run src/__tests__/migrations/migration-governance.test.ts`
   Resultado: `7 passed`
4. `npx tsc --noEmit`
   Resultado: `pass`
5. `npm run build`
   Resultado: `pass`
6. `npm run lint`
   Resultado: `pass`
7. `git diff --check`
   Resultado: `pass`
8. `rg -n -i "\\bassinatura\\b|\\bassinado\\b|\\bvalidado\\b|\\bvalidacao\\b|\\bhomologado\\b|ANAC aprovado|\\beDB\\b|\\bSDRMe\\b|\\bRAS\\b|\\bfiscal\\b|regulated_" src/react-app/pages/controle-voos worker-airtrust/src/routes/controle-voos.ts`
   Resultado: encontrou ocorrencias principalmente em disclaimers e alguns textos de UI ainda sensiveis; nao encontrou uso regulatorio novo no backend principal validado.

## Sugestao de Commit

`docs(controle-voos): add N1 end-to-end readiness assessment`
