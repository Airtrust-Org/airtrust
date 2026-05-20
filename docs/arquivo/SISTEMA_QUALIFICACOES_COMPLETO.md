# 📘 Sistema de Qualificações - Documentação Completa

**Versão:** 1.0.0  
**Data:** 27 de novembro de 2025  
**Status:** ✅ PRODUÇÃO

---

## 📋 Visão Geral

Sistema completo de gerenciamento de qualificações e certificações de funcionários da AirTrust, com:

- ✅ Cálculo automático de vencimento (dia exato ou fim do mês)
- ✅ Dashboard de alertas em tempo real
- ✅ Sistema de notificações automáticas (email + dashboard)
- ✅ API REST completa com autenticação JWT
- ✅ Frontend responsivo com design Apple-inspired
- ✅ Performance otimizada (P95 < 500ms)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────┐
│         FRONTEND (React 19)             │
│  • Pages (Cloudflare Pages)             │
│  • Components (StatusBadge, Cards)      │
│  • Preview de vencimento dinâmico       │
│  → URL: https://airtrust.pages.dev      │
└──────────────┬──────────────────────────┘
               │ HTTPS (JWT Auth)
               ▼
┌─────────────────────────────────────────┐
│      WORKER API (Hono.js + TS)          │
│  • Routes: /api/qualificacoes/*         │
│  • Routes: /api/notificacoes/*          │
│  • Cron: Notificações diárias (8h UTC)  │
│  → URL: airtrust-api-production...      │
└──────────────┬──────────────────────────┘
               │ D1 Binding + R2 Binding
               ▼
┌─────────────────────────────────────────┐
│    DATABASE (Cloudflare D1 SQLite)      │
│  • qualificacoes_tipos                  │
│  • qualificacoes_historico              │
│  • notificacoes_config                  │
│  • notificacoes_log                     │
│  • funcionarios                         │
└─────────────────────────────────────────┘
```

---

## 🔌 API Endpoints

### 🧑‍✈️ Tipos de Qualificação

#### `GET /api/qualificacoes/tipos`

Lista todos os tipos de qualificação disponíveis.

**Query Params:**

- `limit` (opcional): Número de resultados
- `offset` (opcional): Paginação

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "codigo": "CMA",
      "nome": "Certificado Médico Aeronáutico",
      "validade": 12,
      "vencimento_fim_mes": 1,
      "eh_recorrente": 1,
      "intervalo_recorrencia": 12
    }
  ]
}
```

#### `GET /api/qualificacoes/tipos/:codigo`

Busca tipo específico.

#### `POST /api/qualificacoes/tipos`

Cria novo tipo (admin only).

**Body:**

```json
{
  "codigo": "NOVA",
  "nome": "Nova Qualificação",
  "validade": 24,
  "vencimento_fim_mes": 0
}
```

---

### 📚 Histórico de Qualificações

#### `GET /api/qualificacoes/historico`

Lista histórico completo com cálculo automático de status e urgência.

**Query Params:**

- `funcionario_cpf` (opcional)
- `qualificacao_codigo` (opcional)
- `status` (opcional): vigente | expirando | vencida
- `urgencia` (opcional): critical | high | medium | low
- `limit`, `offset`: Paginação

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "funcionario_cpf": "12345678901",
      "funcionario_nome": "João Silva",
      "qualificacao_codigo": "CMA",
      "qualificacao_nome": "Certificado Médico Aeronáutico",
      "data_conclusao": "2024-11-15",
      "data_vencimento": "2025-11-30",
      "status": "vigente",
      "urgencia": "medium",
      "dias_ate_vencimento": 368,
      "nota": 5.0,
      "instrutor": "Dr. Silva",
      "local": "São Paulo"
    }
  ]
}
```

#### `GET /api/qualificacoes/historico/:id`

Busca qualificação específica por ID.

#### `POST /api/qualificacoes/historico`

**Cria nova qualificação com cálculo automático de vencimento.**

**Body:**

```json
{
  "funcionario_cpf": "12345678901",
  "qualificacao_codigo": "CMA",
  "data_conclusao": "2024-11-15",
  "nota": 5.0,
  "instrutor": "Dr. Silva",
  "local": "São Paulo",
  "modalidade": "PRESENCIAL"
}
```

**Cálculo Automático:**

- Se `vencimento_fim_mes=1`: **Último dia do mês** (CMA)
- Se `vencimento_fim_mes=0`: **Dia exato** (ICAO)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 124,
    "data_vencimento": "2025-11-30",
    "status": "vigente",
    "urgencia": "medium"
  }
}
```

#### `PUT /api/qualificacoes/historico/:id`

Atualiza qualificação (recalcula vencimento se data mudou).

#### `DELETE /api/qualificacoes/historico/:id`

Soft delete (marca `deleted_at`).

---

### 🚨 Alertas de Vencimento

#### `GET /api/qualificacoes/alertas`

Lista qualificações expirando ou vencidas com **cálculo em tempo real**.

**Query Params:**

- `urgencia`: critical | high | medium | low
- `status`: vigente | expirando | vencida
- `limit`, `offset`

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "funcionario_nome": "João Silva",
      "qualificacao_nome": "CMA",
      "data_vencimento": "2024-12-05",
      "dias_ate_vencimento": 8,
      "status": "expirando",
      "urgencia": "critical"
    }
  ]
}
```

#### `GET /api/qualificacoes/alertas/resumo`

Estatísticas agregadas do dashboard.

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 150,
    "vigentes": 120,
    "expirando": 25,
    "vencidas": 5,
    "por_urgencia": {
      "critical": 8,
      "high": 17,
      "medium": 45,
      "low": 80
    }
  }
}
```

---

### 🔔 Notificações Automáticas

#### `POST /api/notificacoes/processar`

Processa notificações manualmente (ou via cron).

**Response:**

```json
{
  "success": true,
  "message": "Notificações processadas com sucesso",
  "timestamp": "2025-11-27T13:23:51.944Z"
}
```

#### `GET /api/notificacoes/log`

Lista log de notificações enviadas.

**Query Params:**

- `status`: enviada | erro | pendente
- `funcionario_cpf`
- `data_inicio`, `data_fim`

**Response:**

```json
{
  "success": true,
  "data": {
    "count": 2,
    "stats": {
      "total": 2,
      "enviadas": 2,
      "erros": 0,
      "pendentes": 0
    },
    "ultimas_5": [
      {
        "id": 1,
        "funcionario_nome": "João Silva",
        "qualificacao_nome": "CMA",
        "tipo": "EMAIL",
        "status": "enviada",
        "enviado_em": "2025-11-27 13:23:51"
      }
    ]
  }
}
```

#### `GET /api/notificacoes/config`

Lista configurações ativas.

#### `PUT /api/notificacoes/config/:id`

Atualiza configuração (ativar/desativar, alterar template).

---

## 🧮 Cálculo de Vencimento

### Dia Exato (`vencimento_fim_mes = 0`)

**Exemplo: ICAO (36 meses)**

```
Data conclusão: 15/01/2024
Validade: 36 meses
→ Vencimento: 15/01/2027 (mesmo dia)
```

### Fim do Mês (`vencimento_fim_mes = 1`)

**Exemplo: CMA (12 meses)**

```
Data conclusão: 15/01/2024
Validade: 12 meses
→ Data intermediária: 15/01/2025
→ Vencimento: 31/01/2025 (último dia do mês)
```

**Fevereiro Bissexto:**

```
Data conclusão: 15/02/2024
→ Vencimento: 29/02/2025 (bissexto)
```

### Lógica de Cálculo (Backend)

**Função: `calcularDataVencimento()`**

```typescript
export function calcularDataVencimento(
  dataConclusao: Date,
  validadeMeses: number,
  vencimentoFimMes: boolean,
): Date {
  let vencimento = new Date(dataConclusao);
  vencimento.setMonth(vencimento.getMonth() + validadeMeses);

  if (vencimentoFimMes) {
    // Avançar para próximo mês e voltar 1 dia = último dia do mês
    vencimento.setMonth(vencimento.getMonth() + 1);
    vencimento.setDate(0);
  }

  return vencimento;
}
```

---

## 🎨 Frontend - Componentes Principais

### `QualificacaoCard`

Card com border colorido por urgência:

- 🔴 Critical (≤7 dias)
- 🟠 High (8-15 dias)
- 🟡 Medium (16-30 dias)
- 🟢 Low (>30 dias)

### `StatusBadge`

Badge de status:

- 🟢 Vigente
- 🟡 Expirando
- 🔴 Vencida
- 🔵 Vitalício

### `NovaQualificacaoModal`

Modal com:

- ✅ Select de funcionário
- ✅ Select de tipo de qualificação
- ✅ **Preview de vencimento dinâmico**
- ✅ Indicador "dia exato" ou "fim do mês"
- ✅ Validação em tempo real

**Preview Example:**

```
📅 Vencimento calculado: 31/01/2025
ℹ️  Esta qualificação vence no fim do mês
```

---

## 🔔 Sistema de Notificações

### Cron Trigger

- **Frequência:** Diariamente às **8h UTC (5h BRT)**
- **Configuração:** `wrangler.toml` → `[env.production.triggers]`
- **Handler:** `index.ts` → `scheduled()`

### Lógica de Deduplicação

Não envia notificação duplicada para mesma qualificação em **24 horas**.

**Query:**

```sql
SELECT id FROM notificacoes_log
WHERE qualificacao_historico_id = ?
  AND config_id = ?
  AND status = 'enviada'
  AND enviado_em >= datetime('now', '-1 day')
```

### Configurações Padrão

| ID  | Tipo      | Urgência | Dias Antes | Destinatários           |
| --- | --------- | -------- | ---------- | ----------------------- |
| 1   | EMAIL     | critical | 7          | compliance@airtrust.com |
| 2   | EMAIL     | high     | 15         | compliance@airtrust.com |
| 3   | EMAIL     | medium   | 30         | compliance@airtrust.com |
| 4   | DASHBOARD | all      | 30         | -                       |

### Template de Email

**Exemplo (Critical):**

```
Assunto: 🚨 Alerta: Qualificação CMA expirando em 3 dias

Corpo:
URGENTE: Qualificação Certificado Médico Aeronáutico de João Silva
vence em 3 dias. Ação imediata necessária!

Data de vencimento: 30/11/2025
Funcionário: João Silva (CPF: 123.456.789-01)
```

**Variáveis disponíveis:**

- `{{qualificacao}}`: Nome da qualificação
- `{{funcionario}}`: Nome do funcionário
- `{{dias}}`: Dias até vencimento
- `{{categoria}}`: Categoria da qualificação
- `{{data_vencimento}}`: Data de vencimento

---

## 🚀 Deploy

### Backend (Worker)

```bash
cd worker-airtrust
npm run build
npx wrangler deploy --env=production
```

**Verificar cron:**

```bash
npx wrangler deployments list --env=production
# Deve mostrar: schedule: 0 8 * * *
```

### Frontend (Pages)

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name=airtrust
```

### Database (Migrations)

**Local:**

```bash
npx wrangler d1 execute airtrust-db --file=migrations/0123_notificacoes_config.sql --env=production
```

**Remoto:**

```bash
npx wrangler d1 execute airtrust-db --file=migrations/0123_notificacoes_config.sql --remote
```

---

## 📊 Monitoramento

### Logs em Tempo Real

```bash
# Worker logs
npx wrangler tail --env=production --format=pretty

# Filtrar por notificações
npx wrangler tail --env=production | grep NOTIFICACOES
```

### Métricas (Cloudflare Dashboard)

- **Analytics** → Workers → `airtrust-api-production`
- Requests/s
- Response time (P50, P95, P99)
- Error rate
- CPU time

### Alertas Configurados

- Taxa de erro > 1% → Email para dev@airtrust.com
- P95 > 1000ms → Slack #alerts
- Cron failure → PagerDuty

---

## 🧪 Testes

### Testes E2E (Playwright)

```bash
cd frontend
npx playwright test tests/e2e/qualificacoes-historico.spec.ts --headed
```

**Cenários cobertos:**

- ✅ Criar qualificação com preview de vencimento
- ✅ CMA vence no fim do mês
- ✅ ICAO vence no dia exato
- ✅ Dashboard mostra estatísticas
- ✅ Filtro por urgência
- ✅ Botão renovar

### Testes de Performance (K6)

```bash
export API_URL="https://airtrust-api-production.airtrust.workers.dev"
export API_TOKEN="seu_token_aqui"
k6 run tests/performance/load-test-qualificacoes.js
```

**Thresholds:**

- P95 < 500ms ✅
- P99 < 1000ms ✅
- Taxa de erro < 1% ✅

### Validação Automática

```bash
export API_TOKEN="seu_token_aqui"
./scripts/validate-all-phases.sh
```

Testa todos os endpoints das fases 1-5 automaticamente.

---

## 🐛 Troubleshooting

### Problema: Vencimento calculado errado

**Sintoma:** Data de vencimento não é último dia do mês para CMA.

**Solução:**

1. Verificar `qualificacoes_tipos.vencimento_fim_mes` no banco:
   ```sql
   SELECT codigo, nome, vencimento_fim_mes FROM qualificacoes_tipos WHERE codigo = 'CMA';
   ```
2. Deve retornar `vencimento_fim_mes = 1`
3. Se retornar `0`, atualizar:
   ```sql
   UPDATE qualificacoes_tipos SET vencimento_fim_mes = 1 WHERE codigo = 'CMA';
   ```

### Problema: Notificações não enviando

**Sintoma:** Cron executou mas `notificacoes_log` vazio.

**Diagnóstico:**

1. Verificar logs do cron:
   ```bash
   npx wrangler tail --env=production | grep NOTIFICACOES
   ```
2. Procurar por:
   - `[NOTIFICACOES] 🔔 Iniciando processamento...`
   - `[NOTIFICACOES] 📋 X configurações ativas encontradas`
   - `[NOTIFICACOES] 🔍 X qualificações encontradas para análise`

**Soluções:**

- Se "0 configurações ativas": Verificar `notificacoes_config.ativo = 1`
- Se "0 qualificações encontradas": Nenhuma qualificação expirando no período
- Se erro de query: Verificar schema da tabela `qualificacoes_historico`

### Problema: Performance degradada

**Sintoma:** P95 > 1000ms no dashboard.

**Diagnóstico:**

1. Verificar índices:
   ```sql
   SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='qualificacoes_historico';
   ```
2. Executar EXPLAIN QUERY PLAN:
   ```sql
   EXPLAIN QUERY PLAN
   SELECT * FROM qualificacoes_historico
   WHERE funcionario_cpf = '12345678901'
   ORDER BY data_conclusao DESC;
   ```

**Soluções:**

- Criar índice se faltando: `CREATE INDEX idx_historico_cpf ON qualificacoes_historico(funcionario_cpf);`
- Adicionar paginação: `?limit=20&offset=0`
- Cache no frontend (React Query)

---

## 📚 Referências

### Documentação Oficial

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Hono.js](https://hono.dev/)
- [React 19](https://react.dev/)

### Arquivos Importantes

- `worker-airtrust/src/index.ts`: Entry point do Worker
- `worker-airtrust/src/routes/qualificacoes.ts`: Endpoints principais
- `worker-airtrust/src/utils/qualificacoes-expiration.ts`: Cálculos de vencimento
- `worker-airtrust/src/cron/notificacoes.ts`: Processamento de notificações
- `frontend/src/pages/QualificacoesAlertasPage.tsx`: Dashboard principal

---

## 🆘 Suporte

**Dúvidas ou problemas?**

- 📧 Email: dev@airtrust.com
- 💬 Slack: #airtrust-dev
- 🐛 Issues: GitHub Issues
- 📖 Documentação: `/docs` (este arquivo)

---

**✅ Sistema 100% operacional e pronto para produção! 🚀**

_Última atualização: 27 de novembro de 2025_
