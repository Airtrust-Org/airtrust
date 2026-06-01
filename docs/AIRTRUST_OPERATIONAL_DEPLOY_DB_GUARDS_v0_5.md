# AirTrust Operational Hardening v0.5

## 1) Riscos corrigidos

- Deploy de Pages não permite mais `--commit-dirty=true` no fluxo padrão.
- Scripts `db:qualificacoes:*` deixaram de executar SQL remoto direto sem proteção.

## 2) Como usar `deploy:pages` agora

- Execute `npm run deploy:pages`.
- O script agora roda `scripts/preflight-clean-deploy.sh` antes de qualquer build/deploy.

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

- Não rodar `wrangler d1 execute --remote` manualmente sem checklist.
- Não commitar secrets.
- Não fazer deploy com tracked dirty tree.
