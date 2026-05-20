# ⚠️ PRÓXIMOS PASSOS - Sincronização airtrust.online

## Status Atual
```
✅ Build: OK (DfICGExB)
✅ Pages Production: OK (version=4fa9cacc)
✅ Script verificar-versao-producao.sh: Criado e pronto
❌ airtrust.online: Desincronizado (ainda serve bundle antigo)
```

## Problema
O token de API não tem permissão para gerenciar **Cloudflare Pages Domains**. 

Solução: Configuração manual via Cloudflare Dashboard (2 minutos de cliques)

---

## Passo-a-Passo (Dashboard Cloudflare)

### 1. Abra https://dash.cloudflare.com/
Faça login com sua conta

### 2. Vá para Pages
```
Seu Account → Pages → airtrust
```

### 3. Clique em "Custom Domains" (menu esquerdo)

### 4. Procure "airtrust.online"
Deve estar lá com status "Verifying" ou "Error"

### 5. IMPORTANTE: Selecione o Branch
Clique em **airtrust.online** → Campo **Branch**: **`production`** ← CRÍTICO!

Deve ficar assim:
```
airtrust.online
└─ Branch: production ✅
└─ Status: Active (após alguns segundos)
```

### 6. Confirme/Save
Clique em confirmar

### 7. Aguarde 30-60 segundos

### 8. Verificação

Abra terminal e rode:
```bash
./verificar-versao-producao.sh
```

Saída esperada:
```
Pages Production: bundle=DfICGExB | version=4fa9cacc
airtrust.online: bundle=DfICGExB | version=4fa9cacc
✅ SINCRONIZADO!
```

---

## Alternativa: Testando Manualmente

Se quiser confirmar antes do passo 7:

```bash
# Check Pages Production (deve estar certo)
curl -s https://production.airtrust.pages.dev | grep build-version | head -1

# Check airtrust.online (deve estar errado até linkagem)
curl -s https://airtrust.online | grep build-version | head -1
```

Esperado:
- **Pages**: `<meta name="build-version" content="4fa9cacc">`
- **airtrust.online**: `<meta name="build-version" content="__BUILD_VERSION__">` (até sincronizar)

Após sincronizar, ambas devem ser iguais.

---

## 🎯 Resultado Final
Quando sincronizado:
- ✅ airtrust.online serve bundle correto (DfICGExB)
- ✅ Footer mostra versão honesta (4fa9cacc ou próxima)
- ✅ Cada deploy atualiza automaticamente
- ✅ Verificação: `./verificar-versao-producao.sh` → SINCRONIZADO

---

## Precisa de Help?

Se após passo 7 ainda mostrar "DESINCRONIZADO":
1. Aguarde mais 2-3 minutos (DNS pode demorar)
2. Verifique no dashboard se Branch está mesmo como "production"
3. Teste: `curl -I https://airtrust.online` → deve mostrar Cloudflare Pages headers

Se ainda não funcionar, você pode fazer deploy alternativo:
```bash
npm run build && ./deploy-full-automated.sh
```

Isso faz o deploy completo (worker, pages, etc.)

