---
status: ativo
tipo: guia
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: baixo
ultima_revisao: "2026-07-05"
tags:
  - guia
  - ia
---

# Guia: Como Agentes de IA Devem Consumir Este Vault

## Regra fundamental

> **O vault orienta. O código decide.**

Este vault existe para reduzir prompts ruins e retrabalho. Mas NENHUMA nota aqui é fonte canônica. A fonte canônica é o repositório GitHub + código + testes + PRs + migrations.

## Fluxo de consumo para agentes de IA

```
1. LER o contexto relevante no vault
      ↓
2. VERIFICAR no código-fonte do repositório
      ↓
3. CONFIRMAR que a nota está atualizada (SHA bate?)
      ↓
4. EXECUTAR a tarefa
      ↓
5. ATUALIZAR a nota se houve mudança relevante
```

## Antes de cada tarefa, o agente DEVE:

1. **Ler** `[[INDICE]]` para navegar no vault
2. **Ler** a nota do módulo relevante em `02_MODULOS/`
3. **Ler** `[[Contexto - Seguranca RBAC MultiTenant]]` (obrigatório para qualquer alteração de backend)
4. **Ler** `[[Contexto - Convencoes de Codigo]]` (obrigatório para qualquer alteração de código)
5. **Verificar** `ultimo_sha_verificado` na nota — se o SHA atual do repo (`git rev-parse HEAD`) for diferente, a nota pode estar desatualizada
6. **Buscar** no código os arquivos listados na nota para confirmar que ainda existem

## O que o agente NUNCA deve fazer:

- ❌ Confiar cegamente em `ultimo_sha_verificado` antigo
- ❌ Assumir que uma rota de API ainda existe sem verificar no `index.ts`
- ❌ Assumir que uma tabela tem certas colunas sem verificar a migration mais recente
- ❌ Fazer deploy, migration em produção, ou alterar secrets (sempre requer autorização explícita)
- ❌ Usar `empresa_id` fixo (`= 1`) — sempre usar o do contexto `c.get('empresaId')`
- ❌ Criar query sem `WHERE empresa_id = ?`

## Sinais de que a nota está desatualizada

- `ultimo_sha_verificado` é mais antigo que o HEAD atual
- Arquivos listados na nota não existem mais no repo
- Rotas listadas não estão mais em `index.ts`
- O comportamento descrito não confere com o código atual

Nesses casos, o agente deve:
1. Reportar a divergência
2. Trabalhar com base no código (não na nota)
3. Sugerir atualização da nota

## Consumo de prompts mestres

Quando usar um prompt de `04_PROMPTS_MESTRES/`:
1. Ler o prompt completo
2. Ler TODOS os `contexto_necessario` listados no frontmatter
3. Seguir o checklist de pós-execução do prompt
4. Reportar resultado no formato esperado
