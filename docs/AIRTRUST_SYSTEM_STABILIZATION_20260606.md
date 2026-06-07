# AIRTRUST System Stabilization — 2026-06-06

## Escopo
Auditoria sistêmica local + read-only de produção para regressões em Qualificações, Planejados, Simuladores e observabilidade de release.

## Estado inicial
- Branch: `main`
- HEAD inicial: `808bb11790cbe12ecd3fcb8ba9e6593202b8410c`
- `origin/main`: `808bb11790cbe12ecd3fcb8ba9e6593202b8410c`
- Divergência: `0 0`
- Produção observada em `2026-06-06`:
  - Frontend: `https://airtrust.online` expõe `build-version=808bb11`
  - Worker: `https://api.airtrust.online/api/version` expunha `managed-by-script`

## Dados confirmados em fonte oficial
- `empresa_id = 6`
- `qualificacoes_historico`: 1 planejada ligada a sessão real
  - `id=4534`
  - `status='PLANEJADA'`
  - `data_conclusao='2026-06-25'`
  - `sessao_id=75`
- `treinamentos_planejados`: 0 linhas equivalentes na checagem anterior
- `simulador_agendamentos`: 25 linhas em junho/2026
- Snapshot local D1 usado pelo revisor independente:
  - `simuladores=2`
  - `manobras=222`
  - `categorias=20`
  - `tipos_sessao=6`
  - `modelos_sessao=29`
  - `simulador_agendamentos=3`
  - `sessoes_participantes=6`

## Achados principais
| ID | Severidade | Achado | Estado |
| --- | --- | --- | --- |
| A1 | Alto | Frontend em produção expõe `808bb11`, worker expõe placeholder `managed-by-script` | Corrigido localmente |
| A2 | Alto | `sw-manager` monitorava `/manifest.json`, mas produção serve ali o manifest de build do Vite | Corrigido localmente |
| A3 | Alto | `GET /simuladores/sessoes/:id` não tolerava schema antigo sem `aeronave_id`/`tipo_dispositivo` | Corrigido localmente |
| A4 | Alto | Gestão de Simuladores convertia falha de API em totais zerados | Corrigido localmente |
| A5 | Médio | Tela legada de cadastros usava endpoints antigos `/tipos` e `/templates` sem auth | Corrigido localmente |
| A6 | Médio | Dashboard/Histórico de simuladores mostravam vazio/zero em erro de carga | Corrigido localmente |
| A7 | Alto | Planejados não consolidava qualificação planejada avulsa + sessão de simulador + turma no mesmo contrato | Corrigido localmente |

## Correções aplicadas
- Consolidado de planejados:
  - contrato único para `TURMA`, `SIMULADOR` e `QUALIFICACAO_PLANEJADA`
  - normalização central de status
  - `source`, `source_id`, `source_route`, `source_label`, `read_only`
- Worker/system:
  - placeholders tracked (`managed-by-script`, similares) deixaram de ser aceitos como versão/build canônicos
  - root worker e painel admin de domain events passaram a usar a mesma versão canônica
- Simuladores:
  - `GET /sessoes/:id` agora usa o mesmo guard de compatibilidade de schema do list endpoint
  - Gestão mostra parcialidade explícita e botão de retry em vez de `0`
  - telas legadas/histórico/dashboard diferenciam erro de vazio
- Frontend release observability:
  - web manifest renomeado para `/app.webmanifest`
  - watcher de atualização passou a ler `meta[name="build-version"]` do `index.html`
  - purge/validate scripts atualizados para o novo manifest

## Gates locais executados
```bash
npx vitest run src/react-app/config/__tests__/deployment.test.ts \
  src/react-app/pages/simuladores/tabs/__tests__/TabGestaoWrapper.test.tsx \
  src/react-app/lib/__tests__/hardRefresh.test.ts

cd worker-airtrust && npx vitest run \
  src/__tests__/routes/system-routes.test.ts \
  src/__tests__/routes/simuladores-sessoes-schema-compat.test.ts \
  src/__tests__/routes/simuladores-planejadas-edit-session.test.ts \
  src/__tests__/routes/treinamentos-planejados.test.ts

npx tsc --noEmit
cd worker-airtrust && npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Não executado
- Deploy de worker
- Deploy de frontend
- Browser autenticado local ou produção
- Reauditoria pós-deploy
- Qualquer escrita em produção

## Classificação desta sessão
`CORRIGIDO LOCALMENTE — NÃO PUBLICADO`
