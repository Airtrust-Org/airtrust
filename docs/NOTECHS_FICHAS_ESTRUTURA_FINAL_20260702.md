# NOTECHS Fichas — Estrutura Final 2026-07-02

> **SHA main:** `3cdefd8` (PR #238 merged)
> **Status:** Macroetapa NOTECHS concluída — código em main, sem deploy

---

## 1. Padrão Final da Ficha

1. **18 manobras técnicas** — recorte provisório por ordem do modelo (`slice(0,18)`)
2. **15 NOTECHS fixos** — itens avaliáveis individuais (ordem 1001-1015)
3. **Régua de avaliação atual** — preservada, após NOTECHS
4. **Observações e assinaturas** — preservadas

Ordem na ficha: **Técnicas → NOTECHS → Régua → Observações/Assinaturas**

## 2. Dados Persistidos (Relatório Futuro)

| Dado | Tabela | Campo |
|---|---|---|
| Técnicas | `fichas_sessao_manobras` | `categoria != 'NOTECHS'` |
| NOTECHS | `fichas_sessao_manobras` | `categoria = 'NOTECHS'` |
| Nota/resultado | `fichas_sessao_manobras` | `resultado` |
| Observações por item | `fichas_sessao_manobras` | `observacoes` |
| Catálogo NOTECHS | `manobras` | `categoria = 'NOTECHS'` (via migration 0413) |
| Categoria NOTECHS | `manobras_categorias` | `codigo = 'NOTECHS'` |

NOTECHS é consultável por:
- Ficha (`ficha_id`)
- Aluno/tripulante (via JOIN com `fichas_sessao`)
- Instrutor (via JOIN com `fichas_sessao`)
- Modelo de sessão (via JOIN com `modelos_sessao_manobras`)
- Período (`created_at`/`updated_at`)
- Grupo NOTECHS (via JOIN com `manobras`)
- Item NOTECHS (`codigo`)
- Nota/resultado (`resultado`)

## 3. Apenas Referência (Não Persistido)

- Modal com 60 descritores completos por faixa (`ModalNotechsReferencia.tsx`)
- Página auxiliar de referência (futura)
- Agrupamento visual em 4 blocos (Cooperação, Liderança, Consciência, Decisão)
- Conteúdo textual de descritores não é armazenado no banco

## 4. CRM — Legado Preservado

| Item | Status |
|---|---|
| 5 manobras CRM (`S76-LOFT-21/22`, `LOFT-CRM-01/02/03`) | Preservadas como histórico |
| 7 modelos de sessão com vínculos CRM | Preservados |
| Fichas antigas com CRM avaliado | Preservadas, imutáveis |
| CRM em novas fichas/modelos | Substituído por NOTECHS |
| Hard delete de CRM | Não executado |
| Migrações históricas CRM (0284, 0292, 0293, 0303) | Versionadas |

## 5. 22 Técnicas — Matriz Histórica

- A matriz histórica de 22 técnicas por modelo é a base anterior
- **Não é o padrão novo** — o padrão novo é 18 técnicas + 15 NOTECHS
- `buildOperationalFichaManobras()` aplica `slice(0, 18)` como recorte provisório
- `slice(0, 18)` **não é matriz pedagógica final** — é fallback técnico seguro
- Fichas antigas com 22 técnicas não são alteradas

## 6. Pendência — Redistribuição Pedagógica das 18 Técnicas

- A seleção definitiva das 18 técnicas por modelo requer:
  - Validação de instrutor por modelo
  - Critérios pedagógicos (segurança, criticidade, fase de aprendizagem)
  - Separação por tipo de sessão (inicial, periódico, LOFT/check)
  - Preservação de manobras críticas
  - Remoção de duplicidades
  - Substituição de CRM por NOTECHS
- Ver `docs/analysis/NOTECHS_18_TECNICAS_REDESIGN_PLAN_20260702.md`

## 7. Ressalva

- **Não é homologação/aprovação ANAC**
- A validação regulatória final depende de aprovação externa
- O sistema está tecnicamente pronto para suportar 18 técnicas + 15 NOTECHS

## 8. Migration 0413

- `worker-airtrust/migrations/0413_notechs_categoria_itens.sql`
- Cria categoria `NOTECHS` e 15 itens em `manobras`
- **Não aplicada em produção**
- Idempotente, tenant scope, rollback documentado
- Pré-condição: migration 0394
