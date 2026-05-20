# 🔍 AUDITORIA NÍVEL 3 - EXECUTAR AGORA

**Data:** 23/10/2025  
**Status:** PRONTO PARA EXECUTAR  
**Duração estimada:** 8-12 horas

---

## ✅ FASE 1 COMPLETA

**Resultados:**
- 504 arquivos TypeScript
- 104 endpoints API
- 212 componentes React
- 51.008 linhas backend
- 52.688 linhas frontend

**Arquivos gerados:**
- `auditoria-nivel3/fase1-resumo.txt`
- `auditoria-nivel3/arquivos-typescript.txt`
- `auditoria-nivel3/endpoints-api.txt`
- `auditoria-nivel3/componentes-react.txt`

---

## 🎯 PRÓXIMAS FASES (EXECUTAR MANUALMENTE)

### FASE 2: Mapear TODAS as tabelas do banco

```bash
cd /Users/filipedaumas/Projects/airtrust-v1/auditoria-nivel3

# Listar tabelas
npx wrangler d1 execute airtrust-db --remote --command="
SELECT name FROM sqlite_master 
WHERE type='table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
" > tabelas-raw.txt

# Para cada tabela, pegar schema
# (fazer manualmente para cada tabela encontrada)
npx wrangler d1 execute airtrust-db --remote --command="PRAGMA table_info(funcionarios);"
npx wrangler d1 execute airtrust-db --remote --command="PRAGMA table_info(aeronaves);"
# ... etc
```

### FASE 3: Procurar bugs conhecidos

```bash
cd /Users/filipedaumas/Projects/airtrust-v1

# Bug 1: Array.isArray sem data.data
grep -r "Array.isArray(data)" src/react-app --include="*.tsx" > auditoria-nivel3/bug-array-isarray.txt

# Bug 2: Endpoints sem try/catch
grep -r "app.get\|app.post" src/worker/api --include="*.ts" -A 5 | grep -v "try" > auditoria-nivel3/bug-sem-try-catch.txt

# Bug 3: INSERT sem validar duplicata
grep -r "INSERT INTO" src/worker --include="*.ts" -B 5 | grep -v "SELECT.*WHERE" > auditoria-nivel3/bug-insert-sem-validacao.txt

# Bug 4: console.log em produção
grep -r "console.log" src/worker --include="*.ts" | wc -l > auditoria-nivel3/bug-console-log-count.txt
```

### FASE 4: Testar TODOS os endpoints

```bash
URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# Testar endpoints principais
curl -s "$URL/api/v2/funcionarios" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/aeronaves" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/setores" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/funcoes" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/simuladores" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/qualificacoes" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/treinamentos" -w "\nStatus: %{http_code}\n"
curl -s "$URL/api/v2/certificacoes" -w "\nStatus: %{http_code}\n"
```

---

## 🚨 BUGS JÁ CONHECIDOS (MEMÓRIAS)

1. ❌ Modal "Editar Simulador" vazio (endpoint GET /:id não existe)
2. ❌ Fichas de sessão 404 (endpoint /fichas/:id não existe)
3. ❌ Checkbox grande (resolvido mas cache persiste)
4. ⚠️ Funcionários sem flags instrutor/examinador
5. ⚠️ Matrícula sem validação de 5 dígitos

---

## 📋 RECOMENDAÇÃO

**Execute as fases manualmente** e documente TODOS os bugs encontrados em:
- `auditoria-nivel3/BUGS-ENCONTRADOS.md`

**NÃO confie em "está corrigido"** - SEMPRE teste em produção!

---

**Arquivo criado:** `AUDITORIA-NIVEL3-EXECUTAR.md`  
**Próximo passo:** Execute FASE 2 manualmente
