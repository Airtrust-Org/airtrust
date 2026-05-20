# 📊 CHECKLIST DE MONITORAMENTO PÓS-DEPLOY (24-48h)

**Versão Deployada**: 41d17da6-9214-41a9-8770-c5af03073512  
**Data Deploy**: 11 de Novembro de 2025  
**Monitoramento Início**: [HOJE]

---

## 📋 DIA 1: PRIMEIRAS 24 HORAS (CRÍTICO)

### ✅ Verificações Técnicas Básicas

- [ ] **Sistema Online**: Acessar https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
- [ ] **Health Check**: GET /api/v2/system/health → Status 200 OK
- [ ] **Database**: SELECT 1 FROM sqlite_master → Conectado
- [ ] **Worker Startup**: Verificar que está < 50ms (target: 40ms)

### ⚡ Performance (Tempo de Resposta)

| Endpoint                 | P50     | P95     | P99    | Status   |
| ------------------------ | ------- | ------- | ------ | -------- |
| GET /api/v2/funcionarios | < 200ms | < 500ms | < 1s   | ⏳ Medir |
| GET /api/v2/habilitacoes | < 300ms | < 800ms | < 2s   | ⏳ Medir |
| GET /api/v2/certificados | < 200ms | < 600ms | < 1.5s | ⏳ Medir |
| GET /api/v2/agendamentos | < 150ms | < 400ms | < 1s   | ⏳ Medir |

**Como medir:**

```bash
# 100 requisições com timing
for i in {1..100}; do
  time curl https://[URL]/api/v2/funcionarios?limit=50
done | grep real

# Analisar resultados
# Esperado: Maioria < 500ms
```

### 🔒 Segurança: Tentativas de SQL Injection

| Teste             | URL                                                   | Esperado        | Status    |
| ----------------- | ----------------------------------------------------- | --------------- | --------- |
| **Válido**        | `/api/v2/system/health`                               | 200 OK          | ⏳ Testar |
| **Injeção 1**     | `/api/v2/system/info?table=funcionarios;DROP TABLE--` | 200 (bloqueado) | ⏳ Testar |
| **Injeção 2**     | `/api/v2/system/info?table=nonexistent`               | 200 (sem dados) | ⏳ Testar |
| **Tabela Antiga** | `/api/v2/system/info?table=certificacoes`             | 200 (erro)      | ⏳ Testar |

**Como testar:**

```bash
# SQL Injection attempt
curl "https://[URL]/api/v2/system/health/legacy"
# Esperado: Retornar checks normalmente

# Não deve expor dados sensíveis
curl "https://[URL]/api/v2/system/info"
# Esperado: Apenas tabelas whitelisted
```

### 📊 Métricas de Erro

- [ ] **500 Errors**: Nenhum em logs (ou < 1 por hora)
- [ ] **4xx Errors**: Esperado alguns 400/404, anormal se muitos 403
- [ ] **Database Errors**: Nenhum (índices falhando seria crítico)
- [ ] **Timeout Errors**: < 1% de requisições

**Onde verificar:**

- Cloudflare Dashboard: Workers → Logs
- Application Insights (se tiver)
- Logs de stderr do Worker

### 💾 Storage & Resource Usage

- [ ] **Database Size**: Verificar que não cresceu anormalmente

  ```bash
  # Antes: 4.41 MB
  # Esperado: 4.41-4.45 MB (normal)
  # Alerta: > 5 MB (algo errado)
  ```

- [ ] **Worker Memory**: Típicamente 50-150MB (normal)

  - Alerta: > 200MB
  - Crítico: > 300MB

- [ ] **CPU Time**: Monitorar em Cloudflare
  - Normal: < 100ms por request
  - Alerta: > 200ms

### 🚨 Alertas Críticos (Reagir Imediatamente)

Se algum desses acontecer, **ALERTA VERMELHO**:

```
❌ Database offline/erro de conexão
   → Action: Verificar status do D1
   → Rollback: Se necessário

❌ Worker não iniciando (crash loop)
   → Action: Verificar logs de erro
   → Rollback: Deploy anterior

❌ Muitos 500 errors
   → Action: Investigar logs
   → Rollback: Se impactando usuários

❌ Performance degradada (> 5s)
   → Action: Verificar índices
   → Rollback: Se crítico

❌ Falhas de segurança (SQL injection funcionando)
   → Action: CRÍTICO - Hotfix imediato
   → Rollback: Deploy anterior
```

---

## 📋 DIA 2: 24-48 HORAS (VALIDAÇÃO)

### ✅ Performance: Validar Ganhos

Compare com métricas anteriores:

```
ANTES (sem índices):
- Dashboard: 5-10s
- Habilitações: 2-4s (936 registros!)
- Certificados: 1-2s

DEPOIS (com índices):
- Dashboard: 1-2s (esperado)
- Habilitações: 300-500ms (esperado)
- Certificados: 150-300ms (esperado)

Meta: Alcançar +80% de melhoria
```

**Checklist:**

- [ ] Dashboard carregando em < 2s
- [ ] Queries habilitações em < 500ms
- [ ] Queries certificados em < 300ms
- [ ] Nenhuma query > 2s (p95)

### 📊 Índices: Verificar Uso

**Confirmar que índices estão sendo usados:**

```bash
# Conectar ao D1 e executar
SELECT name, tbl_name FROM sqlite_master
WHERE type='index'
AND (name LIKE '%_v5' OR name LIKE '%_v6')
ORDER BY tbl_name;

# Esperado: 15 índices
# idx_agend_func_id_v5, idx_agend_sim_id_v5, ...
# idx_cert_func_id_v6, idx_hab_func_id_v6, ...
```

### 👥 Feedback de Usuários

- [ ] Nenhum relato de slowness
- [ ] Nenhum relato de erros
- [ ] Feedback positivo? 😊

**Se receber feedback negativo:**

- Investigar qual endpoint está lento
- Adicionar mais índices se necessário
- Comunicar atualizações

### 🔄 Operação Normal

- [ ] Sistema funcionando normalmente
- [ ] Dados consistentes
- [ ] Auditoria/logs funcionando
- [ ] Backups funcionando

---

## 📋 SEMANA 1: VALIDAÇÃO EXTENSIVA

### 📈 Análise de Performance

**Criar gráfico com:**

- Tempo de resposta por endpoint
- Distribuição de latência (P50, P95, P99)
- Taxa de erro
- CPU/Memory usage

**Ferramentas:**

- Cloudflare Analytics
- Application Insights
- Custom logging

### 🔍 Slow Query Analysis

Se houver queries lentas:

```bash
# Analisar query plan
EXPLAIN QUERY PLAN
SELECT * FROM habilitacoes
WHERE funcionario_id = 123
AND deleted_at IS NULL;

# Esperado: Use índice idx_hab_func_id_v6
# Se não usar: Precisamos de outro índice
```

### 📋 Validação Técnica Final

- [ ] Todos os endpoints respondendo < 1s (p95)
- [ ] Nenhum erro 500 em 7 dias
- [ ] CPU Worker < 100ms/request
- [ ] Memory Worker estável
- [ ] Taxa de erro < 0.1%

### 🎯 Decisões Pós-Validação

#### ✅ Se tudo está bom:

- Sistema está pronto para produção full
- Monitoramento pode passar para "normal"
- Considerar Fase 2 (opcional)

#### ⚠️ Se há problemas:

- Investigar causa
- Adicionar mais índices se necessário
- Considerar hotfix
- Comunicar timeline

---

## 📞 ESCALAÇÃO

### Contatos

| Situação                | Quem Chamar | Urgência   |
| ----------------------- | ----------- | ---------- |
| Performance ruim        | Engenharia  | 🟡 Alta    |
| SQL Injection detectada | Security    | 🔴 Crítica |
| Database offline        | DevOps      | 🔴 Crítica |
| Muitos erros 500        | SRE         | 🟡 Alta    |
| Feedback negativo       | Product     | 🟠 Média   |

### Documentação de Rollback

Se precisar fazer rollback:

```bash
# 1. Identificar versão anterior
git log --oneline | head -5

# 2. Voltar para versão anterior
git revert 5bc2f21

# 3. Deploy anterior
npx wrangler deploy

# 4. Documentar incidente
# - O que falhou?
# - Por que falhou?
# - Como foi resolvido?
# - Como evitar no futuro?
```

---

## 📊 TEMPLATE DE RELATÓRIO DIÁRIO

Copie e preencha diariamente:

```markdown
# Relatório de Monitoramento - [DATA]

## Status Geral

- [ ] 🟢 Tudo ok
- [ ] 🟡 Alertas menores
- [ ] 🔴 Problemas críticos

## Métricas

- P50 latência: \_\_\_ ms
- P95 latência: \_\_\_ ms
- Taxa de erro: \_\_\_ %
- CPU Worker: \_\_\_ %
- Memory: \_\_\_ MB

## Incidentes

(Lista qualquer problema encontrado)

## Ações Tomadas

(O que foi feito para resolver)

## Próximos Passos

(O que monitorar amanhã)

## Notas

(Observações importantes)
```

---

## ✅ QUANDO CONSIDERAR SUCESSO

Sistema está **PRONTO PARA PRODUÇÃO FULL** quando:

- ✅ 0 SQL injections detectadas
- ✅ Performance: +85% validado
- ✅ Build: Estável em 2-3s
- ✅ Erros: < 0.1% taxa
- ✅ Usuários: Feedback positivo
- ✅ Logs: Limpos e normais
- ✅ Índices: Funcionando e em uso

---

## 🎉 PRÓXIMAS FASES (OPCIONAL)

Se performance está ótima, considerar:

**Fase 2: Frontend Optimization** (40h)

- React Query migration
- Code splitting
- Lazy loading
- Performance: +50-70% esperado

Mas somente se Fase 1 estiver 100% estável! ✅

---

**Monitore bem. Boa sorte! 🚀**

Preparado por: GitHub Copilot  
Data: 11 de Novembro de 2025
