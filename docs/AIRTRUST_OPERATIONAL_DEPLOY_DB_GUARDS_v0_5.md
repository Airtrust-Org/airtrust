# AirTrust Operational Hardening v0.5

## 1) Riscos corrigidos

- Deploy de Pages não permite mais `--commit-dirty=true` no fluxo padrão.
- `deploy:all` também passa por `scripts/preflight-clean-deploy.sh` antes de qualquer build/deploy real.
- Scripts `db:qualificacoes:*` deixaram de executar SQL remoto direto sem proteção.
- Scripts legados destrutivos de seed, migration, purge, cleanup, backfill, import, reset e testes com escrita remota foram bloqueados por padrão.

## 2) Como usar `deploy:pages` agora

- Execute `npm run deploy:pages`.
- O script agora roda `scripts/preflight-clean-deploy.sh` antes de qualquer build/deploy.

## 2.1) Como usar `deploy:all` agora

- Execute `npm run deploy:all` apenas quando houver necessidade operacional real de publicar Pages + Worker juntos.
- O comando chama `scripts/build-and-deploy.sh`.
- `scripts/build-and-deploy.sh` roda `scripts/preflight-clean-deploy.sh` antes do build.
- O script falha se não estiver em `main`, se `HEAD != origin/main`, ou se houver mudança tracked staged/unstaged.
- Arquivos untracked históricos continuam como warning, sem bloquear.

## 3) Por que `--commit-dirty=true` saiu do deploy padrão

- Evita deploy com árvore tracked suja.
- Mantém rastreabilidade entre artefato publicado e commit versionado.
- Reduz erro humano em incidentes e rollback.

## 4) Como funciona `preflight-clean-deploy.sh`

Valida, nesta ordem:

- branch atual precisa ser `main`;
- working tree tracked precisa estar limpa (staged e unstaged);
- compara `HEAD` com `origin/main` e falha se divergente;
- mostra SHAs e lista `untracked` apenas como aviso (não bloqueante).

## 5) Como funcionam scripts DB de produção

Os scripts `db:qualificacoes:*` agora chamam `scripts/run-production-db-script.sh`.

Esse wrapper:

- exige `AIRTRUST_ALLOW_PROD_DB_WRITE=YES`;
- exige confirmação textual exata em `AIRTRUST_CONFIRM_PROD_DB_WRITE`;
- exige branch `main`;
- exige `HEAD == origin/main`;
- exige working tree tracked limpa;
- aceita apenas SQL em allowlist explícita;
- rejeita path arbitrário e arquivo inexistente.

## 6) Execução com confirmação explícita

Exemplo:

```bash
AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
bash scripts/run-production-db-script.sh sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-safe-merge.sql
```

## 7) Proibições operacionais

- Não usar `--commit-dirty=true` em nenhum caminho de deploy.
- Não rodar `wrangler d1 execute --remote` diretamente em scripts operacionais fora de `scripts/run-production-db-script.sh`.
- Não recriar scripts de seed, reset, cleanup, purge, import, backfill ou migration com D1 remoto direto.
- Não commitar secrets.
- Não fazer deploy com tracked dirty tree.

## 8) Guard operacional

Execute:

```bash
npm run ops:guard
```

ou:

```bash
bash scripts/audit-dangerous-ops.sh
```

O guard:

- falha se encontrar `--commit-dirty=true`;
- falha se encontrar `wrangler d1 execute --remote` fora do wrapper seguro ou da allowlist explícita de leitura/diagnóstico;
- não executa deploy;
- não executa D1 remoto;
- imprime as ocorrências que causam falha.

## 9) Scripts legados bloqueados

Scripts operacionais antigos que executavam D1 remoto destrutivo agora retornam erro imediatamente e orientam o uso do wrapper seguro.

Exemplos de categorias bloqueadas:

- purge/hard delete;
- cleanup de tabelas;
- seed remoto;
- migrations manuais;
- backfills;
- imports legados;
- resets de manobras;
- testes E2E que escreviam em D1 remoto.
