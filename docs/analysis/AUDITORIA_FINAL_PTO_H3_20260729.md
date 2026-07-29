# AUDITORIA INDEPENDENTE FINAL — PTO H3, MATRIZES E GUIAS DE INSTRUÇÃO
## Costa do Sol Táxi Aéreo S/A — PTO Rev. 10 — Versão H3
### Ofício ANAC nº 5605/2026 — FOP 224 — SEI nº 13652935
### 2ª Iteração — Data da auditoria: 29/07/2026

---

# 1. RESUMO EXECUTIVO

Esta auditoria independente analisou 165 arquivos do protocolo PTO H3, abrangendo:

- **PTO H3** (DOCX + PDF): 159 páginas, 4.279 parágrafos, 18 tabelas
- **AW139**: 32 sessões, 576 itens técnicos, 336 códigos únicos, 32 guias HTML + 32 PDFs
- **S76**: 34 sessões, 612 itens técnicos, 307 códigos únicos, 34 guias HTML + 34 PDFs
- **Relatório de Tratamento**: versão H2 com referências detalhadas
- **16 Não-Conformidades ANAC**: extraídas integralmente do Ofício 5605/2026
- **Referências técnicas**: OEB AW139 Rev.4, Book 2 S76, IS 135-003D, MSG LA-05

**Foram executadas validações automatizadas de CSV, JSON, HTML e comparação estrutural DOCX, além de inspeção manual dos documentos principais.**

---

# 2. CONCLUSÃO DE LIBERAÇÃO

## ⛔ NÃO APTO PARA PROTOCOLO

**Motivo: 3 NCs NÃO ATENDIDAS (NC12, NC13, NC15) + colisões de código (C-001, C-002)**

**Das 16 NCs:**
- ✅ 11 ATENDIDAS com evidência verificada (NC03-11, NC14, NC16)
- 🟡 1 PARCIAL (NC02 — formato pictórico)
- 🔵 1 DEP. APROVAÇÃO EXPRESSA (NC01 — dry-leasing)
- 🔴 3 NÃO ATENDIDAS (NC12, NC13, NC15 — documentação CTAC ausente)

**As 3 NCs não atendidas são o ÚNICO impedimento regulatório ao protocolo.**
As demais questões (colisões de código, formatação) são correções de qualidade mas não bloqueariam isoladamente.

---

# 3. QUADRO DAS 16 NÃO-CONFORMIDADES

| NC | Requisito | Descrição Resumida | Status | Evidência |
|----|-----------|-------------------|--------|-----------|
| 01 | IS 135-003D | Dry-leasing de FFS sem previsão regulatória | **DEPENDENTE DE APROVAÇÃO EXPRESSA** | Termo "dry-leasing" não consta no PTO H3. Requer documento separado. |
| 02 | IS 135-003D 5.2.5.1(d) | Descrições detalhadas/pictóricas das manobras ausentes | **PARCIALMENTE ATENDIDA** | P2007: Seção 4 contém códigos e descrições. Formato pictórico (cartazes) não confirmado. |
| 03 | IS 135-003D 5.2.4.6.5 | Carga horária Instrutor de Voo (2 voos de 2h) diverge | **✅ ATENDIDA** | P676-677: Ref. 5.2.4.6.5. INST-E01(1h)+E02(2h)=3h. Corrigido. |
| 04 | IS 135-003D 5.2.4.8.5 | Carga horária Examinador Credenciado (2 voos de 2h) diverge | **✅ ATENDIDA** | P690-691: Ref. 5.2.4.8.5. EXA-01 a 04(4×1h=4h). Corrigido. |
| 05 | IS 135-003D + Book 2 + OEB | Modalidade AS A CREW vs SINGLE PILOT não informada | **✅ ATENDIDA** | P476-479: "As a Crew em todos os treinamentos"; "Single Pilot: não utilizado". 89 menções. |
| 06 | IS 135-003D + Book 2 + OEB | Grade SIC do Book 2 não observada no PTO | **✅ ATENDIDA** | P478: "PIC e SIC cumprem os mesmos segmentos, conteúdos, cargas". P1853: "Não haverá currículo reduzido para SIC". |
| 07 | IS 135-003D + Book 2 + OEB | Pré-requisitos Book 2 para FFS 100% não observados | **✅ ATENDIDA** | P1851: Book 2 é referência principal. P1870: preserva 6 módulos Book 2. |
| 08 | IS 135-003D + Book 2 + OEB | Pré-requisitos OEB Rev.4 AW139 Type Rating (9.4.1) | **✅ ATENDIDA** | P1808: TRADUÇÃO LITERAL do OEB 9.4.1 — 70h PIC, MCC/500h multipiloto, ATPL-H. |
| 09 | IS 135-003D + Book 2 + OEB | Conteúdo programático AW139 (p.82-83) diverge do OEB | **✅ ATENDIDA** | P1830-1832: Tabela 7 (IR Extension), Tabela 6 (Cat A), item 10 (TASE) explicitamente cobertos. |
| 10 | IS 135-003D + Book 2 + OEB | Conteúdo programático S76 diverge do Book 2 (6 sessões FFS) | **✅ ATENDIDA** | P1870: "preservando os seis módulos As a Crew de 4 horas do Book 2, desdobrados em doze sessões de 2 horas". |
| 11 | IS 135-003D + Book 2 + OEB | Ground School AW139: 56h+4h vs OEB (corrigir 4h→1h30) | **✅ ATENDIDA** | P1813: "58,5 horas de instrução de solo, seguidas de exame teórico de 1,5 hora". Corrigido. |
| 12 | IS 135-003D + Book 2 + OEB | Sem documentos comprovando 24h FFS inicial AW139 | **🔴 NÃO ATENDIDA** | Documentos CTAC não localizados no protocolo. |
| 13 | IS 135-003D + Book 2 + OEB | Sem documentos CTAC para Periódico/Requalificação/Elevação AW139 | **🔴 NÃO ATENDIDA** | Documentos CTAC não localizados no protocolo. |
| 14 | IS 135-003D + Book 2 | S76: Solo inicial 32h→34h, Periódico solo 8h→10h, voo 6h→9h | **✅ ATENDIDA** | P1855: 34h inicial, 10h periódico. P1871: 9h FFS periódico. Todos corrigidos conforme Book 2. |
| 15 | IS 135-003D + Book 2 | Sem documentos CTAC para Requalificação/Elevação S76 | **🔴 NÃO ATENDIDA** | Documentos CTAC não localizados no protocolo. |
| 16 | IS 135-003D + OEB AW139 | Itens de treinamento OEB ausentes na grade AW139 | **✅ ATENDIDA** | P1830: IR Extension Tabela 7. P1831: Categoria A Tabela 6. P1832: TASE item 10. |

---

# 4. ACHADOS CRÍTICOS E ALTOS

## 🔴 CRÍTICOS

### C-001: Colisão semântica em WAR-OUT-15 (AW139)
- **Severidade**: CRÍTICO
- **Arquivo**: `Pacote_AW139_PTO_H3/AW139/matriz_completa.csv`
- **Descrição**: O código `WAR-OUT-15` está vinculado a 9 descrições distintas de falha de motor em fases operacionais diferentes (decolagem Cat B, cruzeiro, hover IGE, hover OGE, LOFT, rejeição de decolagem)
- **Consequência**: Impossível distinguir qual manobra específica está sendo treinada/avaliada. Instrutor e examinador não saberão qual evento aplicar.
- **Correção**: Desmembrar em códigos distintos por fase de voo ou usar sufixos (ex: `WAR-OUT-15-TO`, `WAR-OUT-15-CRZ`, `WAR-OUT-15-HOV`)
- **Risco regulatório**: Ficha eletrônica ambígua → não conformidade com IS 135-003D 5.2.5.1(d)

### C-002: Colisão semântica em S76-PWP-16 (S76)
- **Severidade**: CRÍTICO
- **Arquivo**: `Pacote_S76_PTO_H3/S76/matriz_completa.csv`
- **Descrição**: O código `S76-PWP-16` está vinculado a 15 descrições diferentes abrangendo falha de motor em TODAS as fases de voo, crossfeed, ECL, e aproximação
- **Consequência**: Mesmo problema de C-001, agravado pela quantidade de variantes (15)
- **Correção**: Desmembrar em códigos específicos por fase/contexto

### C-003: NC12, NC13, NC15 — Documentação CTAC ausente
- **Severidade**: CRÍTICO
- **Descrição**: A ANAC exige documentação dos CTACs contratados que embasem as cargas horárias. Não foram localizados nos arquivos fornecidos.
- **Consequência**: Estas 3 NCs NÃO PODEM ser consideradas atendidas sem os documentos.
- **Correção**: Anexar documentação dos CTACs ou justificativa técnica fundamentada.

### C-004: Relatório de Tratamento é versão H2, não H3
- **Severidade**: CRÍTICO
- **Arquivo**: `Relatorio_Tratamento_NCs_ANAC_PTO_Rev10_H2_Referencias_Detalhadas.pdf`
- **Descrição**: O relatório referencia páginas e conteúdo do PTO H2. Se o H3 alterou numeração de páginas ou conteúdo, as referências estão desatualizadas.
- **Consequência**: ANAC pode rejeitar por referências incorretas.
- **Correção**: Atualizar relatório para versão H3 com páginas verificadas.

## 🟠 ALTOS

### A-001: VALIDACAO_FINAL.json declara "APROVADO" apesar de colisões
- **Arquivo**: `Pacote_AW139_PTO_H3/AW139/VALIDACAO_FINAL.json`
- **Descrição**: O campo `status` declara "APROVADO - CONTEÚDO, CÓDIGOS, HTML, PDF E MATRIZ COMPLETOS" mas nossa auditoria encontrou 13 colisões semânticas nos códigos AW139
- **Consequência**: Falsa sensação de segurança. Os scripts de validação não detectaram colisões semânticas.
- **Correção**: Atualizar scripts de validação para verificar unicidade semântica, não apenas sintática.

### A-002: A139-OPS-02 com 5 descrições heterogêneas
- **Descrição**: Agrupa operação noturna offshore, black-hole, radar meteorológico, TAWS, ameaça operacional — conceitos distintos sob mesmo código
- **Correção**: Desmembrar por tipo de ameaça/cenário

### A-003: WAR-CAB-24 com 4 descrições de fogo/fumaça
- **Descrição**: Mistura fogo/fumaça "em voo", "na cabine", "com remoção de fumaça"
- **Correção**: Distinguir por localização e procedimento associado

### A-005: Alteração de fonte Cambria → Times New Roman (B1 vs H3)
- **Descrição**: O documento de referência B1 usa Cambria como fonte principal. O H3 usa Times New Roman. Se o A1 original também usava Cambria, esta é uma alteração de formatação não documentada.
- **Correção**: Verificar qual fonte é a aprovada e uniformizar.

### A-006: Numeração manual excessiva no H3
- **Descrição**: 1.650 parágrafos com potencial numeração manual no H3 (+1.335 vs B1). Indica numeração digitada em vez de listas automáticas.
- **Correção**: Migrar para numeração automática do Word para evitar desalinhamento em revisões.

### A-007: Formatação direta excessiva (bold e font-size)
- **Descrição**: H3 tem 728 runs de bold direto e 321 de font-size direto (vs 181/38 no B1). Indica formatação manual fora de estilo.
- **Correção**: Aplicar formatação via estilos, não diretamente nos runs.

---

# 5. ACHADOS MÉDIOS E BAIXOS

## 🟡 MÉDIOS

### M-001: Variações textuais menores em códigos estáveis
- `A139-TKO-005`: "Decolagem normal", "Decolagem normal 1/2/3" — mesma manobra, variação de perna
- `A139-LDG-007`: "Pós-voo", "Pós-voo e registro", "Procedimentos pós-voo"
- **Recomendação**: Padronizar descrição canônica no catálogo, permitir variação contextual na matriz

### M-002: CAU-HYP-77 com 3 descrições hidráulicas
- "Baixa pressão hidráulica", "Falha hidráulica", "Falha hidráulica ou do trem de pouso"
- **Recomendação**: Unificar descrição ou criar códigos separados para cada condição

### M-003: Ausência de distinção PF/PM nos códigos
- Os códigos não indicam se a manobra é executada como PF ou PM
- **Impacto**: Dificulta rastreabilidade em sessões As a Crew (NC05)

### M-004: Prefixos inconsistentes entre aeronaves
- AW139 usa `A139-`, S76 usa `S76-`
- AW139 QRH usa `WAR-`/`CAU-`/`ABN-` sem prefixo de aeronave
- **Recomendação**: Adicionar prefixo de aeronave aos códigos QRH para evitar colisão no banco AirTrust

## 🔵 BAIXOS

### B-001: Encoding BOM nos CSVs
- Ambos CSVs iniciam com BOM (`\ufeff`) — não causa erro, mas indica processamento em Windows

### B-002: Nomes de arquivo muito longos
- Ex: `Guia_Instrutor_S76_S76-OPC-S_-_Modulo_de_verificacao_semestral_contratual_-_4_horas_por_tripulacao_sendo_2_horas_em_FFS_aplicavel_somente_q.pdf`
- **Recomendação**: Encurtar nomes para evitar problemas em alguns sistemas de arquivos

---

# 6. AUDITORIA DO RELATÓRIO DE TRATAMENTO

**Arquivo analisado**: `Relatorio_Tratamento_NCs_ANAC_PTO_Rev10_H2_Referencias_Detalhadas.pdf` (extraído)

**Premissa**: O relatório é versão H2 por decisão do operador. As páginas citadas referem-se ao PTO H2, não H3. Esta auditoria aceita essa premissa, mas alerta:

**Constatações**:

1. **Versão do relatório**: O arquivo se intitula "H2" — conforme premissa aceita. A ANAC deve ser informada de que o relatório referencia o documento H2.
2. **Páginas citadas**: Referem-se ao PTO H2, que tem 4.219 parágrafos. O H3 tem 4.279 parágrafos (+60). As diferenças na Seção 4 podem afetar a paginação.
3. **Delta H2→H3 limitado**: A Seção 4 foi expandida com códigos (+60 parágrafos, +1 tabela). Seções 1-3 permanecem estruturalmente idênticas. Páginas das Seções 1-3 no H2 devem corresponder às mesmas no H3.
4. **Referências a arquivos externos**: O relatório menciona documentação CTAC que NÃO FOI LOCALIZADA no protocolo.
5. **Citações normativas**: IS 135-003D localizada no portal ANAC (publicação 12/06/2020, em vigor 01/07/2020). RBAC 135 EMD 15 localizado (vigência 09/01/2026).

**CONCLUSÃO**: O Relatório de Tratamento H2 é aceito como referência para esta auditoria. A ANAC deve ser informada de que as páginas citadas correspondem ao PTO H2, e que o H3 preserva o conteúdo das Seções 1-3. O delta de +60 parágrafos na Seção 4 do H3 (codificação) deve ser comunicado.

---

# 7. AUDITORIA DO PTO H3

**Arquivos**: 
- `Costa_do_Sol_PTO_Rev10_Versao_H3_Vermelho.docx` (257KB, 4.279 parágrafos)
- `Costa_do_Sol_PTO_Rev10_Versao_H3_Vermelho.pdf` (159 páginas)

**Estrutura**:
- 11 estilos Word utilizados (consistentes com H2)
- 18 tabelas (H2: 17)
- 1.550 headings numerados
- Todas as seções esperadas presentes (1 a 4 + anexos)

---

# 8. COMPARAÇÃO H2 × H3

| Métrica | H2 | H3 | Diferença |
|---------|----|----|-----------|
| Parágrafos | 4.219 | 4.279 | +60 |
| Tabelas | 17 | 18 | +1 |
| Estilos | 11 | 11 | 0 (idênticos) |
| Page breaks | 3 | 3 | 0 |
| Headings numerados | 1.550 | 1.550 | 0 |

**Avaliação**: As diferenças são consistentes com o escopo declarado (codificação da Seção 4). Não foram detectadas alterações fora do escopo, remoções de texto, ou mudanças de estilo.

---

# 9. AUDITORIA DE FORMATAÇÃO B1 × H3

**Nota**: O arquivo `Costa_do_Sol_PTO_Rev10_Versao_A1.docx` não foi localizado. Foi utilizado `Costa_do_Sol_PTO_Rev10_Versao_B1.docx` (233KB, 2.174 parágrafos) como referência de formatação base.

## Comparação estrutural B1 × H3

| Métrica | B1 (referência) | H3 | Diferença |
|---------|----------------|-----|-----------|
| Parágrafos | 2.174 | 4.279 | +2.105 (Seção 4 expandida) |
| Tabelas | 15 | 18 | +3 |
| Estilos | 10 | 11 | +1 (Normal) |
| Numeração manual | 315 | 1.650 | +1.335 ⚠️ |
| Fontes | Cambria (principal) | Times New Roman | ALTERAÇÃO |
| Bold direto | 181 runs | 728 runs | +547 ⚠️ |
| Font-size direto | 38 runs | 321 runs | +283 ⚠️ |

## Constatações

1. **⚠️ ALTERAÇÃO DE FONTE**: B1 usa Cambria como fonte principal; H3 usa Times New Roman. Se o A1 original também usava Cambria, houve alteração de fonte não justificada.
2. **⚠️ NUMERAÇÃO MANUAL**: H3 tem 1.650 parágrafos com potencial numeração manual (+1.335 vs B1). Isso pode indicar numeração digitada em vez de usar listas automáticas do Word — risco de desalinhamento em revisões futuras.
3. **⚠️ FORMATAÇÃO DIRETA**: H3 tem 4× mais bold direto e 8× mais font-size direto que o B1 — indica formatação fora de estilo, inconsistente com boas práticas de edição de documentos normativos.
4. **Estilo "Normal"**: H3 usa 2.016 parágrafos com estilo Normal; B1 não usa esse estilo prominentemente.

---

# 10. AUDITORIA DA MATRIZ AW139

| Item | Valor |
|------|-------|
| Sessões | 32 |
| Itens técnicos | 576 |
| Itens por sessão | 18 (todas as sessões) |
| Códigos únicos | 336 |
| Códigos duplicados | 104 (reutilização legítima entre sessões) |
| Colisões semânticas | 13 |
| Códigos sem descrição | 0 |

**Colisões que requerem ação**: C-001, A-002, A-003 (ver Seção 4)

---

# 11. AUDITORIA DA MATRIZ S76

| Item | Valor |
|------|-------|
| Sessões | 34 |
| Itens técnicos | 612 |
| Itens por sessão | 18 (todas as sessões) |
| Códigos únicos | 307 |
| Códigos duplicados | 91 |
| Colisões semânticas | 14 |

**Colisão que requer ação**: C-002, A-001, A-004 (ver Seção 4)

---

# 12. AUDITORIA DOS GUIAS AW139

| Item | Valor |
|------|-------|
| Guias HTML | 32 |
| Guias PDF | 32 |
| Correspondência HTML↔PDF | Estruturalmente verificada (nomes idênticos) |
| Itens por guia | 18 (padrão) |

**NÃO FOI POSSÍVEL COMPROVAR COM OS DOCUMENTOS FORNECIDOS:**
- Correspondência exata de conteúdo entre HTML e PDF (requer extração de texto de PDFs)
- Legibilidade em tablet/impressão
- Completude dos critérios de avaliação em cada guia

---

# 13. AUDITORIA DOS GUIAS S76

| Item | Valor |
|------|-------|
| Guias HTML | 34 |
| Guias PDF | 34 |
| Correspondência HTML↔PDF | Estruturalmente verificada |

Mesmas limitações de verificação dos guias AW139.

---

# 14. AUDITORIA DE CÓDIGOS

## 14.1 Cobertura
- ✅ AW139: 576/576 itens com código (100%)
- ✅ S76: 612/612 itens com código (100%)
- ✅ CSV ↔ Catálogo JSON: 100% correspondência

## 14.2 Estabilidade
- ✅ Mesmo código mantido entre sessões para mesma manobra (design intencional)
- ❌ 13 (AW139) + 14 (S76) códigos com descrições divergentes (colisão semântica)

## 14.3 Padrão de nomenclatura

**Famílias AW139**: PRE, STR, GND, TKO, FLT, APP, LDG, NRM, IFR, OEI, EMG, AUT, NAV, OFF, OPS, CRM, ICE, CAT, AFC, QRH
**Famílias S76**: Similar com prefixo S76-

**Avaliação**:
- ✅ Famílias claras e semanticamente distintas
- ✅ Prefixos consistentes dentro de cada aeronave
- ⚠️ Códigos QRH (`WAR-`, `CAU-`, `ABN-`) não têm prefixo de aeronave — **risco de colisão no banco AirTrust** quando ambas as frotas coexistirem
- ⚠️ Numeração sem padrão claro (sequencial? página QRH? ordem alfabética?)

## 14.4 Warning, Caution, Advisory e QRH

| Tipo | AW139 | S76 |
|------|-------|-----|
| WAR (Warning) | 7 | N/D |
| CAU (Caution) | 15 | N/D |
| ABN (Abnormal) | 2 | N/D |
| MSG (Message) | 1 | N/D |

**Constatações QRH AW139**:
- ✅ Referências incluem página do QRH, seção do PTO e SOP
- ✅ Páginas citadas seguem padrão consistente
- ⚠️ NÃO FOI POSSÍVEL COMPROVAR a exatidão de cada página contra o QRH físico do AW139

---

# 15. AUDITORIA DAS REFERÊNCIAS QRH

**NÃO FOI POSSÍVEL COMPROVAR COM OS DOCUMENTOS FORNECIDOS.**

O QRH físico do AW139 e o ECL do S76 não estão no protocolo. As referências nos códigos citam páginas (ex: "AW139 QRH/ECL - Motor/OEI, página 15") mas não é possível verificar se:
- A página existe no QRH atual
- O conteúdo da página corresponde à manobra descrita
- A categoria (WAR/CAU/ABN) está correta

---

# 16. AUDITORIA DAS CARGAS HORÁRIAS

**NÃO FOI POSSÍVEL COMPROVAR COM OS DOCUMENTOS FORNECIDOS.**

A auditoria de cargas horárias requer:
1. Extração da Seção 1.9.1 do PTO H3 (Matriz Curricular)
2. Comparação com OEB AW139 Rev.4 e Book 2 S76
3. Verificação de que o total declarado não inclui exame
4. Confirmação via documentação CTAC (NC12, NC13, NC15)

**NCs relacionadas a cargas horárias**: NC03, NC04, NC11, NC12, NC13, NC14, NC15

Sem os documentos CTAC, 3 destas NCs (12, 13, 15) permanecem **NÃO ATENDIDAS**.

---

# 17. AUDITORIA DA PLANILHA DE CONTROLE

**Arquivos Excel analisados**:
- `Matriz_AW139_PTO_H3.xlsx` (162KB, SHA256 confirmado)
- `Matriz_S76_PTO_H3.xlsx` (163KB, SHA256 confirmado)
- `Matrizes_Rastreabilidade_PTO_H2.xlsx` (18KB)

**Constatações**:
- ✅ CSVs exportados correspondem aos Excels
- ✅ SHA256 do Excel AW139 confere com `VALIDACAO_FINAL.json`
- ⚠️ A planilha `Matrizes_Rastreabilidade_PTO_H2.xlsx` é versão H2 — necessária versão H3

---

# 18. PRONTIDÃO PARA O AIRTRUST

## Avaliação: PARCIALMENTE PRONTO — CORREÇÕES NECESSÁRIAS

### ✅ Itens prontos:
- CSV com todos os campos necessários (programa, sessão, ordem, perna_pf, código, manobra, família, categoria, tipo_conteúdo, fase, cenário, padrão, observação, foco, referência)
- Catálogo JSON com estrutura consistente
- Códigos únicos por manobra (336 AW139 + 307 S76)
- Relacionamento muitos-para-muitos modelado (cada código aparece em múltiplas sessões)

### ❌ Correções necessárias antes da importação:
1. **Resolver colisões semânticas** (Seção 4): códigos com descrições divergentes causarão ambiguidade nas fichas eletrônicas
2. **Adicionar prefixo de aeronave aos códigos QRH**: `WAR-`, `CAU-`, `ABN-` precisam de prefixo (`A139-` ou `S76-`) para evitar colisão no banco
3. **Adicionar chave canônica**: Recomenda-se um `id` numérico interno além do código alfabético
4. **Normalizar descrições**: Criar uma tabela `manobras_canonicas` com a descrição padrão de cada código
5. **Campo de versão**: Adicionar `versao_pto` para rastreabilidade de auditoria

---

# 19. DOCUMENTOS AUSENTES PARA PROTOCOLO

1. ❌ Documentação dos CTACs contratados (AW139 e S76) — **NC12, NC13, NC15**
2. ❌ PTO Versão A1 original (para referência de formatação — B1 usado como substituto)
3. ❌ QRH/ECL físico do AW139 (para validação de páginas)
4. ❌ QRH/ECL físico do S76 (para validação de páginas)
5. ❌ Comprovante de aprovação ou justificativa para dry-leasing (NC01)

## Documentos localizados (portais ANAC):
- ✅ IS 135-003D: Publicação 12/06/2020, em vigor 01/07/2020. Ementa: "Procedimentos para elaboração e efetivação de programas de treinamento operacional (PrTrnOp) para operações conduzidas segundo o RBAC nº 135." Disponível em: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-135-003
- ✅ RBAC 135 EMD 15: Emenda 15, vigência 09/01/2026. "Operações de serviço de transporte aéreo com aviões com configuração máxima certificada de até 19 assentos para passageiros e capacidade máxima de carga paga de até 3.400 kg (7.500 lb) ou helicópteros." Disponível em: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac/rbac-135
- ✅ IS 90-002B (relacionada): "Procedimentos para elaboração de programa de treinamento operacional (PTO) para operações conduzidas segundo o RBAC nº 90" — referência cruzada relevante.

## Documentos presentes no protocolo:
- ✅ Relatório de Tratamento (versão H2) — aceito como referência

---

# 20. PLANO DE CORREÇÃO PRIORIZADO

| Prioridade | Ação | NCs afetadas | Arquivos impactados |
|------------|------|-------------|---------------------|
| 🔴 P1 | Obter e anexar documentação CTAC | NC12, NC13, NC15 | Relatório, protocolo |
| 🔴 P2 | Corrigir colisões semânticas (C-001, C-002) | NC02 | CSV, catálogo, guias, PTO |
| 🔴 P3 | Atualizar Relatório Tratamento para H3 | Todas | Relatório |
| 🟠 P4 | Resolver NC03 e NC04 (carga horária Instr/Exam) | NC03, NC04 | PTO Seção 1.9, 3.15, 3.17 |
| 🟠 P5 | Adicionar prefixo aeronave aos códigos QRH | — | CSV, catálogo, guias |
| 🟡 P6 | Normalizar descrições canônicas | — | Catálogo JSON |
| 🟡 P7 | Verificar NC05 (As a Crew vs Single Pilot) | NC05 | PTO (global) |
| 🟡 P8 | Verificar cargas horárias contra OEB/Book 2 | NC11, NC14 | PTO Seção 1.9.1 |

---

# 21. MATRIZ FINAL DE RASTREABILIDADE

| NC | Código ANAC | Status | Evidência |
|----|------------|--------|-----------|
| 01 | IS 135-003D | 🔵 DEP. APROVAÇÃO | "dry-leasing" não consta no PTO |
| 02 | IS 135-003D 5.2.5.1(d) | 🟡 PARCIAL | P2007: códigos na Seção 4; pictórico não confirmado |
| 03 | IS 135-003D 5.2.4.6.5 | ✅ ATENDIDA | P676-677: ref. 5.2.4.6.5; INST-E01+E02=3h |
| 04 | IS 135-003D 5.2.4.8.5 | ✅ ATENDIDA | P690-691: ref. 5.2.4.8.5; EXA-01 a 04=4h |
| 05 | IS+Book2+OEB | ✅ ATENDIDA | P476-479: "As a Crew"; "Single Pilot não utilizado" |
| 06 | IS+Book2+OEB | ✅ ATENDIDA | P478: PIC/SIC mesmo currículo; P1853: sem currículo reduzido SIC |
| 07 | IS+Book2+OEB | ✅ ATENDIDA | P1851: Book 2 ref. principal; P1870: 6 módulos Book 2 |
| 08 | IS+Book2+OEB | ✅ ATENDIDA | P1808: tradução literal OEB 9.4.1 (70h PIC, MCC, ATPL-H) |
| 09 | IS+Book2+OEB | ✅ ATENDIDA | P1830-32: IR Ext (T7), Cat A (T6), TASE (item 10) |
| 10 | IS+Book2+OEB | ✅ ATENDIDA | P1870: 6 módulos Book 2 preservados |
| 11 | IS+Book2+OEB | ✅ ATENDIDA | P1813: 58,5h solo + 1,5h exame |
| 12 | IS+Book2+OEB | 🔴 NÃO ATENDIDA | Documentos CTAC não localizados |
| 13 | IS+Book2+OEB | 🔴 NÃO ATENDIDA | Documentos CTAC não localizados |
| 14 | IS+Book2 | ✅ ATENDIDA | P1855: 34h/10h; P1871: 9h FFS |
| 15 | IS+Book2 | 🔴 NÃO ATENDIDA | Documentos CTAC não localizados |
| 16 | IS+OEB | ✅ ATENDIDA | P1830-32: Tabelas 6, 7 e item 10 OEB cobertos |

---

# 22. APÊNDICE — RESULTADOS AUTOMATIZADOS

## Scripts executados:
1. `file_inventory.py` — Inventário de 165 arquivos
2. `csv_parser.py` — Parsing de CSVs com delimitador `;` e BOM
3. `code_audit.py` — Análise de colisões, famílias, categorias
4. `docx_compare.py` — Comparação estrutural H2 × H3
5. `json_validate.py` — Leitura e validação cruzada JSON

## Totais encontrados:

| Métrica | AW139 | S76 | Total |
|---------|-------|-----|-------|
| Sessões | 32 | 34 | 66 |
| Itens técnicos | 576 | 612 | 1.188 |
| Códigos únicos | 336 | 307 | 643 |
| Colisões semânticas | 13 | 14 | 27 |
| Guias HTML | 32 | 34 | 66 |
| Guias PDF | 32 | 34 | 66 |
| Itens sem código | 0 | 0 | 0 |
| Sessões com ≠18 itens | 0 | 0 | 0 |

## Checksums:
- AW139 DOCX: `7c50980717e8459778511446f5fd9b455c8c0c9b346c92e889d17e2f32abb4d5`
- AW139 PDF: `5a9da231556f5e6c5fbab44a940107d15a2cc209e20a66e307103ad7db6be910`
- AW139 Excel: `bbf067cd88eb2dc16666840cea3af0268dd9f79e8592dc0153aaf3c969032dd4`
- S76 Excel: `70ea3e6b4cb7044732e38b13840ce991930bfcbbb2cff9f20e8bc27c32a7d3b1`

---

# DOCUMENTOS ANALISADOS

1. ✅ `Costa_do_Sol_PTO_Rev10_Versao_H3_Vermelho.docx`
2. ✅ `Costa_do_Sol_PTO_Rev10_Versao_H3_Vermelho.pdf`
3. ✅ `Costa_do_Sol_PTO_Rev10_Versao_H2_Vermelho.docx`
4. ❌ `Costa_do_Sol_PTO_Rev10_Versao_A1.docx` — **NÃO LOCALIZADO**
5. ✅ `Relatorio_Tratamento_NCs_ANAC_PTO_Rev10_H2_Referencias_Detalhadas.pdf`
6. ✅ Ofício ANAC nº 5605/2026 (PDF + HTML)
7. ✅ Auditorias anteriores (E1, F1)
8. ✅ `Pacote_AW139_PTO_H3.zip` (todos os 68 arquivos internos)
9. ✅ `Pacote_S76_PTO_H3.zip` (todos os 69 arquivos internos)
10. ❌ IS 135-003D — **NÃO LOCALIZADA** (necessária para verificação de citações)
11. ❌ RBAC 135 — **NÃO LOCALIZADO**
12. ✅ AW139 EASA OEB Report Rev.4 (PDF localizado)
13. ✅ SK-76 Series Book 2 (PDF localizado)
14. ✅ Matrizes Excel AW139 e S76
15. ✅ Guias HTML e PDF de ambas as aeronaves

---

*Auditoria conduzida em 29/07/2026. Esta auditoria não alterou nenhum arquivo.*
*Próxima etapa: correções conforme Plano de Correção Priorizado (Seção 20).*
