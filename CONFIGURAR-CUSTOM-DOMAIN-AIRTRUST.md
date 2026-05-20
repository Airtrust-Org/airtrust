# 🔗 Configurar Custom Domain airtrust.online

## Status Atual

- ✅ Pages projeto: `airtrust` criado
- ✅ Branch `production` atualizado com build correto
- ✅ Domain `airtrust.online` registrado (mas não linkado corretamente)
- ❌ Domain ainda aponta para bundle antigo (DrGqKCxF)
- ⏳ Esperando: Linkação de `airtrust.online` → branch `production`

## Por que isso é importante?

Você criou um sistema honesto de versionamento:

- Deploy script stampa `index.html` com git commit hash
- Footer mostra versão exata que está sendo servida
- Verificação: `./verificar-versao-producao.sh` compara bundles

**Mas airtrust.online ainda está servindo bundle antigo!**

Isso significa:

- `production.airtrust.pages.dev` ✅ Correct (DfICGExB, version=4fa9cacc)
- `airtrust.online` ❌ Old (DrGqKCxF, version=**BUILD_VERSION**)

---

## Solução: Linkação via Cloudflare Dashboard

### 1️⃣ Acesse Cloudflare Dashboard

```
https://dash.cloudflare.com/
```

### 2️⃣ Navegue até Pages

- Account → **Pages**
- Selecione projeto: **airtrust**

### 3️⃣ Acesse Custom Domains

- Menu esquerdo: **Custom Domains**

### 4️⃣ Procure airtrust.online

Você verá uma entrada com status (pode ser "Verifying" ou "Error"):

```
airtrust.online
┌─────────────────────────┐
│ Status: Verifying       │
│ Branch: (vazio!)        │
└─────────────────────────┘
```

### 5️⃣ IMPORTANTE: Selecione o Branch

- Clique em **airtrust.online**
- Dropdown: **Branch** → Selecione **`production`** (CRITICAMENTE IMPORTANTE!)
- Clique **Save** ou **Confirm**

### 6️⃣ Aguarde Propagação DNS

- Pode levar 30-60 segundos
- Status mudará de "Verifying" → "Active"

### 7️⃣ Verifique Sincronização

Execute no terminal:

```bash
./verificar-versao-producao.sh
```

**Saída esperada:**

```
Pages Production: bundle=DfICGExB | version=4fa9cacc
airtrust.online: bundle=DfICGExB | version=4fa9cacc
✅ SINCRONIZADO!
```

---

## Alternativa: Via Terminal (Quando Permissões Estiverem OK)

```bash
./atualizar-domain-pages.sh
```

(Atualmente desabilitado pois token não tem permissão de Pages)

---

## ⚠️ Se Não Funcionar

1. **Verifique status do domain no Dashboard:**

   ```
   https://dash.cloudflare.com/ → Pages → airtrust → Custom Domains
   ```

2. **Se ainda está "Verifying":**

   - Talvez DNS não propagou
   - Espere 5 minutos e tente novamente
   - Ou remova/re-adicione o domain

3. **Se mostra erro:**

   - Confirme que `production` branch foi selecionado
   - Verifique se domain foi adicionado com CNAME correto

4. **Teste direto:**
   ```bash
   curl -s https://airtrust.online | grep 'build-version' | head -1
   ```
   - Deve mostrar: `<meta name="build-version" content="4fa9cacc">`
   - Se mostra `__BUILD_VERSION__`, domain ainda não está linkado

---

## 📋 Checklist Final

- [ ] Dashboard: Pages → airtrust → Custom Domains aberto
- [ ] airtrust.online visível na lista
- [ ] Branch selecionado como `production`
- [ ] Aguardou 30-60 segundos para propagação
- [ ] Rodou: `./verificar-versao-producao.sh`
- [ ] Saída: `✅ SINCRONIZADO!`
- [ ] Visitou https://airtrust.online e verificou footer com versão correta

---

## 🎯 Próximos Passos Após Sincronização

1. ✅ Rodapé mostra versão 100% honesta
2. ✅ Cada deploy atualiza versão automaticamente
3. ✅ Verificação: `./verificar-versao-producao.sh` sempre mostra "SINCRONIZADO"

Pronto! Sistema de versionamento honesto está completo.
