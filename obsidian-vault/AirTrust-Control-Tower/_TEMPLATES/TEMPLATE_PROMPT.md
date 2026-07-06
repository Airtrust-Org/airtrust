---
status: ativo | depreciado | em_teste
tipo: prompt-mestre
proposito: "<PROPOSITO_DO_PROMPT>"
modelo_recomendado: "DeepSeek V4 Pro | Sonnet 5 | GPT 5.4 Mini | Haiku"
risco: baixo | medio | alto   # risco de usar este prompt mal
contexto_necessario:
  - "[[Contexto - <NOME>]]"
tags:
  - prompt
  - "<dominio>"
---

# Prompt: <NOME>

## Objetivo
<!-- O que este prompt entrega quando executado corretamente? -->

## Quando usar
<!-- Gatilhos e situações típicas -->

## ⚠️ NUNCA usar quando
- 

## Blocos de contexto obrigatórios
Antes de executar este prompt, o agente DEVE ler:
1. [[Contexto - Segurança RBAC MultiTenant]]
2. 

## Prompt
```
<PROMPT COMPLETO AQUI>
```

## Pós-execução
- [ ] Verificar se os arquivos modificados estão corretos
- [ ] Rodar `npx tsc --noEmit`
- [ ] Rodar `npm run lint`
- [ ] Verificar se nenhuma migration nova foi gerada indevidamente

## Notas
- 
