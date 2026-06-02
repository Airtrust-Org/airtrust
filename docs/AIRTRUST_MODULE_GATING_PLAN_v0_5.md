# AirTrust Module Gating Plan v0.5

Data: 2026-06-02

## Decisao do Sprint 5

Status: **NO-GO parcial para gating em runtime neste sprint**.

Nao foi implementado gating por `modulos_ativos` porque o mecanismo existente nao esta conectado de ponta a ponta com seguranca suficiente para ocultar modulos beta sem risco de esconder modulo usado pela empresa atual ou deixar rota direta acessivel.

## Evidencia de Mapeamento

| Pergunta | Resultado | Evidencia |
| --- | --- | --- |
| Backend possui `modulos_ativos` por empresa? | Sim, em `empresas_config` e em `/api/empresas/minha` | `worker-airtrust/src/routes/empresas.ts` |
| Frontend recebe `modulos_ativos` no contexto usado pelo layout? | Nao | `src/react-app/context/auth-context.ts` e `src/react-app/context/AuthContext.tsx` |
| `/api/auth/empresas` retorna `modulos_ativos`? | Nao | `worker-airtrust/src/routes/auth.ts` |
| Menu principal respeita `modulos_ativos`? | Nao | `src/react-app/components/AppLayout.tsx` |
| Rotas diretas respeitam `modulos_ativos`? | Nao | `src/react-app/App.tsx` |
| Beta aparece em navegacao/rotas? | Sim, principalmente LMS e SGSO; Hospedagem tem rota direta e aparece em configuracao legada | `src/react-app/App.tsx`, `src/react-app/components/AppLayout.tsx`, `src/react-app/navigation.config.ts` |
| Default atual e fail-closed? | Nao comprovado | fallback de `empresas.ts` usa lista permissiva historica em parse de `modulos_ativos` |

## Risco de Implementar Agora

- Buscar `/api/empresas/minha` dentro do layout sem contrato de cache/erro pode deixar menu instavel em login, hard refresh e troca de empresa.
- Ocultar apenas menu nao resolve acesso por URL direta.
- Fazer default fail-closed sem inventario de modulos ativos da empresa atual pode esconder funcionalidade em uso.
- Fazer default fail-open nao atende objetivo de esconder beta para segunda empresa.
- Alterar `/api/auth/empresas` exige mudanca de contrato e testes worker/frontend que cabem em sprint proprio.

## Plano de Implementacao Seguro

1. Definir enum canonico de modulos no repositorio:
   - `dashboard`
   - `funcionarios`
   - `qualificacoes`
   - `simuladores`
   - `escalas`
   - `frms`
   - `lms`
   - `sgso`
   - `hospedagem`
   - `sigvoos`
   - `admin`

2. Estender contrato autenticado:
   - incluir `modulos_ativos` normalizado em `/api/auth/empresas` para a empresa atual;
   - manter compatibilidade para empresas sem config;
   - registrar comportamento para platform admin e troca de empresa.

3. Criar helper frontend unico:
   - `useModuleAccess(moduleId)`;
   - `ModuleGate` para rotas e componentes;
   - default temporario: fail-open somente para empresa atual ate inventario aprovado; fail-closed para novo tenant depois de config explicita.

4. Aplicar em duas camadas:
   - menu/header/mobile;
   - rotas diretas em `App.tsx`.

5. Testar:
   - empresa com modulo ativo ve menu e rota;
   - empresa sem modulo nao ve menu e rota redireciona para dashboard/404 operacional;
   - troca de empresa atualiza gating;
   - hard refresh nao pisca beta indevidamente;
   - usuario aluno/instrutor continua respeitando permissoes existentes.

6. Cutover operacional:
   - inventariar `modulos_ativos` da empresa atual;
   - definir config inicial da segunda empresa antes do primeiro login;
   - smoke visual e autenticado read-only antes de liberar acesso.

## Criterio de GO Futuro

Gating passa a ser GO quando menu e rotas diretas forem cobertos por testes automatizados, `/api/auth/empresas` entregar modulos normalizados e a empresa atual tiver inventario aprovado de modulos ativos.
