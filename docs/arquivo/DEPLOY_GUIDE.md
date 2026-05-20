# 🚀 Guia de Deploy - AirTrust

## ⚠️ IMPORTANTE: Problemas de Cache

O Cloudflare Workers faz cache agressivo dos assets. Para garantir que as mudanças apareçam em produção, **SEMPRE** use o deploy limpo.

## 📋 Como Fazer Deploy Corretamente

### Opção 1: Script Automatizado (RECOMENDADO)
```bash
./deploy.sh
```

### Opção 2: Comando npm
```bash
npm run deploy:clean
```

### Opção 3: Comandos Manuais
```bash
rm -rf dist node_modules/.vite .vite
npx vite build
npx wrangler deploy
```

## ✅ Após o Deploy

1. **Aguarde 60 segundos** para propagação do Cloudflare
2. **Feche TODAS as abas** do navegador
3. **Abra em modo anônimo** (Cmd+Shift+N) para testar
4. Ou faça **Cmd+Shift+R** (hard refresh) várias vezes

## 🔍 Como Verificar se Atualizou

1. Abra o **DevTools** (F12)
2. Vá na aba **Network**
3. Recarregue a página
4. Veja se os arquivos `.js` têm **timestamp novo** no nome
   - Exemplo: `index-ABC123-mhh01vxp.js`
   - O timestamp deve ser diferente do anterior

## 🚫 O que NÃO fazer

- ❌ Não use `npm run deploy` (usa cache)
- ❌ Não use `npm run build` seguido de deploy (usa cache)
- ❌ Não confie que "Ctrl+R" vai atualizar (não limpa cache)

## 🛠️ Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `./deploy.sh` | Deploy limpo com cache clearing |
| `npm run deploy:clean` | Mesmo que ./deploy.sh |
| `npm run build:clean` | Build limpo sem deploy |
| `npm run deploy` | Deploy normal (pode usar cache) ⚠️ |

## 🐛 Troubleshooting

### Problema: Mudanças não aparecem após deploy

**Solução:**
1. Verifique se usou `./deploy.sh` ou `npm run deploy:clean`
2. Aguarde 60 segundos completos
3. Feche TODAS as abas do navegador
4. Abra em modo anônimo
5. Verifique no DevTools se os arquivos têm timestamp novo

### Problema: Erro "Build failed"

**Solução:**
```bash
rm -rf node_modules
npm install
./deploy.sh
```

### Problema: Erro "Deploy failed"

**Solução:**
1. Verifique se está logado no Wrangler: `npx wrangler whoami`
2. Se não estiver, faça login: `npx wrangler login`
3. Tente novamente: `./deploy.sh`

## 📝 Checklist de Deploy

- [ ] Fiz todas as mudanças necessárias
- [ ] Testei localmente com `npm run dev`
- [ ] Usei `./deploy.sh` para fazer deploy
- [ ] Aguardei 60 segundos após o deploy
- [ ] Fechei todas as abas do navegador
- [ ] Abri em modo anônimo para testar
- [ ] Verifiquei que os arquivos têm timestamp novo no DevTools
- [ ] Testei as funcionalidades alteradas

## 🎯 Dicas

1. **Sempre use modo anônimo** para testar após deploy
2. **Verifique o timestamp** dos arquivos no DevTools
3. **Aguarde a propagação** do Cloudflare (60s)
4. **Documente** o que foi alterado no deploy

---

**Última atualização:** 2025-11-01
