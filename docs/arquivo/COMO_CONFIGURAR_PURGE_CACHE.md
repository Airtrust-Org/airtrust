# 🔧 Como Configurar o Purge de Cache da Cloudflare

## ✅ O que já está pronto

1. ✅ Script de purge: `scripts/cloudflare-purge-cache.ts`
2. ✅ Comandos npm:
   - `npm run cache:purge` - Limpa TODO o cache
   - `npm run cache:purge:urls` - Limpa URLs específicas
3. ✅ API Token já configurado no `.env`

## ⚠️ O que você precisa fazer (só uma vez)

### Passo 1: Pegar o Zone ID

1. Abra: https://dash.cloudflare.com
2. Clique na **zona/domínio** que hospeda o Pages do AirTrust
   - Provavelmente algo relacionado a `airtrust` ou onde está o Pages
3. Na página principal dessa zona, **role para baixo** até ver:
   ```
   Zone ID: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. **Copie esse valor** (algo como `a1b2c3d4e5f6...`)

### Passo 2: Adicionar no .env

Abra o arquivo `.env` na raiz do projeto e **substitua** a linha:

```env
CLOUDFLARE_ZONE_ID=YOUR_ZONE_ID_HERE
```

Por:

```env
CLOUDFLARE_ZONE_ID=o_valor_que_voce_copiou
```

Salve o arquivo.

## 🚀 Como usar

### Limpar TODO o cache (recomendado após deploy)

```bash
cd "/Users/filipedaumas/Documents/airtrust v1"
npm run cache:purge
```

Você deve ver:

```
🧹 Enviando Purge Everything para Cloudflare...
✅ Cache limpo com sucesso no Cloudflare.
```

### Limpar URLs específicas

```bash
cd "/Users/filipedaumas/Documents/airtrust v1"

npm run cache:purge:urls -- \
  https://production.airtrust.pages.dev/ \
  https://production.airtrust.pages.dev/funcionarios
```

### Confirmar que funcionou

Depois do purge, teste:

```bash
curl -I https://production.airtrust.pages.dev
```

Procure por:

- `cf-cache-status: MISS` ou `DYNAMIC` (logo após o purge)
- Nas próximas requisições pode aparecer `HIT` novamente, mas com conteúdo NOVO

E veja o HTML:

```bash
curl -s https://production.airtrust.pages.dev | head -40
```

O `<script src="/assets/index-XXXXX.js">` deve ter um hash diferente do antigo.

## 🎯 Fluxo ideal de desenvolvimento

### Desenvolvimento local (sempre atualizado)

```bash
npm run dev:fresh
```

Abre: http://localhost:3000

### Deploy para produção

```bash
npm run deploy
npm run cache:purge
```

Aguarde 30-60 segundos, depois acesse: https://production.airtrust.pages.dev

**Dica:** Abra em aba anônima ou faça `Cmd+Shift+R` para forçar reload.

## ❓ Troubleshooting

### "CLOUDFLARE_ZONE_ID não definido"

Você não configurou o Zone ID no `.env`. Veja **Passo 1** acima.

### "Unauthorized" ou "Invalid token"

O token precisa ter permissão **Cache Purge**. Verifique:

1. https://dash.cloudflare.com → Perfil → API Tokens
2. Edite o token e garanta que tem: `Zone → Cache Purge → Edit`

### Purge não funciona / cache continua antigo

1. Rode o purge novamente
2. Espere 1-2 minutos
3. Teste com `curl -I` (não no navegador primeiro)
4. Se `cf-cache-status` ainda estiver `HIT` com `age` alto, pode ser cache de outro lugar (navegador, proxy, etc)

---

**Resumo:** Só falta você pegar o Zone ID no painel da Cloudflare e colar no `.env`. Depois é só `npm run cache:purge` quando quiser forçar atualização! 🚀
