# 🚀 COMO USAR A DOCUMENTAÇÃO API

## 📁 Arquivos Criados

```
docs/
├── README.md                    # Documentação principal
├── openapi.yaml                 # Especificação OpenAPI 3.0
├── postman_collection.json      # Collection do Postman
└── COMO_USAR.md                 # Este arquivo
```

---

## 1️⃣ VISUALIZAR SWAGGER UI

### Opção A: Swagger UI Watcher (Recomendado)

```bash
# Instalar globalmente
npm install -g swagger-ui-watcher

# Navegar até a pasta docs
cd docs

# Iniciar servidor
swagger-ui-watcher openapi.yaml

# Acessar no navegador
open http://localhost:8000
```

### Opção B: Swagger Editor Online

1. Acessar https://editor.swagger.io/
2. File > Import File
3. Selecionar `openapi.yaml`
4. Visualizar e testar endpoints

### Opção C: VS Code Extension

1. Instalar extensão "Swagger Viewer"
2. Abrir `openapi.yaml`
3. Pressionar `Shift + Alt + P`
4. Selecionar "Preview Swagger"

---

## 2️⃣ IMPORTAR NO POSTMAN

### Passo 1: Importar Collection

```bash
# Abrir Postman
# Clicar em "Import"
# Selecionar "postman_collection.json"
# Clicar em "Import"
```

### Passo 2: Configurar Variáveis

```
baseUrl: http://localhost:8787  (ou URL de produção)
token: (será preenchido automaticamente após login)
```

### Passo 3: Testar Endpoints

1. **Login:**
   - Executar `Auth > Login`
   - Token será salvo automaticamente

2. **Listar Qualificações:**
   - Executar `Qualificações > Listar Qualificações`
   - Token será enviado automaticamente

3. **Criar Qualificação:**
   - Executar `Qualificações > Criar Qualificação`
   - Editar body conforme necessário

---

## 3️⃣ GERAR DOCUMENTAÇÃO HTML

### Usando Redoc

```bash
# Instalar
npm install -g redoc-cli

# Gerar HTML
redoc-cli bundle openapi.yaml -o api-docs.html

# Abrir no navegador
open api-docs.html
```

### Usando Swagger Codegen

```bash
# Instalar
npm install -g swagger-codegen

# Gerar documentação
swagger-codegen generate -i openapi.yaml -l html2 -o ./html-docs

# Abrir
open ./html-docs/index.html
```

---

## 4️⃣ GERAR CLIENTES SDK

### JavaScript/TypeScript

```bash
# Instalar
npm install -g @openapitools/openapi-generator-cli

# Gerar cliente
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./sdk/typescript

# Usar no projeto
npm install ./sdk/typescript
```

### Python

```bash
openapi-generator-cli generate \
  -i openapi.yaml \
  -g python \
  -o ./sdk/python
```

### PHP

```bash
openapi-generator-cli generate \
  -i openapi.yaml \
  -g php \
  -o ./sdk/php
```

---

## 5️⃣ TESTAR API COM CURL

### Login

```bash
curl -X POST http://localhost:8787/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@airtrust.com",
    "password": "admin123"
  }'
```

### Listar Qualificações

```bash
TOKEN="seu-token-aqui"

curl -X GET http://localhost:8787/api/v2/qualificacoes \
  -H "Authorization: Bearer $TOKEN"
```

### Criar Qualificação

```bash
curl -X POST http://localhost:8787/api/v2/qualificacoes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 1,
    "tipo": "TREINAMENTO",
    "categoria": "CRM",
    "data_validade": "2027-10-05"
  }'
```

### Upload de Certificado

```bash
curl -X POST http://localhost:8787/api/v2/qualificacoes/1/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@certificado.pdf"
```

---

## 6️⃣ INTEGRAR COM FRONTEND

### React/Next.js

```typescript
// api/client.ts
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8787/api/v2',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Usar
export const qualificacoesAPI = {
  list: () => api.get('/qualificacoes'),
  create: (data) => api.post('/qualificacoes', data),
  upload: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/qualificacoes/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
```

### Vue.js

```javascript
// api/client.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8787/api/v2'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

---

## 7️⃣ VALIDAR OPENAPI

### Usando Spectral

```bash
# Instalar
npm install -g @stoplight/spectral-cli

# Validar
spectral lint openapi.yaml

# Deve retornar: ✅ No errors or warnings
```

### Usando Swagger CLI

```bash
# Instalar
npm install -g swagger-cli

# Validar
swagger-cli validate openapi.yaml
```

---

## 8️⃣ HOSPEDAR DOCUMENTAÇÃO

### GitHub Pages

```bash
# 1. Gerar HTML
redoc-cli bundle openapi.yaml -o index.html

# 2. Criar branch gh-pages
git checkout -b gh-pages

# 3. Adicionar index.html
git add index.html
git commit -m "docs: add API documentation"

# 4. Push
git push origin gh-pages

# 5. Configurar GitHub Pages
# Settings > Pages > Source: gh-pages branch
```

### Netlify

```bash
# 1. Gerar HTML
redoc-cli bundle openapi.yaml -o index.html

# 2. Deploy
netlify deploy --prod --dir=.
```

---

## 9️⃣ ATUALIZAR DOCUMENTAÇÃO

### Workflow Recomendado

```bash
# 1. Editar openapi.yaml
vim openapi.yaml

# 2. Validar
spectral lint openapi.yaml

# 3. Gerar HTML
redoc-cli bundle openapi.yaml -o api-docs.html

# 4. Commit
git add openapi.yaml api-docs.html
git commit -m "docs: update API documentation"

# 5. Push
git push origin main
```

---

## 🔟 TROUBLESHOOTING

### Erro: CORS no Swagger UI

**Solução:** Adicionar headers CORS no backend

```typescript
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  await next();
});
```

### Erro: Token expirado

**Solução:** Fazer login novamente no Postman

```
Auth > Login > Send
```

### Erro: Arquivo muito grande (413)

**Solução:** Comprimir PDF antes do upload

```bash
# macOS/Linux
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook \
   -dNOPAUSE -dQUIET -dBATCH \
   -sOutputFile=certificado-comprimido.pdf certificado.pdf
```

---

## 📚 RECURSOS ADICIONAIS

- **Swagger Editor:** https://editor.swagger.io/
- **Redoc:** https://redocly.com/
- **Postman:** https://www.postman.com/
- **OpenAPI Generator:** https://openapi-generator.tech/
- **Spectral:** https://stoplight.io/open-source/spectral

---

**Última atualização:** 19/10/2025
