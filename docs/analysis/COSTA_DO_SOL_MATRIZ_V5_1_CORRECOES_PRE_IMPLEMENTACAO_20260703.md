# Costa do Sol / AirTrust — Matriz V5.1 Correções Pré-Implementação 20260703

**Data-base:** 2026-07-03
**Fonte primária:** `docs/analysis/COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md`
**Fontes secundárias:** V4, V4.1, V4.2, NOTECHS_MODELOS_MANOBRAS_MATRIX_20260702.csv, NOTECHS_MODELOS_MANOBRAS_SUMMARY_20260702.md, schema `modelos_sessao_manobras`
**Caráter:** Documental. Nenhuma implementação, migration, DML, deploy ou alteração funcional. Apenas este arquivo foi criado. A V5 original não foi alterada.

---

## 1. Veredito

**GO para avançar para implementação em branch SOMENTE se todos os bloqueios abaixo forem resolvidos. NO-GO enquanto houver duplicidade de código dentro da mesma ficha.**

A V5 está pedagogicamente madura (progressão correta, saneada de itens genéricos, sequenciada intra-sessão, LOFT/LOFT Check distintos, cobertura FAP mapeada). Porém, há **bloqueios técnicos** que impedem a implementação direta via `INSERT INTO modelos_sessao_manobras`:

- O schema atual tem `UNIQUE(modelo_id, manobra_id)` — **não aceita o mesmo código duas vezes na mesma ficha**.
- A V5 usa "repetição técnica" (mesmo código repetido nas posições 17-18) como estratégia de preenchimento das vagas abertas pelo saneamento de COM/BRF/DBR.
- Essa repetição é pedagogicamente válida (reforço do item central da sessão) mas **tecnicamente inviável** com a constraint atual.

Este documento (V5.1) cataloga todas as duplicidades, propõe substitutos distintos e resolve os demais bloqueios técnicos identificados.

---

## 2. Bloqueios Técnicos Identificados

| # | Bloqueio | Impacto | Severidade |
|---|---|---|---|
| 1 | Códigos duplicados na mesma ficha (repetição técnica) | `UNIQUE(modelo_id, manobra_id)` rejeita INSERT | **Crítico** |
| 2 | LOFT Check não diferenciável do LOFT a nível de schema | Fichas indistinguíveis sem metadata | **Alto** |
| 3 | Campos estruturais futuros sem definição de schema | `ordem_aplicacao`, `fase_voo`, `tipo_item`, `carater`, `fap_refs` sem coluna | **Médio** |
| 4 | DECU classificado como REAPROVEITAR_RENOMEANDO na V5 | Deveria ser REALOCAR (mudou de sessão na V4) | **Baixo** |
| 5 | S76-VOR-00 / S76-LDP-00 tratados como "não instanciados" | Códigos existem no catálogo; pendência é de uso, não de existência | **Baixo** |

---

## 3. Tabela de Duplicidades e Substitutos

### Regra geral

Posições 17-18 da V5 são "repetição técnica" — reforço do item central da sessão, introduzido pela V4.1 para preencher vagas de COM/BRF/DBR removidos. Como o schema bloqueia `UNIQUE(modelo_id, manobra_id)`, cada repetição precisa de um **código distinto**.

Estratégia proposta: usar **códigos existentes do catálogo correlatos ao tema central**, ou criar **código novo com sufixo `-R` (reforço)**, ou **elevar um item de observação a técnica**. NUNCA forçar duplicidade.

### 3.1 S76/SK76 Inicial

| Sessão | Posição | Código duplicado | Item central | Substituto proposto | Tipo de substituto |
|---|---|---|---|---|---|
| 03/12 | 16 | `76-APXPR` (já em pos 11) | Aproximação precisão | `76-APXPR-R` (reforço, mesmo nome com sufixo) ou `S76-CKL-01` (checklist normal em contexto IFR) | Código novo com sufixo |
| 03/12 | 17 | `76-APXNP` (já em pos 12) | Aproximação não-precisão | `76-APXNP-R` ou `S76-UAR-00` (já na pos 15, mas distinto) — Alternativa: `S76-FDA-00` (reforço de automation IFR) | Código novo ou realocação |
| 03/12 | 18 | `S76-HLD-00` (já em pos 9) | Holding | `S76-HLD-00-R` ou `S76-NIF-00` (normais IFR, já na pos 2 mas reforço distinto) | Código novo com sufixo |
| 05/12 | 17 | `76-MOTCZ` (já em pos 1) | Falha motor cruzeiro | `76-MOTCZ-REP` ou `S76-OEI-01` (já na pos 4, mas reforço válido se o perfil OEI for distinto da falha) — Melhor: `76-DUACZ` (falha dupla cruzeiro, existente, da sessão 09, como variação mais avançada) | Existente realocado |
| 05/12 | 18 | `S76-CKL-03` (já em pos 3) | ECL falha motor | `S76-CKL-03-R` ou `S76-CKL-01` (checklist normal como contraste pós-evento) | Código novo ou existente distinto |
| 06/12 | 17 | `76-MOTCA` (já em pos 5) | Falha motor decolagem CAT A | `76-MOTCA-REP` ou `76-MOTCB` (já na pos 6, mas se CAT B é distinto, usar CAT A com variação de fase) — Melhor: `76-MOTAP` (já na pos 11, mas em fase diferente) — Alternativa: `76-APXAL` (aproximação alternada, já na pos 13, como repetidor de decisão) | Código existente realocado |
| 06/12 | 18 | `S76-CKL-04` (já em pos 8) | ECL DECU/OEI | `S76-CKL-04-R` ou `S76-CKL-02` (ECL anormalidade simples, contraste com menor severidade) | Existente distinto |
| 08/12 | 17 | `S76-AUT-70` (já em pos 12) | Autorrotação | `S76-AUT-70-R` ou `S76-REC-02` (já na pos 13, recuperação — mas se é distinto, usar `S76-NRL-00` da pos 10 como reforço de RPM) — Melhor: `S76-MRV-00` (vibração rotor, já na pos 15, mas como item de fechamento distinto) | Código existente |
| 08/12 | 18 | `S76-ENE-01` (já em pos 11) | Controle energia/RPM | `S76-ENE-01-R` ou `S76-NRO-00` (NR overspeed, já na pos 9, distinto de NR low/autorotação) | Código existente |
| 09/12 | 17 | `76-INCMO` (já em pos 1) | Incêndio motor | `76-INCMO-REP` ou `76-INCCB` (incêndio cabine, já na pos 6, como variação de fogo) — Melhor: `S76-FMF-07` (fogo motor voo, já na pos 2, distinto de incêndio compartimento) | Código existente |
| 09/12 | 18 | `S76-CKL-06` (já em pos 3) | Ações memória fogo/fumaça | `S76-CKL-06-R` ou `S76-CKL-05` (ECL rotor/transmissão da sessão 08, como contraste de família de ECL) | Código existente distinto |
| 10/12 | 17 | `S76-CKL-07` (já em pos 1) | ECL offshore | `S76-CKL-07-R` ou `S76-CKL-01` (checklist normal, contraste pré/pós offshore) | Código existente distinto |
| 10/12 | 18 | `S76-APO-01` (já em pos 8) | Aproximação offshore | `S76-APO-01-R` ou `S76-ARO-01` (arremetida offshore, já na pos 12, como variação distinta) | Código existente |

### 3.2 AW139 Inicial

| Sessão | Posição | Código duplicado | Item central | Substituto proposto | Tipo de substituto |
|---|---|---|---|---|---|
| 05/12 | 17 | `WAR-OUT-15` (já em pos 1) | Engine failure | `WAR-OUT-15-R` ou `WAR-EEC-18` (já na pos 4, mas distinto) — Melhor: `WAR-IDL-16` (engine stuck idle, existente, da sessão 06) | Existente realocado |
| 05/12 | 18 | `A139-CKL-03` (já em pos 3) | QRH engine/EEC | `A139-CKL-03-R` ou `A139-CKL-02` (QRH anormalidade simples, contraste de severidade) | Existente distinto |
| 06/12 | 17 | `A139-CATB-01` (já em pos 4) | Rejected takeoff | `A139-CATB-01-R` ou `A139-CATB-02` (já na pos 5, mas distinto: rejected vs continued) — Melhor: `WAR-GER-27` (trem, já na pos 14, como evento de pouso) | Código existente |
| 06/12 | 18 | `A139-CATB-02` (já em pos 5) | Continued takeoff | `A139-CATB-02-R` ou `WAR-LOW-29` (rotor RPM low, já na pos 10, mas distinto de CAT) | Código existente |
| 07/12 | 17 | `CAU-APF-37` (já em pos 1) | AP failure | `CAU-APF-37-R` ou `CAU-MIS-40` (já na pos 2, mas AP MISTRIM é distinto de AP failure) — Melhor: `CAU-SAS-41` (já na pos 3, SAS degraded como variação) | Código existente |
| 07/12 | 18 | `CAU-AFD-41` (já em pos 4) | AFCS degraded | `CAU-AFD-41-R` ou `FLY-BAS-X4` (já na pos 5, atitudes anormais, distinto de AFCS) | Código existente |
| 08/12 | 17 | `FLY-BAS-17` (já em pos 13) | Autorrotação | `FLY-BAS-17-R` ou `A139-REC-01` (já na pos 14, recuperação, mas se distinto, usar `WAR-MRC-X1` da pos 6 como fechamento de rotor) | Código existente |
| 08/12 | 18 | `A139-ENE-01` (já em pos 12) | Controle energia/RPM | `A139-ENE-01-R` ou `WAR-LOW-29` (rotor RPM low, já na pos 10, distinto) | Código existente |
| 09/12 | 17 | `WAR-FIR-21` (já em pos 1) | Engine fire | `WAR-FIR-21-R` ou `WAR-CAB-23` (cabin smoke, já na pos 3, como variação de fogo/fumaça) | Código existente |
| 09/12 | 18 | `A139-CKL-06` (já em pos 2) | QRH fogo/fumaça | `A139-CKL-06-R` ou `A139-CKL-05` (QRH rotor/transmissão da sessão 08, contraste de família) | Código existente distinto |

### 3.3 Observações sobre LOFT e LOFT Check (Sessões 11 e 12)

As sessões 11 (LOFT) e 12 (LOFT Check) **não têm duplicidade interna** — cada ficha tem 18 códigos distintos. A duplicidade é **entre fichas** (S11 e S12 compartilham os mesmos códigos), o que é permitido pelo schema (`UNIQUE(modelo_id, manobra_id)` trata cada modelo separadamente).

**Recomendação:** Manter os mesmos 18 códigos em S11 e S12 (coerente com "check cobre o que foi treinado"), diferenciando-as por metadata (ver seção 5).

---

## 4. Decisão LOFT vs LOFT Check

### Situação atual

- Sessão 11 (LOFT) e Sessão 12 (LOFT Check) usam os mesmos 18 códigos em ambas as aeronaves.
- O schema atual **não tem campo para diferenciar** treinamento de avaliação.
- A V4.2 propôs um marcador textual `carater=avaliativo` nas observações.

### Recomendação (sem implementação agora)

**Opção A — Campo `carater` na tabela `modelos_sessao`** (recomendada):
- Adicionar coluna `carater TEXT DEFAULT 'treinamento'` na tabela `modelos_sessao`.
- Valores: `treinamento` (default, para sessões 01-11 e todas as periódicas não-check) | `avaliativo` (para LOFT Check e sessões periódicas de check).
- Vantagem: uma única flag resolve a distinção; não polui a tabela de vínculos.
- Desvantagem: requer migration (adiada para fase de implementação).

**Opção B — Observações com prefixo padronizado:**
- Usar o campo `observacoes` de `modelos_sessao` com prefixo `carater=avaliativo`.
- Exemplo: `"carater=avaliativo; sem_conteudo_novo=sim; fonte=FAP 05.2/06/14/PTO"`.
- Vantagem: zero migration; implementável imediatamente.
- Desvantagem: parse manual; frágil para queries.

**Opção C — Tabela auxiliar `modelos_sessao_metadata`:**
- Tabela `(modelo_id, chave, valor)` para pares chave-valor.
- Vantagem: extensível para `fap_refs`, `tipo_sessao`, `sem_conteudo_novo` etc.
- Desvantagem: complexidade adicional; overengineering para uma flag.

**Decisão recomendada:** Opção A para implementação futura, Opção B como solução imediata (zero migration) se necessário antes da migration.

---

## 5. Decisão sobre Metadata / Schema Futuro

### Campos propostos pela V5

| Campo | Significado | Hoje está em |
|---|---|---|
| `ordem_aplicacao` | Posição do item na sequência de voo (1-18) | Coluna `ordem` em `modelos_sessao_manobras` — **já existe** |
| `fase_voo` | Fase de voo onde o item se aplica | Não existe. Aparece nas tabelas da V5 como coluna documental |
| `tipo_item` | Classificação: normal / anormalidade / emergência / procedimento / check | Não existe |
| `carater` | `treinamento` ou `avaliativo` | Não existe (ver seção 4) |
| `fap_refs` | Referências FAP (ex.: `FAP05.2 H4.2`) | Não existe. Aparece nas tabelas da V5 como coluna documental |

### Recomendação

**Curto prazo (zero migration):**
- `ordem_aplicacao` → já coberto pela coluna `ordem`.
- `fase_voo`, `tipo_item`, `fap_refs` → colocar no campo `observacoes` de `modelos_sessao_manobras` com formato prefixado:
  ```
  fase_voo=Cruzeiro; tipo_item=anormalidade; fap_refs=FAP05.2 H7.4
  ```
- `carater` → colocar no campo `observacoes` de `modelos_sessao` (ver seção 4, Opção B).

**Longo prazo (migration futura):**
- Adicionar coluna `fase_voo TEXT` em `modelos_sessao_manobras`.
- Adicionar coluna `tipo_item TEXT` em `modelos_sessao_manobras`.
- Adicionar coluna `fap_refs TEXT` em `modelos_sessao_manobras` (ou tabela auxiliar `manobras_fap` N:N).
- Adicionar coluna `carater TEXT DEFAULT 'treinamento'` em `modelos_sessao`.
- Essas migrations só devem ser criadas quando a V5 for aprovada pelo instrutor/owner.

---

## 6. Correção DECU

### Situação na V5

A V5 classifica os 4 códigos DECU como `REAPROVEITAR_RENOMEANDO`:

| Código | Nome V5 | Decisão V5 | Sessão V5 |
|---|---|---|---|
| `S76-DMN-21` | DECU — falha menor | REAPROVEITAR_RENOMEANDO | 05/12 |
| `S76-DDE-21` | DECU — falha degradada | REAPROVEITAR_RENOMEANDO | 06/12 |
| `S76-DM1-22` | DECU — falha maior em um motor | REAPROVEITAR_RENOMEANDO | 06/12 |
| `S76-DMB-24` | DECU — falha maior em ambos os motores | REAPROVEITAR_RENOMEANDO | 06/12 |

### Correção V5.1

Esses 4 códigos foram **realocados** de sessão na transição V3→V4 (na V3 estavam todos na Sessão 01/12; na V4/V5 foram distribuídos entre as sessões 05 e 06). Portanto:

**Classificação correta: `REALOCAR`**.

| Código | Decisão corrigida | Motivo |
|---|---|---|
| `S76-DMN-21` | REALOCAR | Movido da Sessão 01/12 (V3) para Sessão 05/12 (V5) |
| `S76-DDE-21` | REALOCAR | Movido da Sessão 01/12 (V3) para Sessão 06/12 (V5) |
| `S76-DM1-22` | REALOCAR | Movido da Sessão 01/12 (V3) para Sessão 06/12 (V5) |
| `S76-DMB-24` | REALOCAR | Movido da Sessão 01/12 (V3) para Sessão 06/12 (V5) |

`REAPROVEITAR_RENOMEANDO` aplica-se apenas a códigos que mudaram de nome sem mudar de sessão (ex.: `S76-FPL-31` de `76-COMBX` na V3). A família DECU mudou de sessão — é `REALOCAR`.

Impacto prático: zero (a decisão é documental). Nenhum código funcional é afetado.

---

## 7. Correção S76-VOR-00 / S76-LDP-00

### Situação na V5

A V5 (seção 12) e o pacote de revisão (seção 6, pergunta 9) tratam `S76-VOR-00` e `S76-LDP-00` como "citados mas nunca instanciados em ficha concreta".

### Correção V5.1

**Ambos os códigos EXISTEM no catálogo.** Evidência extraída de `NOTECHS_MODELOS_MANOBRAS_MATRIX_20260702.csv`:

| Código | Modelos onde aparece | Fonte |
|---|---|---|
| `S76-VOR-00` | `S76-P-C3/IFR` (periódico, ciclo 3, IFR) | migration 0262 (SK76 periódico ciclos), migration 0297 (tripulante AB) |
| `S76-LDP-00` | `S76-NOT-02` (noturno), `S76-P-C1/VFR`, `S76-P-C2/VFR`, `S76-P-C3/VFR` (periódico, ciclos 1-3), `S76-REQ-01` (reaquisição) | migrations 0262, 0297, 0367, 0383 |

**Conclusão:** Os códigos existem e estão em uso em fichas periódicas e noturnas. **Não estão no Inicial** (12 sessões SK76-I-01/12 a 12/12), e é por isso que a V4 e V5 não os encontraram ao varrer as fichas do Inicial.

**A pendência real é:** validar se devem ser incluídos no Inicial, com que frequência e em qual posição — **não é** validar se existem.

**Ação V5.1:** Corrigir o texto da pendência. Onde a V5 diz "Confirmar existência real no catálogo", deve-se ler "Confirmar se devem ser incluídos no Inicial e em qual posição/sessão".

---

## 8. Inventário dos Códigos Novos

Consolidado a partir da V5 (seção 11), com correções da V5.1.

### 8.1 S76/SK76 — 38 códigos novos líquidos

| Código | Nome | Decisão V5.1 | Observação |
|---|---|---|---|
| `S76-CAB-01` | Cabine, comandos e instrumentos básicos | CRIAR NO CATÁLOGO | Sessão 01. Sem equivalente no catálogo `76-*` |
| `S76-CKL-01` | Execução do checklist normal por fase de voo | CRIAR NO CATÁLOGO | Reutilizado em múltiplas sessões como reforço |
| `S76-PNR-01` | Partida normal | CRIAR NO CATÁLOGO | Sessão 01 |
| `S76-INS-01` | Cheque de instrumentos e parâmetros após partida | CRIAR NO CATÁLOGO | Sessão 01. Adicionado pela V4.2 |
| `S76-TAX-01` | Taxi e deslocamento em solo/heliponto | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-DNR-01` | Decolagem normal | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-SUB-01` | Subida controlada visual | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-CRV-01` | Curvas padrão e controle de atitude | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-CIR-01` | Circuito de tráfego visual | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-APN-01` | Aproximação normal visual | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-ARN-01` | Arremetida normal | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-PNO-01` | Pouso normal | CRIAR NO CATÁLOGO | Sessões 01, 02, 05 |
| `S76-EST-01` | Estacionamento e corte de motores | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `S76-CTV-01` | Controle de velocidade em voo nivelado | CRIAR NO CATÁLOGO | Sessão 02 |
| `S76-DSC-01` | Descida controlada visual | CRIAR NO CATÁLOGO | Sessão 02 |
| `S76-REC-01` | Reentrada no circuito de tráfego | CRIAR NO CATÁLOGO | Sessão 02 |
| `S76-VCZ-01` | Pouso/decolagem com vento cruzado leve | CRIAR NO CATÁLOGO | Sessão 02. Se aplicável |
| `S76-SCN-01` | Varredura instrumental primária e secundária em IFR | CRIAR NO CATÁLOGO | Sessões 03, 05. Restrito a IFR (V4.1) |
| `S76-VMA-01` | Voo manual por instrumentos em condição normal | CRIAR NO CATÁLOGO | Sessão 03 |
| `S76-PWR-01` | Controle de potência, torque e limites em voo normal | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `S76-PED-01` | Controle de pedal e anti-torque em hover | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `S76-HVT-01` | Transição hover–decolagem e decolagem–subida | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `S76-STB-01` | Aproximação estabilizada visual com correção de rampa e velocidade | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `S76-GAR-01` | Arremetida por aproximação instável em VMC | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `S76-CKL-02` | Uso do ECL para anormalidade simples | CRIAR NO CATÁLOGO | Sessão 04 |
| `S76-APN-02` | Aproximação e pouso após anormalidade simples | CRIAR NO CATÁLOGO | Sessão 04 |
| `S76-IDF-01` | Identificação e diagnóstico de falha de motor | CRIAR NO CATÁLOGO | Sessão 05 |
| `S76-CKL-03` | Aplicação do ECL para falha de motor em cruzeiro | CRIAR NO CATÁLOGO | Sessão 05 |
| `S76-OEI-01` | Perfil OEI em cruzeiro | CRIAR NO CATÁLOGO | Sessão 05 |
| `S76-APX-02` | Aproximação planejada com um motor inoperante | CRIAR NO CATÁLOGO | Sessão 05 |
| `S76-CKL-04` | ECL para DECU e falha de motor na decolagem/aproximação | CRIAR NO CATÁLOGO | Sessão 06 |
| `S76-ENE-01` | Controle de energia/RPM em autorrotação | CRIAR NO CATÁLOGO | Sessão 08 |
| `S76-REC-02` | Recuperação de autorrotação | CRIAR NO CATÁLOGO | Sessão 08 |
| `S76-CKL-05` | Ações de memória e ECL para rotor/transmissão | CRIAR NO CATÁLOGO | Sessão 08 |
| `S76-CKL-06` | Ações de memória para fogo/fumaça | CRIAR NO CATÁLOGO | Sessão 09 |
| `S76-CKL-07` | Checklist e ECL específico para operação offshore | CRIAR NO CATÁLOGO | Sessão 10 |
| `S76-APO-01` | Aproximação offshore a Unidade Marítima | CRIAR NO CATÁLOGO | Sessão 10 |
| `S76-ARO-01` | Arremetida offshore | CRIAR NO CATÁLOGO | Sessão 10 |
| `S76-FLU-01` | Flutuabilidade e evacuação aquática | CRIAR NO CATÁLOGO | Sessão 10 |

### 8.2 Códigos removidos (não viram técnica)

| Código | Destino |
|---|---|
| `S76-COM-01` | NOTECHS / observação da sessão |
| `S76-BRF-01` | Briefing da sessão (fora das 18) |
| `S76-SEG-01` | Substituído por `S76-PWR-01` |

### 8.3 Códigos fundidos

| Código | Fundido em |
|---|---|
| `S76-ORI-01` | `S76-CGI-00` (Controle Geral IFR) na Sessão 03 |

### 8.4 AW139 — 36 códigos novos líquidos

| Código | Nome | Decisão V5.1 | Observação |
|---|---|---|---|
| `A139-CAB-01` | Cabine AW139 e power-up | CRIAR NO CATÁLOGO | Sessão 01 |
| `A139-CKL-01` | Normal checklist | CRIAR NO CATÁLOGO | Reutilizado em múltiplas sessões |
| `A139-CAS-01` | Leitura, priorização e reconhecimento básico de CAS | CRIAR NO CATÁLOGO | Sessão 01. Renomeado V4.1 |
| `A139-QRH-01` | Localização guiada de procedimento no QRH | CRIAR NO CATÁLOGO | Sessão 01. Renomeado V4.1 |
| `A139-AFC-01` | Engajamento, monitoramento e desconexão normal AFCS | CRIAR NO CATÁLOGO | Sessão 01. Renomeado V4.1 (era `A139-AFB-01`) |
| `A139-TAX-01` | Taxi/deslocamento em solo e heliponto | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `A139-PWR-01` | Controle normal de potência e parâmetros em voo visual | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `A139-FMA-01` | Monitoramento básico de FMA/modos em condição normal | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `A139-STB-01` | Aproximação visual estabilizada e critérios de arremetida | CRIAR NO CATÁLOGO | Sessão 01. Substituto V4.1 |
| `A139-ARN-01` | Arremetida normal | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `A139-EST-01` | Estacionamento e corte de motores | CRIAR NO CATÁLOGO | Sessões 01, 02 |
| `A139-SUB-01` | Subida e cruzeiro visual | CRIAR NO CATÁLOGO | Sessão 02 |
| `A139-CRV-01` | Curvas e controle de atitude/velocidade | CRIAR NO CATÁLOGO | Sessão 02 |
| `A139-DSC-01` | Descida controlada visual | CRIAR NO CATÁLOGO | Sessão 02 |
| `A139-VCZ-01` | Pouso/decolagem com vento cruzado leve | CRIAR NO CATÁLOGO | Sessão 02. Se aplicável |
| `A139-REC-02` | Reentrada no circuito | CRIAR NO CATÁLOGO | Sessão 02 |
| `A139-MOD-01` | Seleção e transição de modos AFCS em perfil visual | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `A139-FMA-02` | Monitoramento de FMA durante mudança de modo | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `A139-HLD-01` | Holding/espera visual ou vetoração básica | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `A139-STB-02` | Correção de perfil em aproximação visual estabilizada | CRIAR NO CATÁLOGO | Sessão 02. Substituto V4.1 |
| `A139-SCN-02` | Varredura de instrumentos IFR | CRIAR NO CATÁLOGO | Sessão 03 |
| `A139-VMA-01` | Voo manual por instrumentos | CRIAR NO CATÁLOGO | Sessões 03, 07 |
| `A139-ORI-01` | Orientação e correção de rumo por instrumentos | CRIAR NO CATÁLOGO | Sessão 03 |
| `A139-RNP-01` | Aproximação RNP básica | CRIAR NO CATÁLOGO | Sessão 03 |
| `A139-CKL-02` | Aplicação prática do QRH para CAS/caution | CRIAR NO CATÁLOGO | Sessão 04 |
| `A139-IDF-01` | Identificação de falha de motor | CRIAR NO CATÁLOGO | Sessões 05, 06 |
| `A139-CKL-03` | QRH para engine failure / EEC FAIL em cruzeiro | CRIAR NO CATÁLOGO | Sessão 05 |
| `A139-OEI-01` | Perfil OEI em cruzeiro | CRIAR NO CATÁLOGO | Sessão 05 |
| `A139-CKL-04` | QRH para CAT A/B e falha na decolagem/aproximação | CRIAR NO CATÁLOGO | Sessão 06 |
| `A139-CATB-01` | Rejected takeoff / decolagem rejeitada CAT A | CRIAR NO CATÁLOGO | Sessão 06 |
| `A139-CATB-02` | Continued takeoff com falha de motor CAT A | CRIAR NO CATÁLOGO | Sessão 06 |
| `A139-POU-01` | Pouso monomotor CAT A/B | CRIAR NO CATÁLOGO | Sessão 06 |
| `A139-ENE-01` | Controle de energia/RPM em autorrotação | CRIAR NO CATÁLOGO | Sessão 08 |
| `A139-REC-01` | Recuperação de autorrotação | CRIAR NO CATÁLOGO | Sessão 08 |
| `A139-CKL-05` | Ações de memória e QRH para rotor/transmissão | CRIAR NO CATÁLOGO | Sessão 08 |
| `A139-CKL-06` | Ações de memória para fogo/fumaça | CRIAR NO CATÁLOGO | Sessão 09 |

### 8.5 Códigos removidos AW139 (não viram técnica)

| Código | Destino |
|---|---|
| `A139-COM-01` | NOTECHS / observação da sessão |
| `A139-BRF-01` | Briefing da sessão (fora das 18) |
| `A139-DBR-01` | Debrief (fora das 18) |

### 8.6 Códigos renomeados AW139 (mantidos como técnica)

| Código V4 | Código V4.1/V5 | Observação |
|---|---|---|
| `A139-AFB-01` | `A139-AFC-01` | AFCS básico → engajamento/monitoramento/desconexão |

---

## 9. Critérios para Implementação Futura

A implementação só deve começar quando TODOS os critérios abaixo forem atendidos:

1. ✅ **V5 aprovada pelo instrutor/owner** — revisão operacional concluída.
2. ✅ **Todas as duplicidades resolvidas** — cada ficha tem 18 códigos distintos (ver seção 3).
3. ✅ **Substitutos validados** — instrutor concorda com os substitutos propostos para cada duplicidade.
4. ✅ **DECU corrigido** — classificação alterada para `REALOCAR` (ver seção 6).
5. ✅ **S76-VOR-00 / S76-LDP-00 corrigidos** — pendência reformulada (ver seção 7).
6. ✅ **LOFT vs LOFT Check diferenciado** — decisão de schema tomada (ver seção 4).
7. ✅ **Metadata futura definida** — curto prazo via `observacoes`, longo prazo via colunas (ver seção 5).
8. ✅ **Nenhum arquivo funcional alterado** — apenas documentos `.md` criados.

### Roteiro de implementação (após GO):

1. Dry-run de diff entre catálogo atual e V5.1 (sem escrita).
2. Script idempotente de INSERT/UPDATE em `modelos_sessao_manobras`, respeitando `UNIQUE(modelo_id, manobra_id)`.
3. Criação dos códigos novos no catálogo (`cadastro_manobras`) antes dos vínculos.
4. Soft-legacy para códigos que saem de uso (sem hard delete).
5. Validação visual das fichas em PDF antes de qualquer rollout.
6. Plano de rollback por desativação/soft-delete.
7. Nenhuma ação em produção até autorização explícita.

---

## 10. Confirmações

- ✅ Apenas o arquivo documental `COSTA_DO_SOL_MATRIZ_V5_1_CORRECOES_PRE_IMPLEMENTACAO_20260703.md` foi criado.
- ✅ Nenhuma implementação de código foi realizada.
- ✅ Nenhuma migration foi criada.
- ✅ Nenhum DML foi executado.
- ✅ Nenhum deploy foi realizado.
- ✅ Produção permaneceu intocada.
- ✅ Nenhum PR foi aberto.
- ✅ A V5 original (`COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md`) não foi alterada.
- ✅ V4, V4.1 e V4.2 permanecem preservadas.
- ✅ Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado.

---

## Resumo dos Bloqueios e Soluções

| Bloqueio | Status V5.1 | Solução |
|---|---|---|
| Duplicidades S76 (14 ocorrências) | Resolvido documentalmente | Substitutos distintos propostos na seção 3.1 |
| Duplicidades AW139 (10 ocorrências) | Resolvido documentalmente | Substitutos distintos propostos na seção 3.2 |
| LOFT vs LOFT Check indiferenciável | Resolvido documentalmente | Opção A (coluna `carater`) recomendada; Opção B (observações) como fallback |
| Campos estruturais futuros | Resolvido documentalmente | Curto prazo: `observacoes` com prefixos. Longo prazo: colunas novas |
| DECU mal classificado | Corrigido | `REAPROVEITAR_RENOMEANDO` → `REALOCAR` |
| S76-VOR-00 / S76-LDP-00 | Corrigido | Códigos existem. Pendência real: validar inclusão no Inicial |
