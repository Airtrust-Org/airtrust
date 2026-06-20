# Workspace Sanitization Archive — 2026-06-20

- Branch original: `codex/data-integrity-guardrails-onda-1`
- HEAD original: `3118f997d1a149eb6d3fe68355549665463a9660`
- Artefato arquivado: `frms-local-vs-main.patch`

## Motivo do arquivamento

O trabalho local de FRMS/quinzena desta branch foi triado e considerado tecnicamente superado por implementações posteriores já presentes em `origin/main` (`a387819895f797e159081ff7665ceccb67f95bf8`).

O único resíduo ainda diferente de `origin/main` ficou concentrado em `worker-airtrust/src/routes/frms.ts`. Esse resíduo foi preservado apenas como referência histórica para futura triagem de hardening FRMS e nao deve ser integrado automaticamente.

## Regra de uso

Este patch nao deve ser aplicado sem nova triagem especifica de hardening FRMS, porque o arquivo-alvo evoluiu em `main` e a reaplicação cega pode reintroduzir conflito, regressão ou duplicação de lógica.

## Produção

Nenhuma alteração de produção foi executada durante este arquivamento.
Nao houve deploy, migration, SQL remoto nem alteração de banco.
