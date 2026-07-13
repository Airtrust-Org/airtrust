# Fichas canônicas de treinamento prático de examinador

Migration ativa: `worker-airtrust/migrations/0425_examiner_event_models_and_assignment_owned_fichas.sql`.

## Modelos canônicos

| Código | Nome canônico | Duração curricular |
|---|---|---|
| `EXA-E01` | `Treinamento Prático de Examinador 1/2 — SOP Normal e Condução Inicial / SOP Anormal e Avaliação` | 120 minutos |
| `EXA-E02` | `Treinamento Prático de Examinador 2/2 — Emergência, Intervenção e Segurança / Atuação Integrada do Examinador` | 120 minutos |

Os códigos `EXA-V01..EXA-V04` permanecem apenas como legado histórico e ficam
`ativo = 0`. Novos agendamentos compartilhados usam somente `EXA-E01` e
`EXA-E02`.

## Estrutura operacional

- Cada evento físico dura 120 minutos.
- Cada evento gera exatamente 1 ficha curricular de 120 minutos.
- A ficha pertence à `atribuicao_curricular_id`, não a um segmento isolado.
- A carga horária da ficha é a união dos segmentos operacionais ligados à mesma atribuição.
- O histórico de fichas antigas não é regravado.

## Cabeçalho obrigatório do PDF

### EXA-E01

Linha 1:
`Treinamento Prático de Examinador 1/2`

Linha 2:
`SOP Normal e Condução Inicial / SOP Anormal e Avaliação`

Linha 3:
`Duração curricular: 120 minutos`

### EXA-E02

Linha 1:
`Treinamento Prático de Examinador 2/2`

Linha 2:
`Emergência, Intervenção e Segurança / Atuação Integrada do Examinador`

Linha 3:
`Duração curricular: 120 minutos`

## Metadados obrigatórios na ficha/PDF

- código `EXA-E01` ou `EXA-E02`;
- equipamento utilizado;
- participante avaliado;
- instrutor supervisor;
- duração curricular de 120 minutos.

## Grade técnica

Cada ficha mantém exatamente:

- 18 itens técnicos;
- 15 NOTECHS canônicos;
- total de 33 itens.

Os 18 itens técnicos são sempre exibidos em 2 blocos de 9:

### EXA-E01

- Bloco A — SOP Normal e Condução Inicial
- Bloco B — SOP Anormal e Avaliação

### EXA-E02

- Bloco A — Emergência, Intervenção e Segurança
- Bloco B — Atuação Integrada do Examinador

Os 15 NOTECHS canônicos aparecem depois dos 18 técnicos.

## Exclusões explícitas

Estas fichas não incluem:

- FAP;
- QRH;
- assinatura de checador externo;
- alegação de credenciamento, aprovação ou aceite ANAC.

Quando houver referência a checklist, usar `ECL aplicável`.
