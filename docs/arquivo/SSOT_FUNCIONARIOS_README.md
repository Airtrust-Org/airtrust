# SSOT Funcionários – AirTrust

Data: 21/11/2025  
Branch: `refactor/qualificacoes-integracao`

## Objetivo

Estabelecer a tabela `funcionarios` como fonte única (SSOT) e garantir reatividade para módulos dependentes (qualificações, sessões de simulador, hospedagens, FRMS) via triggers, view integrada e camada de serviço.

## Componentes-Chave

- Tabela principal: `funcionarios` (paridade completa – migration 0059+ ajustes 0061)
- View reativa: `qualificacoes_historico_v` (migration 0060)
- Extensões SSOT: `hospedagens`, `registros_frms`, auditoria expandida (migration 0062)
- Triggers: update (auditoria), soft delete cascata, prevenção hard delete
- Serviço: `worker-airtrust/src/services/funcionarios.service.ts`
- Rotas SSOT: `worker-airtrust/src/routes/funcionarios_ssot.ts`
- Hooks React: `src/react-app/hooks/useFuncionarios.ts`
- Componente de UI: `src/react-app/components/FuncionarioCard.tsx`
- Script aplicação migrations: `scripts/apply-ssot-migrations.sh`
- Script validação triggers: `scripts/test-ssot-triggers.sh`
- Testes unitários (mock): `src/__tests__/funcionarios-ssot-reativo.test.ts`

## Fluxo de Reatividade

1. UPDATE em `funcionarios` → trigger `trg_funcionarios_update` insere auditoria.
2. Soft delete (`deleted_at` preenchido) → trigger cascata marca dependentes como soft-deleted.
3. View `qualificacoes_historico_v` reflete imediatamente alterações de dados do funcionário.
4. Hooks invalidam caches após mutações (React Query) e propagam para UI.

## Scripts Essenciais

```bash
# Aplicar migration SSOT (idempotente + backup)
bash scripts/apply-ssot-migrations.sh --remote

# Testar triggers e cascata remotamente
npm run ssot:triggers:test

# Versão local (dev) se configurado wrangler.dev.toml
bash scripts/test-ssot-triggers.sh --local
```

## Deploy

Gerar token Cloudflare com permissões: Workers Scripts (Edit), D1 (Edit), Account Details (Read). Depois:

```bash
cd worker-airtrust
npx wrangler deploy
```

## Health Checks Pós Deploy

```bash
curl -s https://airtrust-api.airtrust.workers.dev/api/funcionarios-ssot?limit=1 | jq '.'
curl -s https://airtrust-api.airtrust.workers.dev/api/qualificacoes/historico?limit=1 | jq '.'
```

## Próximos Passos

- Testes de integração reais com D1 (triggers / auditoria) via runner dedicado.
- Backfill de campos incompletos (datas médicas / endereço) para relatórios.
- Índices compostos para aceleração de filtros avançados.
- Alertas (validade ICAO/CMA) e notificações proativas.

## Resumo Final

Arquitetura SSOT consolidada, scripts e testes prontos. Pendente apenas deploy com token correto e expansão de testes de integração.
