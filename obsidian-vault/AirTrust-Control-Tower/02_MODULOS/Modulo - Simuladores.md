---
status: ativo
tipo: contexto-modulo
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
modulo: "Simuladores"
ultima_revisao: "2026-07-05"
nao_assumir_sem_verificar_codigo: true
tags:
  - modulo
  - simuladores
  - risco/medio
---

# Simuladores & Sessões

## Função do módulo
Gestão de simuladores de voo, sessões de treinamento, fichas de avaliação, modelos de sessão, equipamentos e catálogo de simuladores. Suporta sessões compartilhadas entre empresas.

## Arquivos principais

### Backend (Worker)
| Arquivo | Função |
|---|---|
| `routes/simuladores-core.ts` | Rotas principais |
| `routes/simuladores-catalogo.ts` | Catálogo de simuladores |
| `routes/simuladores-sessoes.ts` | Sessões de treinamento |
| `routes/simuladores-sessoes-participantes.ts` | Participantes |
| `routes/simuladores-sessoes-update.ts` | Atualização de sessões |
| `routes/simuladores-fichas.ts` | Fichas de avaliação |
| `routes/simuladores-fichas-acoes.ts` | Ações em fichas |
| `routes/simuladores-fichas-simulador.ts` | Fichas por simulador |
| `routes/simuladores-fichas-edicoes.ts` | Edições de fichas |
| `routes/simuladores-modelos.ts` | Modelos de sessão |
| `routes/simuladores-equipamentos.ts` | Equipamentos |
| `routes/simuladores-relatorios.ts` | Relatórios |
| `routes/simuladores-shared-session.ts` | Sessões compartilhadas |
| `routes/simuladores-shared-session-logic.ts` | Lógica compartilhada |

### Frontend (React)
| Página | Rota |
|---|---|
| Simuladores | `/simuladores` |
| Catálogo | `/simuladores/catalogo` |
| Sessões | `/simuladores/sessoes` |
| Fichas | `/simuladores/fichas` |
| Modelos | `/simuladores/modelos` |

## Flag: `SIMULATOR_SHARED_SESSIONS_ENABLED`
✅ `true` — Permite compartilhar sessões entre empresas (wrangler.toml)

## Regras de negócio críticas
1. Sessões compartilhadas devem respeitar isolamento multi-tenant mesmo quando cross-empresa
2. Fichas de avaliação vinculadas a sessões e tripulantes
3. Modelos de sessão reutilizáveis com manobras pré-definidas

## Riscos conhecidos
| Risco | Severidade | Status |
|---|---|---|
| Sessões compartilhadas: risco de vazamento cross-tenant se mal implementado | 🟠 ALTO | Monitorar |

## O que agentes de IA NÃO podem fazer sem validação
- [ ] Alterar lógica de sessões compartilhadas
- [ ] Modificar estrutura de fichas de avaliação
- [ ] Criar queries sem `empresa_id`
