# AirTrust - Staging Blockers Fix And Revalidation
**Data:** 2026-06-21  
**Escopo:** staging, local e dummy apenas  
**Classificacao:** interno, sem PII, sem secrets, sem producao, sem migration

## Veredito

`BLOQUEADO`

Os bloqueios operacionais de staging nao puderam ser concluidos nesta macroetapa porque os `500` autenticados mais criticos apontam para `schema drift` no `airtrust-db-staging`. A unica correcao segura aplicada foi no frontend de `/funcionarios`, que agora exige a permissao explicita `funcionarios.view` para evitar acesso por URL direta de perfil comum.

## Modelo usado

`Codex 5.4 alto`

## Ambiente

- `staging/local/dummy`
- producao nao alterada

## Endpoints 500

### Resultado

- `/api/funcionarios/:id`: `BLOQUEADO`
- `/api/funcionarios?limit=1`: `BLOQUEADO`
- `/api/lms/cursos/:id`: `BLOQUEADO`
- `/api/simuladores/sessoes?limit=1`: `BLOQUEADO`
- `/api/qualificacoes/historico?limit=1`: `BLOQUEADO`

### Causa provavel

Os cinco caminhos convergem para SQL que assume tabelas e colunas introduzidas por migrations recentes, sem evidencia suficiente de que o schema atual de staging esteja alinhado:

- `worker-airtrust/src/routes/funcionarios.ts` assume shape moderno de `funcionarios`, `setores`, `lms_matriculas` e `lms_historico_importado`.
- `worker-airtrust/src/routes/lms-cursos.ts` assume `lms_cursos_setores` e `qualificacoes_tipos_setores`.
- `worker-airtrust/src/routes/simuladores-sessoes.ts` ainda depende de tabelas auxiliares de sessoes/fichas alem das colunas opcionais ja guardadas.
- `worker-airtrust/src/routes/qualificacoes/historico.ts` assume tabelas auxiliares de certificados/categorias e relacoes aeronave/funcionario.

Isso caracteriza `schema drift` em staging, nao um bug pequeno de regra de negocio. Pela regra desta macroetapa, nao foi aplicada migration nem alteracao de schema.

### Correcao aplicada

- Frontend `/funcionarios` agora exige `funcionarios.view` via `ProtectedRoute requiredPermission`, fechando o acesso por URL direta para perfis comuns sem bloquear perfis nao gestores que ja possuem essa permissao, como `COMPLIANCE`.

## Cross-tenant

- Controle positivo Tenant B: nao revalidado ate `PASS` por causa dos `500` acima.
- Negativo Tenant A: sem evidencia nova de vazamento; comportamento esperado continua `403/404/vazio seguro` nos casos ja observados.
- Resultado: `BLOQUEADO` ate alinhar schema de staging e repetir o smoke.

## Validacao visual

- Admin/gestor: `/funcionarios` continua sem evidencia final da Central porque a API backend segue `500`.
- Usuario comum: acesso direto a `/funcionarios` foi corrigido no frontend para exigir `funcionarios.view`.
- Resultado: `PARCIAL`

## DR drill

- Remoto D1 descartavel: `BLOQUEADO`
- Local: evidencia anterior continua valida

### Causa provavel

O fluxo remoto falho usa dump bruto via `wrangler d1 execute --file`, enquanto os artefatos locais do repositorio mostram que restores seguros exigem sanitizacao previa do dump, remocao de `d1_migrations`, separacao schema/data e validacao em duas fases. Nao ha runbook operacional aprovado para replay bruto em D1 remoto descartavel nesta macroetapa.

## Testes

- `npm test -- --run src/__tests__/lms-access-and-finalize.test.tsx`

Resultado:

- `PASS` para o gate de permissao do frontend
- nenhum teste remoto de staging foi executado porque o acesso `wrangler` desta sessao falhou com autenticacao Cloudflare e nao havia base segura para continuar revalidacao remota

## Deploy

- staging: `nao`
- producao: `nao`
- migrations: `nao`

## Seguranca

- sem producao
- sem migration
- sem PII/secrets
- SIGVOOS `NO-GO`

## Decisao multiempresa

`PILOTO CONTROLADO`

Motivo: os gates backend seguem bloqueados por `schema drift` em staging.

## Decisao DR

`NO-GO`

Motivo: o drill remoto em D1 descartavel continua sem fluxo operacional seguro aprovado para importacao do dump bruto.

## Proxima macroetapa unica

`corrigir bloqueio remanescente`

Definicao objetiva:

1. inventariar o schema atual de `airtrust-db-staging` com credencial valida e somente leitura;
2. comparar com as dependencias minimas das rotas bloqueadas;
3. decidir entre alinhar schema de staging por processo controlado ou retirar dependencias do runtime com fallback verdadeiro e testado;
4. repetir smoke autenticado e cross-tenant so depois disso.
