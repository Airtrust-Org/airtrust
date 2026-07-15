# PTO manobras/codigos - reconciliacao tecnica 20260715

## 1. Resumo executivo

- Fonte canonica formal desta entrega: catalogo ativo revisado em producao em 2026-07-15, consultado em modo estritamente read-only.
- Decisao formal registrada: "O responsavel pelo AirTrust declarou que o catalogo ativo revisado em producao em 15/07/2026 e canonico para modelos de sessao, codigos de sessao, codigos de manobra, nomes de manobra, ordens, aplicabilidades e relacoes modelo-manobra."
- O snapshot canonico versionado neste PR contem **53 modelos ativos**, **954 relacoes ativas modelo-manobra** e **451 manobras/codigos unicos**.
- Os codigos atuais das manobras sao canonicos para a futura atualizacao do PTO.
- Os nomes atuais das manobras tambem sao canonicos para a futura atualizacao do PTO.
- A ordem das manobras dentro de cada modelo e canonica.
- A relacao especifica entre modelo e manobra e canonica.
- O GitHub passa a armazenar a baseline versionada a partir deste PR, sem reescrever a proveniencia historica anterior.
- O changeset `PTO_MANOBRAS_CODIGOS_CHANGESET_20260715.csv` permanece um registro parcial de transicao e nao substitui o CSV canonico.
- Veredito desta reconciliacao: **GO_PTO_UPDATE_READY**.
- Classificacao separada de rastreabilidade: **TRACEABILITY_DEBT_OPEN**.

## 2. Data e commit de referencia

- Data da reconciliacao: 2026-07-15
- Branch de trabalho: `audit/pto-manobras-codigos-reconciliation-20260715`
- HEAD inicial desta fase: `b6ef8edce55d989c92e399b719b68c2e1e019e9f`
- Producao consultada em modo read-only: `airtrust-db`

## 3. Decisao canonica de governanca

- Producao revisada em 2026-07-15 e a fonte canonica completa para a futura atualizacao do PTO no que se refere ao catalogo operacional.
- O escopo canonico abrange: `modelo_sessao_codigo`, `modelo_sessao_nome`, `finalidade`, `ordem`, `manobra_codigo_atual`, `manobra_nome_atual`, `categoria`, `tipo_conteudo`, `aplicabilidade`, `aeronave`, `referencia_pto`, `referencia_normativa`, `ativa` e a relacao exata modelo-manobra.
- Cada uma das 954 relacoes deve ser tratada individualmente na futura revisao do PTO.
- Em divergencias de catalogo, a regra de precedencia documental passa a ser `PRODUCAO_CANONICA_20260715 > PTO_ATUAL > MATRIZES_ANTIGAS > PLANOS_NAO_APLICADOS`.
- Essa precedencia vale apenas para o catalogo operacional e nao autoriza remover requisito regulatorio obrigatorio.

## 4. Artefatos desta entrega

- `docs/analysis/PTO_MANOBRAS_CODIGOS_CANONICAL_20260715.csv`: snapshot canonico completo do estado revisado de producao em 2026-07-15.
- `docs/analysis/PTO_MANOBRAS_CODIGOS_CHANGESET_20260715.csv`: registro parcial de transicao historica com evidencias suficientes.
- `docs/analysis/PTO_MANOBRAS_CANONICAL_DICTIONARY_20260715.csv`: dicionario canonico com uma linha por codigo de manobra unico.
- `docs/analysis/PTO_MODELOS_MANOBRAS_HANDOFF_20260715.csv`: matriz sanitizada para uso documental no PTO.
- `docs/analysis/PTO_UPDATE_HANDOFF_20260715.md`: handoff sanitizado para outra conversa.

## 5. Totais oficiais do recorte canonico

### 5.1 Totais gerais

- Modelos ativos: 53
- Relacoes ativas modelo-manobra: 954
- Manobras/codigos unicos: 451
- IDs unicos de manobra no recorte: 451
- Relacoes principais por modelo: 18

### 5.2 Totais por aeronave (modelos ativos)

- AW139: 25
- SK76: 24
- UNIVERSAL: 4

### 5.3 Totais por aeronave (relacoes ativas)

- AW139: 450
- SK76: 432
- UNIVERSAL: 72

## 6. Status do snapshot canonico

- O CSV canonico preserva as 954 linhas e as informacoes tecnicas existentes.
- A coluna `proveniencia` foi preservada sem reclassificar historico como `VERSIONADO_E_APLICADO`.
- A coluna `acao_documental_recomendada` foi atualizada para registrar que codigo atual, nome atual, ordem, aplicabilidade e relacao modelo-manobra sao canonicos e que divergencias devem ser corrigidas no PTO.
- `TRACEABILITY_DEBT_OPEN` permanece aberto para as linhas cuja proveniencia historica segue parcial.
- Essa divida de rastreabilidade nao bloqueia o uso documental do snapshot canonico.

### 6.1 Distribuicao historica preservada de proveniencia

- `PRESENTE_EM_PRODUCAO_NAO_LOCALIZADO_NO_GITHUB`: 696
- `PROVENIENCIA_NAO_CONFIRMADA`: 116
- `DIVERGENCIA_GITHUB_PRODUCAO`: 70
- `VERSIONADO_E_APLICADO`: 72

## 7. Status do changeset de transicao

- O changeset atual preserva apenas substituicoes historicas confirmadas por evidencia suficiente.
- O changeset e parcial e nao deve ser interpretado como lista completa de todos os codigos antigos e atuais de manobra.
- A ausencia de um codigo antigo no changeset nao invalida o codigo atual.
- Na futura revisao do PTO, o codigo atual deve ser obtido diretamente do CSV canonico.
- Codigos antigos encontrados no PTO devem ser comparados por modelo, ordem, denominacao e contexto da relacao canonica, e nao somente por igualdade textual.
- A ausencia de rastreabilidade completa no GitHub nao exige nova decisao humana por si so.
- Apenas questoes pedagogicas ou regulatorias reais permanecem como eventual pendencia humana fora do changeset.

## 8. Metodo futuro de comparacao com o PTO

1. Localizar o modelo canonico correspondente.
2. Comparar as 18 relacoes da sessao na ordem canonica.
3. Comparar codigo e nome da manobra.
4. Substituir codigo divergente no PTO.
5. Substituir nome divergente no PTO.
6. Corrigir ordem divergente no PTO.
7. Incluir relacao ausente no PTO.
8. Remover relacao que nao pertenca ao modelo canonico.
9. Confirmar aplicabilidade.
10. Registrar requisito regulatorio do PTO que nao esteja representado no catalogo.

## 9. NOTECHS

- As 18 relacoes principais por modelo nao representam necessariamente todas as linhas de avaliacao da ficha.
- NOTECHS deve ser tratado separadamente e nao deve ser confundido com codigo de manobra tecnica.

## 10. Sanitizacao documental

- Nao levar ao PTO: IDs internos, `empresa_id`, nomes de tabelas, migrations, logs de auditoria, hashes, RBAC, detalhes multi-tenant, detalhes de producao, informacoes de engenharia ou dados pessoais.
- A matriz de handoff foi gerada sem IDs internos e sem dados pessoais.

## 11. Validacoes executadas

- CSV canonico com 954 linhas: PASS
- 53 modelos unicos: PASS
- 451 codigos de manobra unicos: PASS
- 451 IDs de manobra unicos: PASS
- 18 relacoes por modelo: PASS
- 25 modelos AW139: PASS
- 24 modelos SK76: PASS
- 4 modelos UNIVERSAL: PASS
- 450 relacoes AW139: PASS
- 432 relacoes SK76: PASS
- 72 relacoes UNIVERSAL: PASS
- Nenhum codigo de manobra vazio: PASS
- Nenhum nome de manobra vazio: PASS
- Nenhuma ordem duplicada dentro do mesmo modelo: PASS
- Nenhum codigo associado a nomes conflitantes: PASS
- Nenhum modelo com quantidade diferente de 18 relacoes: PASS
- Dicionario canonico com 451 linhas: PASS
- Matriz sanitizada com 954 linhas: PASS
- Ausencia de dados pessoais na matriz sanitizada: PASS
- Ausencia de IDs internos na matriz sanitizada: PASS
- Veredito antigo removido das conclusoes e resumos: PASS
- Total geral conflitante removido das conclusoes e resumos: PASS

## 12. Conclusao

- Producao revisada em 2026-07-15 e a fonte canonica completa para a atualizacao futura do PTO no escopo deste catalogo.
- O snapshot versionado neste PR passa a ser a baseline documental oficial do recorte auditado.
- Futuras alteracoes do catalogo devem gerar novo snapshot e/ou novo changeset versionado.
- O PTO nao foi alterado nesta entrega.
- Nenhum codigo de producao foi alterado.
- Nenhum deploy, migration, DML ou escrita remota foi executado.

## 13. Veredito de prontidao para atualizar o PTO

`GO_PTO_UPDATE_READY`

Classificacao separada:

`TRACEABILITY_DEBT_OPEN`
