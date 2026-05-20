# Revisão Focada - SGSO, FRMS e Pasta Virtual

Data: 2026-03-16

## Objetivo

Confirmar riscos e prioridade de migração de autenticação/transporte nos módulos críticos de operação.

## SGSO

### Achados

1. Uso de token em leitura direta de storage em partes do fluxo de telas SGSO.
   Arquivos:
   - `src/react-app/pages/sgso/useSgsoApi.ts`
   - `src/react-app/pages/Sgso.tsx`
   - `src/react-app/pages/SgsoRelato.tsx`

2. Fallback para chave legada `token` ainda aparece nesses fluxos.

### Ação recomendada

- migrar para `getAccessToken()`
- remover fallback `window.localStorage.getItem('token')`

## FRMS

### Achados

1. Ainda há leitura direta de token no fluxo de importação FRMS.
   Arquivo:
   - `src/react-app/pages/frms/FrmsImportacaoFira.tsx`

2. Esse fluxo é sensível por volume de requisições e impacto operacional.

### Ação recomendada

- migrar para token canônico
- centralizar chamadas no client canônico para manter timeout/retry padronizados

## Pasta Virtual

### Achados

1. Leitura direta de token em página e hooks da pasta virtual.
   Arquivos:
   - `src/react-app/pages/PastaVirtual.tsx`
   - `src/react-app/hooks/usePastaVirtual.ts`

2. Há risco de divergência de sessão em cenários de refresh/rotação de token.

### Ação recomendada

- usar `getAccessToken()` e fluxo de refresh canônico
- manter operações de upload/delete no mesmo client de transporte padrão

## Ordem de Correção Recomendada

1. SGSO
2. FRMS
3. Pasta Virtual

Motivo:

- SGSO e FRMS são os módulos mais críticos para operação e auditoria
- Pasta Virtual é crítica para compliance documental, mas com menor acoplamento operacional em tempo real
