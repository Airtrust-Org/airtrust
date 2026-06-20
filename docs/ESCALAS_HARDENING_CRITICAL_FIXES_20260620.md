# Escalas Hardening Critical Fixes

## Resumo do PR

PR único de hardening do módulo de Escalas para bloquear vazamento cross-tenant, reforçar ownership em regeneração/substituição operacional, corrigir o endpoint de Minha Escala e aplicar RBAC frontend nas ações operacionais.

## Arquivos alterados

- `worker-airtrust/src/routes/escalas-core.ts`
- `worker-airtrust/src/routes/escalas/index.ts`
- `worker-airtrust/src/routes/escalas-alocacoes.ts`
- `worker-airtrust/src/routes/escalas-alocacoes-engine.ts`
- `worker-airtrust/src/__tests__/routes/escalas-hardening-critical.test.ts`
- `src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx`
- `src/react-app/pages/escalas/EscalaPageContext.tsx`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `src/react-app/pages/escalas/views/EscalasDetalheView.tsx`
- `src/react-app/pages/escalas/views/EscalasListagemView.tsx`
- `src/react-app/pages/escalas/utils/operationalPermissions.ts`
- `src/react-app/pages/escalas/utils/quinzenaValidation.ts`
- `src/react-app/pages/escalas/__tests__/operationalHardening.utils.test.ts`

## Achados corrigidos

- `C1` `GET /api/escalas/frms-score/:funcionarioId` agora valida que o funcionário pertence ao tenant autenticado e reescopa a leitura de `frms_jornada` com `EXISTS` em `funcionarios`.
- `C2` `GET /api/escalas/minha-escala` agora usa `escalas_mensais` e foi registrado no bloco de rotas diretas para não ser capturado por `/:id`.
- `C3` ações de publicar, republicar, alterar status e excluir passaram a exigir perfil operacional gestor/admin no frontend.
- `A1` o soft-delete de eventos automáticos em `substituirAlocacaoSobreposta` passou a revalidar tenant via `escala_alocacoes -> escalas_mensais`.
- `A2` `regenerarEventosAutomaticosFuncionarioEscala` agora exige `empresa_id` explícito e só atua quando a escala pertence ao tenant informado.
- `M5` o frontend bloqueia quinzena com `data_fim <= data_inicio` em Configurações e no contexto principal de edição.

## Testes executados

- `npm run test:run -- src/react-app/pages/escalas/__tests__/operationalHardening.utils.test.ts`
- `npm run test:run -- src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts`
- `npm run test -- src/__tests__/routes/escalas-hardening-critical.test.ts`
- `npm run test -- src/__tests__/routes/escalas-alocacoes-tenant-scope.test.ts`
- `npm run build`

## Resultado dos testes

- Todos os testes acima passaram.
- `build` root concluído com sucesso.

## Riscos remanescentes

- `A3` race condition em lote de alocações permanece fora deste PR e segue como ressalva documentada.
- RBAC frontend continua sendo defesa complementar; o backend permanece autoridade final.

## Confirmações operacionais

- Sem migration.
- Sem deploy.
- Sem escrita em produção.
- Sem alteração de banco remoto.

## Veredito para SIGVOOS

`OK COM RESSALVAS`

Ressalva única desta macroetapa: manter `A3` como item pendente antes de qualquer redesign transacional mais profundo.
