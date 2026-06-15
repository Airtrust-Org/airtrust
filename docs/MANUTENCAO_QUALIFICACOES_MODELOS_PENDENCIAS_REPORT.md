# Relatório: Manutenção Operacional de Qualificações, Modelos, Sessões e Pendências

**Data:** 2026-06-15
**Branch:** `codex/manutencao-qualificacoes-modelos-pendencias`
**Veredito:** `COM RESSALVAS`

## Diagnóstico

### Achados seguros

- O branch já estava baseado em `main` atualizado, sem divergência com `origin/main`, e com o merge de PR #33 (`e7c7530e4342bfe357cc4849145759b466fa05ae`) no histórico.
- A fase já continha ajustes coerentes para manutenção em quatro frentes locais e seguras:
  - `worker-airtrust/src/routes/funcionarios.ts` usa fallback `funcao || cargo` também no dashboard operacional.
  - `src/react-app/pages/Qualificacoes.tsx` já havia sido ajustado para linguagem neutra de participantes nas convocações planejadas.
  - `worker-airtrust/src/routes/treinamentos-planejados.ts` já havia sido ajustado para mensagens de participantes no backend.
  - `src/react-app/pages/TreinamentosPlanejadosPage.tsx` precisava apenas de fechamento de copy remanescente.
- Há cobertura automatizada existente para:
  - fallback de `funcao/cargo` em funcionários;
  - escopo por setor em qualificações/tipos;
  - separação manutenção/tripulação em cards e contexto;
  - boundaries administrativas e de perfil;
  - fluxos principais de turmas e qualificações planejadas.

### Achados corrigidos nesta fase

- Restavam dois textos operacionais na tela de turmas ainda referindo `tripulante(s)` em vez de `participante(s)`:
  - histórico de convocações;
  - aviso de exclusão da fila por e-mail ausente/inválido.
- Foi adicionado teste de contrato simples para impedir regressão dessa nomenclatura.

### Achados bloqueados

- Nenhum item desta execução exigiu schema, migration, RBAC backend real, multi-tenant real, staging, produção, D1 remoto, Cloudflare, R2 ou secrets.

## Riscos

- Persistem ressalvas normais de qualidade cadastral local: nomes de função/cargo e vínculos podem continuar heterogêneos conforme os dados existentes.
- A fase não alterou contratos sensíveis de API, schema ou permissões reais; portanto, não endereça problemas que dependam dessas camadas.

## Decisão de Escopo

- Corrigir apenas inconsistências locais e seguras de copy e fallback.
- Preservar todos os blocos sensíveis fora de escopo.
- Encerrar a fase com relatório e validação local.

## Correções Feitas

- Ajuste final de copy em `src/react-app/pages/TreinamentosPlanejadosPage.tsx` para manter linguagem operacional de manutenção baseada em `participantes`.
- Teste adicionado em `src/react-app/pages/__tests__/TreinamentosPlanejadosPage.presenca-diaria.test.ts`.

## Arquivos Alterados

- `src/react-app/pages/Qualificacoes.tsx`
- `src/react-app/pages/TreinamentosPlanejadosPage.tsx`
- `src/react-app/pages/__tests__/TreinamentosPlanejadosPage.presenca-diaria.test.ts`
- `worker-airtrust/src/routes/funcionarios.ts`
- `worker-airtrust/src/routes/treinamentos-planejados.ts`
- `docs/MANUTENCAO_QUALIFICACOES_MODELOS_PENDENCIAS_REPORT.md`

## Testes Executados

- `npm run test:run -- src/react-app/pages/__tests__/TreinamentosPlanejadosPage.presenca-diaria.test.ts src/react-app/pages/__tests__/Qualificacoes.planejadas-ui.test.ts src/react-app/pages/funcionarios/__tests__/ListaFuncionarios.helpers.test.ts`
- `npm run test:worker -- src/__tests__/routes/treinamentos-planejados.test.ts src/__tests__/routes/funcionarios-role-filter.test.ts src/__tests__/routes/qualificacoes-tipos-setores-scope.test.ts src/__tests__/routes/auth-platform-admin-boundaries.test.ts`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `git diff --check`
- `bash scripts/check-tracked-secrets.sh`
- `bash scripts/validation/audit-deploy-scripts.sh`
- `bash scripts/audit-dangerous-ops.sh`

## Pendências Restantes

- Revisão humana do diff antes de commit para confirmar que a nomenclatura operacional de manutenção está consistente nas telas principais.
- Commit, push, PR e merge controlado ainda não foram executados nesta retomada.

## Itens Bloqueados por Exigir Fase Sensível

- Nenhum nesta execução.

## Confirmações de Escopo

- SIGVOOS, importador, runner e `0411` ficaram intocados.
- FRMS e `frms-source-policy.ts` ficaram intocados.
- Não houve deploy.
- Não houve migration.
- Não houve uso de staging ou produção.
- Não houve D1 remoto, Cloudflare, R2 ou secrets.

## Próximo Bloco Recomendado

- Se as validações locais permanecerem verdes, seguir com revisão final, commit seletivo e PR desta fase.
- O próximo macrobloco pode avançar apenas para itens operacionais restantes que não exijam fase sensível; qualquer necessidade de schema, RBAC real ou dados remotos deve parar como `BLOQUEADO — REQUER FASE SENSÍVEL`.
