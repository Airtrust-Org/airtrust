# 🗺️ ROADMAP FASES 3-6 - Qualifications History System

**Status Atual:** FASE 2 ✅ Completa | FASE 3 ⏳ Próxima  
**Data:** 27/11/2025  
**Total Fases:** 6

---

## 📋 FASE 3: REST API Endpoints Completos

### Objectivos

- Implementar endpoints para cálculo de vencimento
- Criar endpoints de alertas e estatísticas
- Implementar renovação de qualificações
- Criar relatórios de compliance

### Endpoints a Implementar

#### 1. Cálculo de Vencimento

```typescript
// Calcula data de vencimento dinamicamente
GET /api/qualificacoes/calcular-vencimento
  ?data_conclusao=2024-01-15
  &validade_meses=12
  &vencimento_fim_mes=0

Response: {
  data_conclusao: "2024-01-15",
  data_vencimento: "2025-01-15",
  dias_validade: 365,
  status: "vigente"
}
```

#### 2. Alertas por Urgência

```typescript
// Retorna qualificações expirando
GET /api/qualificacoes/alertas
  ?urgencia=high
  &dias_antes=30
  &limit=50

Response: {
  success: true,
  data: [
    {
      id: 1,
      funcionario_nome: "João Silva",
      tipo_nome: "CMA",
      data_vencimento: "2025-01-20",
      dias_ate_vencimento: 10,
      urgencia: "critical"
    }
  ],
  meta: { count: 12, urgencias: { critical: 5, high: 7, ... } }
}
```

#### 3. Estatísticas por Funcionário

```typescript
// Stats consolidadas de um funcionário
GET /api/qualificacoes/stats/funcionario/:funcionario_id

Response: {
  funcionario_id: 1,
  total_qualificacoes: 8,
  vigentes: 6,
  expirando: 2,
  vencidas: 0,
  proxima_expiracao: {
    data: "2025-01-20",
    dias: 10,
    tipo: "CMA"
  }
}
```

#### 4. Estatísticas de Compliance

```typescript
// Stats globais da organização
GET /api/qualificacoes/stats/compliance
  ?periodo=mensal
  &data_inicio=2024-01-01
  &data_fim=2024-12-31

Response: {
  total_funcionarios: 150,
  com_qualificacoes_vigentes: 145,
  com_qualificacoes_expirando: 8,
  com_qualificacoes_vencidas: 2,
  conformidade_percentual: 96.7,
  alertas_por_urgencia: {
    critical: 5,
    high: 8,
    medium: 12,
    low: 15
  }
}
```

#### 5. Renovação de Qualificação

```typescript
// Registra renovação
POST /api/qualificacoes/renovar
{
  qualificacao_historico_id: 123,
  data_conclusao: "2025-01-15",
  certificado_url: "https://r2.bucket/cert.pdf",
  observacoes: "Renovação automática"
}

Response: {
  id: 124,
  data_vencimento: "2026-01-15",
  status: "vigente",
  proxima_renovacao: "2025-12-15"
}
```

#### 6. Busca Avançada

```typescript
// Busca com múltiplos filtros
POST /api/qualificacoes/buscar
{
  funcionario_id: [1, 2, 3],
  status: "expirando",
  urgencia: ["high", "critical"],
  categoria: "MEDICO",
  data_inicio: "2024-01-01",
  data_fim: "2024-12-31",
  search: "joão"
}

Response: {
  data: [ ... ],
  meta: { total: 45, count: 12, page: 1 }
}
```

#### 7. Relatório de Compliance

```typescript
// Gera relatório completo
GET /api/qualificacoes/relatorio/compliance
  ?periodo=trimestral
  &formato=json

Response: {
  data_relatorio: "2025-01-27",
  periodo: { inicio: "2024-10-01", fim: "2024-12-31" },
  resumo: { ... },
  alertas_por_urgencia: { ... },
  qualificacoes_criticas: [ ... ]
}
```

#### 8. Exportar para CSV

```typescript
// Exporta dados
GET /api/qualificacoes/relatorio/export
  ?formato=csv
  &status=expirando

Response: CSV file download
```

### Arquivos a Criar/Modificar

- [ ] `worker-airtrust/src/routes/qualificacoes.ts`
  - Adicionar endpoints GET /alertas, /stats/funcionario, /stats/compliance
  - Adicionar POST /renovar
  - Adicionar POST /buscar
  - Adicionar GET /relatorio/\*
  - Adicionar GET /calcular-vencimento

### Validações

- Autenticação obrigatória (JWT)
- RBAC: apenas admin/compliance veem alertas
- Paginação com offset/limit
- Filtros validados via Zod

### Testes

- [ ] Testes unitários para cada endpoint
- [ ] Testes de autenticação/autorização
- [ ] Testes de paginação
- [ ] Testes de relatórios

---

## 📋 FASE 4: Frontend Forms & Display

### Objectivos

- Criar componentes para exibição de vencimento
- Implementar alertas visuais
- Criar histórico de renovações
- Dashboard de compliance

### Componentes a Criar

1. **CardVencimento** - Exibe status visual

```tsx
<CardVencimento dataVencimento="2025-01-20" status="expirando" urgencia="high" />
```

2. **AlertaVencimento** - Banner de alerta

```tsx
<AlertaVencimento funcionario="João Silva" qualificacao="CMA" dias={10} urgencia="critical" />
```

3. **HistoricoRenovacoes** - Timeline de renovações

```tsx
<HistoricoRenovacoes
  qualificacao_id={123}
  renovacoes={[...]}
/>
```

4. **DashboardCompliance** - Dashboard gerencial

```tsx
<DashboardCompliance periodo="mensal" conformidade={96.7} alertas={35} />
```

5. **ListaAlertasExpirando** - Tabela de alertas

```tsx
<ListaAlertasExpirando filtros={{ urgencia: 'high' }} onRenovar={handleRenovacao} />
```

### Páginas a Criar

- [ ] `/qualificacoes/alertas` - Dashboard de alertas
- [ ] `/qualificacoes/compliance` - Relatório de compliance
- [ ] `/qualificacoes/historico` - Histórico completo
- [ ] `/funcionarios/:id/qualificacoes` - Detalhes por funcionário

### Estilos

- Usar Design System AirTrust (Apple style)
- Cores por urgência:
  - 🔴 Critical: #DC2626
  - 🟠 High: #EA580C
  - 🟡 Medium: #F59E0B
  - 🟢 Low: #10B981

---

## 📋 FASE 5: Notificações Automáticas

### Objectivos

- Enviar emails de alerta
- Notificações dashboard
- SMS opcional
- Webhooks para sistemas externos

### Implementação

1. **Email Alerts**

```typescript
// Enviar email quando qualificação expira em X dias
- Template: "Qualificação expirando em 7 dias"
- To: funcionario@email.com, compliance@email.com
- Include: link para renovar
```

2. **Dashboard Alerts**

```typescript
// Mostrar notificação no dashboard
- Toast no topo
- Sino de notificação
- Badge com contagem
```

3. **SMS Alerts** (opcional)

```typescript
// Enviar SMS para celular
- Apenas para urgência "critical"
- Include: data vencimento, link
```

4. **Webhooks**

```typescript
// Integrar com sistemas externos
POST https://external-system/webhooks/qualificacao-expirando
{
  event: "qualificacao.expirando",
  data: { funcionario_id, tipo, dias, urgencia }
}
```

### Configurações

- [ ] Criar tabela `notificacoes_config`
- [ ] CRUD de configurações de notificação
- [ ] Scheduler de envio (Cron via D1)
- [ ] Log de notificações enviadas

---

## 📋 FASE 6: Testes E2E & Performance

### Objectivos

- Testar fluxo completo
- Validar performance
- Carga/stress testing
- User acceptance testing

### Testes E2E

1. **Fluxo de Criação**

```
1. Login como admin
2. Criar novo tipo de qualificação
3. Atribuir a funcionário
4. Verificar cálculo de vencimento
5. Validar campo vencimento_fim_mes
6. Verificar no relatório
```

2. **Fluxo de Renovação**

```
1. Login como compliance
2. Ver alertas de expirando
3. Clicar para renovar
4. Preencher data conclusão
5. Upload certificado
6. Validar novo vencimento
7. Verificar histórico
```

3. **Fluxo de Relatório**

```
1. Gerar relatório compliance
2. Filtrar por período
3. Exportar para CSV
4. Validar dados
5. Verificar cálculos
```

### Performance Testing

- Load test: 1000 usuários simultâneos
- Latência target: <500ms P95
- Throughput: >1000 req/sec
- Cache hit rate: >80%

### Métricas

- [ ] Tempo de cálculo de vencimento: <10ms
- [ ] Tempo de listagem de alertas: <100ms
- [ ] Tempo de geração de relatório: <500ms
- [ ] Taxa de erro: <0.1%

---

## 📊 Timeline Estimado

| Fase      | Estimativa | Status      |
| --------- | ---------- | ----------- |
| 1         | 15min      | ✅ Completa |
| 2         | 20min      | ✅ Completa |
| 3         | 2h         | ⏳ Próxima  |
| 4         | 3h         | ⏳ Depois   |
| 5         | 2h         | ⏳ Depois   |
| 6         | 3h         | ⏳ Final    |
| **TOTAL** | **10.5h**  |             |

---

## 🎯 Prioridades

### Must-Have (MVP)

- ✅ FASE 1 & 2
- [ ] FASE 3: Endpoints básicos (calcular, alertas, stats)
- [ ] FASE 4: Dashboard de alertas
- [ ] FASE 5: Email básico

### Should-Have

- [ ] FASE 3: Busca avançada, renovação
- [ ] FASE 4: Histórico, compliance detail
- [ ] FASE 5: SMS, webhooks

### Nice-to-Have

- [ ] FASE 6: Stress testing
- [ ] Otimizações de cache
- [ ] Analytics e BI

---

## 📝 Checklist Para Prosseguir

### FASE 3 Readiness

- [x] Tipos TypeScript definidos
- [x] Funções de cálculo implementadas
- [x] Testes unitários completos
- [x] Frontend integrado
- [ ] Design dos endpoints documentado
- [ ] Validação com Zod schemas
- [ ] Error handling definido
- [ ] Rate limiting configurado

### Começar FASE 3

```bash
# Próximo comando para usuário
# "faca a fase 3"
```

---

**Roadmap preparado em:** 27/11/2025 12:20 BRT
**Próxima etapa:** FASE 3 - REST API Endpoints
**Status:** Pronto para começar quando solicitado
