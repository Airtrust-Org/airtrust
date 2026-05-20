# 🛡️ Prevenção de Problemas D1 & Dados

## 📋 Resumo dos Problemas Enfrentados

### 1️⃣ **Múltiplos Databases SQLite**

**Problema**: Wrangler CLI criou múltiplos arquivos `.sqlite` com nomes diferentes:

- `f4e3302cc...sqlite` (hash gerado automaticamente)
- `airtrust-local.sqlite` (nome explícito)
- `6d257d...sqlite` (outro hash)

**Resultado**: Dados inseridos via `wrangler d1 execute` iam para um arquivo, mas Worker runtime lia de outro.

### 2️⃣ **Cache do Worker**

**Problema**: Worker não recarregava dados mesmo após inserção no database correto.

### 3️⃣ **Schema Inconsistente**

**Problema**: Tabelas locais tinham colunas diferentes das de produção (ex: `manobras_categorias` sem `descricao`).

### 4️⃣ **Dados de Produção Diferentes do Local**

**Problema**: Migrations aplicadas em produção não refletidas localmente.

---

## ✅ Soluções Implementadas

### 1. Script de Sincronização de Schema

```bash
#!/bin/bash
# scripts/sync-schema-from-production.sh

echo "🔄 Sincronizando schema de produção para local..."

# 1. Backup local
cp worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite backup-local-$(date +%Y%m%d-%H%M%S).sqlite 2>/dev/null || true

# 2. Dropar e recriar database local
cd worker-airtrust
rm -rf .wrangler/state/v3/d1/

# 3. Aplicar todas migrations localmente
for migration in migrations/*.sql; do
  echo "Aplicando: $migration"
  npx wrangler d1 execute DB --local --file="$migration"
done

echo "✅ Schema sincronizado"
```

### 2. Script de Validação de Dados

```bash
#!/bin/bash
# scripts/validate-data-consistency.sh

echo "🔍 Validando consistência de dados..."

cd worker-airtrust

# Validações automáticas
echo "📊 Contagem de registros:"

echo -n "  Modelos sessão: "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL" | grep -o '[0-9]*' | tail -1

echo -n "  Manobras cadastradas: "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL" | grep -o '[0-9]*' | tail -1

echo -n "  Template manobras (sessão 4): "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM template_manobras WHERE template_id = 4" | grep -o '[0-9]*' | tail -1

echo -n "  Categorias: "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM manobras_categorias WHERE deleted_at IS NULL" | grep -o '[0-9]*' | tail -1

echo ""
echo "✅ Validação completa"
```

### 3. NPM Scripts Padronizados

Adicionar ao `package.json`:

```json
{
  "scripts": {
    "db:schema:sync": "bash scripts/sync-schema-from-production.sh",
    "db:data:validate": "bash scripts/validate-data-consistency.sh",
    "db:seed:production": "python3 scripts/clone-manobras-producao.py",
    "db:backup": "bash scripts/backup-database.sh --db airtrust-db --label manual",
    "db:reset:local": "rm -rf worker-airtrust/.wrangler/state/v3/d1/ && npm run db:schema:sync",
    "dev:fresh": "npm run db:reset:local && npm run dev:all"
  }
}
```

---

## 🎯 Práticas Recomendadas

### ✅ DO's (Faça Sempre)

1. **Use o database correto**

   ```bash
   # SEMPRE especifique --local ou --remote
   npx wrangler d1 execute DB --local --file=seed.sql
   npx wrangler d1 execute DB --remote --file=migration.sql
   ```

2. **Valide após inserção**

   ```bash
   # Após qualquer INSERT/UPDATE
   npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM tabela"
   ```

3. **Teste API após mudanças no DB**

   ```bash
   # Sempre restart worker após modificar dados
   pkill -f "wrangler dev"
   npm run dev:all
   sleep 10
   curl http://localhost:8787/api/endpoint | jq '.'
   ```

4. **Mantenha migrations versionadas**

   ```bash
   # Nome: NNNN_descricao_clara.sql
   # migrations/0036_sync_schema_production.sql
   ```

5. **Backup antes de mudanças críticas**
   ```bash
   npm run db:backup
   # Só depois faça alterações
   ```

### ❌ DON'Ts (Nunca Faça)

1. **❌ NUNCA** modifique dados diretamente via SQLite CLI no arquivo `.wrangler/state/.../xxx.sqlite`

   - Use SEMPRE `wrangler d1 execute`

2. **❌ NUNCA** assuma que local = produção

   - Valide schema com `PRAGMA table_info(tabela)`

3. **❌ NUNCA** use `INSERT` sem `OR IGNORE` / `OR REPLACE` em seeds

   - Sempre previna erros de duplicação

4. **❌ NUNCA** esqueça de reiniciar worker após modificar DB

   - Worker cacheia conexão D1

5. **❌ NUNCA** delete arquivos `.wrangler/state/` manualmente
   - Use `npm run db:reset:local`

---

## 🔧 Ferramentas de Diagnóstico

### Script: `diagnose-d1-issue.sh`

```bash
#!/bin/bash
# scripts/diagnose-d1-issue.sh

echo "🩺 Diagnóstico D1"
echo "================="

cd worker-airtrust

# 1. Listar databases físicos
echo ""
echo "📁 Arquivos SQLite encontrados:"
find .wrangler/state -name "*.sqlite" -exec ls -lh {} \; 2>/dev/null

# 2. Verificar qual está sendo usado
echo ""
echo "🔍 Database ativo (via wrangler):"
npx wrangler d1 execute DB --local --command="SELECT 'ATIVO' as status"

# 3. Testar query problemática
echo ""
echo "🧪 Teste: template_manobras (sessão 4):"
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) as total FROM template_manobras WHERE template_id = 4"

# 4. Comparar com API
echo ""
echo "🌐 Teste: API endpoint:"
curl -s http://localhost:8787/api/simuladores/modelos/4/manobras | jq '{count: (.data | length)}'

echo ""
echo "✅ Diagnóstico completo"
```

### Script Python: `validate-schema-parity.py`

```python
#!/usr/bin/env python3
"""
Valida se schema local está igual ao de produção
"""
import subprocess
import json

def get_schema(remote=False):
    """Retorna schema de todas as tabelas"""
    flag = "--remote" if remote else "--local"
    tables = ["modelos_sessao", "cadastro_manobras", "template_manobras", "manobras_categorias"]

    schema = {}
    for table in tables:
        cmd = f'cd worker-airtrust && npx wrangler d1 execute DB {flag} --command="PRAGMA table_info({table})"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        schema[table] = result.stdout

    return schema

def main():
    print("🔍 Comparando schemas local vs produção...")

    local = get_schema(remote=False)
    prod = get_schema(remote=True)

    issues = []
    for table in local.keys():
        if local[table] != prod[table]:
            issues.append(f"❌ {table}: Schema diferente!")

    if not issues:
        print("✅ Todos schemas idênticos!")
    else:
        print("\n".join(issues))
        print("\n💡 Execute: npm run db:schema:sync")

if __name__ == "__main__":
    main()
```

---

## 📝 Checklist Pré-Deploy

Antes de cada deploy, execute:

```bash
# 1. Validar dados locais
npm run db:data:validate

# 2. Backup produção
npm run db:backup

# 3. Build
npm run build

# 4. Testar localmente
npm run dev:all &
sleep 10
curl http://localhost:8787/api/simuladores/modelos | jq '.data | length'

# 5. Deploy
cd worker-airtrust && npx wrangler deploy

# 6. Validar produção
curl https://airtrust.airtrust.workers.dev/api/simuladores/modelos | jq '.data | length'
```

---

## 🚨 Troubleshooting Rápido

### Problema: "API retorna array vazio mas CLI tem dados"

**Solução**:

```bash
# 1. Identificar qual .sqlite está sendo usado
find worker-airtrust/.wrangler -name "*.sqlite" -exec ls -lht {} \; | head -5

# 2. Reiniciar worker completamente
pkill -9 node
rm -rf worker-airtrust/.wrangler/state/v3/d1/
npm run dev:all

# 3. Re-aplicar seed
npm run db:seed:production
```

### Problema: "Schema inconsistente local vs produção"

**Solução**:

```bash
npm run db:reset:local
# Aplica todas migrations de produção no local
```

### Problema: "Dados não persistem após restart"

**Causa**: Inserindo no database errado.

**Solução**:

```bash
# SEMPRE use wrangler d1 execute, NUNCA sqlite3 direto
npx wrangler d1 execute DB --local --file=seed.sql
```

---

## 📚 Documentação Adicional

- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/#d1)
- [D1 Local Development](https://developers.cloudflare.com/d1/build-with-d1/local-development/)

---

**Criado em**: 20 de novembro de 2025  
**Última atualização**: 20 de novembro de 2025  
**Autor**: Equipe AirTrust
