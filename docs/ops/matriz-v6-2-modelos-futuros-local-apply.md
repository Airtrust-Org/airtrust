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

- 51 modelos-alvo da V6.2 fechada (Decisao 15, `docs/analysis/airtrust_matriz_v6_2_todas_sessoes_manobras_final.md`)
- 18 itens tecnicos por modelo (`918` linhas tecnicas totais)
- 15 NOTECHS fora das 18 tecnicas, em todos os 51 modelos
- TRE-INST e CRED-EXA entram no mesmo padrao `18 tecnicas + 15 NOTECHS`
- `A139-NOT-01`, `A139-NOT-02`, `A139-REQ-01`, `A139-S-01/02`, `A139-S-02/02`, `S76-NOT-01`, `S76-NOT-02`, `S76-REQ-01`, `SK76-S-01/02` e `SK76-S-02/02` entram no mesmo padrao (Decisao 15), preservando as 18 tecnicas ja documentadas em `docs/MODELOS_SESSAO_MANOBRAS.md`
- `SK76-S-02/02` usa `S76-LGB-47` (nao `S76-LGE-44`), Decisao 16
- `S76-NOT-02` termina em `S76-FLU-01`, sem `S76-EST-01` redundante, Decisao 17
- `LOFT` foi mantido nos nomes das 4 sessoes semestrais por decisao curricular/auditoria do owner
- `A139-S-01/02`, `A139-S-02/02`, `SK76-S-01/02` e `SK76-S-02/02` agora possuem enquadramento LOFT explicito no documento-fonte
- `LOFT` nao exige necessariamente codigo `LOFT-*`; o guardrail passa a validar `LOFT` por codigo aprovado ou por cenario estruturado (`Enquadramento LOFT`)
- `SK76-P-CHECK` usa `LOFT-CHK-*`
- `A139-I-01/12` encerra em `A139-EST-01`
- `SK76-I-10/12` encerra em `S76-FLU-01`
- codigos `76-*` legados permanecem preservados quando ainda exigidos pelo documento
- **nenhuma limpeza/arquivamento de manobras sem uso nesta etapa** — a lista de manobras ativas sem uso (`docs/analysis/MANOBRAS_SEM_USO_EM_MODELOS_SESSAO_SNAPSHOT_20260705.md`) so deve ser recalculada depois deste fechamento do target 51, porque o denominador de "uso" muda quando os 10 modelos passam a ter `modelos_sessao_manobras`

## Por que sao 51 modelos

O catalogo operacional da Costa do Sol tem 51 modelos de sessao ativos. A primeira fase da V6.2 fechou um subconjunto de 41 (Decisao 12: TRE-INST/CRED-EXA inclusos). Esta fase fecha os 10 modelos restantes (Decisao 15): noturno, reaquisicao e semestral AW139/SK76, que os PDFs de proposta tratavam como "fora do pacote enviado" mas que fazem parte do catalogo operacional de 51.

- `12` modelos AW139 inicial
- `8` modelos AW139 periodico unicos
- `12` modelos SK76 inicial
- `7` modelos SK76/S76 periodico unicos
- `1` modelo TRE-INST
- `1` modelo CRED-EXA
- `5` modelos AW139 noturno/reaquisicao/semestral (Decisao 15)
- `5` modelos SK76/S76 noturno/reaquisicao/semestral (Decisao 15)

Total: `51` modelos unicos.

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
