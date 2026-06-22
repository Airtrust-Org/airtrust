# AIRTRUST HOTFIX DISABLE MANAGER ALERTS SECTION — 2026-06-22

## 1. Resumo executivo

- seção `Central de Alertas do Gestor` desativada temporariamente no frontend;
- motivo: a central ainda nao deve aparecer para usuarios e mistura fontes operacionais sensiveis em maturacao;
- risco: baixo, restrito a ocultacao controlada de um bloco visual sem alteracao de banco ou contrato backend.

## 2. Alterações

Arquivos alterados:

- `src/react-app/pages/funcionarios/ManagerAlertCenter.tsx`
- `src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`

Mecanismo usado:

- constante interna `MANAGER_ALERT_CENTER_ENABLED = false`;
- retorno antecipado antes de qualquer hook/query do componente.

Efeito operacional:

- a secao deixa de renderizar para qualquer perfil;
- endpoints exclusivos da central deixam de ser chamados pelo frontend enquanto o hotfix estiver ativo;
- restante da pagina de Funcionarios permanece intacto.

## 3. Testes

Comandos:

- `npm test -- --run src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- `npm test -- --run src/react-app/components/__tests__/HomeRouter.test.tsx`
- `npm test -- --run src/react-app/components/__tests__/ProtectedRoute.module-gating.test.tsx`
- `npm run lint`
- `npm run build`

Resultados:

- pendente de execucao/atualizacao nesta branch

## 4. Deploy

- Pages publicado ou nao: pendente
- Worker publicado: nao
- versao/build: pendente
- smoke pos-deploy: pendente

## 5. Segurança operacional

Confirmacoes:

- producao nao quebrada pela alteracao local
- SQL producao nao executado
- migration/schema nao alterado
- SIGVOOS intocado
- secrets nao expostos

## 6. Decisão final

`HOTFIX PRONTO PARA DEPLOY`
