# AirTrust - Deploy Manual Cloudflare Pages

## Build já realizado

O frontend já foi buildado com sucesso:

- Build hash: C2xFGjwv-mioxjela.js
- Diretório: dist/client
- Card Renovadas: ✓ Incluído

## Opções de Deploy

### Opção 1: Cloudflare Pages Dashboard (RECOMENDADO)

1. Acesse: https://dash.cloudflare.com/
2. Vá em "Workers & Pages" → "Pages"
3. Selecione o projeto "airtrust" (ou crie se não existir)
4. Clique em "Create deployment" ou "Upload"
5. Upload da pasta `dist/client`

### Opção 2: Wrangler CLI (requer permissões)

```bash
cd dist/client
npx wrangler pages deploy . --project-name=airtrust
```

### Opção 3: Merge para branch de deploy

```bash
git checkout refactor/remove-v2-structure
git merge fix/importacao-completa-limpeza
git push origin refactor/remove-v2-structure
```

## Verificação Pós-Deploy

Após deploy, verificar em: https://airtrust.pages.dev/app/qualificacoes

Dashboard deve mostrar:

- ✓ Card "Total Ativas": 629
- ✓ Card "Válidas": 513
- ✓ Card "A Vencer": 58
- ✓ Card "Vencidas": 58
- ✓ **Card "Renovadas": 6** ← NOVO (roxo)

## API já funcionando

Backend retorna dados corretos:

```bash
curl https://airtrust-api-production.airtrust.workers.dev/api/dashboard/qualificacoes | jq .data.renovadas
# Retorna: 6
```

## Status

- [x] Backend com renovadas funcionando
- [x] Frontend rebuiltado com card Renovadas
- [x] Build commitado (c2bd6caa)
- [ ] Deploy pendente (aguardando upload manual ou merge)
