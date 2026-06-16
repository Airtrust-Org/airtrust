# SIGVOOS Real API Preview Read-Only Report

## Veredito

`SIGVOOS_REAL_API_PREVIEW_READ_ONLY_IMPLEMENTADO`

A conexao real SIGVOOS em modo preview foi implementada atras de flag separada, endpoint protegido e resposta sanitizada. A validacao executada nesta etapa usou mocks; nenhuma chamada real SIGVOOS foi feita.

## Causa raiz

O fluxo anterior de atualizacao do app tinha apenas a previa local (`/api/controle-voos/sigvoos/sync-preview`) e nao existia um caminho isolado para consultar a API real SIGVOOS em modo somente leitura. O servico SIGVOOS historico existente no Worker esta acoplado a FRMS e contem caminhos de escrita, portanto nao era adequado para ser reutilizado neste preview.

## Arquivos alterados

- `worker-airtrust/src/services/controle-voos/sigvoos-real-preview.ts`
- `worker-airtrust/src/routes/controle-voos.ts`
- `worker-airtrust/src/types/index.ts`
- `worker-airtrust/src/__tests__/routes/controle-voos.test.ts`
- `src/react-app/components/AppLayout.tsx`
- `src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx`
- `docs/SIGVOOS_REAL_API_PREVIEW_REPORT.md`

## Controles implementados

- Endpoint novo: `POST /api/controle-voos/sigvoos/real-preview`.
- Flag backend separada: `CONTROLE_VOOS_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`.
- Flag frontend separada: `VITE_SIGVOOS_REAL_API_PREVIEW_ENABLED=true`.
- A rota exige autenticacao e permissao de gestor/admin, reaproveitando o guardrail de manager.
- Tenant arbitrario no body continua bloqueado.
- A janela de consulta e limitada a 7 dias.
- `pageSize` e `maxPages` possuem limites conservadores.
- Timeout por requisicao externa.
- Credenciais sao lidas de env/secret ou da configuracao SIGVOOS por tenant; valores nao sao retornados nem logados.
- A resposta retorna apenas resumo, campos observados e shape booleano; payload bruto nao e exposto.
- Falhas de credencial/config/API retornam erro seguro.
- O botao `Atualizar app` preserva hard refresh normal e nao bloqueia a atualizacao se a previa falhar.

## Confirmacoes de seguranca

- Deploy executado: `NAO`.
- Workflow manual de deploy executado: `NAO`.
- Chamada real SIGVOOS executada: `NAO`.
- API real SIGVOOS usada em testes: `NAO`; testes usam `fetch` mockado.
- Credenciais SIGVOOS reais usadas: `NAO`.
- Payload real persistido ou exibido: `NAO`.
- `wrangler d1 execute` executado: `NAO`.
- `wrangler d1 migrations apply` executado: `NAO`.
- Migration aplicada em D1 remoto/producao: `NAO`.
- Escrita em `cv_voos`, `cv_voo_etapas`, `cv_voo_tripulantes`, `cv_sigvoos_staging` ou `cv_conflitos_integracao`: `NAO`.
- Flags SIGVOOS de producao alteradas: `NAO`.
- FRMS alterado: `NAO`.
- `frms-source-policy.ts` alterado: `NAO`.
- E-mails enviados: `NAO`.
- RBAC backend/multi-tenant real alterado: `NAO`.
- Secrets commitados: `NAO`.

## Validacoes executadas

- `npx tsc --noEmit --pretty false`: `PASS`.
- `cd worker-airtrust && npx vitest run src/__tests__/routes/controle-voos.test.ts`: `PASS` (`46` testes).
- `npx vitest run src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx`: `PASS` (`3` testes).
- `npm run build`: `PASS`.
- `git diff --check`: `PASS`.
- `bash scripts/check-tracked-secrets.sh`: `PASS`.
- `bash scripts/validation/audit-deploy-scripts.sh`: `PASS` como inventario; listou referencias historicas ja existentes a `migrations apply` e confirmou que `deploy-worker-safe` segue sem comandos proibidos.
- `bash scripts/audit-dangerous-ops.sh`: `PASS`; reportou warning inventarial em scripts de sync locais ja existentes, sem afetar esta alteracao.

## Proxima recomendacao

Abrir PR para revisao humana e manter a ativacao da flag real desligada ate uma janela controlada de validacao operacional. A primeira execucao real deve usar janela curta, usuario gestor/admin, tenant confirmado, sem deploy no mesmo passo e com observacao dos codigos de erro sem registrar payload bruto.
