# RELATÓRIO DE IMPLEMENTAÇÃO — Compliance Gaps AirTrust

**Data:** Junho 2025  
**Referência:** RELATORIO-COMPLIANCE-DOCUMENTOS-OPS-2025.md  
**Status:** ✅ Todos os 12 GAPs implementados

---

## RESUMO EXECUTIVO

Foram identificados 12 gaps de compliance entre o sistema AirTrust e os documentos operacionais (PRC-OPS-009, PRC-OPS-010, PRC-OPS-012, NOP-OPS-038, PRG-OPS-001). Todos foram implementados nesta sessão de trabalho.

| GAP | Documento            | Descrição                                  | Status          |
| --- | -------------------- | ------------------------------------------ | --------------- |
| 1-3 | PRC-OPS-009 §4.3     | Módulo EVD (Escala de Voo Diária)          | ✅ Implementado |
| 4   | NOP-OPS-038 §1.ii    | Validação soma de idades ≤ 129             | ✅ Implementado |
| 5   | NOP-OPS-038 §1.i     | Restrições CMA na composição               | ✅ Implementado |
| 6   | PRC-OPS-009 §6.1.9a  | Experiência mínima PIC/SIC                 | ✅ Implementado |
| 7   | PRC-OPS-009 §8.2     | Ciência da escala (confirmação tripulante) | ✅ Implementado |
| 8-9 | PRC-OPS-012 §5.1-5.2 | Fadiga acumulada legal (% limites)         | ✅ Implementado |
| 10  | PRC-OPS-009 §8.1     | Alerta semanal qualificações ≤90d          | ✅ Implementado |
| 11  | PRG-OPS-001          | Workflow aprovação treinamento             | ✅ Implementado |
| 12  | PRC-OPS-012 §5.2     | Projeção limite mensal (12° dia)           | ✅ Implementado |

---

## DETALHAMENTO POR GAP

### GAP 4 — Soma de Idades ≤ 129 anos (NOP-OPS-038)

**Arquivo modificado:** `worker-airtrust/src/routes/escalas-tripulacoes.ts`  
**Arquivo modificado:** `worker-airtrust/src/routes/escalas-conflitos.ts`

**O que foi feito:**

- Adicionada validação no POST de criação de tripulação que calcula a soma das idades de PIC + SIC
- Se soma > 129, a criação é **bloqueada** (HTTP 400) com mensagem explicativa
- **Exceção implementada:** se PIC ou SIC tem função IN (Instrutor) ou EC (Examinador Credenciado), a validação é ignorada conforme NOP-OPS-038
- Também adicionada verificação no endpoint de conflitos (pré-publicação) para detectar violações em todas as tripulações da escala

**Query:** Consulta `funcionarios.data_nascimento` para ambos os pilotos, calcula idade com `JULIANDAY`

---

### GAP 5 — Restrições CMA na Composição (NOP-OPS-038)

**Arquivo modificado:** `worker-airtrust/src/routes/escalas-tripulacoes.ts`

**O que foi feito:**

- Consulta o último registro CMA de cada piloto em `qualificacoes_historico`
- Verifica o campo `observacoes` para palavras-chave RESTRICAO/SOLO
- **Bloqueia** duas situações:
  1. Dois pilotos com restrição CMA juntos
  2. Piloto com restrição CMA + outro piloto com idade > 59 anos

---

### GAP 6 — Experiência Mínima PIC/SIC (PRC-OPS-009)

**Arquivo modificado:** `worker-airtrust/src/routes/escalas-tripulacoes.ts`

**O que foi feito:**

- Consulta `frms_jornada` para calcular total de horas de voo de cada piloto
- Se PIC < 100h E SIC < 500h, gera **aviso não-bloqueante** (compliance_warnings)
- O warning é retornado no response da criação da tripulação

---

### GAP 7 — Ciência da Escala (PRC-OPS-009 §8.2)

**Arquivos criados:**

- `worker-airtrust/migrations/0278_create_escala_confirmacoes.sql`
- `worker-airtrust/src/routes/escalas-confirmacoes.ts`

**Arquivo modificado:**

- `worker-airtrust/src/routes/escalas-core.ts` (import + mount)
- `src/react-app/pages/escalas/MinhaEscalaPage.tsx` (UI de confirmação)

**O que foi feito:**

- Nova tabela `escala_confirmacoes` com unique constraint (escala_id, funcionario_id)
- 3 endpoints:
  - `POST /api/escalas/minha-escala/confirmar` — confirmar ciência (com IP tracking)
  - `GET /api/escalas/minha-escala/confirmacao-status` — status atual
  - `GET /api/escalas/:id/confirmacoes` — visão admin (total/confirmados/%)
- UI na MinhaEscalaPage: botão âmbar "Confirmar Ciência" → banner verde "Ciência confirmada"

---

### GAPs 8-9 — Fadiga Acumulada Legal (PRC-OPS-012)

**Arquivos criados:**

- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`
- `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx`

**Arquivos modificados:**

- `worker-airtrust/src/routes/frms.ts` (import + mount fadigaAcumulada)
- `worker-airtrust/src/cron/frms-daily-check.ts` (alerta automático fadiga)
- `src/react-app/App.tsx` (lazy import + rota /frms/fadiga-acumulada)
- `src/react-app/navigation.config.ts` (menu "Fadiga Acumulada")

**O que foi feito:**

- **Backend — 3 endpoints:**
  - `GET /api/frms/fadiga-acumulada?mes=&tripulante_id=` — evolução diária com fatores agravantes/mitigantes
  - `GET /api/frms/fadiga-acumulada/frota?mes=` — panorama de toda a frota
  - `GET /api/frms/fadiga-acumulada/projecao?mes=&tripulante_id=` — projeção 12° dia

- **Cálculo conforme PRC-OPS-012:**
  - % Jornada = (acumulado / 176h) × 100 + fatores
  - % Voo = (acumulado / 90h) × 100 + fatores
  - Fatores agravantes: apresentação <06:30 (+0.2%), jornada >10h (+0.1%), voo ≥6h (+0.1%), decolagem noturna (+0.1%), pouso noturno (+0.1%)
  - Fatores mitigantes: sem apresentação (-0.2%), apresentação ≥08:00 (-0.1%), jornada <8h (-0.1%), repouso >13h (-0.1%), 0h voo (-0.2%), ≤4h voo (-0.1%)
  - Thresholds: ≥80% VERDE, ≥90% AMARELO, ≥95% VERMELHO

- **Cron integrado:** no `frms-daily-check.ts`, após as verificações existentes, calcula fadiga acumulada e gera alertas FRMS se ≥80%

- **Frontend — Página completa:**
  - Cards resumo (total tripulantes, em alerta, críticos)
  - Legenda de cores
  - Tabela da frota com barras de progresso coloridas (jornada + voo)
  - Expandir tripulante → tabela de evolução diária
  - Seletor de mês

---

### GAP 10 — Alerta Semanal Qualificações ≤90 dias (PRC-OPS-009 §8.1)

**Arquivo modificado:** `worker-airtrust/src/index.ts` (scheduled handler)

**O que foi feito:**

- No handler `scheduled()`, adicionado bloco que executa **apenas às segundas-feiras** (UTC dayOfWeek === 1)
- Consulta qualificações com vencimento ≤90 dias (excluindo canceladas, considerando apenas o registro mais recente por funcionário/qualificação)
- Gera notificação no `notificacoes_sistema` com:
  - Contagem por faixa: críticas (≤30d), alerta (≤60d), aviso (≤90d)
  - Lista dos primeiros 50 itens com nome, código, dias restantes
  - Prioridade ALTA

---

### GAP 1-3 — Módulo EVD (Escala de Voo Diária — PRC-OPS-009 §4.3)

**Arquivos criados:**

- `worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`
- `worker-airtrust/src/routes/escalas-evd.ts`
- `src/react-app/pages/escalas/EvdPage.tsx`

**Arquivos modificados:**

- `worker-airtrust/src/index.ts` (import + mount /api/evd)
- `src/react-app/App.tsx` (lazy import + rota /escalas/evd)
- `src/react-app/navigation.config.ts` (menu "Voo Diário (EVD)")

**O que foi feito:**

- **Tabela `escala_voo_diaria`** com:
  - Vinculação com EST mensal (escala_id)
  - Tripulação PIC/SIC com funções
  - Aeronave (prefixo + modelo)
  - Horários: apresentação, decolagem prevista/real, pouso previsto/real, corte motor
  - Repouso anterior calculado + flag de conformidade (≥12h30)
  - Rota (origem/destino), tipo missão (OFFSHORE/INSTRUCAO/CHECK/FERRY)
  - Status: RASCUNHO → PUBLICADA | CANCELADA
  - Audit fields completos

- **Backend — 7 endpoints:**
  - `GET /api/evd?data=` — listar voos do dia
  - `GET /api/evd/semana?inicio=` — visão semanal (7 dias)
  - `GET /api/evd/:id` — detalhe
  - `POST /api/evd` — criar (com validação repouso ≥12h30)
  - `PUT /api/evd/:id` — atualizar
  - `DELETE /api/evd/:id` — soft delete
  - `POST /api/evd/:id/publicar` — publicar (bloqueia se repouso insuficiente ou tripulação incompleta)

- **Validação de repouso (PRC-OPS-009 §6.1.6):**
  - Consulta último corte motor do piloto (em EVD ou FRMS jornada)
  - Calcula diferença em minutos até hora de apresentação
  - Bloqueia publicação se < 12h30

- **Frontend — Página completa:**
  - Navegação por dia (← data →) com date picker
  - Cards de voo com status, rota, tripulação, horários, aeronave
  - Badge de alerta para repouso insuficiente
  - Formulário inline para criar novo voo
  - Botões de publicar e excluir

---

### GAP 11 — Workflow de Aprovação de Treinamento (PRG-OPS-001)

**Arquivos criados:**

- `worker-airtrust/migrations/0280_create_solicitacoes_treinamento.sql`
- `worker-airtrust/src/routes/solicitacoes-treinamento.ts`

**Arquivo modificado:**

- `worker-airtrust/src/index.ts` (import + mount /api/treinamentos)

**O que foi feito:**

- **Tabela `solicitacoes_treinamento`** com:
  - Solicitante, qualificação vinculada, tipo (INICIAL/RECORRENTE/UPGRADE/ESPECIFICO)
  - Status machine: SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA | REJEITADA
  - Campos de aprovação (gestor/ops) com timestamps
  - Motivo de rejeição
  - Integração com simulador (sessao_simulador_id)
  - Prioridade (BAIXA/NORMAL/ALTA/URGENTE)

- **Backend — 8 endpoints:**
  - `GET /api/treinamentos/solicitacoes` — listar (com filtros status/solicitante)
  - `GET /api/treinamentos/solicitacoes/stats` — contagem por status
  - `GET /api/treinamentos/solicitacoes/:id` — detalhe
  - `POST /api/treinamentos/solicitacoes` — criar solicitação
  - `POST /:id/aprovar-gestor` — aprovar como gestor (SOLICITADA → APROVADA_GESTOR)
  - `POST /:id/aprovar-ops` — aprovar como ops (APROVADA_GESTOR → APROVADA_OPS)
  - `POST /:id/rejeitar` — rejeitar (qualquer status não-final → REJEITADA)
  - `POST /:id/agendar` — agendar data (APROVADA\_\* → AGENDADA)
  - `POST /:id/concluir` — marcar concluída

---

### GAP 12 — Projeção Limite Mensal (12° Dia — PRC-OPS-012 §5.2)

**Arquivo modificado:** `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`

**O que foi feito:**

- **Endpoint `GET /api/frms/fadiga-acumulada/projecao`**
- Ativado a partir do 12° dia do mês ou 12° dia de ciclo embarcado
- Calcula:
  - Horas acumuladas (jornada + voo)
  - Horas restantes até o limite
  - Média diária (baseada nos dias trabalhados)
  - Projeção: quantos dias até estourar o limite no ritmo atual
  - Flag `risco_estourar_mes` se projeção < dias restantes

---

## ARQUIVOS CRIADOS (7)

| Arquivo                                                               | Linhas | Propósito                       |
| --------------------------------------------------------------------- | ------ | ------------------------------- |
| `worker-airtrust/migrations/0278_create_escala_confirmacoes.sql`      | ~15    | Tabela ciência da escala        |
| `worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`        | ~60    | Tabela EVD                      |
| `worker-airtrust/migrations/0280_create_solicitacoes_treinamento.sql` | ~50    | Tabela workflow treinamento     |
| `worker-airtrust/src/routes/escalas-confirmacoes.ts`                  | ~150   | API ciência da escala           |
| `worker-airtrust/src/routes/escalas-evd.ts`                           | ~420   | API módulo EVD                  |
| `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`                 | ~380   | API fadiga acumulada + projeção |
| `worker-airtrust/src/routes/solicitacoes-treinamento.ts`              | ~280   | API workflow treinamento        |
| `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx`                    | ~300   | Página fadiga acumulada         |
| `src/react-app/pages/escalas/EvdPage.tsx`                             | ~450   | Página EVD                      |

## ARQUIVOS MODIFICADOS (8)

| Arquivo                                             | Mudanças                                                       |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `worker-airtrust/src/routes/escalas-tripulacoes.ts` | GAPs 4, 5, 6 (validações tripulação)                           |
| `worker-airtrust/src/routes/escalas-conflitos.ts`   | GAP 4 (validação soma idades pré-publicação)                   |
| `worker-airtrust/src/routes/escalas-core.ts`        | Import + mount confirmacoes                                    |
| `worker-airtrust/src/routes/frms.ts`                | Import + mount fadigaAcumulada                                 |
| `worker-airtrust/src/cron/frms-daily-check.ts`      | GAP 8-9 (alertas fadiga acumulada no cron)                     |
| `worker-airtrust/src/index.ts`                      | Imports + mounts (EVD, treinamentos) + GAP 10 (alerta semanal) |
| `src/react-app/App.tsx`                             | Lazy imports + rotas (EVD, fadiga acumulada)                   |
| `src/react-app/navigation.config.ts`                | Menus (EVD, fadiga acumulada)                                  |
| `src/react-app/pages/escalas/MinhaEscalaPage.tsx`   | GAP 7 (botão ciência da escala)                                |

---

## BUILD STATUS

- ✅ Vite build: sucesso (9.29s)
- ✅ TypeScript: sem erros nos novos arquivos
- ⚠️ Migrations 0278, 0279, 0280 ainda precisam ser aplicadas ao D1 de produção

## PRÓXIMOS PASSOS (PÓS-DEPLOY)

1. Aplicar migrações 0278-0280 ao D1 de produção
2. Deploy via `deploy-full-automated.sh`
3. Testar cada funcionalidade em produção
4. Criar página frontend para solicitações de treinamento (GAP 11 — backend pronto, frontend pendente)
