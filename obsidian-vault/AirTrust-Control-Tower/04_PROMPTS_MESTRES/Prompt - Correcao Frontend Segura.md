---
status: ativo
tipo: prompt-mestre
proposito: "Correção de bug no frontend sem quebrar produção"
modelo_recomendado: "DeepSeek V4 Pro | Sonnet 5"
risco: baixo
contexto_necessario:
  - "[[Contexto - Convencoes de Codigo]]"
  - "[[Contexto - Producao e Deploy]]"
tags:
  - prompt
  - frontend
  - bugfix
---

# Prompt: Correção Frontend Segura

## Objetivo
Corrigir bugs de frontend garantindo que não afetam produção, API, ou outros módulos.

## Prompt
```
AirTrust — Correção de frontend.

## ESCOPO
Apenas frontend (React 19, Vite 6, Tailwind 3). Não alterar backend, API, D1 ou R2.

## REGRAS
1. Verificar se o bug é realmente de frontend (não é problema de API?)
2. Foco no componente/página específica — não refatorar módulo inteiro
3. Manter padrões existentes: TanStack Query para dados, Zustand para estado local, React Hook Form + Zod para forms
4. Preservar lazy loading (lazyWithRetry)
5. Não alterar fetchWithAuth, providers, ou Service Worker
6. Testar com npm run dev (Vite :3000)
7. Verificar se funciona em light e dark mode
8. Não adicionar novas dependências sem justificativa

## APÓS
1. npx tsc --noEmit — zero novos erros
2. npm run lint — passando
3. npm run test:run — passando
4. Testar no browser: fluxo completo da página afetada
```
