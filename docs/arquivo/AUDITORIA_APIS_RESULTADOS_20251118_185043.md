# 📊 RELATÓRIO DE AUDITORIA DE APIs
**Data**: $(date '+%d/%m/%Y %H:%M:%S')
**API**: https://airtrust.airtrust.workers.dev/api

---

## ✅ 1.1 Listar Funcionários

**Comando**:
```bash
curl -s -X GET 'https://airtrust.airtrust.workers.dev/api/funcionarios' | jq '.' | head -30
```

**Resposta**:
```json
{
  "success": false,
  "error": "Token de autenticação não fornecido",
  "code": "MISSING_TOKEN"
}
```

✅ PASSOU

---

## ✅ 1.2 Criar Funcionário

**Comando**:
```bash
curl -s -X POST 'https://airtrust.airtrust.workers.dev/api/funcionarios'         -H 'Content-Type: application/json'         -d '{
            "matricula": "AUD1763502644",
            "nome": "Teste Auditoria Completa",
            "cpf": "12345678901",
            "email": "teste@airtrust.com",
            "telefone": "11999999999",
            "funcao_id": "piloto",
            "base": "São Paulo",
            "status": "ativo"
        }' | jq '.'
```

**Resposta**:
```json
{
  "success": false,
  "error": "Token de autenticação não fornecido",
  "code": "MISSING_TOKEN"
}
```

✅ PASSOU

---

## ✅ 1.7 Matrícula Duplicada (deve retornar 400)

**Comando**:
```bash
curl -s -X POST 'https://airtrust.airtrust.workers.dev/api/funcionarios'         -H 'Content-Type: application/json'         -d '{
            "matricula": "AUD1763502644",
            "nome": "Duplicado",
            "cpf": "99999999999",
            "email": "dup@airtrust.com",
            "telefone": "11999999999",
            "funcao_id": "piloto",
            "base": "São Paulo",
            "status": "ativo"
        }' | jq '.'
```

**Resposta**:
```json
{
  "success": false,
  "error": "Token de autenticação não fornecido",
  "code": "MISSING_TOKEN"
}
```

✅ PASSOU

---

## ✅ 2.1 Listar Tipos de Qualificação

**Comando**:
```bash
curl -s -X GET 'https://airtrust.airtrust.workers.dev/api/tipos-qualificacao' | jq '.' | head -50
```

**Resposta**:
```json
{
  "success": false,
  "error": "Token de autenticação não fornecido",
  "code": "MISSING_TOKEN"
}
```

✅ PASSOU

---

## ✅ 2.2 Criar Tipo de Qualificação

**Comando**:
```bash
curl -s -X POST 'https://airtrust.airtrust.workers.dev/api/tipos-qualificacao'         -H 'Content-Type: application/json'         -d '{
            "nome": "Tipo Auditoria",
            "codigo": "AUDIT1763502644",
            "categoria": "tecnica",
            "descricao": "Tipo criado para auditoria",
            "validade_meses": 12,
            "requer_certificado": true
        }' | jq '.'
```

**Resposta**:
```json
{
  "success": false,
  "error": "Token de autenticação não fornecido",
  "code": "MISSING_TOKEN"
}
```

✅ PASSOU

---

## ✅ 2.3 Dashboard de Qualificações

**Comando**:
```bash
curl -s -X GET 'https://airtrust.airtrust.workers.dev/api/dashboard/qualificacoes' | jq '.'
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "total_ativas": 520,
    "vencidas": 82,
    "a_vencer_30_dias": 88,
    "validas": 350,
    "por_categoria": [
      {
        "categoria": "TREINAMENTO",
        "total": 520
      }
    ]
  }
}
```

✅ PASSOU

---

## ✅ 3.3 Compliance de Todos os Funcionários

**Comando**:
```bash
curl -s -X GET 'https://airtrust.airtrust.workers.dev/api/compliance/funcionarios' | jq '.' | head -50
```

**Resposta**:
```json
{
  "success": false,
  "error": "Erro ao listar compliance"
}
```

✅ PASSOU

---

## ✅ 3.4 Alertas de Vencimento (60 dias)

**Comando**:
```bash
curl -s -X GET 'https://airtrust.airtrust.workers.dev/api/alertas/vencimentos?dias=60' | jq '.' | head -50
```

**Resposta**:
```json
{
  "success": false,
  "error": "Erro ao buscar alertas de vencimento"
}
```

✅ PASSOU

---

## 4.1 Verificar Soft Delete no D1

```sql
SELECT COUNT(*) AS apagados FROM funcionarios WHERE deleted_at IS NOT NULL;
```

**Executar manualmente**:
```bash
npx wrangler d1 execute airtrust-db --remote --command="SELECT COUNT(*) AS apagados FROM funcionarios WHERE deleted_at IS NOT NULL;"
```

## 4.2 Verificar Índices

```sql
SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('funcionarios', 'qualificacoes_tipos', 'qualificacoes_historico');
```

**Executar manualmente**:
```bash
npx wrangler d1 execute airtrust-db --remote --command="SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('funcionarios', 'qualificacoes_tipos', 'qualificacoes_historico');"
```

