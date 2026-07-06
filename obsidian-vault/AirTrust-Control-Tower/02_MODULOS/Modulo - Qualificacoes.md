---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
modulo: "Qualificações"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - qualificacoes
  - risco/medio
---

# Qualificações & Certificados

## Função do módulo
Gestão de qualificações de tripulantes com status (VALIDA, VENCIDA, PROXIMA_VENCIMENTO, RENOVADA, PLANEJADA), certificados, reclassificação automática e alertas de vencimento.

## Arquivos principais

### Backend (Worker)
| Arquivo | Função |
|---|---|
| `routes/qualificacoes/*.ts` | 9 arquivos de rotas de qualificações |
| `routes/qualificacoes-alertas.ts` | Alertas de vencimento |
| `routes/qualificacoes-reclass.ts` | Reclassificação automática |
| `routes/qualificacoes-certificados.ts` | Certificados |
| `routes/qualificacoes-certificados-admin.ts` | Admin de certificados |
| `routes/qualificacoes-certificados-write.ts` | Escrita de certificados |
| `routes/certificados/validacao.ts` | Validação de certificados |
| `routes/fix-renovadas.ts` | Correção de renovadas |
| `routes/auditoria.ts` | Auditoria de mudanças |
| `routes/deduplicate.ts` | Deduplicação |

### Frontend (React)
| Página | Rota |
|---|---|
| Qualificações | `/qualificacoes` |
| Dashboard | `/qualificacoes/dashboard` |
| Reclassificação | `/qualificacoes/reclassificacao` |
| Alertas | `/qualificacoes/alertas` |

## Tabelas envolvidas
| Tabela | Função |
|---|---|
| `qualificacoes_tipos` | Tipos de qualificação |
| `qualificacoes_historico` | Histórico por tripulante |
| `qualificacoes_reclass_queue` | Fila de reclassificação |
| `categorias` | Categorias de qualificação |
| `certificados` | Certificados emitidos |

## Status de qualificação
- `VALIDA` — dentro do prazo
- `VENCIDA` — expirada
- `PROXIMA_VENCIMENTO` — janela de alerta
- `RENOVADA` — renovada recentemente
- `PLANEJADA` — turma/sessão planejada

## Regras de negócio críticas
1. Reclassificação automática baseada em datas de vencimento
2. Certificados vinculados a qualificações com SSOT
3. Alertas configuráveis por tipo de qualificação
4. Deduplicação de registros com lógica específica

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| `qualificacoes-historico-ficha.ts:416`: chamada com 5 args, espera 6 | 🔴 CRÍTICO | Aberto |
| Convenção de auditoria inconsistente (`dados_antigos` vs `dados_anteriores`) | 🟢 BAIXO | Aberto |

## O que agentes de IA NÃO podem fazer sem validação
- [ ] Alterar lógica de reclassificação automática
- [ ] Modificar regras de status (VALIDA/VENCIDA/etc)
- [ ] Alterar queries de deduplicação
- [ ] Modificar emissão de certificados sem testar PDF
- [ ] Criar queries sem `empresa_id`

## Prompts úteis
- [[PROMPT_BASE_AIRTRUST]]
- [[Prompt - Fix Qualificações]]

## PRs relacionados
- 

## Pendências
- [ ] Corrigir chamada com argumentos incorretos em `qualificacoes-historico-ficha.ts:416`
