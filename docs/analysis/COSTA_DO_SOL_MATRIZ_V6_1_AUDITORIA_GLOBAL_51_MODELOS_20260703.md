# Costa do Sol / AirTrust — Matriz V6.1 Auditoria Global dos 51 Modelos 20260703

**Data-base:** 2026-07-03
**Caráter:** Documental / read-only. Nenhuma implementação, migration, DML, deploy ou alteração funcional.
**Fontes:** V5/V5.1, V6 implementation report, source map CSV (1122 relações), migrations 0293/0299/0300/0382, auditoria semestrais, PTO Rev. 10.

---

## 1. Veredito

**NO-GO para apply da V6 atual. GO para revisão global V6.1 documental.**

A V6 cobriu 39 modelos com a filosofia 18 técnicas + 15 NOTECHS. Porém, 12 modelos operacionais ativos ficaram de fora. Esses 12 modelos **ainda usam estrutura de 22 itens, sem NOTECHS, com códigos genéricos LOFT e códigos CRM/NTS legados**. Manter a V6 parcial aplicada enquanto 12 fichas operacionais permanecem com lógica antiga criaria inconsistência pedagógica e risco regulatório.

**Condições para GO futuro:**
- Todos os 51 modelos revisados e classificados.
- 12 modelos restantes com decisão documentada.
- Instrutor e examinador com fontes regulatórias localizadas ou pendência explicitamente registrada.
- Semestrais AW139 convertidos para 18+15.
- Nenhuma ficha operacional ativa com CRM/NTS nas 18 técnicas.
- PR #241 mantido como draft parcial.

---

## 2. Por que a V6 de 39 Modelos Virou Parcial

A decisão original de excluir 12 modelos foi prática: focar nos 39 modelos que compõem o currículo central (iniciais + periódicos). A premissa era que noturno, semestral, reaquisição, instrutor e examinador eram "trilhas auxiliares" que poderiam ser tratadas depois.

**O owner derrubou essa premissa.** Se o PTO Rev. 10 refletir a filosofia 18+15, **todas** as fichas operacionais precisam seguir o mesmo padrão. Não é aceitável que um aluno use ficha 18+15 no inicial e ficha 22-itens-sem-NOTECHS no semestral.

---

## 3. Inventário dos 51 Modelos

### 3.1 Distribuição por Família

| Família | Quantidade | Modelos |
|---|---|---|
| AW139 Inicial | 12 | `A139-I-01/12` a `A139-I-12/12` |
| AW139 Periódico | 5 | `A139-P-C1/VFR`, `A139-P-C1/IFR`, `A139-P-C2/VFR`, `A139-P-C2/IFR`, `A139-P-C3/VFR`, `A139-P-C3/IFR`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK` |
| AW139 Noturno | 2 | `A139-NOT-01`, `A139-NOT-02` |
| AW139 Semestral | 2 | `A139-S-01/02`, `A139-S-02/02` |
| AW139 Reaquisição | 1 | `A139-REQ-01` |
| SK76 Inicial | 12 | `SK76-I-01/12` a `SK76-I-12/12` |
| S76 Periódico | 9 | `S76-P-C1/VFR`, `S76-P-C1/IFR`, `S76-P-C2/VFR`, `S76-P-C2/IFR`, `S76-P-C3/VFR`, `S76-P-C3/IFR`, `SK76-P-CHECK` |
| S76 Noturno | 2 | `S76-NOT-01`, `S76-NOT-02` |
| SK76 Semestral | 2 | `SK76-S-01/02`, `SK76-S-02/02` |
| S76 Reaquisição | 1 | `S76-REQ-01` |
| Credenciamento | 1 | `CRED-EXA` |
| Instrutor | 1 | `TRE-INST` |
| **Total** | **51** | |

### 3.2 Situação Estrutural Atual

| Estrutura | Quantidade | Modelos |
|---|---|---|
| 22 itens, sem NOTECHS, códigos específicos de aeronave | 33 | Todos os iniciais + periódicos (pré-V6) |
| 22 itens, códigos LOFT genéricos, sem NOTECHS | 14 | LOFT/LOFT Check/LOFT Offshore, noturno, semestral, reaquisição |
| 22 itens, misto (códigos específicos + LOFT + CRM) | 4 | Instrutor, examinador, reaquisições S76/AW139 |

### 3.3 Cobertura V6 Atual

| Cobertura | Quantidade | Modelos |
|---|---|---|
| ✅ Já convertidos pela V6 (18 técnicas + 15 NOTECHS) | 39 | Iniciais S76/AW139 + periódicos |
| ❌ Fora do escopo V6 | 12 | Noturno, semestral, reaquisição, instrutor, examinador |

---

## 4. Classificação dos 12 Modelos Restantes

| Modelo | Tipo | Classificação V6.1 | Justificativa |
|---|---|---|---|
| `A139-NOT-01` | Noturno onshore | `CONVERTER_18_NOTECHS` | Ficha operacional ativa. Deve seguir padrão 18+15. Contém LOFT-NOT-* genéricos + CRM em posições 20-21-22. |
| `A139-NOT-02` | Noturno offshore | `CONVERTER_18_NOTECHS` | Idem. Mistura LOFT-NOT-* com LOFT-OFF-*. Contém LOFT-OFF-22 e LOFT-NOT-22 (CRM). |
| `A139-REQ-01` | Reaquisição | `CONVERTER_18_NOTECHS` | Usa LOFT-CHK-* + alguns códigos operacionais. Contém LOFT-CHK-04/16/20/21/22 (CRM/NTS). |
| `A139-S-01/02` | Semestral noturno | `CONVERTER_18_NOTECHS` | **Prioridade alta.** 22 LOFT-NOT genéricos. 0 códigos AW139 específicos. 0 NOTECHS. |
| `A139-S-02/02` | Semestral check | `CONVERTER_18_NOTECHS` | **Prioridade alta.** 22 LOFT-CHK genéricos. 5 códigos CRM/NTS. 0 NOTECHS. Referenciado pelo PTO Rev. 10. |
| `S76-NOT-01` | Noturno onshore | `MANTER_COM_AJUSTE_MÍNIMO` ou `CONVERTER_18_NOTECHS` | Usa `S76-LOFT-*` e `S76-*` códigos. Tem códigos específicos da aeronave. CRM em posições finais. |
| `S76-NOT-02` | Noturno offshore | `MANTER_COM_AJUSTE_MÍNIMO` ou `CONVERTER_18_NOTECHS` | Mistura `S76-LOFT-*`, `LOFT-OFF-*` e `S76-*`. Tem códigos específicos. |
| `S76-REQ-01` | Reaquisição | `CONVERTER_18_NOTECHS` | Contém `S76-CRM-01` (CRM explícito). Usa `S76-LOFT-*` e `S76-*`. |
| `SK76-S-01/02` | Semestral noturno | `REVISAR_REGULATORIAMENTE` ou `LEGADO_FORMAL` | Depende de confirmação do owner sobre uso operacional. Se ativo: converter. Se não usado: legado. |
| `SK76-S-02/02` | Semestral check | `REVISAR_REGULATORIAMENTE` ou `LEGADO_FORMAL` | Idem. Criado por simetria com AW139 (migração 0382). |
| `CRED-EXA` | Examinador | `REVISAR_REGULATORIAMENTE` | Depende de FAP/regulamento de examinador. Não localizado no workspace. |
| `TRE-INST` | Instrutor | `REVISAR_REGULATORIAMENTE` | Depende de FAP/regulamento de instrutor. Não localizado no workspace. |

---

## 5. Diagnóstico Pedagógico por Ficha Restante

### 5.1 AW139 — `A139-NOT-01` (Noturno Onshore)

- **O que é:** LOFT noturno onshore para AW139.
- **Estrutura atual:** 22 itens `LOFT-NOT-*` (01-31, ordem não sequencial).
- **CRM/NTS:** `LOFT-NOT-20` ("Gerenciamento dos Recursos da Tripulação"), `LOFT-NOT-21` ("Ameaças e Erros em Operação Noturna"), `LOFT-NOT-22` ("Debriefing e Análise da Missão").
- **Códigos específicos AW139:** Zero. Todos são `LOFT-NOT-*`.
- **NOTECHS:** Zero.
- **Sequência pedagógica:** Não verificável (códigos genéricos sem fase de voo explícita).
- **Problema:** A ficha avalia um cenário noturno, mas não especifica quais manobras técnicas AW139 estão sendo avaliadas. O CRM está misturado com técnica.
- **Recomendação:** `CONVERTER_18_NOTECHS` — mapear para 18 técnicas AW139 específicas (usando pool `CAU-*`, `WAR-*`, `OPS-*`, `FLY-*`) + 15 NOTECHS. Remover LOFT-NOT-20/21/22 das 18 e migrar conteúdo CRM para NOTECHS.

### 5.2 AW139 — `A139-NOT-02` (Noturno Offshore)

- **O que é:** LOFT noturno offshore para AW139.
- **Estrutura atual:** 22 itens mistos (`LOFT-NOT-*` + `LOFT-OFF-*`).
- **CRM/NTS:** `LOFT-NOT-22` ("Debriefing"), `LOFT-OFF-22` ("Gerenciamento de Recursos Offshore").
- **Códigos específicos AW139:** `OPS-OFF-X1`, `OPS-OFF-X2` (apenas 2 códigos operacionais).
- **NOTECHS:** Zero.
- **Problema:** A ficha mistura cenário noturno com offshore sem distinção clara. Predominância de códigos LOFT genéricos.
- **Recomendação:** `CONVERTER_18_NOTECHS` — separar claramente o que é offshore do que é noturno. Usar códigos AW139 específicos para ambas as dimensões.

### 5.3 AW139 — `A139-REQ-01` (Reaquisição)

- **O que é:** Reaquisição de experiência recente para AW139.
- **Estrutura atual:** 22 itens (`LOFT-CHK-*` + alguns `OPS-*`/`FLY-*`).
- **CRM/NTS:** `LOFT-CHK-04` (Briefing/TEM), `LOFT-CHK-16` (CRM/ameaças), `LOFT-CHK-20/21/22` (avaliação CRM/debriefing).
- **Códigos específicos AW139:** `OPS-NRM-X1`, `FLY-BAS-X3`, `OPS-NRM-X2`, `OPS-NAV-X2`.
- **NOTECHS:** Zero.
- **Problema:** Ficha de reaquisição deve focar em proficiência técnica, não em cenário completo de LOFT. 5 itens CRM nas 22 posições.
- **Recomendação:** `CONVERTER_18_NOTECHS` — focar em 18 manobras técnicas de verificação de proficiência (navegação, decolagem, pouso, emergências principais), sem o pacote completo de LOFT. Adicionar 15 NOTECHS.

### 5.4 AW139 — `A139-S-01/02` (Semestral Noturno)

- **O que é:** Check semestral noturno AW139.
- **Estrutura atual:** 22 itens `LOFT-NOT-01` a `LOFT-NOT-22`.
- **CRM/NTS:** `LOFT-NOT-20/21/22`.
- **Códigos específicos AW139:** Zero.
- **NOTECHS:** Zero.
- **Problema:** **É a ficha mais problemática dos semestrais.** 22 códigos genéricos, nenhum específico da aeronave. Se o PTO Rev. 10 exige cobertura semestral, esta ficha está em não-conformidade estrutural.
- **Recomendação:** `CONVERTER_18_NOTECHS` com **prioridade máxima**. Deve ser a primeira ficha semestral a ser revista.

### 5.5 AW139 — `A139-S-02/02` (Semestral Check IFR)

- **O que é:** Check semestral IFR AW139.
- **Estrutura atual:** 22 itens `LOFT-CHK-01` a `LOFT-CHK-22`.
- **CRM/NTS:** `LOFT-CHK-04/16/20/21/22` (5 códigos de 22).
- **Códigos específicos AW139:** Zero.
- **NOTECHS:** Zero.
- **Problema:** A ficha repete a estrutura do LOFT Check do inicial/periódico, mas sem adaptação para o contexto semestral (que deve ser mais enxuto e focado em verificação de manutenção de proficiência).
- **Recomendação:** `CONVERTER_18_NOTECHS` com prioridade alta.

### 5.6 S76 — `S76-NOT-01` (Noturno Onshore)

- **O que é:** LOFT noturno onshore S76.
- **Estrutura atual:** 22 itens (`S76-LOFT-*` + alguns `S76-*` específicos).
- **CRM/NTS:** `S76-LOFT-12/16/21/22` (CRM/NTS legado, listado na V5 seção 11.3).
- **Códigos específicos S76:** `S76-NVF-00`, `S76-HOV-00`, `S76-NDL-00`, `S76-AUT-70`.
- **NOTECHS:** Zero.
- **Problema:** Melhor que o AW139 noturno (tem alguns códigos específicos), mas ainda com CRM nas posições finais.
- **Recomendação:** `MANTER_COM_AJUSTE_MÍNIMO` — remover `S76-LOFT-12/16/21/22` das 18 técnicas, adicionar 15 NOTECHS, substituir os 4 códigos removidos por reforço técnico S76 específico.

### 5.7 S76 — `S76-NOT-02` (Noturno Offshore)

- **O que é:** LOFT noturno offshore S76.
- **Estrutura atual:** 22 itens (`S76-LOFT-*` + `LOFT-OFF-*` + `S76-*`).
- **CRM/NTS:** `LOFT-OFF-22` (CRM offshore), `S76-LOFT-21/22` (CRM legado).
- **Códigos específicos S76:** `S76-TDP-00`, `S76-LDP-00`, `S76-DIT-71`.
- **NOTECHS:** Zero.
- **Problema:** Mistura 3 famílias de código (S76-LOFT, LOFT-OFF, S76). Inconsistência de namespace.
- **Recomendação:** `CONVERTER_18_NOTECHS` — padronizar para códigos `S76-*`, remover LOFT-OFF-* genéricos, adicionar NOTECHS.

### 5.8 S76 — `S76-REQ-01` (Reaquisição)

- **O que é:** Reaquisição de experiência recente S76.
- **Estrutura atual:** 22 itens (`S76-PRE-*` + `S76-LOFT-*` + `S76-*` + `S76-CRM-01`).
- **CRM/NTS:** `S76-CRM-01` (CRM explícito como uma das 22 técnicas), `S76-LOFT-21/22` (CRM legado).
- **Códigos específicos S76:** `S76-PRE-01/02/03/04`, `S76-NVF-00`, `S76-HOV-00`, `S76-TDP-00`, `S76-NDT-00`, `S76-ILS-00`, `S76-RNV-00`, `S76-LDP-00`.
- **NOTECHS:** Zero.
- **Problema:** **Única ficha com `S76-CRM-01` como código de manobra.** Isso viola explicitamente a regra V4.1 (CRM nunca deve ser uma das 18/22 técnicas). A ficha também tem `S76-COM-01` e `S76-ATC-01` (comunicação genérica, também removida pela V4.1).
- **Recomendação:** `CONVERTER_18_NOTECHS` com **prioridade máxima entre as S76**. Remover `S76-CRM-01`, `S76-COM-01`, `S76-ATC-01` e `S76-LOFT-21/22` das 22 técnicas. Substituir por itens técnicos S76. Adicionar 15 NOTECHS.

### 5.9 SK76 — `SK76-S-01/02` (Semestral Noturno)

- **O que é:** Check semestral noturno SK76.
- **Estrutura atual:** 22 itens `LOFT-NOT-01` a `LOFT-NOT-22`. Cópia do AW139.
- **CRM/NTS:** `LOFT-NOT-20/21/22`.
- **Códigos específicos SK76:** Zero. Todos são `LOFT-NOT-*`.
- **NOTECHS:** Zero.
- **Problema:** Criado por simetria com AW139 (migração 0382). Não se sabe se é operacionalmente usado pela Costa do Sol. Se for, tem os mesmos problemas do AW139 S-01/02.
- **Recomendação:** `REVISAR_REGULATORIAMENTE` — **perguntar ao owner se SK76 tem check semestral operacional.** Se sim: `CONVERTER_18_NOTECHS`. Se não: `LEGADO_FORMAL` (soft-delete lógico, preservando histórico).

### 5.10 SK76 — `SK76-S-02/02` (Semestral Check IFR)

- **O que é:** Check semestral IFR SK76.
- **Estrutura atual:** 22 itens `LOFT-CHK-01` a `LOFT-CHK-22`. Cópia do AW139.
- **CRM/NTS:** `LOFT-CHK-04/16/20/21/22` (5 códigos).
- **Códigos específicos SK76:** Zero.
- **NOTECHS:** Zero.
- **Problema:** Idem SK76-S-01/02. Cópia da estrutura AW139 sem adaptação. Descrições das manobras referenciam AW139 (Primus Epic, CAT A), o que é incorreto para SK76.
- **Recomendação:** `REVISAR_REGULATORIAMENTE` — mesma lógica do SK76-S-01/02.

### 5.11 `CRED-EXA` (Examinador / Credenciamento)

- **O que é:** Ficha de credenciamento de examinador.
- **Estrutura atual:** Desconhecida em detalhe (não listada no CSV com códigos individuais na resposta do inventário).
- **Fonte regulatória:** **Não localizada no workspace.** Nenhuma FAP de examinador, IS ou RBAC encontrada.
- **Problema:** Sem fonte regulatória, qualquer revisão seria especulativa. É a ficha com maior risco regulatório.
- **Recomendação:** `REVISAR_REGULATORIAMENTE` — **PENDENTE_FONTE_REGULATORIA**. Localizar: FAP de examinador/credenciamento, IS ANAC aplicável, RBAC 61/141 requisitos de examinador. Não propor conteúdo até a fonte ser localizada.

### 5.12 `TRE-INST` (Instrutor)

- **O que é:** Ficha de treinamento de instrutor.
- **Estrutura atual:** Desconhecida em detalhe (não listada no CSV com códigos individuais).
- **Fonte regulatória:** **Não localizada no workspace.** Nenhuma FAP de instrutor encontrada.
- **Problema:** A ficha de instrutor tem natureza diferente das demais: avalia capacidade de **ensinar**, não apenas de **voar**. Os itens podem incluir briefing, demonstração, intervenção, debriefing e avaliação do aluno — conteúdos que são parcialmente técnicos e parcialmente instrucionais. A separação 18+15 pode precisar de adaptação.
- **Recomendação:** `REVISAR_REGULATORIAMENTE` — **PENDENTE_FONTE_REGULATORIA**. Localizar: FAP de instrutor, IS ANAC aplicável, RBAC 61 requisitos de instrutor. A ficha provavelmente precisará de uma estrutura adaptada (ex.: 12 itens técnicos de voo + 6 itens instrucionais + 15 NOTECHS).

---

## 6. Diagnóstico Regulatório/FAP por Ficha Restante

| Modelo | FAP/Fonte Localizada | Status |
|---|---|---|
| `A139-NOT-01` | FAP 05.2, FAP 14 (offshore noturno) | Parcial — referências FAP em descrições LOFT-NOT |
| `A139-NOT-02` | FAP 05.2, FAP 14 | Parcial — idem |
| `A139-REQ-01` | RBAC 61 (requisitos de experiência recente) | **PENDENTE_FONTE_REGULATORIA** — validar requisitos ANAC |
| `A139-S-01/02` | PTO Rev. 10 (prevê semestral) | Parcial — PTO existe mas ficha não segue 18+15 |
| `A139-S-02/02` | PTO Rev. 10, FAP 06 (IFR check) | Parcial |
| `S76-NOT-01` | FAP 05.2, FAP 14 | Parcial |
| `S76-NOT-02` | FAP 05.2, FAP 14 | Parcial |
| `S76-REQ-01` | RBAC 61 | **PENDENTE_FONTE_REGULATORIA** |
| `SK76-S-01/02` | Não localizado (sem PTO SK76) | **PENDENTE_FONTE_REGULATORIA** |
| `SK76-S-02/02` | Não localizado | **PENDENTE_FONTE_REGULATORIA** |
| `CRED-EXA` | Não localizado | **PENDENTE_FONTE_REGULATORIA** |
| `TRE-INST` | Não localizado | **PENDENTE_FONTE_REGULATORIA** |

---

## 7. FAPs Localizadas no Workspace

| FAP/Fonte | Caminho | Cobertura |
|---|---|---|
| PTO Rev. 10 (AW139) | `docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md` | Inicial AW139, periódico, semestral, LOFT |
| PTO-A | Referenciado em V5 (não localizado como documento isolado) | Usado como fonte de códigos na V3/V4/V5 |
| FAP 05.2 | Referenciado na V5 seção 10 | Manobras básicas/normais, emergências |
| FAP 06 | Referenciado na V5 seção 10 | IFR, navegação, aproximações |
| FAP 14 | Referenciado na V5 seção 10 | Offshore, operação marítima |

---

## 8. FAPs / Fontes Não Localizadas

| Fonte Ausente | Impacto | Modelos Afetados |
|---|---|---|
| **FAP de Instrutor** | Crítico — sem ela, não é possível propor conteúdo para `TRE-INST` | `TRE-INST` |
| **FAP/IS de Examinador/Credenciamento** | Crítico — sem ela, não é possível propor conteúdo para `CRED-EXA` | `CRED-EXA` |
| **PTO-B (complementar)** | Médio — pode conter requisitos adicionais para S76 | S76/SK76 (todos) |
| **PTO SK76** | Médio — não localizado; sem ele, a base para SK76 é apenas o catálogo AirTrust | SK76 (todos) |
| **RBAC 61 requisitos de reaquisição** | Médio — necessário para validar `A139-REQ-01` e `S76-REQ-01` | Reaquisições |
| **IS ANAC para LOFT/check semestral** | Baixo — referência normativa complementar | Semestrais |

---

## 9. Recomendação para Instrutor (`TRE-INST`)

**Status:** PENDENTE_FONTE_REGULATORIA.

**O que precisa ser localizado:**
- FAP de Instrutor da Costa do Sol (se existir).
- IS ANAC aplicável a treinamento de instrutor de helicóptero.
- RBAC 61 requisitos para instrutor de voo.

**Premissas (não implementar sem fonte):**
- A ficha de instrutor deve avaliar: (a) técnica de voo do candidato a instrutor, (b) capacidade de ensinar/briefar/demonstrar, (c) capacidade de intervir com segurança, (d) capacidade de avaliar/debriefar.
- Itens técnicos de voo: 12 posições (usar pool de códigos da aeronave).
- Itens instrucionais: 6 posições (briefing estruturado, demonstração, intervenção corretiva, debriefing, avaliação do aluno, gerenciamento da sessão).
- NOTECHS: 15 (padrão).
- **Total: 18 (12 voo + 6 instrucionais) + 15 NOTECHS.**

**Risco sem fonte:** Propor itens instrucionais sem base regulatória é especulativo e pode não cobrir o que a ANAC exige.

---

## 10. Recomendação para Examinador / Credenciamento (`CRED-EXA`)

**Status:** PENDENTE_FONTE_REGULATORIA.

**O que precisa ser localizado:**
- FAP de Examinador/Credenciamento da Costa do Sol.
- IS ANAC aplicável a credenciamento de examinador.
- RBAC 61 requisitos para examinador de voo.

**Premissas (não implementar sem fonte):**
- A ficha de examinador deve avaliar: (a) capacidade de conduzir um check ride completo, (b) aplicação correta de critérios de avaliação, (c) padronização e rastreabilidade, (d) imparcialidade e documentação.
- É a ficha com maior risco regulatório — um examinador mal avaliado compromete todo o processo de certificação.
- A estrutura 18+15 pode precisar de adaptação semelhante à do instrutor.

**Risco sem fonte:** Máximo. Não propor conteúdo até a fonte ser localizada.

---

## 11. Recomendação para Semestrais AW139

**Prioridade: Alta.**

Ambos os modelos (`A139-S-01/02` e `A139-S-02/02`) devem ser convertidos para 18+15. O PTO Rev. 10 prevê check semestral AW139. A estrutura atual de 22 LOFT genéricos não atende ao padrão.

**Plano de conversão sugerido (documental, não implementar agora):**

1. `A139-S-01/02` (Noturno):
   - Remover LOFT-NOT-01..22.
   - Selecionar 18 técnicas AW139 de voo noturno do pool `CAU-*`, `WAR-*`, `OPS-*`, `FLY-*`.
   - Adicionar 15 NOTECHS.

2. `A139-S-02/02` (IFR Check):
   - Remover LOFT-CHK-01..22.
   - Selecionar 18 técnicas AW139 de IFR check do pool existente.
   - Remover LOFT-CHK-04/16/20/21/22 (CRM) da seleção.
   - Adicionar 15 NOTECHS.

---

## 12. Recomendação para Semestrais S76/SK76

**Prioridade: Condicionada à confirmação do owner.**

**Decisão pendente:** A Costa do Sol opera check semestral SK76? Se sim, mesma recomendação do AW139 (converter para 18+15). Se não, os modelos `SK76-S-01/02` e `SK76-S-02/02` devem ser marcados como `LEGADO_FORMAL` com soft-delete lógico.

---

## 13. Recomendação para Noturno

**Prioridade: Média.**

Os 4 modelos noturnos (`A139-NOT-01`, `A139-NOT-02`, `S76-NOT-01`, `S76-NOT-02`) são operacionais e devem ser convertidos. A diferença é que os modelos S76 já têm uma base de códigos específicos melhor que os AW139.

**Ordem sugerida:** S76 noturno primeiro (menos esforço, códigos já parcialmente específicos), AW139 noturno depois (requer seleção completa de pool de códigos).

---

## 14. Recomendação para Reaquisição

**Prioridade: Média.**

Ambos (`A139-REQ-01` e `S76-REQ-01`) são operacionais. O `S76-REQ-01` tem o problema mais grave: `S76-CRM-01` como código de manobra.

**Recomendação:** `CONVERTER_18_NOTECHS` para ambos. Remover todos os códigos CRM/COM/ATC/briefing genéricos. Focar em verificação de proficiência técnica. Validar contra RBAC 61.

---

## 15. Riscos para PTO Rev. 10

| Risco | Severidade | Modelos Afetados | Mitigação |
|---|---|---|---|
| Semestral AW139 fora do padrão 18+15 | **Alta** | `A139-S-01/02`, `A139-S-02/02` | Converter antes do apply da V6 |
| LOFT/Check AW139 com CRM nas 18 técnicas | **Alta** | `A139-I-11/12`, `A139-P-LOFT/CHECK` | Já tratados pela V6? Verificar |
| Instrutor/Examinador sem fonte regulatória | **Alta** | `TRE-INST`, `CRED-EXA` | Não propor conteúdo sem fonte |
| SK76 semestral sem PTO | **Média** | `SK76-S-01/02`, `SK76-S-02/02` | Confirmar uso operacional com owner |
| Reaquisição sem validação RBAC 61 | **Média** | `A139-REQ-01`, `S76-REQ-01` | Validar requisitos ANAC |
| Duplicação LOFT/Check × Semestral | **Média** | AW139 S-02/02 × A139-P-LOFT/CHECK | Garantir que semestral e periódico não se sobreponham |

---

## 16. Proposta de Caminho V6.1

### Fase 1 — Documental (agora)

| Ação | Responsável |
|---|---|
| Comunicar ao owner que V6 é parcial e V6.1 é necessária | Líder do projeto |
| Localizar FAP de Instrutor, FAP de Examinador, PTO-B, RBAC 61 | Owner |
| Confirmar se SK76 tem check semestral operacional | Owner |
| Manter PR #241 como draft parcial | Equipe técnica |

### Fase 2 — Revisão documental V6.1 (após fontes localizadas)

| Prioridade | Fichas | Ação |
|---|---|---|
| 1 | `A139-S-01/02`, `A139-S-02/02` | Propor 18 técnicas + 15 NOTECHS |
| 2 | `A139-REQ-01`, `S76-REQ-01` | Propor 18 técnicas + 15 NOTECHS, remover CRM |
| 3 | `S76-NOT-01`, `S76-NOT-02` | Ajustar e adicionar NOTECHS |
| 4 | `A139-NOT-01`, `A139-NOT-02` | Propor 18 técnicas + 15 NOTECHS |
| 5 | `TRE-INST` | Propor estrutura adaptada (após localizar FAP) |
| 6 | `CRED-EXA` | Propor estrutura adaptada (após localizar FAP) |
| 7 | `SK76-S-01/02`, `SK76-S-02/02` | Se operacional: converter. Se não: legado formal |

### Fase 3 — Implementação (após V6.1 documental aprovada)

- Atualizar script para 51 modelos.
- Dry-run completo.
- Apply somente com autorização explícita.

---

## 17. Critérios de GO / NO-GO para Implementação

### NO-GO (manter bloqueio) se:

- ❌ Qualquer ficha operacional ativa ficar fora do padrão 18+15 sem justificativa documentada.
- ❌ `TRE-INST` ou `CRED-EXA` não tiverem fonte regulatória/FAP localizada ou pendência explicitamente registrada.
- ❌ Semestrais AW139 (`A139-S-01/02`, `A139-S-02/02`) ficarem com lógica antiga (22 itens, sem NOTECHS) sem decisão formal.
- ❌ Semestrais SK76 existirem operacionalmente e ficarem fora sem decisão.
- ❌ Houver repetição indevida de cenário LOFT/Check/Semestral sem justificativa pedagógica.
- ❌ CRM/NOTECHS continuar misturado dentro das 18 técnicas em qualquer ficha.
- ❌ `S76-CRM-01`, `S76-COM-01`, `S76-ATC-01` permanecerem como códigos de manobra em `S76-REQ-01`.

### GO condicionado se:

- ✅ Todos os 51 modelos tiverem classificação documentada (CONVERTER, MANTER, REVISAR, LEGADO, DESCONTINUAR).
- ✅ Fontes regulatórias localizadas para `TRE-INST` e `CRED-EXA`, ou pendência formalmente registrada com prazo.
- ✅ Owner confirmar escopo dos semestrais SK76.
- ✅ PTO Rev. 10 validado contra a proposta V6.1.
- ✅ PR #241 mantido como base parcial, com nota explícita de que cobre apenas 39/51 modelos.

---

## 18. Confirmações

- ✅ Apenas documentos `.md` foram criados — nenhum código, script, teste ou migration alterado.
- ✅ Nenhum apply executado.
- ✅ Nenhum deploy realizado.
- ✅ Produção intocada.
- ✅ PR #241 preservado como draft parcial.
- ✅ Pendências regulatórias explicitamente listadas na seção 8.
- ✅ Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado.
- ✅ Nenhuma FAP ou regulamento foi inventado.
