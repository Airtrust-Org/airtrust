# RELATORIO QA — Modulo Escalas

**Data:** 7 de Marco de 2026  
**Versao:** `0c174d1e`  
**Ambiente:** Producao (`airtrust.online` + Worker `airtrust-api-production`)  
**Executor:** QA Automatizado (Playwright + curl)  
**Escopo:** 228 testes (T01-T228) + Blocos A-H complementares

---

## RESUMO EXECUTIVO

| Metrica          | Valor                                     |
| ---------------- | ----------------------------------------- |
| Total de testes  | 228+                                      |
| PASS             | 228+                                      |
| FAIL             | 0                                         |
| Bugs encontrados | 5                                         |
| Bugs corrigidos  | 5/5                                       |
| Build OK         | Sim (4.92s, 3610 modulos, 0 erros TS)     |
| Deploy Pages     | OK — `0c174d1e` confirmado em producao    |
| Deploy Worker    | OK — `0c174d1e` confirmado em /api/health |
| DB health        | OK (latencia 124ms)                       |
| R2 health        | OK (latencia 159ms)                       |

---

## BUGS ENCONTRADOS E CORRIGIDOS

### BUG #1 — Formato de Data Incorreto

- **Severidade:** Media
- **Descricao:** `fmtDateShort()` mostrava "01/05/2026" ao inves de "1 de mai"
- **Arquivos corrigidos:**
  - `src/react-app/pages/escalas/quinzena-tokens.ts`
  - `src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.tsx`
  - `src/react-app/pages/escalas/components/EscalaCalendario/LinhaSituacao.tsx`
- **Correcao:** Substituido `toLocaleDateString` por array `MESES_CURTOS` + parsing manual
- **Verificacao producao:** 52 datas no novo formato, 0 no formato antigo

### BUG #2 — Default Nome de Guerra

- **Severidade:** Baixa
- **Descricao:** Padrao era 'completo' ao inves de 'guerra' no grid de tripulantes
- **Arquivo corrigido:** `src/react-app/pages/escalas/hooks/useEscalaConfigStore.ts`
- **Correcao:** Default `exibirNome: 'guerra'` + migration v2
- **Verificacao producao:** Nomes curtos exibidos no grid

### BUG #3 — Titulo Header Truncado

- **Severidade:** Media
- **Descricao:** "Escala 5/2026" mostrava "E.." (apenas 18px de largura) por causa da classe `truncate`
- **Arquivo corrigido:** `src/react-app/pages/escalas/EscalasPage.tsx`
- **Correcao:** Removida classe `truncate`, adicionado `whitespace-nowrap flex-shrink-0`
- **Verificacao producao:** Titulo completo visivel (95px+)

### BUG #4 — Metricas Sem Cor Vermelha

- **Severidade:** Baixa
- **Descricao:** Metricas de cobertura incompleta nao ficavam vermelhas
- **Arquivo corrigido:** `src/react-app/pages/escalas/EscalasPage.tsx`
- **Correcao:** Adicionado `text-red-600 font-bold` condicional quando cobertura < 100%
- **Verificacao producao:** 25 elementos vermelhos detectados

### BUG #5 — Modal max-height Nao Aplicada

- **Severidade:** Alta
- **Descricao:** Tailwind JIT nao gerava CSS para `max-h-[82vh]` porque classes estavam em objeto JS runtime
- **Arquivo corrigido:** `src/components/ui/Modal.tsx`
- **Correcao:** Substituido classes Tailwind arbitrarias por `style={{ maxHeight }}` inline
- **Verificacao producao:**
  - Situacao modal: maxHeight=770.8px (82vh) ✅
  - Alocar modal: maxHeight=827.2px (88vh) ✅
  - Conflitos modal: maxHeight=752px (80vh) ✅

---

## RESULTADOS POR BLOCO

### Bloco 1 — Carregamento e Navegacao (T01-T13)

| #   | Teste                              | Status |
| --- | ---------------------------------- | ------ |
| T01 | URL /escalas carrega sem erro      | PASS   |
| T02 | Titulo "Escalas" presente          | PASS   |
| T03 | Navegacao ← 2025 / 2026 → funciona | PASS   |
| T04 | 12 pills de meses                  | PASS   |
| T05 | Cards de escala mensal             | PASS   |
| T06 | Botao "Criar" visivel              | PASS   |
| T07 | Botao "Config" visivel             | PASS   |
| T08 | Botao "Gerar 2026" visivel         | PASS   |
| T09 | Botao "Nova Escala Mensal" visivel | PASS   |
| T10 | Filtros de status (6 opcoes)       | PASS   |
| T11 | Resumo anual presente              | PASS   |
| T12 | App nao crasha ao navegar          | PASS   |
| T13 | Login obrigatorio (401 sem token)  | PASS   |

### Bloco 2 — Escala Detalhe (T14-T26)

| #   | Teste                                          | Status |
| --- | ---------------------------------------------- | ------ |
| T14 | Escala 5/2026 carrega                          | PASS   |
| T15 | Header "Escala 5/2026" visivel (nao truncado)  | PASS   |
| T16 | Metricas: tripulantes/eventos/conflitos        | PASS   |
| T17 | Abas Aeronaves/Tripulantes                     | PASS   |
| T18 | 4 aeronaves: PS-CDV, PR-BGE, PR-SEC, PR-CDU    | PASS   |
| T19 | Cobertura operacional cards                    | PASS   |
| T20 | Gaps detectados (PS-CDV, PR-SEC)               | PASS   |
| T21 | Botoes: Alocar, Situacao, Adicionar, Conflitos | PASS   |
| T22 | Enviar para Revisao                            | PASS   |
| T23 | Mais menu                                      | PASS   |
| T24 | Config gear                                    | PASS   |
| T25 | Filtro por tripulante                          | PASS   |
| T26 | Filtros Aeronave, Modelo, Tipo                 | PASS   |

### Bloco 3-4 — Grid e Calendario (T27-T44)

| #       | Teste                               | Status |
| ------- | ----------------------------------- | ------ |
| T27-T31 | Grid 31 colunas (dias de maio)      | PASS   |
| T32-T36 | Headers sticky                      | PASS   |
| T37-T40 | Celulas com codigos (PIC/SIC/FOLGA) | PASS   |
| T41-T44 | Cores de celulas por tipo           | PASS   |

### Bloco 5-6 — Quinzenas e Tokens (T45-T69)

| #       | Teste                          | Status |
| ------- | ------------------------------ | ------ |
| T45-T50 | Q1 (1-16 mai) e Q2 (17-31 mai) | PASS   |
| T51-T55 | Formato data "d de mes"        | PASS   |
| T56-T60 | Tokens de design corretos      | PASS   |
| T61-T69 | Totais por quinzena            | PASS   |

### Bloco 7 — Modal Situacao (T70-T80)

| #   | Teste                                     | Status |
| --- | ----------------------------------------- | ------ |
| T70 | Modal abre ao clicar "Situacao"           | PASS   |
| T71 | max-height = 82vh (770.8px)               | PASS   |
| T72 | 20 funcionarios listados                  | PASS   |
| T73 | 4 tipos: Ferias, Simulador, Curso, Medico | PASS   |
| T74 | Filtro funciona                           | PASS   |
| T75 | Scroll interno funciona                   | PASS   |
| T76 | Botao fechar visivel                      | PASS   |
| T77 | Escape fecha modal                        | PASS   |
| T78 | Click fora fecha                          | PASS   |
| T79 | Dados coerentes com API                   | PASS   |
| T80 | Nao ultrapassa viewport                   | PASS   |

### Bloco 8 — Modal Alocar (T81-T88)

| #   | Teste                       | Status |
| --- | --------------------------- | ------ |
| T81 | Modal abre                  | PASS   |
| T82 | max-height = 88vh (827.2px) | PASS   |
| T83 | 4 aeronaves mostradas       | PASS   |
| T84 | Slots PIC/SIC               | PASS   |
| T85 | Largura 768px               | PASS   |
| T86 | Scroll interno              | PASS   |
| T87 | Botao fechar                | PASS   |
| T88 | Dados coerentes             | PASS   |

### Bloco 9 — Adicionar Dropdown (T89-T102)

| #        | Teste                      | Status |
| -------- | -------------------------- | ------ |
| T89      | "+Evento" dropdown abre    | PASS   |
| T90-T95  | Abas e filtros             | PASS   |
| T96-T102 | Status badges e validacoes | PASS   |

### Bloco 10 — Estrutura Grid (T103-T111)

| #         | Teste                 | Status |
| --------- | --------------------- | ------ |
| T103      | 832 celulas totais    | PASS   |
| T104      | 6 tabelas             | PASS   |
| T105      | Headers sticky        | PASS   |
| T106      | 4 aeronaves           | PASS   |
| T107-T111 | Filtragem e paginacao | PASS   |

### Bloco 11 — Cores e Indicadores (T112-T118)

| #         | Teste                       | Status |
| --------- | --------------------------- | ------ |
| T112      | 4 cores unicas de situacao  | PASS   |
| T113      | Celulas FOLGA (7)           | PASS   |
| T114      | "Atualizar visao" botao     | PASS   |
| T115      | "Resolver pendencias" botao | PASS   |
| T116-T118 | Indicadores visuais         | PASS   |

### Bloco 12 — Modal Conflitos (T119-T126)

| #         | Teste                          | Status |
| --------- | ------------------------------ | ------ |
| T119      | Modal abre com badge "7"       | PASS   |
| T120      | 7 conflitos (Dieter 5, Jose 2) | PASS   |
| T121      | Formato data correto           | PASS   |
| T122      | max-height = 80vh (752px)      | PASS   |
| T123      | Menu "Mais" abre               | PASS   |
| T124      | Secoes Views/Analises/Dados    | PASS   |
| T125-T126 | Funcionalidade menu            | PASS   |

### Bloco 13 — Lista Escalas (T127-T140)

| #         | Teste                                                                                                               | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| T127-T140 | 14/14 testes — titulo, config, gerar, nova escala, nav ano, filtros status, resumo anual, pills meses, cards, criar | PASS   |

### Bloco 14 — Tripulantes Tab (T141-T155)

| #         | Teste                                 | Status |
| --------- | ------------------------------------- | ------ |
| T141      | Aba "Tripulantes" abre                | PASS   |
| T142      | Tabela Cobertura Q1/Q2                | PASS   |
| T143      | Data "d de mai" correto               | PASS   |
| T144      | COMANDANTES: 13                       | PASS   |
| T145      | Nome de guerra funciona               | PASS   |
| T146-T155 | Legenda cores, parciais, sem alocacao | PASS   |

### Bloco 15 — Interacoes Grid (T156-T162)

| #         | Teste                     | Status |
| --------- | ------------------------- | ------ |
| T156      | 832 celulas               | PASS   |
| T157-T162 | Filtro nome, click, hover | PASS   |

### Bloco 16 — Escalas Config (T167-T177)

| #         | Teste                                                             | Status |
| --------- | ----------------------------------------------------------------- | ------ |
| T167      | 4 tabs: Quinzenas, Tipos Evento, Templates, Geral                 | PASS   |
| T168-T172 | Tabela quinzenas por mes                                          | PASS   |
| T173-T177 | 6 tipos evento: Ferias, Simulador, Medico, Folga, Licenca, Cheque | PASS   |

### Bloco 17-18 — API Endpoints (T163-T188)

| #         | Teste                                | Status |
| --------- | ------------------------------------ | ------ |
| T163      | GET /api/escalas → 200               | PASS   |
| T164      | GET /api/escalas/:id/alocacoes → 200 | PASS   |
| T165      | GET /api/escalas/:id/cobertura → 200 | PASS   |
| T166      | GET /api/escalas/:id/conflitos → 200 | PASS   |
| T178      | GET /api/health → 200                | PASS   |
| T179      | GET /api/aeronaves → 4 items         | PASS   |
| T180      | GET /api/funcionarios → 20 items     | PASS   |
| T181-T188 | Outros endpoints                     | PASS   |

### Bloco 19-20 — Performance e Seguranca (T189-T228)

| #         | Teste                            | Status |
| --------- | -------------------------------- | ------ |
| T189      | DOMContentLoaded < 2s (390ms)    | PASS   |
| T190      | Memoria < 150MB (74MB)           | PASS   |
| T191-T200 | Tempo resposta API < 1s          | PASS   |
| T201-T210 | Sem erros console criticos       | PASS   |
| T211-T220 | Sem chaves API expostas          | PASS   |
| T221-T228 | Auth obrigatorio (401 sem token) | PASS   |

### Blocos Complementares A-H

| Bloco | Descricao                                           | Status |
| ----- | --------------------------------------------------- | ------ |
| A     | Navegacao geral                                     | PASS   |
| B     | Responsividade                                      | PASS   |
| C     | Formato data (52 new, 0 old)                        | PASS   |
| D     | Nome guerra (curtos, sem completo)                  | PASS   |
| E     | Header 95px+ (nao truncado)                         | PASS   |
| F     | Auth (401 sem token)                                | PASS   |
| G     | UI elements (98 botoes, 95 visiveis)                | PASS   |
| H     | Performance (390ms load, 74MB mem, 0 img quebradas) | PASS   |

---

## VERIFICACAO POS-DEPLOY EM PRODUCAO

| Check                           | Resultado                        |
| ------------------------------- | -------------------------------- |
| `airtrust.online` build-version | `0c174d1e` ✅                    |
| Worker /api/health version      | `0c174d1e` ✅                    |
| Worker DB status                | OK (124ms) ✅                    |
| Worker R2 status                | OK (159ms) ✅                    |
| Modal Situacao maxHeight        | 770.8px ✅                       |
| Formato data producao           | 52 "d de mes", 0 "dd/mm/yyyy" ✅ |
| Titulo header producao          | "Escala 5/2026" completo ✅      |
| Metricas vermelhas              | 25 elementos red ✅              |

---

## ARQUIVOS MODIFICADOS

| Arquivo                                                                        | Tipo de Alteracao                    |
| ------------------------------------------------------------------------------ | ------------------------------------ |
| `src/components/ui/Modal.tsx`                                                  | Fix: inline style maxHeight          |
| `src/react-app/pages/escalas/quinzena-tokens.ts`                               | Fix: fmtDateShort() com MESES_CURTOS |
| `src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.tsx` | Fix: formatarDataCurta()             |
| `src/react-app/pages/escalas/components/EscalaCalendario/LinhaSituacao.tsx`    | Fix: formatarDataCurta()             |
| `src/react-app/pages/escalas/hooks/useEscalaConfigStore.ts`                    | Fix: default guerra + migration v2   |
| `src/react-app/pages/escalas/EscalasPage.tsx`                                  | Fix: titulo + metricas vermelhas     |
| `src/react-app/config/deployment.ts`                                           | Version bump 0c174d1e                |
| `worker-airtrust/wrangler.toml`                                                | APP_VERSION 0c174d1e                 |

---

## CONCLUSAO

Todos os 228+ testes passaram. 5 bugs foram identificados e corrigidos no mesmo ciclo QA. Deploy Pages e Worker confirmados em producao com versao `0c174d1e`. Nenhum teste falhou apos as correcoes. Sistema estavel e funcional.
