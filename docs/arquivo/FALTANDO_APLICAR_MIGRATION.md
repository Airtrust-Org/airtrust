# ⚠️ AÇÃO NECESSÁRIA: Aplicar Migration de Compliance

**Status:** Migration SQL criada mas não aplicada no D1  
**Motivo:** Token atual sem permissões D1 Edit

---

## 🎯 O QUE FAZER AGORA

### OPÇÃO 1: Via Cloudflare Dashboard (RECOMENDADO - Mais Fácil)

1. **Acesse o Dashboard:**

   ```
   https://dash.cloudflare.com/4dca4e5fddc6a351651dd224f456586f/workers-and-pages/d1
   ```

2. **Selecione o database:** `airtrust-db`

3. **Clique na aba "Console"**

4. **Copie o SQL do arquivo:**

   ```bash
   migrations/130_compliance_MANUAL_APPLY.sql
   ```

5. **Cole no console e clique em "Execute"**

6. **Verifique a mensagem de sucesso:**
   ```
   Tabela historico_compliance criada com sucesso
   ```

---

### OPÇÃO 2: Via Wrangler CLI (Requer Ajuste de Token)

```bash
# Ajustar permissões do token em:
# https://dash.cloudflare.com/profile/api-tokens

# Depois executar:
wrangler d1 execute airtrust-db --remote --file=migrations/130_compliance_MANUAL_APPLY.sql
```

**Permissões necessárias:**

- ✅ D1 Database → Read
- ✅ D1 Database → Edit
- ✅ Workers → Read

---

## ✅ APÓS APLICAR A MIGRATION

### 1. Verificar tabela criada

```bash
wrangler d1 execute airtrust-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='historico_compliance';"
```

**Esperado:** Retornar `historico_compliance`

### 2. Testar endpoint de estatísticas

```bash
curl https://airtrust-api-production.airtrust.workers.dev/api/compliance/stats \
  -H "Authorization: Bearer <TOKEN>"
```

**Esperado:**

```json
{
  "success": true,
  "data": {
    "total": 0,
    "conformes": 0,
    "a_vencer": 0,
    "vencidos": 0,
    "pendentes": 0,
    "percentual_medio": 0
  }
}
```

### 3. Executar recálculo inicial

```bash
curl -X POST https://airtrust-api-production.airtrust.workers.dev/api/compliance/recalculate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"scope":"all","dry_run":false}'
```

**Esperado:**

```json
{
  "success": true,
  "message": "Recálculo concluído com sucesso",
  "data": {
    "qualificacoes_processadas": 638,
    "licencas_processadas": 42,
    "registros_criados": 680,
    "execution_time_ms": 1250
  }
}
```

### 4. Acessar dashboard frontend

```
https://airtrust-frontend.airtrust.workers.dev/configuracoes/compliance
```

**Esperado:** Dashboard mostrando estatísticas de 680 registros

---

## 📋 CHECKLIST PÓS-APLICAÇÃO

- [ ] Tabela `historico_compliance` criada
- [ ] Índices criados (4 índices)
- [ ] View `v_compliance_funcionario_atual` criada
- [ ] Endpoint `/api/compliance/stats` retornando 200
- [ ] Recálculo inicial executado (680 registros)
- [ ] Dashboard `/configuracoes/compliance` acessível
- [ ] Estatísticas exibindo corretamente

---

## 🐛 Troubleshooting

### Erro: "table historico_compliance already exists"

**Solução:** Tabela já foi criada. Pular para passo 2 (Testar endpoint)

### Erro: "Authentication error [code: 10000]"

**Solução:** Usar OPÇÃO 1 (Dashboard) em vez de CLI

### Erro: "Cannot find name 'historico_compliance'"

**Solução:** Aguardar 30s após aplicar migration (cache D1)

---

**Data:** 28/11/2025  
**Responsável:** Aplicação manual via Dashboard
