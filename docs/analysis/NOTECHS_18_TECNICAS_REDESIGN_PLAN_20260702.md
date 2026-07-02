# NOTECHS — Plano de Redistribuição das 18 Técnicas por Modelo

> **Data:** 2026-07-02
> **Status:** Plano preliminar — não aplicar no banco
> **Base:** `docs/analysis/NOTECHS_MODELOS_MANOBRAS_MATRIX_20260702.csv`

---

## 1. Resumo do Problema

- **Matriz atual:** 51 modelos × 22 manobras = 1122 relações
- **Novo padrão:** 18 técnicas + 15 NOTECHS fixos
- **NOTECHS:** fixo, transversal, não conta como técnica
- **CRM:** substituído por NOTECHS
- **Problemas pedagógicos conhecidos:**
  - Autorrotação precoce no SK76 inicial
  - OEI (One Engine Inoperative) precoce
  - Falhas duplas abrindo sessão
  - LOFT/check duplicado entre modelos
  - CRM disperso ou legado (já tratado)
  - Ausência aparente de fundamentos no SK76 inicial

---

## 2. Regras para Selecionar as 18 Técnicas

1. **Preservar manobras críticas** — segurança operacional primeiro
2. **Remover duplicidades** — manobra repetida em múltiplos modelos com mesma ordem
3. **Remover/substituir CRM por NOTECHS** — CRM legado sai, NOTECHS entra
4. **Mover itens avançados** para sessões mais adequadas (ex: emergências complexas → periódico avançado)
5. **Separar por tipo:**
   - Fundamentos (voo básico, normal, padrão)
   - Emergência (autorrotação, OEI, falhas)
   - IFR (instrumentos, procedimentos)
   - Offshore (específico de operação marítima)
   - LOFT/check (avaliação integrada)
6. **Não tratar helicóptero como avião** — SK76 ≠ AW139
7. **Manter rastreabilidade** por código interno (ex: `FLY-BAS-X1`)

---

## 3. Critérios de Prioridade

| Critério | Peso | Descrição |
|---|---|---|
| Segurança operacional | Crítico | Manobras de emergência, procedimentos anormais |
| Criticidade | Alto | Manobras com alta taxa de falha em check |
| Fase de aprendizagem | Alto | Inicial ≠ periódico ≠ avançado |
| Tipo de sessão | Alto | Inicial, periódico, LOFT, check, reaquisição |
| Experiência do aluno | Médio | Aluno novo vs experiente |
| Sequência pedagógica | Médio | Ordem lógica de aprendizado |
| Risco regulatório | Médio | Conformidade com RBAC/IS |
| Recorrência por ciclo | Baixo | Frequência de repetição |

---

## 4. Blocos por Frota

### SK76 (Sikorsky S-76)

| Bloco | Modelos | Característica |
|---|---|---|
| SK76 Inicial | I-01 a I-04 | Fundamentos, voo básico, primeiras emergências |
| S76 Periódico | P-01 a P-04 | Manutenção de proficiência |
| S76 Check/Reaquisição | C-01, R-01 | Avaliação, reaquisição |

### AW139 (AgustaWestland AW139)

| Bloco | Modelos | Característica |
|---|---|---|
| AW139 Inicial | I-01 a I-12 | Fundamentos, transição, offshore básico |
| AW139 Periódico | P-01 a P-04 | Manutenção, cenários |
| AW139 LOFT/Check | C-01 a C-04, L-01 a L-04 | Avaliação integrada, offshore avançado |
| AW139 Instrutor/Examinador | E-01, X-01 | Formação de instrutores |

---

## 5. Problemas Já Identificados

| Problema | Modelos afetados | Severidade |
|---|---|---|
| Autorrotação (CAU-FLO-73) na ordem 14 do SK76 inicial | SK76-I-01/02 | Alta — manobra complexa muito cedo |
| OEI (CAU-EFP-75) na ordem 16 do AW139 inicial | A139-I-01/12 | Alta — emergência complexa em inicial |
| Falhas duplas (CAU-2FP-74) na ordem 15 | A139-I-01/12 | Média — melhor em periódico |
| LOFT/check com 22 manobras duplicando modelos periódicos | AW139 C/L | Média — limpar duplicação |
| CRM (ordem 21-22) em 7 modelos | SK76/AW139 | Baixa — já substituído por NOTECHS |
| Ausência de fundamentos claros no SK76 inicial | SK76-I | Média — primeiras 5 ordens precisam revisão |
| WAR-LOW/WAR-HIG (ordem 6-7) muito cedo no AW139 inicial | A139-I-01/12 | Média — melhor após fundamentos |

---

## 6. Estratégia Proposta

1. **Manter 18 técnicas + 15 NOTECHS** como padrão para todos os modelos
2. **Não usar `slice(0,18)` como solução final** — é fallback técnico
3. **Criar nova versão dos modelos** (ex: `A139-I-01/12-v2`) com as 18 técnicas redefinidas
4. **Preservar fichas antigas** — versões anteriores imutáveis
5. **Validar com instrutor** cada modelo antes de versionar
6. **NÃO aplicar no banco** até validação completa

---

## 7. Tabela de Trabalho

Ver worksheet em:
- `docs/analysis/NOTECHS_18_TECNICAS_REDESIGN_WORKSHEET_20260702.csv`

Ações por manobra:
- **Manter** — permanece na mesma posição
- **Remover** — sai das 18 (ex: CRM, duplicata, avançado demais)
- **Mover** — vai para outro modelo ou posição
- **Substituir por NOTECHS** — CRM legado → NOTECHS
- **Validar instrutor** — precisa confirmação de especialista

---

## 8. Próximos Passos

1. Preencher worksheet com análise preliminar por modelo
2. Revisão com instrutor/operador para cada família (SK76, AW139)
3. Criar migration de novos modelos (versão v2)
4. Dry-run em staging
5. Validação visual com PDFs reais
6. Aprovação para produção

---

## 9. Ressalvas

- **Não é homologação ANAC** — validação regulatória externa necessária
- A matriz atual de 22 técnicas permanece como base histórica
- Nenhuma ficha existente será alterada
- O plano é preliminar e requer validação operacional
