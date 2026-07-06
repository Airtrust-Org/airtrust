---
status: ativo
tipo: prompt-mestre
proposito: "Prompt resumido para uso rápido em chat de IA"
modelo_recomendado: "DeepSeek V4 Pro | Sonnet 5 | GPT 5.4 Mini"
risco: baixo
contexto_necessario:
  - "[[Contexto - Seguranca RBAC MultiTenant]]"
  - "[[Contexto - Convencoes de Codigo]]"
tags:
  - prompt
  - quick
---

# Prompt: Quick Start AirTrust

## Objetivo
Versão compacta do PROMPT_BASE para uso rápido.

## Prompt
```
AirTrust — Regras para este chat:

1. MULTI-TENANT CRÍTICO: toda query backend com WHERE empresa_id = ? (c.get('empresaId')). Nunca hardcodar.
2. PRODUÇÃO: nunca fazer deploy, migration remota, ou alterar secrets sem autorização explícita.
3. CÓDIGO: soft delete, auditoria, Zod validation, {success, data/error}. Sempre npx tsc --noEmit e npm run lint.
4. STACK: Workers+Hono+D1+R2 / React 19+Vite 6+TanStack Query+Zustand+Tailwind / JWT jose HS256
5. LMS/SCORM: preservar termos técnicos (PLB, ELT, ADELT, EPIRB, PIC, SIC, ATC, CCO, ANAC), não alterar paleta.

Leia CLAUDE.md e a nota do módulo em obsidian-vault/02_MODULOS/ antes de começar.
```
