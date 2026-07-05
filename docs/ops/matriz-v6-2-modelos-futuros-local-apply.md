# Matriz V6.2 — Modelos Futuros

Fonte obrigatoria: `airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`.

Documentacao de apoio desta fase:

- `docs/analysis/matriz-v6-2-postmortem-escopo-e-coerencia.md`
- `docs/analysis/matriz-v6-2-acceptance-matrix-51-modelos.md`

## Escopo

Esta implantacao atualiza apenas:

- `modelos_sessao`
- `modelos_sessao_manobras`
- `manobras`

Nao deve tocar:

- `fichas_sessao`
- `fichas_sessao_manobras`
- `simulador_agendamentos`
- `avaliacoes_manobras`
- `fichas_manobras_historico`
- Qualificacoes, LMS, RBAC/auth, multi-tenant e qualquer dado historico

## Regras aplicadas

- 41 modelos-alvo da V6.2 final
- 18 itens tecnicos por modelo
- 15 NOTECHS fora das 18 tecnicas
- TRE-INST e CRED-EXA entram no mesmo padrao `18 tecnicas + 15 NOTECHS`
- `SK76-P-CHECK` usa `LOFT-CHK-*`
- `A139-I-01/12` encerra em `A139-EST-01`
- `SK76-I-10/12` encerra em `S76-FLU-01`
- codigos `76-*` legados permanecem preservados quando ainda exigidos pelo documento

## Por que sao 41 modelos

Os documentos de proposta repetem ciclos periodicos e sequencias equivalentes em mais de um contexto documental, mas a implantacao trabalha com modelos unicos de template.

- `12` modelos AW139 inicial
- `8` modelos AW139 periodico unicos
- `12` modelos SK76 inicial
- `7` modelos SK76/S76 periodico unicos
- `1` modelo TRE-INST
- `1` modelo CRED-EXA

Total: `41` modelos unicos.

O loader consolida modelos repetidos do material de origem e nao duplica templates equivalentes em `modelos_sessao`.

## Dry-run local

```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --empresa-id 6 --dry-run
```

## Apply local controlado

Exige confirmacao explicita:

```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs \
  --empresa-id 6 \
  --db-file /caminho/para/local.sqlite \
  --apply \
  --confirm "APLICAR MATRIZ V6.2 TRE-INST CRED-EXA E NOMES SEM ALTERAR FICHAS EXISTENTES"
```

## Protecoes

- dry-run por padrao
- sem DML remoto
- sem deploy
- snapshot before/after das tabelas historicas no apply local
- falha imediata se qualquer tabela historica mudar
