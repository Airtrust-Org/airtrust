# Controle de Voos — Especificação do MVP N1 (Operacional Interno, Não Regulado)

> **Tipo:** Especificação de produto + arquitetura funcional + plano de MVP
> **Data:** 2026-06-14
> **Versão:** v1.0 — documento interno; **NÃO submetido à ANAC**; **não é parecer regulatório**
> **Autor:** AirTrust Engineering
> **Nível alvo:** **N1 — Operacional interno** (conforme `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`)
> **Estado atual do módulo:** **N0 — Protótipo navegável com mock data** (`controle_voos`, `isPrototype: true`, ver [modules.ts:236](src/react-app/lib/modules.ts))
>
> **AVISO LEGAL E DE ESCOPO**
> O AirTrust **não está homologado, certificado, aprovado ou autorizado** pela ANAC. Este MVP N1 é um **sistema operacional interno não regulado**: não substitui Diário de Bordo, eDB, SDRMe, RDV oficial, despacho legal, papel ou qualquer sistema oficial. **Não criar código, não alterar frontend/backend, não criar/aplicar migrations, não fazer deploy, não mexer em secrets, não fazer commit.** Este documento é apenas especificação. Nenhum dado, relatório ou exportação produzido por este MVP é evidência fiscal ou registro regulado.

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [Escopo do MVP N1](#2-escopo-do-mvp-n1)
3. [Personas e usuários](#3-personas-e-usuários)
4. [Fluxo operacional alvo](#4-fluxo-operacional-alvo)
5. [Telas do MVP](#5-telas-do-mvp)
6. [Dados necessários (modelo conceitual)](#6-dados-necessários-modelo-conceitual)
7. [Integração com módulos existentes](#7-integração-com-módulos-existentes)
8. [Dados mockados vs dados reais](#8-dados-mockados-vs-dados-reais)
9. [Regras de governança](#9-regras-de-governança)
10. [Requisitos funcionais (P0/P1/P2)](#10-requisitos-funcionais-p0p1p2)
11. [Requisitos não funcionais](#11-requisitos-não-funcionais)
12. [APIs futuras (conceituais)](#12-apis-futuras-conceituais)
13. [Plano de implementação](#13-plano-de-implementação)
14. [Critérios de sucesso](#14-critérios-de-sucesso)
15. [Riscos](#15-riscos)
16. [Decisão final](#16-decisão-final)
17. [Próximo prompt recomendado](#17-próximo-prompt-recomendado)

> **Referências:** [AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md](docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md), [CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md](docs/CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md), [DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md](docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md), [AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md](docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md), [REGULATED_RECORDS_CORE_PROMOTION_READINESS.md](docs/REGULATED_RECORDS_CORE_PROMOTION_READINESS.md), [ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md](docs/ADR_REGULATED_RECORDS_CORE_PHYSICAL_DESIGN.md), [ARCHITECTURE_OVERVIEW.md](ARCHITECTURE_OVERVIEW.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [AUTH_RBAC_MULTITENANCY.md](AUTH_RBAC_MULTITENANCY.md), [SECURITY.md](SECURITY.md). Código atual: [src/react-app/pages/controle-voos/](src/react-app/pages/controle-voos), [controleVoosMockData.ts](src/react-app/pages/controle-voos/data/controleVoosMockData.ts).

---

## 1. Sumário executivo

### 1.1 Objetivo do MVP

Promover o módulo **Controle de Voos** de **protótipo navegável (N0)** para **sistema operacional interno (N1)**: persistência real, multi-tenant, RBAC, dados reais da empresa — substituindo o `controleVoosMockData.ts` por backend e banco reais, **sem** torná-lo regulado.

O MVP entrega uma **fonte operacional única** para programação de voos, tripulação, status, RDV operacional, indisponibilidades e relatórios internos — reduzindo a dupla digitação entre **Sigvoos** e **APUS RMCV** e preparando os dados que, no futuro, alimentarão o eDB.

### 1.2 O que significa "N1 operacional interno"

Conforme o padrão de governança (N0→N4):

| Nível | Significado | Controle de Voos |
|---|---|---|
| N0 | Protótipo com mock data | **Estado atual** |
| **N1** | **Operacional interno: dados reais, persistência em produção, sem obrigação de evidência formal** | **Alvo deste MVP** |
| N2 | Evidência operacional (audit log forte, export rastreável) | Futuro |
| N3 | Registro regulado (Records Core, hash, assinatura, addendum) | Futuro (eDB) |
| N4 | Registro aceito/autorizado pela ANAC (POI, escopo) | Futuro (eDB) |

N1 significa: **a empresa usa internamente para organizar a operação**, com dados reais persistidos e isolados por tenant. **Não** significa audit log imutável, assinatura, hash chain, modo fiscalização nem substituição de papel.

### 1.3 Por que não é regulado

- **Não tem** assinatura com não-repúdio, hash chain, ledger imutável, Records Core, modo fiscalização nem exportação fiscal verificável — todos exigidos pela Res. 458 para registro digital oficial.
- O **RDV** aqui é **operacional** (organização interna), não o RDV/DB oficial regido pela Res. 773/2025 + Portaria 3.220.
- Promover para regulado depende de **decisões abertas** (assinatura, offline, via do Art. 3º) e de **autorização por operador/escopo** da ANAC — nada disso existe.

### 1.4 Por que não substitui Sigvoos/APUS/papel no início

- O Sigvoos e o APUS RMCV continuam sendo os sistemas de referência da operação durante o MVP. O Controle de Voos N1 roda **em paralelo**, primeiro com dados demonstrativos, depois em piloto controlado.
- Substituir qualquer um deles cedo demais geraria **divergência de dados** sem fonte canônica definida e risco de tratar dado operacional interno como registro oficial.
- A substituição é uma **decisão futura**, após validação do fluxo com usuários reais e definição da precedência RDV×eDB (dossiê §14, dúvida 20).

### 1.5 Qual problema resolve

- **Dupla digitação** Sigvoos → APUS RMCV (horas/semana de retrabalho — benchmark §1.1).
- **Divergência de dados** entre dois sistemas sobre o mesmo voo.
- **Falta de fonte única** de verdade operacional.
- **Baixa visibilidade OCC** do dia operacional (conflitos, indisponibilidade, vencimentos).
- **Desconexão** entre dados de voo realizados e os módulos AirTrust (FRMS, Qualificações).

---

## 2. Escopo do MVP N1

### 2.1 Entram no MVP

| # | Item | Observação |
|---|---|---|
| E1 | Cadastro e listagem de voos | CRUD real, multi-tenant |
| E2 | Painel OCC diário | Visão do dia: voos, status, alertas, aeronaves |
| E3 | Status operacional do voo | `planejado → liberado → em_voo → pousado → concluído / cancelado` |
| E4 | Tripulação planejada (atribuição) | Vínculo a Funcionários reais; função por tripulante |
| E5 | Aeronave planejada | Vínculo a cadastro de aeronaves real |
| E6 | Origem / destino | Tabela de aeroportos/plataformas |
| E7 | Horários previstos e realizados | Partida/chegada previstos e reais; validação de sequência |
| E8 | RDV operacional (não regulado) | Horas, pousos, ciclos, combustível, ocorrências — operacional |
| E9 | Motivos de atraso/cancelamento | Catálogo + registro por voo |
| E10 | Observações operacionais | Texto livre operacional |
| E11 | Export simples não fiscal | CSV/PDF marcado "Uso operacional interno — não fiscal" |
| E12 | Relatórios internos | Voos por período, horas por aeronave/tripulante, RDVs pendentes, atrasos |

### 2.2 NÃO entram no MVP (fora de escopo)

| # | Item fora | Por quê |
|---|---|---|
| F1 | eDB / DB Digital oficial | Regulado; depende de ANAC, assinatura, offline |
| F2 | SDRMe | Regulado; manutenção digital oficial |
| F3 | Assinatura PIC regulatória | Depende de decisão ICP/Gov.br/CANAC |
| F4 | RAS (Retorno ao Serviço) | Domínio SDRMe regulado |
| F5 | DB digital em tablet | Depende de PWA-vs-nativo e PED ≥30 dias |
| F6 | Offline / PWA | Portão pós-consultor |
| F7 | Records Core real | Só vertical slice não regulado, fora deste módulo |
| F8 | Substituição de papel | Sem autorização ANAC |
| F9 | Autorização ANAC | Não existe |
| F10 | Integração real com Sigvoos/APUS | Futura; MVP usa dados próprios/demonstrativos |
| F11 | Integração com MRO real | MRO é protótipo; integração é futura |
| F12 | Flight following em tempo real | Fora do N1 operacional |
| F13 | ADS-B / rastreio | Fora do escopo |
| F14 | Despacho operacional legal | Ato regulado |

> **Princípio de escopo:** o MVP torna **real e persistente** o que o protótipo já demonstra, **sem adicionar** nenhuma capacidade regulada. Tudo em F1–F14 fica explicitamente adiado.

---

## 3. Personas e usuários

> Papéis mapeados sobre o RBAC existente (`admin > manager > instructor > editor > student > viewer`, ver [AUTH_RBAC_MULTITENANCY.md](AUTH_RBAC_MULTITENANCY.md)). O MVP **não** cria papéis regulatórios.

### 3.1 Gestor operacional

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Visão consolidada da operação; decisões de alocação e priorização |
| **Tarefas** | Revisar dia operacional; aprovar programação; acompanhar indisponibilidades; ler relatórios |
| **Dores atuais** | Dados espalhados em Sigvoos/APUS/planilhas; sem visão única; retrabalho |
| **Telas** | Dashboard OCC, Relatórios, Lista de voos |
| **Permissões** | Leitura total + escrita de programação (≈ manager) |

### 3.2 Controle / OCC (despachante operacional)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter o dia operacional atualizado e consistente |
| **Tarefas** | Criar/editar voos; atribuir aeronave e tripulação; atualizar status e horários reais; registrar atrasos/cancelamentos |
| **Dores atuais** | Dupla digitação; conferência cruzada manual |
| **Telas** | Dashboard OCC, Lista de voos, Detalhe do voo, RDV operacional, Indisponibilidades |
| **Permissões** | Escrita operacional (≈ editor/manager) |

### 3.3 Piloto / Comandante

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Consultar seus voos; informar dados realizados |
| **Tarefas** | Ver escala/voos atribuídos; preencher RDV operacional (horas, pousos, ocorrências) |
| **Dores atuais** | Preenchimento em papel/sistema desconectado |
| **Telas** | Lista de voos (filtrada a si), Detalhe do voo, RDV operacional |
| **Permissões** | Leitura dos próprios voos + preenchimento de RDV operacional (≈ student/editor restrito). **Sem** assinatura regulatória |

### 3.4 Manutenção

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Saber horas/ciclos realizados e indisponibilidades |
| **Tarefas** | Consultar horas/ciclos por aeronave; registrar/encerrar indisponibilidade e hangaragem |
| **Dores atuais** | Horas/ciclos chegam por comunicação manual |
| **Telas** | Indisponibilidades, Hangaragem, Relatório de horas por aeronave |
| **Permissões** | Escrita de indisponibilidade/hangaragem; leitura de RDV (≈ editor restrito). **Sem** RAS (fora do escopo) |

### 3.5 Segurança / SGSO

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Visibilidade de ocorrências e padrões operacionais |
| **Tarefas** | Ler ocorrências de RDV; cruzar com SGSO (futuro) |
| **Dores atuais** | Ocorrências não estruturadas |
| **Telas** | Relatórios, Detalhe do voo (somente leitura) |
| **Permissões** | Leitura (≈ viewer/instructor) |

### 3.6 Administrador

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Configurar tabelas auxiliares e acessos |
| **Tarefas** | Manter aeroportos, tipos/naturezas de voo, causas/grupos de indisponibilidade, motivos; gerir acesso ao módulo |
| **Dores atuais** | Catálogos hardcoded no mock |
| **Telas** | Tabelas auxiliares, gestão de acesso ao módulo |
| **Permissões** | Admin do tenant (≈ admin) |

---

## 4. Fluxo operacional alvo

### 4.1 Etapas

1. **Criar voo** — OCC registra prefixo, origem/destino, tipo/natureza, data, horários previstos.
2. **Atribuir aeronave** — selecionar aeronave disponível (status real); bloquear se indisponível.
3. **Atribuir tripulação** — vincular Funcionários por função (PIC/SIC/COM/MEC); **validação informativa** contra Qualificações (modelo, CMA, ASO) e FRMS (score). Alertas não bloqueiam no N1, apenas avisam.
4. **Acompanhar status** — transições de status conforme o dia evolui.
5. **Registrar horários reais** — partida/chegada reais; validação de sequência (chegada ≥ partida).
6. **Preencher RDV operacional** — horas voadas, pousos, ciclos, combustível, ocorrências, divergências.
7. **Marcar atraso/cancelamento** — motivo do catálogo + tempo de atraso/observação.
8. **Revisar inconsistências** — painel mostra divergências (ex.: real ≠ previsto; RDV pendente; tripulante em atenção/bloqueado).
9. **Fechar voo operacionalmente** — status `concluído`; RDV `finalizado` (operacional, **sem** assinatura regulatória).
10. **Gerar relatório interno** — voos por período, horas por aeronave/tripulante, RDVs pendentes, atrasos; export "não fiscal".

### 4.2 Diagrama textual

```
[OCC cria voo]
      │  prefixo, O/D, tipo/natureza, data, horários previstos
      ▼
[Atribuir aeronave] ──(indisponível?)──► bloqueia / sugere outra
      │
      ▼
[Atribuir tripulação] ──► validação informativa (Qualif./CMA/ASO/FRMS)
      │                     └─ alerta (não bloqueia no N1)
      ▼
[Status: planejado → liberado]
      │
      ▼
[Dia operacional]
   ├─► [Registrar horários reais]  (partida/chegada; valida sequência)
   ├─► [Status: em_voo → pousado]
   ├─► [Atraso/Cancelamento]  (motivo + tempo)
   └─► [Preencher RDV operacional]  (horas, pousos, ciclos, combustível, ocorrências)
      │
      ▼
[Revisar inconsistências]  (real≠previsto, RDV pendente, tripulante atenção/bloqueio)
      │
      ▼
[Fechar voo]  status=concluído, RDV=finalizado (operacional, sem assinatura)
      │
      ▼
[Relatórios internos / export NÃO FISCAL]
```

---

## 5. Telas do MVP

> Todas as telas já existem como protótipo navegável ([src/react-app/pages/controle-voos/](src/react-app/pages/controle-voos)). O MVP as torna **reais** (dados do backend) e mantém o **banner de governança** ([ControleVoosPrototypeBanner.tsx](src/react-app/pages/controle-voos/components/ControleVoosPrototypeBanner.tsx)) atualizado para N1.

### A. Dashboard OCC diário

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Visão única do dia operacional |
| **Campos principais** | Cards de status (planejados/liberados/em voo/pousados/concluídos/cancelados); lista de voos do dia; aeronaves por status; alertas operacionais |
| **Ações** | Selecionar data; abrir voo; reconhecer alerta |
| **Estados** | Carregando, vazio (sem voos no dia), com alertas críticos |
| **Filtros** | Data, status, aeronave, base |
| **Demonstrativo** | Alertas derivados de regras simples (FRMS/CMA/indisponível) |
| **Vira real no MVP** | Voos, status, aeronaves, contagens; alertas calculados de dados reais |

### B. Lista de voos

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Navegar e gerenciar voos |
| **Campos principais** | Prefixo, O/D, aeronave, horários previstos/reais, status, tipo/natureza |
| **Ações** | Criar, editar, abrir detalhe, cancelar |
| **Estados** | Lista, vazio, filtrada |
| **Filtros** | Período, status, aeronave, origem/destino, tipo |
| **Demonstrativo** | — |
| **Vira real no MVP** | CRUD completo de voos persistido |

### C. Detalhe do voo

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Operar um voo específico ponta a ponta |
| **Campos principais** | Dados do voo; aeronave; tripulação atribuída; horários; status; observações; RDV vinculado; atraso/cancelamento |
| **Ações** | Atribuir aeronave/tripulação; mudar status; registrar horários reais; abrir/editar RDV; marcar atraso/cancelamento |
| **Estados** | Planejado, liberado, em voo, pousado, concluído, cancelado |
| **Filtros** | — |
| **Demonstrativo** | Validações de tripulação (informativas) |
| **Vira real no MVP** | Toda a operação do voo persistida |

### D. RDV operacional

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Registrar dados realizados do voo (operacional, não regulado) |
| **Campos principais** | Nº RDV, decolagem/pouso reais, horas voadas, pousos, ciclos, combustível (dec/pouso/consumo), ocorrências, divergências, status (`rascunho/finalizado/cancelado`) |
| **Ações** | Criar, editar, finalizar (operacional), cancelar |
| **Estados** | Rascunho, finalizado, cancelado |
| **Filtros** | Data, status, aeronave |
| **Demonstrativo** | Campos `assinaturaCmdte*`, `enviadoMro`, `enviadoFrms` (hoje no mock) ficam **fora** ou como flags operacionais **sem** valor regulatório |
| **Vira real no MVP** | RDV operacional persistido, vinculado ao voo |

> **Importante:** o campo de "assinatura do comandante" do mock ([Rdv.assinaturaCmdteNome](src/react-app/pages/controle-voos/data/controleVoosMockData.ts)) **não** é assinatura regulatória. No MVP, ou é removido, ou tratado como simples "responsável pelo preenchimento" sem pretensão jurídica e com aviso explícito.

### E. Jornadas / visão FRMS (apenas informativa)

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Mostrar jornada/score FRMS do tripulante como **leitura informativa** |
| **Campos principais** | Tripulante, voo, jornada (início/fim), horas jornada/voo, score FRMS, status (ok/atenção/bloqueado) |
| **Ações** | Somente leitura; link para o FRMS real |
| **Estados** | OK, atenção, bloqueado |
| **Filtros** | Tripulante, data |
| **Demonstrativo** | Scores no mock |
| **Vira real no MVP** | **Leitura** do FRMS real (read-only); o Controle de Voos **não** calcula fadiga nem é SGRF |

### F. Indisponibilidades operacionais

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Registrar aeronave indisponível e impacto |
| **Campos principais** | Aeronave, causa/grupo, início, fim previsto/real, status (ativa/encerrada), observação, voos impactados; (`osMroVinculada` apenas como texto/referência, **não** integração real) |
| **Ações** | Criar, encerrar, vincular voos impactados |
| **Estados** | Ativa, encerrada |
| **Filtros** | Aeronave, grupo, status, período |
| **Demonstrativo** | Vínculo a OS de MRO (texto livre, sem integração) |
| **Vira real no MVP** | Indisponibilidade e hangaragem persistidas |

### G. Relatórios internos

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Consolidar dados operacionais para gestão |
| **Campos principais** | Voos por período; horas por aeronave; horas por tripulante; RDVs pendentes; cancelamentos/atrasos |
| **Ações** | Filtrar, visualizar, exportar (CSV/PDF "não fiscal") |
| **Estados** | Com dados, vazio |
| **Filtros** | Período, aeronave, tripulante, status |
| **Demonstrativo** | "Export APUS/Sigvoos" e "Jornadas/RBAC 117" ficam marcados como **Fase 2/futuro** (já estão como `Fase 2` no mock) |
| **Vira real no MVP** | Relatórios marcados `MVP` no mock; todos com rodapé "Uso operacional interno — não fiscal" |

### H. Tabelas auxiliares

| Campo | Conteúdo |
|---|---|
| **Objetivo** | Manter catálogos operacionais |
| **Campos principais** | Aeroportos/plataformas, tipos de voo, naturezas, grupos/causas de indisponibilidade, motivos de atraso/cancelamento |
| **Ações** | CRUD por administrador |
| **Estados** | Lista por catálogo |
| **Filtros** | Busca por nome |
| **Demonstrativo** | "Terceirizados" e "Feriados/HOTRAM" ficam **Fase 2** |
| **Vira real no MVP** | Catálogos marcados `MVP` persistidos por tenant |

---

## 6. Dados necessários (modelo conceitual)

> **Modelo conceitual apenas — NÃO é migration, NÃO é DDL para aplicar.** Prefixo proposto `cv_` (operacional, **não** `regulated_`). Toda entidade tem `empresa_id` (multi-tenant) e timestamps. Espelha as interfaces já existentes em [controleVoosMockData.ts](src/react-app/pages/controle-voos/data/controleVoosMockData.ts).

| Entidade | Campos-chave conceituais | Relações |
|---|---|---|
| **Voo** (`cv_voos`) | `empresa_id`, prefixo, origem_id, destino_id, natureza_id, tipo_id, aeronave_id, horário_previsto_partida/chegada, horário_real_partida/chegada, data_programação, status, observações | → Aeronave, Aeroporto(O/D), Tipo, Natureza |
| **Trecho/Perna** (`cv_voo_pernas`) | `empresa_id`, voo_id, sequência, origem_id, destino_id, horários previstos/reais | Um voo pode ter N pernas (preparado p/ futuro eDB; no MVP, 1 perna por padrão) |
| **Aeronave** (reuso/`cv_aeronaves`) | `empresa_id`, matrícula/prefixo, modelo, status operacional, base | Preferir reusar cadastro de aeronaves existente; senão, tabela operacional |
| **Tripulação atribuída** (`cv_voo_tripulacao`) | `empresa_id`, voo_id, funcionario_id, função (PIC/SIC/COM/MEC), horário_apresentação/dispensa | → Funcionários (real) |
| **RDV operacional** (`cv_rdv`) | `empresa_id`, número, voo_id, data_voo, decolagem/pouso reais, horas_voadas, nº_pousos, ciclos, combustível(dec/pouso/consumo), ocorrências, divergências, status, responsável_preenchimento | → Voo (1:1) |
| **Evento de status** (`cv_voo_eventos`) | `empresa_id`, voo_id, status_anterior, status_novo, timestamp, usuário_id, observação | Trilha operacional simples (não imutável) |
| **Motivo de atraso/cancelamento** (`cv_voo_ocorrencias`) | `empresa_id`, voo_id, tipo (atraso/cancelamento), motivo_id, tempo_atraso_min, observação | → catálogo de motivos |
| **Indisponibilidade** (`cv_indisponibilidades`) | `empresa_id`, aeronave_id, causa_id, grupo_id, início, fim_previsto/real, status, observação, os_mro_ref (texto), voos_impactados | → Aeronave |
| **Hangaragem** (`cv_hangaragem`) | `empresa_id`, aeronave_id, entrada, saída, motivo, os_mro_ref (texto), status | → Aeronave |
| **Observação operacional** (`cv_observacoes`) | `empresa_id`, voo_id/aeronave_id, texto, usuário_id, timestamp | Texto livre operacional |
| **Relatório interno** | Sem tabela própria — **queries agregadas** sobre as entidades acima | — |
| **Catálogos** (`cv_aeroportos`, `cv_tipos_voo`, `cv_naturezas_voo`, `cv_grupos_indisp`, `cv_causas_indisp`, `cv_motivos`) | `empresa_id`, nome/código, descrição | Tabelas auxiliares |

> **Nota:** "ciclos" não existe ainda no mock do RDV e é necessário para o futuro feeder de MRO/eDB — incluir no modelo conceitual. `os_mro_ref` é **texto/referência**, não integração real (F11).

---

## 7. Integração com módulos existentes

> Classificação: **MVP obrigatório** / **MVP opcional** / **Futura** / **Não fazer agora**.

| Módulo | Classificação | Natureza da integração |
|---|---|---|
| **Funcionários** | **MVP obrigatório** | Tripulação atribuída referencia funcionários reais (read) |
| **Qualificações** | **MVP obrigatório (leitura informativa)** | Validar modelo/CMA/ASO ao atribuir tripulante — **alerta, não bloqueio** no N1 |
| **Escalas / EVD** | **MVP opcional** | Conciliar voos com escala planejada; evitar conflitos. Pode entrar como leitura na Fase 3 |
| **FRMS** | **MVP obrigatório (leitura informativa)** | Mostrar score/jornada do tripulante (read-only). **Não** calcular fadiga, **não** é SGRF |
| **SGSO** | **Futura** | Cruzar ocorrências de RDV com SGSO |
| **MRO** | **Não fazer agora** | MRO é protótipo; horas/ciclos/OS ficam como referência textual. Integração real só quando MRO for N1 |
| **LMS** | **Não fazer agora** | Sem relação direta no MVP |
| **Records Core (futuro)** | **Não fazer agora** | N1 não usa Records Core; selagem regulada é fase eDB |

> **Regra:** todas as integrações do MVP são **leitura** de módulos reais (Funcionários, Qualificações, FRMS). O Controle de Voos N1 **não escreve** em outros módulos e **não** depende de protótipos (MRO).

---

## 8. Dados mockados vs dados reais

| Dado | Hoje | No MVP N1 |
|---|---|---|
| Voos, status, horários | Mock (`MOCK_VOOS`) | **Real** (CRUD persistido) |
| RDV operacional | Mock (`MOCK_RDVS`) | **Real** (operacional, sem assinatura) |
| Tripulação atribuída | Mock (`MOCK_TRIPULACAO_VOO`) | **Real**, referenciando Funcionários |
| Aeronaves | Mock (`MOCK_AERONAVES`) | **Real** (reuso ou tabela operacional) |
| Tripulantes (qualif/CMA/ASO/FRMS) | Mock (`MOCK_TRIPULANTES`) | **Leitura** de Funcionários/Qualificações/FRMS reais |
| Indisponibilidade/Hangaragem | Mock | **Real** |
| Catálogos (aeroportos, tipos, causas) | Mock | **Real** (Fase MVP); "Terceirizados", "Feriados/HOTRAM" continuam **demonstrativos (Fase 2)** |
| Vínculo OS MRO | Mock (texto) | **Referência textual** (continua demonstrativo) |
| Export APUS/Sigvoos, Jornadas RBAC 117 | Mock (`Fase 2`) | **Continua demonstrativo / Fase 2** |
| Assinatura do comandante no RDV | Mock | **Removido ou "responsável pelo preenchimento" sem valor jurídico** |

**Como manter o banner N1/N0 correto:**
- Enquanto a tela usar mock → manter banner **N0 "Protótipo — não regulado"**.
- Quando a tela passar a usar backend real → atualizar para banner **N1 "Operacional interno — não regulado / não fiscal"** via [modules.ts](src/react-app/lib/modules.ts) (`controle_voos`: `isPrototype: false`, `maturityLevel: 'N1'`) e o componente [ModuleGovernanceBanner](src/react-app/pages/controle-voos/components/ControleVoosPrototypeBanner.tsx).
- **Nunca** misturar mock e real numa mesma tela sem aviso — cada tela declara sua fonte.

**Como evitar confusão regulatória:**
- Banner persistente em todas as telas; rodapé "Uso operacional interno — não fiscal" em toda exportação; nenhuma menção a eDB/DB/RAS/assinatura oficial; campos regulatórios desabilitados ou ausentes.

---

## 9. Regras de governança

1. **O módulo permanece N1.** Promoção a N2/N3/N4 é fase separada com critérios formais (`AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md` §11).
2. **Proibido** usar termos "homologado", "certificado", "regulado", "ANAC aprovado", "eDB oficial", "DB digital oficial", "RDV oficial", "SGRF aprovado".
3. **Todo relatório e exportação** exibe **"Uso operacional interno — não fiscal"** (cabeçalho e rodapé).
4. **Ações regulatórias** (assinatura PIC, RAS, selagem, modo fiscalização, export fiscal) **não existem** no MVP — ausentes ou desabilitadas com tooltip explicativo.
5. **Exportações não são evidência fiscal** nem registro oficial; metadado explícito no arquivo.
6. **Logs operacionais não substituem DB/SDRMe** — o RDV operacional não é o RDV/DB regulado.
7. **Banner de governança** obrigatório e correto por estado (N0 enquanto mock, N1 quando real).
8. **Validações de tripulação são informativas** (alerta), não bloqueio legal, no N1.
9. **Sem integração real com protótipos** (MRO) e **sem** Records Core.
10. **Multi-tenant estrito:** toda query com `WHERE empresa_id = ?` (regra crítica do AirTrust).

---

## 10. Requisitos funcionais (P0/P1/P2)

### P0 — essencial para o MVP existir

- P0-1 CRUD de voos persistido, multi-tenant.
- P0-2 Atribuição de aeronave (com status real).
- P0-3 Atribuição de tripulação referenciando Funcionários.
- P0-4 Transições de status do voo + registro de horários reais (validação de sequência).
- P0-5 RDV operacional (criar/editar/finalizar) vinculado ao voo.
- P0-6 Dashboard OCC diário com voos, status e contagens reais.
- P0-7 Banner N1 + rodapé "não fiscal" em telas/exportações.
- P0-8 RBAC e isolamento por tenant.

### P1 — alto valor, logo após o núcleo

- P1-1 Validação informativa de tripulação (Qualificações/CMA/ASO/FRMS — leitura).
- P1-2 Indisponibilidades e hangaragem persistidas.
- P1-3 Motivos de atraso/cancelamento (catálogo + registro).
- P1-4 Relatórios internos `MVP` (voos por período, horas por aeronave/tripulante, RDVs pendentes, atrasos).
- P1-5 Export simples CSV/PDF "não fiscal".
- P1-6 Catálogos auxiliares `MVP` editáveis por administrador.
- P1-7 Trilha operacional simples de eventos de status (não imutável).

### P2 — desejável, pode esperar

- P2-1 Conciliação com Escalas/EVD.
- P2-2 Trechos/pernas múltiplas por voo (preparação para eDB).
- P2-3 Visão FRMS embutida mais rica (read-only).
- P2-4 Filtros avançados e dashboards adicionais.
- P2-5 Catálogos "Terceirizados", "Feriados/HOTRAM".

> **Não inflar:** nada de assinatura, offline, hash, Records Core, integração MRO real, flight following — são fora de escopo (§2.2), não P3.

---

## 11. Requisitos não funcionais

| # | Requisito | Detalhe |
|---|---|---|
| NF-1 | **Multi-tenant** | `empresa_id` em toda tabela e query; sem vazamento cross-tenant |
| NF-2 | **RBAC** | Papéis existentes; permissões por persona (§3); módulo gated em [module-access.ts](src/react-app/lib/module-access.ts) |
| NF-3 | **Auditoria operacional simples** | Quem criou/alterou voo/RDV/status e quando (auditoria operacional, **não** ledger imutável) |
| NF-4 | **Performance** | Dashboard e listas com paginação/índices; dia operacional carrega rápido |
| NF-5 | **Rastreabilidade** | Eventos de status e edições rastreáveis para suporte/debug |
| NF-6 | **Backup** | Coberto pelo backup D1 existente; sem requisito regulado de restore verificado no N1 |
| NF-7 | **Usabilidade desktop/tablet web** | OCC é desktop-first; responsivo até tablet web (**não** app nativo, **não** offline) |
| NF-8 | **Acessibilidade mínima** | Contraste, navegação por teclado, labels — padrão do frontend |
| NF-9 | **Privacidade** | Dados de tripulantes (CMA/ASO/FRMS) tratados conforme LGPD; exibir só o necessário; respeitar controles do FRMS |
| NF-10 | **Convenções de API** | `{ success, data }` / `{ success, error }`; Zod; padrões de [rotas do worker](worker-airtrust/src/routes) |

---

## 12. APIs futuras (conceituais)

> **Desenho conceitual — NÃO implementar.** Prefixo `/api/controle-voos`. Todas autenticadas, multi-tenant, padrão `{ success, data }`.

| Método | Endpoint | Função |
|---|---|---|
| GET | `/api/controle-voos/voos?data=&status=&aeronave=` | Listar voos (filtros) |
| POST | `/api/controle-voos/voos` | Criar voo |
| GET | `/api/controle-voos/voos/:id` | Detalhe do voo |
| PATCH | `/api/controle-voos/voos/:id` | Editar voo |
| POST | `/api/controle-voos/voos/:id/status` | Transição de status (+ evento) |
| POST | `/api/controle-voos/voos/:id/tripulacao` | Atribuir tripulação |
| GET | `/api/controle-voos/voos/:id/validacao-tripulacao` | Validação informativa (Qualif./FRMS) |
| GET/POST/PATCH | `/api/controle-voos/rdv` `/rdv/:id` | RDV operacional |
| POST | `/api/controle-voos/voos/:id/ocorrencia` | Atraso/cancelamento |
| GET/POST/PATCH | `/api/controle-voos/indisponibilidades` | Indisponibilidade |
| GET/POST/PATCH | `/api/controle-voos/hangaragem` | Hangaragem |
| GET | `/api/controle-voos/relatorios/:tipo?periodo=` | Relatórios internos |
| GET | `/api/controle-voos/export/:tipo?formato=csv` | Export "não fiscal" |
| GET/POST/PATCH | `/api/controle-voos/catalogos/:nome` | Tabelas auxiliares |
| GET | `/api/controle-voos/dashboard?data=` | Agregados do dia OCC |

> **Sem** endpoints de assinatura, selagem, modo fiscalização ou export fiscal — fora do N1.

---

## 13. Plano de implementação

| Fase | Objetivo | Entregáveis | Critério de saída |
|---|---|---|---|
| **Fase 0 — Validar protótipo** | Confirmar com gestor operacional que o protótipo reflete o fluxo real | Sessão de validação; gap list protótipo×realidade (ver §17) | Fluxo e telas aprovados ou ajustados; escopo P0 confirmado |
| **Fase 1 — Backend mínimo N1** | Persistência real multi-tenant das entidades P0 | Rotas `/api/controle-voos` (voos, status, tripulação, RDV); tabelas `cv_*` (com autorização para migration — **fora deste documento**); RBAC | CRUD de voo/RDV persistido e isolado por tenant; testes |
| **Fase 2 — Frontend real** | Substituir `controleVoosMockData.ts` por dados reais | Telas A–D ligadas ao backend; banner N1; validação informativa de tripulação | Telas P0/P1 sem mock; banner N1 correto |
| **Fase 3 — Relatórios internos** | Consolidação e export | Relatórios `MVP`; export CSV/PDF "não fiscal"; indisponibilidade/hangaragem | Relatórios reais com rodapé "não fiscal" |
| **Fase 4 — Piloto interno controlado** | Operação paralela com dados reais não regulados | Piloto com um setor/operação; feedback; ajustes | Uso real sem confusão regulatória; métricas de sucesso (§14) |
| **Fase 5 — Preparação futura eDB** | Identificar o que do N1 alimenta o eDB | Mapa de campos cv_* → campos 773/3.220; decisões abertas listadas | Documento de preparação; **nenhuma** implementação regulada |

> Cada fase respeita as restrições: nenhuma migration é aplicada sem autorização explícita; nada de deploy/secret/commit como parte desta especificação.

---

## 14. Critérios de sucesso

| # | Critério | Métrica |
|---|---|---|
| S1 | **Redução de dupla digitação** | Voos/RDV lançados uma vez no AirTrust; queda de redigitação no APUS/Sigvoos |
| S2 | **Visibilidade OCC** | Gestor vê o dia operacional num único painel; tempo de montagem do panorama diário cai |
| S3 | **Qualidade dos dados** | Menos divergências entre previsto e real; RDVs preenchidos no prazo |
| S4 | **Aceitação dos usuários** | OCC/pilotos/manutenção usam voluntariamente; feedback positivo |
| S5 | **Consistência com escalas** | Voos batem com a escala planejada; conflitos detectados |
| S6 | **Não confusão regulatória** | Zero relatos de uso como registro oficial; banner/rodapé presentes; nenhuma menção indevida |

---

## 15. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | **N1 ser tratado como registro oficial** | Banner persistente, rodapé "não fiscal", ausência de ações regulatórias, treinamento |
| R2 | **Escopo inflar para eDB/assinatura** | Lista §2.2 explícita; revisão de escopo a cada fase |
| R3 | **Dupla digitação persistir** (usuário usa AirTrust + APUS) | Piloto controlado com meta de fonte única; medir S1 |
| R4 | **Divergência com Sigvoos/APUS** sem fonte canônica | Operação paralela declarada; precedência definida só no futuro (eDB) |
| R5 | **Mock e real misturados** confundindo usuário | Cada tela declara fonte; banner por estado; "Fase 2" marcado |
| R6 | **Vazamento cross-tenant** | `WHERE empresa_id = ?` obrigatório; testes de isolamento |
| R7 | **Dependência de protótipo MRO** | MRO fica como referência textual; integração só quando MRO for N1 |
| R8 | **LGPD em dados de tripulante (CMA/ASO/FRMS)** | Exibir só o necessário; respeitar controles do FRMS; acesso por papel |
| R9 | **Validação de tripulação bloquear operação** | No N1 é informativa (alerta), não bloqueio legal |
| R10 | **Promoção precoce a regulado** | Governança N1→N3 é fase separada com critérios formais |

---

## 16. Decisão final

- **O MVP N1 deve avançar?** **Sim.** É o primeiro escopo recomendado pelo Plano Mestre: maior valor imediato, menor dependência regulatória, alimenta o futuro eDB e valida com usuários reais sem substituir papel.
- **Qual é a primeira fase prática?** **Fase 0 — validar o protótipo atual com o gestor operacional** e gerar a gap list, **antes de qualquer código**.
- **O que fica pausado?** Tudo em §2.2 (eDB, SDRMe, assinatura, RAS, tablet/offline, Records Core, integração MRO/Sigvoos/APUS real, flight following, ADS-B, despacho legal) e a promoção a N2/N3/N4.
- **O que precisa ser validado com usuário antes de código?** O fluxo operacional alvo (§4); as telas P0 (A–D); o modelo de dados (§6) contra a realidade da operação; quais relatórios são prioritários; e confirmação de que o RDV operacional cobre o que hoje é redigitado no APUS.

---

## 17. Próximo prompt recomendado

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Validar o protótipo atual de Controle de Voos contra a especificação
docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md e gerar uma GAP LIST acionável,
ainda SEM implementar nada.

Importante:
- Não criar código. Não alterar frontend/backend. Não criar nem aplicar migrations.
  Não fazer deploy. Não mexer em secrets. Não fazer commit.
- Não promover o módulo a regulado. Manter banner de governança.

Referências obrigatórias:
- docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md
- docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md
- src/react-app/pages/controle-voos/ (todas as telas)
- src/react-app/pages/controle-voos/data/controleVoosMockData.ts
- src/react-app/lib/modules.ts, module-access.ts, navigation.config.ts, App.tsx

Tarefa macro:
1. Mapear, tela a tela (A–H), o que o protótipo já faz vs. o que o MVP N1 exige
   (P0/P1/P2), classificando cada item: já existe / parcial / falta.
2. Mapear o modelo conceitual (§6) contra as interfaces do mock, listando o que
   falta para virar persistência real (incl. ciclos no RDV, empresa_id, eventos de status).
3. Listar o que precisa virar real, o que continua demonstrativo (Fase 2) e o que
   deve ser removido (ex.: assinatura do comandante).
4. Listar as integrações de leitura necessárias (Funcionários, Qualificações, FRMS)
   e como obtê-las sem tocar protótipos (MRO).
5. Produzir uma gap list priorizada (P0/P1/P2) com esforço estimado, como documento
   em docs/, sem implementar.

Entregar como docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md. Sem commit.
```

---

## Entrega

- **Documento criado:** `docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md` (este arquivo).
- **Recomendação do MVP:** avançar com **Controle de Voos N1 (operacional interno, não regulado)**, promovendo o módulo de N0 (mock) para N1 (dados reais), começando pela **Fase 0 — validação do protótipo com o gestor**.
- **Escopo P0/P1/P2:** P0 = CRUD de voos, aeronave, tripulação, status/horários reais, RDV operacional, dashboard OCC, banner N1, RBAC/tenant. P1 = validação informativa de tripulação, indisponibilidade/hangaragem, atrasos/cancelamentos, relatórios MVP, export "não fiscal", catálogos, eventos de status. P2 = Escalas/EVD, trechos múltiplos, FRMS embutido, filtros avançados, catálogos Fase 2 (§10).
- **Telas do MVP:** A) Dashboard OCC; B) Lista de voos; C) Detalhe do voo; D) RDV operacional; E) Jornadas/FRMS (informativa); F) Indisponibilidades; G) Relatórios internos; H) Tabelas auxiliares (§5).
- **Entidades conceituais:** Voo, Trecho/Perna, Aeronave, Tripulação atribuída, RDV operacional, Evento de status, Motivo de atraso/cancelamento, Indisponibilidade, Hangaragem, Observação, Catálogos (§6) — todas `cv_*`, com `empresa_id`, **sem** `regulated_`.
- **Integrações MVP/futuras:** MVP obrigatório = Funcionários, Qualificações (leitura), FRMS (leitura); MVP opcional = Escalas/EVD; Futura = SGSO; Não fazer agora = MRO, LMS, Records Core (§7).
- **Roadmap:** Fase 0 (validar protótipo) → Fase 1 (backend N1) → Fase 2 (frontend real) → Fase 3 (relatórios) → Fase 4 (piloto interno) → Fase 5 (preparação eDB) (§13).
- **Riscos principais:** N1 tratado como oficial; escopo inflar; dupla digitação persistir; divergência sem fonte canônica; mock+real misturados; cross-tenant; dependência de MRO protótipo; LGPD (§15).
- **Próximo prompt sugerido:** validar o protótipo contra esta spec e gerar `docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md` (§17).
- **Sugestão de commit (NÃO executar sem autorização):**
  `docs(controle-voos): add N1 operational MVP spec`

> **Commit não realizado**, conforme instrução.
