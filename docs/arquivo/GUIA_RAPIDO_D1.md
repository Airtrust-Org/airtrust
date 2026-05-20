# 🚀 Guia Rápido - Comandos D1

## 📦 Setup Inicial

```bash
# Sincronizar schema de produção para local
npm run db:schema:sync

# Popular com dados de produção
npm run db:seed:production

# Validar dados
npm run db:data:validate
```

## 🔍 Diagnóstico

```bash
# Diagnóstico completo (recomendado quando houver problemas)
npm run db:diagnose

# Validar consistência de dados
npm run db:data:validate

# Comparar schema local vs produção (Python)
./scripts/validate-schema-parity.py
```

## 🔄 Reset & Refresh

```bash
# Reset database local (limpa tudo e reaplica migrations)
npm run db:reset:local

# Iniciar dev com database fresh
npm run dev:fresh

# Backup manual
npm run db:backup
```

## 🧪 Testes Manuais

```bash
# Testar endpoint de modelos
curl http://localhost:8787/api/simuladores/modelos | jq '.data | length'
# Esperado: 12

# Testar endpoint de manobras (sessão 4)
curl http://localhost:8787/api/simuladores/modelos/4/manobras | jq '.data | length'
# Esperado: 22

# Testar todas as sessões
for i in {4..14}; do
  count=$(curl -s http://localhost:8787/api/simuladores/modelos/$i/manobras | jq '.data | length')
  echo "Sessão $i: $count manobras"
done
```

## 🐛 Troubleshooting

### Problema: API retorna 0 mas CLI tem dados

```bash
# 1. Diagnóstico
npm run db:diagnose

# 2. Se database está OK mas API não vê dados
pkill -9 node
npm run dev:all

# 3. Se ainda não funcionar
npm run db:reset:local
npm run db:seed:production
npm run dev:all
```

### Problema: Erro "no such table" ou "no such column"

```bash
# Schema desatualizado - sincronizar
npm run db:schema:sync
npm run dev:all
```

### Problema: Dados desaparecem após restart

```bash
# Inserindo no database errado - sempre usar wrangler
cd worker-airtrust
npx wrangler d1 execute DB --local --file=seu-arquivo.sql

# NUNCA usar sqlite3 direto nos arquivos .wrangler/
```

## 📊 Queries Úteis

```bash
# Ver todas as tabelas
cd worker-airtrust
npx wrangler d1 execute DB --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Contar registros de uma tabela
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM nome_tabela"

# Ver estrutura de uma tabela
npx wrangler d1 execute DB --local --command="PRAGMA table_info(nome_tabela)"

# Listar manobras de uma sessão
npx wrangler d1 execute DB --local --command="
  SELECT m.codigo, m.descricao
  FROM template_manobras tm
  JOIN cadastro_manobras m ON tm.manobra_id = m.id
  WHERE tm.template_id = 4
  ORDER BY tm.ordem
"
```

## 🔐 Produção

```bash
# Executar query em produção (CUIDADO!)
cd worker-airtrust
npx wrangler d1 execute DB --remote --command="SELECT COUNT(*) FROM modelos_sessao"

# Aplicar migration em produção
npx wrangler d1 execute DB --remote --file=migrations/NNNN_nome.sql

# Backup antes de mudanças críticas
npm run db:backup
```

## 📝 Workflow Recomendado

### Ao começar o dia:

```bash
npm run db:data:validate  # Verificar se dados estão OK
npm run dev:all           # Iniciar ambiente
```

### Ao fazer mudanças no schema:

```bash
# 1. Criar migration em worker-airtrust/migrations/
# 2. Testar localmente
cd worker-airtrust
npx wrangler d1 execute DB --local --file=migrations/NNNN_nova.sql

# 3. Validar
npm run db:data:validate

# 4. Se OK, aplicar em produção
npx wrangler d1 execute DB --remote --file=migrations/NNNN_nova.sql
```

### Ao fazer mudanças nos dados:

```bash
# 1. Sempre usar wrangler d1 execute
cd worker-airtrust
npx wrangler d1 execute DB --local --file=seed.sql

# 2. Reiniciar worker
pkill -f "wrangler dev"
npm run dev:all

# 3. Validar via API
curl http://localhost:8787/api/seu-endpoint | jq '.'
```

## ⚡ Scripts Disponíveis

| Comando                      | Descrição                        |
| ---------------------------- | -------------------------------- |
| `npm run db:schema:sync`     | Sincroniza schema de produção    |
| `npm run db:data:validate`   | Valida consistência de dados     |
| `npm run db:seed:production` | Popula dados de produção         |
| `npm run db:backup`          | Backup manual do database        |
| `npm run db:reset:local`     | Reset completo do database local |
| `npm run db:diagnose`        | Diagnóstico completo D1          |
| `npm run dev:fresh`          | Dev com database fresh           |

---

**Criado em**: 20 de novembro de 2025  
**Última atualização**: 20 de novembro de 2025
