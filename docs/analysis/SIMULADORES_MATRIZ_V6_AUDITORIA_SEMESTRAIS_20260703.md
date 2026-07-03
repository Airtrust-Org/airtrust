# Simuladores Matriz V6 — Auditoria de Fichas Semestrais 20260703

**Data-base:** 2026-07-03
**Caráter:** Read-only / documental. Nenhuma implementação, migration, DML, deploy ou alteração funcional.
**Fontes:** V6 implementation report, V5/V5.1, source map CSV, migrations 0293/0299/0300/0303/0324/0325/0382.

---

## 1. Veredito

**NO-GO para considerar os semestrais como compatíveis com a filosofia V6. Recomendação: revisão documental dedicada antes de qualquer apply.**

Os 4 modelos semestrais (`A139-S-01/02`, `A139-S-02/02`, `SK76-S-01/02`, `SK76-S-02/02`) estão ativos no sistema, são usados operacionalmente, mas têm **incompatibilidades estruturais** com a nova filosofia 18 técnicas + 15 NOTECHS:

- Usam 22 itens (não 18+15).
- Usam códigos LOFT genéricos (não códigos específicos de aeronave como `76-*`, `S76-*`, `CAU-*`, `WAR-*`).
- Contêm códigos CRM/NTS legados (`LOFT-CHK-04`, `LOFT-CHK-16`, `LOFT-CHK-20`, `LOFT-CHK-21`, `LOFT-CHK-22`, `LOFT-NOT-20`, `LOFT-NOT-21`, `LOFT-NOT-22`).
- **Não têm NOTECHS** — zero itens NOTECHS em qualquer um dos 4 modelos.
- O AW139 semestral foi criado com a migração 0299 (LOFT-CHK) e 0300 (LOFT-NOT), antes de existir a separação 18+15.
- O SK76 semestral foi criado com a migração 0382, copiando a mesma estrutura LOFT genérica do AW139.

**A V6 não deve ser bloqueada por isso**, mas os semestrais precisam de uma trilha de revisão separada (V6.1 ou futura).

---

## 2. Modelos Semestrais Encontrados

| # | Código | Nome | Aeronave | Tipo | Manobras | NOTECHS | Fonte |
|---|---|---|---|---|---|---|---|
| 1 | `A139-S-01/02` | AW139 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA | AW139 | SEMESTRAL | 22 LOFT-NOT | 0 | migração 0300 |
| 2 | `A139-S-02/02` | AW139 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR | AW139 | SEMESTRAL | 22 LOFT-CHK | 0 | migração 0299 |
| 3 | `SK76-S-01/02` | SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA | SK76 | SEMESTRAL | 22 LOFT-NOT | 0 | migração 0382 |
| 4 | `SK76-S-02/02` | SK76 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR | SK76 | SEMESTRAL | 22 LOFT-CHK | 0 | migração 0382 |

**Total: 4 modelos, 88 vínculos de manobra, 0 NOTECHS.**

---

## 3. AW139 Semestral — Análise Detalhada

### 3.1 `A139-S-01/02` — LOFT e Operação Noturna

| Atributo | Valor |
|---|---|
| Manobras | `LOFT-NOT-01` a `LOFT-NOT-22` |
| Classificação | `migration_verified` (fonte: migração 0300) |
| Códigos CRM/NTS | `LOFT-NOT-20`, `LOFT-NOT-21`, `LOFT-NOT-22` |
| Códigos específicos AW139 | Nenhum |
| Estrutura | 22 itens genéricos de LOFT noturno, sem separação técnica/comportamental |

**Problema:** `LOFT-NOT-20` ("Gerenciamento dos Recursos da Tripulação"), `LOFT-NOT-21` ("Ameaças e Erros em Operação Noturna") e `LOFT-NOT-22` ("Debriefing e Análise da Missão") são itens comportamentais/CRM que a V5 explicitamente removeu das 18 técnicas (seção 11.3 da V5). Pertencem a NOTECHS ou à observação da sessão.

### 3.2 `A139-S-02/02` — LOFT e Check de IFR

| Atributo | Valor |
|---|---|
| Manobras | `LOFT-CHK-01` a `LOFT-CHK-22` |
| Classificação | `migration_verified` (fonte: migração 0299) |
| Códigos CRM/NTS | `LOFT-CHK-04`, `LOFT-CHK-16`, `LOFT-CHK-20`, `LOFT-CHK-21`, `LOFT-CHK-22` |
| Códigos específicos AW139 | Nenhum |
| Estrutura | 22 itens genéricos de LOFT CHECK IFR |

**Problema:** 5 dos 22 códigos são CRM/NTS legado (`LOFT-CHK-04/16/20/21/22`). A V5 (seção 11.3) lista explicitamente estes códigos como "CRM/NTS histórico, substituído por NOTECHS-01..15 nas fichas novas". Apesar de terem descrições técnicas razoáveis na migration 0299, a decisão V3/V4/V5 foi de removê-los da contagem técnica.

Além disso, `LOFT-CHK-04` ("Briefing de Missão, TEM e Critérios de Decisão") é briefing/TEM — conteúdo que a V4.1 explicitamente classifica como pertencente à observação da sessão, não a uma das 18 técnicas.

---

## 4. S76/SK76 Semestral — Análise Detalhada

### 4.1 `SK76-S-01/02` — LOFT e Operação Noturna

| Atributo | Valor |
|---|---|
| Manobras | `LOFT-NOT-01` a `LOFT-NOT-22` |
| Classificação | `migration_verified` (fonte: migração 0382) |
| Códigos específicos SK76 | Nenhum |
| Estrutura | Cópia exata da estrutura do AW139 semestral 01/02 |

**Problema:** Mesmo problema do AW139 S-01/02 (CRM/NTS em LOFT-NOT-20/21/22), agravado pelo fato de que os códigos LOFT-NOT-* foram originalmente criados para AW139 (migração 0300) e reutilizados no SK76 sem adaptação. Isso significa que descrições como "Primus Epic", "FMS Pilot's Guide" e referências AW139 podem estar nas descrições das manobras — inadequado para SK76.

### 4.2 `SK76-S-02/02` — LOFT e Check de IFR

| Atributo | Valor |
|---|---|
| Manobras | `LOFT-CHK-01` a `LOFT-CHK-22` |
| Classificação | `migration_verified` (fonte: migração 0382) |
| Códigos específicos SK76 | Nenhum |
| Estrutura | Cópia exata da estrutura do AW139 semestral 02/02 |

**Problema:** Mesmo problema do AW139 S-02/02. Códigos LOFT-CHK-04/16/20/21/22 são CRM/NTS legado. As descrições das manobras fazem referência ao AW139 (Primus Epic, CAT A, RFM AW139), o que é tecnicamente incorreto para SK76.

---

## 5. Situação Atual de Cada Ficha

| Modelo | Ativo? | Operacional? | Problema principal | Gravidade |
|---|---|---|---|---|
| `A139-S-01/02` | Sim | Sim — usado nos checks semestrais AW139 | 3 códigos CRM/NTS, 0 NOTECHS, 22 itens | **Alta** |
| `A139-S-02/02` | Sim | Sim — usado nos checks semestrais AW139 | 5 códigos CRM/NTS, 0 NOTECHS, 22 itens | **Alta** |
| `SK76-S-01/02` | Sim | Provável — criado por simetria com AW139 | 3 códigos CRM/NTS, 0 NOTECHS, 22 itens, descrições AW139 | **Média** |
| `SK76-S-02/02` | Sim | Provável — criado por simetria com AW139 | 5 códigos CRM/NTS, 0 NOTECHS, 22 itens, descrições AW139 | **Média** |

---

## 6. Comparação com Lógica V6

| Critério V6 | Iniciais V6 | Periódicos V6 | Semestrais (atuais) |
|---|---|---|---|
| Nº de itens por ficha | 18 | 18 | **22** |
| NOTECHS (15) | Sim | Sim | **Não (0)** |
| Códigos específicos de aeronave | Sim (`76-*`, `S76-*`, `CAU-*`, `WAR-*`) | Sim | **Não (todos LOFT-* genéricos)** |
| CRM/NTS nas 18 técnicas | Removido (V4.1) | Removido (V4.1) | **Presente (5 códigos)** |
| `carater=avaliativo` no Check | Sim (S12) | Sim (periódico check) | **Não** |
| Sequência lógica intra-sessão | Sim (V4.2) | Sim (V4.2) | **Parcial (ordem existe mas é linear LOFT-NOT/CHK)** |
| Cobertura FAP mapeada | Sim (V5 seção 10) | Sim | **Parcial (FAP refs em descrições, sem mapeamento sistemático)** |

**Conclusão:** Os semestrais estão **2 gerações atrás** da V6. Correspondem aproximadamente ao estado pré-V3 (22 itens, sem separação técnica/comportamental, sem NOTECHS).

---

## 7. Risco para PTO Rev. 10

### 7.1 AW139

O PTO Rev. 10 (`docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md`) é a fonte normativa para treinamento AW139. A migração 0299 vinculou LOFT-CHK-01..22 ao modelo 53 (`A139-S-02/02`) com referências FAP nas descrições (migração 0300). O PTO Rev. 10 prevê check semestral IFR.

**Risco:** **Médio-alto.** Se o PTO Rev. 10 exige cobertura semestral com itens técnicos específicos AW139 e NOTECHS comportamentais separados, as fichas atuais estão em não-conformidade. O owner deve validar se a estrutura atual de 22 LOFT-CHK genéricos é aceitável perante o PTO ou se precisa ser migrada para 18+15.

### 7.2 S76/SK76

Não foi localizado documento PTO equivalente para S76/SK76 no workspace (herança V3/V4). Os semestrais SK76 foram criados por simetria com AW139 (migração 0382), sem fonte normativa explícita.

**Risco:** **Baixo-médio.** Se a Costa do Sol opera checks semestrais SK76 com base em FAP ou exigência operacional própria, a situação é análoga ao AW139. Se não opera, os modelos podem ser legado desativável.

---

## 8. Recomendação

### Curto prazo (hoje)

| Ação | Responsável |
|---|---|
| **Manter os 4 modelos semestrais como legado ativo** — não tocar pela V6 | Equipe técnica |
| **Não aplicar V6 sobre os semestrais** — eles já estão excluídos do escopo (confirmado no implementation report) | Equipe técnica |
| **Alertar o owner** sobre a incompatibilidade estrutural (22 itens, sem NOTECHS, códigos CRM/NTS) | Líder do projeto |

### Médio prazo (V6.1 ou futura)

| Prioridade | Ação |
|---|---|
| **1 (crítico)** | Revisão documental do AW139 semestral: mapear cada LOFT-NOT/CHK para 18 técnicas + 15 NOTECHS, usando códigos específicos AW139 (`CAU-*`, `WAR-*`, `OPS-*`, `FLY-*`) |
| **2 (alto)** | Remover LOFT-CHK-04/16/20/21/22 e LOFT-NOT-20/21/22 das 18 técnicas; conteúdo CRM → NOTECHS |
| **3 (alto)** | Adicionar 15 NOTECHS a cada ficha semestral |
| **4 (médio)** | Revisão documental do SK76 semestral: substituir códigos LOFT genéricos por códigos específicos SK76 (`76-*`, `S76-*`), corrigir descrições que referenciam AW139 |
| **5 (médio)** | Validar com owner se SK76 semestral é operacionalmente necessário ou pode ser descontinuado |
| **6 (baixo)** | Se SK76 semestral for descontinuado, marcar modelos como inativos (soft delete lógico, sem hard delete) |

### Alternativas consideradas e descartadas

| Alternativa | Motivo da rejeição |
|---|---|
| Descontinuar todos os semestrais agora | AW139 semestral é operacional e referenciado pelo PTO Rev. 10 |
| Aplicar V6 nos semestrais sem revisão | Incompatibilidade estrutural (22 vs 18+15) quebraria a consistência |
| Criar códigos novos para semestrais agora | Sem validação do instrutor/owner, risco de refação |

---

## 9. Próximo Passo Recomendado

1. **Comunicar ao owner** que os semestrais AW139 precisam de revisão dedicada (22 itens → 18+15, remover CRM/NTS, adicionar NOTECHS).
2. **Confirmar com o owner** se SK76 semestral é operacionalmente utilizado.
3. **Criar documento `COSTA_DO_SOL_MATRIZ_V6_1_SEMESTRAIS_*.md`** com a proposta de migração dos semestrais para 18+15, após validação do instrutor.
4. **Não bloquear a V6** por causa dos semestrais — eles já estão corretamente excluídos do escopo.
5. **Produção continua NO-GO. Merge continua NO-GO.**

---

## 10. Confirmações

- ✅ Apenas o arquivo documental `SIMULADORES_MATRIZ_V6_AUDITORIA_SEMESTRAIS_20260703.md` foi criado.
- ✅ Nenhuma implementação, migration, DML, deploy ou alteração funcional.
- ✅ Produção intocada.
- ✅ PR #241 não alterado.
- ✅ Nenhum código, script ou teste alterado.
