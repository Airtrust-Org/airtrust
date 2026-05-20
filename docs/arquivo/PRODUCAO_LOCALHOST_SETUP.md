# ✅ Production Database Setup - Localhost Access

**Data da Configuração:** 24 de Novembro de 2025

## 📊 O que foi feito

### ✓ Dados Importados para Produção

- **funcionarios**: 40 registros ✓ (já existiam em produção)
- **qualificacoes_historico**: 1036 registros ✓ (importados do backup)

**Origem dos dados**: `migrations/data-export/prod_data_clean.sql`

### ✓ Transformação de Schema

O backup tinha 34 colunas para qualificacoes_historico, a produção tem 21 colunas.
A transformação mapeou corretamente:

- Colunas legadas → Colunas canônicas
- Data de obtenção → Data conclusão
- Data de validade → Data vencimento
- Geração automática de UUIDs para qualificacao_id (NOT NULL)
- Desabilitação de foreign keys durante import

## 🚀 Como usar Localhost com Produção

### Opção 1: Apenas API com DB de Produção

```bash
cd worker-airtrust
wrangler dev --port 8787 --env production
```

Ou use o atalho:

```bash
npm run dev:prod
```

### Opção 2: Stack Completo (Frontend + API com Produção)

```bash
npm run dev:all:prod
```

Isto inicia:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8787 (conectado à produção D1)

## ⚠️ AVISO IMPORTANTE

**TODOS OS DADOS INSERIDOS/MODIFICADOS VÃO DIRETO PARA PRODUÇÃO!**

O localhost está lendo e escrevendo no banco de dados remoto da produção.

- Adicionar um funcionário = adiciona em produção
- Alterar qualificação = altera em produção
- Deletar registro = deleta em produção

## 📋 Verificação

Verificar dados em produção:

```bash
cd worker-airtrust
wrangler d1 execute DB --command "SELECT COUNT(*) FROM funcionarios; SELECT COUNT(*) FROM qualificacoes_historico;" --remote --env production
```

Resultado esperado:

```
funcionarios: 40
qualificacoes_historico: 1036
```

## 🔄 Scripts Criados

- `worker-airtrust/import-data-to-production.sh` - Importa dados do backup
- `worker-airtrust/transform-qualificacoes.py` - Converte schema
- `worker-airtrust/verify-prod-setup.sh` - Verifica configuração
- `worker-airtrust/dev-with-production-db.sh` - Dev com produção

## 📝 Scripts no package.json

```json
"dev:prod": "cd worker-airtrust && wrangler dev --port 8787 --env production",
"dev:all:prod": "concurrently \"npm run dev\" \"cd worker-airtrust && wrangler dev --port 8787 --env production\""
```

## 🔐 Segurança

- O wrangler.toml já tem database_id correto apontando para produção
- CLOUDFLARE_TOKEN é lido do arquivo `.dev.vars`
- Foreign keys foram respeitadas após importação

## ✓ Status Final

```
✅ Dados em produção: 1,076 registros
✅ Localhost pode ler/escrever em produção
✅ Ambos os ambientes sincronizados
✅ Pronto para testes de integração
```

---

**Próximos passos:**

1. Testar conexão: `npm run dev:all:prod`
2. Acessar http://localhost:3000
3. Verificar se dados de funcionarios e qualificações aparecem
4. Fazer teste de escrita (adicionar novo registro)
