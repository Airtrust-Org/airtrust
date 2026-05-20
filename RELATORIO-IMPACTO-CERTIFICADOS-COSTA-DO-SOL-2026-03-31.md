# Relatorio de Impacto nos Certificados Emitidos - Costa do Sol

Data: 31/03/2026
Empresa: 6 - Costa do Sol Taxi Aereo
Base auditada: D1 remoto de producao
Escopo: historico com certificado emitido ou arquivo de certificado vinculado

## 1. Resumo executivo

Foi realizado o cruzamento entre o historico certificado da empresa 6 e o catalogo final homologado de modelos de qualificacao.

Resultado da auditoria:

- Total de registros historicos auditados: 48
- Registros com divergencia de carga horaria versus catalogo atual: 29
- Registros com divergencia de data de vencimento versus regra atual do catalogo: 7

Leitura pratica:

1. O principal impacto esta na carga horaria de certificados emitidos em treinamentos que hoje estao classificados como periodicos, mas historicamente foram gravados com a carga inicial.
2. O maior foco de divergencia esta no codigo D3, seguido por C, F2 e G2.
3. As divergencias de vencimento sao bem menores em quantidade e se concentram em configuracoes legadas de validade, mudancas de modelo e regras de fim de mes versus dia exato.

## 2. Divergencias de carga horaria

Regra usada para a auditoria:

1. Se tipo_treinamento = INICIAL, a carga esperada vem de carga_horaria_inicial.
2. Se tipo_treinamento = RECORRENTE, a carga esperada vem de carga_horaria_recorrente.
3. Quando o tipo esta nulo, foi aplicado o mesmo fallback atualmente usado na geracao publica: RECORRENTE.

### 2.1 Modelos mais impactados por divergencia de carga

| Codigo | Modelo                                        | Qtd | Carga historica | Carga esperada atual |
| ------ | --------------------------------------------- | --: | --------------: | -------------------: |
| D3     | CRM - Gerenciamento de Recursos da Tripulacao |  15 |              20 |                    8 |
| C      | Emergencias Gerais                            |   3 |               4 |                    2 |
| F2     | SK76 - Curriculo de Solo                      |   3 |              32 |                    8 |
| G2     | SK76 - Curriculo de Voo                       |   3 |              24 |                    6 |
| B      | Conhecimentos Gerais da Aeronave              |   2 |               4 |                    2 |
| D4     | DGR - Transporte de Artigos Perigosos         |   1 |               8 |                    4 |
| F1     | AW139 - Curriculo de Solo                     |   1 |              60 |                    8 |
| G1     | AW139 - Curriculo de Voo                      |   1 |              24 |                    8 |

### 2.2 Exemplos reais de divergencia de carga

| ID historico | Certificado                     | Codigo | Tipo       | Data realizacao | Carga historica | Carga esperada |
| ------------ | ------------------------------- | ------ | ---------- | --------------- | --------------: | -------------: |
| 3874         | -                               | B      | RECORRENTE | 2026-01-17      |               4 |              2 |
| 3230         | -                               | C      | RECORRENTE | 2026-01-17      |               4 |              2 |
| 4014         | CERT-00353-D3-20260314-1e473be4 | D3     | RECORRENTE | 2026-03-14      |              20 |              8 |
| 3300         | CERT-00282-D2-20230930-bbb86388 | D2     | RECORRENTE | 2026-01-16      |               2 |              2 |
| 3896         | CERT-00264-G1-20260327-ddd0cad7 | G1     | RECORRENTE | 2026-03-27      |              24 |              8 |

Observacao sobre o exemplo D2 acima: ele nao diverge em carga, mas aparece no impacto total por divergencia de vencimento e foi mantido aqui apenas como referencia de certificado numerado auditado no mesmo lote. O impacto de carga real se concentra nos codigos B, C, D3, D4, F1, F2, G1 e G2.

## 3. Divergencias de vencimento

Regra usada para a auditoria:

1. O vencimento esperado foi recalculado a partir de data_conclusao + validade atual do modelo.
2. Foi respeitado o campo vencimento_fim_mes quando presente no catalogo atual.

### 3.1 Casos encontrados

| ID historico | Certificado                     | Codigo       | Modelo                                                    | Realizacao | Vencimento historico | Vencimento esperado |
| ------------ | ------------------------------- | ------------ | --------------------------------------------------------- | ---------- | -------------------- | ------------------- |
| 4000         | -                               | CA-EBS       | CA-EBS                                                    | 2026-02-26 | 2030-02-26           | 2030-02-28          |
| 3300         | CERT-00282-D2-20230930-bbb86388 | D2           | SGSO                                                      | 2026-01-16 | 2028-01-16           | 2029-01-16          |
| 3443         | -                               | E3           | Operacoes sobre Grandes Extensoes de Agua (inclui T-HUET) | 2023-02-04 | 2027-02-04           | 2025-02-04          |
| 3473         | -                               | E5           | EFB - Electronic Flight Bag                               | 2026-01-17 | 2027-01-31           | 2027-01-17          |
| 3896         | CERT-00264-G1-20260327-ddd0cad7 | G1           | AW139 - Curriculo de Voo                                  | 2026-03-27 | 2027-03-31           | 2027-03-27          |
| 3987         | -                               | (sem codigo) | FAP 14 - Exame em Rota                                    | 2026-08-29 | 2027-03-31           | 2027-03-01          |
| 3999         | -                               | (sem codigo) | FAP 05.2 - Habilitacao de Tipo Helicoptero - SK76         | 2026-03-01 | 2027-03-31           | 2027-03-01          |

### 3.2 Leitura tecnica das divergencias de vencimento

1. D2 indica mudanca de regra de validade do modelo atual versus o historico gravado.
2. E3 mostra um caso materialmente relevante: o historico ficou com 48 meses, enquanto a regra atual do modelo auditado calcula 24 meses para o componente teorico consolidado.
3. E5 e G1 mostram diferenca de fim de mes versus dia exato da realizacao.
4. FAP 14 e FAP 05.2 SK76 mostram registros legados sem qualificacao_codigo, com vencimento gravado em fim de mes apesar de a configuracao atual apontar dia exato.

## 4. Conclusao pratica

1. O maior passivo de divergencia esta nos certificados recorrentes gravados com carga inicial, especialmente D3.
2. Ha um grupo menor de divergencias de vencimento que merece tratamento individual, com prioridade maior para E3 e D2.
3. Nem toda divergencia exige reemissao imediata. Parte delas representa mudanca de regra catalogada apos emissao historica.
4. Se a decisao operacional for alinhar historico e catalogo, o lote prioritario para saneamento e:

- D3
- F2
- G2
- B
- C
- D2
- E3
- G1

## 5. Recomendacao de tratamento

1. Reemitir ou revisar primeiro os certificados numerados com divergencia de carga ou vencimento material.
2. Separar divergencias de fim de mes versus dia exato das divergencias de validade realmente alterada.
3. Tratar E3 e D2 como casos de regra, nao apenas de formato.
4. Se desejar automacao, o proximo passo e gerar uma lista CSV dos 29 registros com divergencia de carga e dos 7 com divergencia de vencimento para correcao em lote.
