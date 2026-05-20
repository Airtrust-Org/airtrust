# 🔐 CREDENCIAIS DE ACESSO

**Data:** 21 de outubro de 2025, 20:52  
**Status:** ✅ **FUNCIONANDO**

---

## 🌐 PRODUÇÃO

### URL
```
https://main.airtrust.pages.dev/login
```

### Credenciais Admin
```
Email: admin@airtrust.com
Senha: admin123
```

### Informações do Usuário
```
ID:     1
Nome:   Administrador
Perfil: ADMIN
Status: Ativo
```

---

## 💻 LOCALHOST

### URL
```
http://localhost:3000/login
```

### Credenciais Admin
```
Email: admin@airtrust.com
Senha: admin123
```

**Mesmas credenciais da produção!**

---

## 🔑 HASH BCRYPT

```
Senha:  admin123
Hash:   $2a$10$.PMtulgJRTCl1dRpiKmdkO73U8z2oZATrgOyuPwhhTkFDtPnhaYse
```

**Gerado com:** `bcryptjs` (10 rounds)

---

## 🧪 TESTAR AGORA

### 1. Produção
```
1. Acesse: https://main.airtrust.pages.dev/login
2. Email: admin@airtrust.com
3. Senha: admin123
4. Clique em "Entrar"
5. ✅ Deve fazer login com sucesso!
```

### 2. Localhost
```
1. Inicie o worker: npm run dev:worker
2. Acesse: http://localhost:3000/login
3. Email: admin@airtrust.com
4. Senha: admin123
5. Clique em "Entrar"
6. ✅ Deve fazer login com sucesso!
```

---

## 📊 DADOS DISPONÍVEIS

### Produção
```
✅ 1 usuário (admin)
✅ 0 funcionários (vazio)
✅ 0 qualificações (vazio)
```

### Localhost
```
✅ 1 usuário (admin)
✅ 5 funcionários
✅ 11 qualificações
```

---

## 🔄 SE SENHA NÃO FUNCIONAR

### Gerar Novo Hash
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('NOVA_SENHA', 10).then(hash => console.log(hash));"
```

### Atualizar em Produção
```bash
npx wrangler d1 execute airtrust-db --remote --command="UPDATE usuarios SET password_hash = 'NOVO_HASH' WHERE email = 'admin@airtrust.com';"
```

### Atualizar no Localhost
```bash
npx wrangler d1 execute airtrust-db --local --command="UPDATE usuarios SET password_hash = 'NOVO_HASH' WHERE email = 'admin@airtrust.com';"
```

---

## 🆕 CRIAR NOVO USUÁRIO

### Em Produção
```bash
# 1. Gerar hash da senha
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('senha123', 10).then(hash => console.log(hash));"

# 2. Inserir usuário
npx wrangler d1 execute airtrust-db --remote --command="INSERT INTO usuarios (email, password_hash, nome, perfil, ativo) VALUES ('novo@email.com', 'HASH_GERADO', 'Nome Usuario', 'USUARIO', 1);"
```

### No Localhost
```bash
# 1. Gerar hash da senha
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('senha123', 10).then(hash => console.log(hash));"

# 2. Inserir usuário
npx wrangler d1 execute airtrust-db --local --command="INSERT INTO usuarios (email, password_hash, nome, perfil, ativo) VALUES ('novo@email.com', 'HASH_GERADO', 'Nome Usuario', 'USUARIO', 1);"
```

---

## 🎯 PERFIS DISPONÍVEIS

```
ADMIN       - Acesso total
COMPLIANCE  - Gestão de conformidade
GESTOR      - Gestão de equipes
USUARIO     - Acesso básico
```

---

## ⚠️ SEGURANÇA

### Produção
```
⚠️ TROCAR SENHA PADRÃO em produção!
⚠️ Usar senhas fortes
⚠️ Não compartilhar credenciais
```

### Recomendações
```
✅ Senha mínima: 8 caracteres
✅ Incluir letras, números e símbolos
✅ Não usar senhas óbvias
✅ Trocar periodicamente
```

---

## 📝 HISTÓRICO DE CORREÇÕES

```
1. ✅ Tabela usuarios criada
2. ✅ Coluna 'role' corrigida para 'perfil'
3. ✅ Hash bcrypt corrigido
4. ✅ Usuário admin criado em produção
5. ✅ Seed local atualizado
```

---

**✅ CREDENCIAIS FUNCIONANDO EM PRODUÇÃO E LOCALHOST! ✅**

---

**Versão:** 1.0.0  
**Data:** 21/10/2025, 20:52  
**Commit:** a383eb9  
**Status:** ✅ **PRONTO**
