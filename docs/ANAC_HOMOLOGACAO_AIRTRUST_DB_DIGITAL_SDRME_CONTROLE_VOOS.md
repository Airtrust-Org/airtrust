# AirTrust — Preparação Regulatória ANAC: DB Digital, SDRMe e Controle de Voos

> **Tipo:** Documento regulatório/produto
> **Data:** 2026-06-13
> **Versão:** v1.0
> **Status:** Rascunho para validação interna — NÃO submetido à ANAC
> **Autor:** AirTrust Engineering
> **AVISO LEGAL:** Este documento representa uma análise interna de conformidade regulatória com base em leitura das normas publicadas. Nenhuma informação aqui contida substitui consulta com consultor regulatório habilitado ou comunicação oficial com a ANAC. As interpretações apresentadas devem ser validadas antes de qualquer submissão ou operação regulada.

---

## Índice

1. [Sumário Executivo](#1-sumário-executivo)
2. [Escopos Regulatórios](#2-escopos-regulatórios)
3. [Normas Aplicáveis](#3-normas-aplicáveis)
4. [Matriz Normativa Consolidada](#4-matriz-normativa-consolidada)
5. [Gap Analysis do AirTrust](#5-gap-analysis-do-airtrust)
6. [AirTrust Regulated Records Core](#6-airtrust-regulated-records-core)
7. [Requisitos do DB Digital/eDB no Tablet](#7-requisitos-do-db-digitaledb-no-tablet)
8. [Requisitos do SDRMe/Manutenção](#8-requisitos-do-sdrmemanuten%C3%A7%C3%A3o)
9. [Requisitos de Controle de Voos e FRMS](#9-requisitos-de-controle-de-voos-e-frms)
10. [Artefatos para Submissão/Aceitação ANAC](#10-artefatos-para-submiss%C3%A3oaceit%C3%A7%C3%A3o-anac)
11. [Roadmap Regulatório e Técnico](#11-roadmap-regulatório-e-técnico)
12. [Backlog em Epics](#12-backlog-em-epics)
13. [Riscos Críticos](#13-riscos-críticos)
14. [Perguntas Pendentes para Consultor Regulatório/ANAC](#14-perguntas-pendentes-para-consultor-regulatórioanac)
15. [Conclusão e Recomendação](#15-conclusão-e-recomendação)

---

## 1. Sumário Executivo

### 1.1 Objetivo da frente regulatória

O AirTrust está construindo módulos que tocam diretamente registros obrigatórios da aviação civil brasileira: o Diário de Bordo (DB/eDB), os registros de manutenção (SDRMe/OS), e o Controle de Voos/OCC com integração ao FRMS. Esses módulos, quando usados para substituir ou complementar registros em papel, passam a ser "sistemas informatizados de registros regulados" no sentido da Resolução ANAC nº 458/2017 e das normas específicas de cada domínio.

O objetivo desta frente regulatória é:
- Mapear quais normas se aplicam a cada módulo;
- Identificar as lacunas atuais entre o estado do sistema e o que é exigido;
- Propor uma arquitetura de conformidade (Regulated Records Core) que deve ser construída **antes** de operar qualquer registro digital como substituto oficial do papel;
- Produzir os artefatos necessários para que cada operador/OMA possa solicitar autorização de uso à ANAC.

### 1.2 Por que não dizer que o AirTrust está "homologado"

A ANAC **não homologa genericamente** um software como produto. Não existe um certificado do tipo "software AirTrust homologado pela ANAC" que o produto possa exibir ou que habilitaria automaticamente qualquer operador a substituir o papel.

O que existe na prática:
- A ANAC aceita sistemas informatizados que atendam às exigências da Resolução 458 e das normas específicas;
- Cada **operador** (RBAC 135) ou **OMA** (RBAC 145) deve solicitar autorização de uso do sistema digital ao seu **POI** (Principal Operations Inspector) ou inspetor responsável, geralmente via alteração de MGO/MGM/MOM e, quando aplicável, via EO (Engineering Order) ou LOA;
- O sistema deve ser capaz de **demonstrar conformidade** durante a fiscalização, não apenas afirmar que a tem.

Usar o termo "homologado pela ANAC" antes da autorização formal por operador constitui informação enganosa e pode gerar consequências legais.

### 1.3 Diferença entre ateste, autorização de uso e homologação informal

| Conceito | O que significa | Quem faz | Quando ocorre |
|---|---|---|---|
| **Ateste/aceitação do sistema** | O sistema demonstra ao inspetor que atende aos requisitos técnicos da Resolução 458 e das normas específicas | AirTrust + consultor regulatório | Antes de qualquer operação regulada |
| **Autorização de uso por operador** | O POI do operador aceita o uso do sistema para aquele escopo específico (eDB daquela frota, SDRMe daquela OMA etc.) | Operador + ANAC (POI/SAR) | Por aeronave, frota, operação ou escopo definido |
| **"Homologação" informal** | Termo impreciso frequentemente usado no mercado; não existe formalmente como ato administrativo genérico da ANAC | — | Não deve ser usado |

### 1.4 Por que DB Digital, SDRMe e Controle de Voos precisam de uma camada regulada comum

Os três escopos compartilham requisitos que a Resolução 458 impõe horizontalmente a qualquer sistema informatizado de registro regulado:
- Integridade (hash, imutabilidade);
- Autenticidade (assinatura com validade jurídica);
- Disponibilidade (para o regulado e para a fiscalização);
- Rastreabilidade (audit log, quem fez o quê e quando);
- Recuperabilidade (backup testado, exportação fiscalizatória);
- Correção sem apagamento (addendum imutável).

Construir esses mecanismos separadamente em cada módulo resultaria em duplicação, inconsistência e maior risco de não conformidade. A solução correta é uma camada compartilhada — o **Regulated Records Core** — que todos os módulos regulados usam.

---

## 2. Escopos Regulatórios

| Escopo | Finalidade | Registros oficiais envolvidos | Normas aplicáveis | Quem usa | Impacto operacional | Risco regulatório | Prioridade |
|---|---|---|---|---|---|---|---|
| **DB Digital / eDB** | Substituir o Diário de Bordo em papel por registro eletrônico em tablet/PED | DB, caderneta de bordo, registro de irregularidades mecânicas | Res. 458, Res. 773/2025, Portaria 3.220, RBAC 135, IS 135-002F, IS 91-015B | Pilotos (PIC/SIC), operadores, fiscalização ANAC | Alto — toca o registro central de cada voo; sem DB válido a aeronave não pode operar | Muito alto — operação inválida, AOC em risco | 1ª prioridade |
| **SDRMe / Manutenção digital** | Substituir OS e registros de manutenção em papel por registro eletrônico com assinatura | OS, task cards, RAS, cadernetas de componentes, AD/SB | Res. 458, IS 43.9-004, RBAC 43, RBAC 135, RBAC 145 | Mecânicos, inspetores, aprovadores, OMA | Alto — toca a aeronavegabilidade; aeronave sem RAS válida não pode voar | Muito alto — voo com aeronave não apta; risco de segurança | 2ª prioridade |
| **Controle de Voos / OCC / RDV** | Centralizar programação, despacho, execução (RDV) e relatórios operacionais | RDV, programação de voos, localização de voo, POB | Res. 458, RBAC 135, IS 135-002F | OCC, despachantes, gerência operacional, fiscalização | Alto — source of truth da operação diária | Alto — ausência de fonte única gera divergência de dados regulatórios | 3ª prioridade |
| **FRMS / Jornada** | Controle de fadiga e jornada regulatória integrado ao planejamento e à execução | Jornadas, repouso, GRF/SGRF | Res. 458, RBAC 117, IS 117 | Pilotos, OCC, RH, gerência de operações | Alto — jornada ilegal é infração grave com risco de acidente | Alto — tripulante em risco de fadiga sem bloqueio sistêmico | 2ª prioridade (junto com SDRMe) |
| **Integração Controle de Voos → MRO** | Alimentar automaticamente o controle de manutenção com horas, ciclos e pousos do RDV | Horas totais, ciclos, pousos por aeronave | RBAC 43, RBAC 135 | MRO, manutenção, engenharia | Médio-alto — manutenção baseada em dados corretos de utilização | Alto — manutenção vencendo sem detecção por dados desatualizados | Fase 5 (depende de Controle de Voos + MRO) |
| **SGSO / Ocorrências** | Registro de ocorrências de segurança operacional integrado ao ciclo operacional | Relatórios de ocorrência, RELPREV, notificações ANAC | Res. 458, RBAC 91, RBAC 135, IS de SGSO | Pilotos, gerência de segurança, ANAC | Médio — complementa os demais módulos | Médio — ausência de rastreabilidade de ocorrências | Fase 5 |

---

## 3. Normas Aplicáveis

> **Nota:** As interpretações a seguir são análises internas. Itens marcados com ⚠️ **VALIDAR COM CONSULTOR** devem ser confirmados com especialista regulatório antes de qualquer ação.

### 3.1 Resolução ANAC nº 458/2017

**Escopo:** Regulamenta o uso de sistemas informatizados por regulados da ANAC para armazenamento e gerenciamento de registros obrigatórios.

**Aplicação no AirTrust:** É a norma horizontal que se aplica a qualquer módulo que substitua ou complemente registros obrigatórios em papel. Toda a arquitetura do Regulated Records Core deve ser desenhada para atender a esta resolução.

**Requisitos principais:**
- Autenticidade e integridade dos registros;
- Assinatura eletrônica com validade jurídica (podendo exigir certificado ICP-Brasil ou equivalente aceito);
- Criptografia assimétrica;
- Hash de cada registro;
- Trilha de auditoria (audit log) completa e imutável;
- Backup regular com capacidade de restauração verificada;
- Preservação pelo período exigido por norma específica;
- Disponibilidade para fiscalização a qualquer momento;
- Exportação em formato aceitável;
- Correções sem apagamento do histórico (addendum);
- Política de correções com rastreabilidade.

**Lacunas prováveis no AirTrust atual:**
- Não existe módulo de assinatura eletrônica;
- Hash de registros não implementado;
- Audit log v2 está no schema mas não ativado para registros regulados;
- Exportação fiscalizatória não existe;
- Modo de acesso para fiscal não existe;
- Política de retenção por tipo de registro não documentada.

**Evidências necessárias:**
- Documento de Política de Segurança da Informação;
- Documento de Política de Assinatura Eletrônica;
- Documento de Política de Backup e Restauração com evidência de drill;
- Política de Retenção de Registros por tipo;
- Demonstração funcional de audit log, exportação e modo fiscalização.

⚠️ **VALIDAR COM CONSULTOR:** quais tipos de assinatura são aceitos pela ANAC para eDB e SDRMe — ICP-Brasil obrigatório ou Gov.br é aceito? Assinatura simples com CANAC é suficiente para algum registro?

---

### 3.2 Resolução ANAC nº 773/2025

**Escopo:** Vigência a partir de 2026; consolida e atualiza regras sobre o Diário de Bordo eletrônico (eDB), substituindo e complementando normativos anteriores.

**Aplicação no AirTrust:** É a norma específica que define os requisitos do módulo DB Digital/eDB.

**Requisitos principais:**
- Todos os campos obrigatórios do DB físico devem estar presentes no eDB;
- Identificação inequívoca da aeronave (prefixo);
- Identificação de tripulação com código ANAC/CANAC;
- Registro por etapa de voo com horários completos (motor, decolagem, pouso, corte);
- Registro de pousos/ciclos, combustível, POB, carga, natureza;
- Assinatura digital do PIC e do operador por etapa ou por folha (a confirmar);
- Disponibilidade dos registros para fiscalização a bordo;
- Correções via addendum sem apagamento;
- Continuidade de operação em caso de falha do sistema.

**Lacunas prováveis:**
- Módulo eDB não existe ainda no AirTrust;
- Nenhum dos requisitos acima está implementado.

**Evidências necessárias:**
- Demonstração funcional do eDB com todos os campos;
- Evidência de assinatura digital do PIC;
- Evidência de funcionamento offline;
- Evidência de addendum;
- Evidência de disponibilidade para fiscalização a bordo.

⚠️ **VALIDAR COM CONSULTOR:** A Resolução 773/2025 já está em vigor? Existe portaria ou IS complementar? Qual o período mínimo de disponibilidade a bordo?

---

### 3.3 Portaria nº 3.220/SPO/SAR/2019 e alterações

**Escopo:** Define os requisitos de interface e campos do eDB conforme portaria vigente; referência para o layout e conteúdo do formulário digital.

**Aplicação no AirTrust:** Deve ser a referência primária para o design do formulário eDB — campo a campo.

**Requisitos principais:**
- Campos de abertura e encerramento de folha;
- Campos de identificação da aeronave, operador e tripulação;
- Campos de cada etapa de voo;
- Campos de ocorrências e discrepâncias.

**Lacunas prováveis:** Módulo eDB não existe; análise de conformidade campo a campo não foi realizada.

**Evidências necessárias:** Mapeamento campo a campo entre portaria e formulário eDB do AirTrust.

⚠️ **VALIDAR COM CONSULTOR:** Existe alteração posterior à Portaria 3.220/2019? A Resolução 773/2025 a substitui parcialmente?

---

### 3.4 IS 43.9-004 (revisão vigente)

**Escopo:** Instrução suplementar ao RBAC 43.9 — define requisitos de conteúdo e forma dos registros de manutenção.

**Aplicação no AirTrust:** Referência para o design do módulo SDRMe — especificamente o conteúdo mínimo de cada OS e registro de manutenção.

**Requisitos principais:**
- Descrição do trabalho realizado (o que foi feito, não apenas referência técnica);
- Referência técnica utilizada (manual, AD, SB, CMM);
- Data de conclusão do trabalho;
- Nome e número de licença do executor e do aprovador;
- Assinatura do executor e do aprovador;
- Aprovação para Retorno ao Serviço quando aplicável.

**Lacunas prováveis:** MRO existe em protótipo mas sem campos regulatórios obrigatórios completos, sem assinatura digital e sem RAS.

**Evidências necessárias:** Demonstração de OS com todos os campos da IS; exportação em PDF com campos legíveis; evidência de assinatura digital de executor e aprovador.

---

### 3.5 RBAC 43

**Escopo:** Regulamento de manutenção de aeronaves — define quem pode executar, inspecionar e aprovar manutenção, e quais registros são obrigatórios.

**Aplicação no AirTrust:** Define os requisitos de negócio do SDRMe — quem assina o quê, o que é obrigatório em cada OS.

**Requisitos principais (43.9, 43.10, 43.11, 43.12):**
- Registros de trabalho de manutenção (43.9);
- Registros de aprovação para retorno ao serviço (43.11);
- Registros de componentes de vida limitada (43.10);
- Transferência de registros (43.12).

**Lacunas prováveis:** Protótipo de MRO não cobre RBAC 43 de forma regulatória; life-limited parts, AD/SB e RAS não existem.

---

### 3.6 RBAC 135

**Escopo:** Regulamento para operadores de transporte aéreo regional e táxi aéreo — define requisitos de controle operacional, localização de voo, DB e registros.

**Aplicação no AirTrust:** É a norma do cliente (operador RBAC 135) que define o que deve ser registrado e controlado. Os módulos de Controle de Voos, DB Digital e SDRMe devem satisfazer os requisitos desta norma para os clientes que são operadores RBAC 135.

**Requisitos principais relevantes:**
- Controle operacional (121.533/135.x): programação, despacho, release;
- Localização de voo (flight following): posição de voos em rota;
- DB: obrigatoriedade de registro por etapa;
- Irregularidades mecânicas: registro e vínculo com manutenção;
- MGO deve contemplar uso de sistema digital.

**Lacunas prováveis:** Controle de Voos existe em protótipo; localização de voo não existe; vínculo DB → irregularidade → MRO não existe.

---

### 3.7 IS 135-002F

**Escopo:** Instrução suplementar ao RBAC 135 — detalha MGO, controle operacional, diário de bordo, abastecimento, procedimentos de jornada e irregularidades mecânicas.

**Aplicação no AirTrust:** Referência para o design detalhado dos campos e fluxos do Controle de Voos e do eDB, especialmente nos campos de irregularidades mecânicas e no fluxo de controle operacional.

**Requisitos principais:**
- Conteúdo do MGO relacionado ao uso de sistema digital;
- Procedimentos de jornada;
- Controle de abastecimento;
- Irregularidades mecânicas — campos e fluxo;
- Integração entre controle operacional e DB.

⚠️ **VALIDAR COM CONSULTOR:** IS 135-002F está em versão atual? Existe IS posterior que a substitui?

---

### 3.8 RBAC 117 e IS 117

**Escopo:** Regulamenta os limites de tempo de serviço e repouso para tripulantes de empresas aéreas; define requisitos para o programa de gerenciamento de riscos de fadiga (GRF/SGRF/FRMS).

**Aplicação no AirTrust:** É a norma que valida a engine de cálculo do FRMS e define os requisitos de integração entre jornada realizada e o controle de fadiga.

**Requisitos principais:**
- Limites de FDP (Flight Duty Period), FT (Flight Time) e repouso;
- GRF documentado e aprovado;
- FRMS como alternativa ao modelo prescritivo (quando aprovado);
- Registro de jornada realizada vs. planejada;
- Dados de jornada acessíveis para fiscalização.

**Lacunas prováveis:**
- FRMS do AirTrust calcula fadiga mas não tem GRF documentado;
- Jornada realizada não é capturada diretamente do RDV;
- Integração FRMS ↔ Controle de Voos não existe.

⚠️ **VALIDAR COM CONSULTOR:** O FRMS do AirTrust pode ser usado como sistema de suporte ao GRF sem aprovação formal do SGRF? Qual o processo de aprovação do FRMS pela ANAC?

---

### 3.9 RBAC 145 e IS relacionadas

**Escopo:** Regulamenta as Organizações de Manutenção Aeronáutica (OMA) — requisitos de aprovação, documentação, qualificação de pessoal e registros.

**Aplicação no AirTrust:** Quando o cliente é uma OMA (RBAC 145), o SDRMe deve atender também aos requisitos desta norma, especialmente rastreabilidade de qualificações e manutenção terceirizada.

**Requisitos principais:**
- Qualificação e treinamento de mecânicos e inspetores;
- Aprovação de fornecedores externos;
- Controle de qualidade;
- Rastreabilidade de componentes.

---

### 3.10 IS 91-015B

**Escopo:** Define os procedimentos para reconstituição de caderneta de voo em caso de perda ou destruição.

**Aplicação no AirTrust:** O sistema deve ser capaz de exportar o histórico completo de voos de um tripulante para fins de reconstituição da caderneta.

**Requisitos principais:** Exportação de histórico de voos por tripulante com todos os campos obrigatórios da caderneta.

---

### 3.11 MP 2.200-2/2001 / ICP-Brasil

**Escopo:** Medida Provisória que institui a Infraestrutura de Chaves Públicas Brasileira (ICP-Brasil) — base legal para certificados digitais com validade jurídica no Brasil.

**Aplicação no AirTrust:** Quando a assinatura eletrônica exige validade jurídica plena (eDB, SDRMe, RAS), pode ser necessário o uso de certificado ICP-Brasil (A1 ou A3) ou de equivalente aceito pela ANAC (ex: Gov.br, que usa ICP-Brasil como backbone).

**Requisitos principais:** Integração com autoridade certificadora ICP-Brasil ou equivalente aceito; política de aceite de assinatura documentada.

⚠️ **VALIDAR COM CONSULTOR:** A ANAC aceita assinatura Gov.br para eDB e SDRMe? É suficiente uma assinatura eletrônica simples com CANAC para algumas categorias de registro? Qual é a interpretação prática da Resolução 458 sobre isso?

---

## 4. Matriz Normativa Consolidada

> A matriz completa está disponível em formato CSV em `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv` (50 itens).
> Abaixo, versão resumida com os itens de maior prioridade.

| ID | Norma | Requisito | Módulo | Funcionalidade | Evidência ANAC | Status | Prioridade | Fase |
|---|---|---|---|---|---|---|---|---|
| REQ-001 | Res. 458 | Hash de integridade por registro | Records Core | Hash SHA-256 por registro regulado | Log de hashes auditável | Inexistente | Alta | F2 |
| REQ-002 | Res. 458 | Assinatura eletrônica com validade jurídica | Records Core | Módulo de assinatura + certificado | Política de assinatura + evidência | Inexistente | Alta | F2 |
| REQ-003 | Res. 458 | Criptografia em transporte e repouso | Infra | TLS 1.2+ + criptografia em repouso | Certificado SSL + política | Parcial | Alta | F1 |
| REQ-004 | Res. 458 | Trilha de auditoria imutável | Audit Log | Log append-only com userId + timestamp | Exportação de audit log | Protótipo | Alta | F2 |
| REQ-005 | Res. 458 | Backup regular com restauração verificada | Infra | Backup automático + drill documentado | Relatório de teste de restauração | Parcial | Alta | F1 |
| REQ-006 | Res. 458 | Retenção pelo período normatizado | Records Core | Política de retenção por tipo | Documento de política | Inexistente | Alta | F2 |
| REQ-007 | Res. 458 | Modo fiscalização | Records Core | Acesso read-only para fiscal com exportação | Manual do fiscal + evidência | Inexistente | Alta | F3 |
| REQ-008 | Res. 458 | Exportação em formato aceitável | Records Core | PDF/XML/CSV estruturado com metadados | Exportação validada com ANAC | Inexistente | Alta | F2 |
| REQ-009 | Res. 458 | Correções via addendum sem apagamento | Records Core | Addendum com original imutável | Evidência de fluxo de correção | Inexistente | Alta | F2 |
| REQ-011 | Res. 773 | eDB substitui DB em papel | DB Digital | Módulo eDB completo em tablet | eDB funcional + autorização | Inexistente | Alta | F3 |
| REQ-012 | Res. 773 | Identificação inequívoca de aeronave | DB Digital | Campo prefixo obrigatório | Validação técnica | Inexistente | Alta | F3 |
| REQ-013 | Res. 773 | Código ANAC/CANAC na tripulação | DB Digital | Campo CANAC obrigatório + vínculo funcionários | Validação CANAC presente | Parcial | Alta | F3 |
| REQ-014 | Res. 773 | Horários completos por etapa | DB Digital | Campos motor/decolagem/pouso/corte com validação | Evidência de validação | Inexistente | Alta | F3 |
| REQ-018 | Res. 773 | Assinatura PIC por etapa | DB Digital | Assinatura digital do PIC vinculada ao CANAC | Evidência de assinatura imutável | Inexistente | Alta | F3 |
| REQ-023 | RBAC 43 | OS com campos regulatórios completos | SDRMe | OS com todos os campos da IS 43.9-004 | OS exportável em PDF | Protótipo | Alta | F4 |
| REQ-024 | RBAC 43 | Aprovação para Retorno ao Serviço (RAS) | SDRMe | Campo RAS com assinatura de aprovador | RAS imutável após assinatura | Inexistente | Alta | F4 |
| REQ-027 | RBAC 43 | Task cards com check-step por executor | SDRMe | Task cards com execução e inspeção step-by-step | Evidência de controle step | Inexistente | Alta | F4 |
| REQ-029 | RBAC 43 | Life-limited parts com alerta de vencimento | MRO | Dashboard de vida limitada por aeronave | Dashboard + relatório | Inexistente | Alta | F4 |
| REQ-030 | RBAC 43 | Tracking de AD/SB por aeronave | MRO | Módulo AD/SB com status por aeronave | Relatório de conformidade | Inexistente | Alta | F4 |
| REQ-035 | RBAC 135 | Controle operacional com release formal | Controle de Voos | Programação + despacho + release digital | Evidência de release com assinatura | Protótipo | Alta | F3 |
| REQ-036 | RBAC 135 | Localização de voo | Controle de Voos | Flight following com posições e alertas | Evidência de tracking | Inexistente | Alta | F3 |
| REQ-037 | RBAC 135 | Irregularidades mecânicas com vínculo MRO | DB Digital / SDRMe | Discrepância no eDB → OS automática no MRO | Evidência do fluxo | Inexistente | Alta | F3 |
| REQ-039 | RBAC 117 | Jornada real vs. planejada | FRMS | Comparação jornada planejada × realizada | Relatório de conformidade | Parcial | Alta | F3 |
| REQ-040 | RBAC 117 | Alerta de fadiga integrado à programação | FRMS | Bloqueio/alerta antes de alocar tripulante em risco | Evidência de bloqueio | Parcial | Alta | F3 |
| REQ-043 | MP 2.200-2 | Certificado ICP-Brasil ou equivalente | Records Core | Integração com ICP-Brasil ou Gov.br | Política de assinatura + evidência | Inexistente | Alta | F2 |
| REQ-044 | Res. 458 | Funcionamento offline | DB Digital | PWA com cache local criptografado | Evidência de teste offline | Inexistente | Alta | F3 |
| REQ-048 | RBAC 135 | Vínculo voo → DB → discrepância → MRO → RAS | Todos | Fluxo end-to-end com IDs rastreáveis | Evidência end-to-end | Inexistente | Alta | F5 |
| REQ-049 | RBAC 135 | RDV alimenta MRO automaticamente | Controle de Voos / MRO | Integração automática de horas/ciclos/pousos | Evidência de atualização automática | Inexistente | Alta | F5 |

---

## 5. Gap Analysis do AirTrust

### 5.1 Funcionários

**O que existe:** Cadastro completo de tripulantes com nome, matrícula, designação, código CANAC, CPF, ASO, CMA, contatos.

**O que falta para uso regulado:**
- Vínculo do código CANAC com a assinatura eletrônica (o CANAC deve ser a identidade regulatória do assinante);
- Controle de vigência da licença como pré-condição para assinar qualquer registro regulado;
- Exportação do histórico do tripulante para reconstituição de caderneta (IS 91-015B).

**Dependências:** Records Core (assinatura vinculada ao CANAC).

**Risco:** Baixo isoladamente; alto quando integrado ao eDB e SDRMe sem esse vínculo.

**Prioridade:** Fase 2 (junto com Records Core).

---

### 5.2 Qualificações

**O que existe:** Histórico de qualificações por tripulante (tipos, validades, renovações, vencimentos), turmas, planejadas.

**O que falta para uso regulado:**
- Vínculo direto com o módulo de assinatura (não é possível assinar registro regulado com qualificação vencida);
- Exportação de qualificações em formato fiscalizatório;
- Vínculo com SDRMe (mecânico só pode executar tarefa se qualificação válida).

**Dependências:** Records Core, SDRMe.

**Risco:** Médio (não impede operação atual; impacta SDRMe quando regulado).

**Prioridade:** Fase 3 para vínculo com assinatura; Fase 4 para vínculo com SDRMe.

---

### 5.3 Escalas

**O que existe:** Escalas mensais com alocações de tripulantes, EVD (escala diária), integração com FRMS.

**O que falta para uso regulado:**
- Exportação de escala como documento oficial de programação;
- Vínculo formal com o release do voo (Controle de Voos);
- Registro imutável de quando a escala foi "fechada" (equivalente ao "fechar escala" do APUS).

**Dependências:** Controle de Voos, Records Core.

**Risco:** Médio.

**Prioridade:** Fase 3.

---

### 5.4 FRMS

**O que existe:** Engine de cálculo de fadiga, check-in diário, score de risco, histórico de jornadas importadas do Sigvoos, integração com escalas.

**O que falta para uso regulado:**
- GRF (Gerenciamento de Risco de Fadiga) documentado e aprovado pelo POI;
- Integração com jornada **realizada** (RDV do Controle de Voos) — hoje usa apenas dados do Sigvoos/planejado;
- Bloqueio sistêmico na alocação de tripulante com risco crítico de fadiga;
- Exportação de dados de jornada para fiscalização (RBAC 117);
- Conformidade com limites específicos do RBAC 117 (offshore, helicopter etc.).

**Dependências:** Controle de Voos (para jornada realizada), Records Core (para exportação).

**Risco:** Alto — o FRMS é uma ferramenta de segurança de voo; operar sem GRF documentado é não conformidade.

**Prioridade:** Alta — Fase 2 (GRF) e Fase 3 (integração RDV).

---

### 5.5 SGSO

**O que existe:** Módulo de segurança operacional com registro de ocorrências.

**O que falta para uso regulado:**
- Vínculo com eDB (ocorrência no voo → notificação automática no SGSO);
- Exportação de relatórios em formato RELPREV-compatível;
- Rastreabilidade de ações corretivas.

**Dependências:** DB Digital, Records Core.

**Risco:** Médio.

**Prioridade:** Fase 5.

---

### 5.6 LMS

**O que existe:** Módulo de cursos, catálogo, inscrições, setores.

**O que falta para uso regulado:**
- Certificado de conclusão de treinamento com validade para uso em SDRMe (qualificação de mecânico);
- Exportação de histórico de treinamentos para auditoria de pessoal;
- Integração com SDRMe (bloqueio de execução se treinamento vencido).

**Dependências:** SDRMe, Records Core.

**Risco:** Baixo isoladamente; médio quando SDRMe entrar em operação.

**Prioridade:** Fase 4.

---

### 5.7 MRO / Manutenção

**O que existe:** Protótipo de controle de manutenção com OS, rastreamento de componentes.

**O que falta para uso regulado:**
- Campos regulatórios obrigatórios na OS (referência técnica, número de licença, assinatura);
- RAS (Aprovação para Retorno ao Serviço) com assinatura imutável;
- Task cards com execução step-by-step;
- Life-limited parts com alertas;
- Tracking de AD/SB;
- Calibração de ferramentas;
- Manutenção terceirizada rastreável;
- Transferência de registros;
- Integração com Controle de Voos (horas/ciclos/pousos automáticos).

**Dependências:** Records Core, Controle de Voos, LMS (qualificações), Funcionários (CANAC/licença).

**Risco:** Muito alto — aeronave pode voar com manutenção não documentada ou sem RAS válida.

**Prioridade:** Alta — Fase 4 (após Records Core e DB Digital MVP).

---

### 5.8 Controle de Voos

**O que existe:** Protótipo navegável com dashboard OCC, programação de voos, tripulação, RDV básico, indisponibilidade, hangaragem.

**O que falta para uso regulado:**
- Localização de voo (flight following) em tempo real;
- Release formal do voo com assinatura digital do PIC e do despachante;
- RDV completo com todos os campos regulatórios;
- Vínculo com eDB (RDV pré-preenche o eDB para assinatura do PIC);
- Vínculo com irregularidades mecânicas → OS no MRO;
- Envio automático de horas/ciclos/pousos ao MRO;
- Integração com FRMS em tempo real;
- Modo fechamento de escala com auditoria.

**Dependências:** Records Core, DB Digital, MRO, FRMS.

**Risco:** Alto — sem Controle de Voos regulado, a operação continua dependente de sistemas externos (APUS, Sigvoos).

**Prioridade:** Alta — Fase 3 (após Records Core).

---

### 5.9 DB Digital / eDB (futuro)

**O que existe:** Não existe. O AirTrust registra eventos de voo nas escalas (EVD) e no Controle de Voos (protótipo) mas não tem módulo de DB Digital.

**O que falta:** Tudo — ver seção 7 para requisitos completos.

**Prioridade:** Máxima — é o registro mais crítico da operação.

---

### 5.10 Records Core Regulado (futuro)

**O que existe:** Não existe como camada. Há fragmentos (audit log v2 em schema, TLS em produção, backup manual) mas nenhuma camada unificada.

**O que falta:** Tudo — ver seção 6.

**Prioridade:** Máxima — deve ser construído antes de qualquer módulo regulado entrar em operação.

---

## 6. AirTrust Regulated Records Core

### 6.1 Por que esta camada deve existir antes de tudo

Cada registro regulado (DB, OS, RAS, RDV) compartilha as mesmas necessidades de conformidade que a Resolução 458 impõe horizontalmente. Construir essas funcionalidades dentro de cada módulo separadamente resultaria em:
- Duplicação de código e risco de inconsistência entre módulos;
- Diferentes interpretações de "imutabilidade" em diferentes partes do sistema;
- Audit logs fragmentados impossíveis de cruzar;
- Exportação fiscalizatória impossível de padronizar;
- Risco de um módulo atender à Resolução 458 e outro não.

A solução é uma camada de serviço compartilhada que todos os módulos regulados chamam para criar, assinar, auditar e exportar registros.

### 6.2 Componentes do Records Core

#### 6.2.1 Registro imutável (Record Seal)

Cada registro regulado — ao ser criado ou finalizado — passa pelo Record Seal, que:
1. Calcula o hash do conteúdo do registro (SHA-256 ou SHA-3);
2. Grava o hash no banco com timestamp, userId e tipo de registro;
3. Marca o registro como `sealed` — após selado, nenhum campo pode ser alterado diretamente;
4. Qualquer modificação posterior é tratada como addendum (ver abaixo).

#### 6.2.2 Assinatura eletrônica

Módulo de assinatura com:
- Integração com ICP-Brasil (A1/A3) ou Gov.br (a confirmar com consultor);
- Fluxo de assinatura por papel (PIC assina como piloto; aprovador assina como inspetor);
- Cada assinatura grava: userId, CANAC/número de licença, timestamp, hash do documento assinado, tipo de assinatura;
- Após assinatura do último signatário obrigatório, o registro é selado automaticamente.

#### 6.2.3 Addendum (correção sem apagamento)

Quando um registro selado precisa ser corrigido:
1. O usuário abre um addendum vinculado ao registro original;
2. O addendum contém: referência ao registro original (ID + hash), campo(s) corrigido(s), valor anterior, valor novo, motivo da correção, userId, timestamp;
3. O addendum passa pelo Record Seal e pela assinatura do responsável;
4. O registro original permanece inalterado no banco; o addendum é o registro oficial da correção;
5. Na exportação e visualização, o addendum é apresentado sobreposto ao original com indicação clara.

#### 6.2.4 Audit Log imutável

Append-only log de todos os eventos sobre registros regulados:
- Criação, leitura, edição, tentativa de edição bloqueada, addendum, assinatura, exportação, acesso de fiscal;
- Campos: eventId, entityType, entityId, userId, userRole, action, timestamp, ipAddress, changes (diff), hash do estado anterior e posterior;
- Implementado como tabela append-only com restrição de DELETE e UPDATE negadas via RLS ou equivalente;
- Exportável em CSV/JSON com assinatura de integridade do lote.

#### 6.2.5 Exportação fiscalizatória

Interface e API de exportação que:
- Permite selecionar escopo (aeronave, tripulante, período, tipo de registro);
- Gera PDF estruturado com cabeçalho de identificação do sistema, metadados de integridade e hash de cada registro;
- Gera ZIP com JSONs estruturados + manifesto de integridade;
- Registra a exportação no audit log (quem exportou, o quê, quando);
- Funciona no modo fiscalização (ver abaixo).

#### 6.2.6 Modo fiscalização

Perfil especial de acesso:
- Read-only: nenhum dado pode ser alterado durante sessão de fiscalização;
- Acesso a registros pelo número de aeronave, tripulante ou período;
- Sem acesso a dados pessoais de outros tripulantes além do escopo da fiscalização;
- Geração de exportação com botão único;
- Log de toda a sessão de fiscalização no audit log.

#### 6.2.7 Política de retenção

Tabela de retenção por tipo de registro:
- DB/eDB: mínimo de 5 anos (a confirmar com norma específica);
- Registros de manutenção: conforme RBAC 43 (geralmente vida da aeronave + X anos);
- Jornada/FRMS: conforme RBAC 117;
- Após o prazo, o registro passa para `archived` (nunca deletado enquanto existir norma ativa).

#### 6.2.8 Backup e restauração

- Backup automático diário da D1 (Cloudflare D1 tem backup gerenciado; verificar SLA);
- Drill de restauração documentado: procedimento passo a passo + evidência de execução bem-sucedida;
- RTO e RPO documentados;
- Cópia de segurança de registros críticos em R2 com versionamento.

#### 6.2.9 Controle de dispositivos

- Registro de cada dispositivo (tablet/PED) autorizado a acessar registros regulados;
- Código de dispositivo, número de série, usuário responsável, data de autorização;
- Revogação de dispositivo com propagação imediata (próxima sincronização).

#### 6.2.10 Evidências para ANAC

O Records Core deve ser capaz de produzir, sob demanda:
1. Relatório de conformidade com a Resolução 458 (tabela de requisitos × evidências);
2. Exportação de audit log de qualquer período;
3. Exportação de todos os registros de qualquer aeronave ou tripulante;
4. Demonstração de addendum (registro original intacto + correção vinculada);
5. Demonstração de hash (validação de integridade);
6. Demonstração de modo fiscalização.

---

## 7. Requisitos do DB Digital/eDB no Tablet

### 7.1 Plataforma

- **PWA (Progressive Web App)** instalável em tablet Android ou iPad;
- Funcionamento offline completo (abertura do DB, lançamento de etapas, assinatura) sem conexão;
- Cache local criptografado (AES-256 ou equivalente) para registros não sincronizados;
- Sincronização automática ao reconectar com detecção e resolução de conflito;
- Suporte a modo avião (dispositivo sem rádio ativo).

### 7.2 Campos obrigatórios por abertura de DB

- Identificação do operador;
- Prefixo da aeronave (vinculado ao cadastro; não editável livremente);
- Data de abertura;
- Número sequencial do DB;
- Aviso de discrepâncias pendentes da última folha.

### 7.3 Campos obrigatórios por etapa de voo

- Data;
- Origem (ICAO/IATA);
- Destino (ICAO/IATA);
- Tipo/natureza do voo;
- PIC (nome + CANAC);
- SIC (nome + CANAC, quando aplicável);
- Demais tripulantes;
- Horário de partida de motores (HH:MM UTC e/ou Local);
- Horário de decolagem;
- Horário de pouso;
- Horário de corte de motores;
- Pousos (número);
- Ciclos (número, quando aplicável);
- Combustível abastecido (litros ou kg);
- Combustível consumido;
- POB (pessoas a bordo);
- Carga transportada (kg, quando aplicável);
- Código de voo / número do voo;
- Ocorrências (texto livre + classificação);
- Discrepâncias técnicas (texto livre + vínculo com sistema de manutenção).

### 7.4 Assinatura e encerramento

- Assinatura digital do PIC (vinculada ao CANAC) após lançamento de cada etapa ou ao encerrar a folha (a definir com consultor);
- Assinatura do operador ou pessoa designada;
- Encerramento da folha com hash e carimbo de tempo;
- Impossibilidade de editar campos após assinatura — apenas addendum.

### 7.5 Correções por addendum

- O PIC pode abrir addendum em etapa já assinada;
- O addendum exige: motivo, campo corrigido, valor correto;
- O addendum é assinado pelo PIC;
- O registro original permanece visível com indicação de que há addendum vinculado.

### 7.6 Modo fiscalização no tablet

- Acesso read-only ao histórico da aeronave;
- Exportação emergencial de PDF com as últimas N folhas;
- Sem necessidade de internet para acesso ao cache local.

### 7.7 Contingência em falha do dispositivo

- Procedimento documentado no MGO: qual tablet reserva usar, como transferir o DB em andamento, como reportar a falha;
- O sistema deve permitir migração de DB para outro dispositivo com o mesmo número sequencial;
- Falha total: retorno ao DB em papel com procedimento documentado e posterior digitalização no sistema.

### 7.8 Reconstituição

- Exportação de histórico completo de voos por aeronave e por tripulante;
- Formato compatível com reconstituição de caderneta (IS 91-015B);
- Geração de PDF com layout equivalente ao DB em papel.

### 7.9 Treinamento de pilotos

- Manual do Piloto para uso do eDB;
- Treinamento documentado (LMS do AirTrust);
- Certificado de conclusão antes de autorizar uso do eDB;
- Registro de treinamento acessível para fiscalização.

### 7.10 Política de dados disponíveis a bordo

⚠️ **VALIDAR COM CONSULTOR:** Quantas folhas ou quantos dias de registros devem estar disponíveis a bordo (no cache do tablet)? A norma vigente define um período mínimo?

---

## 8. Requisitos do SDRMe/Manutenção

### 8.1 Ordem de Serviço (OS)

Campos obrigatórios conforme IS 43.9-004 e RBAC 43:
- Número da OS (sequencial por aeronave);
- Prefixo da aeronave;
- Descrição do trabalho realizado (texto narrativo, não apenas referência técnica);
- Referência técnica (Manual de Manutenção, AD, SB, CMM, número e revisão);
- Data de abertura e data de conclusão;
- Nome, número de licença ANAC e assinatura do executor;
- Nome, número de licença ANAC e assinatura do inspetor (quando aplicável);
- Aprovação para Retorno ao Serviço (RAS) com nome, licença e assinatura do aprovador;
- Condição de liberação (aeronave apta ao voo, com restrições, ou retida);
- Horas totais e ciclos da aeronave no momento da OS.

### 8.2 Task Cards

- Cada OS pode ter N task cards;
- Cada task card tem: número de passo, descrição, referência técnica específica, campo de check de execução (executor), campo de check de inspeção (inspetor);
- A OS não pode ser fechada sem todos os task cards marcados como executados e inspecionados;
- Qualquer passo não aplicável deve ser marcado como N/A com justificativa.

### 8.3 Aprovação para Retorno ao Serviço (RAS)

- Campo separado e destacado na OS;
- Só pode ser assinado por aprovador com licença e habilitação válidas;
- Após assinatura do RAS, o status da aeronave no Controle de Voos é atualizado automaticamente para "Apta";
- RAS é imutável após assinatura — qualquer revisão requer nova OS ou addendum com nova RAS.

### 8.4 Cadernetas de componentes e vida limitada

- Cada componente rastreável cadastrado com: PN (Part Number), SN (Serial Number), descrição, aeronave onde está instalado, data de instalação, horas na instalação;
- Componentes de vida limitada com campos: vida útil (horas/ciclos/datas), horas/ciclos restantes calculados automaticamente, alerta a N% da vida útil;
- Histórico de remoção e instalação por aeronave.

### 8.5 AD (Airworthiness Directives) e SB (Service Bulletins)

- Cadastro de ADs e SBs aplicáveis a cada aeronave (por modelo);
- Status por aeronave: Aberta, Em cumprimento, Cumprida, N/A com justificativa;
- Data de vencimento para ADs mandatórias com alerta antecipado;
- Vínculo com OS onde o cumprimento foi documentado.

### 8.6 Calibração de ferramentas e equipamentos de teste

- Cadastro de ferramentas calibráveis com número de identificação, tipo, data de calibração e prazo de vencimento;
- Alerta antes do vencimento da calibração;
- Bloqueio de uso de ferramenta vencida na OS (ou alerta obrigatório).

### 8.7 Qualificação e treinamento de pessoal

- Cada executor/inspetor/aprovador deve ter suas qualificações e licenças cadastradas no módulo de Funcionários + LMS;
- O SDRMe deve verificar automaticamente a validade da licença antes de permitir assinatura;
- Mecânico com licença vencida não pode assinar como executor de tarefa que exija licença.

### 8.8 Manutenção terceirizada (OMA)

- Cadastro de OMAs terceirizadas com aprovação ANAC, escopo de serviços e validade da aprovação;
- OS terceirizada com campos de empresa executante, número de aprovação ANAC da OMA, responsável técnico da OMA;
- RAS emitida pela OMA deve ser registrada no SDRMe e vinculada à OS;
- Rastreabilidade de todos os trabalhos terceirizados por aeronave.

### 8.9 Transferência de registros

- Exportação completa do histórico de manutenção de uma aeronave em formato estruturado (JSON + PDF);
- Exportação por período ou por número de aeronave;
- Exportação inclui: todas as OS, componentes, AD/SB, calibrações, RAS;
- Formato compatível com importação em outros sistemas (a definir com consultor).

### 8.10 Auditoria e exportação

- Todas as ações no SDRMe geram eventos no audit log do Records Core;
- Exportação fiscalizatória disponível para qualquer aeronave ou período;
- Relatório de conformidade de AD por aeronave exportável em PDF.

---

## 9. Requisitos de Controle de Voos e FRMS

### 9.1 Programação de voos

- CRUD completo de voos: prefixo, origem, destino, horários planejados, natureza, tipo, aeronave designada;
- Validação automática: aeronave disponível (não indisponível ou em manutenção), tripulação com qualificações válidas, FRMS dentro dos limites;
- Histórico de alterações de programação com motivo e userId.

### 9.2 Localização de voo (flight following)

- Rastreamento de posição por posições reportadas (horário, posição, altitude, combustível);
- Alerta automático quando ausência de posição por mais de N minutos (threshold configurável);
- Dashboard OCC com status em tempo real de todos os voos do dia;
- Integração com sistemas de rastreamento externo quando disponível (ADS-B, ACARS — Fase 2).

### 9.3 RDV (Relatório Diário de Voo)

- Pré-preenchimento automático a partir da programação;
- Campos a serem preenchidos/confirmados pelo OCC após o voo: horários reais, pousos reais, combustível real, POB real, ocorrências;
- Após preenchimento, o RDV é enviado para assinatura do PIC no eDB;
- O RDV fecha o ciclo: atualiza os contadores de horas/ciclos da aeronave no MRO automaticamente;
- Exportação do RDV em PDF no formato ANAC.

### 9.4 Vínculo com eDB

- Ao fechar o RDV no OCC, o eDB é pré-preenchido com os dados do RDV;
- O PIC recebe notificação no tablet para revisar e assinar o eDB;
- Após assinatura do PIC, o registro é selado pelo Records Core;
- Discrepâncias registradas no eDB geram automaticamente uma OS preliminar no SDRMe.

### 9.5 Jornada planejada e realizada

- Jornada planejada: calculada a partir da programação de voos + escalas;
- Jornada realizada: calculada a partir dos horários reais do RDV;
- Comparação automática com alerta quando jornada realizada > planejada em X% ou excede limite do RBAC 117;
- Exportação de relatório de jornada por tripulante e período.

### 9.6 Integração com escalas

- Escala mensal/EVD deve ser a fonte de programação de tripulação do Controle de Voos;
- Alterações na escala refletem imediatamente na programação do OCC;
- Fechamento de escala diária pelo OCC gera registro imutável de quem foi escalado para cada voo.

### 9.7 Integração com FRMS

- Antes de confirmar a alocação de um tripulante a um voo, o Controle de Voos consulta o FRMS;
- Se o FRMS indica risco crítico de fadiga (score acima de threshold configurável), o sistema emite alerta obrigatório ou bloqueia a alocação (a definir por política do operador);
- Após fechar o RDV, as horas de voo reais são enviadas ao FRMS para atualização do histórico de fadiga.

### 9.8 Irregularidades mecânicas

- Tripulante pode registrar irregularidade mecânica diretamente no eDB durante o voo ou no debrief;
- A irregularidade é transmitida ao OCC e ao MRO automaticamente;
- O MRO gera uma OS preliminar vinculada à irregularidade;
- A aeronave pode ser marcada como "condicionalmente apta" (MEL) ou "indisponível" pelo MRO;
- O Controle de Voos reflete o status da aeronave em tempo real.

### 9.9 Ligação com SGSO

- Ocorrências registradas no eDB ou no Controle de Voos podem ser escaladas para o SGSO com um clique;
- O SGSO mantém o histórico de ocorrências e ações corretivas;
- Relatórios de SGSO podem ser exportados para RELPREV.

### 9.10 Envio de horas/ciclos/pousos ao MRO

- Ao fechar o RDV, as seguintes informações são enviadas automaticamente ao MRO:
  - Horas de voo da aeronave na perna;
  - Horas totais acumuladas (perna + histórico);
  - Ciclos/pousos da perna;
  - Ciclos/pousos totais acumulados;
- O MRO atualiza os contadores de manutenção e recalcula os prazos de próximas revisões;
- Alerta automático se alguma manutenção vencer nas próximas N horas/ciclos.

### 9.11 Relatórios regulatórios e gerenciais

- Relatório de voos realizados por período, aeronave, tripulante e natureza;
- Relatório de horas por aeronave (para ANAC e seguros);
- Relatório de jornada por tripulante (RBAC 117);
- Relatório de irregularidades mecânicas por aeronave;
- Relatório de indisponibilidade com causas e períodos;
- Todos os relatórios exportáveis em PDF e CSV.

---

## 10. Artefatos para Submissão/Aceitação ANAC

A seguir, a lista de artefatos que o AirTrust deve preparar para que um operador/OMA possa solicitar autorização de uso do sistema digital ao seu inspetor responsável (POI/SAR).

| # | Artefato | Descrição | Quem produz | Status |
|---|---|---|---|---|
| 01 | Matriz Normativa de Conformidade | Tabela de requisitos × evidências (este documento + CSV) | AirTrust + consultor | Em preparação |
| 02 | Relatório de Conformidade Resolução 458 | Documento declarando como cada requisito da Res. 458 é atendido | AirTrust + consultor | Pendente |
| 03 | Descrição de Arquitetura do Sistema | Diagrama e descrição da arquitetura técnica (frontend, backend, banco, cloud) | AirTrust | Parcial (docs existentes) |
| 04 | Política de Segurança da Informação | Documento formal de segurança: criptografia, controle de acesso, incidentes | AirTrust + CISO | Pendente |
| 05 | Política de Assinatura Eletrônica | Tipos de assinatura aceitos, processo de validação, equivalência ICP | AirTrust + consultor + ANAC | Pendente |
| 06 | Política de Backup e Restauração | Procedimento de backup, frequência, teste de restauração, evidências | AirTrust + Cloud | Parcial |
| 07 | Plano de Contingência | O que fazer se o sistema falhar: tablet reserva, retorno ao papel, restauração | AirTrust + operador | Pendente |
| 08 | Manual do Usuário — Piloto (eDB) | Guia completo de como usar o eDB no tablet, incluindo modo offline e contingência | AirTrust | Pendente |
| 09 | Manual do Usuário — OCC/Controle de Voos | Guia do módulo de Controle de Voos para o OCC | AirTrust | Pendente |
| 10 | Manual do Usuário — Manutenção (SDRMe) | Guia do SDRMe para mecânicos, inspetores e aprovadores | AirTrust | Pendente |
| 11 | Manual do Administrador | Guia de configuração, gestão de usuários, dispositivos, auditoria | AirTrust | Pendente |
| 12 | Evidências de Testes | Relatório de testes funcionais com casos de teste e resultados | AirTrust QA | Pendente |
| 13 | Evidências de Funcionamento Offline | Gravação ou screenshots de eDB funcionando sem internet | AirTrust | Pendente |
| 14 | Evidências de Hash/Audit Log/Assinatura | Demonstração técnica de integridade, audit log e assinatura | AirTrust | Pendente |
| 15 | Evidências de Exportação Fiscalizatória | Exemplo de exportação gerada pelo modo fiscalização | AirTrust | Pendente |
| 16 | Plano de Treinamento | Programa de treinamento de pilotos, mecânicos e OCC para uso do sistema | AirTrust + operador | Pendente |
| 17 | Plano de Transição Papel → Digital | Procedimento de migração de registros, período de operação paralela, data de descontinuação do papel | AirTrust + operador | Pendente |
| 18 | Alterações no MGO | Capítulo(s) do Manual Geral de Operações cobrindo uso de eDB e Controle de Voos digital | Operador + ANAC (POI) | Pendente |
| 19 | Alterações no MGM/MOM | Manual de Manutenção / Ops: capítulo de SDRMe digital | Operador + OMA + ANAC | Pendente |
| 20 | Escopo de Aeronaves | Lista de aeronaves autorizadas a usar o sistema digital (por prefixo) | Operador | Pendente |
| 21 | Escopo de Registros Substituídos | Declaração formal de quais registros em papel são substituídos pelo sistema | Operador + ANAC | Pendente |

---

## 11. Roadmap Regulatório e Técnico

### Fase 0 — Pesquisa normativa e validação com consultor (duração estimada: 4-6 semanas)

**Objetivo:** Fechar as lacunas de interpretação normativa antes de construir qualquer coisa.

**Entregáveis:**
- Contratação de consultor regulatório com experiência em Resolução 458, eDB e RBAC 43/135/117;
- Respostas às perguntas da seção 14;
- Versão validada desta matriz normativa;
- Decisão sobre tipo de assinatura (ICP-Brasil, Gov.br, CANAC simples por categoria);
- Decisão sobre escopo inicial (qual operador piloto, qual frota, quais registros).

**Dependências:** Nenhuma técnica; requer decisão de produto/negócio.

**Critérios de saída:** Todas as perguntas da seção 14 respondidas por escrito; matriz validada pelo consultor.

**Riscos:** Interpretação incorreta das normas sem consultor pode invalidar todo o trabalho posterior.

---

### Fase 1 — Matriz de conformidade e arquitetura regulada (duração: 2-3 semanas)

**Objetivo:** Documentar a arquitetura técnica do Records Core e produzir o design detalhado antes de implementar.

**Entregáveis:**
- Design técnico do Regulated Records Core (schema, APIs, fluxos);
- Política de Segurança da Informação (rascunho);
- Política de Assinatura Eletrônica (após Fase 0);
- Política de Backup e Restauração (formal);
- Política de Retenção de Registros.

**Dependências:** Fase 0 concluída.

**Critérios de saída:** Design aprovado por engenharia e consultor; políticas rascunhadas.

**Riscos:** Design sem validação jurídica pode exigir refatoração.

---

### Fase 2 — Regulated Records Core (duração: 6-8 semanas)

**Objetivo:** Implementar a camada de conformidade compartilhada.

**Entregáveis:**
- Record Seal (hash + imutabilidade);
- Módulo de assinatura eletrônica com integração ICP/Gov.br;
- Addendum (correção sem apagamento);
- Audit log imutável ativado para registros regulados;
- Exportação fiscalizatória;
- Modo fiscalização;
- Política de retenção implementada no banco.

**Dependências:** Fase 1 concluída; decisão de assinatura (Fase 0).

**Critérios de saída:** Todos os componentes com testes de conformidade aprovados; demonstração funcional de hash, addendum e exportação.

**Riscos:** Integração com ICP-Brasil/Gov.br pode ser complexa e cara; assinatura pode exigir hardware (A3).

---

### Fase 3 — DB Digital MVP em tablet (duração: 8-10 semanas)

**Objetivo:** Primeiro módulo regulado funcionando sobre o Records Core.

**Entregáveis:**
- PWA eDB instalável em tablet;
- Todos os campos obrigatórios da Res. 773/2025 e Portaria 3.220;
- Funcionamento offline com cache criptografado;
- Sincronização segura;
- Assinatura do PIC;
- Addendum;
- Modo fiscalização no tablet;
- Manual do Piloto;
- Plano de contingência para falha do dispositivo.

**Dependências:** Records Core (Fase 2); consultor validou campos.

**Critérios de saída:** Piloto interno com um operador real em modo de homologação interna; todos os campos validados campo a campo com a portaria.

**Riscos:** Offline em Cloudflare Workers pode exigir arquitetura de sync específica; assinatura offline pode ser complexa.

---

### Fase 4 — SDRMe MVP (duração: 8-10 semanas)

**Objetivo:** Manutenção digital regulada sobre o Records Core.

**Entregáveis:**
- OS com campos IS 43.9-004 completos;
- Task cards com check-step;
- RAS com assinatura do aprovador;
- Life-limited parts;
- AD/SB tracking;
- Calibração de ferramentas;
- Manutenção terceirizada;
- Manual de Manutenção.

**Dependências:** Records Core (Fase 2); LMS (qualificações de mecânicos).

**Critérios de saída:** OS de manutenção real executada e documentada no SDRMe; RAS assinada e aeronave retornando ao serviço com evidência digital.

**Riscos:** Resistência cultural dos mecânicos ao digital; validação campo a campo com IS 43.9-004 pode revelar campos não mapeados.

---

### Fase 5 — Integração Controle de Voos → DB → MRO → FRMS (duração: 6-8 semanas)

**Objetivo:** Fechar o ciclo operacional integrado.

**Entregáveis:**
- RDV do Controle de Voos pré-preenche eDB;
- Discrepância no eDB gera OS no MRO;
- RDV enviado ao FRMS;
- Horas/ciclos/pousos do RDV atualizam contadores do MRO;
- Status de aeronavegabilidade visível no OCC em tempo real.

**Dependências:** DB Digital (Fase 3) + SDRMe (Fase 4) + Controle de Voos regulado.

**Critérios de saída:** Fluxo end-to-end demonstrável: voo programado → RDV fechado → eDB assinado → discrepância → OS → RAS → aeronave apta.

---

### Fase 6 — Testes internos e piloto controlado (duração: 4-6 semanas)

**Objetivo:** Operação paralela (papel + digital) com um operador real para validação.

**Entregáveis:**
- Operação piloto com um operador voluntário;
- Período de operação paralela (papel e digital simultâneos);
- Registro de todos os bugs e gaps encontrados;
- Relatório de evidências do piloto;
- Treinamento documentado dos usuários piloto.

**Dependências:** Fases 3, 4 e 5.

**Critérios de saída:** Zero divergência crítica entre o registro digital e o papel; todos os campos presentes e corretos; audit log íntegro.

---

### Fase 7 — Pacote ANAC (duração: 4-6 semanas)

**Objetivo:** Preparar e submeter o pacote de documentação ao POI do operador piloto.

**Entregáveis:**
- Todos os artefatos da seção 10;
- Reunião de apresentação com POI;
- Resposta a perguntas e eventuais ajustes solicitados pelo inspetor;
- Autorização formal (EO, LOA ou aceite informal documentado).

**Dependências:** Fase 6 concluída; consultor regulatório ativo.

**Critérios de saída:** Autorização formal do operador piloto para uso do sistema digital.

---

### Fase 8 — Operação assistida (duração: 4-8 semanas)

**Objetivo:** Operação real com acompanhamento próximo da equipe AirTrust.

**Entregáveis:**
- Suporte dedicado ao operador piloto;
- SLA de disponibilidade documentado e monitorado;
- Plano de resposta a incidentes regulatórios;
- Relatório de operação assistida.

---

### Fase 9 — Descontinuação gradual do papel (condicionada à autorização)

**Objetivo:** Encerrar uso paralelo do papel para os escopos autorizados.

**Entregáveis:**
- Declaração formal do operador de descontinuação do papel;
- Atualização do MGO/MGM;
- Archiving dos registros em papel anteriores;
- Comunicado à tripulação e manutenção.

**Dependências:** Autorização formal da ANAC/POI; operação assistida sem incidentes.

---

## 12. Backlog em Epics

### Epic 1 — Regulated Records Core

**Objetivo:** Criar a camada compartilhada de registros regulados.

**Requisitos normativos:** Resolução 458 (todos os requisitos técnicos).

**Entregáveis:** Record Seal, Audit Log imutável, Política de Retenção implementada, Exportação fiscalizatória, Modo fiscalização.

**Critérios de aceite:**
- Impossível alterar um registro selado sem gerar addendum;
- Audit log não pode ser deletado ou alterado por nenhum papel;
- Exportação gera PDF com hash verificável;
- Modo fiscalização é read-only com evidência no audit log.

**Riscos:** Complexidade de implementar imutabilidade no Cloudflare D1 (SQLite sem RLS nativo robusto).

**Modelo recomendado para implementação:** Claude Sonnet 4.6 para arquitetura e implementação inicial; Claude Opus 4.8 para revisão crítica de segurança e edge cases de imutabilidade.

---

### Epic 2 — Assinatura, Hash e Addendum

**Objetivo:** Implementar os mecanismos de autenticidade e correção regulatória.

**Requisitos normativos:** Resolução 458 (assinatura, hash, addendum), MP 2.200-2 (ICP-Brasil).

**Entregáveis:** Integração com ICP-Brasil/Gov.br, módulo de assinatura por papel (PIC, aprovador), mecanismo de addendum, hash SHA-256 por registro.

**Critérios de aceite:**
- Assinatura com certificado ICP-Brasil ou Gov.br aceito pelo consultor;
- Addendum preserva registro original intacto;
- Hash é verificável externamente (OpenSSL ou equivalente).

**Riscos:** Integração com ICP/Gov.br pode ter dependências de terceiros e custo por assinatura.

**Modelo recomendado:** Claude Opus 4.8 para design do módulo de assinatura; Sonnet 4.6 para implementação.

---

### Epic 3 — Audit Log Imutável

**Objetivo:** Log append-only de todos os eventos sobre registros regulados.

**Requisitos normativos:** Resolução 458 (trilha de auditoria).

**Entregáveis:** Tabela append-only, eventos capturados (criar/ler/editar/assinar/exportar/acessar como fiscal), exportação de log, hash de lote.

**Critérios de aceite:**
- DELETE e UPDATE na tabela de audit log retornam erro para qualquer papel, incluindo admin;
- Exportação de log assinada (hash do lote);
- Evento gerado para cada ação regulada sem exceção.

**Riscos:** Performance de escrita do audit log em alto volume de eventos.

**Modelo recomendado:** Sonnet 4.6.

---

### Epic 4 — DB Digital Tablet/PED

**Objetivo:** Módulo eDB completo para pilotos em tablet.

**Requisitos normativos:** Resolução 773/2025, Portaria 3.220/2019, RBAC 135, IS 135-002F, IS 91-015B.

**Entregáveis:** PWA instalável, todos os campos obrigatórios, fluxo por etapa de voo, assinatura PIC, encerramento de folha, modo fiscalização no tablet.

**Critérios de aceite:**
- Todos os campos da Portaria 3.220 presentes (validação campo a campo);
- Impossível fechar etapa sem campos obrigatórios;
- Registro selado após assinatura do PIC.

**Riscos:** Layout regulatório pode ser complexo; validação campo a campo pode revelar campos não mapeados.

**Modelo recomendado:** Sonnet 4.6 para implementação; Opus 4.8 para revisão regulatória de campos.

---

### Epic 5 — Offline e Sincronização Segura

**Objetivo:** eDB funcionando completamente offline com sincronização segura.

**Requisitos normativos:** Resolução 458 (continuidade), Resolução 773/2025 (contingência).

**Entregáveis:** Cache local criptografado (IndexedDB com AES-256), sincronização com resolução de conflito, modo avião, reconexão automática.

**Critérios de aceite:**
- Abertura, lançamento de etapa e assinatura funcionam sem internet;
- Conflito de sincronização detectado e resolvido com log;
- Cache local não acessível sem autenticação no dispositivo.

**Riscos:** Sincronização de assinaturas digitais offline é tecnicamente complexa (timestamp pode ser manipulado no device).

**Modelo recomendado:** Claude Opus 4.8 para design de sincronização segura; Sonnet 4.6 para implementação.

---

### Epic 6 — SDRMe Manutenção

**Objetivo:** Registros de manutenção digitais regulados.

**Requisitos normativos:** IS 43.9-004, RBAC 43, RBAC 145.

**Entregáveis:** OS com campos completos, task cards, RAS, life-limited parts, AD/SB, calibração, manutenção terceirizada.

**Critérios de aceite:**
- OS conforme IS 43.9-004 campo a campo;
- RAS imutável após assinatura do aprovador;
- Aeronave com RAS pendente não pode ser liberada para voo no Controle de Voos.

**Modelo recomendado:** Sonnet 4.6.

---

### Epic 7 — Controle de Voos Regulado

**Objetivo:** Módulo de OCC com features regulatórias completas.

**Requisitos normativos:** RBAC 135, IS 135-002F, Resolução 458.

**Entregáveis:** Release formal de voo, localização de voo, RDV completo, irregularidades mecânicas, fechamento de escala com auditoria.

**Critérios de aceite:**
- Voo não pode ser liberado sem release digital do PIC e do despachante;
- RDV gera pré-preenchimento do eDB;
- Irregularidade mecânica gera OS preliminar no SDRMe.

**Modelo recomendado:** Sonnet 4.6.

---

### Epic 8 — Integração MRO

**Objetivo:** Ciclo fechado entre Controle de Voos e Manutenção.

**Requisitos normativos:** RBAC 43, RBAC 135.

**Entregáveis:** Horas/ciclos/pousos automáticos do RDV → MRO, status de aeronavegabilidade em tempo real no OCC, alerta de manutenção vencendo.

**Critérios de aceite:**
- Contadores de MRO atualizados automaticamente após fechamento de RDV;
- Alerta gerado antes de qualquer manutenção vencer por horas/ciclos;
- Aeronave indisponível por manutenção bloqueada no Controle de Voos.

**Modelo recomendado:** Sonnet 4.6.

---

### Epic 9 — Integração FRMS

**Objetivo:** FRMS integrado à programação e à jornada realizada.

**Requisitos normativos:** RBAC 117, IS 117.

**Entregáveis:** Consulta de FRMS antes de alocar tripulante, atualização de jornada realizada após RDV, alerta de fadiga na programação, relatório de jornada por tripulante.

**Critérios de aceite:**
- Alerta/bloqueio visível ao alocar tripulante com FRMS acima de threshold;
- Jornada realizada (RDV) refletida no FRMS em até N minutos após fechamento;
- Relatório de jornada exportável por período e tripulante.

**Modelo recomendado:** Sonnet 4.6; Opus 4.8 para revisão de conformidade RBAC 117.

---

### Epic 10 — Exportação Fiscalizatória

**Objetivo:** Interface completa de exportação para fiscalização da ANAC.

**Requisitos normativos:** Resolução 458 (disponibilidade para fiscalização, formato aceitável).

**Entregáveis:** Modo fiscalização com seletor de escopo, PDF estruturado com metadados e hash, ZIP com JSONs + manifesto, log da sessão de fiscalização.

**Critérios de aceite:**
- Exportação gerada em menos de 30 segundos para qualquer escopo;
- Hash do PDF verificável externamente;
- Sessão de fiscalização registrada no audit log.

**Modelo recomendado:** Sonnet 4.6.

---

### Epic 11 — Manuais e Evidências ANAC

**Objetivo:** Produzir todos os artefatos documentais exigidos para submissão.

**Requisitos normativos:** Resolução 458, Res. 773/2025, IS 43.9-004.

**Entregáveis:** Todos os artefatos da seção 10 (manuais, políticas, planos, evidências).

**Critérios de aceite:** Todos os 21 artefatos da tabela da seção 10 produzidos e validados pelo consultor.

**Modelo recomendado:** Claude Opus 4.8 para revisão regulatória dos manuais.

---

### Epic 12 — Testes de Conformidade

**Objetivo:** Suíte de testes que valida conformidade regulatória automaticamente.

**Requisitos normativos:** Resolução 458.

**Entregáveis:** Testes de imutabilidade (tentativas de alterar registros selados), testes de audit log (verificar que todo evento gera log), testes de offline (eDB sem internet), testes de hash (verificação de integridade), testes de addendum.

**Critérios de aceite:** 100% dos testes de conformidade passando em CI/CD antes de qualquer deploy.

**Modelo recomendado:** Sonnet 4.6 para implementação dos testes; Opus 4.8 para revisão de cobertura.

---

### Epic 13 — Migração/Transição Papel → Digital

**Objetivo:** Plano e ferramentas de migração de registros históricos e de operação paralela.

**Requisitos normativos:** Resolução 458, Res. 773/2025.

**Entregáveis:** Plano de transição documentado, ferramenta de importação de registros históricos (digitalizados), procedimento de operação paralela, procedimento de descontinuação do papel.

**Critérios de aceite:** Operador piloto consegue importar registros históricos críticos; operação paralela sem divergência durante período de transição.

**Modelo recomendado:** Sonnet 4.6.

---

## 13. Riscos Críticos

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R-01 | Usar o termo "homologado pela ANAC" antes de autorização formal | Alta | Muito alto (legal + reputacional) | Banir o termo internamente; usar "aceito" ou "autorizado para uso" apenas após autorização formal |
| R-02 | Operar eDB digital e papel sem definir qual é a fonte oficial | Alta | Muito alto | Definir data de descontinuação do papel no MGO antes de operar em digital |
| R-03 | Assinatura eletrônica sem validade jurídica adequada | Média | Alto | Validar com consultor qual assinatura é aceita pela ANAC; não operar com assinatura fraca |
| R-04 | Ausência de certificado ICP-Brasil quando exigido | Média | Alto | Validar em Fase 0 se ICP é obrigatório ou se Gov.br/CANAC é aceito para cada tipo de registro |
| R-05 | Modo offline inseguro (timestamp manipulável, cache não criptografado) | Média | Alto | Design de segurança do offline validado por especialista antes de implementar |
| R-06 | Perda de dados por falha do D1 sem backup testado | Baixa | Muito alto | Implementar drill de restauração documentado; verificar SLA do Cloudflare D1 |
| R-07 | Ausência de logs de acesso e auditoria | Alta | Alto | Records Core deve ser implementado antes de qualquer módulo regulado |
| R-08 | Correções apagando histórico (DELETE ou UPDATE direto) | Alta | Muito alto | Imutabilidade técnica no banco (triggers ou constraints) + revisão de código |
| R-09 | Ausência de modo fiscalização | Alta | Alto | Requisito não-negociável do Records Core |
| R-10 | Falta de treinamento documentado dos usuários | Média | Médio | Programa de treinamento via LMS com certificado antes de autorizar uso regulado |
| R-11 | MGO/MGM/MOM não atualizados antes de operar digitalmente | Alta | Muito alto | Alteração de MGO é pré-requisito da Fase 7; nenhum uso regulado sem MGO atualizado |
| R-12 | Escopo ANAC mal definido (qual aeronave, qual registro, qual operador) | Alta | Médio | Definir escopo específico em Fase 0 com consultor antes de qualquer implementação |
| R-13 | Manutenção terceirizada sem rastreabilidade no SDRMe | Média | Alto | Epic 6 inclui módulo de OMA terceirizada; não operar SDRMe sem esse módulo se houver terceirização |
| R-14 | Dependência de PDFs sem estrutura como único registro | Alta | Médio | PDFs devem sempre ter metadados de integridade; JSON estruturado deve ser o registro primário |
| R-15 | Conflito entre dados do eDB, Controle de Voos e MRO | Média | Alto | Fonte única de verdade: RDV do Controle de Voos é a fonte; eDB e MRO consomem do RDV |
| R-16 | Protótipos atuais (MRO, Controle de Voos) tratados como sistema regulado | Alta | Muito alto | Comunicação clara interna: protótipos NÃO SÃO sistemas regulados; Records Core vem primeiro |

---

## 14. Perguntas Pendentes para Consultor Regulatório/ANAC

As questões abaixo devem ser respondidas em Fase 0. Nenhum requisito técnico que dependa das respostas deve ser implementado antes de tê-las.

**Sobre escopo de ateste e autorização:**
1. O AirTrust precisa de algum processo de ateste formal como fornecedor de software junto à ANAC, ou apenas cada operador/OMA solicita autorização de uso ao seu POI?
2. Existe um processo de LOA ou EO aplicável ao software de registros regulados (eDB, SDRMe)?
3. Há uma orientação específica da SAR sobre como o processo de aceitação de eDB deve ser conduzido sob a Resolução 773/2025?

**Sobre eDB:**
4. A Resolução 773/2025 já está em vigor? Existe IS complementar ou ela ainda depende de portaria específica?
5. A Portaria 3.220/2019 foi revogada ou está vigente em paralelo?
6. A autorização de uso do eDB é por frota (modelo de aeronave) ou por prefixo individual?
7. Quantas folhas/dias de registros devem estar disponíveis no tablet para fiscalização?
8. É aceito o retorno ao DB em papel durante período de falha do dispositivo sem necessidade de notificação à ANAC?

**Sobre SDRMe:**
9. A autorização para uso do SDRMe é por OMA ou por operador (em caso de manutenção interna)?
10. A assinatura digital do mecânico e do aprovador na OS digital exige certificado ICP-Brasil ou Gov.br é aceito?
11. O RAS digital tem a mesma validade jurídica do RAS em papel se assinado com certificado ICP-Brasil?

**Sobre assinatura:**
12. A ANAC aceita assinatura Gov.br (que usa ICP-Brasil como backbone) para eDB e SDRMe?
13. Para alguns tipos de registro (menos críticos), a ANAC aceita assinatura eletrônica simples com CANAC e senha?
14. Existe precedente de operador/OMA usando assinatura digital não-ICP (ex: token próprio) aceita pela ANAC?

**Sobre offline:**
15. O eDB deve funcionar offline mandatoriamente ou apenas como contingência documentada?
16. Um timestamp offline (sem NTP) é aceito se sincronizado com o servidor ao reconectar com diferença documentada?

**Sobre FRMS:**
17. O FRMS do AirTrust (baseado em cálculo de score de fadiga) pode ser usado como sistema de suporte ao GRF sem aprovação formal como SGRF?
18. Qual o processo de aprovação de um FRMS pela ANAC?

**Sobre transição:**
19. É necessário período mínimo de operação paralela (papel + digital) antes de descontinuar o papel?
20. Registros históricos em papel precisam ser digitalizados e importados para o sistema, ou o digital vale a partir da data de autorização?

**Sobre manutenção terceirizada:**
21. Quando a manutenção é feita por uma OMA terceirizada aprovada, o SDRMe do operador precisa replicar os registros da OMA ou apenas manter referência à documentação dela?

---

## 15. Conclusão e Recomendação

### 15.1 Situação atual

O AirTrust possui módulos operacionais valiosos (Funcionários, Qualificações, Escalas, FRMS, MRO protótipo, Controle de Voos protótipo) e uma base técnica sólida (Cloudflare Workers, D1, React 19). No entanto, **nenhum desses módulos atende hoje aos requisitos da Resolução 458/2017 para uso como sistema de registros regulados**.

Operar o eDB, o SDRMe ou o Controle de Voos como substitutos oficiais dos registros em papel, sem a camada de conformidade descrita neste documento, expõe o operador a:
- Registros sem validade jurídica;
- Impossibilidade de defesa em fiscalização ou acidente;
- Eventual autuação ou suspensão de AOC.

### 15.2 Recomendações imediatas

1. **Não chamar nenhum módulo atual de "sistema regulado" ou "homologado"**. Protótipos são protótipos.

2. **Contratar consultor regulatório em Fase 0** antes de qualquer implementação orientada à conformidade. O custo de um consultor é insignificante comparado ao custo de construir a coisa errada.

3. **Construir o Regulated Records Core primeiro (Fase 2)**. Sem ele, todos os módulos regulados são inválidos. É o investimento de infraestrutura mais importante desta frente.

4. **Validar a matriz de conformidade com o consultor** e fechar as 14 perguntas da seção 14 antes de implementar qualquer Epic.

5. **Definir o operador piloto** — idealmente um cliente do AirTrust disposto a ser o primeiro a submeter o processo ao POI, em frota pequena e controlada.

6. **Construir o DB Digital/eDB como o primeiro módulo regulado (Fase 3)**, pois é o registro mais crítico e o que mais diretamente impacta a operação diária.

7. **Não apressar o SDRMe para antes do DB Digital**. Operações de manutenção com registro incorreto ou inválido têm risco de segurança de voo — é preferível começar com o eDB e acumular experiência regulatória antes.

### 15.3 Modelo recomendado para fases técnicas

| Fase | Tarefa | Modelo recomendado |
|---|---|---|
| F0 | Pesquisa normativa, perguntas ao consultor | Claude Opus 4.8 (raciocínio profundo sobre regulatório) |
| F1 | Design de arquitetura do Records Core | Claude Opus 4.8 (design crítico) |
| F2 | Implementação do Records Core | Claude Sonnet 4.6 (velocidade + qualidade) |
| F3 | Implementação do DB Digital/eDB | Claude Sonnet 4.6 |
| F3 | Revisão de segurança do offline + assinatura | Claude Opus 4.8 |
| F4 | Implementação do SDRMe | Claude Sonnet 4.6 |
| F4 | Revisão regulatória campo a campo IS 43.9-004 | Claude Opus 4.8 |
| F5 | Integração Controle de Voos → MRO → FRMS | Claude Sonnet 4.6 |
| F7 | Produção dos manuais e artefatos ANAC | Claude Opus 4.8 |
| F12 | Suíte de testes de conformidade | Claude Sonnet 4.6 |

> **Próximo prompt sugerido para Fase 0 (Claude Opus 4.8):**
>
> "Você está auxiliando a AirTrust na preparação regulatória para aceitação de sistema de registros digitais junto à ANAC. Leia o documento `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md` e a matriz `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`. Com base nas 21 perguntas da seção 14 do documento, crie um briefing detalhado para a reunião com o consultor regulatório, priorizando as questões que mais impactam a arquitetura técnica do sistema (assinatura, ICP-Brasil, offline, escopo de autorização). Não altere código. Não faça commits. Apenas produza o briefing em `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md`."

---

*Documento produzido por AirTrust Engineering — 2026-06-13*
*Versão: v1.0 — Rascunho interno para validação*
*Próxima revisão: Após Fase 0 (validação com consultor regulatório)*
