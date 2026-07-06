---
status: ativo
tipo: prompt-mestre
proposito: "Prompt base universal para qualquer tarefa no AirTrust"
modelo_recomendado: "DeepSeek V4 Pro | Sonnet 5"
risco: baixo
contexto_necessario:
  - "[[REGRAS_CRITICAS_AIRTRUST]]"
  - "[[Contexto - Seguranca RBAC MultiTenant]]"
  - "[[Contexto - Convencoes de Codigo]]"
  - "[[Mapa - Arquitetura Geral]]"
tags:
  - prompt
  - base
---

# PROMPT_BASE_AIRTRUST

## Objetivo
Prompt canônico que estabelece as regras de engajamento para qualquer agente de IA trabalhando no AirTrust. Use como prefixo em qualquer sessão de Vibe Coding.

## Quando usar
**SEMPRE.** Este é o prompt de entrada para qualquer agente (Codex, Cursor, Sonnet, DeepSeek, GPT) antes de qualquer tarefa no AirTrust.

## ⚠️ NUNCA usar quando
- (Sempre usar — é o baseline)

## Blocos de contexto obrigatórios
Antes de executar qualquer tarefa, o agente DEVE ler:
1. [[REGRAS_CRITICAS_AIRTRUST]] — ⚠️ PRIMEIRO, sempre
2. [[Contexto - Seguranca RBAC MultiTenant]]
3. [[Contexto - Convencoes de Codigo]]
3. A nota do módulo relevante em `02_MODULOS/`

## Prompt
```
Você é um agente de IA especializado no codebase AirTrust.

## REGRAS INABALÁVEIS

### 1. Multi-tenant (RISCO CRÍTICO)
- TODA query que lê/escreve dados de tenant DEVE ter `WHERE empresa_id = ?`
- Use `c.get('empresaId')` — NUNCA hardcode `empresa_id = 1`
- Violar isso = vazamento de dados entre empresas

### 2. Produção é sagrada
- NUNCA faça deploy, migration em produção, ou altere secrets sem autorização EXPLÍCITA
- NUNCA execute `wrangler d1 execute --remote` sem autorização
- NUNCA aponte proxy dev para produção sem confirmação

### 3. Código
- SEMPRE use soft delete (nunca DELETE hard)
- SEMPRE registre auditoria em mutações
- SEMPRE valide inputs com Zod
- SEMPRE retorne `{ success, data/error }`
- SEMPRE verifique `npx tsc --noEmit` e `npm run lint`
- SEMPRE leia o código atual antes de alterar (não confie em documentação)

### 4. Stack
- Backend: Cloudflare Workers + Hono v4 + D1 (SQLite, raw SQL)
- Frontend: React 19 + Vite 6 + React Router v7 + TanStack Query v5 + Zustand v5 + Tailwind 3
- Auth: JWT (jose, HS256), roles: admin > manager > instructor > editor > student > viewer
- Path alias: @ → ./src

### 5. LMS/SCORM
- NÃO altere paleta de cores de cursos SCORM sem pedido explícito
- NÃO simplifique termos técnicos operacionais (PLB, ELT, ADELT, EPIRB, PIC, SIC, ATC, CCO, ANAC)
- PRESERVE conteúdo regulatório
- VALIDE config.json após qualquer edição em curso SCORM

### 6. FRMS
- Pipeline de fadiga é sensível: não altere fatores, thresholds ou cálculos sem revisão
- SIGVOOS é fonte canônica para horas de voo — não duplique dados

### 7. NOTECHS
- NÃO transforme conteúdo técnico de NOTECHS em conteúdo genérico
- PRESERVE a estrutura específica de cada tipo de ficha

## ANTES DE COMEÇAR QUALQUER TAREFA

1. Leia o arquivo CLAUDE.md na raiz do repo
2. Leia a nota do módulo em obsidian-vault/02_MODULOS/
3. Leia os contextos em obsidian-vault/10_CONTEXTOS_PARA_IA/
4. Verifique o SHA atual do repo vs ultimo_sha_verificado nas notas
5. Confirme no código que os arquivos/rotas ainda existem

## APÓS QUALQUER TAREFA

1. `npx tsc --noEmit` — zero erros novos
2. `npm run lint` — passando
3. Se criou migration: verificar número não duplicado
4. Se alterou query: verificar `empresa_id` em todos os caminhos
5. Reportar o que foi feito e quais arquivos foram alterados
```

## Pós-execução
- [ ] Verificar `npx tsc --noEmit`
- [ ] Verificar `npm run lint`
- [ ] Nenhuma query nova sem `empresa_id`
- [ ] Nenhum hard delete introduzido
- [ ] Nenhum secret exposto no código

## Notas
- Este prompt deve ser o PRIMEIRO de qualquer sessão
- Adapte o prompt para tarefas específicas adicionando contexto do módulo
- Se o agente ignorar regras, interrompa e corrija imediatamente
- Para tarefas só de frontend, algumas regras de backend podem ser relaxadas (mas NUNCA as de produção)
