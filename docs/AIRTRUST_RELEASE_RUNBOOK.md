# AirTrust Release Runbook

## Fluxo normal

1. Criar branch a partir de `main`.
2. Implementar somente o escopo da frente.
3. Rodar validações locais aplicáveis.
4. Abrir PR.
5. Aguardar CI verde.
6. Fazer merge em `main`.
7. Executar o workflow GitHub Actions `Deploy AirTrust`.
8. Escolher `deploy_worker` e/ou `deploy_pages`.
9. Informar `expected_sha` quando quiser travar o commit exato.
10. Validar smoke automático e registrar o relatório do deploy.

## Fluxo emergencial

1. Confirmar que existe incidente real ou indisponibilidade do GitHub Actions.
2. Garantir que a pasta ativa é `<AIRTRUST_ROOT>`.
3. Garantir `main` limpo e alinhado com `origin/main`.
4. Rodar `npm run repo:doctor`.
5. Usar `npm run release:worker:local-emergency` apenas com aprovação explícita.
6. Documentar motivo, commit e horário UTC.
7. Executar smoke pós-deploy.

## Proibições

- Não fazer deploy de worktree suja.
- Não fazer deploy de clone temporário.
- Não fazer deploy com `main` local atrasado.
- Não fazer deploy antes de CI verde.
- Não misturar deploy com docs não relacionadas.
- Não rodar migration sem plano explícito.
- Não fazer deploy de branch de feature.

## Operação do workflow

- `deploy_worker`: publica apenas o Worker.
- `deploy_pages`: publica apenas o Pages.
- `run_migrations`: desligado por padrão; só usar com plano explícito.
- `migration_confirmation`: deve ser `AIRTRUST_MIGRATIONS_APPROVED` quando `run_migrations=true`.
- `expected_sha`: evita publicar commit errado.
- `reason`: obrigatório e deve explicar o motivo do deploy.
- `confirm_production`: deve ser `AIRTRUST_PRODUCTION`.

## Smoke esperado

- Worker:
  - `GET https://api.airtrust.online/api/version` retorna `200`.
  - `GET https://api.airtrust.online/api/health` retorna `200`.
  - `GET https://api.airtrust.online/api/lms/cursos` sem token retorna `401`.
- Pages:
  - `GET https://airtrust.online/login` retorna `200`.
  - HTML publicado expõe `build-version`.
  - `sw.js`, quando servido pelo domínio, preserva o kill-switch auditado.
