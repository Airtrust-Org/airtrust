# 🚀 Status dos Serviços - AirTrust Local

**Data:** $(date)
**Status:** ✅ Todos os serviços rodando

---

## 📊 Status dos Serviços

### ✅ Backend (Wrangler)
- **URL:** http://localhost:8787
- **Status:** ✅ Rodando
- **Health Check:** http://localhost:8787/api/health
- **Logs:** `/tmp/wrangler-dev.log`

### ✅ Frontend (Vite)
- **URL:** http://localhost:3000
- **Status:** ✅ Rodando
- **Logs:** `/tmp/vite-dev.log`

### ✅ Banco de Dados (D1 Local)
- **Status:** ✅ Inicializado
- **Tabelas:** 62 tabelas
- **Funcionários:** 24 registros
- **Qualificações:** 87 registros

---

## 🔗 URLs de Acesso

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8787/api
- **Health Check:** http://localhost:8787/api/health

---

## 📋 Configuração

### Variáveis de Ambiente
- **VITE_API_URL:** http://localhost:8787/api
- **VITE_ENVIRONMENT:** development
- **Arquivo:** `.env.local`

---

## 🧪 Testar Endpoints

### Health Check
```bash
curl http://localhost:8787/api/health
```

### Funcionários
```bash
curl http://localhost:8787/api/funcionarios
```

### Qualificações
```bash
curl http://localhost:8787/api/qualificacoes
```

---

## 🛑 Parar Serviços

### Parar Backend
```bash
pkill -f wrangler
```

### Parar Frontend
```bash
pkill -f vite
```

### Parar Tudo
```bash
pkill -f wrangler && pkill -f vite
```

---

## 📝 Logs

### Ver Logs do Backend
```bash
tail -f /tmp/wrangler-dev.log
```

### Ver Logs do Frontend
```bash
tail -f /tmp/vite-dev.log
```

---

## ✅ Próximos Passos

1. Acesse o frontend: http://localhost:3000
2. Verifique se os dados estão sendo carregados
3. Teste as funcionalidades da aplicação

---

## 🐛 Troubleshooting

### Backend não está rodando
```bash
npm run dev:worker
```

### Frontend não está rodando
```bash
npm run dev
```

### Verificar processos
```bash
ps aux | grep -E "(wrangler|vite)" | grep -v grep
```

### Verificar portas
```bash
lsof -i :8787  # Backend
lsof -i :3000  # Frontend
```

---

**Status atualizado em:** $(date)

