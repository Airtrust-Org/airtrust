# AirTrust — Mapa de Campos e Lacunas do eDB

> **Data:** 2026-08-02  
> **Base:** `origin/main` em `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Escopo:** comparação entre os requisitos do eDB e o schema/fluxo atual do Controle de Voos

## 1. Classificação

- **Disponível operacionalmente:** existe no domínio `cv_*`, mas ainda não possui valor regulatório.
- **Parcial:** existe informação semelhante, mas falta granularidade, origem, validação ou snapshot.
- **Externo:** depende de cadastro ou domínio fora do Controle de Voos.
- **Inexistente:** exige nova capacidade.
- **Gate ANAC:** depende de definição do método de cumprimento.

## 2. Identificação do volume e da aeronave

<!-- prettier-ignore -->
| Requisito | Fonte atual | Estado | Necessidade eDB |
|---|---|---:|---|
| Número do volume `NN/CC-MMM/AAAA` | Nenhuma | Inexistente | Entidade de volume, sequência por aeronave e imutabilidade |
| Termo de abertura | Nenhuma | Inexistente | Snapshot e assinatura do responsável |
| Termo de encerramento | Nenhuma | Inexistente | Motivo, saldos finais, assinatura e bloqueio do volume |
| Fabricante | Cadastro de aeronave, a confirmar no fluxo | Externo/parcial | Snapshot no termo e em cada registro necessário |
| Modelo | Cadastro de aeronave, a confirmar no fluxo | Externo/parcial | Snapshot regulatório |
| Número de série | Cadastro de aeronave, a confirmar no fluxo | Externo/parcial | Obrigatório; não depender apenas de prefixo |
| Marcas de nacionalidade e matrícula | `cv_voos.prefixo` | Parcial | Normalização, validação e snapshot |
| Proprietário | Não está no registro `cv_*` | Inexistente no fluxo | Snapshot com identificação legal |
| Operador | `empresa_id` identifica tenant | Parcial | Snapshot da entidade legal e vínculo ao ato autorizativo |
| Horas totais de célula na abertura/encerramento | Não é campo do volume atual | Inexistente | Fonte técnica controlada e reconciliação |
| Ciclos/pousos acumulados | Etapas possuem contadores; acumulado regulatório não formalizado | Parcial | Saldo auditado e snapshot de volume |

## 3. Tripulação

<!-- prettier-ignore -->
| Requisito | Fonte atual | Estado | Necessidade eDB |
|---|---|---:|---|
| Nome do tripulante | Cadastro de funcionários | Externo/disponível | Snapshot no momento da assinatura |
| Código ANAC/CANAC | Cadastro de funcionários e inscrição SIGVOOS | Parcial | Validação positiva e snapshot |
| Função por etapa | `cv_voo_tripulantes.funcao`, `etapa_id`, origem da função | Disponível operacionalmente | Mapear códigos atuais para códigos da Portaria compilada |
| Códigos `P1/P2/I1/I2/O1/O2/O3/V1/V2/V3/C/M/X/D` | Modelo atual usa principalmente `PIC/SIC/COM/MEC/OUTRO` | Lacuna | Novo catálogo/mapeamento regulatório versionado |
| Apresentação | `cv_voo_tripulantes.horario_apresentacao` | Disponível operacionalmente | Timezone, data completa, validação e snapshot |
| Base contratual | Não confirmada no registro de voo | Inexistente/parcial | Snapshot da base do tripulante |
| Troca de tripulação | Pode ser modelada por etapa | Parcial | Bloquear próxima etapa até assinatura do PIC anterior |

## 4. Dados por etapa

A migration `0411_controle_voos_sigvoos_integration_schema.sql` já criou `cv_voo_etapas` e campos de rastreabilidade SIGVOOS. Isso é uma base operacional importante, não um registro regulado.

<!-- prettier-ignore -->
| Requisito | Campo atual provável | Estado | Necessidade eDB |
|---|---|---:|---|
| Número sequencial da etapa | `numero_etapa`, `sigvoos_leg_number` | Disponível operacionalmente | Sequência congelada no snapshot |
| Data | `cv_voos.data_programacao`/data operacional | Parcial | Distinguir data local operacional e timestamps UTC |
| Origem | `cv_voo_etapas.origem_icao` | Disponível operacionalmente | Validação de código e snapshot |
| Destino | `cv_voo_etapas.destino_icao` | Disponível operacionalmente | Validação de código e snapshot |
| Partida dos motores | `horario_motor_ligado` | Disponível operacionalmente | Data, timezone, sequência temporal e fonte |
| Decolagem | `horario_decolagem` | Disponível operacionalmente | Data, timezone, sequência temporal e fonte |
| Pouso | `horario_pouso` | Disponível operacionalmente | Data, timezone, sequência temporal e fonte |
| Corte dos motores | `horario_motor_desligado` | Disponível operacionalmente | Data, timezone, sequência temporal e fonte |
| Tempo de voo | `tempo_decolagem_pouso`, `tempo_navegacao` | Parcial | Definição normativa única e cálculo verificável |
| Tempo total/block | `tempo_total` | Disponível operacionalmente | Regras de cálculo e arredondamento versionadas |
| Diurno | Não há campo específico no schema 0411 | Inexistente/parcial | Campo e regra de derivação |
| Noturno | `tempo_noturno` | Disponível operacionalmente | Fonte/cálculo e validação |
| VFR | Não há campo específico | Inexistente | Campo explícito ou método aceito de cálculo |
| IFR real | `tempo_ifr` | Parcial | Separar IFR real de simulado quando aplicável |
| IFR simulado | Não há campo específico | Inexistente | Campo explícito |
| Pousos diurnos | `pousos_diurnos` | Disponível operacionalmente | Validação e snapshot |
| Pousos noturnos | `pousos_noturnos` | Disponível operacionalmente | Validação e snapshot |
| Ciclos/starts | `starts` | Disponível operacionalmente | Definição e reconciliação técnica |
| Combustível na partida | `combustivel_inicio`, unidade | Parcial | Unidade confirmada e catálogo por aeronave |
| Combustível final/consumo | `combustivel_fim`; RDV agregado | Parcial | Campos exigidos pela Resolução nº 773 e regras de unidade |
| Abastecimento | Fluxo RDV possui abastecimentos, a confirmar por etapa | Parcial | Vincular ao registro e congelar quantidade/unidade |
| POB | `pax` e `cv_rdv_operacional.pob` | Parcial | Definir tripulação incluída, validação e snapshot |
| Carga transportada | `payload`/`carga_kg` | Parcial | Unidade e significado confirmados |
| Natureza do voo | Catálogo `cv_naturezas_voo` | Parcial | Catálogo regulatório versionado e snapshot |
| Ocorrências | RDV/eventos/ocorrências | Parcial | Conteúdo oficial por etapa, identidade e assinatura |
| Número/identificador recuperável | IDs internos e SIGVOOS | Parcial | Identificador estável do registro oficial e versão |

## 5. Situação técnica e manutenção

<!-- prettier-ignore -->
| Requisito | Fonte atual | Estado | Necessidade eDB |
|---|---|---:|---|
| Última intervenção de manutenção | Fora do `cv_*` | Inexistente no eDB | Fonte técnica controlada e snapshot pré-voo |
| Tipo da próxima intervenção | Fora do `cv_*` | Inexistente | Integração com manutenção/SDRMe |
| Horas de célula até a próxima intervenção | Fora do `cv_*` | Inexistente | Valor, unidade, origem e momento da apuração |
| Responsável pelo retorno ao serviço | Fora do fluxo | Inexistente | Identidade, licença/CANAC, organização e assinatura |
| Discrepância | Texto de ocorrências/divergências | Parcial | Registro estruturado, sistema/código, data, autor e assinatura |
| Código ATA/sistema | Não identificado no fluxo atual | Inexistente | Catálogo e campo estruturado |
| Ação corretiva | Fora do fluxo atual | Inexistente | Descrição, data, referência e assinatura |
| Ação corretiva retardada | Fora do fluxo atual | Inexistente | Estado, base autorizativa e acompanhamento |
| Aprovação para retorno ao serviço | Fora do fluxo atual | Inexistente | Ato assinado e imutável |
| Cadastro de aprovador terceirizado | Fora do fluxo | Inexistente | Nome, licença, COM/COA, data/hora e cadastrador |
| Ciência do PIC | Não existe ato regulado | Inexistente | Aviso de inicialização, conteúdo exibido e assinatura/ack |

## 6. Assinaturas e integridade

<!-- prettier-ignore -->
| Requisito | Estado atual | Lacuna |
|---|---:|---|
| Identificação positiva do signatário | Login JWT | Login não é assinatura e pode não satisfazer identificação reforçada |
| Declaração inequívoca de intenção | Inexistente | Tela e envelope de intenção por finalidade |
| Revisão do conteúdo antes de assinar | Inexistente | Visão congelada do payload canônico |
| Ação deliberada | Inexistente | Confirmação não reutilizável |
| Assinatura eletrônica PIC | Inexistente | Método a validar com ANAC |
| Assinatura digital operador | Inexistente | Certificado e política a definir |
| Assinatura de discrepância | Inexistente | Finalidade e prerrogativas específicas |
| Assinatura de retorno ao serviço | Inexistente | Licença/prerrogativa e não repúdio |
| Hash do registro oficial | Há hashes operacionais SIGVOOS | Hash operacional não é hash do snapshot oficial |
| Conteúdo canônico | Inexistente | Schema e canonicalização versionados |
| Associação permanente assinatura-conteúdo | Inexistente | Envelope de assinatura persistente |
| Correção preservando original | Inexistente | Nova versão/addendum e invalidação da assinatura anterior |
| Trusted timestamp | Inexistente | Gate regulatório/técnico |
| Verificação de certificado/revogação | Inexistente | Política de validação e conservação de evidência |

## 7. PED, offline e fiscalização

<!-- prettier-ignore -->
| Requisito | Estado atual | Lacuna |
|---|---:|---|
| PED funcional durante toda operação | SPA/PWA genérica | Não demonstrado como PED regulado |
| Funcionamento stand-alone | Service Worker genérico | Não garante dados e fluxo completos offline |
| Últimos 30 dias na aeronave | Inexistente | Pacote local cifrado, atualizado e verificável |
| Situação técnica na inicialização | Inexistente | Fluxo obrigatório antes das demais funções |
| Confirmação de leitura | Inexistente | Ato auditável |
| Criptografia local | Não comprovada para eDB | Gestão de chaves e dados locais |
| Fila idempotente | Há padrões de jobs/importação | Precisa contrato específico para eventos regulados |
| Conflito de sincronização | Conflitos SIGVOOS existem | Não pode sobrescrever snapshot assinado |
| Revogação de dispositivo | Inexistente para eDB | Registro, estado e wipe/negação de sincronização |
| Pesquisa cronológica | Parcial em relatórios | Precisa modo fiscalização |
| Impressão Anexo III | Inexistente | Layout e assinatura digital do operador |
| Exportação verificável | Inexistente | Pacote com conteúdo, metadados e verificador |
| Acesso da ANAC | Inexistente | Modelo restrito por tenant/aeronave/período |

## 8. Retenção, continuidade e transferência

<!-- prettier-ignore -->
| Requisito | Estado atual | Lacuna |
|---|---:|---|
| Guarda por toda existência da aeronave + 5 anos e 1 dia | Não formalizada | Política, storage e contrato de saída |
| Backup regular | Infraestrutura geral | Evidência específica, retenção e drill |
| Restauração verificada | Há práticas operacionais, não específicas do eDB | Cenários e RTO/RPO aceitos |
| Detecção de corrupção | Inexistente para acervo eDB | Verificação periódica de hash/assinatura |
| Reconstituição | Inexistente | Caso formal, fontes, aprovação e marcação |
| Transferência de propriedade | Inexistente | Exportação completa e cadeia de custódia |
| Retenção pós-exportação | Inexistente | Recorte de 5 anos e 1 dia |
| Migração para outro sistema | Inexistente | Portabilidade, validação e reconciliação |
| Descontinuidade submetida à ANAC | Inexistente | Workflow regulatório e estado do sistema |

## 9. Itens reaproveitáveis sem declarar conformidade

- isolamento por `empresa_id` e guards multi-tenant;
- RBAC e autenticação como camada inicial;
- `cv_voos`, `cv_voo_etapas` e `cv_voo_tripulantes` como fontes de rascunho;
- staging e conflitos SIGVOOS;
- eventos operacionais;
- infraestrutura Cloudflare Workers/D1/R2;
- componentes de PDF;
- Service Worker;
- padrões de idempotência e jobs resilientes;
- logs e request IDs sanitizados.

Cada item precisa de análise específica. Reutilização não equivale a conformidade regulatória.

## 10. Primeira fatia implementável

A primeira fatia segura, depois da orientação regulatória, é:

1. contrato de conteúdo eDB versionado;
2. projeção somente leitura de `cv_*` para rascunho;
3. validação de completude e lista de divergências;
4. nenhuma assinatura e nenhum status oficial;
5. feature flag exclusivamente `shadow`;
6. testes de isolamento por tenant e imutabilidade do snapshot de rascunho.

A migration regulada, assinatura e offline devem permanecer separadas em PRs próprias.
