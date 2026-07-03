# Simuladores Matriz V6 - Implementation Preflight 20260703

## Branch e baseline

- Branch: `feat/simulador-matriz-v6-costa-do-sol-20260703`
- HEAD base de trabalho: `d40aa5eea58ee31cba8ba48aedd10331d7f2980e`
- Producao: intocada.

## Schema atual relevante

- `manobras`: catalogo tenant-aware; ha `codigo`, `nome`, `categoria`, `descricao`, `tipo_sessao`, `tipo_aeronave`, `ordem`, `empresa_id`, `deleted_at`.
- `manobras_categorias`: catalogo tenant-aware; ha soft delete.
- `modelos_sessao`: ha `codigo`, `nome`, `descricao`, `ordem_no_treinamento`, `duracao_estimada`, `empresa_id`, `modelo_aeronave`, `gera_qualificacao`, `tipo_sessao_id`.
- `modelos_sessao_manobras`: ha `ordem`, `observacoes`, `deleted_at`, trigger de `updated_at` e `UNIQUE(modelo_id, manobra_id)`.
- `fichas_sessao` e `fichas_sessao_manobras`: preservadas; nenhuma alteracao proposta.

## Unique confirmada

- `modelos_sessao_manobras` possui `UNIQUE(modelo_id, manobra_id)`.
- Consequencia: repeticao tecnica literal da V5 e tecnicamente inviavel sem saneamento.

## Modelos afetados

- 39 modelos unicos alvo da V6.
- 24 modelos iniciais:
  - `SK76-I-01/12` a `SK76-I-12/12`
  - `A139-I-01/12` a `A139-I-12/12`
- 15 modelos periodicos reutilizados:
  - `S76-P-C1/VFR`, `S76-P-C1/IFR`, `S76-P-C2/VFR`, `S76-P-C2/IFR`, `S76-P-C3/VFR`, `S76-P-C3/IFR`, `SK76-P-CHECK`
  - `A139-P-C1/VFR`, `A139-P-C1/IFR`, `A139-P-C2/VFR`, `A139-P-C2/IFR`, `A139-P-C3/VFR`, `A139-P-C3/IFR`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK`

## Inventario read-only atual

- Fonte analitica atual: `scripts/operations/modelos-sessao-manobras-empresa6-source-map.json`
- Estado atual confirmado:
  - 39 modelos-alvo presentes no source map
  - 858 relacoes tecnicas atuais
  - 22 tecnicas por modelo hoje
- Estado alvo V6:
  - 702 relacoes tecnicas
  - 18 tecnicas por modelo
  - 15 NOTECHS fixos fora das 18

## Codigos reaproveitados

- Maioria dos codigos periodicos e IFR/emergencia existentes foi reaproveitada.
- `S76-VOR-00` e `S76-LDP-00` entram como existentes, nao como novos.
- `S76-SFE-10`, `S76-BCS-10`, `CAU-APO-38`, `WAR-IDL-16` entram como reaproveitamentos tecnicos para saneamento de duplicidades.

## Codigos novos necessarios

- Herdados das matrizes V4/V5: familias `S76-CKL-*`, `S76-PNR-01`, `S76-PNO-01`, `A139-CKL-*`, `A139-AFC-01`, `A139-OEI-01`, entre outros documentados nas fontes.
- Variacoes tecnicas reais abertas nesta V6:
  - `A139-PNO-01`
  - `A139-AUT-02`
  - `A139-RPM-02`

## Codigos `-R` identificados

- Nenhum codigo `-R` foi adotado na V6.
- Regra mantida: se nao houver variacao tecnica real, nao criar codigo artificial.

## Codigos que viram legado logico

- Varios reforcos genericos/comportamentais da V3/V4 permanecem apenas como legado logico/documental.
- Itens CRM/NTS/COM/BRF/DBR genericos permanecem fora das 18 tecnicas.

## Vinculos atuais a preservar

- Fichas finalizadas.
- Historico de catalogo e de modelos via soft delete logico.
- Modelos fora do escopo V6:
  - noturno
  - reaquisicao
  - semestral
  - `TRE-INST`
  - `CRED-EXA`

## Riscos por tabela

- `manobras`: risco medio.
  - Pode exigir criacao catalogal de codigos novos/variacoes reais.
- `modelos_sessao`: risco baixo.
  - Sem schema novo; apenas referencia de codigo/nome existente.
- `modelos_sessao_manobras`: risco alto.
  - Concentra soft delete logico, insert, reorder e metadata textual.
- `fichas_sessao` / `fichas_sessao_manobras`: risco bloqueado por politica.
  - Nao tocar.

## Metadata / schema

- Caminho minimo adotado: `modelos_sessao_manobras.observacoes`.
- Formato:
  - `tipo_item=tecnica`
  - `fase_voo=...` quando a fonte fornece fase explicita
  - `carater=avaliativo` nos checks/LOFT Check
  - `fap_refs=...` quando a fonte fornece referencia
- Gap documentado:
  - o snapshot local detectado em `worker-airtrust/.wrangler/...sqlite` esta vazio/incompativel para validacao tenant-aware direta.

## Rollback

- Script de manutencao e idempotente e local-only por padrao.
- Reversao prevista:
  - soft delete dos vinculos V6 novos por `modelo_id + manobra_id`;
  - reativacao dos vinculos antigos a partir do source map/historico local;
  - preservacao do catalogo se ja referenciado por historico.
- Sem hard delete e sem limpeza destrutiva.

