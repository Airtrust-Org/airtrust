# 🚀 QUICK START - SISTEMA DE CERTIFICADOS

## Em 5 Passos

### 1️⃣ Aplicar Migration (5 min)
```bash
# Local
npx wrangler d1 migrations apply airtrust-db --local

# Produção
npx wrangler d1 migrations apply airtrust-db --env production
```

### 2️⃣ Build (2 min)
```bash
npm run build
```

### 3️⃣ Deploy (5 min)
```bash
# Deploy Worker
wrangler deploy --env production

# Deploy Frontend
wrangler pages deploy dist
```

### 4️⃣ Validar (5 min)
```bash
# Health check
curl https://airtrust.workers.dev/api/v2/health

# Testar API
curl -H "Authorization: Bearer {TOKEN}" \
  https://airtrust.workers.dev/api/v2/certificados/1
```

### 5️⃣ Integrar no Frontend (30 min)
- Abrir `HistoricoQualificacoes.tsx`
- Adicionar import: `CertificadoGestaoModal`
- Adicionar state: `certModalOpen`, `selectedQualId`, `selectedFuncId`
- Trocar Download → FileText icon
- Adicionar onClick handler
- Renderizar modal ao final

**Veja**: `EXEMPLOS_INTEGRACAO_CERTIFICADOS.md`

---

## Arquivos Principais

```
✅ Criados:
├── migrations/2010_certificados_system.sql
├── src/worker/api/v2/certificados.ts (substituído)
├── src/worker/utils/file-sanitize.ts
├── src/worker/utils/certificado-template.ts
└── src/react-app/components/CertificadoGestaoModal.tsx

📚 Documentação:
├── SISTEMA_CERTIFICADOS_IMPLEMENTACAO.md
├── EXEMPLOS_INTEGRACAO_CERTIFICADOS.md
├── SUMARIO_CERTIFICADOS.md
└── QUICK_START.md (este arquivo)
```

---

## API Endpoints

### GET /api/v2/certificados/:qualificacao_id
Listar histórico com versionamento

**Response (200)**:
```json
{
  "certificados": [
    {
      "id": 2,
      "versao": 2,
      "eh_anterior": false,
      "tipo_certificado": "UPLOADED",
      "arquivo_url": "...",
      "created_at": "2025-11-02T..."
    }
  ],
  "certificado_ativo": { ... }
}
```

### POST /api/v2/certificados/:qualificacao_id/gerar
Gerar certificado automaticamente

**Body**:
```json
{
  "gerar_agora": true
}
```

**Response (201)**:
```json
{
  "success": true,
  "certificado_id": 123,
  "versao": 1,
  "nome_arquivo": "CERT-001234-CMA-20251102.pdf",
  "html_template": "<!DOCTYPE html>..."
}
```

### POST /api/v2/certificados/:qualificacao_id/upload
Upload de certificado PDF

**Body**: FormData com `file`

**Response (201)**:
```json
{
  "success": true,
  "certificado_id": 456,
  "versao": 2,
  "arquivo_url": "qualificacoes/{id}/..."
}
```

---

## Testar Localmente

```bash
# 1. Iniciar dev
npm run dev

# 2. Abrir browser
open http://localhost:5173

# 3. Navegar até qualificações
# http://localhost:5173/qualificacoes

# 4. Clicar em FileText icon (após integração)

# 5. Testar:
# - Aba Gerar
# - Aba Upload
# - Download histórico
# - Fechar/abrir modal

# 6. Verificar console
# F12 → Console → sem erros
```

---

## Troubleshooting Rápido

| Problema | Solução |
|----------|---------|
| "Cannot find module" | npm install |
| 403 Forbidden | Verificar token/permissões |
| Upload falha | Arquivo PDF < 5MB |
| Modal não abre | Verificar onClick handler |
| Histórico vazio | Verificar DB, rodar migration |

---

## Permissões

- **Owner**: Vê só seus certificados
- **ADMIN**: Vê todos
- **Outros**: 403 Forbidden

```typescript
// No código
if (qualificacao.func_id !== user.funcionario_id && user.perfil !== 'ADMIN') {
  return c.json({ error: 'Forbidden' }, 403);
}
```

---

## Nomenclatura R2

Arquivo é salvo como:
```
qualificacoes/{funcionario_id}/CERT-{matricula}-{codigo}-{data}.pdf

Exemplo:
qualificacoes/456/CERT-001234-CMA-20251102.pdf
```

---

## Versionamento

Cada novo certificado incrementa versão:
- v1: Primeiro (gerado ou upload)
- v2: Segundo (anterior é marcado eh_anterior=TRUE)
- v3: Terceiro
- etc...

Certificado ativo é sempre versão máxima com eh_anterior=FALSE

---

## Próximas Melhorias

- [ ] Preview PDF antes de gerar
- [ ] Assinar certificado digitalmente
- [ ] Notificação de vencimento
- [ ] Compartilhar por email
- [ ] QR code no certificado

---

## Support

Dúvidas? Veja:
1. `SISTEMA_CERTIFICADOS_IMPLEMENTACAO.md` - Testes
2. `EXEMPLOS_INTEGRACAO_CERTIFICADOS.md` - Integração
3. `SUMARIO_CERTIFICADOS.md` - Overview

---

**Tempo Total Estimado**: 45 minutos  
**Nível de Dificuldade**: 🟢 Fácil  
**Risco de Regressão**: 🟢 Baixo
