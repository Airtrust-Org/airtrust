# AirTrust — Plano Mestre para Sistemas Regulados ANAC

> **Tipo:** Plano mestre estratégico — produto + regulação + tecnologia
> **Data:** 2026-06-14
> **Versão:** v1.0 — documento interno; **NÃO submetido à ANAC**; **não é parecer regulatório**
> **Autor:** AirTrust Engineering
> **Escopo:** decisão macro sobre o caminho do AirTrust rumo a uso regulado futuro (eDB, SDRMe, Controle de Voos), com o Regulated Records Core como fundação técnica.
>
> **AVISO LEGAL E DE ESCOPO**
> Nada neste documento afirma que o AirTrust está "homologado", "certificado", "aprovado" ou "autorizado" pela ANAC. A ANAC **não homologa software genericamente**: o caminho real é **aceitação/autorização por operador/OMA e por escopo**, mediante pleito do próprio regulado ao seu POI, sob a Resolução 458/2017. Este plano é estratégico e **não** autoriza código, alteração de frontend/backend, criação ou aplicação de migrations, deploy, mexer em secrets, nem commit. Não transforma nenhum módulo em sistema regulado. Toda dúvida regulatória não resolvível por fonte oficial permanece marcada como `PENDENTE DE CONFIRMAÇÃO COM ANAC`.

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [As três trilhas (Regulatória / Produto / Técnica)](#2-as-três-trilhas)
3. [Opções de primeiro escopo (A–F)](#3-opções-de-primeiro-escopo)
4. [Recomendação do primeiro escopo](#4-recomendação-do-primeiro-escopo)
5. [Relação entre primeiro escopo e Records Core](#5-relação-entre-primeiro-escopo-e-records-core)
6. [Roadmap 30 / 60 / 90 / 180 dias](#6-roadmap-30--60--90--180-dias)
7. [Decisões bloqueantes](#7-decisões-bloqueantes)
8. [O que NÃO fazer agora](#8-o-que-não-fazer-agora)
9. [Plano de conversa futura com ANAC](#9-plano-de-conversa-futura-com-anac)
10. [Pacote de evidências necessário](#10-pacote-de-evidências-necessário)
11. [Modelo de execução com IA](#11-modelo-de-execução-com-ia)
12. [Riscos estratégicos](#12-riscos-estratégicos)
13. [Decisão final recomendada](#13-decisão-final-recomendada)
14. [Próximo prompt recomendado](#14-próximo-prompt-recomendado)

> **Documentos de referência consolidados:**
> `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md`,
> `docs/REGULATED_RECORDS_CORE_PROMOTION_READINESS.md`,
> `docs/ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md`,
> `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`,
> `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`,
> `docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md`,
> `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`,
> `docs/BACKUP_RESTORE_DRILL.md`,
> `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`,
> `docs/CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md`,
> `TECHNICAL_DEBT.md`, `SECURITY.md`, `AUTH_RBAC_MULTITENANCY.md`, `ARCHITECTURE_OVERVIEW.md`, `DATABASE_SCHEMA.md`, `FRMS_ARCHITECTURE.md`, `LMS_ARCHITECTURE.md`.

---

## 1. Sumário executivo

### 1.1 Onde o AirTrust está hoje

O AirTrust é uma plataforma SaaS multi-tenant de gestão de operações aéreas, **em produção com dados reais**, cobrindo Funcionários, Qualificações, Escalas/EVD, FRMS, LMS e SGSO. Sobre essa base operacional existem **protótipos navegáveis com mock data** (MRO e Controle de Voos) e uma **ambição regulatória** documentada (eDB, SDRMe, Controle de Voos como registros oficiais).

O estado factual, sem otimismo, é:

- **Nenhum módulo é regulado.** O AirTrust **não está homologado, certificado, aceito ou autorizado** pela ANAC, e a ANAC não emite homologação genérica de software.
- **MRO e Controle de Voos são protótipos (N0)** — UX navegável, dados mockados, sem persistência regulada.
- **eDB/DB Digital não existe.** **SDRMe não existe.**
- **O Records Core não existe como sistema real.** Existe apenas uma **migration experimental isolada** em `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`, em status **`development-local candidate`**, fora da cadeia normal de migrations, validada só em SQLite temporário.
- **FRMS é operacional (N1), mas NÃO é um SGRF aprovado** — exceder limites prescritivos do RBAC 117 exige GRF aceito pela ANAC.
- **Backup:** o digest falso foi corrigido (commit `da5177af`, SHA-256 real); existe restore drill **local**; **não existe** restore drill em **staging descartável** com verificação pós-restore de domínio/`record_hash`/chain.
- **Sem consultor regulatório.** O levantamento normativo é interno, a partir de fontes oficiais; há **23 dúvidas** `PENDENTE DE CONFIRMAÇÃO COM ANAC`.
- **Decisões macro abertas:** assinatura (ICP-Brasil vs Gov.br vs CANAC/interna), assinatura offline, PWA vs app nativo, fonte oficial (RDV vs eDB vs MRO), escopo inicial.

### 1.2 Qual é a ambição regulatória

Permitir, no futuro, que **operadores e OMAs clientes do AirTrust** instruam seus próprios pleitos junto à ANAC para usar, como registros oficiais que substituem ou complementam o papel:

1. **DB Digital / eDB** em tablet/PED (Res. 773/2025 + Portaria 3.220/2019, sob a Res. 458);
2. **SDRMe / manutenção digital** (IS 43.9-004 + RBAC 43, sob a Res. 458);
3. **Controle de Voos / RDV / OCC** como fonte única operacional;
4. integração desses escopos com **FRMS, MRO, SGSO, Funcionários, Qualificações e LMS**;
5. tendo o **Regulated Records Core** como fundação técnica horizontal (integridade, autenticidade, imutabilidade, auditoria, backup verificável, exportação fiscal).

### 1.3 Por que ainda não podemos tratar nada como homologado/autorizado

- A ANAC **não homologa software**. O ato existente é **aceitação/autorização por regulado e por escopo** (qual operador/OMA, qual frota/aeronave, quais registros substituídos), via pleito do regulado ao POI. Um produto, isoladamente, **nunca** está "autorizado".
- A Res. 458 impõe horizontalmente: cripto assimétrica, hash, **assinatura com não-repúdio (13 propriedades)**, backup separado com restauração verificada, auditoria, disponibilidade para fiscalização, exportação aceitável, correção sem apagamento — e, no **Art. 3º**, autorização expressa de escopo + demonstração de segurança (ISO 27000 / Blockchain / cópia em BD ANAC). **Nada disso existe pronto** no AirTrust hoje.
- Existem **23 dúvidas regulatórias abertas** que mudam o desenho (tipo de assinatura, offline obrigatório vs contingência, retenção, formato fiscal, etc.).
- Usar "homologado/certificado/regulado" hoje é **risco jurídico e comercial direto**.

### 1.4 Por que não devemos continuar implementando fundação abstrata sem escolher um primeiro produto

O risco mais concreto e já diagnosticado (red team, §1) é o **big-design-up-front**: "construir o ledger genérico perfeito e nunca chegar ao eDB". O Records Core já foi reduzido de 11 para 5 tabelas justamente por isso. Continuar endurecendo o core **sem um consumidor real** produz:

- esforço técnico que **não gera valor operacional**;
- decisões de design tomadas no vácuo (sem saber o que o primeiro produto exige de fato);
- a ilusão de progresso regulatório sem nenhum registro real existindo.

A fundação só deve avançar **na medida exata** do que o primeiro produto consome — e o restante deve ser deliberadamente adiado.

### 1.5 Qual decisão macro precisa ser tomada agora

**Escolher um primeiro escopo de produto real, não regulado (N1 operacional), que gere valor imediato, valide com usuários reais e funcione como o "alimentador" natural do futuro eDB — e tratar o Records Core apenas como uma fundação que evolui por um vertical slice mínimo não regulado, sem expansão especulativa.**

A recomendação deste plano (§4) é: **começar pelo Controle de Voos / OCC / RDV, como módulo operacional N1 (não regulado)**, mantendo o Records Core em hardening apenas via o vertical slice de evidência de governança. eDB e SDRMe regulados ficam adiados até decisões de assinatura/offline e respostas da ANAC.

---

## 2. As três trilhas

Para sair das microtarefas, o trabalho é separado em **três trilhas paralelas e independentes**, cada uma com dono conceitual distinto. Elas se sincronizam em marcos, mas não se bloqueiam no dia a dia.

### Trilha A — Regulatória / ANAC

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Fechar o entendimento normativo, mapear dúvidas, preparar o pacote de evidências e definir o caminho de aceitação/autorização por operador/escopo — sem prometer homologação. |
| **Entregáveis** | (1) Matriz normativa fechada (artigo → requisito → módulo → evidência), evoluindo a `ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`; (2) lista de 23 dúvidas refinada e priorizada; (3) plano de conversa formal com ANAC/POI (§9); (4) decisão sobre a via do Art. 3º da Res. 458; (5) esqueleto do pacote de evidências (§10). |
| **Decisões pendentes** | Contratar ou não consultor regulatório; via do Art. 3º (ISO 27000 / Blockchain / cópia BD ANAC); tipo de assinatura por registro; offline obrigatório vs contingência; retenção; precedência RDV×eDB; formato fiscal; operador piloto. |
| **Riscos** | Levantamento interno interpretar norma errado sem consultor; ANAC exigir escopo diferente do previsto; assumir vigência/revisão de norma não confirmada (várias 🟡 no dossiê); confundir "preparar pacote" com "estar autorizado". |
| **Próximos marcos** | M-A1 (30d): matriz e 23 dúvidas priorizadas. M-A2 (90d): decisão sobre consultor + via Art. 3º + plano de conversa pronto. M-A3 (180d): primeira conversa exploratória ANAC/POI (sem entregar nada como pronto). |

### Trilha B — Produto

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Escolher e construir o **primeiro escopo/produto**, gerando valor operacional real, **sem** construir Records Core sem consumidor e **sem** criar nada regulado. |
| **Entregáveis** | (1) Decisão formal do primeiro escopo (este plano recomenda Controle de Voos N1); (2) MVP operacional não regulado com dados demonstrativos; (3) validação com usuários reais; (4) banners N0/N1 e governança de superfície conforme `AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`. |
| **Decisões pendentes** | Confirmar Controle de Voos como primeiro escopo; definir submódulos do MVP (Dashboard OCC, Programação, RDV operacional); definir operador piloto; definir o que do APUS RMCV / Sigvoos será substituído primeiro. |
| **Riscos** | Construir o produto errado primeiro; protótipo mockado virar operação sem controle; RDV operacional ser confundido com registro oficial; escopo inflar para eDB cedo demais. |
| **Próximos marcos** | M-B1 (30d): escopo confirmado + design do MVP. M-B2 (60d): MVP Controle de Voos N1 com dados demonstrativos. M-B3 (90d): piloto interno controlado. |

### Trilha C — Técnica

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Endurecer o **Records Core** apenas o necessário; preparar (sem implementar prematuramente) assinatura, imutabilidade, backup/restore, exportação, modo fiscalização e tablet/offline. |
| **Entregáveis** | (1) Fase 1 de hardening local do Records Core (chain head/serialização/retry, teste de concorrência, restore drill em D1 temporário, recomputação pós-restore); (2) threat model aprovado; (3) abstração de provider de assinatura **sem validade jurídica declarada**; (4) restore drill em staging descartável (BACKUP-002); (5) decisões técnicas sobre `regulated_record_links` e `regulated_addenda`. |
| **Decisões pendentes** | Mecanismo runtime de serialização (retry transacional vs tabela chain head vs Durable Object vs fila); manter/adiar `regulated_record_links` no primeiro slice; criar/adiar `regulated_addenda`; nomenclatura final; plano de rollback de migration regular. |
| **Riscos** | Overengineering da fundação; trigger de imutabilidade removida por migration futura; cross-tenant sem service layer obrigatório; assinatura/offline implementados antes da decisão regulatória; mover a migration experimental para a cadeia canônica por acidente. |
| **Próximos marcos** | M-C1 (30–60d): Fase 1 hardening local + threat model. M-C2 (90d): restore drill em staging descartável autorizado. M-C3 (180d): só então avaliar promoção para migration regular de desenvolvimento. |

> **Regra de sincronização entre trilhas:** a Trilha C **não** avança para assinatura jurídica, offline regulado ou integração selada sem que a Trilha A entregue as decisões correspondentes (portões pós-consultor, red team §15). A Trilha B **não** rotula nada como regulado sem a Trilha A.

---

## 3. Opções de primeiro escopo

Avaliação das seis opções. Escalas: valor operacional, complexidade, esforço (Baixo/Médio/Alto); proximidade regulatória e risco de confusão (Baixo/Médio/Alto — aqui "alto" é desfavorável); dependências (Sim/Não/Parcial).

### Opção A — DB Digital / eDB primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | Alto (substitui o DB em papel) |
| Proximidade regulatória | **Máxima** — é o registro oficial por excelência |
| Complexidade técnica | Alta |
| Dependência de assinatura | **Sim, crítica** (PIC/operador, não-repúdio) |
| Dependência de tablet/offline | **Sim, crítica** (PED a bordo, ≥30 dias) |
| Risco de confusão com regulado | **Altíssimo** |
| Dependência de ANAC | **Total** (Res. 773, Portaria 3.220, LOA) |
| Integração com módulos | Funcionários, Qualificações, Escalas/EVD, Controle de Voos, Records Core |
| Esforço estimado | Alto |
| Benefício para a empresa | Alto, mas só após autorização |
| **Recomendação** | **ADIAR** — depende de tudo que ainda não está decidido. |

### Opção B — SDRMe / Manutenção digital primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | Alto (OS, task cards, RAS digitais) |
| Proximidade regulatória | **Máxima** (RAS sem assinatura = aeronave não voa) |
| Complexidade técnica | Alta |
| Dependência de assinatura | **Sim, crítica** (RAS, possivelmente ICP A3) |
| Dependência de tablet/offline | Parcial |
| Risco de confusão com regulado | **Altíssimo** |
| Dependência de ANAC | **Total** (IS 43.9-004, RBAC 43/145, MGM/MOM) |
| Integração com módulos | MRO (protótipo), Qualificações, LMS, Records Core |
| Esforço estimado | Alto |
| Benefício para a empresa | Alto, mas só após autorização |
| **Recomendação** | **ADIAR** — assinatura crítica e revisão da IS ainda não confirmada. |

### Opção C — Controle de Voos / OCC / RDV primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | **Altíssimo** — elimina dupla digitação APUS↔Sigvoos, fonte única de verdade |
| Proximidade regulatória | **Baixa/Média se construído como N1 operacional** (o RDV vira oficial só depois, sob autorização) |
| Complexidade técnica | Média (sobre módulos existentes) |
| Dependência de assinatura | **Não** (no MVP operacional) |
| Dependência de tablet/offline | **Não** (OCC é desktop) |
| Risco de confusão com regulado | Médio — mitigável com banners N1 e RDV marcado como operacional |
| Dependência de ANAC | **Baixa** enquanto N1 operacional |
| Integração com módulos | **Máxima** — Funcionários, Qualificações, Escalas/EVD, FRMS, MRO, Sigvoos |
| Esforço estimado | Médio |
| Benefício para a empresa | **Imediato** — resolve dor real já existente (APUS RMCV) |
| **Recomendação** | **FORTE** — maior valor, menor dependência regulatória, alimenta eDB depois. |

### Opção D — MRO operacional primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | Médio/Alto (controle de horas/ciclos/componentes) |
| Proximidade regulatória | Média (vira SDRMe regulado depois) |
| Complexidade técnica | Média/Alta |
| Dependência de assinatura | Parcial (RAS já é território SDRMe) |
| Dependência de tablet/offline | Não |
| Risco de confusão com regulado | Médio |
| Dependência de ANAC | Baixa enquanto N1 |
| Integração com módulos | Depende de horas/ciclos do **Controle de Voos** para ser útil |
| Esforço estimado | Médio/Alto |
| Benefício para a empresa | Médio sem o feeder de RDV |
| **Recomendação** | **POSSÍVEL — segunda prioridade**, depois do Controle de Voos (que o alimenta). |

### Opção E — FRMS / Jornada primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | Já entregue (FRMS é N1 operacional hoje) |
| Proximidade regulatória | Média (SGRF exige GRF aceito; FRMS ≠ SGRF) |
| Complexidade técnica | Baixa/Média (incremental) |
| Dependência de assinatura | Não |
| Dependência de tablet/offline | Não |
| Risco de confusão com regulado | **Médio/Alto** (chamar FRMS de "SGRF aprovado") |
| Dependência de ANAC | Alta para virar SGRF |
| Integração com módulos | Já integrado (Sigvoos, Escalas) |
| Esforço estimado | Baixo (refino) |
| Benefício para a empresa | Incremental |
| **Recomendação** | **POSSÍVEL como refino contínuo**, não como "primeiro escopo" — já existe e melhora junto com o Controle de Voos. |

### Opção F — Records Core puro primeiro

| Critério | Avaliação |
|---|---|
| Valor operacional | **Nenhum direto** (é fundação) |
| Proximidade regulatória | Pré-requisito de tudo, mas sem registro real |
| Complexidade técnica | Alta |
| Dependência de assinatura | A definir |
| Dependência de tablet/offline | A definir |
| Risco de confusão com regulado | Baixo (interno) |
| Dependência de ANAC | Indireta |
| Integração com módulos | Nenhuma sem consumidor |
| Esforço estimado | Alto |
| Benefício para a empresa | **Baixo sem consumidor** (risco de big-design-up-front) |
| **Recomendação** | **NÃO RECOMENDADO COMO ESCOPO ISOLADO.** Apenas hardening mínimo + vertical slice de evidência de governança, em paralelo. |

---

## 4. Recomendação do primeiro escopo

### 4.1 Recomendação explícita

> **Começar pelo Controle de Voos / OCC / RDV, construído como módulo operacional N1 (não regulado), substituindo o fluxo legado APUS RMCV + Sigvoos.**

Não começar por eDB. Não começar por SDRMe. Não começar por Records Core puro.

### 4.2 Justificativa

- **Menor risco regulatório:** construído como N1 operacional, **não depende** de assinatura jurídica, offline/tablet, modo fiscalização ou autorização ANAC. O RDV é tratado como dado operacional, não como registro oficial.
- **Maior valor:** resolve uma dor **real e atual** — a dupla digitação APUS↔Sigvoos, a divergência de dados e a falta de fonte única de verdade (ver `CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md` §1).
- **Menor dependência regulatória:** quase tudo pode ser construído **sem ANAC** e sem esperar as 23 dúvidas.
- **Melhor alinhamento com o AirTrust:** integra-se nativamente a Funcionários, Qualificações, Escalas/EVD, FRMS e MRO — os módulos que já existem.
- **Valida com usuários reais:** a operação (OCC/despacho) usa todos os dias; feedback rápido e concreto.
- **Impacto no Records Core:** o Controle de Voos produz exatamente os dados (voo, RDV, horas, ciclos, pousos) que o **futuro eDB vai formalizar como registro oficial**. Construir o feeder primeiro torna o eDB um passo de "selagem" sobre dados já confiáveis, em vez de um produto do zero. É a sequência natural: **dados operacionais confiáveis → registro regulado**.

### 4.3 Ordem de prioridade

| Prioridade | Escopo | Nível alvo | Observação |
|---|---|---|---|
| **1ª** | **Controle de Voos / OCC / RDV** | N1 operacional | Primeiro escopo. Fonte única de verdade. |
| **2ª** | **MRO operacional** | N1 operacional | Consome horas/ciclos do RDV. Só faz sentido depois do CV. |
| **3ª** | **Records Core — vertical slice de evidência de governança** | Não regulado | Hardening do core via consumidor mínimo, em paralelo, **sem expansão**. |
| Refino contínuo | FRMS / Jornada | N1 (existente) | Melhora junto com o CV; **não** chamar de SGRF. |
| **Adiar** | **eDB / DB Digital** | N3→N4 | Depende de assinatura, offline/tablet, ANAC. Pós-decisões. |
| **Adiar** | **SDRMe** | N3→N4 | Depende de assinatura crítica (RAS), IS 43.9-004 confirmada, ANAC. |

---

## 5. Relação entre primeiro escopo e Records Core

O Controle de Voos N1 **não precisa** do Records Core regulado para entregar valor. Isso é deliberado e evita overengineering.

### 5.1 O que do Records Core é realmente necessário para o Controle de Voos N1

- **Nada do core regulado é obrigatório no MVP N1.** Persistência operacional normal do AirTrust (D1 + `empresa_id`, auditoria v2 existente) é suficiente.
- O que **pode** ser exercitado, opcionalmente e em paralelo, é o **vertical slice de evidência de governança** (`governance_evidence_record`) — um consumidor **não regulado** que valida canonicalização, hash, seal, audit, addendum, export e restore **sem** usar o domínio de voo. Isso endurece o core **sem** acoplá-lo ao Controle de Voos.

### 5.2 O que fica fora (deliberadamente adiado)

- Assinatura (ICP/Gov.br/CANAC), imutabilidade por trigger no domínio de voo, modo fiscalização, exportação fiscal, offline/tablet, device registry, sync sessions, retenção regulada, `regulated_record_links` no domínio real.

### 5.3 O que precisa ser feito antes

- **Trilha B:** desenhar o modelo de dados operacional do Controle de Voos (`cv_*`, já esboçado no benchmark §8) **sem** prefixos/triggers regulados.
- **Trilha C (paralela, opcional):** Fase 1 de hardening local do core + threat model — mas **não** como bloqueador do Controle de Voos.

### 5.4 O que pode esperar

- Toda a fase regulada do core (N3+): assinatura, imutabilidade no domínio real, fiscalização, export fiscal, retenção. Só entram quando o eDB for de fato priorizado, após as decisões da §7.

### 5.5 Como evitar overengineering

- **Regra:** o Records Core só ganha uma capacidade nova quando **um consumidor real a exige**. O Controle de Voos N1 não exige nenhuma; logo, o core só evolui pelo slice de governança, e **nada** de assinatura/offline/fiscalização é construído "para o futuro".
- **Manter** a migration experimental isolada em `migrations_experimental/` e o guard de governança que impede sua entrada na cadeia canônica.

---

## 6. Roadmap 30 / 60 / 90 / 180 dias

> Tudo abaixo é **não regulado**. Nenhuma fase aplica migration em staging/produção, faz deploy, declara homologação ou substitui papel.

### Fase 30 dias — Decisão e desenho

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Travar o primeiro escopo, desenhar o MVP e priorizar a frente regulatória. Nada regulado. |
| **Entregáveis** | (B) Escopo Controle de Voos N1 confirmado; design dos submódulos do MVP (Dashboard OCC, Programação, RDV operacional) e modelo `cv_*` revisado. (A) Matriz normativa e 23 dúvidas priorizadas. (C) Threat model do Records Core iniciado; plano da Fase 1 de hardening local. |
| **Critérios de saída** | Decisão de escopo documentada; backlog do MVP escrito; top-10 dúvidas ANAC priorizadas. |
| **Riscos** | Escopo inflar para eDB; paralisia por falta de consultor. |
| **Modelo de IA** | **Opus** (síntese/decisão de escopo, matriz normativa) + **Sonnet 4.6** (design UX dos submódulos) + **Codex 5.5** (modelo de dados `cv_*`). |

### Fase 60 dias — Primeiro MVP não regulado

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Construir o MVP do Controle de Voos N1 com **dados demonstrativos**, validar fluxo. |
| **Entregáveis** | (B) MVP: Dashboard OCC, Programação de voos, RDV operacional, validação de tripulação contra Qualificações/FRMS; banners N1; export marcado como operacional/não oficial. (C) Fase 1 de hardening local do core concluída (chain head/serialização/retry + teste de concorrência + restore em D1 temporário + recomputação pós-restore); slice `governance_evidence_record` opcional. |
| **Critérios de saída** | MVP navegável com dados demonstrativos ponta a ponta; testes locais verdes; Records Core Fase 1 documentada com evidências. |
| **Riscos** | Mock virar dado operacional sem controle; core consumir tempo do produto. |
| **Modelo de IA** | **Codex 5.5** (backend/dados/integração, hardening do core) + **Sonnet 4.6** (frontend OCC) + **DeepSeek** (documentação operacional). |

### Fase 90 dias — Piloto interno controlado

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Operar o Controle de Voos N1 em **piloto interno controlado**, lado a lado com o fluxo legado, sem substituí-lo. |
| **Entregáveis** | (B) Piloto interno com dados reais não regulados (consentido, escopo limitado); ajustes de fluxo. (A) Matriz normativa refinada + decisão sobre consultor e via do Art. 3º; plano de conversa ANAC pronto. (C) Restore drill em **staging descartável** (BACKUP-002) autorizado e executado; evidências técnicas internas. |
| **Critérios de saída** | Piloto sem divergência crítica vs fluxo legado; auditoria íntegra; pacote inicial de evidências esboçado; decisão go/no-go sobre iniciar **design** de eDB. |
| **Riscos** | Piloto tratado como oficial; restore staging exigir autorização não concedida. |
| **Modelo de IA** | **Codex 5.5** (restore drill, segurança) + **Opus** (decisão go/no-go eDB, refino regulatório) + **DeepSeek** (relatórios de piloto). |

### Fase 180 dias — Preparação de autorização (sem substituir papel)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Preparar — **não executar** — a autorização formal: primeiro operador piloto, transição controlada. |
| **Entregáveis** | (A) Primeira conversa exploratória ANAC/POI (sem entregar nada como pronto); decisões de assinatura/offline encaminhadas. (B) Operador piloto identificado; plano de operação paralela papel+digital. (C) Só **avaliar** promoção do core para migration regular de desenvolvimento, com rollback e governança — **sem aplicar em produção**. |
| **Critérios de saída** | Decisões de assinatura/offline tomadas (§7); operador piloto comprometido; pacote de evidências em construção; **nenhum** papel substituído sem autorização. |
| **Riscos** | Pressão para "ligar" o regulado cedo; operador piloto não pronto; ANAC exigir escopo diferente. |
| **Modelo de IA** | **Opus** (estratégia regulatória, conversa ANAC) + **Codex 5.5** (governança de migration regular, se aprovada) + **Sonnet 4.6** (manuais/UX de transição). |

---

## 7. Decisões bloqueantes

> "Decidir errado" abaixo significa retrabalho caro ou risco regulatório/jurídico. Prazos são recomendações internas.

| # | Decisão | Por que bloqueia | Quem decide | Informação necessária | Consequência de decidir errado | Prazo recomendado |
|---|---|---|---|---|---|---|
| 1 | **Assinatura: ICP-Brasil vs Gov.br vs CANAC/interna** | Define a arquitetura de não-repúdio de todo registro regulado | Liderança + (futuro) consultor + ANAC (D-01/D-02) | Nível aceito por registro (eDB, RAS); Lei 14.063; Res. 458 (13 propriedades) | Refatoração do eDB inteiro; assinatura sem validade jurídica | Antes de iniciar **design** de eDB (≈90–180d) |
| 2 | **Assinatura offline** (assinar no device vs intenção local + selo no servidor) | Define se há chave privada no tablet e atestação de dispositivo | Liderança + consultor + ANAC (D-03/D-04) | Aceitação de assinatura server-side após ato offline | Custódia de chave no device (RT-08); offline inviável | Antes de qualquer offline regulado (≈180d) |
| 3 | **PWA vs app nativo (tablet/PED)** | Muda viabilidade de A3, keystore, atestação, offline | Liderança + consultor (D-05) | RBAC 91/EFB; exigência de app nativo para assinatura | Construir app errado; A3 inviável em PWA | Antes de iniciar eDB tablet (≈180d) |
| 4 | **Fonte oficial: RDV vs eDB vs MRO** (precedência em divergência) | Define qual registro prevalece e o fluxo de dados | Produto + consultor + ANAC (D-RDV×eDB) | Res. 773; IS 135-002; norma de precedência | Dois registros divergentes sem fonte canônica | Antes de eDB consumir RDV (≈90d) |
| 5 | **Escopo inicial: eDB, SDRMe ou Controle de Voos** | Define onde o esforço entra primeiro | Liderança (este plano recomenda **Controle de Voos N1**) | Este plano §3–§4 | Construir o produto errado; gastar em fundação sem consumidor | **Imediato (30d)** |
| 6 | **Operador piloto** | Sem regulado disposto, não há pleito nem validação real | Liderança comercial | Operador com dor real e disposição ao pleito | Pacote de evidências sem destinatário | Até 180d |
| 7 | **Período paralelo papel + digital** | Define transição segura sem substituir papel sem autorização | Operador + ANAC (D-transição) | Exigência de operação paralela mínima | Substituir papel cedo = não conformidade | Antes do piloto regulado (>180d) |
| 8 | **Cache fiscal no tablet (≥30 dias)** | Portaria 3.220 exige PED com últimos 30 dias a bordo | Consultor + ANAC | Confirmar se a 773 altera os 30 dias | eDB reprovado em fiscalização | Antes de eDB tablet (>180d) |
| 9 | **Restore em staging descartável** | Sem restore verificado em domínio, backup não é evidência regulatória | Engenharia + autorização explícita | Ambiente descartável; BACKUP-002 | Recuperabilidade não comprovada | ≈90d |
| 10 | **Modo fiscalização** | Disponibilidade para fiscalização é exigência horizontal da Res. 458 | Produto + consultor | Formato e fluxo aceitos pela ANAC | Registro não fiscalizável | Junto com eDB (>180d) |
| 11 | **Formato de exportação fiscal** (PDF/JSON/XML/CSV + manifesto) | Define interoperabilidade com a fiscalização | Consultor + ANAC (D-23) | Formato aceito + verificação de integridade | Export inaceitável; refação | Antes do pacote de evidências (≈180d) |
| 12 | **Via do Art. 3º da Res. 458** (ISO 27000 / Blockchain / cópia BD ANAC) | Condiciona toda a demonstração de segurança | Liderança + consultor + ANAC (D-02) | Texto integral do Art. 3º; custo de cada via | Estratégia de segurança inteira errada | ≈90–180d |
| 13 | **Consultor regulatório: contratar ou não** | Sem consultor, 23 dúvidas ficam como interpretação interna | Liderança | Orçamento; criticidade do go-to-market regulado | Interpretar norma errado em produção | ≈90d |

---

## 8. O que NÃO fazer agora

- **NÃO** mover a migration experimental de `worker-airtrust/migrations_experimental/` para `worker-airtrust/migrations/`.
- **NÃO** aplicar a migration experimental (ou qualquer derivada) em staging ou produção; **NÃO** usar `wrangler d1 migrations apply` para ela; **NÃO** incluí-la em deploy/CI.
- **NÃO** construir eDB regulado ainda.
- **NÃO** construir SDRMe regulado ainda.
- **NÃO** dizer "homologado", "certificado", "regulado", "aceito" ou "ANAC approved" para nenhum módulo.
- **NÃO** usar protótipos (MRO, Controle de Voos mock) como registro oficial nem imprimir/compartilhar export demonstrativo como dado real.
- **NÃO** implementar assinatura offline (nem assinatura com pretensão jurídica) antes das decisões #1/#2/#3.
- **NÃO** criar app tablet antes de decidir PWA vs app nativo (#3).
- **NÃO** transformar o Controle de Voos mock em operação real **sem** o trabalho N1 controlado (banners, persistência real, governança de superfície).
- **NÃO** continuar expandindo o Records Core (novas tabelas, assinatura, offline, fiscalização) **sem** um consumidor real definido — só o slice de evidência de governança.
- **NÃO** chamar o FRMS de "SGRF aprovado".
- **NÃO** tratar PDF como registro primário (o registro primário é o JSON canônico).
- **NÃO** fazer commit, deploy ou mexer em secrets como parte deste plano.

---

## 9. Plano de conversa futura com ANAC

> Sem consultor, a primeira conversa é **exploratória**, via POI/SAR ou canal oficial (SIC), tratada como **futura consulta** — não como parecer. Objetivo: reduzir incertezas, **não** obter aprovação.

### 9.1 Quais perguntas levar (priorizadas das 23 do dossiê)

1. O fornecedor (AirTrust) precisa de algum ateste próprio, ou apenas cada operador/OMA pleiteia ao seu POI?
2. Qual via do **Art. 3º da Res. 458** (ISO 27000 / Blockchain / cópia BD ANAC)?
3. A autorização é por **frota/modelo** ou por **prefixo individual**?
4. A ANAC aceita **Gov.br (avançada)** para eDB/SDRMe, ou exige **ICP-Brasil (qualificada)**? Para quais registros?
5. **Assinatura offline**: ato offline + selo/assinatura no servidor ao reconectar é aceito?
6. **Timestamp offline** sincronizado com o servidor (drift documentado) é aceito?
7. eDB **offline obrigatório** ou apenas **contingência documentada**? Os **30 dias no PED** seguem sob a 773?
8. **Precedência RDV × eDB** em divergência?
9. **Formato de exportação** aceito pela fiscalização + verificação de integridade?
10. **Período mínimo de operação paralela** papel→digital?

### 9.2 Quais documentos apresentar (como preparação, não como pronto)

- Dossiê regulatório interno + matriz de conformidade (rascunho).
- Descrição de arquitetura e da estratégia de Records Core (em desenho).
- Lista das 23 dúvidas, explicitando o que é interpretação interna.

### 9.3 O que NÃO apresentar como pronto

- Records Core, eDB, SDRMe, assinatura, offline, modo fiscalização ou export fiscal como "implementados/validados".
- Qualquer protótipo (MRO, Controle de Voos) como sistema operacional regulado.

### 9.4 Como explicar o AirTrust sem prometer homologação

> "O AirTrust é uma plataforma operacional em produção. Estamos **preparando** o caminho técnico e documental para que **operadores clientes** possam, no futuro, **pleitear** o uso de registros digitais (eDB/SDRMe) junto à ANAC, sob a Res. 458. **Não afirmamos** estar homologados ou autorizados, e entendemos que a autorização é por regulado e escopo."

### 9.5 Quais decisões queremos obter

- Direcionamento sobre assinatura aceita por tipo de registro; offline; via do Art. 3º; precedência RDV×eDB; formato fiscal; período paralelo.

### 9.6 Quais evidências técnicas mostrar apenas como preparação

- Threat model, canonicalização/hash, restore drill, governança de migrations — sempre rotulados como **preparatórios e não regulatórios**.

---

## 10. Pacote de evidências necessário

Classificação: **Existe** / **Parcial** / **Não existe** / **Depende de decisão**. Prioridade: P1 (bloqueante) / P2 / P3.

| # | Evidência / documento | Estado atual | Prioridade |
|---|---|---|---|
| 1 | Matriz normativa (artigo → requisito → módulo → evidência) | Parcial (`ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`) | P1 |
| 2 | Arquitetura (descrição do sistema) | Existe (`ARCHITECTURE_OVERVIEW.md`, parcial p/ regulado) | P2 |
| 3 | Política de assinatura | Não existe | Depende de decisão (#1/#2) — P1 |
| 4 | Política de backup | Parcial (`PRODUCTION_BACKUP_AND_ROLLBACK_PLAN.md`) | P1 |
| 5 | Restore drill (local) | Existe (`BACKUP_RESTORE_DRILL.md`, local) | — |
| 6 | Restore drill em staging descartável (domínio + `record_hash`/chain) | Não existe (BACKUP-002) | P1 |
| 7 | Plano de contingência (papel) | Não existe | Depende de decisão — P2 |
| 8 | Plano offline | Não existe | Depende de decisão (#2/#3) — P2 |
| 9 | Manual do piloto / eDB | Não existe | P2 |
| 10 | Manual de manutenção (SDRMe/OCC) | Não existe | P3 |
| 11 | Manual do administrador | Não existe | P3 |
| 12 | MGO / MGM / MOM revisados (refletindo uso digital) | Não existe (depende do operador) | Depende de operador — P2 |
| 13 | Testes de segurança | Parcial (`SECURITY.md`, guards de lint) | P2 |
| 14 | Testes de integridade (hash/chain/canonicalização) | Parcial (testes locais do core experimental) | P1 |
| 15 | Trilha de auditoria imutável | Parcial (auditoria v2 **não** é ledger imutável; core experimental, local) | P1 |
| 16 | Exportação fiscal verificável | Não existe | Depende de decisão (#11) — P1 |
| 17 | Modo fiscalização | Não existe | Depende de decisão (#10) — P2 |
| 18 | Threat model do Records Core | Não existe (só apontado como pendente) | P1 |
| 19 | Modelo de custódia de chaves | Não existe | Depende de decisão (#1) — P1 |
| 20 | Política de retenção por record type | Não existe | Depende de decisão (ANAC) — P2 |

---

## 11. Modelo de execução com IA

> Mapeamento de modelo por tipo de tarefa, conforme política interna definida. Usar o modelo mais barato que entrega a qualidade exigida; reservar Opus para decisão macro.

| Modelo | Quando usar | Exemplos neste plano |
|---|---|---|
| **DeepSeek** | Tarefas simples e **documentação operacional** repetível | Relatórios de piloto, atas, listas de checagem, rascunhos de manuais, formatação de matrizes |
| **Sonnet 4.6** | Revisão de **frontend/UX** e **documentação média** | Design do Dashboard OCC, telas de Programação/RDV, banners N1, manuais de transição, revisão de copy |
| **Codex 5.5** | **Banco, segurança, migrations, testes e arquitetura crítica** | Modelo de dados `cv_*`, hardening do Records Core, chain head/concorrência, restore drill staging, governança de migrations |
| **Opus** | **Síntese estratégica/regulatória e decisões macro** | Este plano, matriz normativa, decisões de escopo, go/no-go eDB, preparação da conversa ANAC |

**Regra de roteamento:** decisão de escopo, regulatória ou de arquitetura crítica → **Opus** ou **Codex 5.5**. Execução de UI e documentação média → **Sonnet 4.6**. Documentação operacional de baixo risco → **DeepSeek**. Nunca usar um modelo de execução simples para uma decisão regulatória ou de imutabilidade.

---

## 12. Riscos estratégicos

| # | Risco | Por que importa | Mitigação |
|---|---|---|---|
| 1 | **Construir o produto errado primeiro** | Esforço alto sem retorno; atraso geral | Começar pelo Controle de Voos N1 (valor imediato, baixa dependência) |
| 2 | **Gastar tempo demais em fundação abstrata** | Big-design-up-front; nunca chegar ao eDB (red team §1) | Core só evolui por consumidor real; congelar em 5 tabelas; slice de governança apenas |
| 3 | **Prometer homologação** | Risco jurídico/comercial direto | Guardrails de comunicação; banners N0/N1; nunca "homologado/regulado" |
| 4 | **Deixar assinatura para depois e descobrir incompatibilidade** | Refatoração do eDB inteiro | `regulated_signatures` já nasce com campos de certificado; semântica de verify única; decidir #1/#2 antes do design de eDB |
| 5 | **Subestimar offline/tablet** | Portaria 3.220 exige PED ≥30 dias; PWA pode não bastar | Tratar offline/PWA-vs-nativo como portão pós-consultor (#2/#3) |
| 6 | **Protótipo virar operação sem controle** | Dado mockado tratado como real; decisão errada | Governança N0→N1; persistência real + banners antes de qualquer uso |
| 7 | **ANAC exigir escopo diferente** | Pacote inteiro pode precisar refação | Conversa exploratória cedo (§9); manter desenho modular por escopo |
| 8 | **Operador piloto não estar pronto** | Sem regulado, não há pleito nem validação real | Identificar operador piloto até 180d; piloto interno antes |
| 9 | **Registros digitais divergirem do papel** | Quebra de confiança e de conformidade | Operação paralela papel+digital; fonte canônica definida (#4) |
| 10 | **Dependência excessiva de fornecedor/cloud** | Lock-in Cloudflare (D1/R2); risco de continuidade | Documentar export/restore independente; manifest hash; avaliar portabilidade no pacote de evidências |

---

## 13. Decisão final recomendada

- **Primeiro escopo recomendado:** **Controle de Voos / OCC / RDV** como módulo **operacional N1 (não regulado)**, substituindo o fluxo legado APUS RMCV + Sigvoos.
- **Trilha de execução recomendada:** três trilhas paralelas (Regulatória, Produto, Técnica), com a **Trilha B (Produto)** liderando a entrega de valor e a **Trilha C (Técnica)** limitada a hardening mínimo do core; a **Trilha A (Regulatória)** preparando o pacote sem prometer homologação.
- **Próximos 3 passos:**
  1. Confirmar formalmente o Controle de Voos N1 como primeiro escopo e escrever o backlog do MVP (Dashboard OCC, Programação, RDV operacional).
  2. Priorizar a matriz normativa e as 10 dúvidas-chave da ANAC; decidir sobre consultor.
  3. Concluir a Fase 1 de hardening local do Records Core, **mantendo-o em `migrations_experimental/`**.
- **O que fica pausado:** eDB regulado, SDRMe regulado, assinatura jurídica, offline/tablet, modo fiscalização, exportação fiscal, expansão do Records Core além do slice de governança, e qualquer movimento da migration experimental para a cadeia canônica.
- **O que precisa ser commitado ou não:** **nada precisa ser commitado por este plano.** Este documento é estratégico. Sugestão de commit (apenas do documento) está abaixo; **não executar sem autorização explícita**.
- **Próximo prompt recomendado:** focar no **design do MVP do Controle de Voos N1** (§14), não em microtarefa.

---

## 14. Próximo prompt recomendado

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Desenhar (apenas documentação e design, sem código) o MVP do módulo Controle de Voos
como sistema OPERACIONAL N1 (não regulado), primeiro escopo escolhido no
docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md, para substituir o fluxo legado
APUS RMCV + Sigvoos e ser a fonte única de dados operacionais de voo.

Importante:
- Não criar código. Não alterar frontend/backend. Não criar nem aplicar migrations.
  Não fazer deploy. Não mexer em secrets. Não fazer commit.
- N1 operacional: nada regulado, nada de assinatura, offline/tablet, modo fiscalização
  ou exportação fiscal. Banners N1. RDV tratado como dado operacional, não registro oficial.
- Não usar Records Core regulado; persistência operacional normal do AirTrust.
- Não chamar nada de homologado/certificado/regulado.

Referências obrigatórias:
- docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md
- docs/CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md
- docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md
- ARCHITECTURE_OVERVIEW.md, DATABASE_SCHEMA.md, FRMS_ARCHITECTURE.md

Tarefa macro:
1. Definir o escopo do MVP N1: Dashboard OCC, Programação de Voos, RDV operacional,
   validação de tripulação contra Funcionários/Qualificações/FRMS.
2. Especificar o modelo de dados operacional (cv_*) reaproveitando módulos existentes,
   SEM prefixos/triggers regulados, com empresa_id em tudo.
3. Mapear integrações com Funcionários, Qualificações, Escalas/EVD, FRMS, MRO e Sigvoos.
4. Definir banners N1, governança de superfície e o que fica fora (regulado).
5. Listar critérios de validação com usuários reais e dados demonstrativos.

Entregar como documento de design em docs/. Sem commit.
```

---

## Entrega

- **Documento criado:** `docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md` (este arquivo).
- **Primeiro escopo recomendado:** Controle de Voos / OCC / RDV como **N1 operacional não regulado** (2ª prioridade: MRO operacional; 3ª: hardening do Records Core via slice de governança; adiar: eDB e SDRMe regulados).
- **Roadmap:** 30d (decisão/desenho) → 60d (MVP N1 com dados demonstrativos + Fase 1 do core) → 90d (piloto interno controlado + restore staging) → 180d (preparação de autorização, sem substituir papel).
- **Decisões bloqueantes:** ver §7 (13 decisões; top: escopo inicial, assinatura, assinatura offline, PWA vs nativo, fonte oficial RDV×eDB, operador piloto, via Art. 3º, restore staging, modo fiscalização, formato fiscal).
- **Riscos estratégicos:** ver §12 (10 riscos; topo: produto errado, fundação abstrata, prometer homologação, assinatura adiada incompatível).
- **O que parar de fazer:** ver §8.
- **Próximo prompt sugerido:** ver §14 (design do MVP do Controle de Voos N1).
- **Sugestão de commit (NÃO executar sem autorização):**
  `docs(anac): add master plan for future ANAC-regulated systems`

> **Commit não realizado**, conforme instrução.
