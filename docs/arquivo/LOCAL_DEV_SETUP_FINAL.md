# 🚀 AirTrust Local Development - Guia de Uso

**Status:** ✅ 100% Pronto para desenvolvimento local

---

## 📍 Endereços

- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:8888
- **Database:** D1 Local (SQLite)

---

## 🚀 Iniciar Ambiente

### Opção 1: Comando Único (Recomendado)

```bash
npm run dev:auto
```

Isso automaticamente:

- Escolhe uma porta disponível para o backend (8787 → 8888 → 8989)
- Escolhe uma porta disponível para o frontend (3000 → 3001 → 3002)
- Atualiza `.env.local` com `VITE_API_URL`
- Faz health check do backend
- Exibe URLs de acesso

### Opção 2: Componentes Individuais

Backend apenas (com porta automática):

```bash
npm run dev:worker:auto
```

Frontend apenas:

```bash
npm run dev
```

Backend em porta fixa 8888:

```bash
npm run dev:worker:8888
```

---

## 💾 Database Local

### Inicializar banco (primeira vez)

```bash
npm run db:init:local
```

Isso aplica todas as **13 migrações principais** criando:

- ✅ 16 tabelas
- ✅ Índices de performance
- ✅ Soft delete em todas tabelas
- ✅ Auditoria completa

### Inserir dados de seed

```bash
wrangler d1 execute airtrust-db --local --file migrations/2099_seed_data.sql
```

Dados inclusos:

- 8 funcionários (pilotos, comissários, instrutores)
- 11 habilitações (CPL, ATPL, IR, etc)
- 11 tipos de qualificações

### Verificar dados no banco

```bash
wrangler d1 execute airtrust-db --local --command "SELECT COUNT(*) FROM funcionarios; SELECT COUNT(*) FROM habilitacoes;"
```

---

## 🔄 Sincronizar Dados de Produção (Opcional)

Se quiser dados reais da produção:

```bash
export CLOUDFLARE_ACCOUNT_ID="seu_account_id"
export CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
export D1_PROD_DB="airtrust-db"  # nome da DB de produção

./scripts/sync-d1-from-production.sh
```

Isso exporta **todas as tabelas** do D1 de produção para o local.

---

## 🛑 Parar Ambiente

```bash
# Se rodando em background
kill <PID_BACKEND> <PID_FRONTEND>

# ou no terminal onde está rodando
Ctrl+C
```

---

## 🔧 Variáveis de Ambiente

Arquivo `.env.local` (criado automaticamente):

```bash
VITE_API_URL=http://localhost:8888          # Ajustado dinamicamente
VITE_ENVIRONMENT=development
VITE_APP_NAME=AirTrust Local
VITE_DEBUG=true
```

---

## 📊 Database Estrutura

16 tabelas criadas:

| Tabela                   | Dados   |
| ------------------------ | ------- |
| `funcionarios`           | 8       |
| `habilitacoes`           | 11      |
| `tipos_qualificacoes`    | 11      |
| `qualificacoes`          | (vazio) |
| `certificados`           | (vazio) |
| `empresas`               | (vazio) |
| `simuladores`            | (vazio) |
| `simuladores_sessoes`    | (vazio) |
| `avaliacoes`             | (vazio) |
| _+ 7 tabelas de suporte_ | —       |

---

## ⚠️ Notas Importantes

1. **Soft Delete Ativo:** Todas as tabelas têm coluna `deleted_at` para auditoria
2. **Porta Dinâmica:** Se 8787/3000 estão ocupadas, automaticamente usa 8888/3001, 8989/3002
3. **Dados Locais:** Alterações no banco local **não afetam produção**
4. **JWT Secrets:** Configurado em `.dev.vars` (dev auth bypass ativado)

---

## 🚨 Troubleshooting

### Porta já em uso?

Script automaticamente tenta próximas portas. Se mesmo assim falhar:

```bash
lsof -i :8787
lsof -i :3000
kill <PID>
```

### Banco corrompido?

Limpar e reinicializar:

```bash
rm -f .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite*
npm run db:init:local
wrangler d1 execute airtrust-db --local --file migrations/2099_seed_data.sql
```

### Backend não conecta ao DB?

Garantir que migrações foram aplicadas:

```bash
wrangler d1 migrations list airtrust-db --local
npm run db:init:local
```

---

## ✨ Pronto!

```bash
npm run dev:auto
```

Abra `http://localhost:3001` e divirta-se! 🎉
