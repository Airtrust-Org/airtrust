# 🚀 Rodar Localmente com Dados de Produção

**Status**: ✅ Pronto  
**Porta**: 3000  
**Banco de Dados**: 🔴 Produção (remoto)  
**Storage**: 🔴 Produção (Cloudflare R2)

---

## ⚠️ AVISO IMPORTANTE

Este guia permite rodar o sistema LOCALMENTE mas **CONECTADO AO BANCO DE DADOS E STORAGE DE PRODUÇÃO**.

### ✅ Use para:
- Debug e troubleshooting
- Testes com dados reais
- Development que precisa de dados de prod
- Investigar bugs em produção

### ❌ NÃO use para:
- Testes massivos (vai afetar dados reais!)
- Desenvolvimento de features novas
- Qualquer coisa que possa modificar dados de produção

---

## 📋 Pré-requisitos

Você precisa ter as **credenciais do Cloudflare**:

1. **Account ID** (encontre em: Cloudflare Dashboard > Contas)
2. **R2 Access Key ID** (Dashboard > R2 > API Tokens)
3. **R2 Secret Access Key** (gerada junto com o access key)
4. **D1 DB ID** (Dashboard > D1 > Database ID)
5. **Auth Token** (Dashboard > API Tokens > Global API Token)
6. **JWT Secret** (token usado em produção para JWT)

---

## 🔧 Setup Rápido (3 passos)

### Passo 1: Exportar credenciais
```bash
export CLOUDFLARE_ACCOUNT_ID="sua-account-id"
export CLOUDFLARE_R2_ACCESS_KEY_ID="sua-access-key"
export CLOUDFLARE_R2_SECRET_ACCESS_KEY="sua-secret-key"
export CLOUDFLARE_D1_DB_ID="sua-db-id"
export CLOUDFLARE_AUTH_TOKEN="seu-auth-token"
export PRODUCTION_JWT_SECRET="seu-jwt-secret"
```

### Passo 2: Executar script
```bash
bash run-local-with-prod-data.sh
```

### Passo 3: Acessar
```
http://localhost:3000
```

---

## 🔍 Verificação do Setup

### 1. Verificar variáveis de ambiente
```bash
# Verificar que estão setadas
echo $CLOUDFLARE_ACCOUNT_ID
echo $CLOUDFLARE_R2_ACCESS_KEY_ID
# ... etc

# Todas devem retornar valores (não vazias)
```

### 2. Verificar conexão com D1
```bash
# Se o sistema carregar, está conectado com sucesso
# Você verá dados de produção na UI
```

### 3. Verificar conexão com R2
```bash
# Tente fazer download de um certificado
# Se abrir corretamente, R2 está funcionando
```

---

## 📝 Configuração Alternativa (Manual)

Se o script não funcionar, configure manualmente:

### 1. Edite `.env.local.production`
```env
VITE_API_URL=https://api.airtrust.com.br
CLOUDFLARE_ACCOUNT_ID=seu-id
CLOUDFLARE_R2_ACCESS_KEY_ID=sua-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=sua-secret
CLOUDFLARE_D1_DB_ID=seu-db-id
CLOUDFLARE_AUTH_TOKEN=seu-token
PRODUCTION_JWT_SECRET=seu-jwt-secret
NODE_ENV=development
VITE_ENVIRONMENT=production-local
```

### 2. Carregue as variáveis
```bash
export $(cat .env.local.production | grep -v '^#' | xargs)
```

### 3. Inicie o servidor
```bash
npm run dev
```

---

## 🚀 Comandos Disponíveis

### Frontend + Backend Local (recomendado)
```bash
npm run dev:all
```

### Apenas Frontend (conecta a API remota)
```bash
npm run dev
```

### Apenas Backend Local
```bash
npm run dev:worker
```

### Backend em porta específica
```bash
npm run dev:worker:8888
```

---

## 🔐 Segurança

### ✅ O que é seguro:
- Ler dados de produção
- Ver certificados, funcionários, qualificações
- Fazer buscas e filtros

### ⚠️ O que NÃO é seguro:
- **CRIAR** novos dados (vai afetar produção!)
- **EDITAR** dados existentes (vai afetar produção!)
- **DELETAR** dados (vai afetar produção!)

### 🛑 Para editar dados:
1. Use o ambiente de **staging** (se existir)
2. Faça backup dos dados antes
3. Teste em ambiente local com cópia dos dados (não remoto)

---

## 🐛 Troubleshooting

### "Erro: Missing environment variables"
```bash
# Solução: Certifique-se que todas as 6 variáveis estão exportadas
export CLOUDFLARE_ACCOUNT_ID="..."
# ... etc
```

### "Erro: Connection refused"
```bash
# Verifica a porta 3000 está livre
lsof -i :3000
# Se ocupada, mate o processo:
kill -9 <PID>
```

### "Erro: Unauthorized (D1)"
```bash
# Verifique token e credenciais no Cloudflare Dashboard
# Certifique-se que o token tem permissão para D1
```

### "Dados desatualizados"
```bash
# Limpe cache do navegador
# Ctrl+Shift+Delete (ou Cmd+Shift+Delete no Mac)
# ou abra em modo privado
```

### "Certificados não abrem"
```bash
# Verifica conexão com R2
# Tente fazer login com token válido
# Verifique permissões R2 no Cloudflare
```

---

## 📊 Verificação de Conexão

### Status da API
```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://api.airtrust.com.br/api/health
# Esperado: { status: "ok" }
```

### Status do D1
```bash
# Se conseguir logar e ver dados, D1 está OK
# http://localhost:3000 → login → ver dashboard
```

### Status do R2
```bash
# Se conseguir fazer download de arquivos, R2 está OK
# Vá para Qualificações → Certificados → Download
```

---

## 🎯 Casos de Uso

### 1. Debug de Certificado
```bash
# Rodando com dados de produção, você pode:
# 1. Criar um novo certificado
# 2. Verificar se gera corretamente
# 3. Fazer download e validar magic bytes
```

### 2. Investigar Bug em Produção
```bash
# Você pode:
# 1. Reproduzir o bug localmente com dados reais
# 2. Adicionar breakpoints no código
# 3. Debugar passo-a-passo
# 4. Depois aplicar fix
```

### 3. Performance Testing
```bash
# Com dados reais:
# 1. Teste lista com muitos registros
# 2. Verifique response times
# 3. Otimize queries se necessário
```

---

## 📋 Checklist de Segurança

Antes de usar em produção:

- [ ] Credenciais de Cloudflare armazenadas com segurança
- [ ] Não commitar `.env.local.production` no git
- [ ] Usar em rede segura (não em WiFi público)
- [ ] Não compartilhar links localhost com outros
- [ ] Desconectar quando terminar (feche o terminal)
- [ ] Verificar em produção que nada foi alterado

---

## 🔄 Workflow Recomendado

```
1. Debug local com produção
   ↓
2. Quando pronto, testar em staging
   ↓
3. Apenas então fazer deploy em produção
```

---

## 📞 Suporte

Se encontrar problemas:

1. **Verifique variáveis**: `echo $CLOUDFLARE_ACCOUNT_ID`
2. **Verifique porta**: `lsof -i :3000`
3. **Verifique credenciais**: Compare com Cloudflare Dashboard
4. **Verifique logs**: `npm run dev` mostra logs em tempo real
5. **Contate suporte** se persistir

---

## 🚀 Pronto?

```bash
bash run-local-with-prod-data.sh
```

Acesse: **http://localhost:3000**

**Bom debugging! 🎉**
