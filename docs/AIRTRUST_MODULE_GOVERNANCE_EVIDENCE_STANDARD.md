# AirTrust Module Governance & Evidence Standard
# Padrão AirTrust de Governança, Evidência e Registros por Módulo

> **Tipo:** padrão interno de produto e engenharia — somente documentação
> **Data:** 2026-06-14
> **Versão:** v1.0
> **Status:** proposta interna; não é orientação jurídica/regulatória; não submetido à ANAC
> **Escopo:** todos os módulos AirTrust, atuais e futuros
> **Restrição:** nenhuma alteração de código, banco, migrations, deploy, secrets ou produção.
>
> **Referências principais:**
> - `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`
> - `docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md`
> - `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md`
> - `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md`
> - `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`
> - `src/react-app/lib/modules.ts`

---

## Índice

1. [Sumário Executivo](#1-sumário-executivo)
2. [Níveis de Maturidade e Evidência (N0–N4)](#2-níveis-de-maturidade-e-evidência-n0n4)
3. [Matriz Inicial dos Módulos Atuais](#3-matriz-inicial-dos-módulos-atuais)
4. [Padrão de Banners e Labels](#4-padrão-de-banners-e-labels)
5. [Padrão de Ações e Botões](#5-padrão-de-ações-e-botões)
6. [Padrão de Fonte Oficial dos Dados](#6-padrão-de-fonte-oficial-dos-dados)
7. [Padrão de Auditoria (A0–A3)](#7-padrão-de-auditoria-a0a3)
8. [Padrão de Exportação](#8-padrão-de-exportação)
9. [Padrão de Dados Mockados, Reais e Regulados](#9-padrão-de-dados-mockados-reais-e-regulados)
10. [Relação com Regulated Records Core](#10-relação-com-regulated-records-core)
11. [Processo de Promoção de Nível](#11-processo-de-promoção-de-nível)
12. [Checklist de Classificação de Módulo](#12-checklist-de-classificação-de-módulo)
13. [Requisitos para Configuração no Sistema (Proposta Futura)](#13-requisitos-para-configuração-no-sistema-proposta-futura)
14. [Roadmap de Implementação](#14-roadmap-de-implementação)
15. [Riscos de Não Adotar o Padrão](#15-riscos-de-não-adotar-o-padrão)
16. [Próxima Etapa Recomendada](#16-próxima-etapa-recomendada)

---

## 1. Sumário Executivo

### 1.1 Por que este padrão existe

O AirTrust cresceu rapidamente: em dois anos passou de um MVP de gestão de tripulação para uma plataforma com FRMS operacional, LMS com cursos EAD, protótipos navegáveis de MRO e Controle de Voos, e ambições de DB Digital/eDB em tablet. Esse crescimento não foi acompanhado de uma distinção formal entre o que é **demonstrável**, o que é **operacional**, o que é **evidência oficial** e o que pode ser legalmente tratado como **registro regulado**.

Sem esse padrão, quatro confusões perigosas coexistem:

1. **Protótipos bonitos são confundidos com sistemas operacionais.** MRO e Controle de Voos têm UX navegável com dados mockados. Para um usuário ou cliente desinformado, parecem sistemas prontos. Para a ANAC, são demos.
2. **Sistemas operacionais são confundidos com sistemas regulados.** FRMS opera com dados reais de jornada, mas isso não o torna um sistema de registro regulatório — sem audit log imutável, sem assinatura, sem Records Core, ele é operacional interno.
3. **Sistemas regulados são confundidos com sistemas aceitos/autorizados pela ANAC.** Mesmo que o AirTrust implemente tudo que a Resolução 458 exige tecnicamente, **nenhum módulo pode ser declarado "aceito" ou "homologado" sem autorização formal do POI por operador e escopo**.
4. **Dados mockados são usados sem aviso claro.** Relatórios e exportações de módulos prototipados podem ser impressos ou compartilhados com terceiros sem que ninguém perceba que os dados são fictícios.

### 1.2 O que este padrão define

Este documento define cinco níveis de maturidade e evidência (N0–N4), as obrigações de cada nível, e a classificação atual e alvo de cada módulo do AirTrust. Ele também define padrões de banners, ações, fontes de dados, auditoria, exportação e o caminho de promoção entre níveis.

### 1.3 Hierarquia de conceitos

```
N0  Protótipo navegável (pode ter dados mockados, sem persistência regulada)
 │
N1  Operacional interno (persistência real, dados reais, sem evidência formal)
 │
N2  Evidência operacional (audit log forte, exportação rastreável, base probatória)
 │
N3  Registro regulado (Records Core, hash, assinatura, addendum imutável)
 │
N4  Registro crítico aceito/autorizado (ANAC: autorização por operador/escopo/POI)
```

**Regra fundamental:** a promoção entre níveis é unidirecional e exige critérios formais. Não existe "praticamente N3" ou "quase regulado". Um módulo ou é ou não é.

### 1.4 O que nenhum nível garante automaticamente

- **N3 não é N4.** Um sistema que implementa tecnicamente todos os requisitos da Resolução 458 ainda precisa de autorização formal do POI do operador. Nenhum módulo AirTrust é N4 hoje.
- **Operação em produção não eleva o nível.** FRMS sendo usado diariamente por tripulantes reais não o torna N2 nem N3 automaticamente — ele precisa atender aos critérios do nível antes de ser classificado nele.
- **Demonstração ou UX navegável não eleva o nível.** MRO com UX excelente continua N0 enquanto operar com dados mockados e sem persistência real no Records Core.

---

## 2. Níveis de Maturidade e Evidência (N0–N4)

### 2.1 Visão geral dos níveis

| Nível | Nome | Definição resumida |
|---|---|---|
| **N0** | Protótipo / Demonstração | Módulo navegável ou experimental, sem persistência regulada, podendo usar dados mockados. Não pode ser usado como fonte oficial. |
| **N1** | Operacional interno | Módulo com dados reais, persistência em produção, mas sem obrigações de evidência formal. Uso interno pela empresa. |
| **N2** | Evidência operacional | Módulo com audit log forte, exportação rastreável, capaz de ser usado como referência em processo interno ou due diligence. Não substitui registro regulado. |
| **N3** | Registro regulado | Módulo com Records Core, hash, assinatura, addendum, ledger append-only. Pode ser apresentado à ANAC como base técnica. Depende de autorização formal do POI para substituir papel. |
| **N4** | Registro crítico aceito/autorizado | N3 com autorização formal do POI do operador, por escopo, frota ou aeronave definida. Substitui o papel no escopo autorizado. |

---

### 2.2 N0 — Protótipo / Demonstração

| Atributo | Valor |
|---|---|
| **Descrição** | Módulo de demonstração, navegável ou experimental. Pode ter dados mockados, parcialmente persistidos ou nenhum dado real. Criado para validar UX, fluxo ou conceito. |
| **Uso permitido** | Demonstração a clientes, validação de produto, exploração de fluxo, treinamento de usuários em ambiente demo. |
| **Uso proibido** | Qualquer uso como fonte oficial de dados, base para decisão operacional, substituição de papel, input para fiscalização, relatório apresentado a terceiros como dado real. |
| **Tipo de dados permitido** | Mockados ou dados reais anonimizados somente em ambiente controlado com aviso explícito. |
| **Dados reais ou mockados** | Primariamente mockados. Dados reais exigem aviso persistente, isolamento e controle de acesso. |
| **Banner obrigatório** | Sim — "Protótipo — não regulado" — permanente em todas as páginas do módulo. |
| **RBAC obrigatório** | Sim — acesso mínimo; nenhum papel operacional pode usar o módulo como fonte oficial. |
| **Audit log** | Nenhum (A0) — nenhuma obrigação de rastreamento regulatório. |
| **Backup obrigatório** | Não — dados mockados não exigem backup regulado. |
| **Exportação** | Desabilitada ou claramente marcada como "demonstração — não usar como documento oficial". |
| **Assinatura** | Proibida com aparência de ação jurídica. Pode existir como UX demonstrativa com texto explícito de não validade. |
| **Hash** | Não obrigatório. |
| **Modo fiscalização** | Não aplicável. |
| **Records Core** | Não utilizado. |
| **Risco se classificado errado** | Dados fictícios apresentados como reais; operador usando demo como registro; usuário imprimindo export demonstrativo; gestor tomando decisão com base em dado falso. |
| **Exemplos no AirTrust** | MRO / Manutenção (atual), Controle de Voos (atual), DB Digital/eDB (futuro, antes de Records Core). |

---

### 2.3 N1 — Operacional Interno

| Atributo | Valor |
|---|---|
| **Descrição** | Módulo com dados reais persistidos em produção, usado internamente pela empresa para gestão operacional, mas sem obrigações formais de evidência ou registro regulado. |
| **Uso permitido** | Gestão interna, consulta, planejamento, relatórios operacionais para uso exclusivamente interno. |
| **Uso proibido** | Substituição de registro oficial, base para fiscalização, apresentação a órgão regulador como registro formal, assinatura regulatória. |
| **Tipo de dados permitido** | Dados reais operacionais. |
| **Dados reais ou mockados** | Dados reais. Banner de "operacional interno" deve estar presente se houver risco de confusão com registro regulado. |
| **Banner obrigatório** | Recomendado onde houver risco de confusão com N2/N3. Obrigatório se o módulo for adjacente a fluxo regulado. |
| **RBAC obrigatório** | Sim — controle de acesso por papel e empresa. |
| **Audit log** | A1 — operacional básico: quem fez o quê e quando, sem cadeia de hash. |
| **Backup obrigatório** | Sim — backup operacional padrão do AirTrust. |
| **Exportação** | Permitida (exportação simples/gerencial). Sem obrigação de manifesto ou hash. |
| **Assinatura** | Não obrigatória. Pode existir como intenção interna sem validade jurídica. |
| **Hash** | Não obrigatório por registro. |
| **Modo fiscalização** | Não aplicável. |
| **Records Core** | Não utilizado. |
| **Risco se classificado errado** | Módulo operacional interno apresentado como evidência formal em fiscalização; conteúdo sem audit trail usado como prova; exportação sem rastreabilidade usada em processo. |
| **Exemplos no AirTrust** | Funcionários, Escalas, Simuladores, Dashboard, Hospedagem (atual). |

---

### 2.4 N2 — Evidência Operacional

| Atributo | Valor |
|---|---|
| **Descrição** | Módulo com dados reais, audit log forte, histórico rastreável, capaz de gerar evidência operacional para uso em auditorias internas, due diligence ou processos internos da empresa. Não substitui registro regulado. |
| **Uso permitido** | Evidência interna, due diligence, auditoria de qualidade, referência para processos internos, base para decisões que não exijam registro oficial. |
| **Uso proibido** | Substituição de registro regulado obrigatório, base exclusiva para fiscalização ANAC, assinatura com validade jurídica regulatória. |
| **Tipo de dados permitido** | Dados reais operacionais, com histórico. |
| **Dados reais ou mockados** | Somente dados reais. |
| **Banner obrigatório** | "Evidência operacional — não substitui registro regulado" onde houver adjacência a fluxo regulado. |
| **RBAC obrigatório** | Sim — com roles claras de quem pode visualizar, exportar e corrigir. |
| **Audit log** | A2 — audit log forte: eventos de criação, alteração, exportação e acesso, com retenção definida. |
| **Backup obrigatório** | Sim — backup verificável com SHA-256 real do pacote. |
| **Exportação** | Exportação de evidência operacional — com lista de eventos, responsável e timestamp, mas sem manifesto regulatório completo. |
| **Assinatura** | Pode existir como intenção interna ou confirmação operacional, sem validade jurídica regulatória. |
| **Hash** | Recomendado por registro importante (ex.: registros que alimentam FRMS ou Qualificações). |
| **Modo fiscalização** | Não obrigatório. Pode ser disponibilizado como modo read-only para consulta interna de terceiros autorizados. |
| **Records Core** | Pode consumir audit log forte. Não utiliza Records Core completo. |
| **Risco se classificado errado** | Evidência operacional sem audit log forte; exportação apresentada à ANAC como registro regulado quando não é; módulo com dados corretos mas sem rastreabilidade suficiente para ser defendido. |
| **Exemplos no AirTrust** | FRMS (estado atual — N1 evoluindo para N2), Qualificações (alvo N2), LMS (alvo N2 para certificados de treinamento não regulado). |

---

### 2.5 N3 — Registro Regulado

| Atributo | Valor |
|---|---|
| **Descrição** | Módulo que produz registros capazes de, tecnicamente, substituir papel como registro obrigatório, atendendo à Resolução ANAC 458/2017 e normas específicas. Exige Records Core completo. Não está automaticamente autorizado — isso depende de N4. |
| **Uso permitido** | Geração de registros digitais que atendem tecnicamente aos requisitos regulatórios, para submissão à autorização do POI por operador. Demonstração de conformidade técnica em processo de autorização. |
| **Uso proibido** | Substituição do papel sem autorização formal do POI (isso seria N4). Declaração pública de "homologado pela ANAC". |
| **Tipo de dados permitido** | Dados reais regulatórios, com Records Core ativo. |
| **Dados reais ou mockados** | Somente dados reais em ambiente de produção. Ambiente de validação pode usar dados sintéticos, devidamente isolados. |
| **Banner obrigatório** | "Registro regulado — autorização de uso por operador obrigatória para substituição do papel". |
| **RBAC obrigatório** | Sim — papéis regulatórios definidos (ex.: PIC, OCC, mecânico, inspetor). CANAC/licença vinculada ao usuário quando obrigatório. |
| **Audit log** | A3 — ledger regulado append-only com cadeia de hash. |
| **Backup obrigatório** | Sim — backup com SHA-256 real, drill mensal, verificação pós-restore de record_hash e chain. |
| **Exportação** | Exportação fiscalizatória com manifesto de hashes, PDF + JSON canônico, anexos, audit trail. |
| **Assinatura** | Obrigatória por tipo de registro (PIC/OCC/mecânico/inspetor/aprovador). Tipo definido por consultor regulatório (D-01/D-02). |
| **Hash** | Obrigatório por registro, por versão, com cadeia de hash por tenant/tipo. |
| **Modo fiscalização** | Obrigatório — perfil read-only escopado por aeronave/período/módulo, com expiração automática e log de visualização. |
| **Records Core** | Obrigatório — todas as 5 tabelas do núcleo mínimo (records, versions, hashes, audit_events, addenda). |
| **Risco se classificado errado** | Módulo N2 tratado como N3 sem Records Core → evidências inválidas; módulo N3 sem autorização do POI apresentado como substituto de papel → infração regulatória. |
| **Exemplos no AirTrust** | DB Digital/eDB (futuro, após Records Core + autorização consultor), SDRMe/MRO (futuro), FRMS (parcialmente, para análise regulatória). |

---

### 2.6 N4 — Registro Crítico Aceito/Autorizado

| Atributo | Valor |
|---|---|
| **Descrição** | N3 com autorização formal do POI do operador, para escopo, frota ou aeronave definida. Substitui legalmente o papel no escopo autorizado. É a situação final de conformidade operacional. |
| **Uso permitido** | Substituição de registro em papel para o escopo autorizado. Base legal para operações daquele operador naquele escopo. |
| **Uso proibido** | Extensão do escopo sem nova autorização. Declaração de que outros operadores estão autorizados com base nesta autorização. |
| **Tipo de dados permitido** | Dados regulatórios reais, no escopo autorizado. |
| **Dados reais ou mockados** | Exclusivamente dados reais. Qualquer mistura com dados mockados é uma violação grave. |
| **Banner obrigatório** | "Registro aceito/autorizado — [Operador] — [Escopo] — [Data de autorização]". |
| **RBAC obrigatório** | Sim — com controles adicionais de escopo de autorização (operador/frota/prefixo). |
| **Audit log** | A3 — ledger regulado append-only, com retenção pelo prazo normativo (mínimo 5 anos para maioria dos registros de aviação). |
| **Backup obrigatório** | Sim — drill mensal com evidência de restore, RPO ≤ 15 min para registros sincronizados, RTO ≤ 4h. |
| **Exportação** | Pacote regulado completo com manifesto de hashes, README de verificação, versão do sistema, finalidade e escopo. |
| **Assinatura** | Obrigatória conforme decisão regulatória — tipo validado por consultor e aceito pelo POI. |
| **Hash** | Obrigatório — SHA-256 mínimo, com campo hash_algorithm para evolução futura. |
| **Modo fiscalização** | Obrigatório — com identidade do fiscal/inspetor, escopo temporário, expiração automática, log de todos os registros visualizados. |
| **Records Core** | Obrigatório — núcleo mínimo + device registry + sync sessions + retention policies. |
| **Risco se classificado errado** | Módulo N3 sem autorização do POI operado como N4 → infração do operador e do AirTrust; escopo de autorização extrapolado → possível acidente de conformidade. |
| **Exemplos no AirTrust** | Nenhum módulo é N4 hoje. Meta de médio/longo prazo para eDB e SDRMe. |

---

## 3. Matriz Inicial dos Módulos Atuais

A classificação abaixo é uma proposta interna. Deve ser revisada pela equipe e validada com consultor regulatório antes de ser usada em comunicações externas.

| Módulo | Status em modules.ts | Nível Atual | Nível Alvo | Justificativa | Fonte Oficial Hoje | Gera Evidência | Usável em Auditoria | Exige Records Core | Principais Lacunas | Prioridade |
|---|---|---|---|---|---|---|---|---|---|---|
| **Funcionários** | pilot | N1 | N1/N2 | Dados reais, persistência sólida, operacional maduro. Sem obrigação de evidência formal mas é base para módulos regulados. | AirTrust (dado mestre) | Não formalmente | Não | Não | Audit log A1 suficiente; falta A2 para histórico de mudanças críticas | Baixa |
| **Qualificações** | pilot | N1 | N2 | Registros de qualificação têm valor probatório. Base para LMS, Simuladores, SDRMe. Audit log A1 existe. | AirTrust (gerenciado pela empresa) | Parcialmente | Com ressalvas | Não | Audit log A2 obrigatório; exportação de evidência com histórico; hash por registro relevante | Média |
| **Simuladores / Sessões** | pilot | N1 | N2 | Sessões de simulador são evidência para qualificações e treinamentos. Precisam de rastreabilidade maior. | AirTrust (registros de sessão) | Parcialmente | Com ressalvas | Não | Falta audit log A2; exportação com histórico; assinatura de instrutor | Média |
| **Treinamentos Planejados** | beta | N1 | N2 | Módulo em estabilização. Dados reais mas sem audit trail suficiente para evidência formal. | AirTrust | Não | Não | Não | Estabilização de fluxo; audit log A2; exportação rastreável | Média |
| **Escalas (mensal/EVD)** | pilot | N1 | N1 | Planejamento e escala diária são operacionais internos. Sem obrigação regulatória direta para o AirTrust (a obrigação é do operador em seus próprios sistemas). | AirTrust | Não | Não | Não | Integração com FRMS para jornada real; audit log A1 suficiente | Baixa |
| **FRMS** | pilot | N1→N2 | N2/N3* | FRMS opera com dados reais de jornada e gera alertas críticos. Tem pipeline operacional maduro. Sem ledger imutável. Para análise regulatória exigiria N3. | SIGVOOS/FIRA (jornada real) + AirTrust | Parcialmente | Com ressalvas | Futuramente para análise regulatória | Audit log A2→A3; hash por jornada crítica; assinatura de gestor em decisões de mitigação; Records Core para fluxo regulatório | Alta |
| **LMS / EAD** | beta | N1 | N2 | Cursos EAD e certificados internos são evidência operacional. Certificados com valor regulatório (pré-requisito para assinar SDRMe) exigirão N3. | AirTrust | Parcialmente (certificados) | Com ressalvas | Futuramente para certificados regulados | Audit log A2; exportação de certificado com hash; assinatura de instrutor; Records Core para certificados pré-requisito | Alta |
| **SGSO** | beta | N1 | N2/N3* | Sistema de segurança operacional gera relatos e ações corretivas. Tem valor regulatório no PQSNA. | AirTrust | Parcialmente | Com ressalvas | Futuramente para relatos regulatórios | Audit log A2→A3; hash por relato; exportação com manifesto; addendum para correções | Alta |
| **MRO / Manutenção** | beta | **N0** | N3 (longo prazo) | Frontend com dados mockados. UX navegável mas sem persistência regulada, sem Records Core, sem assinatura. Banner N0 já implementado. | Papel / sistema externo (hoje) | Não | Não | Sim (para N3) | Tudo: persistência, Records Core, assinatura, addendum, hash, ledger, device registry, autorização por OMA | Baixa (prototipo) → Alta (quando regulatório) |
| **Controle de Voos** | beta | **N0** | N3 (longo prazo) | Frontend com dados mockados. Protótipo navegável sem backend próprio de persistência regulada. Banner N0 já implementado. | Papel / OCC (hoje) | Não | Não | Sim (para N3) | Tudo: backend, persistência, RDV, Records Core, assinatura OCC/PIC, addendum, device registry | Baixa (prototipo) → Alta (quando regulatório) |
| **DB Digital / eDB** | futuro | N0 (não existe) | N4 (meta) | Produto futuro — eDB no tablet. Mais crítico regulatoriamente. Exige Records Core completo, assinatura PIC e OCC, sync offline, device registry, autorização por operador/POI. | Papel (hoje) | Não (futuro) | Não (futuro) | Sim (obrigatório) | Tudo — começar do zero com Records Core como fundação | Alta (regulatória) |
| **SDRMe** | futuro | N0 (não existe) | N4 (meta) | Produto futuro — manutenção digital. Exige Records Core, assinatura executor/inspetor/aprovador, RAS, vínculo com OS, AD/SB, componentes. | Papel / sistema OMA (hoje) | Não (futuro) | Não (futuro) | Sim (obrigatório) | Tudo — começar do zero com Records Core como fundação | Alta (regulatória) |
| **Regulated Records Core** | futuro | N0 (não existe) | N/A (infra) | Camada horizontal — não é módulo de negócio, é infraestrutura para todos os módulos N3/N4. | N/A | N/A | N/A | É o Records Core | Definir ADR físico; 5 tabelas do núcleo mínimo; canonicalização; hash chain; ledger | Máxima |
| **Compliance / Relatórios** | interno | N1 | N1/N2 | Relatórios consolidados do tenant. Valor gerencial. Sem obrigação regulatória direta. | Dados dos módulos AirTrust | Não formalmente | Não | Não | Audit log de exportação; marcação de origem dos dados; avisos se dados forem de módulos N0 | Baixa |
| **Dashboard** | pilot | N1 | N1 | Painel read-only consolidado. Dado derivado dos módulos. Nenhuma obrigação regulatória. | Derivado dos módulos | Não | Não | Não | Avisos se algum dado vier de módulo N0 | Baixa |

> \* FRMS e SGSO têm longo prazo de análise regulatória: apenas a porção de **decisões de mitigação críticas** e **relatos obrigatórios** pode precisar de N3. A gestão operacional diária permanece em N2.

---

## 4. Padrão de Banners e Labels

### 4.1 Textos obrigatórios

| Nível | Label curta | Texto completo recomendado | Gravidade / Cor sugerida |
|---|---|---|---|
| **N0** | Protótipo — não regulado | "Este módulo é um protótipo de demonstração. Os dados podem ser fictícios. Não usar como fonte oficial ou em processos regulatórios." | Vermelho/laranja escuro (`destructive` / `warning-strong`) |
| **N1** | Operacional interno | "Este módulo é operacional interno. Não constitui registro regulado e não substitui documentação oficial." | Azul (`info`) |
| **N2** | Evidência operacional | "Este módulo gera evidência operacional. Não substitui registro regulado nem autoriza substituição de papel." | Âmbar (`warning`) |
| **N3** | Registro regulado | "Este módulo gera registros regulados. A substituição do papel exige autorização formal do POI por operador e escopo." | Verde (`success`) |
| **N4** | Registro aceito/autorizado | "Registro aceito/autorizado — [Operador] — [Escopo] — Autorizado em [data] por [POI]. Substitui papel no escopo definido." | Verde escuro com ícone de verificação |

### 4.2 Onde o banner deve aparecer

| Nível | Todas as páginas | Exports | Relatórios | PDF | Modo fiscalização |
|---|---|---|---|---|---|
| **N0** | **Sim — permanente, não dispensável** | **Sim — cabeçalho obrigatório** | **Sim** | **Sim — em todas as páginas** | N/A |
| **N1** | Recomendado em páginas adjacentes a fluxo regulado | Recomendado | Recomendado | Recomendado | N/A |
| **N2** | Sim — em páginas de exportação e relatório | **Sim** | **Sim** | **Sim** | Recomendado |
| **N3** | Sim — em todas as páginas | **Sim** | **Sim** | **Sim** | **Sim — com escopo e expiração** |
| **N4** | Sim — com dados de autorização | **Sim** | **Sim** | **Sim — com dados de autorização** | **Sim — com escopo, expiração e autorização** |

### 4.3 Regras adicionais de banner

1. **N0: banner nunca pode ser dispensado pelo usuário.** Não pode ser um toast que fecha. Deve ser um elemento persistente no topo da página.
2. **N0 com dados reais:** se por qualquer razão um módulo N0 receber acesso a dados reais (ex.: ambiente de validação com dados reais), o banner deve mudar para: "Protótipo com dados reais — acesso restrito — não usar como documento oficial."
3. **Módulo N3/N4 com dados de outro módulo N0/N1:** qualquer dashboard ou relatório que combine dados de módulos de diferentes níveis deve exibir o nível mais baixo presente, com aviso explícito.
4. **Exportações sempre identificam o nível:** todo arquivo gerado (PDF, CSV, JSON) deve conter no cabeçalho o nível do módulo, a data de geração, a versão do sistema e o operador/empresa.
5. **Modo fiscalização (N3/N4):** o banner deve incluir o nome/identificação do fiscal, o escopo autorizado, a data/hora de início e a expiração prevista.

### 4.4 Implementação atual

| Módulo | Banner atual | Conforme com este padrão? |
|---|---|---|
| MRO / Manutenção | "Módulo MRO em prévia: Protótipo — não regulado." | Parcialmente — texto correto, verificar se é permanente e aparece em todas as páginas e exports |
| Controle de Voos | "Módulo Controle de Voos em prévia: Protótipo — não regulado." | Parcialmente — idem |
| Demais módulos N1 | Nenhum banner | Conforme para N1 puro; revisar para módulos adjacentes a fluxo regulado |

---

## 5. Padrão de Ações e Botões

### 5.1 Regra geral

A aparência de um botão sinaliza ao usuário a consequência de clicar nele. Em módulos N0, botões com aparência de ação oficial enganam o usuário. Em módulos N3/N4, botões sem os devidos controles (confirmação, assinatura, hash) podem criar registros inválidos.

### 5.2 Matriz de ações por nível

| Ação | N0 | N1 | N2 | N3 | N4 |
|---|---|---|---|---|---|
| **Salvar** | Permitido com aviso de que dado não persiste ou é demo | Permitido, com audit log A1 | Permitido, com audit log A2 | Permitido para draft; exige selagem para registro oficial; com audit log A3 | Permitido com Records Core + selagem + audit log A3 |
| **Excluir** | Permitido (dado é mockado) | Permitido com confirmação e log A1 | Permitido para dados não-evidenciais; log A2 obrigatório | **Proibido para registros selados.** Trigger de banco deve bloquear. Só addendum/invalidação com log A3 | **Proibido.** Retenção regulatória obrigatória. |
| **Assinar** | Proibido com aparência de ação jurídica. Se existir como demo, deve dizer "Simulação — sem validade" | Pode existir como intenção interna; sem validade jurídica | Pode existir como confirmação operacional; sem validade regulatória | Obrigatório para selagem de registro regulado; tipo de assinatura definido por D-01/D-02; com Records Core | Idem N3, com assinatura validada pelo consultor e aceita pelo POI |
| **Exportar** | Desabilitado ou com aviso "Demonstração — não usar como documento oficial" | Permitido; sem manifesto de hash | Permitido; com lista de eventos e responsável | Obrigatório via exportação fiscalizatória com manifesto de hashes | Idem N3; pacote com escopo de autorização |
| **Imprimir** | Proibido sem aviso claro de "dado demonstrativo" no documento impresso | Permitido com cabeçalho de nível | Permitido com cabeçalho de nível e data | Permitido; PDF deve conter nível, hash do registro, dados do assinante | Idem N3 com dados de autorização do POI |
| **Gerar OS** | Botão desabilitado ou com aviso "Protótipo — OS não gerada" | Permitido para gestão interna | Permitido com log A2 | Permitido com Records Core; OS é registro regulado em N3 | Idem N3 com autorização |
| **Gerar relatório oficial** | Proibido. O botão deve estar oculto ou claramente marcado como "Simulação" | Não aplicável — relatório N1 não é oficial | Pode gerar relatório de evidência operacional com aviso de nível | Permitido via pacote fiscalizatório com manifesto | Idem N3 com dados de autorização |
| **Enviar para ANAC** | Proibido completamente | Proibido | Proibido | Funcionalidade de submissão técnica ao escopo de autorização; não é envio direto à ANAC sem processo | N4: arquivo com pacote completo para processo de autorização/fiscalização |
| **Sincronizar offline** | Não aplicável | Não aplicável | Não aplicável | Permitido via sync session controlada; com drift de relógio registrado; conflito sempre explícito | Idem N3; device deve ser registrado e autorizado |
| **Validar** | Simulado — sem efeito real | Operacional interno | Com audit log A2 | Com Records Core; valida hash e chain; evento no ledger A3 | Idem N3 |
| **Aprovar** | Simulado com aviso | Com audit log A1 | Com audit log A2 | Com Records Core; aprovação é evento assinado | Idem N3 |
| **Encerrar** | Simulado com aviso | Operacional | Com audit log A2 | Encerramento sela registro; addendum obrigatório para reabrir | Idem N3; addendum auditado |

### 5.3 Implementação atual de ações N0

Os módulos MRO e Controle de Voos já implementam corretamente:
- Botão "PDF" desabilitado com toast "Protótipo: exportação de PDF não disponível nesta prévia."
- Botão "Assinar" desabilitado com toast "Protótipo: sign-off não disponível nesta prévia."
- Botão "Gerar OS" desabilitado com toast "Protótipo: geração de OS não disponível nesta prévia."

Este padrão deve ser estendido a todos os módulos N0 e codificado como convenção obrigatória.

---

## 6. Padrão de Fonte Oficial dos Dados

### 6.1 Modelo de declaração por módulo

Cada módulo deve declarar explicitamente:

| Campo | Descrição |
|---|---|
| **Fonte oficial** | Qual sistema/processo é a autoridade máxima para os dados deste módulo |
| **Módulos fornecedores** | Quais módulos do AirTrust fornecem dados para este |
| **Módulos consumidores** | Quais módulos do AirTrust consomem dados deste |
| **Conflitos possíveis** | Cenários em que a fonte pode divergir de outra |
| **Regra de precedência** | Qual fonte prevalece em caso de conflito |
| **Quem pode corrigir** | Papel mínimo necessário para corrigir dado neste módulo |
| **Como a correção é registrada** | Audit log, addendum ou correção direta |
| **Se a correção exige addendum** | Sim/Não (obrigatório para N3/N4) |
| **Se a correção exige assinatura** | Sim/Não (obrigatório para N3/N4) |
| **Se a correção altera evidências** | Sim → implica reselagem; Não → correção livre com log |

### 6.2 Declarações de fonte oficial por módulo (estado atual)

#### Funcionários
- **Fonte oficial:** AirTrust (dado mestre do tenant)
- **Consumidores:** Qualificações, Escalas, FRMS, LMS, Simuladores, Controle de Voos, MRO
- **Conflitos:** divergência entre cadastro AirTrust e sistema de RH da empresa
- **Regra de precedência:** AirTrust é a fonte operacional; RH da empresa é a fonte de contratação
- **Quem pode corrigir:** admin/manager
- **Correção registrada via:** audit log A1
- **Addendum:** Não (N1)

#### Qualificações
- **Fonte oficial:** AirTrust para gestão; documentos originais (ANAC/FAA/EASA) são a autoridade regulatória
- **Consumidores:** Escalas (verificação de habilitação), FRMS (funções permitidas), LMS (pré-requisitos), MRO (habilitações de mecânico)
- **Conflitos:** data de vencimento no AirTrust diverge do certificado físico
- **Regra de precedência:** certificado físico emitido por autoridade regulatória prevalece
- **Quem pode corrigir:** admin/manager com justificativa
- **Correção registrada via:** audit log A2 (quando atingir N2)
- **Addendum:** Não ainda (N1), Sim quando N2

#### Escalas / EVD
- **Fonte oficial:** AirTrust para planejamento; SIGVOOS/FIRA para jornada realizada
- **Consumidores:** FRMS (jornada planejada vs. realizada), Controle de Voos
- **Conflitos:** escala planejada ≠ jornada realizada (voo atrasado, tripulação substituída)
- **Regra de precedência:** jornada realizada (SIGVOOS/FIRA) prevalece para análise FRMS regulatória
- **Quem pode corrigir:** manager/admin
- **Correção registrada via:** audit log A1; sync com SIGVOOS

#### FRMS
- **Fonte oficial:** SIGVOOS/FIRA para jornada realizada; cálculo AirTrust para análise de fadiga
- **Consumidores:** Controle de Voos (alertas), Escalas (disponibilidade)
- **Conflitos:** jornada planejada no AirTrust ≠ jornada importada do SIGVOOS/FIRA
- **Regra de precedência:** SIGVOOS/FIRA é a fonte de jornada real para análise regulatória
- **Quem pode corrigir:** admin/manager com justificativa documentada
- **Correção registrada via:** audit log A2 (quando atingir N2); addendum para decisões de mitigação (N3)
- **Nota crítica:** para análise regulatória de fadiga, o FRMS deve consumir jornada real (SIGVOOS/FIRA), não apenas jornada planejada no AirTrust.

#### LMS / EAD
- **Fonte oficial:** AirTrust para cursos internos; certificados de autoridades externas (ANAC, FAA) são a autoridade para qualificações
- **Consumidores:** Qualificações (conclusão de treinamento), SDRMe/MRO (habilitações)
- **Conflitos:** conclusão no LMS ≠ certificado regulatório (ex.: treinamento completo mas certificado ANAC pendente)
- **Regra de precedência:** certificado emitido por autoridade regulatória prevalece sobre conclusão no LMS
- **Quem pode corrigir:** instructor/admin
- **Addendum:** Não (N1), Sim para certificados N3

#### SGSO
- **Fonte oficial:** AirTrust para relatos e ações corretivas internas
- **Consumidores:** Controle de Voos (vínculo com voo), eDB (discrepâncias), Qualificações (ações corretivas)
- **Conflitos:** relato no AirTrust diverge de relato enviado ao PQSNA/CENIPA
- **Regra de precedência:** relato no sistema oficial (PQSNA) prevalece sobre AirTrust
- **Quem pode corrigir:** manager/admin com justificativa
- **Addendum:** Sim (quando N2/N3)

#### Controle de Voos (futuro, quando N3)
- **Fonte oficial:** AirTrust (RDV planejado/real) para o operador; SIGVOOS/FIRA para dados ANAC
- **Consumidores:** eDB (pré-preenchimento), FRMS (jornada), SGSO (vínculo com ocorrência), MRO (horas/ciclos)
- **Conflito principal (decisão D-10 pendente):** RDV (Controle de Voos) vs. eDB — qual é a fonte oficial da jornada realizada? Esta decisão deve ser feita com consultor antes de qualquer integração selada.
- **Regra de precedência:** indefinida — aguarda D-10 com consultor regulatório.

#### DB Digital / eDB (futuro, quando N3/N4)
- **Fonte oficial:** eDB é a meta de ser a fonte oficial do diário de bordo, substituindo o papel no escopo autorizado
- **Consumidores:** FRMS (jornada real), MRO (horas/ciclos/discrepâncias), SGSO (ocorrências)
- **Nota crítica:** eDB só pode ser fonte oficial após N4 (autorização por POI). Antes disso, o papel continua sendo a fonte oficial.

#### MRO / SDRMe (futuro, quando N3/N4)
- **Fonte oficial:** SDRMe deve ser a fonte oficial de OS, RAS e registros de manutenção no escopo autorizado
- **Consumidores:** Qualificações (habilitações de mecânico), SGSO (ações corretivas de manutenção)
- **Nota crítica:** o AirTrust nunca deve declarar que o MRO atual (N0, mockado) é a fonte oficial de manutenção.

### 6.3 Regra de ouro sobre fontes

> **Um módulo N0 nunca pode ser declarado fonte oficial de dados para outro módulo, mesmo que o outro módulo seja N2 ou N3.**
> Um módulo N1 pode alimentar outro N1 para uso operacional interno, mas não pode ser a fonte oficial de registros que apareçam em exportações ou evidências de módulos N2/N3.

---

## 7. Padrão de Auditoria (A0–A3)

### 7.1 Visão geral dos níveis de auditoria

| Nível | Nome | Nível de módulo mínimo | Descrição |
|---|---|---|---|
| **A0** | Sem audit log regulatório | N0 | Nenhum requisito de rastreamento regulatório. Logs de sistema (acesso, erros) são mantidos por operações, não por compliance. |
| **A1** | Audit log operacional | N1 | Registro de quem fez o quê e quando, em campos básicos. Sem cadeia de hash. Retenção operacional (mínimo 90 dias). |
| **A2** | Audit log forte | N2 | Registro completo de eventos de negócio, com campos enriquecidos, retenção estendida, exportação de histórico. Sem ledger append-only. |
| **A3** | Ledger regulado append-only | N3/N4 | Ledger com cadeia de hash, bloqueio técnico de UPDATE/DELETE, eventos de todos os acessos e mutações, retenção normativa. |

### 7.2 A0 — Sem audit log regulatório

- **Quando usar:** módulos N0 (protótipos com dados mockados).
- **Campos mínimos:** nenhum específico (logs de operações/infraestrutura são mantidos separadamente).
- **Retenção:** conforme política de logs de sistema.
- **Exportação:** não obrigatória.
- **Records Core:** não utilizado.
- **Exemplos:** MRO atual, Controle de Voos atual.

### 7.3 A1 — Audit log operacional

- **Quando usar:** módulos N1 com dados reais.
- **Campos mínimos:** `user_id`, `action`, `entity_type`, `entity_id`, `empresa_id`, `created_at`, `ip_hash` (opcional).
- **Retenção:** mínimo 1 ano.
- **Exportação:** disponível para admin.
- **Records Core:** não utilizado. Pode usar `audit_events_v2` existente.
- **Exemplos:** Funcionários, Escalas, Dashboard.

### 7.4 A2 — Audit log forte

- **Quando usar:** módulos N2 com dados que geram evidência operacional.
- **Campos mínimos:** todos do A1 + `previous_value`, `new_value`, `reason`, `request_id`, `user_agent_hash`, `event_category`, `risk_level`.
- **Retenção:** mínimo 3 anos ou conforme política da empresa.
- **Exportação:** exportação de evidência operacional com lista de eventos por entidade, com timestamp e responsável.
- **Records Core:** não obrigatório, mas o design de A2 deve ser compatível com evolução para A3.
- **Nota:** a `audit_events_v2` atual (migration 0385) tem bons campos de início, mas não é ledger imutável — não tem `previous_event_hash`, sequência nem trigger de bloqueio. Usar para A1/A2, não para A3.
- **Exemplos (alvo):** Qualificações, FRMS, LMS (certificados), SGSO.

### 7.5 A3 — Ledger regulado append-only

- **Quando usar:** módulos N3/N4 com Records Core.
- **Campos mínimos:** todos do A2 + `previous_event_hash`, `event_hash`, `sequence_number`, `actor_canac` (quando aplicável), `device_id` (quando aplicável), `support_mode`.
- **Retenção:** normativa — mínimo 5 anos para maioria dos registros de aviação; conforme `regulated_retention_policies`.
- **Exportação:** obrigatória como parte do pacote fiscalizatório.
- **Imutabilidade:** triggers `BEFORE UPDATE/DELETE` com `RAISE(ABORT)` em `regulated_audit_events`; cadeia de hash verificável; detecção de drift periódica.
- **Records Core:** tabela `regulated_audit_events` do Records Core (ledger novo e completo — **não é evolução da** `audit_events_v2`).
- **Exemplos (futuro):** eDB, SDRMe/MRO (N3), Controle de Voos (N3), FRMS para análise regulatória (parcialmente).

---

## 8. Padrão de Exportação

### 8.1 Tipos de exportação

| Tipo | Nível mínimo | Conteúdo | Formato | Uso | Hash/Manifesto | Assinatura | Audit trail |
|---|---|---|---|---|---|---|---|
| **Exportação simples** | N1 | Dados tabulares da visão atual | CSV, Excel | Uso interno, análise gerencial | Não | Não | Log de exportação básico |
| **Exportação gerencial** | N1 | Relatório consolidado com filtros e agregações | PDF, Excel | Reuniões, gestão interna | Não | Não | Log de exportação básico |
| **Exportação de evidência operacional** | N2 | Dados + histórico de alterações + responsável + timestamp | PDF, JSON | Auditoria interna, due diligence, processo interno | Recomendado (hash por exportação) | Não obrigatória | Audit log A2 por exportação |
| **Exportação fiscalizatória** | N3 | Dados regulatórios + audit trail + assinaturas + addenda | ZIP (PDF + JSON canônico + manifesto + anexos) | Fiscalização, autorização ANAC, investigação | Obrigatório (manifesto SHA-256 por arquivo) | Não obrigatória na exportação em si (nos registros internos sim) | Audit log A3; evento `EXPORT_REQUESTED` + `EXPORT_GENERATED` + `EXPORT_DOWNLOADED` |
| **Pacote regulado com manifesto de hashes** | N3/N4 | Pacote completo: PDF + JSON canônico + manifesto + anexos + assinaturas + audit trail + README de verificação | ZIP assinado | Submissão a processo de autorização, fiscalização ANAC, investigação de acidente | Obrigatório (manifesto SHA-256 + hash do pacote inteiro) | Obrigatória (do pacote ou dos registros individuais) | Audit log A3 completo; registro em `regulated_exports` |

### 8.2 Conteúdo do pacote regulado (N3/N4)

Cada pacote ZIP de exportação regulatória deve conter:

```
package_[empresa]_[modulo]_[periodo]_[timestamp]/
├── README.txt              — estrutura, verificação, versão do sistema
├── manifest.json           — lista de todos os arquivos com SHA-256, tamanho, tipo
├── manifest.sha256         — hash SHA-256 do manifest.json
├── records/
│   ├── [record_id].json    — payload canônico de cada registro
│   ├── [record_id].pdf     — representação humana (PDF nunca é o registro primário)
│   └── [record_id]_addenda.json  — addenda, se houver
├── attachments/
│   └── [attachment_id].[ext]  — anexos referenciados no manifesto
├── signatures/
│   └── [signature_id].json    — metadados de assinatura (hash assinado, signatário, papel, CANAC)
├── audit/
│   └── audit_trail.json    — eventos A3 dos registros exportados
├── export_metadata.json    — quem exportou, quando, finalidade, escopo, expiração do pacote
└── system_version.json     — versão do AirTrust, versão do canonicalizador, hash_algorithm
```

### 8.3 Regras de exportação por nível

1. **N0:** exportação desabilitada ou com watermark "DEMONSTRAÇÃO — NÃO É DOCUMENTO OFICIAL" em cada página do PDF e em cada linha do CSV.
2. **N1:** exportação simples/gerencial; cabeçalho deve incluir nível do módulo e data.
3. **N2:** exportação de evidência; deve incluir evento de log por exportação com usuário, timestamp e scope.
4. **N3/N4:** todo export deve registrar evento em `regulated_exports`; pacote deve ser verificável fora do AirTrust (README + manifesto + hash).
5. **LGPD:** exportação deve obedecer ao escopo mínimo. Dados pessoais fora do escopo da fiscalização devem ser omitidos ou mascarados. Todo pacote deve registrar base legal da exportação.
6. **Expiração:** pacotes hospedados em R2 para download do fiscal devem ter data de expiração. O link de download expira; os registros no D1 são permanentes.

---

## 9. Padrão de Dados Mockados, Reais e Regulados

### 9.1 Regras fundamentais

| Regra | Descrição |
|---|---|
| **R1** | Dados mockados nunca podem ser confundidos com dados reais. |
| **R2** | Protótipos com dados mockados devem exibir banner persistente e não dispensável. |
| **R3** | Dados reais em módulo N0 (protótipo) exigem aviso explícito e controle de acesso restrito. |
| **R4** | Dados regulados (de módulos N3/N4) só podem entrar em módulo de igual ou maior nível. |
| **R5** | Um módulo N3/N4 nunca deve consumir dados de módulo N0 como fonte de registro regulado. |
| **R6** | Mascaramento ou anonimização são obrigatórios quando dados pessoais são usados em ambientes de desenvolvimento/staging. |
| **R7** | LGPD: dados pessoais de tripulantes e funcionários são dados sensíveis de trabalho; tratamento deve ser proporcional à finalidade. |

### 9.2 Ambientes e dados permitidos

| Ambiente | Dados permitidos | Restrições |
|---|---|---|
| **Local / desenvolvimento** | Dados sintéticos, dados anonimizados, dados de teste | Proibido usar dados reais de produção sem anonimização; `.dev.vars` não deve ser commitado |
| **Staging** | Dados sintéticos ou snapshot anonimizado de produção | Proibido usar dados reais sem anonimização; acesso restrito |
| **Produção — módulo N0** | Dados mockados ou dados reais com controle de acesso restrito e banner N0 | Nunca mesclar dado mockado e real sem distinção visual clara |
| **Produção — módulo N1/N2** | Dados reais operacionais | Sem restrição específica além de RBAC e LGPD |
| **Produção — módulo N3/N4** | Dados regulatórios reais, com Records Core | Acesso restrito por papel regulatório; todo acesso auditado |

### 9.3 Identificação de dados mockados na UI

Para módulos N0, dados mockados devem ser identificáveis visualmente:
- O dashboard ou lista principal deve exibir elemento visual indicando "dados demonstrativos".
- Campos numéricos devem usar valores claramente fictícios (ex.: matrícula "MOCK-001", aeronave "PP-DEMO").
- Datas devem estar no passado ou no futuro distante, nunca confundíveis com operações reais.
- Se o protótipo usar dados reais de um tenant específico para demonstração, o usuário deve ser informado e dar consentimento explícito, e o módulo deve ser classificado como "protótipo com dados reais" com banner diferenciado.

### 9.4 LGPD e dados pessoais

| Dado | Classificação | Módulo aplicável | Cuidado |
|---|---|---|---|
| Nome, CPF, CANAC do tripulante | Pessoal identificável | Todos | Exportação fiscal deve ser por escopo mínimo; mascarar fora do escopo |
| Histórico de jornada | Pessoal + operacional | FRMS, Escalas | Retenção conforme norma; não exposição sem necessidade |
| Dados de fadiga | Pessoal sensível | FRMS | Acesso restrito a roles específicas; base legal obrigatória |
| Histórico de treinamento | Pessoal | LMS, Qualificações | Direito de acesso do titular; exportação controlada |
| Localização em voo | Pessoal + operacional | Controle de Voos, eDB | Em fiscalização: escopo por aeronave/período, não por pessoa |
| Dados de saúde (hipotético) | Pessoal sensível | FRMS (relatórios de saúde) | Nunca no Records Core sem base legal específica; DPO deve aprovar |

---

## 10. Relação com Regulated Records Core

### 10.1 Quais módulos usam o Records Core

| Nível | Records Core | Detalhes |
|---|---|---|
| **N0** | Não usa | Dados mockados, sem persistência regulada. |
| **N1** | Não usa | Dados reais, mas audit log operacional apenas. |
| **N2** | Não usa diretamente | Pode consumir audit log forte (A2), mas não o Records Core. |
| **N3** | Obrigatório — núcleo mínimo | `regulated_records`, `regulated_record_versions`, `regulated_record_hashes`, `regulated_audit_events`, `regulated_addenda`. |
| **N4** | Obrigatório — núcleo completo | Núcleo mínimo + `regulated_devices`, `regulated_sync_sessions`, `regulated_retention_policies`, `regulated_exports`, `regulated_record_links`, `regulated_signatures`. |

### 10.2 Funções do Records Core obrigatórias por nível

| Função | N3 | N4 |
|---|---|---|
| **Canonicalização** (JSON determinístico, Unicode NFC, datas UTC) | Obrigatório | Obrigatório |
| **Hash por registro** (SHA-256, campo `hash_algorithm`) | Obrigatório | Obrigatório |
| **Seal** (selagem: bloqueio técnico de UPDATE/DELETE pós-selagem) | Obrigatório | Obrigatório |
| **Assinatura** (por tipo de registro; tipo definido por D-01/D-02) | Obrigatório (quando consultor definir) | Obrigatório |
| **Addendum** (correção sem sobrescrita; diffs com hash) | Obrigatório | Obrigatório |
| **Audit ledger A3** (append-only, hash chain, trigger de bloqueio) | Obrigatório | Obrigatório |
| **Export fiscal** (pacote ZIP com manifesto SHA-256) | Obrigatório | Obrigatório |
| **Modo fiscalização** (perfil read-only escopado, com expiração) | Obrigatório | Obrigatório |
| **Retenção** (`regulated_retention_policies` com prazos normativos) | Planejado em N3 | Obrigatório em N4 |
| **Backup/restore verificável** (SHA-256 real do pacote; drill mensal) | Obrigatório | Obrigatório |
| **Device registry** (`regulated_devices` para tablets/PED) | Para módulos com offline | Obrigatório para eDB/SDRMe |
| **Sync offline controlada** (`regulated_sync_sessions`) | Para módulos com offline | Obrigatório para eDB/SDRMe |
| **Record links** (`regulated_record_links` entre módulos) | Aguarda D-10 | Obrigatório (pós D-10) |

### 10.3 Estado atual do Records Core no AirTrust

O Records Core **não existe ainda** no AirTrust. Não há tabela `regulated_records`, não há canonicalização formal, não há ledger A3, não há assinatura regulatória. Este é o principal pré-requisito para qualquer módulo atingir N3.

Lacunas verificadas (conforme Red Team Review):
- ~~Backup atual usa digest placeholder (`sha256-${uuid}-${Date.now()}`) — não é evidência criptográfica.~~ **RESOLVIDO** em commit `da5177af`: `gerarChecksumBackup` agora computa SHA-256 real via `crypto.subtle.digest` por artefato e por manifesto; teste unitário adicionado em `worker-airtrust/src/__tests__/services/backup-orchestrator.test.ts`.
- `audit_events_v2` não é ledger imutável — sem `previous_event_hash`, sem trigger de bloqueio. (aberto)
- Migrations sem governança que impeça remoção acidental de triggers de imutabilidade. (aberto)

---

## 11. Processo de Promoção de Nível

### 11.1 N0 → N1

| Critério | Detalhes |
|---|---|
| **Pré-condição** | Módulo tem casos de uso reais e dados reais em produção. |
| **Evidências necessárias** | Backend com persistência real; dados reais isolados por `empresa_id`; RBAC funcional; sem dados mockados em produção. |
| **Aprovação necessária** | Tech Lead + Product Owner do AirTrust. |
| **Testes** | Smoke test com dados reais; verificação de isolamento por `empresa_id`; revisão de queries para `WHERE empresa_id = ?`. |
| **Documentação** | Declaração de fonte oficial; declaração de dados permitidos; checklist preenchido (seção 12). |
| **Riscos** | Dados reais expostos sem controle de acesso adequado; queries sem `empresa_id`. |
| **Quem aprova** | Tech Lead + Product Owner. |

### 11.2 N1 → N2

| Critério | Detalhes |
|---|---|
| **Pré-condição** | Módulo N1 estável em produção com dados reais há pelo menos 1 ciclo operacional. |
| **Evidências necessárias** | Audit log A2 implementado e funcionando; exportação de evidência com histórico; backup verificável com SHA-256 real; política de retenção definida; revisão de LGPD para dados pessoais. |
| **Aprovação necessária** | Tech Lead + Product Owner + revisão de segurança. |
| **Testes** | Teste de audit trail (criar, alterar, exportar e verificar eventos); teste de exportação com histórico; teste de backup/restore. |
| **Documentação** | Fonte oficial declarada; audit level A2 declarado; política de retenção; declaração de LGPD; checklist N2 preenchido. |
| **Riscos** | Audit log A2 implementado parcialmente; exportação sem histórico de alterações; backup sem hash real. |
| **Quem aprova** | Tech Lead + Product Owner + responsável de segurança. |

### 11.3 N2 → N3

| Critério | Detalhes |
|---|---|
| **Pré-condição** | Records Core implementado e testado (núcleo mínimo, 5 tabelas); consultor regulatório respondeu D-01/D-02 (tipo de assinatura) e D-10 (fonte oficial RDV/eDB se aplicável). |
| **Evidências necessárias** | Records Core com 5 tabelas funcionando; hash por registro (SHA-256 real); ledger A3 com trigger de bloqueio; addendum funcionando; exportação fiscalizatória com manifesto; teste de imutabilidade (UPDATE/DELETE bloqueados em selado); test suite de canonicalização congelada; migration guard em CI. |
| **Aprovação necessária** | CTO + consultor regulatório + revisão de segurança. |
| **Testes** | Suite completa de conformidade técnica (seção 10.2 do Design Review); restore drill com verificação de hash; vertical slice completo (criar→selar→verificar→addendum→export→restore). |
| **Documentação** | ADR físico do Records Core; decisões regulatórias D-01/D-02/D-10; política de retenção normativa; threat model; modelo de custódia de chaves; matriz de rastreabilidade (requisito→tabela→teste→evidência). |
| **Riscos** | Assinatura regulatória sem decisão de consultor; offline sem D-03; integração selada entre módulos sem D-10; imutabilidade apenas na aplicação (sem trigger de banco); backup com hash falso ainda em uso. |
| **Quem aprova** | CTO + consultor regulatório habilitado. |

### 11.4 N3 → N4

| Critério | Detalhes |
|---|---|
| **Pré-condição** | Módulo N3 completo; operador interessado; POI (Principal Operations Inspector) do operador envolvido no processo. |
| **Evidências necessárias** | Pacote de submissão completo: suite de conformidade técnica executada com evidências, restore drill documentado, export fiscal verificável, assinatura do tipo aprovado pelo consultor, modo fiscalização testado, política de dispositivos (se aplicável). |
| **Aprovação necessária** | POI do operador via processo ANAC (alteração de MGO/MGM/MOM ou equivalente); processo de autorização por operador, frota e escopo. |
| **Testes** | Teste de substitutição de papel em ambiente controlado antes da autorização; revisão de conformidade pelo consultor regulatório; demonstração de conformidade ao POI. |
| **Documentação** | Todos os artefatos N3 + autorização formal do POI + escopo definido (operador, aeronave/frota, tipo de registro, período de validade da autorização). |
| **Riscos** | Processo de autorização longo; POI pode exigir requisitos adicionais; escopo autorizado pode ser menor do que o esperado; autorização não se transfere para outros operadores. |
| **Quem aprova** | POI do operador, via processo regulatório ANAC. AirTrust não pode auto-aprovar N4. |

---

## 12. Checklist de Classificação de Módulo

Este checklist deve ser preenchido por qualquer novo módulo antes de entrar em produção, e revisado a cada mudança de nível proposto.

```markdown
## Checklist de Governança do Módulo: [Nome do Módulo]
Data: [YYYY-MM-DD]
Versão: [X.Y]
Preenchido por: [nome]
Revisado por: [nome]

### 1. Identificação
- [ ] Nome do módulo:
- [ ] Chave em modules.ts:
- [ ] Nível proposto (N0/N1/N2/N3/N4):
- [ ] Nível anterior (se houver):
- [ ] Justificativa da classificação:

### 2. Dados
- [ ] Tipo de dados: ( ) Mockados ( ) Reais ( ) Regulados
- [ ] Os dados são isolados por empresa_id em todas as queries?
- [ ] Há dados pessoais (LGPD)? Se sim, quais campos?
- [ ] Base legal para tratamento dos dados pessoais:
- [ ] Os dados mockados (se houver) são claramente distinguíveis de dados reais?

### 3. Fonte oficial
- [ ] Qual é a fonte oficial dos dados deste módulo?
- [ ] Este módulo é fornecedor de outros módulos? Quais?
- [ ] Este módulo consome dados de outros módulos? Quais?
- [ ] Existem possíveis conflitos de fonte? Como são resolvidos?
- [ ] A regra de precedência está documentada?

### 4. Ações críticas
- [ ] Liste as ações mais críticas do módulo (salvar, assinar, exportar, gerar OS, etc.):
- [ ] As ações estão adequadas ao nível proposto (seção 5.2)?
- [ ] Botões de ação oficial estão desabilitados/marcados se o módulo for N0?

### 5. Audit log
- [ ] Nível de audit log: ( ) A0 ( ) A1 ( ) A2 ( ) A3
- [ ] Eventos mínimos implementados ou planejados:
- [ ] Política de retenção de logs:
- [ ] Exportação de audit trail disponível?

### 6. Exportação
- [ ] Tipo de exportação: ( ) Simples ( ) Gerencial ( ) Evidência ( ) Fiscalizatória ( ) Pacote regulado
- [ ] O export inclui cabeçalho com nível do módulo, data e empresa?
- [ ] Dados pessoais estão protegidos na exportação?
- [ ] Hash/manifesto obrigatório? (Sim para N3/N4)

### 7. Assinatura
- [ ] Módulo exige assinatura? Qual tipo?
- [ ] O tipo de assinatura foi validado com consultor? (Obrigatório para N3/N4)
- [ ] A assinatura cobre: hash do registro, papel do assinante e timestamp do servidor?

### 8. Backup e recuperabilidade
- [ ] O módulo depende do backup padrão do AirTrust?
- [ ] O backup usa SHA-256 real do pacote? (Obrigatório — não placeholder)
- [ ] Existe restore drill documentado com verificação de integridade?

### 9. Retenção
- [ ] Política de retenção definida?
- [ ] Prazos regulatórios identificados (se aplicável)?
- [ ] Exclusão permitida? Se não, por quê?

### 10. Riscos
- [ ] Qual o risco se o módulo for classificado um nível abaixo do real?
- [ ] Qual o risco se o módulo for classificado um nível acima do real?
- [ ] Há risco de confusão com módulo regulado por parte de usuários?

### 11. Dependências
- [ ] Depende de Records Core? (Obrigatório para N3/N4)
- [ ] Depende de consultor regulatório? Para quais decisões?
- [ ] Depende de migration com estrutura nova? Foi aprovada?

### 12. Impacto regulatório
- [ ] Este módulo toca registros obrigatórios pela ANAC? Quais?
- [ ] O uso do módulo pode criar obrigação regulatória para o operador?
- [ ] Há consulta regulatória necessária antes de ir a produção em N3/N4?

### 13. Banner
- [ ] Banner implementado conforme seção 4?
- [ ] Banner é permanente e não dispensável (para N0)?
- [ ] Banner aparece em exportações e PDFs?

### Resultado
- [ ] Nível aprovado: (N0/N1/N2/N3/N4)
- [ ] Data de aprovação:
- [ ] Próxima revisão prevista:
- [ ] Lacunas abertas e responsável:
```

---

## 13. Requisitos para Configuração no Sistema (Proposta Futura)

Esta seção propõe como o AirTrust deveria representar a governança de módulos no sistema no futuro. **Nenhuma migration deve ser criada a partir deste texto sem aprovação explícita.**

### 13.1 Metadados propostos por módulo

Proposta de extensão do tipo `ProductModule` em `src/react-app/lib/modules.ts`:

```typescript
// PROPOSTA FUTURA — não implementar sem aprovação
interface ProductModuleGovernance {
  key: string;

  // Maturidade e evidência
  maturity_level: 'N0' | 'N1' | 'N2' | 'N3' | 'N4';
  evidence_level: 'A0' | 'A1' | 'A2' | 'A3';

  // Escopo regulatório
  regulatory_scope: string | null;  // ex.: "RBAC 135 / eDB", "RBAC 145 / SDRMe", null
  is_prototype: boolean;
  is_regulated: boolean;

  // Records Core
  requires_records_core: boolean;
  requires_signature: boolean;
  requires_hash: boolean;
  requires_fiscal_export: boolean;
  requires_device_control: boolean;

  // Fonte de dados
  official_data_source: string;  // ex.: "AirTrust", "SIGVOOS/FIRA", "Papel (atual)", "AirTrust eDB (futuro N4)"

  // Ações permitidas por nível — o que pode ser feito em cada nível
  allowed_actions_by_level: {
    save: boolean;
    delete: boolean;
    sign: boolean;
    export: boolean;
    print: boolean;
    generate_os: boolean;
    generate_official_report: boolean;
    fiscal_export: boolean;
    offline_sync: boolean;
  };

  // UI
  banner_required: boolean;
  banner_text: string;
  banner_severity: 'destructive' | 'warning' | 'info' | 'success';
}
```

### 13.2 Configuração proposta no banco (futura)

Proposta de tabela para persistir governança de módulos (sem criar migration agora):

```sql
-- PROPOSTA CONCEITUAL — não criar sem aprovação
CREATE TABLE module_governance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_key TEXT NOT NULL UNIQUE,
  maturity_level TEXT NOT NULL CHECK (maturity_level IN ('N0','N1','N2','N3','N4')),
  evidence_level TEXT NOT NULL CHECK (evidence_level IN ('A0','A1','A2','A3')),
  is_prototype INTEGER NOT NULL DEFAULT 0,
  is_regulated INTEGER NOT NULL DEFAULT 0,
  requires_records_core INTEGER NOT NULL DEFAULT 0,
  requires_signature INTEGER NOT NULL DEFAULT 0,
  requires_hash INTEGER NOT NULL DEFAULT 0,
  requires_fiscal_export INTEGER NOT NULL DEFAULT 0,
  requires_device_control INTEGER NOT NULL DEFAULT 0,
  official_data_source TEXT NOT NULL,
  regulatory_scope TEXT,
  banner_text TEXT,
  banner_severity TEXT,
  last_reviewed_at TEXT,
  reviewed_by TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 13.3 Painel de governança proposto (futuro)

Uma página administrativa (`/admin/governance`) deveria exibir:
- Tabela com todos os módulos e seu nível atual/alvo.
- Status de conformidade por nível (quantos critérios atendidos).
- Alertas para módulos onde banner não está implementado.
- Histórico de mudanças de nível.
- Link para o checklist preenchido de cada módulo.

---

## 14. Roadmap de Implementação

### Fase 1 — Documentar padrão (atual — concluída com este documento)

**Objetivo:** estabelecer o padrão formal de governança, evidência e maturidade.
**Entregáveis:** este documento (`AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`).
**Riscos:** padrão mal comunicado à equipe; matriz de módulos desatualizada.
**Modelo recomendado:** Sonnet 4.6 (documentação, análise).

### Fase 2 — Mapear módulos atuais (imediato)

**Objetivo:** revisar a matriz da seção 3, confirmar níveis e lacunas com a equipe, e priorizar módulos.
**Entregáveis:** matriz validada pela equipe; backlog de lacunas por módulo; decisão sobre quais módulos serão promovidos em cada sprint.
**Riscos:** desacordo sobre o nível de módulos importantes; pressão comercial para classificar módulo N0/N1 como N3.
**Modelo recomendado:** Sonnet 4.6 + validação humana.

### Fase 3 — Padronizar banners e labels (curto prazo)

**Objetivo:** implementar banners conformes em todos os módulos, começando pelos N0 (MRO, Controle de Voos).
**Entregáveis:** componente `ModuleBanner` padronizado, com suporte a todos os cinco níveis; implementação em todos os módulos; banner em exports e PDFs.
**Riscos:** banners inconsistentes entre módulos; banner dispensável em N0.
**Modelo recomendado:** Sonnet 4.6 ou Haiku 4.5 (implementação de UI).

### Fase 4 — Bloquear ações oficiais em protótipos (curto prazo)

**Objetivo:** garantir que módulos N0 não tenham botões com aparência de ação oficial sem desabilitar/explicar.
**Entregáveis:** auditoria de todas as ações em módulos N0; botões desabilitados ou com toast explicativo; teste de regressão.
**Riscos:** ação importante esquecida na auditoria; UX demonstrativa confundida com funcional.
**Modelo recomendado:** Sonnet 4.6 (auditoria + implementação).

### Fase 5 — Adicionar metadados de maturidade em modules.ts (médio prazo)

**Objetivo:** estender `ProductModule` com `maturity_level`, `evidence_level`, `is_prototype`, `requires_records_core`, etc.
**Entregáveis:** tipo `ProductModuleGovernance` em modules.ts; migração dos módulos existentes para o novo tipo; banner derivado dos metadados.
**Riscos:** refatoração de módulos que consomem `ProductModule`; desalinhamento entre metadados e implementação real.
**Modelo recomendado:** Sonnet 4.6 (refatoração tipada).

### Fase 6 — Criar painel administrativo de governança de módulos (médio prazo)

**Objetivo:** visibilidade centralizada do estado de governança de todos os módulos.
**Entregáveis:** página `/admin/governance`; tabela com nível atual/alvo por módulo; status de critérios; alertas de não conformidade.
**Riscos:** painel desatualizado se não for integrado aos metadados em modules.ts.
**Modelo recomendado:** Sonnet 4.6 (frontend dashboard).

### Fase 7 — Integrar audit levels (médio prazo)

**Objetivo:** elevar módulos N1 para A1, módulos N2 para A2.
**Entregáveis:** audit log A2 em Qualificações, FRMS, LMS, SGSO; restore drill com verificação de hash dos artefatos (backup SHA-256 real já implementado em `da5177af`).
**Riscos:** audit log A2 incompleto; restore drill sem verificação pós-restore de record_hash.
**Modelo recomendado:** Sonnet 4.6 (implementação) + Opus 4.8 (revisão de auditoria).

### Fase 8 — Integrar Records Core em módulos N3/N4 (longo prazo)

**Objetivo:** implementar o núcleo mínimo do Records Core (5 tabelas) e elevar o primeiro módulo a N3.
**Entregáveis:** Records Core (5 tabelas, triggers, hash chain, ledger A3, addendum, export fiscal); primeiro módulo regulado (provavelmente eDB ou certificado LMS regulatório); suite de testes de conformidade; ADR físico aprovado; consultor regulatório respondeu D-01/D-02/D-03/D-10.
**Riscos:** `audit_events_v2` não é ledger imutável (precisa de tabela nova); migrations sem governança de reanexação de triggers; integração selada entre módulos bloqueada por D-10 pendente. Backup SHA-256 real já está implementado (`da5177af`).
**Modelo recomendado:** Codex 5.5 (ADR + schema design); Codex 5.5 (implementação Records Core); Opus 4.8 (revisão de segurança).

---

## 15. Riscos de Não Adotar o Padrão

| Risco | Cenário | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| **Protótipo confundido com sistema oficial** | Gestor do operador usa MRO N0 (mockado) como se fosse o sistema oficial de manutenção. Apresenta prints em fiscalização. | Alta (UX navegável é convincente) | Muito alto (infração do operador; responsabilidade do AirTrust) | Banner N0 permanente; desabilitar ações oficiais; contrato de uso claro |
| **Gestor usando dados mockados em decisão real** | Dados fictícios de MRO/Controle de Voos usados para planejamento de manutenção real. | Alta | Alto (decisão errada com base em dado falso) | Banner N0 + dados claramente identificados como mockados |
| **Usuário imprimindo relatório demonstrativo** | Relatório de Controle de Voos com dados mockados impresso e arquivado como se fosse operacional. | Média | Alto | Watermark "DEMONSTRAÇÃO" em todo PDF; desabilitar impressão ou marcar obrigatoriamente |
| **Auditor recebendo export errado** | Export de módulo N1 sem histórico enviado para processo que exigiria evidência N2. | Média | Alto (evidência insuficiente; processo invalidado) | Cabeçalho de nível em todo export; checklist de exportação para usuário |
| **Módulo operacional sem fonte oficial** | FRMS calcula fadiga com base em jornada planejada (Escalas AirTrust) quando deveria usar jornada real (SIGVOOS/FIRA). | Alta (já ocorreu em parte) | Alto (análise de fadiga incorreta; decisão de gestão errada) | Declaração de fonte oficial obrigatória; alertas quando fonte não é a oficial |
| **Módulo evidencial sem audit log** | Qualificações apresentadas como evidência em processo trabalhista, mas sem histórico de alterações. | Média | Alto | Implementar A2 em Qualificações; exportação com histórico |
| **Módulo regulado sem assinatura** | eDB (futuro) selado e exportado sem assinatura válida; ANAC questiona autenticidade. | Baixa (futuro) | Muito alto | Não lançar N3 sem assinatura validada por consultor (D-01/D-02) |
| **Divergência entre sistemas** | RDV no AirTrust diverge de jornada no SIGVOOS/FIRA; dois sistemas divergem em fiscalização. | Alta | Alto (divergência indefensável em fiscalização) | Declarar fonte oficial; regra de precedência; sincronização rastreável |
| **Retrabalho com ANAC** | Operador solicita autorização de uso do eDB ao POI, mas o sistema não tem os requisitos técnicos da Resolução 458. | Alta (se tentar antes de N3) | Muito alto (tempo, custo, credibilidade) | Só buscar autorização do POI após N3 completo e validado por consultor |
| **Exposição LGPD** | Export fiscal com dados pessoais de tripulantes fora do escopo da fiscalização. | Média | Alto (multa LGPD; dano à reputação) | Escopo mínimo obrigatório; mascaramento fora do escopo; DPO envolvido |
| **Backup com hash falso declarado como evidência** | ~~Backup atual (digest placeholder)~~ **RESOLVIDO** em `da5177af` — SHA-256 real implementado. Risco remanescente: restore drill ainda não verifica integridade pós-restore dos record_hash. | Baixa (digest corrigido) | Alto (se drill não existir) | Implementar restore drill com verificação de hash (Fase 7) |
| **Upgrade de nível sem critérios** | Time classifica FRMS como N3 por pressão comercial, sem Records Core implementado. Gestor apresenta export FRMS como registro regulado. | Média | Muito alto | Este padrão + aprovação de CTO + consultor como portão de N3 |

---

## 16. Próxima Etapa Recomendada

### 16.1 Concluído — correção do backup ✅

**Resolvido em:** commit `da5177af` (2026-06-14).

- Digest SHA-256 real implementado via `crypto.subtle.digest` em `gerarChecksumBackup`.
- TypeError `toISOString` corrigido em `normalizarObjetoR2` via `formatarUploadedAt`.
- Teste unitário adicionado: `worker-airtrust/src/__tests__/services/backup-orchestrator.test.ts`.

### 16.2 Concluído — banners e metadados de maturidade ✅

**Resolvido em:** commits da sessão atual.

- `ModuleMaturityLevel`, `ModuleEvidenceLevel` e campos de governança adicionados em `modules.ts`.
- MRO e Controle de Voos classificados como N0/A0.
- `ModuleGovernanceBanner` reutilizável criado (N0–N4).
- Banners N0 aplicados via PageShell em 9+10 páginas (cobertura 100%).
- Ações N0 desabilitadas ou marcadas como protótipo em todos os módulos.

### 16.3 Próxima etapa — restore drill (Sonnet 4.6)

**O que fazer:** implementar restore drill que verifica integridade dos hashes após restauração. O backup já gera SHA-256 real; agora é preciso provar que o hash é verificável pós-restore.

**Modelo:** Sonnet 4.6.

**Prompt sugerido:**
```
Você está no monorepo AirTrust. Use produção segura (airtrust-production-safe).
Leia worker-airtrust/src/services/backup/orchestrator.ts e
worker-airtrust/src/__tests__/services/backup-orchestrator.test.ts.

Objetivo: criar um runbook (docs/) de restore drill que:
1. Liste os passos para restaurar um backup D1 em ambiente temporário.
2. Especifique como verificar o checksum-manifest.json pós-restore (recomputar SHA-256
   de cada artefato e comparar com o manifesto).
3. Documente o critério de PASS/FAIL (hash idêntico = PASS; divergência = FAIL + ação).
4. Proponha um script bash de verificação de manifesto (sem executar em produção).

Não alterar código de produção. Não fazer deploy. Apenas documentação e script de verificação.
```

### 16.4 Médio prazo — A2 em módulos prioritários (Sonnet 4.6)

**O que fazer:** elevar o audit log de Qualificações, FRMS e LMS para A2.

**Modelo:** Sonnet 4.6 (implementação), Opus 4.8 (revisão de segurança).

### 16.4 Longo prazo — Records Core e N3 (Codex 5.5)

**O que fazer:** criar o ADR físico do Records Core (núcleo mínimo, 5 tabelas), incorporando as críticas do Red Team Review. Implementar após consultor regulatório responder D-01/D-02/D-03/D-10.

**Modelo recomendado:** Codex 5.5 para ADR e implementação.

**Prompt sugerido (quando chegar o momento):**
```
Você está no monorepo AirTrust. Use produção segura (airtrust-production-safe).
Modelo recomendado: Codex 5.5.

Leia obrigatoriamente, nesta ordem:
1. docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md  (autoridade — é a crítica adversarial)
2. docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md    (design base)
3. docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md  (este padrão)
4. worker-airtrust/migrations/0385_audit_events_v2.sql   (entender o que NÃO é ledger)
5. worker-airtrust/src/services/backup/orchestrator.ts   (verificar que digest foi corrigido)

Objetivo: produzir, SEM IMPLEMENTAR, o ADR físico do núcleo mínimo do Records Core
(5 tabelas: regulated_records, regulated_record_versions, regulated_record_hashes,
regulated_audit_events, regulated_addenda).

O ADR deve responder às críticas RT-02, RT-03, RT-04, RT-05, RT-09 do Red Team Review.
Não criar migrations. Não alterar código. Apenas documentação.
```

---

## Entregáveis desta documentação (resumo para o próximo agente)

1. **Documento criado:** `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`

2. **Sumário executivo:** cinco confusões críticas identificadas; hierarquia N0→N4 definida; nenhum módulo AirTrust é N4 hoje.

3. **Tabela N0–N4:** cada nível define 17 atributos — uso, dados, banner, RBAC, audit, backup, export, assinatura, hash, fiscalização, Records Core e risco de classificação errada.

4. **Classificação inicial dos módulos:**
   - N0 (protótipo): MRO, Controle de Voos, DB Digital (futuro), SDRMe (futuro)
   - N1 (operacional): Funcionários, Escalas, Simuladores, Treinamentos, Dashboard, Hospedagem
   - N1→N2 (transição): FRMS, Qualificações, LMS, SGSO
   - N/A (infra): Regulated Records Core (futuro, pré-requisito de N3)

5. **Mudanças recomendadas no sistema:**
   - Imediato: corrigir digest de backup (`orchestrator.ts:507`)
   - Curto prazo: componente `ModuleBanner` padronizado; metadados de maturidade em `modules.ts`; auditoria de botões N0
   - Médio prazo: audit log A2 em FRMS, Qualificações, LMS, SGSO; restore drill com SHA-256 real
   - Longo prazo: Records Core (5 tabelas) após ADR físico e consultor regulatório (D-01/D-02/D-10)

6. **Próximo prompt recomendado:** corrigir backup (`orchestrator.ts`) com Sonnet 4.6; depois banners e `modules.ts`; depois A2; depois Codex 5.5 para ADR do Records Core.

---

*Documento criado por Claude Sonnet 4.6 — 2026-06-14*
*Com base em: ANAC_RECORDS_CORE_DESIGN_REVIEW.md, ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md, ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md, ANAC_BRIEFING_CONSULTOR_REGULATORIO.md, src/react-app/lib/modules.ts*
*Não é orientação jurídica/regulatória — validar com consultor habilitado antes de qualquer uso em processo regulatório.*
