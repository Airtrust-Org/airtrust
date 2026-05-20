# 🔍 DIAGNÓSTICO DE DADOS - 11/11/2025

## ✅ BANCO DE DADOS (D1) - CONFIRMADO

Verificado via `wrangler d1 execute`:

| Tabela | Registros | Status |
|--------|-----------|--------|
| manobras | 81 | ✅ OK |
| simuladores | 12 | ✅ OK |
| qualificacoes | 78 | ✅ OK |
| funcionarios | 46 | ✅ OK |
| categorias_qualificacoes | 5 | ✅ OK |
| tipos_sessao | 9 | ✅ OK |

## ✅ API WORKERS - CONFIRMADA

Testado via curl direto:

```
GET https://0199d03e-fe13-77d7-a6e7-7d94d446894b-production.airtrust.workers.dev/api/v2/manobras
Response: 76 manobras ✅

GET /api/v2/simuladores
Response: 12 simuladores ✅

GET /api/v2/qualificacoes
Response: 20 qualificacoes ✅

GET /api/v2/funcionarios
Response: 24 funcionarios ✅
```

## ❓ FRONTEND - POSSÍVEIS PROBLEMAS

Os dados EXISTEM e a API RETORNA os dados corretamente!

**Possíveis causas de não aparecer no frontend:**

### 1. ❓ URL da API está errada no frontend
- [ ] Verificar DevTools → Console → URL sendo chamada
- [ ] Verificar DevTools → Network → Requests à API

### 2. ❓ .env não está sendo lido pelo build
- [ ] Verificar se VITE_API_URL está injetado no bundle
- [ ] Fazer rebuild com `npm run build`

### 3. ❓ JavaScript não está tentando fazer fetch
- [ ] Verificar DevTools → Console → mensagens de debug
- [ ] Verificar se os logs de API Config aparecem

### 4. ❓ CORS bloqueando requisição
- [ ] DevTools → Console → procurar por "CORS error"
- [ ] DevTools → Network → Ver response headers

### 5. ❓ Páginas não estão usando useApi hook
- [ ] Algumas páginas podem estar ainda usando fetch antigo

---

## 🔧 PRÓXIMAS AÇÕES

### Ação 1: Verificar URL no DevTools
```javascript
// Abra https://main.airtrust.pages.dev
// Pressione F12 → Console
// Procure por: "🔍 [API Config]"
// Deve mostrar: https://0199d03e-...workers.dev/api/v2
```

### Ação 2: Checar Network Requests
```
F12 → Network → Recarregue página (F5)
Procure por requisições para:
https://0199d03e-...workers.dev/api/v2/...

Se tiver 404 ou erro: URL está errada
Se tiver 200: Dados estão sendo recebidos
```

### Ação 3: Forçar novo deploy
```bash
npm run build
cp dist/client/index.html dist/
cp -r dist/client/assets dist/
wrangler pages deploy dist --project-name=airtrust --branch=main
```

### Ação 4: Limpar cache do navegador
```
F12 → Application → Clear site data
Ou: Ctrl+Shift+Delete
```

---

## 📊 RESUMO

| Camada | Status | Verificado |
|--------|--------|-----------|
| D1 Database | ✅ 81+ registros | Sim, via wrangler |
| Workers API | ✅ Retorna dados | Sim, via curl |
| Pages Frontend | ❓ ? | Não validado ainda |

**Próximo passo:** Abrir `https://main.airtrust.pages.dev` no navegador e verificar DevTools!

