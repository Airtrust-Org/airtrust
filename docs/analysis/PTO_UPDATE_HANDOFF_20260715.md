# PTO update handoff 20260715

## Fonte

- Fonte canonica: `docs/analysis/PTO_MANOBRAS_CODIGOS_CANONICAL_20260715.csv`
- Decisao formal: o catalogo ativo revisado em producao em 2026-07-15 e canonico para codigos e nomes de modelos, codigos e nomes de manobras, ordens, aplicabilidades e relacoes modelo-manobra.
- O changeset `docs/analysis/PTO_MANOBRAS_CODIGOS_CHANGESET_20260715.csv` e parcial e nao substitui o CSV canonico.
- Baseline versionada em GitHub a partir deste PR: o snapshot canonico acima.

## Escopo canonico

- modelos ativos: 53
- relacoes ativas: 954
- manobras/codigos unicos: 451
- relacoes principais por modelo: 18
- modelos AW139: 25
- modelos SK76: 24
- modelos UNIVERSAL: 4
- relacoes AW139: 450
- relacoes SK76: 432
- relacoes UNIVERSAL: 72

## Regra de precedencia

`PRODUCAO_CANONICA_20260715 > PTO_ATUAL > MATRIZES_ANTIGAS > PLANOS_NAO_APLICADOS`

Essa precedencia vale apenas para o catalogo operacional e nao autoriza remover requisito regulatorio obrigatorio.

## O que e canonico

- `modelo_sessao_codigo`
- `modelo_sessao_nome`
- `finalidade`
- `ordem`
- `manobra_codigo_atual`
- `manobra_nome_atual`
- `categoria`
- `tipo_conteudo`
- `aplicabilidade`
- `aeronave`
- `referencia_pto`
- `referencia_normativa`
- `ativa`
- relacao exata modelo-manobra

## Como comparar com o PTO

1. Localizar o modelo canonico.
2. Comparar as 18 relacoes na ordem canonica.
3. Comparar codigo e nome da manobra.
4. Substituir codigo divergente.
5. Substituir nome divergente.
6. Corrigir ordem divergente.
7. Incluir relacao ausente.
8. Remover relacao que nao pertenca ao modelo canonico.
9. Confirmar aplicabilidade.
10. Registrar requisito regulatorio do PTO que nao esteja representado no catalogo.

## Uso dos arquivos

- Use `docs/analysis/PTO_MODELOS_MANOBRAS_HANDOFF_20260715.csv` para revisao documental do PTO.
- Use `docs/analysis/PTO_MANOBRAS_CANONICAL_DICTIONARY_20260715.csv` para consulta por codigo canonico unico.
- Use `docs/analysis/PTO_MANOBRAS_CODIGOS_CHANGESET_20260715.csv` apenas como apoio historico parcial.

## Limites importantes

- A ausencia de um codigo antigo no changeset nao invalida o codigo atual.
- Codigos antigos encontrados no PTO devem ser comparados por modelo, ordem, denominacao e contexto, e nao apenas por igualdade textual.
- `TRACEABILITY_DEBT_OPEN` permanece aberto para proveniencia historica parcial, mas nao bloqueia o uso documental do snapshot canonico.
- NOTECHS deve ser tratado separadamente e nao se confunde com codigo de manobra tecnica.

## Sanitizacao

Nao levar para outra conversa ou para o PTO:

- IDs internos
- `empresa_id`
- nomes de tabelas
- migrations
- logs de auditoria
- hashes
- RBAC
- multi-tenant
- detalhes de producao
- informacoes de engenharia
- dados pessoais
