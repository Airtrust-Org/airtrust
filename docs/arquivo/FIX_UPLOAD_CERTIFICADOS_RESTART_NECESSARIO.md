# 🔧 FIX: Upload de Certificados - Restart Necessário

## ✅ Correções Aplicadas

### 1. Código Atualizado

- ✅ Removido fallback `funcionarios_old` em `pasta-virtual.ts`
- ✅ Migration 0133 criada e aplicada em **produção**
- ✅ Deploy realizado (Version: `df469d62-7684-405c-9fd8-7fbb52af2f71`)

### 2. Banco de Dados

- ✅ **Produção**: Foreign Keys corrigidas (`pasta_virtual` agora aponta para `funcionarios`)
- ⚠️ **Local**: Você está usando o banco de **produção** em dev (conforme wrangler.toml)

## 🚨 AÇÃO NECESSÁRIA

### Para aplicar as correções no ambiente local:

1. **Parar o dev server atual:**

   - Se estiver rodando em uma task do VSCode, pare a task
   - Ou use: `Ctrl+C` no terminal onde está rodando
   - Ou mate o processo: `pkill -f "wrangler dev"`

2. **Reiniciar o dev server:**

   ```bash
   cd worker-airtrust
   wrangler dev
   ```

   Ou se usar npm script:

   ```bash
   npm run dev:api
   ```

3. **Recarregar o frontend:**
   - Pressione `Cmd+Shift+R` (hard refresh) no navegador
   - Ou abra em aba anônima para garantir cache limpo

## 🧪 Testar

Após reiniciar, teste o upload de certificado:

1. Acesse: http://localhost:3000/funcionarios
2. Clique em um funcionário
3. Vá para aba "Pasta Virtual"
4. Faça upload de um PDF

**Resultado esperado:** Upload bem-sucedido sem erro `funcionarios_old`

## 🔍 Se ainda der erro

Execute este comando para verificar se o worker carregou o código novo:

```bash
curl http://localhost:8787/api/health
```

Verifique se a resposta tem a versão atualizada.

## 📊 Status

- ✅ Código corrigido
- ✅ Migration aplicada em produção
- ✅ Deploy realizado
- ⏳ **Aguardando restart do dev server**

---

**Data:** 29/11/2025 18:35  
**Branch:** fix/importacao-completa-limpeza  
**Deploy ID:** df469d62-7684-405c-9fd8-7fbb52af2f71
