# Dossiê Regulatório ANAC — AirTrust: DB Digital/eDB, SDRMe e Controle de Voos

> **Tipo:** Dossiê regulatório de preparação (produto + conformidade)
> **Data:** 2026-06-14
> **Versão:** v1.0 — Rascunho interno; **NÃO submetido à ANAC**
> **Autor:** AirTrust Engineering
>
> **AVISO LEGAL E DE ESCOPO**
> Este documento é uma análise interna de preparação regulatória baseada na leitura de normas publicadas pela ANAC e de legislação federal aplicável. **Nada aqui afirma que o AirTrust está "homologado", "certificado" ou "aprovado" pela ANAC.** Nenhuma interpretação aqui substitui consulta a consultor regulatório habilitado ou comunicação oficial com a ANAC. Toda dúvida não resolvível por fonte oficial está marcada como **`PENDENTE DE CONFIRMAÇÃO COM ANAC`**. As citações normativas devem ser reconferidas no texto integral vigente de cada norma antes de qualquer submissão ou operação regulada.

---

## Índice

1. [Sumário Executivo](#1-sumário-executivo)
2. [Mapa de Normas Oficiais](#2-mapa-de-normas-oficiais)
3. [Glossário Regulatório](#3-glossário-regulatório)
4. [DB Digital / eDB](#4-db-digital--edb)
5. [SDRMe / Manutenção Digital](#5-sdrme--manutenção-digital)
6. [Controle de Voos / Controle Operacional / RDV](#6-controle-de-voos--controle-operacional--rdv)
7. [FRMS / RBAC 117](#7-frms--rbac-117)
8. [Assinatura Eletrônica / Digital](#8-assinatura-eletrônica--digital)
9. [Tablet / PED / EFB / Offline](#9-tablet--ped--efb--offline)
10. [Regulated Records Core](#10-regulated-records-core)
11. [Matriz Artigo → Requisito → AirTrust](#11-matriz-artigo--requisito--airtrust)
12. [Lacunas Atuais do AirTrust](#12-lacunas-atuais-do-airtrust)
13. [Roadmap Recomendado](#13-roadmap-recomendado)
14. [Lista de Dúvidas Pendentes para ANAC](#14-lista-de-dúvidas-pendentes-para-anac)
15. [Conclusão](#15-conclusão)

> **Documentos internos de referência consolidados neste dossiê:**
> `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md`,
> `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`,
> `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md`,
> `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`,
> `docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md`,
> `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`,
> `docs/CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md`,
> `SECURITY.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`, `ARCHITECTURE_OVERVIEW.md`, `FRMS_ARCHITECTURE.md`, `TECHNICAL_DEBT.md`.

---

## 1. Sumário Executivo

### 1.1 O que o AirTrust quer fazer

O AirTrust é uma plataforma SaaS multi-tenant de gestão de operações aéreas. A frente regulatória descrita aqui visa preparar três escopos para uso como **registros oficiais regulados** da aviação civil brasileira, substituindo ou complementando registros em papel:

1. **DB Digital / eDB** — Diário de Bordo eletrônico em tablet/PED;
2. **SDRMe / Manutenção digital** — Sistema de Documentos e Registros de Manutenção eletrônicos (OS, task cards, RAS, componentes);
3. **Controle de Voos / Controle Operacional / RDV** — fonte única de programação, despacho, execução e relatórios, com integração a manutenção e FRMS.

### 1.2 O que significa "preparar para aceitação/autorização ANAC"

A ANAC **não emite uma "homologação" genérica de software**. Não existe um ato administrativo do tipo "software AirTrust homologado pela ANAC" que habilite automaticamente qualquer operador a abandonar o papel. O que existe, no modelo da Resolução nº 458/2017, é:

- **Aceitação/autorização de uso de um sistema informatizado** para registro e guarda de informações, mediante **pleito do próprio regulado** (operador RBAC 135, OMA RBAC 145, etc.) ao seu inspetor/POI;
- Para o eDB especificamente, a **Portaria 3.220/SPO/SAR/2019** prevê inclusive um **modelo de Carta de Autorização (LOA)** anexo;
- A aceitação é **por regulado e por escopo** (qual frota, quais aeronaves, quais registros substituídos), não um selo de produto.

> "Preparar para aceitação/autorização" significa, portanto: construir o sistema e o pacote de evidências de modo que **qualquer operador cliente do AirTrust consiga instruir o seu próprio pleito** junto à ANAC com chance real de aceitação — e nunca afirmar que o produto, isoladamente, já está autorizado.

**Precedentes públicos de mercado** (não vinculantes ao AirTrust, mas indicativos de que o caminho existe): a **Líder Aviação** foi autorizada pela ANAC a usar Diário de Bordo Digital, e a **LATAM** foi autorizada a usar sistema eletrônico de registros de manutenção — ambos por pleito próprio do regulado.

### 1.3 Por que DB Digital, SDRMe e Controle de Voos precisam ser tratados separadamente

| Escopo | Norma específica que governa o conteúdo | Quem pleiteia | Ato/autorização típico |
|---|---|---|---|
| DB Digital/eDB | Res. 773/2025 + Portaria 3.220/2019 (sob guarda-chuva da Res. 458) | Operador (RBAC 91/135/121) | LOA de eDB (modelo na Portaria 3.220) |
| SDRMe | IS 43.9-004 (Rev. vigente) + RBAC 43 (sob Res. 458) | Operador e/ou OMA (RBAC 145) | Aceitação do sistema 458 + alteração de MGM/MOM |
| Controle de Voos/RDV | RBAC 135 / IS 135-002 (controle operacional) | Operador | Alteração de MGO + aceitação 458 quando vira registro oficial |

São escopos **separados** porque: (a) cada um é governado por uma norma de conteúdo diferente; (b) cada um tem um signatário e um responsável regulatório distintos (PIC, mecânico/aprovador, despachante/OCC); (c) a autorização de um **não** implica a do outro; (d) o risco regulatório e o ato administrativo de aceitação são diferentes. Misturá-los num único pleito atrasa todos e enfraquece cada um.

### 1.4 Por que o Regulated Records Core é pré-requisito técnico

A Resolução 458/2017 impõe **horizontalmente** a qualquer sistema que substitua papel: integridade (hash), autenticidade (assinatura com não-repúdio), criptografia, trilha de auditoria, backup com restauração verificada, retenção, disponibilidade para fiscalização, exportação aceitável e correção sem apagamento. Construir esses mecanismos isoladamente dentro de cada módulo (eDB, SDRMe, RDV) produziria duplicação, interpretações divergentes de "imutabilidade", audit logs incruzáveis e o risco de um módulo ser conforme e outro não.

A conclusão técnica (ver `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`) é direta: **hoje o AirTrust não possui um núcleo regulado capaz de tornar eDB/SDRMe/RDV juridicamente defensáveis como registros oficiais.** A solução é uma camada compartilhada — o **Regulated Records Core** — implementada **antes** de qualquer módulo entrar em operação regulada.

> **Postura institucional (não-negociável):** até autorização formal por operador, nenhum módulo do AirTrust deve ser chamado de "homologado", "certificado" ou "regulado". Protótipos (MRO, Controle de Voos com mock data) são protótipos.

---

## 2. Mapa de Normas Oficiais

> **Legenda de status:** ✅ verificado em fonte oficial ANAC/legislação | 🟡 verificado parcialmente / detalhe a reconfirmar no texto integral | ⛔ `PENDENTE DE CONFIRMAÇÃO COM ANAC`.

| # | Norma | Link oficial | Status/Vigência | Escopo | Aplicação ao AirTrust | Módulos afetados | Pontos críticos | Dúvidas pendentes |
|---|---|---|---|---|---|---|---|---|
| N1 | **Resolução ANAC nº 458/2017** | [anac.gov.br · Res. 458/2017](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-458-20-12-2017) | ✅ Vigente desde 22/12/2017; alterada pela **Res. 511/2019** e **Res. 678/2022** | Norma horizontal: uso de sistema informatizado para registro/guarda de informações em substituição ao papel | Base de **todo** o Records Core. Cumprimento facultativo, salvo quando norma específica o torna obrigatório | Records Core, todos os módulos regulados | Exige cripto assimétrica, hash, assinatura com 13 propriedades (incl. não-repúdio), backup separado, auditoria, disponibilidade p/ fiscalização. Art. 3º: **autorização expressa da ANAC quanto ao escopo** + demonstração de segurança (certificação ISO 27000 **ou** Blockchain **ou** cópia em BD ANAC) | Qual via do Art. 3º o AirTrust adotará (ISO 27000 / Blockchain / cópia BD ANAC)? ⛔ |
| N2 | **Resolução ANAC nº 457/2017** | [anac.gov.br · Res. 457/2017](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-457-20-12-2017) | 🟡 Substituída/atualizada pela **Res. 773/2025** no que tange ao Diário de Bordo | Diário de Bordo (regra anterior) | Referência histórica do eDB; ler para entender continuidade com a 773 | DB Digital | Confirmar exatamente o que da 457 foi revogado/preservado pela 773 | Extensão da revogação 457→773 ⛔ |
| N3 | **Resolução ANAC nº 773/2025** | [anac.gov.br · Res. 773/2025](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773) | 🟡 Publicada 25/06/2025 — **norma de conteúdo do Diário de Bordo** (substitui a 457 no tema) | Preenchimento do Diário de Bordo (campos, registro por etapa) | Norma de conteúdo do módulo eDB. Ex.: Art. 6 define o que se registra por etapa/trecho de voo | DB Digital, Controle de Voos | Confirmar data de entrada em vigor e eventual IS/portaria complementar; mapear campo a campo o Art. 6 e correlatos | Vigência efetiva e IS complementar ⛔ |
| N4 | **Resolução ANAC nº 772/2025** | [anac.gov.br · Res. 772/2025](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-772) | 🟡 Publicada 25/06/2025 — Emenda 06 ao **RBAC 137** (agrícola); remete à 773 p/ DB | Operações agrícolas + regra de DB por trecho | Relevante só se houver cliente agrícola; mostra que a 773 admite registro por trecho com mesma tripulação e um único local de pouso/decolagem | DB Digital (caso agrícola) | Aplicável a nicho específico | — |
| N5 | **Portaria nº 3.220/SPO/SAR/2019** | [anac.gov.br · PA 3220 (compilado até PA2020-1528)](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2019/portaria-no-3220-spo-sar-15-10-2019/@@display-file/arquivo_norma/PA2019-3220%20-%20Compilado%20at%C3%A9%20PA2020-1528.pdf) | 🟡 Publicada 15/10/2019; **alterada pela Portaria 14.096/SPO de 14/03/2024** | Procedimentos mínimos de uso e fiscalização do **eDB**; modelo de **LOA** anexo | Referência primária do design do eDB e do **processo de autorização** | DB Digital, PED/Tablet | **Exige carregar a bordo ≥1 PED funcional com dados dos últimos 30 dias de operação**, consolidados e atualizados; anexo com modelo de LOA | Confirmar se a 773/2025 altera/substitui parte da 3.220 e qual o modelo de LOA vigente ⛔ |
| N6 | **Portaria nº 14.096/SPO/2024** | [Busca anac.gov.br](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias) | 🟡 14/03/2024 — ajusta DB (codificação de função de tripulante, datas de transição) | Alterações de preenchimento do DB | Ajustes de campos de tripulante a refletir no eDB | DB Digital | Conferir codificação de função de tripulante exigida | Codificação vigente de função ⛔ |
| N7 | **IS 43.9-004** (rev. vigente — busca indica **Revisão B/2019**) | [anac.gov.br · IS 43.9-004 Rev. B (Boletim 2019)](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2019/45/anexo-i-is-no-43-9-004-revisao-b) | 🟡 Vigente; **revisão a confirmar** (o briefing interno citava "004A"; a busca oficial retorna Rev. B) | SDRMe — sistema eletrônico de documentos/registros de manutenção, cumprida **junto com a Res. 458** | Norma de conteúdo do SDRMe (OS, task card, RAS) | SDRMe, MRO | **Reconfirmar a revisão vigente (A vs. B)** antes de citar; LATAM já certificada nesse modelo | Revisão vigente exata (A/B) ⛔ |
| N8 | **RBAC 43** | [anac.gov.br · Normas manutenção](https://www.gov.br/anac/pt-br/assuntos/regulados/manutencao-aeronautica/normas-do-setor) | 🟡 Vigente (conferir emenda) | Manutenção: quem executa/inspeciona/aprova; registros obrigatórios | Requisitos de negócio do SDRMe: 43.9 (registros de trabalho), 43.11 (RAS), 43.10 (vida limitada), 43.12 (transferência) | SDRMe, MRO | RAS, life-limited parts, transferência de registros | Emenda vigente do RBAC 43 ⛔ |
| N9 | **RBAC 91** | [abraphe.org · RBAC 91 EMD 01 (verificar versão oficial na ANAC)](https://abraphe.org.br/arquivos-pdf/rbac/rbac-91-emd-01.pdf) | 🟡 Vigente (conferir emenda na ANAC) | Regras gerais de operação; registros, EFB/PED, disponibilidade de documentação a bordo | Disponibilidade de documentação a bordo; uso de EFB/PED | DB Digital, PED/EFB | Itens de documentação a bordo e EFB | Requisitos EFB do RBAC 91 e IS associada ⛔ |
| N10 | **RBAC 135 — Emenda 15 (Res. 774/2025)** | [anac.gov.br · Res. 774/2025](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-774) · [RBAC 135 EMD 15 (PDF)](https://pergamum.anac.gov.br/pergamum/vinculos/RBAC135EMD15.pdf) | 🟡 Res. 774 publicada 07/07/2025 aprova **Emenda 15** ao RBAC 135 | Operadores ≤19 assentos / ≤3.400 kg ou helicópteros: controle operacional, localização de voo, DB, irregularidades | Norma do cliente operador: define o que o Controle de Voos/eDB/SDRMe precisa satisfazer | Controle de Voos, DB Digital, SDRMe, FRMS | Confirmar data de vigência da Emenda 15 e itens de controle operacional e flight following | Vigência da Emenda 15 e numeração de itens ⛔ |
| N11 | **IS 135-002** (controle operacional / MGO) | [antigo.anac.gov.br · IS](https://antigo.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is) | 🟡 Vigente (confirmar revisão; interno citou "135-002F") | MGO, controle operacional, DB, abastecimento, irregularidades mecânicas | Design detalhado de campos/fluxos do Controle de Voos e do eDB | Controle de Voos, DB Digital | Reconfirmar revisão vigente da IS 135-002 | Revisão vigente da IS 135-002 ⛔ |
| N12 | **RBAC 117** | [pergamum.anac.gov.br · RBAC 117 EMD 01](https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf) | 🟡 Vigente (conferir emenda) | Limites de jornada/repouso de tripulantes; GRF/SGRF | Valida a engine FRMS e a captura de jornada realizada | FRMS, Controle de Voos | 117.61: SGRF como meio de exceder limites prescritivos, **mediante GRF aceito pela ANAC** | Emenda vigente do RBAC 117 ⛔ |
| N13 | **IS 117-004** (rev. vigente — busca indica **Revisão B**) | [anac.gov.br · IS 117-004](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-117-004) | 🟡 Vigente; Rev. A (2019) e **Rev. B** localizadas | Implementação do **SGRF** para operadores RBAC 121/135 com GRF aceito | Define o que separa um FRMS operacional de um SGRF aprovado | FRMS | SGRF = FRMS; **só aprovado via GRF aceito pela ANAC**. IS 117-002 (nível básico), IS 117-003 (GRF), IS 117-004 (SGRF) | Revisão vigente da IS 117-004 e processo de aceite do GRF ⛔ |
| N14 | **RBAC 145 + IS associadas (MOM/MGM)** | [anac.gov.br · Normas manutenção](https://www.gov.br/anac/pt-br/assuntos/regulados/manutencao-aeronautica/normas-do-setor) | 🟡 Vigente (conferir emenda) | OMA: aprovação, documentação, qualificação de pessoal, registros, terceirização | SDRMe quando o cliente é OMA; terceirização rastreável | SDRMe | Qualificação de pessoal, ferramentas/calibração, transferência | IS específicas de RBAC 145 e exigências de MOM/MGM ⛔ |
| N15 | **IS 91-015B** (reconstituição de DB/caderneta) | [antigo.anac.gov.br · IS](https://antigo.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is) | 🟡 Vigente (confirmar a referência exata "91-015B") | Reconstituição de Diário de Bordo / caderneta em caso de perda/destruição | Exportar histórico completo por aeronave/tripulante para reconstituição | DB Digital, Records Core | Confirmar número/revisão exata da IS de reconstituição | Número e revisão exata da IS de reconstituição ⛔ |
| N16 | **MP 2.200-2/2001 (ICP-Brasil)** | [planalto.gov.br · MP 2.200-2](http://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm) | ✅ Vigente | Institui a ICP-Brasil; base da assinatura digital **qualificada** | Base legal da assinatura digital com fé pública (certificado ICP-Brasil A1/A3) | Records Core, assinatura | Assinatura qualificada = ICP-Brasil | Se a ANAC exige qualificada (ICP) p/ eDB/RAS ⛔ |
| N17 | **Lei nº 14.063/2020 + Decreto 10.543/2020** | [planalto.gov.br · Lei 14.063/2020](http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) · [gov.br · Assinatura eletrônica](https://www.gov.br/governodigital/pt-br/identidade/assinatura-eletronica/saiba-mais-sobre-a-assinatura-eletronica) | ✅ Vigente | Define assinatura **simples / avançada / qualificada** em interações com entes públicos | Enquadra Gov.br (avançada) vs. ICP-Brasil (qualificada) vs. login+senha (simples) | Records Core, assinatura | **Gov.br = avançada**; **ICP-Brasil = qualificada**; o nível exigível depende do ato | Nível mínimo aceito pela ANAC por tipo de registro ⛔ |
| N18 | **Cibersegurança ANAC (RBAC 119/IS aplicáveis)** | [gov.br/anac · Segurança cibernética](https://www.gov.br/anac/pt-br/assuntos/seguranca-cibernetica-na-aviacao-civil/legislacao-e-regulamentacao) | 🟡 Em evolução | Segurança cibernética na aviação civil | Insumo para a Política de Segurança da Informação do pacote 458 | Records Core, Infra | Acompanhar normativos emergentes | Aplicabilidade ao AirTrust ⛔ |

> **Fontes oficiais consultadas:** páginas e PDFs de `anac.gov.br`, `gov.br/anac`, `pergamum.anac.gov.br`, `planalto.gov.br` e `gov.br/governodigital` (links acima). As páginas dinâmicas de `gov.br/anac` estão protegidas por verificação (CAPTCHA) e devem ser abertas manualmente para extrair o texto integral.

---

## 3. Glossário Regulatório

| Termo | Definição operacional para este dossiê |
|---|---|
| **DB** | Diário de Bordo — registro oficial obrigatório dos voos e do estado técnico da aeronave; em papel, é o documento de referência da operação. |
| **eDB** | Diário de Bordo **eletrônico** — versão digital do DB em sistema informatizado/PED, regida pela Res. 773/2025 e Portaria 3.220/2019, sob o guarda-chuva da Res. 458. |
| **SDRMe** | Sistema de Documentos e Registros de Manutenção **eletrônicos** — substituição digital de OS, task cards, cadernetas e RAS (IS 43.9-004 + Res. 458). |
| **RDV** | Relatório/Registro Diário de Voo — consolidação operacional dos voos realizados (horários reais, pousos, ciclos, ocorrências); base para alimentar eDB, MRO e FRMS. |
| **RAS** | (Retorno/Aprovação ao Serviço) — aprovação para **Retorno ao Serviço** de aeronave após manutenção, assinada por pessoa habilitada; sem RAS válida a aeronave não voa. |
| **MRO** | Maintenance, Repair and Overhaul — função/módulo de controle de manutenção (no AirTrust, hoje protótipo). |
| **OMA** | Organização de Manutenção Aeronáutica — empresa de manutenção certificada sob RBAC 145. |
| **MOM** | Manual de Organização de Manutenção — manual da OMA exigido pelo RBAC 145. |
| **MGM** | Manual Geral de Manutenção — manual de manutenção do operador. |
| **MGO** | Manual Geral de Operações — manual do operador (RBAC 135/121) que descreve procedimentos operacionais; **deve refletir o uso de sistema digital** para que o eDB/Controle de Voos seja oficial. |
| **EO** | Engineering Order — ordem de engenharia que autoriza/documenta uma ação técnica específica. |
| **LOA** | Letter of Authorization / Carta de Autorização — ato pelo qual a ANAC autoriza um regulado a um uso específico (ex.: modelo de LOA de eDB anexo à Portaria 3.220). |
| **POI** | Principal Operations Inspector — inspetor da ANAC responsável pelo operador; interlocutor do pleito de uso de sistema digital. |
| **PED** | Portable Electronic Device — dispositivo eletrônico portátil (tablet) usado para o eDB. |
| **EFB** | Electronic Flight Bag — "maleta de voo eletrônica"; conjunto de aplicações/documentação operacional em dispositivo eletrônico. |
| **FRMS** | Fatigue Risk Management System — sistema de gerenciamento de risco de fadiga (acrônimo inglês de SGRF). |
| **GRF** | Gerenciamento de Risco da Fadiga — conjunto de limitações e procedimentos **aceitos pela ANAC** para gerir fadiga conforme o risco da operação (RBAC 117). |
| **SGRF** | Sistema de Gerenciamento de Risco da Fadiga — implementação do GRF (IS 117-004); **só vale como SGRF se o GRF for aceito pela ANAC** (117.61). |
| **Assinatura eletrônica** | Gênero. Lei 14.063/2020: pode ser **simples** (login/senha, baixo risco), **avançada** (Gov.br, certificados não-ICP admitidos pelas partes) ou **qualificada**. |
| **Assinatura digital** | Espécie de assinatura eletrônica baseada em criptografia de chave pública com certificado; no sentido forte/legal brasileiro, a **qualificada** (ICP-Brasil). |
| **ICP-Brasil** | Infraestrutura de Chaves Públicas Brasileira (MP 2.200-2/2001); emite os certificados que dão **fé pública** à assinatura qualificada (A1 em software, A3 em token/cartão). |
| **Fonte oficial** | Norma publicada pela ANAC (resoluções, portarias, RBAC, IS) ou legislação federal (leis, MPs, decretos) — não blogs, resumos comerciais ou interpretações de terceiros. |
| **Registro regulado** | Registro cuja existência, conteúdo, guarda e disponibilidade são **exigidos por norma** (DB, OS, RAS, jornada, etc.); sujeito à Res. 458 quando digitalizado. |
| **Registro aceito/autorizado** | Registro digital cujo **sistema** foi formalmente aceito/autorizado pela ANAC para um regulado e escopo específicos — único caso em que o digital substitui legalmente o papel. **Não é o mesmo que "homologado".** |

---

## 4. DB Digital / eDB

> **Fontes:** Res. 458/2017 (horizontal), Res. 773/2025 (conteúdo do DB), Portaria 3.220/SPO/SAR/2019 + 14.096/2024 (procedimentos/LOA/PED), RBAC 135 EMD 15, IS 135-002, RBAC 91, IS de reconstituição (91-015B).
> **Estado no AirTrust:** módulo eDB **inexistente**. Existem eventos de voo em Escalas/EVD e protótipo de Controle de Voos. Tudo abaixo é requisito a construir.

| Requisito | Fonte normativa | Interpretação prática | Requisito funcional AirTrust | Requisito técnico | Evidência a apresentar | Status |
|---|---|---|---|---|---|---|
| **Campos obrigatórios do DB** | Res. 773/2025; Portaria 3.220 | Todos os campos do DB físico presentes no eDB | Formulário eDB campo a campo conforme 773 Art. 6 | Schema canônico do registro eDB | Mapeamento campo a campo 773×eDB | dúvida (mapa a fazer) |
| **Tripulação (PIC/SIC/demais)** | Res. 773; RBAC 135 | Identificar quem operou cada etapa | Campos PIC, SIC, demais tripulantes vinculados a Funcionários | FK p/ funcionários; papel por etapa | Exportação por tripulante | dúvida |
| **CANAC / código ANAC** | Res. 773; Portaria 14.096 (codificação de função) | Identidade regulatória do tripulante | Campo CANAC obrigatório e validado (ativo) p/ PIC e SIC | Validação contra cadastro; codificação de função vigente | Validação técnica CANAC | parcial (CANAC existe em Funcionários) |
| **Aeronave (prefixo)** | Res. 773; Res. 458 (autenticidade) | Identificação inequívoca da aeronave | Prefixo obrigatório, não editável livremente, vinculado ao cadastro | Bloqueio de abertura sem aeronave vinculada | Teste: impossível abrir eDB sem prefixo | claro (requisito), inexistente (impl.) |
| **Etapa de voo** | Res. 773 Art. 6 | Registro por etapa/trecho | Uma folha → N etapas; trecho conforme 772/773 quando aplicável | Modelo folha→etapa | Demonstração de etapas | dúvida |
| **Origem / destino** | Res. 773; RBAC 135 | ICAO/IATA de partida e chegada | Campos origem/destino por etapa | Validação de aeródromos | Relatório por rota | claro |
| **Horários (motor/decolagem/pouso/corte)** | Res. 773; IS 135-002 | Sequência temporal coerente | 4 campos distintos com validação de sequência | Validação: pouso não antes de decolagem; UTC + local | Evidência de validação de sequência | inexistente |
| **Ciclos** | Res. 773; RBAC 43 (manutenção) | Acúmulo de ciclos por aeronave | Campo ciclos por etapa; acumulação automática | Contador por prefixo | Exportação ciclos por aeronave | inexistente |
| **Pousos** | Res. 773 | Nº de pousos por etapa | Campo pousos por etapa | Contador por prefixo | Exportação pousos | inexistente |
| **POB (pessoas a bordo)** | Res. 773 | Total a bordo | Campo POB obrigatório (≥1, o PIC) | Validação mínima | Evidência de obrigatoriedade | inexistente |
| **Combustível** | Res. 773; IS 135-002 (abastecimento) | Abastecido e/ou consumido | Campos litros/kg | Unidade por aeronave | Relatório de combustível | inexistente |
| **Carga** | Res. 773 | Carga transportada | Campo carga (kg) quando aplicável | — | Relatório de carga | inexistente |
| **Natureza do voo** | Res. 773; RBAC 135 | Classificação regulatória | Campo natureza (lista controlada) | Enum conforme RBAC 135 | Lista de naturezas | inexistente |
| **Ocorrências** | Res. 773; IS 135-002; SGSO | Registro de ocorrências do voo | Campo ocorrências (texto + classificação) | Vínculo opcional p/ SGSO | Demonstração | inexistente |
| **Discrepâncias / irregularidades mecânicas** | RBAC 135 EMD 15; IS 135-002 | Discrepância gera ação de manutenção | Campo discrepância → gera OS preliminar no SDRMe | Link eDB→OS | Fluxo discrepância→OS→RAS | inexistente |
| **Assinatura do PIC** | Res. 458 (assinatura, não-repúdio); Res. 773 | PIC assina e sela a etapa/folha | Assinatura vinculada ao CANAC; imutável após assinar | Assina `record_hash`; tipo a definir (D-01) | Evidência de assinatura auditável | inexistente |
| **Assinatura do operador/designado** | Res. 458; Res. 773 | Contrassinatura do operador | Perfil operador com permissão de assinatura | Papel de assinatura | Política de assinaturas | inexistente |
| **Correções (addendum)** | Res. 458 (correção sem apagar) | Corrigir sem apagar o original | Addendum vinculado; original intacto e visível | Diff + hash + assinatura do addendum | Demonstração original+addendum | inexistente |
| **Disponibilidade a bordo (PED)** | **Portaria 3.220** | **≥1 PED funcional com dados dos últimos 30 dias** consolidados | Cache offline dos últimos ≥30 dias por aeronave | Cache local cifrado; verificação de completude | Demonstração de acesso offline a 30 dias | inexistente |
| **Operação offline** | Res. 458 (continuidade); Portaria 3.220 | eDB usável sem conexão | Abrir/lançar/assinar offline (modelo a definir, D-03/D-04) | IndexedDB cifrado + fila de sync | Teste de offline ponta a ponta | inexistente |
| **Fiscalização a bordo** | Portaria 3.220; Res. 458 | Inspetor consulta os registros no PED | Modo fiscalização read-only no tablet | Sessão fiscal com escopo + log | Evidência de acesso de fiscal | inexistente |
| **Retenção** | Res. 458; norma específica de DB | Guarda pelo prazo normativo | Política de retenção do tipo eDB | Retenção configurável; default = arquivar | Política documentada | inexistente; **prazo exato** ⛔ |
| **Contingência (falha do PED)** | Portaria 3.220; Res. 458 | Plano para falha de dispositivo | Tablet reserva / retorno ao papel documentado; migração de folha | Procedimento + drill | Manual de contingência + drill | inexistente |
| **Reconstituição** | IS 91-015B | Reconstituir caderneta/DB perdido | Exportar histórico completo por tripulante/aeronave | Exportação estruturada | Evidência de reconstituição | inexistente |

> **Ponto crítico verificado:** a Portaria 3.220 já responde, em fonte oficial, a pergunta "quantos dias devem estar disponíveis a bordo" → **últimos 30 dias de operação no PED**. Reconfirmar se a Res. 773/2025 mantém esse número. ⛔

---

## 5. SDRMe / Manutenção Digital

> **Fontes:** Res. 458 (horizontal), IS 43.9-004 (rev. a reconfirmar — A vs. B), RBAC 43, RBAC 145 (OMA), RBAC 135.
> **Estado no AirTrust:** MRO em **protótipo** com mock data; sem campos regulatórios completos, sem assinatura, sem RAS.

| Requisito | Fonte normativa | Interpretação prática | Funcionalidade AirTrust | Requisito técnico | Evidência | Status |
|---|---|---|---|---|---|---|
| **Registros de manutenção** | RBAC 43.9; IS 43.9-004 | Toda manutenção documentada | Registro regulado de manutenção no Records Core | `regulated_records` tipo manutenção | Exportação por aeronave | inexistente |
| **OS (Ordem de Serviço)** | RBAC 43.9; IS 43.9-004 | OS com conteúdo mínimo | OS: descrição do trabalho, ref. técnica, datas, executor, aprovador, licença | Schema OS; nº sequencial por aeronave | OS exportável em PDF | protótipo |
| **Task card** | RBAC 43; IS 43.9-004 | Passos com execução e inspeção | Task cards com check de executor + inspetor; OS não fecha sem todos os passos | Estado por passo; N/A justificado | Evidência step-by-step | inexistente |
| **RAS (Retorno ao Serviço)** | RBAC 43.11; IS 43.9-004 | Aprovação final p/ aeronave voltar a voar | Campo RAS com licença + assinatura do aprovador; imutável | Selagem + assinatura; status aeronave→Apta | RAS imutável demonstrável | inexistente |
| **Assinatura / licença** | Res. 458; RBAC 43 | Quem assina precisa ser habilitado | Bloqueio de assinatura se licença/qualificação vencida | Validação Funcionários+LMS antes de assinar | Evidência de bloqueio | parcial (LMS existe; sem vínculo) |
| **Dados técnicos usados** | IS 43.9-004; RBAC 43 | Referência técnica obrigatória | Campo ref. técnica (Manual, AD, SB, CMM, nº/revisão) obrigatório | Campo obrigatório | Evidência de obrigatoriedade | inexistente |
| **AD / SB** | RBAC 43 | Diretrizes/boletins por aeronave | Tracking de AD/SB: status (aberta/cumprida/N/A) por aeronave | Cadastro por modelo + status | Relatório de conformidade de AD | inexistente |
| **Componentes** | RBAC 43.10 | Rastreabilidade PN/SN | Cadastro PN/SN; histórico instalação/remoção | Histórico por aeronave | Relatório de componentes | protótipo parcial |
| **Vida limitada** | RBAC 43.10 | Life-limited parts com vencimento | Tabela vida útil (horas/ciclos/data); alerta a N% | Cálculo de remanescente | Dashboard de vida limitada | inexistente |
| **Calibração** | RBAC 43; RBAC 145 | Ferramentas calibradas | Registro de calibração + alerta de vencimento | Bloqueio/alerta de uso vencido | Relatório de calibração | inexistente |
| **Treinamento de pessoal** | RBAC 145; RBAC 43 | Pessoal qualificado | Vínculo executor↔qualificação no LMS; bloqueio se vencido | Validação automática | Evidência de validação | parcial |
| **Manutenção terceirizada (OMA)** | RBAC 145; RBAC 43 | Terceiro rastreável | Cadastro OMA (aprovação ANAC, escopo, validade); OS terceirizada + RAS da OMA | Modelo de fornecedor | Relatório de terceirizados | inexistente |
| **Transferência de registros** | RBAC 43.12 | Histórico segue a aeronave | Exportação completa estruturada por aeronave | JSON + PDF | Evidência de exportação total | inexistente |
| **Guarda / retenção** | Res. 458; RBAC 43 | Guarda pelo prazo (vida da aeronave + X) | Política de retenção de manutenção | Default arquivar | Política documentada | inexistente; **prazo** ⛔ |
| **Correção (addendum)** | Res. 458 | Corrigir sem apagar | Addendum de OS/RAS; original intacto | Diff + assinatura | Demonstração | inexistente |
| **Fiscalização** | Res. 458; RBAC 43 | Disponível para inspeção | Modo fiscalização + exportação por aeronave | Sessão fiscal + log | Evidência de exportação fiscal | inexistente |

---

## 6. Controle de Voos / Controle Operacional / RDV

> **Fontes:** RBAC 135 EMD 15 (Res. 774/2025), IS 135-002, Res. 458 (quando o registro vira oficial).
> **Estado no AirTrust:** **protótipo** navegável (dashboard OCC, programação, RDV básico) com mock data.

| Requisito | Fonte normativa | Interpretação prática | Funcionalidade AirTrust | Requisito técnico | Evidência | Status |
|---|---|---|---|---|---|---|
| **Responsabilidade do operador (controle operacional)** | RBAC 135; IS 135-002 | Operador responde pelo despacho | Release formal do voo com assinatura de PIC e despachante | Registro de release | Evidência de release assinado | protótipo |
| **Localização de voo (flight following)** | RBAC 135 EMD 15 | Saber onde o voo está | Posições reportadas (hora/posição/altitude/combustível); alerta de ausência | Threshold configurável | Evidência de tracking | inexistente |
| **Programação** | RBAC 135 | Planejar voos e tripulação | CRUD de voos; validação de aeronave/tripulação/FRMS | Integração com Escalas/EVD | Histórico de programação | protótipo |
| **POB** | RBAC 135; Res. 773 | Pessoas a bordo controladas | POB no RDV, espelhado no eDB | Campo POB | Relatório POB | inexistente |
| **Horários estimados e reais** | IS 135-002 | Planejado × realizado | RDV captura horários reais vs. programados | Comparação | Relatório de pontualidade | inexistente |
| **Supervisão operacional** | RBAC 135; IS 135-002 | OCC acompanha a operação | Dashboard OCC em tempo real | Estado por voo | Demonstração OCC | protótipo |
| **Irregularidades mecânicas** | RBAC 135 EMD 15; IS 135-002 | Discrepância vira manutenção | Irregularidade no RDV/eDB → OS no MRO | Link RDV/eDB→OS | Fluxo demonstrável | inexistente |
| **Vínculo com DB/eDB** | RBAC 135; Res. 773 | RDV e DB coerentes | RDV pré-preenche eDB; PIC assina | `regulated_record_links` | Fluxo RDV→eDB | inexistente |
| **Vínculo com manutenção** | RBAC 43; RBAC 135 | Horas/ciclos/pousos alimentam MRO | Ao fechar RDV, atualiza contadores do MRO por prefixo | Integração automática | Evidência de atualização | inexistente |
| **Vínculo com FRMS** | RBAC 117 | Jornada realizada alimenta fadiga | RDV envia horas reais ao FRMS; consulta antes de alocar | Integração bidirecional | Evidência de alerta/atualização | parcial |
| **Relatórios** | RBAC 135; Res. 458 | Relatórios regulatórios/gerenciais | Voos/horas/jornada/irregularidades/indisponibilidade exportáveis | PDF + CSV | Conjunto de relatórios | protótipo |
| **Contingência** | Res. 458; IS 135-002 | Operar com sistema indisponível | Procedimento de contingência do OCC | Plano documentado | Manual de contingência | inexistente |

---

## 7. FRMS / RBAC 117

> **Fontes:** RBAC 117 (117.61), IS 117-002 (nível básico), IS 117-003 (GRF), IS 117-004 (SGRF — rev. a reconfirmar).
> **Estado no AirTrust:** engine de fadiga **operacional** (check-in diário, score, histórico Sigvoos/FIRA), mas **sem GRF documentado** e sem captura de jornada realizada via RDV.

| Tema | Fonte | Interpretação prática | O que o sistema precisa coletar | Status |
|---|---|---|---|---|
| **Jornada** | RBAC 117 | Tempo de serviço de voo (FDP) e tempo de voo (FT) | Início/fim de jornada, etapas, repouso entre jornadas | parcial (planejado/Sigvoos) |
| **Repouso** | RBAC 117 | Repouso mínimo entre jornadas | Janelas de repouso reais por tripulante | parcial |
| **Limites prescritivos** | RBAC 117 | Limites da Lei do Aeronauta/RBAC 117 | Cálculo de limites e excedências | parcial |
| **GRF** | RBAC 117.61; IS 117-003 | Conjunto de limitações/procedimentos **aceitos pela ANAC** | Documento de GRF (não é só software) | **inexistente** |
| **SGRF** | RBAC 117.61; IS 117-004 | Sistema que implementa um GRF **aceito** | Estrutura de gestão + dados + decisões | **inexistente como SGRF aprovado** |

**Dados que o Controle de Voos precisa alimentar no FRMS:** horários reais de início/fim de jornada e de cada etapa (do RDV), pousos, ocorrências que afetem repouso, trocas de tripulação.

### 7.1 Diferença entre FRMS operacional e SGRF aprovado (crítico)

- O **FRMS do AirTrust** hoje é uma **ferramenta operacional de apoio**: calcula score de fadiga e ajuda a visualizar risco. Isso é legítimo como **suporte à decisão**.
- Um **SGRF** no sentido do RBAC 117.61 / IS 117-004 só existe quando o operador tem um **GRF formalmente aceito pela ANAC**. Sem esse aceite, **o operador continua obrigado aos limites prescritivos** e **não pode** usar o FRMS para exceder limites.

### 7.2 Riscos de dizer que o sistema "é SGRF" sem aprovação

- **Falsa conformidade:** afirmar que o operador tem um SGRF sem GRF aceito é não conformidade direta com o RBAC 117.
- **Risco de segurança e legal:** alocar tripulante além do limite prescritivo "porque o FRMS permitiu" sem SGRF aprovado é infração grave, com risco de acidente e responsabilização.
- **Postura correta:** o AirTrust deve rotular o módulo como **"ferramenta de apoio ao gerenciamento de fadiga"**, nunca como "SGRF aprovado", até que o operador específico tenha GRF aceito pela ANAC e o sistema seja referenciado nesse GRF. ⛔ `PENDENTE DE CONFIRMAÇÃO COM ANAC` se o FRMS do AirTrust pode ser citado como sistema de apoio no GRF de um operador.

---

## 8. Assinatura Eletrônica / Digital

> **Fontes:** Res. 458/2017 (Art. de requisitos de assinatura — 13 propriedades, não-repúdio, certificado ICP-Brasil **ou equivalente**), MP 2.200-2/2001 (ICP-Brasil), Lei 14.063/2020 + Decreto 10.543/2020 (níveis simples/avançada/qualificada).

### 8.1 O que a Resolução 458 exige

A Res. 458 exige que o sistema implemente, no mínimo: **criptografia assimétrica, hashing, chaves pública/privada, certificado digital de entidade autorizada (ICP-Brasil ou equivalente)** e **assinatura eletrônica/digital** que atenda a **13 propriedades** essenciais — entre elas singularidade, controle exclusivo do signatário, intenção clara de assinar, rastreabilidade, permanência e **não-repúdio** ("uma assinatura eletrônica válida não pode ser negada pelo responsável").

### 8.2 Eletrônica vs. digital (Lei 14.063/2020)

| Nível | Base | Exemplos | Fé pública |
|---|---|---|---|
| **Simples** | login/senha, baixo risco | cadastro com usuário+senha | a mais fraca |
| **Avançada** | certificado não-ICP admitido pelas partes / meios que comprovem autoria e integridade | **Gov.br** (contas prata/ouro) | média; admitida em muitas interações com entes públicos |
| **Qualificada** | certificado **ICP-Brasil** (MP 2.200-2) | A1 (software), A3 (token/cartão) | máxima; presunção legal de autenticidade |

### 8.3 Quando ICP-Brasil parece necessária / onde Gov.br pode entrar

- A Res. 458 cita "**ICP-Brasil ou equivalente**" — a palavra "equivalente" **abre espaço** para assinatura avançada (Gov.br) em parte dos registros, mas **não confirma** que a ANAC aceita Gov.br para eDB/RAS. ⛔
- Para registros de **alto valor probatório** (RAS de manutenção, encerramento de DB), a leitura conservadora aponta para **qualificada (ICP-Brasil)**; reconfirmar. ⛔
- Gov.br é **avançada**, com ICP-Brasil como backbone de identidade — candidata natural ao eDB **se** o POI/SAR aceitar. ⛔

### 8.4 Assinatura online vs. offline, carimbo de tempo, não-repúdio, addendum

- **Online:** assinatura e selagem no servidor, com `server_received_at` e cadeia de hash — modelo mais defensável.
- **Offline:** clock do dispositivo é manipulável e PWA não atesta integridade do device; recomendação técnica é **coletar intenção offline e selar/assinar no servidor ao reconectar**, registrando `client_clock_at`, `server_received_at` e drift (ver §9). Assinatura offline plena exige app nativo + keystore/ICP. ⛔
- **Carimbo de tempo:** confirmar se a ANAC exige carimbo de tempo de ACT credenciada (ICP-Brasil) para eDB/RAS. ⛔
- **Não-repúdio:** garantido tecnicamente por assinatura sobre `record_hash` + identidade do signatário + audit log imutável.
- **Correções/addendum:** correção **nunca** sobrescreve; gera addendum assinado, com original preservado.

### 8.5 Quadro comparativo de opções de assinatura

| Opção | O que é | Validade jurídica (leitura preliminar) | Custo/UX | Offline | Seguro implementar agora? | Depende da ANAC? |
|---|---|---|---|---|---|---|
| **CANAC + senha + MFA** | assinatura interna simples (Lei 14.063 "simples") | baixa para registro regulado crítico | baixo / ótima | viável | ✅ sim — para **intenção** e fluxo pré-regulado | sim p/ uso regulado |
| **Assinatura interna AirTrust (chave do sistema)** | sistema assina o hash | média; serve à integridade, não à autoria individual forte | baixo / boa | viável | ✅ sim — como camada técnica | sim |
| **Gov.br** | avançada (Lei 14.063) | média/alta; aceita em muitos atos públicos | baixo / boa | difícil offline | 🟡 protótipo de integração | **sim** — aceite p/ eDB/RAS a confirmar ⛔ |
| **ICP-Brasil A1** | qualificada, certificado em software | alta (fé pública) | médio / razoável | difícil offline | 🟡 desenhar abstração | parcial |
| **ICP-Brasil A3** | qualificada, token/cartão | alta (fé pública) | alto / pior em tablet | muito difícil | ⛔ só após consultor + PKI | sim |
| **Híbrido (interna agora + ICP/Gov.br depois)** | provider plugável | evolui sem refazer o core | médio | conforme provider | ✅ **recomendado** | parcial |

**O que é seguro implementar agora (sem depender da ANAC):** abstração de provider de assinatura, assinatura interna forte (CANAC+MFA) **rotulada como não-regulada**, assinatura sobre `record_hash`, audit log de assinatura. **O que depende da ANAC:** declarar validade regulatória; escolher ICP vs. Gov.br por tipo de registro; exigência de carimbo de tempo; assinatura offline plena. ⛔

---

## 9. Tablet / PED / EFB / Offline

> **Fontes:** Portaria 3.220/2019 (PED, 30 dias a bordo, LOA), Res. 458 (continuidade), RBAC 91 (EFB/PED/documentação a bordo).

| Tema | Requisito / leitura | Decisão técnica recomendada | Status / Pendência |
|---|---|---|---|
| **Requisitos de dispositivo** | PED funcional dedicado ao eDB | Registry de dispositivos (`regulated_devices`) com status e revogação | inexistente |
| **Disponibilidade no voo** | **≥1 PED com dados dos últimos 30 dias** (Portaria 3.220) | Cache offline ≥30 dias por aeronave, com verificação de completude | inexistente; reconfirmar prazo na 773 ⛔ |
| **Cache de registros** | acesso offline aos registros recentes | IndexedDB cifrado (AES-256) | inexistente |
| **Modo offline** | abrir/lançar/assinar sem conexão | Coletar intenção offline; selar/assinar no servidor ao reconectar (Design B) | inexistente; modelo a validar ⛔ |
| **Sincronização** | reconciliar offline→online | `regulated_sync_sessions` com drift de clock e conflito explícito | inexistente |
| **Perda/roubo do dispositivo** | proteger dados em device perdido | Cache cifrado + revogação + wipe lógico (sem garantia remota em PWA) | inexistente |
| **Contingência** | falha do PED | Tablet reserva / retorno ao papel documentado no MGO + migração de folha | inexistente |
| **PWA vs. app nativo** | PWA é frágil p/ chave privada e atestação de integridade | PWA p/ coleta/cache/leitura; **app nativo + keystore** se exigida assinatura offline forte | decisão D-03 ⛔ |
| **Limites regulatórios conhecidos** | 30 dias a bordo; LOA de eDB | seguir Portaria 3.220 | parcial (conhecido) |
| **Dúvidas pendentes** | offline mandatório ou só contingência? timestamp offline aceito? | — | ⛔ |

---

## 10. Regulated Records Core

Tradução dos requisitos normativos (Res. 458 horizontal) em capacidades técnicas. **Nenhuma tabela/endpoint abaixo deve ser implementada sem desenho físico e validação regulatória** (detalhe completo em `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`).

| Capacidade | Norma que origina | Tradução técnica | Entidade/mecanismo | Status |
|---|---|---|---|---|
| **Hash** | Res. 458 (integridade) | SHA-256 (campo `hash_algorithm` p/ evolução); hash de payload + anexos + manifesto | `regulated_record_hashes` | inexistente |
| **Canonicalização** | Res. 458 | JSON canônico com ordem determinística, datas UTC ISO-8601, escala numérica fixa, `canonical_schema_version` | função de canonicalização versionada | inexistente |
| **Seal (selagem)** | Res. 458 (imutabilidade) | ao selar: calcula hash, grava, marca `sealed`; bloqueia UPDATE direto | `regulated_records.status` + triggers | inexistente |
| **Assinatura** | Res. 458 (autenticidade/não-repúdio) | assina `record_hash`; provider plugável (interna/Gov.br/ICP) | `regulated_signatures` | inexistente |
| **Addendum** | Res. 458 (correção sem apagar) | correção vinculada ao original; diff + hashes + assinatura | `regulated_addenda` | inexistente |
| **Audit log (ledger)** | Res. 458 (trilha de auditoria) | append-only com hash chain (`previous_event_hash`→`event_hash`); UPDATE/DELETE bloqueados | `regulated_audit_events` | protótipo (`audit_events_v2` inspira) |
| **Ledger / cadeia de integridade** | Res. 458 | cadeia de hash por tenant/tipo detecta remoção/reordenação | `previous_tenant_chain_hash`/`tenant_chain_hash` | inexistente |
| **Backup** | Res. 458 (backup separado) | backup D1 com SHA-256 real por artefato e manifesto via `crypto.subtle.digest` (~~placeholder corrigido, commit `da5177af`~~); verificador local de `checksum-manifest.json` implementado; R2 de anexos com manifesto | orquestrador de backup + `checksum-manifest.ts` | parcial — digest real ✅; restore drill local ✅ (ver `docs/BACKUP_RESTORE_DRILL.md`); **falta restore em staging descartável** com verificação pós-restore de domínio |
| **Restore** | Res. 458 (recuperabilidade) | restore drill periódico + verificação de hashes pós-restore | procedimento + relatório | parcial (drill D1 documentado) |
| **Exportação fiscalizatória** | Res. 458 (formato aceitável) | ZIP com PDF + JSON canônico + manifesto + anexos + audit trail + README | `regulated_exports` | inexistente |
| **Modo fiscalização** | Res. 458 (disponibilidade) | perfil read-only temporário com escopo (empresa/aeronave/período) + expiração + log | sessão fiscal | inexistente |
| **Retenção** | Res. 458 + normas específicas | política por tipo; default = arquivar, nunca deletar | `regulated_retention_policies` | inexistente; prazos ⛔ |
| **Controle de dispositivos** | Portaria 3.220; Res. 458 | registry de PED com segredo rotacionável e revogação | `regulated_devices` | inexistente |
| **Cadeia de custódia** | Res. 458 | vínculos entre registros (RDV→eDB→discrepância→OS→RAS→FRMS/SGSO) | `regulated_record_links` | inexistente |

**Imutabilidade em D1/SQLite (recomendação do design review):** combinar **B+C+D+E** — triggers `BEFORE UPDATE/DELETE` com `RAISE(ABORT)` nas tabelas seladas (B), event log append-only (C), cadeia de hash por tenant (D) e export externo assinado em R2 (E). Bloqueio só na aplicação (A) **não basta** para registro regulado.

---

## 11. Matriz Artigo → Requisito → AirTrust

> **IDs por escopo:** `SEC-*` (Records Core / Res. 458 horizontal), `SIGN-*` (assinatura), `BACKUP-*` (backup/retenção), `DB-*` (eDB), `SDRME-*` (manutenção), `CV-*` (Controle de Voos/RDV), `FRMS-*`.
> **Prioridade:** P1 (bloqueante) / P2 (alta) / P3 (média). **Status:** claro / dúvida / `PENDENTE ANAC`.
> **Total de requisitos mapeados: 92.** Esta matriz consolida e reorganiza os 50 itens de `ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv` por escopo e adiciona os requisitos novos identificados na pesquisa de fontes oficiais (PED 30 dias, níveis de assinatura da Lei 14.063, SGRF/GRF, flight following, etc.).

### 11.1 Records Core / Segurança (Res. 458 horizontal)

| ID | Norma | Artigo/item | Requisito (resumo) | Interpretação | Módulo | Funcionalidade | Componente técnico | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | Res. 458 | requisitos do sistema | Autenticidade e integridade dos registros | Cada registro precisa ser íntegro e atribuível | Records Core | Selagem + hash | `regulated_record_hashes` | Log de hashes | P1 | claro | — |
| SEC-002 | Res. 458 | cripto | Criptografia assimétrica + chaves pública/privada | Base de assinatura e integridade | Records Core/Infra | Cripto de assinatura | lib de assinatura | Política de segurança | P1 | claro | — |
| SEC-003 | Res. 458 | transporte/repouso | TLS em trânsito + cripto em repouso | Proteção de dados regulados | Infra | TLS 1.2+ / cripto repouso | Cloudflare/D1/R2 | Certificado + política | P1 | parcial | — |
| SEC-004 | Res. 458 | auditoria | Trilha de auditoria imutável | Log append-only de tudo | Audit Log | Ledger regulado | `regulated_audit_events` | Exportação de log | P1 | protótipo | — |
| SEC-005 | Res. 458 | imutabilidade | Registro selado não sofre UPDATE/DELETE | Bloqueio no banco, não só na app | Records Core | Triggers | RAISE(ABORT) | Teste de mutação bloqueada | P1 | inexistente | — |
| SEC-006 | Res. 458 | correção | Correção via addendum sem apagar | Original intacto + correção vinculada | Records Core | Addendum | `regulated_addenda` | Demonstração | P1 | inexistente | — |
| SEC-007 | Res. 458 | rastreabilidade | Quem corrigiu, quando e por quê | Autor/motivo/timestamp no addendum | Records Core | Addendum auditável | diff + hash | Relatório de addenda | P1 | inexistente | — |
| SEC-008 | Res. 458 | disponibilidade | Disponível p/ fiscalização a qualquer tempo | Modo fiscalização read-only | Records Core | Sessão fiscal | perfil temporário | Evidência de acesso fiscal | P1 | inexistente | — |
| SEC-009 | Res. 458 | exportação | Formato exportável aceitável | PDF + JSON + manifesto | Records Core | Export fiscal | `regulated_exports` | Pacote validado | P1 | inexistente | formato aceito ⛔ |
| SEC-010 | Res. 458 | logs de acesso | Logs de login/logout/IP | Detecção de acesso suspeito | Infra | Log de acesso | auth + ledger | Exportação de acessos | P2 | parcial | — |
| SEC-011 | Res. 458 Art. 3º | autorização de escopo | Autorização expressa da ANAC quanto ao escopo | Pleito por regulado/escopo | Governança | Pacote de pleito | docs | Pleito instruído | P1 | inexistente | via do Art. 3º ⛔ |
| SEC-012 | Res. 458 Art. 3º | demonstração de segurança | ISO 27000 **ou** Blockchain **ou** cópia em BD ANAC | Escolher uma das três vias | Governança/Infra | Certificação/Blockchain/cópia | decisão | Evidência da via escolhida | P1 | inexistente | qual via ⛔ |
| SEC-013 | Res. 458 | continuidade | Continuidade em falha do sistema | Plano de contingência | Records Core/Infra | DR/contingência | procedimentos | Plano + drill | P1 | inexistente | — |
| SEC-014 | Res. 458 | versionamento de software | Histórico de versões/correções de software | Changelog auditável | DevOps | Changelog formal | git + release notes | Changelog | P3 | parcial | — |
| SEC-015 | Res. 458 | cadeia de custódia | Vínculo entre registros regulados | RDV→eDB→OS→RAS rastreável | Records Core | Links | `regulated_record_links` | Fluxo end-to-end | P2 | inexistente | — |

### 11.2 Assinatura (Res. 458 + Lei 14.063 + MP 2.200-2)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SIGN-001 | Res. 458 | assinatura | Assinatura eletrônica com validade jurídica | Tipo a definir por registro | Records Core | Módulo de assinatura | `regulated_signatures` | Política de assinatura | P1 | inexistente | tipo aceito ⛔ |
| SIGN-002 | Res. 458 | 13 propriedades | Singularidade, controle exclusivo, não-repúdio, etc. | Assinatura cobre `record_hash`+identidade | Records Core | Assinatura forte | provider plugável | Evidência técnica | P1 | inexistente | — |
| SIGN-003 | MP 2.200-2 | ICP-Brasil | Certificado qualificado quando exigido | A1/A3 p/ alto valor | Records Core | Integração ICP | provider ICP | Evidência de integração | P1 | inexistente | exige ICP? ⛔ |
| SIGN-004 | Lei 14.063 | avançada | Gov.br como assinatura avançada | Candidata p/ eDB | Records Core | Integração Gov.br | provider Gov.br | Decisão documentada | P2 | inexistente | aceite ANAC ⛔ |
| SIGN-005 | Lei 14.063 | simples | Login+senha p/ baixo risco/intenção | Não-regulado/pré-regulado | Records Core | Assinatura simples | CANAC+MFA | — | P2 | parcial | — |
| SIGN-006 | Res. 458 | vínculo identidade | Assinatura vinculada a CANAC/licença | Identidade regulatória do assinante | Funcionários | CANAC como identidade | FK | Validação | P1 | parcial | — |
| SIGN-007 | RBAC 43/Res.458 | habilitação | Bloqueio se licença/qualificação vencida | Não assina sem habilitação | LMS/SDRMe | Validação pré-assinatura | regra | Evidência de bloqueio | P1 | parcial | — |
| SIGN-008 | Res. 458 | carimbo de tempo | Carimbo de tempo confiável | ACT/ICP a confirmar | Records Core | Timestamping | provider | — | P2 | inexistente | exige ACT? ⛔ |
| SIGN-009 | Res. 458 | offline | Assinatura offline vs. online | Intenção offline + selo servidor | DB Digital | Sync de assinatura | `regulated_sync_sessions` | Teste offline | P1 | inexistente | offline pleno? ⛔ |
| SIGN-010 | Res. 458 | revogação | Revogação de assinatura/certificado | Status regulatório cai | Records Core | Revogação | campo `revoked_at` | Teste de revogação | P2 | inexistente | — |

### 11.3 Backup / Retenção (Res. 458 + normas específicas)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BACKUP-001 | Res. 458 | backup separado | Backup regular separado | Cópia independente | Infra | Backup D1+R2 | orquestrador | Relatório de backup | P1 | parcial | — |
| BACKUP-002 | Res. 458 | restauração | Restauração verificada (drill) | Drill documentado periódico | Infra | Restore drill | procedimento | Relatório de restore | P1 | parcial | — |
| BACKUP-003 | Res. 458 | integridade do backup | Digest real do pacote (não placeholder) | SHA-256 real via `crypto.subtle.digest`; verificador local de manifesto (`checksum-manifest.ts`) com teste unitário | Infra | SHA-256 real | manifesto + teste | Hash verificável; restore drill local rodável (ver `docs/BACKUP_RESTORE_DRILL.md`) | P1 | **mitigado localmente ✅** — digest real e drill local implementados; **falta restore em staging** descartável com verificação pós-restore de `record_hash`/chain | — |
| BACKUP-004 | Res. 458 | perda = nunca registrado | Operador responde pela guarda | Sem perda irrecuperável | Infra/Governança | Redundância | R2 versionado | Política | P1 | parcial | — |
| BACKUP-005 | Res. 458 + DB | retenção DB | Reter eDB pelo prazo normativo | Prazo por tipo | Records Core | Retenção | `regulated_retention_policies` | Política | P1 | inexistente | prazo eDB ⛔ |
| BACKUP-006 | RBAC 43 | retenção manutenção | Reter manutenção (vida + X) | Prazo por tipo | Records Core | Retenção | política | Política | P1 | inexistente | prazo manut. ⛔ |

### 11.4 DB Digital / eDB (Res. 773 + Portaria 3.220 + RBAC 135)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| DB-001 | Res. 773 | campos do DB | eDB com todos os campos do DB físico | Substituição válida | DB Digital | Formulário eDB | schema canônico | Mapa campo a campo | P1 | inexistente | mapa 773 ⛔ |
| DB-002 | Res. 773 | aeronave | Identificação inequívoca (prefixo) | Não editável livremente | DB Digital | Campo prefixo | FK aeronave | Teste de bloqueio | P1 | inexistente | — |
| DB-003 | Res. 773 | tripulação/CANAC | CANAC de PIC/SIC | Identidade regulatória | DB Digital | Campos CANAC | FK funcionários | Validação | P1 | parcial | — |
| DB-004 | Portaria 14.096 | codificação função | Codificação de função de tripulante | Vigente desde 2024 | DB Digital | Enum função | enum | Conformidade | P2 | inexistente | codificação ⛔ |
| DB-005 | Res. 773 Art. 6 | etapa/trecho | Registro por etapa (ou trecho) | Folha→N etapas | DB Digital | Modelo de etapas | schema | Demonstração | P1 | inexistente | — |
| DB-006 | Res. 773 | origem/destino | ICAO/IATA por etapa | — | DB Digital | Campos rota | enum aeródromo | Relatório | P1 | inexistente | — |
| DB-007 | Res. 773; IS 135-002 | horários | Motor/decolagem/pouso/corte | Sequência coerente | DB Digital | 4 campos + validação | validação | Evidência | P1 | inexistente | — |
| DB-008 | Res. 773; RBAC 43 | ciclos | Ciclos por etapa | Acúmulo por aeronave | DB Digital | Campo ciclos | contador | Exportação | P1 | inexistente | — |
| DB-009 | Res. 773 | pousos | Pousos por etapa | Acúmulo por aeronave | DB Digital | Campo pousos | contador | Exportação | P1 | inexistente | — |
| DB-010 | Res. 773 | POB | Pessoas a bordo | ≥1 (PIC) | DB Digital | Campo POB | validação | Evidência | P1 | inexistente | — |
| DB-011 | Res. 773; IS 135-002 | combustível | Abastecido/consumido | Unidade por aeronave | DB Digital | Campo combustível | campo | Relatório | P2 | inexistente | — |
| DB-012 | Res. 773 | carga | Carga transportada | kg quando aplicável | DB Digital | Campo carga | campo | Relatório | P2 | inexistente | — |
| DB-013 | Res. 773; RBAC 135 | natureza | Natureza do voo | Lista controlada | DB Digital | Enum natureza | enum | Lista | P1 | inexistente | enum ⛔ |
| DB-014 | Res. 773; IS 135-002 | ocorrências | Ocorrências do voo | Texto + classificação | DB Digital | Campo ocorrências | campo | Demonstração | P2 | inexistente | — |
| DB-015 | RBAC 135 EMD 15 | irregularidade mecânica | Discrepância técnica | Gera OS no SDRMe | DB Digital/SDRMe | Link eDB→OS | `regulated_record_links` | Fluxo | P1 | inexistente | — |
| DB-016 | Res. 458; Res. 773 | assinatura PIC | PIC assina e sela | Imutável após assinar | DB Digital | Assinatura PIC | `regulated_signatures` | Evidência | P1 | inexistente | tipo ⛔ |
| DB-017 | Res. 458; Res. 773 | assinatura operador | Operador/designado assina | Contrassinatura | DB Digital | Assinatura operador | papel | Política | P1 | inexistente | quando/se ⛔ |
| DB-018 | Res. 458 | addendum eDB | Correção sem apagar | Original visível | DB Digital | Addendum | `regulated_addenda` | Demonstração | P1 | inexistente | — |
| DB-019 | **Portaria 3.220** | PED a bordo | **≥1 PED com últimos 30 dias** | Disponibilidade a bordo | DB Digital/PED | Cache ≥30 dias | IndexedDB cifrado | Demonstração offline | P1 | inexistente | a 773 mantém 30d? ⛔ |
| DB-020 | Res. 458; Portaria 3.220 | offline | Operação offline | Coleta offline + selo online | DB Digital | Sync offline | sync sessions | Teste ponta a ponta | P1 | inexistente | modelo ⛔ |
| DB-021 | Portaria 3.220 | fiscalização a bordo | Modo fiscal no PED | Read-only offline | DB Digital | Modo fiscal tablet | sessão fiscal | Evidência | P1 | inexistente | — |
| DB-022 | IS 91-015B | reconstituição | Reconstituir caderneta/DB | Exportar histórico completo | DB Digital | Exportação por tripulante | export | Evidência | P2 | inexistente | nº/rev. IS ⛔ |
| DB-023 | Portaria 3.220 | LOA | Autorização via LOA de eDB | Modelo anexo à 3.220 | Governança | Pacote de pleito | docs | LOA instruída | P1 | inexistente | modelo vigente ⛔ |
| DB-024 | RBAC 135; IS 135-002 | MGO | MGO reflete uso do eDB | Pré-requisito de oficialidade | Governança | Capítulo de MGO | docs | MGO atualizado | P1 | inexistente | — |

### 11.5 SDRMe / Manutenção (IS 43.9-004 + RBAC 43 + RBAC 145)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SDRME-001 | IS 43.9-004; RBAC 43.9 | OS completa | Campos regulatórios da OS | Descrição+ref+datas+licença+assinatura | SDRMe | OS regulada | schema OS | OS em PDF | P1 | protótipo | rev. IS ⛔ |
| SDRME-002 | RBAC 43.9 | descrição do trabalho | Texto narrativo do que foi feito | Não só referência | SDRMe | Campo descrição | campo | OS | P1 | inexistente | — |
| SDRME-003 | IS 43.9-004 | referência técnica | Manual/AD/SB/CMM + revisão | Obrigatório | SDRMe | Campo ref. técnica | campo | OS | P1 | inexistente | — |
| SDRME-004 | RBAC 43 | task card | Execução + inspeção por passo | OS não fecha sem passos | SDRMe | Task cards | estado por passo | Evidência step | P1 | inexistente | — |
| SDRME-005 | RBAC 43.11 | RAS | Aprovação p/ Retorno ao Serviço | Imutável após assinar | SDRMe | RAS assinada | seal+sign | RAS imutável | P1 | inexistente | — |
| SDRME-006 | RBAC 43 | horas/datas executor | Horas-homem, datas, executor | Rastreabilidade | SDRMe | Campos executor | campos | Relatório | P2 | inexistente | — |
| SDRME-007 | RBAC 43.10 | componentes PN/SN | Removidos/instalados | Histórico por aeronave | SDRMe/MRO | Cadastro componentes | histórico | Relatório | P1 | protótipo parcial | — |
| SDRME-008 | RBAC 43.10 | vida limitada | Life-limited parts + alerta | Vencimento por horas/ciclos | MRO | Vida limitada | cálculo | Dashboard | P1 | inexistente | — |
| SDRME-009 | RBAC 43 | AD/SB | Tracking de AD/SB por aeronave | Status aberta/cumprida/N/A | MRO | AD/SB tracking | cadastro+status | Relatório AD | P1 | inexistente | — |
| SDRME-010 | RBAC 43; 145 | calibração | Ferramentas calibradas | Alerta de vencimento | SDRMe | Calibração | registro | Relatório | P2 | inexistente | — |
| SDRME-011 | RBAC 145 | qualificação pessoal | Pessoal habilitado p/ tarefa | Bloqueio se vencido | SDRMe/LMS | Vínculo qualificação | validação | Evidência | P1 | parcial | — |
| SDRME-012 | RBAC 145 | terceirização (OMA) | OMA rastreável + RAS da OMA | Aprovação ANAC da OMA | SDRMe | Módulo OMA | cadastro | Relatório terceirizados | P2 | inexistente | replicar ou referenciar? ⛔ |
| SDRME-013 | RBAC 43.12 | transferência | Transferir registros | Exportação estruturada | SDRMe/Records Core | Exportação total | export | Evidência | P2 | inexistente | formato ⛔ |
| SDRME-014 | Res. 458 | addendum OS/RAS | Correção sem apagar | Original intacto | SDRMe | Addendum | `regulated_addenda` | Demonstração | P1 | inexistente | — |
| SDRME-015 | Res. 458; RBAC 43 | fiscalização | Exportação fiscal por aeronave | Modo fiscal | SDRMe | Export fiscal | sessão fiscal | Evidência | P1 | inexistente | — |
| SDRME-016 | RBAC 135 | MGM/MOM | Manual reflete SDRMe digital | Pré-requisito de oficialidade | Governança | Capítulo MGM/MOM | docs | Manual atualizado | P1 | inexistente | — |
| SDRME-017 | RBAC 43; 135 | aeronave apta no OCC | RAS atualiza status p/ "Apta" | Bloqueio de voo sem RAS | SDRMe/CV | Status airworthiness | link | Demonstração | P1 | inexistente | — |
| SDRME-018 | IS 43.9-004; Res. 458 | aceitação do sistema | Pleito 458 p/ SDRMe | Por operador e/ou OMA | Governança | Pacote de pleito | docs | Pleito instruído | P1 | inexistente | por operador ou OMA? ⛔ |

### 11.6 Controle de Voos / RDV (RBAC 135 + IS 135-002)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CV-001 | RBAC 135; IS 135-002 | controle operacional | Release formal do voo | Assinatura PIC + despachante | Controle de Voos | Release digital | assinatura | Evidência | P1 | protótipo | — |
| CV-002 | RBAC 135 EMD 15 | localização de voo | Flight following | Posições + alerta de ausência | Controle de Voos | Tracking | posições | Evidência | P1 | inexistente | threshold ⛔ |
| CV-003 | RBAC 135 | programação | CRUD de voos validado | Aeronave/tripulação/FRMS | Controle de Voos | Programação | integra Escalas | Histórico | P2 | protótipo | — |
| CV-004 | RBAC 135; Res. 773 | POB | POB no RDV | Espelha eDB | Controle de Voos | Campo POB | campo | Relatório | P2 | inexistente | — |
| CV-005 | IS 135-002 | horários est./reais | Planejado × realizado | RDV captura reais | Controle de Voos | RDV horários | comparação | Relatório | P1 | inexistente | — |
| CV-006 | RBAC 135; IS 135-002 | supervisão | Dashboard OCC em tempo real | Estado por voo | Controle de Voos | OCC dashboard | estado | Demonstração | P2 | protótipo | — |
| CV-007 | RBAC 135 EMD 15 | irregularidades | Irregularidade → OS | Vínculo manutenção | Controle de Voos/SDRMe | Link | `regulated_record_links` | Fluxo | P1 | inexistente | — |
| CV-008 | RBAC 135; Res. 773 | vínculo eDB | RDV pré-preenche eDB | PIC assina | Controle de Voos/DB | Pré-preenchimento | link | Fluxo | P1 | inexistente | precedência RDV×eDB ⛔ |
| CV-009 | RBAC 43; 135 | vínculo manutenção | Horas/ciclos/pousos → MRO | Atualiza contadores | Controle de Voos/MRO | Integração | automação | Evidência | P1 | inexistente | — |
| CV-010 | RBAC 117 | vínculo FRMS | Jornada realizada → FRMS | Consulta antes de alocar | Controle de Voos/FRMS | Integração | bidirecional | Evidência | P1 | parcial | — |
| CV-011 | RBAC 135; Res. 458 | relatórios | Relatórios regulatórios | Voos/horas/jornada/irregular. | Controle de Voos | Relatórios | export | Conjunto | P2 | protótipo | — |
| CV-012 | Res. 458; IS 135-002 | contingência | Operar com sistema indisponível | Procedimento OCC | Controle de Voos | Contingência | plano | Manual | P2 | inexistente | — |

### 11.7 FRMS (RBAC 117 + IS 117-002/003/004)

| ID | Norma | Item | Requisito | Interpretação | Módulo | Funcionalidade | Componente | Evidência | Prio | Status | Dúvidas |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FRMS-001 | RBAC 117 | jornada | Capturar FDP/FT | Início/fim/etapas | FRMS | Jornada | dados | Relatório jornada | P1 | parcial | — |
| FRMS-002 | RBAC 117 | repouso | Repouso mínimo entre jornadas | Janelas reais | FRMS | Repouso | dados | Relatório | P1 | parcial | — |
| FRMS-003 | RBAC 117 | limites prescritivos | Calcular limites/excedências | Lei do Aeronauta/117 | FRMS | Limites | cálculo | Relatório | P1 | parcial | — |
| FRMS-004 | RBAC 117.61; IS 117-003 | GRF | GRF aceito pela ANAC | Documento, não software | FRMS/Governança | GRF documentado | docs | GRF aceito | P1 | inexistente | processo de aceite ⛔ |
| FRMS-005 | RBAC 117.61; IS 117-004 | SGRF | SGRF só com GRF aceito | Não declarar SGRF sem aceite | FRMS/Governança | Estrutura SGRF | processo | SGRF aprovado | P1 | inexistente | FRMS citável no GRF? ⛔ |
| FRMS-006 | RBAC 117 | jornada realizada | Captura via RDV | Hoje só Sigvoos/planejado | FRMS/CV | Integração RDV | link | Evidência | P1 | parcial | — |
| FRMS-007 | RBAC 117 | alerta na programação | Alerta/bloqueio ao alocar fatigado | Política do operador | FRMS/CV | Alerta/bloqueio | regra | Evidência | P1 | parcial | bloquear ou alertar? ⛔ |
| FRMS-008 | RBAC 117 | exportação jornada | Jornada por tripulante p/ fiscalização | Formato regulatório | FRMS | Export | export | Relatório | P2 | inexistente | — |

---

## 12. Lacunas Atuais do AirTrust

### 12.1 O que já existe (fundações reutilizáveis)
- Cloudflare Workers + Hono, D1/SQLite, R2; SPA React 19.
- Auth JWT (jti, expiração, blocklist, refresh rotation), multi-tenancy por `empresa_id`, RBAC.
- Auditoria legada (`auditoria`) e auditoria v2 (`audit_events_v2`) com sanitização.
- Backup manual/modular D1+R2; drill D1 documentado.
- FRMS operacional (check-in, score, histórico Sigvoos/FIRA), read-ack, eventos dedicados.
- Funcionários com CANAC/CPF/ASO/CMA; Qualificações; Escalas/EVD; LMS; SGSO.
- Upload de documentos com SHA-256 em alguns fluxos de pasta virtual.

### 12.2 O que é protótipo (não regulado)
- **MRO** e **Controle de Voos** — navegáveis, com **mock data** no frontend, sem persistência regulada, sem assinatura, sem RAS, sem links.
- PWA atual com APIs `network-only` — **não** entrega offline regulatório para eDB.

### 12.3 O que falta (capacidades centrais)
- **Records Core inteiro:** `regulated_records`, versões, hashes, cadeia, assinaturas, addendum, ledger imutável, exports, devices, sync, retenção, links.
- Módulo **eDB** completo; módulo **SDRMe** regulado (OS completa, task cards, RAS, vida limitada, AD/SB, calibração, OMA, transferência).
- **Assinatura** com validade jurídica (provider plugável + decisão ICP/Gov.br).
- **Offline** regulatório (cache ≥30 dias, sync, conflito).
- **Exportação fiscalizatória** e **modo fiscalização**.

### 12.4 O que é bloqueante (P1)
Records Core (SEC-001..015), assinatura (SIGN-001..003,006,007,009), restore drill em staging (BACKUP-002), imutabilidade no banco (SEC-005), addendum (SEC-006), eDB núcleo (DB-001,002,007,016,019,020), RAS (SDRME-005), flight following e release (CV-001,002), GRF/SGRF (FRMS-004,005), MGO/MGM (DB-024, SDRME-016). *(BACKUP-003 — digest placeholder — mitigado localmente em commit `da5177af`; removido desta lista; BACKUP-002 permanece aberto: falta restore drill em staging descartável com verificação pós-restore de domínio.)*

### 12.5 O que pode ser preparado agora (sem ANAC)
- Desenho físico e scaffolding do Records Core **em modo não-regulado** (canonicalização, hash, ledger append-only, addendum, export package, device registry, testes de integridade).
- ~~Corrigir o **checksum placeholder** do backup por SHA-256 real (BACKUP-003).~~ ✅ **CONCLUÍDO** em commit `da5177af` — digest SHA-256 real via `crypto.subtle.digest`; verificador local de `checksum-manifest.json` adicionado (`checksum-manifest.ts`); restore drill local com fixtures fake rodável via Vitest (ver `docs/BACKUP_RESTORE_DRILL.md`). **Pendente:** restore drill em staging descartável com verificação pós-restore de domínio e integridade de `record_hash`/chain (BACKUP-002).
- Abstração de provider de assinatura (sem declarar validade regulatória).
- Mapeamento campo a campo da Res. 773 / Portaria 3.220 (documental).
- Banners de "protótipo / não-regulado" nos módulos (governança de superfície).

### 12.6 O que depende de definição regulatória (⛔)
Tipo de assinatura aceito (ICP/Gov.br/CANAC por categoria); offline pleno vs. contingência; timestamp offline; prazos de retenção; quantidade de dias no PED sob a 773; precedência RDV×eDB; via do Art. 3º da 458; autorização por frota/prefixo; aceite do GRF; formato fiscal aceito; transição papel→digital; OMA terceirizada (replicar vs. referenciar).

---

## 13. Roadmap Recomendado

| Fase | Objetivo | Entregáveis-chave | Depende de | Pode começar sem ANAC? |
|---|---|---|---|---|
| **F1 — Dossiê regulatório oficial** | Este documento + validação com consultor | Dossiê validado; 21 dúvidas (§14) respondidas por escrito | — | sim (dossiê); não (respostas) |
| **F2 — Matriz de requisitos fechada** | Matriz §11 validada campo a campo (773/3.220/IS 43.9-004) | Matriz aprovada por consultor; mapa de campos do DB | F1 | parcial |
| **F3 — Decisões de assinatura/offline** | Fechar D-01..D-04 (ICP/Gov.br, offline, timestamp) | Política de Assinatura; modelo de offline; decisão PWA vs. nativo | F1 | não |
| **F4 — Records Core mínimo** | Camada horizontal (não-regulada→regulada) | Canonicalização, hash, ledger, addendum, export, devices, retenção; **backup com digest real** | F2 | sim (não-regulado) |
| **F5 — DB Digital MVP** | eDB sobre o Records Core | Campos 773/3.220, assinatura PIC, offline ≥30 dias, modo fiscal, contingência | F4, F3 | parcial |
| **F6 — SDRMe MVP** | Manutenção regulada | OS completa, task cards, RAS, vida limitada, AD/SB, calibração, OMA | F4 | parcial |
| **F7 — Controle de Voos integrado** | Ciclo RDV→eDB→OS→RAS→FRMS/MRO | Release, flight following, RDV, links, contadores MRO, FRMS bidirecional | F5, F6 | parcial |
| **F8 — Piloto interno controlado** | Operação paralela (papel+digital) com um operador | Período paralelo; zero divergência crítica; audit íntegro | F5–F7 | sim |
| **F9 — Pacote de evidências** | Artefatos para o pleito do operador | Políticas, manuais, evidências (hash/audit/offline/export), MGO/MGM | F8 | sim |
| **F10 — Conversa formal com ANAC/POI** | Instruir o pleito do operador piloto | Reunião com POI; LOA/aceite documentado | F9 | n/a |

**Artefatos do pacote (F9), consolidados do doc interno:** Matriz de conformidade; Relatório de conformidade Res. 458; Descrição de arquitetura; Política de Segurança da Informação; Política de Assinatura Eletrônica; Política de Backup/Restauração; Plano de Contingência; Manuais (Piloto/eDB, OCC, Manutenção, Admin); Evidências de testes/offline/hash/audit/export; Plano de Treinamento (LMS); Plano de Transição papel→digital; Alterações de MGO/MGM/MOM; Escopo de aeronaves; Escopo de registros substituídos.

---

## 14. Lista de Dúvidas Pendentes para ANAC

> Tratar como **futura consulta oficial** (via POI/SAR ou SIC), **não** como parecer de consultor. Cada item está marcado `PENDENTE DE CONFIRMAÇÃO COM ANAC`.

**A. Autorização / escopo**
1. O AirTrust (fornecedor) precisa de algum ateste próprio, ou apenas cada operador/OMA pleiteia uso ao seu POI? ⛔
2. Qual via do **Art. 3º da Res. 458** o regulado deve adotar — certificação ISO 27000, Blockchain, ou cópia em banco de dados ANAC? ⛔
3. A autorização de uso é por **frota (modelo)** ou por **prefixo individual**? ⛔

**B. eDB**
4. A **Res. 773/2025** já está em vigor e há IS/portaria complementar? O que da Res. 457 foi revogado? ⛔
5. A **Portaria 3.220/2019** segue vigente em paralelo? A 773 altera o requisito dos **30 dias no PED**? ⛔
6. Qual o **modelo de LOA de eDB** vigente (anexo da 3.220 ou atualizado)? ⛔
7. Qual a **codificação de função de tripulante** vigente (Portaria 14.096/2024)? ⛔
8. Qual o **prazo de retenção** do eDB? ⛔

**C. SDRMe**
9. Qual a **revisão vigente da IS 43.9-004** (A vs. B)? ⛔
10. A autorização do SDRMe é por **OMA** ou por **operador** (manutenção interna)? ⛔
11. Na OMA terceirizada, o SDRMe do operador **replica** os registros da OMA ou apenas **referencia** a documentação dela? ⛔

**D. Assinatura**
12. A ANAC aceita **Gov.br (avançada)** para eDB e SDRMe, ou exige **ICP-Brasil (qualificada)**? Para quais registros? ⛔
13. Para registros menos críticos, é aceita **assinatura simples (CANAC+senha/MFA)**? ⛔
14. Há exigência de **carimbo de tempo** de ACT credenciada (ICP-Brasil)? ⛔
15. O **RAS digital** tem a mesma validade do RAS em papel se assinado com ICP-Brasil? ⛔

**E. Offline**
16. O eDB deve funcionar **offline obrigatoriamente** ou apenas como **contingência documentada**? ⛔
17. **Timestamp offline** (sem NTP) é aceito se sincronizado com o servidor e o drift for documentado? ⛔

**F. Tablet / PED / EFB**
18. Há exigência de **app nativo** (vs. PWA) para assinatura/atestação de dispositivo? ⛔
19. Requisitos de EFB/PED do **RBAC 91** aplicáveis ao eDB? ⛔

**G. Fonte oficial dos dados**
20. Em caso de divergência **RDV × eDB**, qual é a **fonte oficial** / qual prevalece? ⛔

**H. Transição papel→digital**
21. É exigido **período mínimo de operação paralela** antes de descontinuar o papel? Registros históricos precisam ser digitalizados/importados, ou o digital vale a partir da data de autorização? ⛔

**I. FRMS / SGRF**
22. O FRMS do AirTrust pode ser **citado como sistema de apoio no GRF** de um operador sem ser, ele próprio, "aprovado"? Qual o processo de **aceite do GRF/SGRF**? ⛔

**J. Fiscalização / exportação**
23. Qual **formato de exportação** é aceito pela fiscalização (PDF/JSON/XML/CSV + manifesto)? Há requisitos de verificação de integridade do pacote? ⛔

---

## 15. Conclusão

### 15.1 O que sabemos com segurança (fonte oficial)
- A ANAC **não homologa software genericamente**; o caminho é **aceitação/autorização por regulado e escopo** sob a **Res. 458/2017** (vigente; alterada por 511/2019 e 678/2022).
- A Res. 458 exige **cripto assimétrica, hash, assinatura com não-repúdio (13 propriedades), certificado ICP-Brasil ou equivalente, backup separado, auditoria, disponibilidade para fiscalização** e, no Art. 3º, **autorização expressa de escopo + demonstração de segurança** (ISO 27000 / Blockchain / cópia em BD ANAC).
- O **Diário de Bordo** passou a ser regido, no conteúdo, pela **Res. 773/2025** (substitui a 457 no tema); o **eDB** tem procedimentos e **modelo de LOA** na **Portaria 3.220/2019** (alterada pela 14.096/2024), com exigência de **PED com os últimos 30 dias a bordo**.
- O **SDRMe** existe como caminho real (IS 43.9-004 + Res. 458; precedente LATAM); o **DB Digital** também (precedente Líder Aviação).
- A **Lei 14.063/2020** define **simples/avançada/qualificada**; **Gov.br = avançada**, **ICP-Brasil = qualificada**.
- O **RBAC 117** só admite exceder limites prescritivos via **SGRF com GRF aceito pela ANAC** (117.61; IS 117-004) — logo, **FRMS ≠ SGRF aprovado**.
- O **RBAC 135** foi atualizado pela **Emenda 15 (Res. 774/2025)**.

### 15.2 O que ainda não sabemos (⛔ PENDENTE ANAC)
As 23 perguntas do §14 — com destaque para: **tipo de assinatura aceito por registro**, **offline obrigatório vs. contingência**, **timestamp offline**, **prazos de retenção**, **revisão vigente da IS 43.9-004**, **via do Art. 3º da 458**, **modelo de LOA**, **precedência RDV×eDB**, **aceite do GRF**, **formato fiscal** e **transição papel→digital**.

### 15.3 O que NÃO devemos implementar antes de resolver
- Não declarar **validade jurídica** de qualquer assinatura, nem **assinatura offline plena em PWA**, antes de D-01..D-04.
- Não tratar **PDF como registro primário** (o registro primário é o JSON canônico).
- Não operar **MRO/Controle de Voos mockados como regulados**, nem chamar o FRMS de **"SGRF aprovado"**.
- Não usar os termos **"homologado/certificado/regulado"** para qualquer módulo antes de autorização formal por operador.

### 15.4 Próximo passo técnico recomendado
Avançar com o que **independe da ANAC**: produzir o **ADR de desenho físico do Regulated Records Core** (D1/R2: tabelas, triggers de imutabilidade, hash chain, canonicalização JSON, boundaries de serviço, testes de arquitetura) **sem criar migrations nem alterar código** — em paralelo à contratação do consultor regulatório para fechar o §14. ~~Corrigir o checksum placeholder do backup (BACKUP-003)~~ ✅ **CONCLUÍDO** em commit `da5177af`; restore drill local implementado (ver `docs/BACKUP_RESTORE_DRILL.md`). Próxima etapa de backup: restore drill em **staging descartável** com verificação pós-restore de domínio e integridade de `record_hash`/chain (BACKUP-002).

---

## Entregáveis do dossiê (resumo)

1. **Documento criado:** `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md` (este arquivo).
2. **Normas oficiais usadas:** Res. 458/2017 (+511/2019, +678/2022); Res. 457/2017; Res. 773/2025; Res. 772/2025; Portaria 3.220/SPO/SAR/2019 (+14.096/2024); IS 43.9-004 (rev. a confirmar); RBAC 43; RBAC 91; RBAC 135 EMD 15 (Res. 774/2025); IS 135-002; RBAC 117 (+IS 117-002/003/004); RBAC 145; IS 91-015B; MP 2.200-2/2001 (ICP-Brasil); Lei 14.063/2020 + Decreto 10.543/2020; normativos de cibersegurança ANAC.
3. **Requisitos mapeados:** **92** (15 SEC + 10 SIGN + 6 BACKUP + 24 DB + 18 SDRME + 12 CV + 8 FRMS — incluindo DB-023/024 e SDRME-017/018 de governança).
4. **Dúvidas pendentes para ANAC:** **23** (§14).
5. **Top-20 requisitos bloqueantes:** ver §15 abaixo na resposta de entrega.

> **Próxima revisão deste dossiê:** após validação com consultor regulatório e respostas oficiais às 23 dúvidas do §14.

---

*Produzido por AirTrust Engineering — 2026-06-14 — v1.0, rascunho interno. Não submetido à ANAC. Não constitui parecer regulatório nem afirmação de homologação.*
