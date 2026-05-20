# Relatorio de Homologacao Costa do Sol PTO

Data: 31/03/2026
Empresa: 6 - Costa do Sol Taxi Aereo
Fonte de verdade validada: D1 remoto de producao

## 1. Validade final dos certificados por modelo

Observacao: esta secao lista a validade configurada nos modelos da empresa 6. Essa validade e a base usada para o vencimento calculado dos certificados a partir da data de realizacao.

### 1.1 Modelos com validade indeterminada

| Codigo     | Modelo                                        | Inicial | Periodico | Observacao                                          |
| ---------- | --------------------------------------------- | ------: | --------: | --------------------------------------------------- |
| A          | Doutrinamento Basico                          |      12 |         - | Somente inicial, sem recorrencia periodica definida |
| H          | Curriculo de Diferencas - Sikorsky S76        |       2 |         - | Sob demanda                                         |
| I          | Instrutor de Voo - Solo                       |       2 |         - | Sem recorrencia definida no catalogo                |
| IOS-P      | Instrutor Operador de Estacao (IOS) - Pratico |       3 |         - | Somente inicial                                     |
| IOS-T      | Instrutor Operador de Estacao (IOS) - Teorico |       5 |         - | Somente inicial                                     |
| L          | Examinador Credenciado - Solo                 |       2 |         - | Sem recorrencia definida no catalogo                |
| PETRO-OURO | Regras de Ouro - Petrobras                    |       1 |         - | Somente inicial                                     |
| Q          | Experiencia Operacional em Rota               |      20 |         - | Inicial operacional em rota                         |
| T          | Treinamento Noturno em Pista                  |    0.67 |      0.67 | PTO sem validade mensal fixa                        |

### 1.2 Modelos com validade mensal configurada

| Validade | Codigos                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------- |
| 6 meses  | S                                                                                                 |
| 12 meses | B, C, D3, E1, E2, E4, E5, E6, E7, E8, F1, F2, G1, G2, R, CRM-LOS-P, CRM-LOS-T, EN-ASSES, REG-ANAC |
| 24 meses | D1, D4, E3, J, M, N, O, P                                                                         |
| 36 meses | D2, VM-SOLO, VM-VOO                                                                               |
| 48 meses | THUET                                                                                             |

## 2. Conferencia de homologacao PTO x catalogo final

Status usado nesta tabela:

- OK: modelo presente no catalogo final e alinhado com a regra consolidada aplicada
- OK novo codigo interno: item sem codigo PTO unico, incluído com codigo tecnico interno na categoria OUTROS
- OK sem recorrencia: item presente, mas mantido sem validade mensal por nao haver recorrencia fechada no PTO consolidado

### 2.1 PTO A e PTO B consolidados aplicados no catalogo final

| Codigo     | Modelo final no catalogo                                  | Categoria           | Inicial | Periodico | Validade      | Status                 |
| ---------- | --------------------------------------------------------- | ------------------- | ------: | --------: | ------------- | ---------------------- |
| A          | Doutrinamento Basico                                      | TREINAMENTO TEORICO |      12 |         - | Indeterminada | OK sem recorrencia     |
| B          | Conhecimentos Gerais da Aeronave                          | TREINAMENTO TEORICO |       4 |         2 | 12 meses      | OK                     |
| C          | Emergencias Gerais                                        | TREINAMENTO TEORICO |       4 |         2 | 12 meses      | OK                     |
| D1         | AVSEC                                                     | TREINAMENTO TEORICO |       8 |         4 | 24 meses      | OK                     |
| D2         | SGSO                                                      | TREINAMENTO TEORICO |       2 |         2 | 36 meses      | OK                     |
| D3         | CRM - Gerenciamento de Recursos da Tripulacao             | TREINAMENTO TEORICO |      20 |         8 | 12 meses      | OK                     |
| D4         | DGR - Transporte de Artigos Perigosos                     | TREINAMENTO TEORICO |       8 |         4 | 24 meses      | OK                     |
| E1         | Operacoes Offshore                                        | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E2         | Operacoes PBN - Navegacao Baseada em Performance          | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E3         | Operacoes sobre Grandes Extensoes de Agua (inclui T-HUET) | TREINAMENTO TEORICO |       8 |         8 | 24 meses      | OK                     |
| E4         | Operacao Aeromedica                                       | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E5         | EFB - Electronic Flight Bag                               | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E6         | Operacoes em Terrenos Desabitados                         | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E7         | Manuseio de Carga                                         | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| E8         | Diario de Bordo Eletronico (eDB)                          | TREINAMENTO TEORICO |       2 |         2 | 12 meses      | OK                     |
| F1         | AW139 - Curriculo de Solo                                 | TREINAMENTO TEORICO |      60 |         8 | 12 meses      | OK                     |
| F2         | SK76 - Curriculo de Solo                                  | TREINAMENTO TEORICO |      32 |         8 | 12 meses      | OK                     |
| G1         | AW139 - Curriculo de Voo                                  | TREINAMENTO DE VOO  |      24 |         8 | 12 meses      | OK                     |
| G2         | SK76 - Curriculo de Voo                                   | TREINAMENTO DE VOO  |      24 |         6 | 12 meses      | OK                     |
| H          | Curriculo de Diferencas - Sikorsky S76                    | OUTROS              |       2 |         - | Indeterminada | OK sem recorrencia     |
| I          | Instrutor de Voo - Solo                                   | OUTROS              |       2 |         - | Indeterminada | OK sem recorrencia     |
| J          | Instrutor de Voo - Voo                                    | OUTROS              |       2 |         1 | 24 meses      | OK                     |
| L          | Examinador Credenciado - Solo                             | OUTROS              |       2 |         - | Indeterminada | OK sem recorrencia     |
| M          | Examinador Credenciado - Voo                              | OUTROS              |       2 |         1 | 24 meses      | OK                     |
| N          | Manual Geral de Operacoes (MGO)                           | TREINAMENTO TEORICO |       1 |         1 | 24 meses      | OK                     |
| O          | Procedimentos Operacionais Padrao (SOP)                   | TREINAMENTO TEORICO |       1 |         1 | 24 meses      | OK                     |
| P          | Prevencao de CFIT (Controlled Flight Into Terrain)        | TREINAMENTO TEORICO |       1 |         1 | 24 meses      | OK                     |
| Q          | Experiencia Operacional em Rota                           | OUTROS              |      20 |         - | Indeterminada | OK sem recorrencia     |
| R          | Treinamento Noturno em Unidade Maritima                   | TREINAMENTO DE VOO  |       2 |         1 | 12 meses      | OK                     |
| S          | Treinamento Noturno em Simulador                          | TREINAMENTO DE VOO  |       1 |         1 | 6 meses       | OK                     |
| T          | Treinamento Noturno em Pista                              | TREINAMENTO DE VOO  |    0.67 |      0.67 | Indeterminada | OK sem recorrencia     |
| VM-SOLO    | Verificacao de Manutencao - Solo                          | OUTROS              |       1 |         1 | 36 meses      | OK novo codigo interno |
| VM-VOO     | Verificacao de Manutencao - Voo                           | OUTROS              |       1 |         1 | 36 meses      | OK novo codigo interno |
| IOS-T      | Instrutor Operador de Estacao (IOS) - Teorico             | OUTROS              |       5 |         - | Indeterminada | OK novo codigo interno |
| IOS-P      | Instrutor Operador de Estacao (IOS) - Pratico             | OUTROS              |       3 |         - | Indeterminada | OK novo codigo interno |
| CRM-LOS-T  | CRM em Ambiente LOS - Teorico                             | OUTROS              |       4 |         4 | 12 meses      | OK novo codigo interno |
| CRM-LOS-P  | CRM em Ambiente LOS - Pratico                             | OUTROS              |       4 |         4 | 12 meses      | OK novo codigo interno |
| REG-ANAC   | Regulacao ANAC                                            | OUTROS              |       1 |         1 | 12 meses      | OK novo codigo interno |
| PETRO-OURO | Regras de Ouro - Petrobras                                | OUTROS              |       1 |         - | Indeterminada | OK novo codigo interno |
| THUET      | T-HUET - Escape de Helicoptero Submerso                   | OUTROS              |       - |         - | 48 meses      | OK novo codigo interno |
| EN-ASSES   | English Assessment - Pilots                               | OUTROS              |       1 |         1 | 12 meses      | OK novo codigo interno |

### 2.2 Itens que existem no catalogo final, mas ficam fora desta matriz PTO consolidada

Esses modelos continuam presentes no catalogo da empresa 6 e nao foram o foco desta homologacao PTO consolidada:

| Codigo      | Modelo                                               | Categoria           | Validade |
| ----------- | ---------------------------------------------------- | ------------------- | -------- |
| ASO         | ASO - Atestado Saude Ocupacional                     | EXAME               | 12 meses |
| CMA         | Certificado Medico Aeronautico                       | EXAME               | 12 meses |
| CA-EBS      | CA-EBS                                               | TREINAMENTO TEORICO | 48 meses |
| LOFT        | LOFT                                                 | TREINAMENTO DE VOO  | 12 meses |
| NOT         | Treinamento Noturno Helideck                         | TREINAMENTO DE VOO  | 12 meses |
| FAP05.2-139 | FAP 05.2 - Habilitacao de Tipo Helicoptero - AW139   | CHECK               | 12 meses |
| FAP05.2-76  | FAP 05.2 - Habilitacao de Tipo Helicoptero - SK76    | CHECK               | 12 meses |
| FAP06-139   | FAP 06 - Habilitacao de Voo por Instrumentos - AW139 | CHECK               | 6 meses  |
| FAP06-76    | FAP 06 - Habilitacao de Voo por Instrumentos - SK76  | CHECK               | 6 meses  |
| FAP07-139   | FAP 07 - Instrutor de Voo - AW139                    | CHECK               | 12 meses |
| FAP07-76    | FAP 07 - Instrutor de Voo - SK76                     | CHECK               | 12 meses |
| FAP13-139   | FAP 13 - Credenciamento de Examinador - AW139        | CHECK               | 12 meses |
| FAP13-76    | FAP 13 - Credenciamento de Examinador - SK76         | CHECK               | 12 meses |
| FAP14       | FAP 14 - Exame em Rota                               | CHECK               | 6 meses  |

## 3. Conclusao objetiva para homologacao

1. A matriz PTO consolidada aplicada para a empresa 6 esta refletida no catalogo final remoto.
2. Os itens faltantes foram incluidos.
3. Os itens sem codigo PTO unico foram incluídos com codigos tecnicos internos em OUTROS.
4. Os modelos com validade indeterminada ficaram explicitamente separados para evitar falsa recorrencia automatica.
5. O catalogo ainda contem modelos extras de EXAME, CHECK e alguns treinamentos legados, preservados fora do escopo desta homologacao PTO.
