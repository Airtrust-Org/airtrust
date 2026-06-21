# AIRTRUST_MANAGER_ALERT_CENTER_20260621

## Objetivo

Entregar a primeira versão segura da Central de Alertas do Gestor na entrada operacional real do gestor, priorizando ação imediata sem criar migration, backend estrutural novo, SQL remoto ou integração nova.

## Fontes usadas

- `GET /api/dashboard/metrics`
- `GET /api/dashboard/alertas-criticos`
- `GET /api/dashboard/frms-alertas`
- `GET /api/frms/operational-snapshot`
- Escopo de renderização do gestor em `src/react-app/pages/Funcionarios.tsx`

## Fontes não incluídas

- SGSO com priorização dedicada na Home
- Simuladores/fichas com alerta operacional consolidado próprio
- Agregador backend novo para unificação server-side
- Push/notificações

## Componentes alterados

- `src/react-app/pages/Funcionarios.tsx`
- `src/react-app/pages/funcionarios/ManagerAlertCenter.tsx`
- `src/react-app/pages/funcionarios/managerAlertCenter.utils.ts`
- `src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- `src/react-app/pages/dashboard/queries.ts`
- `src/react-app/hooks/useFrmsOperationalSnapshot.ts`

## Correções aplicadas no fechamento

- Isolado o gate de perfil em volta do conteúdo da Central para evitar hooks condicionais quando o papel do usuário muda entre renders.
- Adicionado teste para garantir que perfis sem acesso não renderizam a Central nem disparam queries.
- Corrigido falso erro total quando apenas uma subfonte FRMS falha e outra ainda sustenta alertas válidos.
- Elevada pendência LMS crítica para severidade `CRITICO`.
- Passado a sinalizar degradação quando `dashboard/metrics` falha, mesmo com fallback por `alertas-criticos`.
- Incluído fallback de `qualificacao_vencida` nas fontes de dashboard e ajuste leve de priorização por proximidade em qualificações a vencer.
- Evitadas queries de FRMS, snapshot, métricas e alertas quando o módulo correspondente está desabilitado.

## UX

- A Central entra no topo da tela `/funcionarios`, que hoje é o destino operacional do perfil `GESTOR`.
- Máximo de 7 alertas priorizados.
- Cada alerta expõe:
  - severidade
  - módulo de origem
  - descrição operacional curta
  - ação recomendada
  - link interno seguro
  - freshness/data
- Estados cobertos:
  - loading
  - vazio com "Sem alertas críticos"
  - erro total
  - carga parcial com fontes degradadas

## Critérios de priorização

- Severidade primeiro: `CRITICO` > `ATENCAO` > `INFORMATIVO`
- Dentro da severidade:
  - peso operacional do domínio
  - contagem impactada
  - proximidade temporal implícita da fonte
- Regras aplicadas na V1:
  - FRMS crítico/violação
  - check-in de fadiga pendente/crítico
  - risco de escala/EVD derivado do snapshot operacional
  - qualificações vencidas ou a vencer
  - pendências LMS obrigatórias

## Segurança

- Sem migration
- Sem SQL remoto
- Sem escrita manual em banco
- Sem SIGVOOS
- Sem alteração em RBAC/auth global
- Sem exibição de PII na Home
- Links externos rejeitados por sanitização; fallback para rota interna segura
- Reaproveitamento de fontes já filtradas por tenant/perfil/setor
- Bloco renderizado apenas para `GESTOR` e `ADMIN`

## Testes

- Adicionados testes em `src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- Coberturas incluídas:
  - estado vazio
  - bloqueio por perfil sem acesso
  - alerta crítico FRMS
  - alerta de check-in pendente
  - severidade crítica para LMS bloqueante
  - ordenação por criticidade
  - resiliência sem dados
  - degradação de métricas com fallback por alertas
  - carga parcial quando uma subfonte FRMS falha
  - ocultação por módulo desabilitado
  - links seguros
  - contagem de informativos no resumo

### Execução

Comandos executados com sucesso em `/tmp/airtrust-manager-alert-center`:

- `npm run test:run -- ManagerAlertCenter`
- `npm run test:run -- --run alert`
- `npm run test:run -- --run home dashboard frms`
- `npm run lint`
- `npm run build`

Resultado:

- `ManagerAlertCenter`: 1 arquivo, 11 testes, tudo passando.
- `--run alert`: 2 arquivos, 13 testes, tudo passando.
- `--run home dashboard frms`: 22 arquivos, 205 testes, tudo passando.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- Dependências instaladas localmente via `npm ci` apenas para viabilizar a validação da worktree isolada, sem alteração de dependências versionadas.

## Riscos

- A V1 ainda faz composição no frontend; um agregador backend futuro reduzirá latência e simplificará fallback parcial.
- SGSO e simuladores/fichas ainda não entram com priorização operacional própria.
- A validação autenticada/cross-tenant continua pendente por falta de fixture.
- O snapshot FRMS ainda é consultado diretamente do frontend, sem consolidação com outras fontes em um contrato único.

## SIGVOOS NO-GO

Nenhuma alteração em SIGVOOS, nenhuma nova dependência e nenhum reaproveitamento de integração SIGVOOS.

## Próxima macroetapa

Validação autenticada/cross-tenant da Central de Alertas com fixture segura e smoke por perfil.
