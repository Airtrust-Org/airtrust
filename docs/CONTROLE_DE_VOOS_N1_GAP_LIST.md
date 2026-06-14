# Controle de Voos — Gap List N0 → N1

> **Tipo:** Análise comparativa protótipo vs. especificação MVP N1 — documento de planejamento interno
> **Data:** 2026-06-14
> **Versão:** v1.0 — documento interno; **NÃO submetido à ANAC**; **não é parecer regulatório**
> **Autor:** AirTrust Engineering
> **Base:** Protótipo N0 (`src/react-app/pages/controle-voos/`) vs. spec ([CONTROLE_DE_VOOS_N1_MVP_SPEC.md](CONTROLE_DE_VOOS_N1_MVP_SPEC.md))
>
> **AVISO LEGAL E DE ESCOPO**
> O AirTrust **não está homologado, certificado, aprovado ou autorizado** pela ANAC. Nenhum item desta gap list transforma o módulo em sistema regulado. **Não criar código, não alterar frontend/backend, não criar/aplicar migrations, não fazer deploy, não mexer em secrets, não fazer commit.** Este documento é apenas análise e planejamento.

---

## Índice

1. [Veredito executivo](#1-veredito-executivo)
2. [Inventário do protótipo atual](#2-inventário-do-protótipo-atual)
3. [Cobertura por tela](#3-cobertura-por-tela)
4. [Gap por requisito P0/P1/P2](#4-gap-por-requisito-p0p1p2)
5. [Gap de dados](#5-gap-de-dados)
6. [Gap de governança](#6-gap-de-governança)
7. [Gap de backend](#7-gap-de-backend)
8. [Gap de frontend](#8-gap-de-frontend)
9. [Gap de integrações](#9-gap-de-integrações)
10. [Riscos principais](#10-riscos-principais)
11. [Plano de evolução N0 → N1](#11-plano-de-evolução-n0--n1)
12. [Decisão final](#12-decisão-final)
13. [Próximo prompt recomendado](#13-próximo-prompt-recomendado)

---

## 1. Veredito executivo

### 1.1 Distância do MVP N1

**O protótipo está structuralmente perto, funcionalmente longe.**

A UI, navegação, layout e componentes visuais estão prontos e aproveitáveis. A estrutura de rotas, módulo gating, banner de governança e subnav já existem. O modelo de dados mock cobre ~80% das interfaces do modelo conceitual proposto na spec.

O que falta por inteiro: **backend real, persistência, RBAC por ação, `empresa_id`, integração leitura com Funcionários/Qualificações/FRMS, e correção de três campos que criam risco regulatório sério**.

| Dimensão | Estado atual | Para N1 |
|---|---|---|
| UI / layout | Pronto | Reaproveitar com ajustes pontuais |
| Modelo de dados (mock) | ~80% mapeado | Faltam `ciclos`, `empresa_id`, catálogo de motivos |
| Backend / persistência | **Zero** | Criar do zero |
| RBAC por ação | **Zero** | Criar do zero |
| Multi-tenant (`empresa_id`) | **Ausente** | Obrigatório em tudo |
| Integração Funcionários | **Zero** | Leitura obrigatória |
| Integração Qualificações/FRMS | **Zero** | Leitura informativa (alerta, não bloqueio) |
| Governança (banner N1) | Parcial (N0) | Atualizar quando real |
| Campos regulatórios perigosos | **Presentes** | Remover/rebaixar antes de qualquer dado real |

### 1.2 O que pode ser aproveitado

1. Todos os 10 componentes de página (layout, estrutura de seções)
2. `ControleVoosPageShell` + `ControleVoosPrototypeBanner` + `ControleVoosSubnav`
3. `ControleVoosStatusBadge` — bons estados visuais
4. `ControleVoosStatCards` — dashboard stat cards
5. `controleVoosUtils.ts` — formatadores de data/hora/horas/combustível
6. Toda a estrutura de roteamento em `App.tsx` (10 rotas wired)
7. `navigation.config.ts` — subnav com 8 itens
8. `module-access.ts` — gating por módulo
9. O modelo de dados mock como referência/seed para o schema real
10. O ciclo de estados `planejado → liberado → em_voo → pousado → concluido/cancelado`

### 1.3 O que é só demonstrativo

1. Todos os dados: voos, RDVs, tripulantes, aeronaves, indisponibilidades — são mock puro
2. As "Validações" no VooDetalhe — hardcoded (strings fixas, não calcula nada)
3. Estatísticas do Dashboard — calculadas sobre mock, data hardcoded `'2026-06-13'`
4. Alertas operacionais — mock, não derivados de nenhuma API real
5. Scores e status FRMS — mock, não do módulo FRMS real

### 1.4 Maior lacuna para N0 → N1

São três lacunas simultâneas e igualmente críticas:

1. **Governança (fazer primeiro):** remover/rebaixar `assinaturaCmdteNome`, "Assinatura e validação", "Assinar RDV", `enviadoMro`/`enviadoFrms` antes de qualquer dado real entrar. Se esses campos existirem com dados reais, o risco regulatório é imediato.

2. **Backend (segunda):** zero rotas em `worker-airtrust/src/routes/`; zero tabelas `cv_*`; zero `empresa_id` em qualquer interface.

3. **Funcionários real (terceira):** tripulantes são entidades mock completamente independentes. Em N1, a tripulação atribuída referencia `funcionario_id` de Funcionários reais. Sem isso, o módulo não tem dados de quem voa de verdade.

---

## 2. Inventário do protótipo atual

### 2.1 Rotas registradas

| Rota | Componente | Status |
|---|---|---|
| `/controle-voos` | `ControleVoosDashboard` | Existe, mock |
| `/controle-voos/voos` | `ControleVoosVoos` | Existe, mock |
| `/controle-voos/voos/:id` | `ControleVoosVooDetalhe` | Existe, mock |
| `/controle-voos/rdv` | `ControleVoosRdv` | Existe, mock |
| `/controle-voos/rdv/:id` | `ControleVoosRdvDetalhe` | Existe, mock |
| `/controle-voos/jornadas` | `ControleVoosJornadas` | Existe, mock |
| `/controle-voos/indisponibilidades` | `ControleVoosIndisponibilidades` | Existe, mock |
| `/controle-voos/hangaragem` | `ControleVoosHangaragem` | Existe, mock |
| `/controle-voos/relatorios` | `ControleVoosRelatorios` | Existe, mock |
| `/controle-voos/tabelas` | `ControleVoosTabelas` | Existe, mock |

Todas as rotas já estão em `App.tsx` com `lazyWithRetry()` e atrás de `<ProtectedRoute>`.

### 2.2 Componentes existentes

| Componente | Função | Aproveitável |
|---|---|---|
| `ControleVoosPageShell` | Wrapper com banner + subnav | Sim |
| `ControleVoosPageHeader` | Cabeçalho com título/descrição/slot de ações | Sim |
| `ControleVoosBreadcrumb` | Breadcrumb de navegação | Sim |
| `ControleVoosPrototypeBanner` | Banner de governança (N0) | Sim — atualizar para N1 |
| `ControleVoosStatCards` | Cards de estatística para dashboard | Sim |
| `ControleVoosStatusBadge` | Badge colorida por status | Sim |
| `ControleVoosSubnav` | Navegação interna do módulo | Sim |

### 2.3 Dados mockados existentes

| Interface/Constante | Registros | Campos-chave |
|---|---|---|
| `Aeroporto` / `MOCK_AEROPORTOS` | 12 (9 aero + 3 plataformas) | codigoIcao, codigoIata, nome, cidade, uf, tipo |
| `TipoVoo` / `MOCK_TIPOS_VOO` | 6 | nome, descrição |
| `NaturezaVoo` / `MOCK_NATUREZAS_VOO` | 4 | nome, descrição |
| `GrupoIndisponibilidade` / `MOCK_GRUPOS` | 6 | nome |
| `CausaIndisponibilidade` / `MOCK_CAUSAS` | 9 | nome, grupoId |
| `AeronaveOperacional` / `MOCK_AERONAVES` | 5 | matricula, modelo, status, base |
| `Tripulante` / `MOCK_TRIPULANTES` | 8 | nome, matricula, funcao, qualificacaoModelo, cmaValidade, asoValidade, frmsScore, frmsStatus, horasMes |
| `Voo` / `MOCK_VOOS` | 10 (2 datas) | prefixo, origemId, destinoId, naturezaId, tipoId, aeronaveId, horários previstos/reais, status, observações |
| `TripulacaoVoo` / `MOCK_TRIPULACAO_VOO` | 12 | vooId, tripulanteId, funcao, horarioApresentacao, horarioDispensa |
| `Rdv` / `MOCK_RDVS` | 6 | numero, vooId, decolagem/pouso, horas, pousos, combustível, status, assinaturaCmdteNome*, enviadoMro*, enviadoFrms* |
| `Jornada` / `MOCK_JORNADAS` | 6 | tripulanteId, vooId, horários, horasJornada, horasVoo, frmsScore, status |
| `Indisponibilidade` / `MOCK_INDISPONIBILIDADES` | 3 | aeronaveId, causaId, grupoId, datas, status, osMroVinculada, voosImpactados |
| `Hangaragem` / `MOCK_HANGARAGENS` | 2 | aeronaveId, dataEntrada, dataSaida, motivo, osMroVinculada |
| `CancelamentoAtraso` / `MOCK_CANCELAMENTOS_ATRASOS` | 2 | vooId, tipo, motivo (texto livre), tempoAtrasoMinutos |
| `AlertaOperacional` / `MOCK_ALERTAS` | 5 | tipo, mensagem, gravidade, entidadeId, entidadeTipo |
| `RelatorioCard` / `MOCK_RELATORIOS` | 8 (5 MVP + 3 Fase 2) | titulo, descricao, icone, fase |
| `TabelaAuxiliar` / `MOCK_TABELAS_AUXILIARES` | 8 (6 MVP + 2 Fase 2) | nome, descricao, fase, registros |

*Campos marcados com asterisco (`*`) são perigosos para dados reais — ver §6.

### 2.4 Ações existentes / habilitadas no protótipo

**Habilitadas (somente leitura):**
- Navegar entre telas via subnav
- Clicar em voo na lista → abre detalhe
- Clicar em RDV na lista → abre detalhe
- Ver link RDV no detalhe do voo
- Ver voos impactados na indisponibilidade (links funcionando)

**Desabilitadas (botões `disabled`):**
- `+ Novo Voo` (Voos)
- `+ Novo RDV` (RDV lista)
- `Liberar Voo` / `Cancelar Voo` / `Alterar Tripulação` / `Atualizar Status` (VooDetalhe)
- `Assinar RDV` / `Validar RDV` / `Cancelar RDV` / `Exportar PDF` (RDVDetalhe)
- `+ Nova` indisponibilidade
- `+ Nova Hangaragem`
- `Gerar relatório` (todos os 8 relatórios)
- `Ver` tabela auxiliar (expandida)

---

## 3. Cobertura por tela

> Classificações: **Aproveitável** = estrutura/layout reutilizável; **Ajuste** = conteúdo/labels a corrigir; **Backend** = precisa persistência real; **Remoção** = campo/seção de risco regulatório; **Fora MVP** = não entrar no N1.

### Tela A — Dashboard OCC (`ControleVoosDashboard.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de stat cards | Aproveitável | Layout e componente ótimos |
| Cálculo de stats (programados, em voo, etc.) | Backend | Hoje derivado de mock fixo; precisa query real |
| Data hardcoded `'2026-06-13'` | **Ajuste urgente** | Deve ser dinâmica (seletor de data ou "hoje") |
| Descrição "13 de junho de 2026" | **Ajuste urgente** | Hardcoded; deve ser derivada da data selecionada |
| Alertas operacionais (`MOCK_ALERTAS`) | Backend | Precisa derivar de dados reais (FRMS, Qualif.) |
| Timeline por aeronave | Backend | Precisa dados reais de aeronaves e voos do dia |
| Links rápidos (4 cards) | Aproveitável | Navegação, sem dado; OK |
| "Ações recomendadas" (4 cards) | Backend | Contagens derivadas de mock; precisa ser real |

**Maior gap:** data hardcoded torna o dashboard sempre desatualizado para qualquer usuário real.

### Tela B — Lista de Voos (`ControleVoosVoos.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de tabela | Aproveitável | Layout, colunas, hover states OK |
| Dados da tabela (10 voos mock) | Backend | Precisa substituir por query real |
| Botão `+ Novo Voo` (disabled) | Backend | Habilitar no N1 com formulário real |
| Coluna "Real" (horário real partida) | Aproveitável | Campo existe na interface |
| Coluna "Tripulação" (summary PIC +N) | Backend | Precisa join com tripulação real |
| Filtros | **Falta** | Não existe UI de filtro; P1-spec prevê filtros por período/status/aeronave |
| Paginação | **Falta** | Não há paginação; OK para demo, necessário com dados reais |
| Link "Abrir" → detalhe | Aproveitável | Roteamento funciona |
| Rodapé "dados demonstrativos" | Ajuste | Remover quando real; substituir por contagem de registros |

### Tela C — Detalhe do Voo (`ControleVoosVooDetalhe.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Seção "Dados gerais" (prefixo, aeronave, O/D, tipo, natureza, horários) | Aproveitável | Layout OK; dados viram reais |
| Seção "Status do voo" (timeline visual) | Aproveitável | Visual correto; lógica precisa refletir estado real |
| Seção "Tripulação" (lista por funcao + badge FRMS) | Backend | Precisa tripulação real (funcionários); badges de FRMS precisam de API real |
| Seção "Validações" (hardcoded) | **Remoção / refactor** | Hoje são strings fixas. Deve derivar de Qualificações/FRMS reais (P1-1). No N1, exibe alertas informativos reais ou "sem dados" |
| Seção "RDV" (link) | Aproveitável | Navegação OK; dado vira real |
| Botão `Liberar Voo` | Backend | Habilitar no N1 como transição de status real |
| Botão `Cancelar Voo` | Backend | Habilitar no N1 |
| Botão `Alterar Tripulação` | Backend | Habilitar no N1 |
| Botão `Atualizar Status` | Backend | Habilitar no N1 (genérico → fluxo de estado) |
| "Conflito de Escala" nas validações | **Fora MVP** | P2-1; não existe no N1 sem integração Escalas |

### Tela D — Lista de RDVs (`ControleVoosRdv.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de tabela | Aproveitável | Layout OK |
| Dados (6 RDVs mock) | Backend | Precisa query real |
| Coluna **"Comandante"** (= `assinaturaCmdteNome`) | **Remoção** | Termo "Comandante" ligado a assinatura → regulatório. Remover ou renomear para "Resp. preenchimento" |
| Botão `+ Novo RDV` (disabled) | Backend | Habilitar no N1 (criação via voo concluído/pousado) |
| Filtros | **Falta** | Não existe UI de filtro |

### Tela E — Detalhe do RDV (`ControleVoosRdvDetalhe.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Seção "Dados do voo" (planejados) | Aproveitável | Derivado do voo vinculado; OK |
| Seção "Dados realizados" (decolagem/pouso, horas, pousos) | Backend | OK quando real; falta campo **`ciclos`** |
| Seção "Combustível" | Aproveitável | OK quando real |
| Seção "Ocorrências e divergências" | Aproveitável | Texto livre; OK |
| Seção "Tripulação no voo" | Aproveitável | OK quando real |
| Seção **"Assinatura e validação"** (Comandante, Assinatura em, Validação) | **Remoção imediata** | Maior risco de confusão regulatória. Título "Assinatura e validação" + campo "Comandante" implica assinatura oficial. Deve ser completamente removida ou reduzida a "Resp. pelo preenchimento" sem data/timestamp de "assinatura" |
| Seção **"Integração"** (Envio ao MRO, Envio ao FRMS) | **Remoção / rebaixamento** | `enviadoMro` implica integração com MRO (protótipo). `enviadoFrms` implica sync FRMS. No N1, ambos devem ser removidos ou rebaixados a flags operacionais internos sem promessa de sincronização |
| Botão **`Assinar RDV`** (disabled) | **Remoção** | Mesmo disabled, o label "Assinar RDV" implica assinatura com valor jurídico. Substituir por "Finalizar RDV (operacional)" |
| Botão `Validar RDV` (disabled) | Ajuste | Pode virar "Revisar RDV" ou "Marcar como conferido" sem implicação regulatória |
| Botão `Cancelar RDV` (disabled) | Backend | OK no N1 |
| Botão **`Exportar PDF`** (disabled) | Backend/Ajuste | No N1, habilitar com rodapé "Uso operacional interno — não fiscal". Remover qualquer referência a "assinatura" ou "RDV oficial" no template |

**Esta tela é a maior concentração de risco regulatório do protótipo.**

### Tela F — Jornadas (`ControleVoosJornadas.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de tabela | Aproveitável | Colunas corretas para visão FRMS |
| Dados (jornadas mock por tripulante) | Backend | Precisa leitura do FRMS real |
| Score FRMS e badge de status | Aproveitável | Lógica de cor OK; valor vira real |
| Legenda OK/Atenção/Bloqueado | Aproveitável | Texto não implica nada regulatório |
| "Horas mês" (`t.horasMes`) | Backend | Deve vir de FRMS real, não de campo no tripulante |
| Data no cabeçalho hardcoded | **Ajuste** | "13 de junho de 2026" hardcoded |
| `Tripulante.horasMes` no mock | **Alerta de design** | Em N1, horas do mês vêm do FRMS real, não ficam no cadastro do tripulante |

### Tela G — Indisponibilidades (`ControleVoosIndisponibilidades.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de cards | Aproveitável | Layout OK |
| Dados (3 indisponibilidades mock) | Backend | Precisa persistência real |
| Causa / grupo / datas / status | Aproveitável | Campos existem no modelo |
| Campo "OS MRO" (texto livre) | Aproveitável | Já é texto/referência, não integração real — OK conforme spec |
| Voos impactados com links | Aproveitável | Bom UX; precisa ser real |
| Botão `+ Nova` (disabled) | Backend | Habilitar no N1 |
| Filtros | **Falta** | Spec prevê filtro por aeronave/grupo/status/período |

### Tela H — Hangaragem (`ControleVoosHangaragem.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Estrutura de cards | Aproveitável | Layout OK |
| Dados (2 hangaragens mock) | Backend | Precisa persistência real |
| OS MRO como texto | Aproveitável | OK — referência textual, sem integração |
| Botão `+ Nova Hangaragem` (disabled) | Backend | Habilitar no N1 |
| Cabeçalho diz "Fase 2" | **Ajuste** | A spec colocou hangaragem como P1 (dentro do MVP). Remover "Fase 2" do header |
| Rodapé diz "— Fase 2" | **Ajuste** | Idem acima |

### Tela I — Relatórios (`ControleVoosRelatorios.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Cards de relatórios | Aproveitável | Layout e ícones OK |
| 5 relatórios marcados `MVP` | Backend | Habilitar no N1 com dados reais + rodapé "não fiscal" |
| `rel-007` Export APUS/Sigvoos | Fora MVP | F10 — explicitamente fora; manter como "Fase 2" |
| `rel-008` Jornadas/RBAC 117 | **Ajuste label** | "RBAC 117" implica conformidade regulatória. Rebaixar para "Jornadas por tripulante" sem mencionar RBAC 117 diretamente |
| Botão "Gerar relatório (protótipo)" | Backend/Ajuste | Remover "(protótipo)" quando real; adicionar rodapé "não fiscal" |
| Ausência de rodapé "não fiscal" | **Falta** | Spec exige "Uso operacional interno — não fiscal" em toda exportação |

### Tela J — Tabelas Auxiliares (`ControleVoosTabelas.tsx`)

| Elemento | Classificação | Observação |
|---|---|---|
| Cards de tabelas (6 MVP + 2 Fase 2) | Aproveitável | Alinhado com spec |
| Amostra aeroportos (tabela completa) | Aproveitável | Layout OK; dados viram reais por tenant |
| Tipos de voo + Naturezas | Aproveitável | OK |
| Causas + Grupos de indisponibilidade | Aproveitável | OK |
| `tab-006` Motivos de Atraso/Cancelamento | **Falta interface** | Card existe, diz "8 registros" mas **não existe `MOCK_MOTIVOS_CANCELAMENTO`** nem interface `MotivoAtraso`. `CancelamentoAtraso.motivo` é texto livre — sem catálogo real |
| Botão "Ver" (disabled) | Backend | Habilitar no N1 com CRUD por admin |
| `tab-007` Terceirizados | Fora MVP | P2-5; manter "Fase 2" |
| `tab-008` Feriados/HOTRAM | Fora MVP | P2-5; manter "Fase 2" |

---

## 4. Gap por requisito P0/P1/P2

> Esforço estimado: P = Pequeno (<1 dia), M = Médio (2-5 dias), G = Grande (>5 dias), XG = Muito grande (>10 dias)

### Requisitos P0 — essencial para o MVP existir

| Requisito | Estado atual | Gap | Risco se não resolver | Esforço |
|---|---|---|---|---|
| **P0-1** CRUD de voos persistido, multi-tenant | Zero — mock puro | Backend + schema + endpoints criação/edição + formulário frontend | BLOQUEADOR do MVP | XG |
| **P0-2** Atribuição de aeronave (status real) | Visual, sem estado real | Backend aeronaves + status real + bloquear indisp. | Sem dado real, inutilizável | G |
| **P0-3** Atribuição de tripulação referenciando Funcionários | Mock independente | JOIN com Funcionários reais via `funcionario_id`; busca/seleção no frontend | Sem dados reais de quem voa | G |
| **P0-4** Transições de status + horários reais (validação sequência) | Visual hardcoded | State machine no backend; botões habilitados; validação chegada ≥ partida | Sem operação real | M |
| **P0-5** RDV operacional criar/editar/finalizar | Visual, todos disabled | Backend + formulário real; status `rascunho/finalizado/cancelado` | Sem RDV real | G |
| **P0-6** Dashboard OCC diário com dados reais | Mock + data hardcoded | Data dinâmica; queries reais; alertas derivados | Dashboard sempre errado | M |
| **P0-7** Banner N1 + rodapé "não fiscal" | Banner N0 (protótipo) | Atualizar `modules.ts` quando real; rodapé em exportações | Confusão de nível | P |
| **P0-8** RBAC e isolamento por tenant | Zero — sem backend | `empresa_id` em toda query; roles por ação; testes de isolamento | VAZAMENTO DE DADOS | XG |

### Requisitos P1 — alto valor, logo após o núcleo

| Requisito | Estado atual | Gap | Risco se não resolver | Esforço |
|---|---|---|---|---|
| **P1-1** Validação informativa de tripulação (Qualif./CMA/ASO/FRMS) | Hardcoded ("✅ Tripulantes aptos", "⚠️ 1 vence em 7 dias") | Integração leitura Qualificações + FRMS reais; substituir strings fixas por dados reais | Alertas falsos / inúteis | G |
| **P1-2** Indisponibilidades e hangaragem persistidas | Mock; botões disabled | Backend + formulário criação/encerramento | Sem visibilidade real de frota | M |
| **P1-3** Motivos de atraso/cancelamento (catálogo + registro) | `CancelamentoAtraso.motivo` texto livre; **sem catálogo real** | Criar interface `MotivoAtraso`; catálogo editável por admin; vinculação ao voo | Relatórios de cancelamento sem estrutura | M |
| **P1-4** Relatórios internos MVP (5 relatórios) | Todos disabled | Backend de queries agregadas; frontend com filtros e geração | Sem consolidação operacional | G |
| **P1-5** Export simples CSV/PDF "não fiscal" | Disabled | Gerador de export com rodapé obrigatório "Uso operacional interno — não fiscal" | Relatórios usados sem aviso | M |
| **P1-6** Catálogos auxiliares MVP editáveis por admin | Todos disabled (só leitura mock) | Backend CRUD por catálogo (aeroportos, tipos, naturezas, causas, grupos, motivos) | Catálogos hardcoded por operador | M |
| **P1-7** Trilha operacional de eventos de status | Ausente (sem modelo) | Tabela `cv_voo_eventos`; registro de cada transição com usuário + timestamp | Sem rastreabilidade operacional | P |

### Requisitos P2 — desejável, pode esperar

| Requisito | Estado atual | Gap | Risco se não resolver | Esforço |
|---|---|---|---|---|
| **P2-1** Conciliação com Escalas/EVD | Ausente (card "Conflito de Escala" hardcoded) | Integração leitura EVD/Escalas; detecção de conflito | Sem sem cruzamento com escala | G |
| **P2-2** Trechos/pernas múltiplas por voo | Ausente no modelo | Tabela `cv_voo_pernas`; default 1 perna por voo | Limitação para futuro eDB | M |
| **P2-3** Visão FRMS embutida mais rica | Dados mock ok, mas sem link para o FRMS real | Link "Abrir no FRMS" + dados expandidos de jornada | Jornadas sem contexto completo | P |
| **P2-4** Filtros avançados e dashboards adicionais | Ausente em todas as listas | UI de filtros por período/aeronave/status; paginação | Listas inutilizáveis com volume real | M |
| **P2-5** Catálogos Fase 2 (Terceirizados, Feriados) | Marcados "Fase 2" | Manter como Fase 2 explicitamente | — | — |

---

## 5. Gap de dados

### 5.1 Mapeamento mock → schema conceitual `cv_*`

| Interface mock | Tabela conceitual | Falta | Risco |
|---|---|---|---|
| `Voo` | `cv_voos` | `empresa_id`, `created_by`, `updated_at` | **Sem tenant** |
| `TripulacaoVoo` | `cv_voo_tripulacao` | `empresa_id`, `funcionario_id` real (hoje `tripulanteId` é chave mock) | Tripulante não é Funcionário real |
| `Rdv` | `cv_rdv` | `empresa_id`, **`ciclos`** (ausente), `responsavel_preenchimento_id` (substituto de assinatura) | Ciclos p/ MRO/eDB |
| `Jornada` | Via leitura FRMS | Todo campo é duplicação do FRMS — não deve existir em `cv_*`; deve ser leitura direta | Duplicação de fonte de verdade |
| `AeronaveOperacional` | `cv_aeronaves` ou reusar cadastro | `empresa_id`, vinculação ao cadastro existente de aeronaves | Status aeronave duplicado? |
| `Indisponibilidade` | `cv_indisponibilidades` | `empresa_id`, `encerrado_por_id` | Sem tenant |
| `Hangaragem` | `cv_hangaragem` | `empresa_id`, `encerrado_por_id` | Sem tenant |
| `CancelamentoAtraso` | `cv_voo_ocorrencias` | `empresa_id`, `motivo_id` (FK para catálogo) — hoje `motivo` é texto livre | Sem catálogo estruturado |
| `AlertaOperacional` | Sem tabela — derivado | Deve ser view/query real, não tabela de alertas estática | Mock engana sobre o que é alerta |
| `RelatorioCard` | Sem tabela — queries | Relatórios = queries sobre `cv_*`; os cards de UI ficam, a geração é backend | OK |
| `TabelaAuxiliar` | Cards de UI + tabelas reais | `cv_aeroportos`, `cv_tipos_voo`, `cv_naturezas_voo`, `cv_grupos_indisp`, `cv_causas_indisp`, `cv_motivos` | Catálogos precisam ter `empresa_id` ou ser globais |

### 5.2 Campos que podem virar schema real

| Campo | Interface | Para schema real | Observação |
|---|---|---|---|
| `prefixo` | `Voo` | `prefixo VARCHAR NOT NULL` | OK |
| `origemId` / `destinoId` | `Voo` | `origem_id` / `destino_id` FK → `cv_aeroportos` | OK |
| `naturezaId` / `tipoId` | `Voo` | FK → `cv_naturezas_voo` / `cv_tipos_voo` | OK |
| `aeronaveId` | `Voo` | FK → aeronave real (a definir) | Verificar se aeronaves já têm tabela |
| `horarioPrevisto` / `horarioChegadaPrevisto` | `Voo` | `horario_previsto_partida DATETIME` / `horario_previsto_chegada DATETIME` | OK |
| `horarioRealPartida` / `horarioRealChegada` | `Voo` | `horario_real_partida DATETIME NULL` / `horario_real_chegada DATETIME NULL` | OK |
| `dataProgramacao` | `Voo` | `data_programacao DATE NOT NULL` | OK |
| `status` | `Voo` | `status TEXT CHECK(status IN ('planejado','liberado','em_voo','pousado','concluido','cancelado'))` | OK |
| `observacoes` | `Voo` | `observacoes TEXT` | OK |
| `horarioApresentacao` / `horarioDispensa` | `TripulacaoVoo` | OK como DATETIME | OK |
| `funcao` | `TripulacaoVoo` | `funcao TEXT CHECK(funcao IN ('PIC','SIC','COM','MEC'))` | OK |
| `numero` | `Rdv` | `numero VARCHAR UNIQUE por (empresa_id, ano)` | OK |
| `horasVoadas` / `numeroPousos` | `Rdv` | `horas_voadas REAL NULL` / `numero_pousos INTEGER NULL` | OK |
| `combustivelDecolagem/Pouso/Consumo` | `Rdv` | `combustivel_decolagem_kg REAL NULL` etc. | OK |
| `ocorrencias` / `divergencias` | `Rdv` | `ocorrencias TEXT` / `divergencias TEXT` | OK |
| `dataInicio` / `dataFimPrevista` / `dataFimReal` | `Indisponibilidade` | OK como DATETIME | OK |
| `osMroVinculada` | `Indisponibilidade` / `Hangaragem` | `os_mro_ref TEXT NULL` — referência textual | OK conforme spec |
| `voosImpactados` | `Indisponibilidade` | `cv_indisp_voos` tabela de associação N:N | OK |

### 5.3 Campos que precisam renomear

| Campo atual | Nome proposto | Razão |
|---|---|---|
| `tripulanteId` | `funcionario_id` | Em N1, é FK para Funcionários reais |
| `horarioPrevisto` | `horario_previsto_partida` | Clareza (há também chegada prevista) |
| `horarioChegadaPrevisto` | `horario_previsto_chegada` | Consistência |
| `codigoIcao` / `codigoIata` | `codigo_icao` / `codigo_iata` | snake_case DB |
| `assinaturaCmdteNome` | `responsavel_preenchimento_nome` ou **remover** | Ver §5.4 |
| `assinaturaData` | **Remover** | Ver §5.4 |
| `validadoPorNome` | `conferido_por_nome` ou **remover** | Ver §5.4 |
| `enviadoMro` | `os_mro_notificado` (bool interno) ou **remover** | Ver §5.4 |
| `enviadoFrms` | **Remover** | Ver §5.4 |
| `horasMes` em `Tripulante` | Não persiste — leitura FRMS | Não deve existir no schema `cv_*` |

### 5.4 Campos perigosos — risco regulatório

| Campo | Localização | Risco | Ação recomendada |
|---|---|---|---|
| `assinaturaCmdteNome` | `Rdv.assinaturaCmdteNome` | Nome "assinatura" implica ato com valor jurídico. Em N1 não há assinatura digital regulatória | Renomear para `responsavel_preenchimento_nome` com aviso explícito "Sem valor jurídico. Para uso operacional interno." |
| `assinaturaData` | `Rdv.assinaturaData` | "Data de assinatura" implica timestamp regulatório | Remover — sem data de "assinatura" em N1 |
| `validadoPorNome` | `Rdv.validadoPorNome` | "Validado por" + nome completo pode ser confundido com validação legal | Rebaixar para `conferido_por_nome` com tooltip "Conferência operacional interna, sem valor de validação regulatória" |
| `enviadoMro` | `Rdv.enviadoMro` | Implica integração real com MRO (protótipo). Dado verdadeiro (true) pode enganar usuário | Remover. MRO não integrado no N1 |
| `enviadoFrms` | `Rdv.enviadoFrms` | Implica sync com FRMS — em N1, FRMS é leitura só. RDV não "envia" para FRMS | Remover |
| Seção "Assinatura e validação" (UI) | `ControleVoosRdvDetalhe.tsx` | Título da seção + conteúdo (Comandante, Assinatura em, Validação) — toda a seção implica assinatura oficial | Remover a seção inteira ou substituir por "Responsável operacional (não regulatório)" |
| Coluna "Comandante" na lista RDV | `ControleVoosRdv.tsx` | Coluna chamada "Comandante" exibe `assinaturaCmdteNome` | Renomear coluna para "Resp. preenchimento" ou remover |
| Botão "Assinar RDV" | `ControleVoosRdvDetalhe.tsx` | Mesmo disabled, implica ação de assinatura com valor regulatório | Substituir por "Finalizar RDV" |
| Legenda "RBAC 117" em relatórios | `MOCK_RELATORIOS[7]` | "Relatório de jornadas, limites e alertas por tripulante" está correto mas associado a "Jornadas / RBAC 117" implica conformidade com RBAC 117 | Renomear para "Jornadas por tripulante" |

### 5.5 Campos faltantes no modelo atual

| Campo faltante | Onde vai | Por quê necessário |
|---|---|---|
| `ciclos` | `cv_rdv` | Necessário para feeder de MRO/eDB; previsto na spec (nota §6 da spec) |
| `empresa_id` | Todas as tabelas | Multi-tenant obrigatório |
| `created_by` / `updated_by` | `cv_voos`, `cv_rdv` | Auditoria operacional simples (NF-3) |
| `created_at` / `updated_at` | Todas as tabelas | Rastreabilidade operacional |
| `cv_voo_eventos` (toda a entidade) | Nova tabela | Trilha de transições de status (P1-7) |
| `motivo_id` | `cv_voo_ocorrencias` | FK para catálogo de motivos (hoje texto livre) |
| `cv_motivos` (catálogo) | Nova tabela | Catálogo estruturado de motivos de atraso/cancelamento |
| `funcionario_id` (em tripulação) | `cv_voo_tripulacao` | FK real para Funcionários |

### 5.6 Campos exagerados para MVP (deixar para depois)

| Campo/Entidade | Razão para adiar |
|---|---|
| `Jornada` como entidade própria em `cv_*` | Jornada = leitura FRMS; não duplicar |
| `Tripulante.horasMes` como campo persisto | Vem do FRMS, não deve ser armazenado aqui |
| `cv_voo_pernas` (trechos múltiplos) | P2-2; default 1 perna no MVP |
| `TabelaAuxiliar.registros` como campo | Era contagem mock; no real é `COUNT(*)` |

---

## 6. Gap de governança

### 6.1 O que precisa mudar para N1

| Item | Estado atual | Ação para N1 |
|---|---|---|
| `modules.ts` — `isPrototype: true` | Módulo marcado como protótipo | Mudar para `isPrototype: false`, `maturityLevel: 'N1'` quando backend real existir. **Não antes.** |
| `modules.ts` — `evidenceLevel` | Nível N0 | Atualizar para N1 quando real |
| Banner (`ControleVoosPrototypeBanner`) | "Dados demonstrativos. Não utilizar como registro oficial..." | Para N1: "Sistema operacional interno. Dados reais. **Não regulado, não homologado pela ANAC.** Uso exclusivo para organização interna da operação — não substitui Diário de Bordo, RDV oficial, eDB, despacho ou qualquer documento oficial." |
| Rodapé de export | Ausente | Todo CSV/PDF deve ter rodapé: "Uso operacional interno — não fiscal. Não é evidência oficial, registro regulado, DB ou eDB. Gerado pelo AirTrust (sistema não autorizado pela ANAC)." |
| Telas mistas (mock + real) | Todas são mock | Regra: **cada tela declara explicitamente sua fonte**. Enquanto mock, banner N0. Quando real, banner N1. **Nunca misturar** sem aviso. |

### 6.2 Termos proibidos em N1

Os seguintes termos não podem aparecer em nenhuma label, título, export, tooltip ou mensagem do módulo N1 sem disclaimer explícito:

- "homologado" / "certificado" / "regulado" / "aprovado ANAC"
- "eDB" / "DB digital oficial" / "Diário de Bordo digital"
- "RDV oficial" / "registro oficial de voo"
- "assinatura" (sem qualificador "operacional interna")
- "SGRF aprovado" / "RBAC 117 aprovado"
- "validado" (sem qualificador — implica validação regulatória)
- "envio ao MRO" (implica integração real com MRO protótipo)

### 6.3 Termos que precisam qualificador

| Termo atual | Termo correto no N1 |
|---|---|
| "Assinar RDV" | "Finalizar RDV (operacional)" |
| "Validar RDV" | "Confirmar revisão operacional" |
| "Assinatura e validação" (seção) | Remover ou "Responsável operacional" |
| "Comandante" (coluna de assinatura) | "Resp. preenchimento" |
| "Envio ao MRO" | Remover |
| "Exportar PDF" | "Exportar PDF (não fiscal)" |
| "Jornadas / RBAC 117" | "Jornadas por tripulante" |

### 6.4 Botões que devem permanecer desabilitados em N1

Estes botões, mesmo em N1, NÃO devem ser habilitados (fora do escopo):

| Botão | Razão |
|---|---|
| "Assinar RDV" (mesmo renomeado para termo regulatório) | Sem decisão de assinatura (ICP/Gov.br/CANAC) |
| Qualquer exportação marcada como "fiscal" | N1 nunca é fiscal |
| "Export APUS / Sigvoos" | F10 — fora do escopo |
| "Jornadas/RBAC 117" (como relatório de conformidade) | Implica avaliação regulatória |
| Qualquer ação de "despacho operacional" | Ato regulado |

### 6.5 Risco de o usuário achar que é sistema oficial

Cenário de risco ativo: um despachante preenche o RDV no AirTrust, vê a seção "Assinatura e validação" com o nome do comandante, exporta o PDF e submete ao fiscal como "RDV oficial". Esse cenário é plausível com o protótipo atual se os botões fossem habilitados com dados reais. As remoções de §5.4 eliminam esse risco.

---

## 7. Gap de backend

> **Nenhuma implementação aqui — apenas listagem do que precisará existir.**

### 7.1 Tabelas conceituais necessárias (schema `cv_*`)

Todas com `empresa_id INTEGER NOT NULL` e `created_at / updated_at DATETIME`:

| Tabela | Prioridade | Observação |
|---|---|---|
| `cv_voos` | P0 | Entidade central; `status` com constraint de enum |
| `cv_voo_tripulacao` | P0 | FK → `funcionarios.id` real + `empresa_id` |
| `cv_aeronaves` | P0 | Ou reusar tabela existente; verificar se há cadastro de aeronaves |
| `cv_rdv` | P0 | Com `ciclos`, sem `assinaturaCmdteNome` (usar `responsavel_preenchimento_id`) |
| `cv_voo_eventos` | P1 | Log de transições de status |
| `cv_voo_ocorrencias` | P1 | Motivos de atraso/cancelamento com FK para catálogo |
| `cv_indisponibilidades` | P1 | Com `empresa_id`; OS MRO como texto |
| `cv_hangaragem` | P1 | Com `empresa_id`; OS MRO como texto |
| `cv_observacoes` | P1 | Texto livre por voo/aeronave |
| `cv_aeroportos` | P1 | Catálogo com `empresa_id` ou global |
| `cv_tipos_voo` | P1 | Catálogo com `empresa_id` |
| `cv_naturezas_voo` | P1 | Catálogo com `empresa_id` |
| `cv_grupos_indisp` | P1 | Catálogo com `empresa_id` |
| `cv_causas_indisp` | P1 | Catálogo com `empresa_id`; FK → grupo |
| `cv_motivos` | P1 | Catálogo de motivos de atraso/cancelamento |
| `cv_indisp_voos` | P1 | Tabela de associação indisponibilidade ↔ voo |
| `cv_voo_pernas` | P2 | Trechos múltiplos; default 1 perna no MVP |

### 7.2 Endpoints conceituais mínimos

Rotas a criar em `worker-airtrust/src/routes/` (nunca implementar sem autorização de migration):

| Prioridade | Rota | Operação |
|---|---|---|
| P0 | `GET /api/controle-voos/dashboard?data=` | Agregados do dia OCC |
| P0 | `GET /api/controle-voos/voos` | Listar voos (filtros por data/status) |
| P0 | `POST /api/controle-voos/voos` | Criar voo |
| P0 | `GET /api/controle-voos/voos/:id` | Detalhe do voo |
| P0 | `PATCH /api/controle-voos/voos/:id` | Editar voo |
| P0 | `POST /api/controle-voos/voos/:id/status` | Transição de status + evento |
| P0 | `POST /api/controle-voos/voos/:id/tripulacao` | Atribuir tripulante |
| P0 | `DELETE /api/controle-voos/voos/:id/tripulacao/:tid` | Remover tripulante |
| P0 | `GET/POST/PATCH /api/controle-voos/rdv` | RDV operacional CRUD |
| P0 | `POST /api/controle-voos/rdv/:id/finalizar` | Finalizar RDV (sem assinatura) |
| P1 | `GET /api/controle-voos/voos/:id/validacao-tripulacao` | Validação informativa (leitura Qualif./FRMS) |
| P1 | `GET/POST/PATCH /api/controle-voos/indisponibilidades` | Indisponibilidade |
| P1 | `POST /api/controle-voos/indisponibilidades/:id/encerrar` | Encerrar indisponibilidade |
| P1 | `GET/POST/PATCH /api/controle-voos/hangaragem` | Hangaragem |
| P1 | `POST /api/controle-voos/voos/:id/ocorrencia` | Registrar atraso/cancelamento |
| P1 | `GET /api/controle-voos/relatorios/:tipo` | Relatórios agregados |
| P1 | `GET /api/controle-voos/export/:tipo?formato=csv` | Export "não fiscal" |
| P1 | `GET/POST/PATCH/DELETE /api/controle-voos/catalogos/:nome` | CRUD catálogos |

### 7.3 Validações mínimas no backend

| Validação | Prioridade |
|---|---|
| `empresa_id` obrigatório em toda query e insert | P0 crítico |
| Status de voo: transições permitidas apenas (`planejado→liberado`, `liberado→em_voo` etc.) | P0 |
| RDV: horário chegada real ≥ horário partida real | P0 |
| RDV: vínculo 1:1 com voo (não pode ter 2 RDVs para o mesmo voo em status ativo) | P0 |
| Tripulante: `funcionario_id` existe no mesmo `empresa_id` | P0 |
| Zod validation em todos os endpoints | P0 |
| Aeronave: não pode ser atribuída a dois voos simultâneos em estado ativo | P1 |
| Indisponibilidade: não pode ter voo ativo com aeronave indisponível (alerta, não bloqueio) | P1 |

### 7.4 RBAC mínimo por operação

| Operação | Papel mínimo |
|---|---|
| Criar/editar/cancelar voo | `editor` |
| Transição de status (liberado, em voo) | `editor` |
| Criar/editar/finalizar RDV | `editor` |
| Atribuir tripulação | `editor` |
| Registrar indisponibilidade/hangaragem | `editor` |
| Gerar relatório / export | `viewer` |
| Dashboard (leitura) | `viewer` |
| CRUD catálogos | `admin` |
| Acesso ao módulo | `viewer` (gated em `module-access.ts`) |

### 7.5 Testes mínimos

| Teste | Prioridade |
|---|---|
| Isolamento de tenant: voo de empresa A não aparece para empresa B | P0 crítico |
| Criação de voo com todos os campos obrigatórios | P0 |
| Transição de status inválida é rejeitada | P0 |
| RDV sem `empresa_id` é rejeitado | P0 |
| Atribuição de funcionário de outro tenant é rejeitada | P0 |
| RDV com chegada antes de partida é rejeitado | P0 |
| Geração de export tem rodapé "não fiscal" | P1 |

---

## 8. Gap de frontend

### 8.1 O que pode ser reaproveitado sem alteração

- `ControleVoosPageShell`, `ControleVoosSubnav`, `ControleVoosBreadcrumb`, `ControleVoosPageHeader`
- `ControleVoosStatCards`, `ControleVoosStatusBadge`
- `controleVoosUtils.ts` — todos os formatadores (data, hora, horas, combustível)
- Estrutura visual de todas as 10 páginas (layout, grid, tabelas, cards)
- Lógica de status timeline no VooDetalhe
- Links de navegação entre entidades (voo → RDV, etc.)

### 8.2 O que precisa trocar de mock para API

| Tela | Substituição |
|---|---|
| Dashboard | Stats, alertas, timeline de aeronaves — `useLms`-style hook para `/api/controle-voos/dashboard?data=` |
| Lista voos | `MOCK_VOOS` → query `/api/controle-voos/voos` |
| Detalhe voo | `getVooById` → query `/api/controle-voos/voos/:id` |
| Validações (detalhe) | Strings fixas → `/api/controle-voos/voos/:id/validacao-tripulacao` |
| Lista RDVs | `MOCK_RDVS` → query `/api/controle-voos/rdv` |
| Detalhe RDV | `MOCK_RDVS.find` → query `/api/controle-voos/rdv/:id` |
| Jornadas | `MOCK_TRIPULANTES + MOCK_JORNADAS` → leitura FRMS real |
| Indisponibilidades | `MOCK_INDISPONIBILIDADES` → query `/api/controle-voos/indisponibilidades` |
| Hangaragem | `MOCK_HANGARAGENS` → query `/api/controle-voos/hangaragem` |
| Relatórios | Todos disabled → gerar via backend |
| Tabelas | `MOCK_*` → queries de catálogos reais |

### 8.3 O que precisa virar formulário real

| Formulário | Campos mínimos | Prioridade |
|---|---|---|
| Novo voo / Editar voo | prefixo, origem, destino, tipo, natureza, aeronave, horários previstos, data | P0 |
| Atribuir tripulante | seleção de funcionário real por função (PIC/SIC/COM/MEC) | P0 |
| Transição de status | status novo + observação | P0 |
| Registrar horários reais | partida real, chegada real (com validação sequência) | P0 |
| Criar/Editar RDV | horas, pousos, ciclos, combustível (3 campos), ocorrências, divergências | P0 |
| Nova indisponibilidade | aeronave, causa, grupo, início, fim previsto, observação | P1 |
| Nova hangaragem | aeronave, entrada, motivo | P1 |
| Registrar atraso/cancelamento | tipo, motivo (catálogo), tempo atraso, observação | P1 |
| CRUD catálogos | nome, descrição por catálogo | P1 |

### 8.4 O que precisa continuar read-only em N1

| Elemento | Razão |
|---|---|
| Scores e status FRMS | Leitura do módulo FRMS; CV não escreve no FRMS |
| CMA / ASO do tripulante | Leitura de Qualificações; CV não altera |
| Horas do mês (tripulante) | Derivado de FRMS |
| OS MRO vinculada | Texto livre de referência — não é integração real |
| "Fase 2" relatórios (3) | Fora do MVP |

### 8.5 Botões que devem continuar disabled em N1

| Botão | Motivo |
|---|---|
| "Assinar RDV" (ou equivalente regulatório) | Fora do escopo (F3) |
| "Export APUS / Sigvoos" | Fora do escopo (F10) |
| "Jornadas / RBAC 117" (como relatório de conformidade) | Riscos de label |
| Qualquer ação de despacho legal | Fora do escopo (F14) |

### 8.6 Ajustes de label/UI sem mudança de backend

Podem ser feitos na Fase A (limpeza sem backend):

- Renomear coluna "Comandante" na lista RDV → "Resp. preenchimento"
- Remover seção "Assinatura e validação" em RDVDetalhe (ou substituir conforme §6.3)
- Remover seção "Integração" (Envio MRO/FRMS) em RDVDetalhe
- Renomear botão "Assinar RDV" → "Finalizar RDV" (permanece disabled)
- Renomear "Jornadas / RBAC 117" → "Jornadas por tripulante" em `MOCK_RELATORIOS`
- Remover "Fase 2" do header/footer de Hangaragem (spec coloca como P1)
- Corrigir data hardcoded no Dashboard (substituir por "Hoje" ou seletor)
- Adicionar filtros básicos de período na lista de voos (UI only, sem backend)
- Adicionar rodapé "Uso operacional interno — não fiscal" em `ControleVoosPageShell` ou em exportações

---

## 9. Gap de integrações

| Módulo | Classificação | Estado atual no protótipo | Gap para N1 |
|---|---|---|---|
| **Funcionários** | **MVP obrigatório** | Tripulantes são mock independentes (`MOCK_TRIPULANTES`) | Substituir por busca real de funcionários por `empresa_id`. `cv_voo_tripulacao.funcionario_id` → `funcionarios.id` |
| **Qualificações** | **MVP obrigatório (leitura informativa)** | Hardcoded ("✅ Tripulantes aptos") — não consulta nada real | Endpoint `GET /api/controle-voos/voos/:id/validacao-tripulacao` lê Qualificações e retorna alertas (não bloqueios) por tripulante |
| **FRMS** | **MVP obrigatório (leitura informativa)** | `frmsScore` e `frmsStatus` são campos mock no tripulante | Leitura do módulo FRMS real por `funcionario_id`; mostrar score/status na alocação; alertas informativos sem bloquear |
| **Escalas / EVD** | **MVP opcional** | Card "Conflito de Escala" hardcoded ("✅ Sem conflitos") | P2-1; integrar apenas na Fase 3. No N1, remover a validação hardcoded ou substituir por "Não verificado (em breve)" |
| **SGSO** | **Futura** | Ausente | Não fazer no N1 |
| **MRO** | **Não fazer agora** | `enviadoMro`, `osMroVinculada` no mock | Remover `enviadoMro`; manter `os_mro_ref` como texto livre; zero integração real. MRO é protótipo |
| **LMS** | **Não fazer agora** | Ausente | Sem relação direta no MVP |
| **Records Core** | **Não fazer agora** | Ausente | N1 não usa Records Core; selagem regulada é fase eDB (N3) |

---

## 10. Riscos principais

| # | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| R1 | **Seção "Assinatura e validação" com dados reais** confunde usuário sobre valor legal do RDV | Alta (campo existe) | Crítico | Remover seção antes de habilitar qualquer dado real (Fase A) |
| R2 | **`enviadoMro: true`** nos RDVs reais faz usuário achar que dados chegaram ao MRO | Média | Alto | Remover campo do schema e UI |
| R3 | **Dashboard com data hardcoded** mostra dados de 13/06 para sempre — usuário não percebe erro | Alta | Alto | Corrigir data para dinâmica antes de qualquer dado real |
| R4 | **Tripulação mock** substituída por Funcionários reais com `funcionario_id` errado (FK cross-tenant) | Média | Crítico | Teste de isolamento de tenant obrigatório (§7.5) |
| R5 | **Escopo inflar** para incluir assinatura, offline ou eDB durante o desenvolvimento N1 | Média | Alto | Lista §2.2 da spec como referência; revisão de escopo a cada fase |
| R6 | **Validações de tripulação** (CMA/ASO/FRMS) serem percebidas como bloqueio legal | Média | Médio | Deixar sempre como "informativo" com tooltip; nunca bloquear voo em N1 |
| R7 | **Export PDF gerado** sem rodapé "não fiscal" sendo usado como documento oficial | Alta (sem rodapé atualmente) | Alto | Rodapé obrigatório antes de habilitar export |
| R8 | **Mock misturado com real** em uma transição parcial (algumas telas reais, outras mock) | Alta (durante Fase 2) | Médio | Cada tela declara fonte; banner por estado; não misturar em UI |
| R9 | **LGPD:** CMA/ASO/FRMS de tripulantes expostos sem controle de papel | Baixa inicial | Médio | Exibir só para `editor`+; nunca em export público |
| R10 | **`Jornada` duplicando dados do FRMS** no schema `cv_*` | Média | Médio | Não criar tabela `cv_jornadas`; leitura direta do FRMS |

---

## 11. Plano de evolução N0 → N1

### Fase A — Limpeza sem backend (pode fazer AGORA, sem migration)

**Objetivo:** eliminar riscos regulatórios antes de qualquer dado real.

**Itens:**
1. Remover seção "Assinatura e validação" do `ControleVoosRdvDetalhe.tsx` (ou substituir por "Responsável operacional — sem valor jurídico")
2. Renomear botão "Assinar RDV" → "Finalizar RDV" (permanece `disabled`)
3. Remover seção "Integração" (enviadoMro/enviadoFrms) do `ControleVoosRdvDetalhe.tsx`
4. Renomear coluna "Comandante" na lista RDV → "Resp. preenchimento"
5. Remover "Fase 2" do header/footer de `ControleVoosHangaragem.tsx`
6. Renomear `rel-008` de "Jornadas / RBAC 117" → "Jornadas por tripulante"
7. Corrigir data hardcoded no Dashboard para dinâmica (hoje)
8. Atualizar descrição do banner para tom N1 (preparando; ainda N0)
9. Adicionar rodapé "Uso operacional interno — não fiscal" ao shell ou template de export

**Esforço total Fase A:** ~1–2 dias. Sem backend, sem migration.

### Fase B — Backend mínimo N1

**Objetivo:** persistência real, multi-tenant, RBAC.

**Itens:**
1. Autorização de migration (fora desta spec)
2. Criar tabelas `cv_voos`, `cv_voo_tripulacao`, `cv_rdv`, `cv_aeronaves` com `empresa_id`
3. Criar endpoints P0 (lista, create, update voo; create/update/finalizar RDV; status)
4. Testes de isolamento de tenant
5. Registrar rotas em `worker-airtrust/src/routes/`

**Esforço total Fase B:** ~10–15 dias.

### Fase C — Frontend real

**Objetivo:** substituir mock por API em telas P0.

**Itens:**
1. Substituir `MOCK_VOOS` → query real em lista e detalhe
2. Habilitar formulários de criação/edição de voo
3. Habilitar transição de status (botões reais)
4. Substituir RDV mock → API real; habilitar formulário
5. Atualizar `modules.ts`: `isPrototype: false`, `maturityLevel: 'N1'`
6. Atualizar banner para N1

**Esforço total Fase C:** ~7–10 dias.

### Fase D — Integrações e relatórios (P1)

**Objetivo:** integração leitura Funcionários/Qualificações/FRMS; relatórios; catálogos.

**Itens:**
1. Integrar Funcionários na alocação de tripulação (busca por empresa_id)
2. Implementar validação informativa de tripulação (Qualificações + FRMS)
3. Backend de indisponibilidades e hangaragem
4. Catálogos editáveis por admin
5. Relatórios MVP (5) com export "não fiscal"
6. Catálogo de motivos de atraso/cancelamento

**Esforço total Fase D:** ~10–12 dias.

### Fase E — Piloto interno controlado

**Objetivo:** uso real controlado, paralelo ao Sigvoos/APUS.

**Itens:**
1. Onboarding de um setor/operação piloto
2. Coleta de feedback
3. Ajustes de UX e dados
4. Medir S1–S6 (critérios de sucesso da spec)

**Esforço total Fase E:** em aberto (depende de feedback).

### Fase F — Preparação eDB (futura)

**Objetivo:** mapear campos `cv_*` → campos Res. 773/Portaria 3.220 sem implementar eDB.

**Itens:**
1. Mapa de campos (documento)
2. Adicionar `cv_voo_pernas` (P2-2) se necessário
3. Nenhuma implementação regulada nesta fase

---

## 12. Decisão final

### 12.1 Vale avançar para backend mínimo N1?

**Sim — com pré-condição obrigatória.**

O protótipo tem maturidade estrutural para evoluir. O modelo de dados mock cobre ~80% do que é necessário. A limpeza de campos regulatórios (Fase A) é pequena e pode ser feita antes de qualquer backend.

**A pré-condição é a Fase A:** nenhum dado real deve entrar enquanto a seção "Assinatura e validação", `enviadoMro`/`enviadoFrms` e o botão "Assinar RDV" existirem como estão. Risco: usuário interpreta RDV preenchido como documento com valor legal.

### 12.2 O que deve ser corrigido antes de backend

Em ordem de urgência:

1. **Limpeza regulatória (Fase A)** — seção de assinatura, campos enviadoMro/Frms, labels
2. **Confirmar com o gestor operacional** que o fluxo do protótipo reflete a realidade (validação de Fase 0 da spec §13)
3. **Decidir sobre aeronaves**: há tabela de aeronaves existente no AirTrust? Deve-se reaproveitar ou criar `cv_aeronaves`?
4. **Confirmar RBAC**: quais roles do AirTrust mapeiam para OCC/piloto/manutenção?
5. **Autorizar migration** (`cv_*` tables) — fora desta spec, depende de aprovação explícita

### 12.3 Qual é o próximo prompt recomendado

Se a Fase A for prioridade → gerar as edições de limpeza regulatória nos arquivos do protótipo.

Se o backend for prioridade → gerar o desenho detalhado do backend N1 mínimo (schema DDL conceitual, endpoints, validações, testes) como documento, sem implementar.

---

## 13. Próximo prompt recomendado

### Opção 1 — Limpeza regulatória primeiro (recomendada)

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Executar a Fase A de limpeza regulatória do protótipo Controle de Voos,
removendo ou rebaixando os campos e seções que criam risco de confusão
regulatória antes de qualquer dado real entrar no módulo.

Importante:
- Não criar backend. Não criar migrations. Não fazer deploy.
- Não mexer em secrets. Fazer commit somente se solicitado explicitamente.
- Não transformar o módulo em sistema regulado.
- Após cada edição, verificar que o módulo continua navegável e o banner N0 persiste.

Referências:
- docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md (seções 5.4, 6.2, 6.3, 8.5, 8.6, 11 Fase A)
- docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md
- src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx
- src/react-app/pages/controle-voos/ControleVoosRdv.tsx
- src/react-app/pages/controle-voos/ControleVoosHangaragem.tsx
- src/react-app/pages/controle-voos/data/controleVoosMockData.ts
- src/react-app/pages/controle-voos/ControleVoosDashboard.tsx

Edições obrigatórias da Fase A:
1. ControleVoosRdvDetalhe.tsx — remover seção "Assinatura e validação" inteira
   (h2 + div com Comandante/Assinatura em/Validação).
2. ControleVoosRdvDetalhe.tsx — remover seção "Integração" (envio ao MRO/FRMS).
3. ControleVoosRdvDetalhe.tsx — renomear botão "Assinar RDV" → "Finalizar RDV"
   (manter disabled; atualizar title/tooltip).
4. ControleVoosRdv.tsx — renomear coluna "Comandante" → "Resp. preenchimento";
   remover exibição de rdv.assinaturaCmdteNome da coluna.
5. ControleVoosHangaragem.tsx — remover "— Fase 2" do header e rodapé.
6. controleVoosMockData.ts — renomear MOCK_RELATORIOS[7].titulo de
   "Jornadas / RBAC 117" → "Jornadas por tripulante".
7. ControleVoosDashboard.tsx — substituir data hardcoded '2026-06-13' e
   texto "13 de junho de 2026" por data dinâmica (hoje).

Após cada edição:
- Confirmar que o módulo ainda compila (tsc --noEmit).
- Confirmar que o banner de governança N0 continua presente.
- Não habilitar nenhum botão que estava disabled.

Entrega:
- Listar cada arquivo editado com o que mudou.
- Resultado de npx tsc --noEmit.
- Confirmar que nenhum campo regulatório perigoso permanece visível.
- Sugestão de commit (não executar sem autorização).
```

### Opção 2 — Desenho do backend N1 (se Fase A já estiver feita)

```text
Você está trabalhando no monorepo do AirTrust.

Objetivo:
Gerar o desenho detalhado do backend mínimo N1 para o módulo Controle de Voos,
como documentação em docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md.
Não implementar nada. Não criar migrations. Não criar arquivos de rota.

Referências:
- docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md (seções 7.1–7.5)
- docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md (seções 6, 10, 11, 12)
- worker-airtrust/src/routes/ (padrões existentes, apenas leitura)
- worker-airtrust/migrations/ (apenas para verificar se há tabela de aeronaves)
- src/react-app/lib/modules.ts (RBAC roles disponíveis)

Tarefa:
1. DDL conceitual das tabelas P0 (cv_voos, cv_voo_tripulacao, cv_rdv, cv_aeronaves)
   com todos os campos, tipos, constraints, índices — apenas como SQL comentado,
   não como migration.
2. DDL conceitual das tabelas P1 restantes.
3. Especificação de cada endpoint (método, rota, auth, params, body Zod, resposta).
4. Especificação dos testes de isolamento de tenant.
5. Mapa de RBAC por operação.
6. Decisões a tomar antes de implementar (aeronaves: reusar ou criar? catálogos: por tenant ou global?).

Entrega: docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md. Sem commit.
```

---

## Entrega desta gap list

- **Documento criado:** `docs/CONTROLE_DE_VOOS_N1_GAP_LIST.md`
- **Veredito:** Protótipo estruturalmente pronto, funcionalmente distante. Pré-condição obrigatória: Fase A de limpeza regulatória antes de qualquer dado real.
- **Top 10 gaps:**
  1. Zero backend / zero schema `cv_*` / zero `empresa_id`
  2. Seção "Assinatura e validação" no RDVDetalhe — risco regulatório crítico
  3. `enviadoMro` / `enviadoFrms` — implica integração inexistente
  4. Data hardcoded `'2026-06-13'` no Dashboard
  5. Tripulantes são mock independentes — sem vínculo com Funcionários reais
  6. Validações de tripulação hardcoded — não derivam de Qualificações/FRMS reais
  7. Campo `ciclos` ausente no RDV
  8. Sem catálogo real de motivos de atraso/cancelamento
  9. Todos os formulários de criação/edição ausentes (botões disabled)
  10. Sem filtros em nenhuma lista
- **Top 10 reaproveitáveis:**
  1. Componentes de layout (PageShell, PageHeader, Breadcrumb, Subnav, StatCards, StatusBadge)
  2. Estrutura de todas as 10 páginas
  3. `controleVoosUtils.ts` (formatadores)
  4. Toda a estrutura de roteamento em `App.tsx`
  5. `module-access.ts` e `navigation.config.ts`
  6. Modelo de dados mock como referência para seed/schema
  7. Ciclo de estados de voo (enum completo)
  8. Campos de Rdv (horas, pousos, combustível, ocorrências, divergências)
  9. Campos de Indisponibilidade (causa, grupo, datas, status, referência OS)
  10. Catálogos mock (aeroportos, tipos, naturezas, causas, grupos) como dados iniciais
- **Próxima etapa recomendada:** Fase A — limpeza regulatória sem backend (1–2 dias)
- **Sugestão de commit (NÃO executar sem autorização):**
  `docs(controle-voos): add N0→N1 gap list and phase plan`

> **Commit não realizado**, conforme instrução.
