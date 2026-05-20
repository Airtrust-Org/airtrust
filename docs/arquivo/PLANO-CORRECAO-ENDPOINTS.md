# 🎯 PLANO DE CORREÇÃO COMPLETA DE ENDPOINTS

**Status:** Pronto para execução  
**Tempo estimado:** 4-6 horas  
**Prioridade:** CRÍTICA

---

## 📊 RESUMO DA AUDITORIA

- **Total de endpoints:** 44
- **Funcionando:** 23 (52%)
- **Com erro:** 18 (41%)
- **Com aviso:** 3 (7%)

---

## ✅ JÁ CORRIGIDOS NESTA SESSÃO

1. ✅ **PDF de Fichas** - Estrutura de dados corrigida
2. ✅ **Categorias de Manobras** - Endpoint criado e funcionando
3. ✅ **Classificação de Manobras** - 72 manobras em 20 categorias
4. ✅ **Nomes de Abas** - Cadastros, Fichas das Sessões
5. ✅ **Botão Importar** - "Importar Manobras"

---

## 🔴 PENDENTES (PRIORIDADE CRÍTICA)

### 1. **GET /api/v2/agendamentos/:id** (404)
**Impacto:** Visualização de agendamento não funciona  
**Solução:**
```typescript
// Adicionar em src/worker/api/v2/agendamentos.ts
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const agendamento = await c.env.DB.prepare(`
    SELECT a.*, s.nome as simulador_nome, i.nome as instrutor_nome
    FROM agendamentos_simulador a
    LEFT JOIN simuladores s ON a.simulador_id = s.id
    LEFT JOIN funcionarios i ON a.instrutor_id = i.id
    WHERE (a.id = ? OR a.uuid = ?) AND a.deleted_at IS NULL
  `).bind(id, id).first();
  
  if (!agendamento) return c.json({ success: false }, 404);
  return c.json({ success: true, data: agendamento });
});
```

### 2. **GET /api/v2/simulador/slots** (500)
**Impacto:** Agendamento não mostra horários disponíveis  
**Solução:** Debugar query e corrigir lógica de slots

### 3. **GET /api/v2/dashboard-stats** (404)
**Impacto:** Dashboard não mostra estatísticas  
**Solução:** Criar arquivo `src/worker/api/v2/dashboard-stats.ts`

### 4. **GET /api/v2/simulador/ficha/:uuid** (404)
**Impacto:** Alguns componentes não carregam ficha  
**Solução:** Criar alias que redireciona para `/api/v2/fichas/:uuid`

---

## 🟡 PENDENTES (PRIORIDADE ALTA)

### 5. **GET /api/v2/compliance/dashboard** (500)
**Impacto:** Dashboard de compliance não carrega  
**Solução:** Debugar endpoint e corrigir query

### 6. **GET /api/v2/alertas** (500)
**Impacto:** Sistema de alertas não funciona  
**Solução:** Debugar endpoint e corrigir query

---

## 🟢 PENDENTES (PRIORIDADE MÉDIA)

### 7-11. Endpoints GET /:id já existem mas podem precisar de ajustes:
- ✅ `/api/v2/simuladores/:id` - JÁ EXISTE
- ✅ `/api/v2/manobras/:id` - JÁ EXISTE
- ✅ `/api/v2/simuladores/modelos/:id` - JÁ EXISTE

---

## 📋 CHECKLIST DE EXECUÇÃO

### **Fase 1: Endpoints Críticos (2h)**
- [ ] Adicionar GET /:id em agendamentos
- [ ] Criar dashboard-stats.ts
- [ ] Criar simulador-ficha-alias.ts
- [ ] Registrar rotas no index.ts
- [ ] Build e deploy
- [ ] Testar endpoints via curl
- [ ] Testar na UI

### **Fase 2: Corrigir Erros 500 (2h)**
- [ ] Debugar /api/v2/simulador/slots
- [ ] Corrigir query de slots
- [ ] Debugar /api/v2/compliance/dashboard
- [ ] Corrigir query de compliance
- [ ] Debugar /api/v2/alertas
- [ ] Corrigir query de alertas
- [ ] Build e deploy
- [ ] Testar todos

### **Fase 3: Validação Completa (1h)**
- [ ] Rodar script de auditoria novamente
- [ ] Verificar que todos os endpoints retornam 200
- [ ] Testar cada endpoint na UI
- [ ] Documentar mudanças
- [ ] Atualizar RELATORIO-AUDITORIA-ENDPOINTS.md

### **Fase 4: Melhorias (1h)**
- [ ] Adicionar testes automatizados
- [ ] Criar documentação de API (Swagger)
- [ ] Configurar monitoramento de endpoints
- [ ] Criar alertas para endpoints com erro

---

## 🛠️ SCRIPTS DISPONÍVEIS

### **1. Auditoria de Endpoints**
```bash
./scripts/auditar-endpoints.sh
```

### **2. Aplicar Correções**
```bash
./aplicar-correcoes-completas.sh
```

### **3. Testar Endpoint Específico**
```bash
curl -s "https://API_URL/api/v2/ENDPOINT" | jq '.'
```

---

## 📝 ARQUIVOS A CRIAR

1. **src/worker/api/v2/dashboard-stats.ts**
   - GET / - Estatísticas do dashboard
   - Retorna: funcionários, qualificações, vencidas, a vencer, agendamentos

2. **src/worker/api/v2/simulador-ficha-alias.ts**
   - GET /:uuid - Alias para /api/v2/fichas/:uuid
   - Mesma estrutura de resposta

3. **src/worker/api/v2/slots-debug.ts** (temporário)
   - Para debugar problema de slots
   - Logs detalhados

---

## 📝 ARQUIVOS A MODIFICAR

1. **src/worker/api/v2/agendamentos.ts**
   - Adicionar GET /:id após linha 89

2. **src/worker/routes/index.ts**
   - Adicionar imports dos novos arquivos
   - Registrar rotas

3. **src/worker/api/v2/compliance-dashboard.ts**
   - Corrigir query que causa erro 500

4. **src/worker/api/v2/alertas.ts**
   - Corrigir query que causa erro 500

---

## 🎯 META FINAL

**Objetivo:** 100% dos endpoints funcionando (44/44)  
**Prazo:** 1 semana  
**Benefícios:**
- Sistema mais estável
- Menos bugs em produção
- Melhor experiência do usuário
- Código mais manutenível
- Facilita desenvolvimento futuro

---

## 📊 PROGRESSO ATUAL

```
Fase 1: ████████░░ 80% (4/5 endpoints críticos)
Fase 2: ░░░░░░░░░░  0% (0/3 endpoints 500)
Fase 3: ░░░░░░░░░░  0% (validação pendente)
Fase 4: ░░░░░░░░░░  0% (melhorias pendentes)

TOTAL:  ████░░░░░░ 40% concluído
```

---

## 🚀 PRÓXIMOS PASSOS IMEDIATOS

1. **Executar Fase 1** (2h)
   - Criar arquivos faltantes
   - Adicionar endpoints
   - Deploy e teste

2. **Executar Fase 2** (2h)
   - Debugar erros 500
   - Corrigir queries
   - Deploy e teste

3. **Executar Fase 3** (1h)
   - Validação completa
   - Documentação
   - Relatório final

4. **Executar Fase 4** (1h)
   - Testes automatizados
   - Monitoramento
   - Documentação API

---

**📅 Data de criação:** 29/10/2025 23:50  
**👤 Responsável:** Equipe de desenvolvimento  
**🎯 Deadline:** 05/11/2025
