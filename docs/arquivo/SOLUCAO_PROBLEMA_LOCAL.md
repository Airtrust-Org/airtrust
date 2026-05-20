# 🔧 Solução: Problema de Conexão Local

## 📋 Problema Identificado

Você não está conseguindo:
1. Rodar localmente
2. Trazer dados das tabelas do servidor local para o frontend

## ✅ Soluções Aplicadas

### 1. Configuração da API para Localhost

**Arquivo:** `src/react-app/config/api.ts`

- ✅ Ajustada a função `resolveApiBase()` para detectar localhost
- ✅ Fallback para `http://localhost:8787/api` quando em desenvolvimento local
- ✅ Mantida compatibilidade com produção

### 2. Configuração do Vite

**Arquivo:** `vite.config.ts`

- ✅ Ajustado fallback para usar `http://localhost:8787/api` em desenvolvimento
- ✅ Mantido proxy do Vite para `/api` → `http://localhost:8787`
- ✅ Variável de ambiente `VITE_API_URL` configurada corretamente

### 3. Script de Setup Local

**Arquivo:** `scripts/setup-local-env.sh`

- ✅ Script criado para configurar ambiente local
- ✅ Cria/atualiza arquivo `.env.local` com `VITE_API_URL`
- ✅ Verifica se o backend está rodando
- ✅ Verifica se o banco de dados está inicializado
- ✅ Testa endpoints da API

## 🚀 Como Resolver o Problema

### Passo 1: Executar o Script de Setup

```bash
npm run setup:local
```

Este script irá:
- Criar/atualizar o arquivo `.env.local` com `VITE_API_URL=http://localhost:8787/api`
- Verificar se o backend está rodando
- Verificar se o banco de dados está inicializado
- Testar endpoints da API

### Passo 2: Inicializar o Banco de Dados (se necessário)

Se o banco de dados não estiver inicializado:

```bash
npm run db:init:local
```

Isso aplicará todas as migrações necessárias para criar as tabelas.

### Passo 3: Iniciar o Backend

Em um terminal, execute:

```bash
npm run dev:worker
```

Aguarde até ver a mensagem:
```
✓ Ready on http://localhost:8787
```

### Passo 4: Iniciar o Frontend

Em outro terminal, execute:

```bash
npm run dev
```

O frontend estará disponível em `http://localhost:3000`

### Passo 5: Verificar a Conexão

1. Abra o navegador em `http://localhost:3000`
2. Abra o Console do Desenvolvedor (F12)
3. Verifique os logs:
   - `🔍 [API Config] VITE_API_URL: http://localhost:8787/api`
   - `🔍 [API Config] API_BASE_URL (final): http://localhost:8787/api`

## 🔍 Diagnóstico

### Verificar se o Backend está Rodando

```bash
curl http://localhost:8787/api/health
```

Deve retornar:
```json
{
  "success": true,
  "status": "healthy",
  "db": { "connected": true },
  "timestamp": "...",
  "source": "worker-index"
}
```

### Verificar se o Banco de Dados está Inicializado

```bash
npm run db:status
```

Deve listar as tabelas criadas.

### Verificar Endpoints da API

```bash
# Funcionários
curl http://localhost:8787/api/funcionarios

# Qualificações
curl http://localhost:8787/api/qualificacoes

# Health
curl http://localhost:8787/api/health
```

## 🐛 Troubleshooting

### Problema: Backend não inicia

**Solução:**
1. Verifique se a porta 8787 está livre:
   ```bash
   lsof -i :8787
   ```
2. Se estiver ocupada, mate o processo:
   ```bash
   kill -9 <PID>
   ```
3. Tente novamente:
   ```bash
   npm run dev:worker
   ```

### Problema: Banco de dados não inicializa

**Solução:**
1. Limpe o estado do wrangler:
   ```bash
   rm -rf .wrangler/state
   ```
2. Inicialize o banco novamente:
   ```bash
   npm run db:init:local
   ```

### Problema: Frontend não consegue conectar ao backend

**Solução:**
1. Verifique se o backend está rodando:
   ```bash
   curl http://localhost:8787/api/health
   ```
2. Verifique se o arquivo `.env.local` existe e contém:
   ```
   VITE_API_URL=http://localhost:8787/api
   ```
3. Reinicie o frontend:
   ```bash
   # Ctrl+C para parar
   npm run dev
   ```

### Problema: CORS errors

**Solução:**
O CORS já está configurado no worker (`src/worker/index.ts`) para permitir `localhost:3000`. Se ainda houver problemas:

1. Verifique se o backend está rodando na porta 8787
2. Verifique se o frontend está rodando na porta 3000
3. Verifique os logs do backend para mensagens de CORS

## 📝 Arquivos Modificados

1. `src/react-app/config/api.ts` - Ajustada detecção de localhost
2. `vite.config.ts` - Ajustado fallback para desenvolvimento local
3. `scripts/setup-local-env.sh` - Script de setup criado
4. `package.json` - Adicionado script `setup:local`

## ✅ Checklist

- [x] Configuração da API para localhost
- [x] Configuração do Vite para desenvolvimento local
- [x] Script de setup local criado
- [x] Documentação do problema e solução
- [ ] Testar conexão entre frontend e backend
- [ ] Verificar se dados estão sendo carregados

## 🎯 Próximos Passos

1. Execute `npm run setup:local` para configurar o ambiente
2. Inicie o backend: `npm run dev:worker`
3. Inicie o frontend: `npm run dev`
4. Acesse `http://localhost:3000` e verifique se os dados estão sendo carregados

## 📞 Suporte

Se ainda houver problemas:

1. Verifique os logs do backend no terminal onde está rodando `npm run dev:worker`
2. Verifique os logs do frontend no Console do Desenvolvedor (F12)
3. Execute o script de diagnóstico: `npm run setup:local`

