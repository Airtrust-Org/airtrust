# 🎯 TUTORIALIZAÇÃO GERAL - AIRTRUST PROJECTS

Versão: 1.0 | Data: 3 de Novembro de 2025

## 📋 STACK & ARQUITETURA

### Frontend
React 19 + TypeScript + Vite + Tailwind + Design System
src/react-app/ → pages/, components/, styles/

### Backend
Cloudflare Workers + Hono + TypeScript + Zod
src/worker/ → routes/, services/, dtos/, middleware/

### Database
D1 (SQLite) com soft delete e auditoria
Migração: src/worker/migrations/

### Storage
R2 S3-compatible | Nomenclatura: TIPO-ID-DATA.ext

## 🎯 PADRÕES OBRIGATÓRIOS

1. Response: { success, true/false, data, error?, code? }
2. Errors: Sempre AppError(status, msg, code)
3. Services: Estender BaseService<T>
4. DTOs: Validar com Zod sempre
5. Soft Delete: UPDATE deleted_at, NUNCA DELETE
6. Auditoria: Log em auditoria_avancadav2
7. TypeScript: Strict mode, tipos completos
8. UI: Design System tokens + Button novo

## 📁 ESTRUTURA

airtrust/
├── .github/copilot-instructions.md
├── .github/PROMPT-TEMPLATE-GERAL.md
├── .github/PROMPT-REUTILIZAVEL.md
├── .vscode/settings.json
├── src/worker/
├── src/react-app/
└── wrangler.toml
