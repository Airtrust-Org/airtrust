# 🚀 Quick Reference: Forçar Atualização do Frontend

## Para Usuários Finais

### Método 1: Aguardar Notificação (Recomendado)

1. Quando aparecer: **"🚀 Nova versão disponível"**
2. Clique em: **"Atualizar Agora"**
3. Pronto! ✅

### Método 2: Forçar Reload Manual

- **Windows/Linux:** `Ctrl + Shift + R` ou `Ctrl + F5`
- **Mac:** `Cmd + Shift + R`

### Método 3: Limpar Cache (última opção)

1. Abrir DevTools: `F12`
2. Clicar direito no botão reload (segurando DevTools aberto)
3. Escolher: **"Empty Cache and Hard Reload"**

---

## Para Desenvolvedores

### 🛠️ Desenvolvimento Local (localhost:3000)

```bash
# Frontend não atualiza durante desenvolvimento?

# 1️⃣ Limpeza rápida (PRIMEIRA opção)
npm run dev:clean

# 2️⃣ Reset completo (se clean não resolver)
npm run dev:reset

# 3️⃣ Hard reload no navegador
# Mac: Cmd+Shift+R
# Windows/Linux: Ctrl+Shift+F5
```

### 🚀 Deploy + Purge (PRODUÇÃO)

```bash
# Build + Deploy + Purge automático
./deploy-full-automated.sh
```

### Validar Deploy

```bash
# Verificar integridade do deploy
./scripts/validate-deploy.sh https://seu-app.com
```

### Purge Manual Cloudflare

```bash
# Purge seletivo (apenas HTML)
./scripts/purge-cloudflare-cache.sh

# Purge completo (TUDO)
./scripts/purge-cloudflare-cache.sh --all
```

### Testar Service Worker

```javascript
// Console do navegador

// Ver SW registrado
navigator.serviceWorker.getRegistration();

// Forçar update do SW
navigator.serviceWorker.getRegistration().then((r) => r.update());

// Desregistrar SW (debug)
navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
```

### Limpar Cache Programaticamente

```javascript
// Console do navegador
import { clearAllCaches } from '@/lib/sw-manager';
clearAllCaches();
```

---

## Checklist Rápido de Troubleshooting

**Frontend não atualiza?**

- [ ] Forçar reload: `Cmd+Shift+R` / `Ctrl+Shift+F5`
- [ ] Verificar console para erros
- [ ] Verificar `index.html` retorna HTTP 200
- [ ] Purge cache Cloudflare manualmente
- [ ] Limpar cache do navegador (DevTools → Application → Clear Storage)
- [ ] Abrir em janela anônima
- [ ] Desregistrar SW antigo e registrar novo

**Service Worker não funciona?**

- [ ] Verificar se está em HTTPS ou localhost
- [ ] Verificar `sw.js` está sendo servido (HTTP 200)
- [ ] Verificar console do SW (DevTools → Application → Service Workers)
- [ ] Limpar registros antigos

**Deploy falhou validação?**

- [ ] Ler output do script `validate-deploy.sh`
- [ ] Verificar se assets existem no servidor
- [ ] Verificar headers HTTP corretos
- [ ] Re-run build: `rm -rf dist && npm run build`

---

## Arquivos Importantes

| Arquivo                                    | Propósito                    |
| ------------------------------------------ | ---------------------------- |
| `vite.config.ts`                           | Config Vite (hash, manifest) |
| `public/sw.js`                             | Service Worker               |
| `public/_headers`                          | Headers HTTP Cloudflare      |
| `src/lib/sw-manager.tsx`                   | Gerenciador SW React         |
| `scripts/validate-deploy.sh`               | Validação pós-deploy         |
| `scripts/purge-cloudflare-cache.sh`        | Purge Cloudflare             |
| `deploy-full-automated.sh`                 | Deploy completo              |
| `VITE-CACHE-BUSTING-SOLUCAO-DEFINITIVA.md` | Documentação completa        |

---

## Comandos Úteis

```bash
# Build
npm run build

# Deploy
./deploy-full-automated.sh

# Validar
./scripts/validate-deploy.sh https://fp-daumas.github.io/airtrust-v1

# Purge
./scripts/purge-cloudflare-cache.sh

# Testar local
npm run dev
```

---

## Variáveis de Ambiente (Cloudflare)

```bash
# .env
CLOUDFLARE_API_TOKEN=seu_token_aqui
CLOUDFLARE_ZONE_ID=sua_zone_aqui
CLOUDFLARE_DOMAIN=https://seu-dominio.com
```

**Onde obter:**

- Token: https://dash.cloudflare.com/profile/api-tokens
- Zone ID: Overview da sua zone no dashboard

---

## Em Caso de Emergência

**Frontend completamente quebrado após deploy?**

1. **Rollback imediato:**

   ```bash
   git revert HEAD
   git push
   ./deploy-full-automated.sh
   ```

2. **Purge total:**

   ```bash
   ./scripts/purge-cloudflare-cache.sh --all
   ```

3. **Notificar usuários:**
   - Postar no canal de comunicação
   - Pedir hard reload: `Cmd+Shift+R`

---

**Documentação completa:** Ver `VITE-CACHE-BUSTING-SOLUCAO-DEFINITIVA.md`
