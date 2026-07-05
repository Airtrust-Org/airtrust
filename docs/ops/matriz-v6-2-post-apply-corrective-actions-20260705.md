# Matriz V6.2 — Ações Corretivas Pós-Apply (2026-07-05)

> **Status**: Contenção concluída. PR de código pronto para revisão.
> **Data**: 5 de Julho de 2026
> **Commits locais**: `ebf8bcd6` (auditoria), `f55800bc` (correções)
> **Branch**: `main` (2 commits à frente de `origin/main`)

---

## Taxonomia de códigos NOTECHS/LOFT

Três categorias distintas que não devem ser confundidas:

| Categoria | Prefixo | Exemplos | Natureza | Posição na ficha |
|---|---|---|---|---|
| **NOTECHS canônicos** | `NOTECHS-01` a `NOTECHS-15` | `NOTECHS-01`, `NOTECHS-07`, `NOTECHS-15` | Camada comportamental (CRM). 15 itens com 4 subdescritores cada (60 linhas multitenant). | Bloco NOTECHS separado, após as 18 técnicas |
| **LOFT-NOT (legado)** | `LOFT-NOT-01` a `LOFT-NOT-31` | `LOFT-NOT-01`, `LOFT-NOT-17` | Catálogo legado de itens LOFT noturno. 31 ativos. **Não fazem parte das 18 técnicas nem do bloco NOTECHS.** | Nenhuma — itens de catálogo apenas |
| **OPS-NOT-X1 (operacional)** | `OPS-NOT-X1` | `OPS-NOT-X1` | Técnica operacional noturna. **Faz parte das 18 técnicas.** | Dentro do bloco de 18 técnicas |

Regra: `NOTECHS-%` e `LOFT-NOT-%` nunca podem aparecer dentro das 18 técnicas. Apenas `OPS-NOT-X1` (prefixo `OPS-`) está nas técnicas.

---

## 1. O que foi aplicado no apply principal

O apply principal (`68f65d8a`) implantou a Matriz V6.2 Pedagógica em produção (empresa 6):

- 51 modelos de sessão ativos (não-TEST)
- 918 vínculos modelo↔manobra (18 técnicas por modelo)
- 361 manobras distintas no catálogo ativo
- 15 NOTECHS canônicos (`NOTECHS-01` a `NOTECHS-15`) no catálogo, zero dentro das técnicas
- 31 LOFT-NOT (`LOFT-NOT-01` a `LOFT-NOT-31`) no catálogo legado, zero dentro das técnicas
- Desativação de códigos legados (22→18 compressão)
- Renomeação IFR
- Reordenação e deduplicação de técnicas

## 2. O que foi corrigido depois do apply

### 2.1 `EXA-CND-01` → `EXA-CND-03` em `CRED-EXA`

**Problema**: A técnica #10 de CRED-EXA apontava para `EXA-CND-01` ("Planejar um Exame de Proficiencia"), duplicando `EXA-PLN-01` na ficha em vez de representar a condução do exame.

**Correção**: Soft-delete do vínculo `EXA-CND-01` (id=2647, `deleted_at=2026-07-05 20:15:30`) e restauração do vínculo já existente `EXA-CND-03` (id=2649, `deleted_at=NULL`) na posição ordem=10.

**Query executada** (em produção, 2026-07-05 ~20:15 UTC):
```sql
UPDATE modelos_sessao_manobras SET deleted_at = datetime('now') WHERE id = 2647;
UPDATE modelos_sessao_manobras SET deleted_at = NULL WHERE id = 2649;
```

**Justificativa**: `EXA-CND-03` ("Conduzir um Exame de Proficiencia") já existia no catálogo como parte dos 6 itens EXA-CND, tendo sido soft-deleted durante a compressão 22→18. Restaurar o vínculo existente era mais seguro que criar um novo (evita violação de UNIQUE). O conteúdo semântico é correto: CRED-EXA requer condução de exame, não planejamento.

### 2.2 Overrides de texto em `modelos_sessao_manobras.observacoes`

**Problema**: Quatro lacunas de redação cosmética e uma decisão pedagógica não implementada:

| Modelo | Manobra | Override |
|--------|---------|----------|
| A139-S-02/02 | A139-CKL-01 | "Normal checklist — preparação IFR semestral" (remove "noturna") |
| A139-S-02/02 | A139-EST-01 | "Estacionamento e corte pós-voo" (remove "noturno") |
| SK76-S-02/02 | S76-CKL-01 | "Checklist e preparação IFR" (remove "noturna") |
| SK76-S-02/02 | S76-EST-01 | "Encerramento pós-voo" (remove "noturno") |
| SK76-I-05/12 | S76-UAR-00 | "Recuperação de atitudes anormais básica após perda momentânea de referências" (nota de gatilho de falha) |
| S76-P-C1/VFR | S76-FFM-32 | "Fluxo de Combustível fora do Normal — decisão de retorno e encerramento" (decisão de fechamento pendente) |
| CRED-EXA | EXA-PAD-01 | "Padronização operacional e representatividade da autoridade — avaliar e registrar separadamente: (a) padronização operacional…" (decisão de rubrica dupla) |

**Mecanismo**: O campo `modelos_sessao_manobras.observacoes` (antes não utilizado) agora serve como override de texto por vínculo modelo↔manobra. Quando presente e não-vazio, substitui `manobras.nome` e `manobras.descricao` na renderização da ficha.

### 2.3 Blindagem contra metadado interno

**Problema**: Um teste de regressão comprovou que dados no formato `tipo_item=; fase_voo=; matriz_v6_modelo=` poderiam vazar para a ficha se colocados em `observacoes`.

**Solução**: Regex `INTERNAL_METADATA_LEAK_RE` compartilhada entre backend (`buildOperationalFichaManobras`) e frontend (`buildFichaModeloPdfData`). Qualquer override que case com `/tipo_item\s*=|fase_voo\s*=|carater\s*=|fap_refs\s*=|matriz_v6_modelo\s*=/i` é descartado (tratado como se não existisse).

### 2.4 Migration 0417 (NÃO APLICADA)

Adiciona coluna `caracter_loft INTEGER NOT NULL DEFAULT 0` em `modelos_sessao`. **Preparada para revisão apenas. NÃO aplicada em nenhum ambiente.**

## 3. Escritas em produção após a auditoria

| Data/Hora (UTC) | Tabela | Operação | Registro |
|---|---|---|---|
| 2026-07-05 ~20:15 | `modelos_sessao_manobras` | UPDATE id=2647 SET deleted_at | Soft-delete EXA-CND-01 |
| 2026-07-05 ~20:15 | `modelos_sessao_manobras` | UPDATE id=2649 SET deleted_at=NULL | Restaurar EXA-CND-03 |
| 2026-07-05 ~20:20 | `modelos_sessao_manobras` | UPDATE × 7 | Popular `observacoes` |

**Total**: 9 escritas. Todas documentadas. Nenhuma afetou fichas existentes, histórico, avaliações ou agendamentos.

## 4. Backup pontual usado

Diretório: `artifacts/db-backups/matriz-v6-2-post-apply-corrections-reconcile-20260705T203508Z-f55800bc/`

Backups pré-existentes da correção (criados durante a execução):
- `artifacts/db-backups/exa-cnd-01-fix-20260705/`
- `artifacts/db-backups/observacoes-override-fix-20260705/`

## 5. Queries executadas em produção

Todas as queries de correção estão registradas nos backups acima e nos commits. Nenhuma query de escrita adicional foi executada após as correções.

## 6. Justificativa técnica para `EXA-CND-03`

- `EXA-CND-03` ("Conduzir um Exame de Proficiencia") é semanticamente distinto de `EXA-PLN-01` ("Planejar um Exame de Proficiencia")
- CRED-EXA requer a condução do exame (técnica #10), não o planejamento (já coberto por `EXA-PLN-01` na posição #9)
- `EXA-CND-03` já existia no catálogo, foi apenas restaurado (não criado)
- O vínculo `modelo↔manobra` (CRED-EXA ↔ EXA-CND-03) já existia e foi apenas reativado

## 7. Justificativa técnica para overrides em `observacoes`

- O catálogo de manobras é compartilhado entre múltiplos modelos
- "Normal checklist — preparação noturna" é correto para sessões noturnas, mas incorreto para sessões semestrais IFR
- Duplicar o registro de manobra para cada variante de texto criaria entropia no catálogo
- O campo `observacoes` em `modelos_sessao_manobras` já existia e estava sem uso — reutilizá-lo é a abordagem de menor risco
- Overrides só afetam a renderização de fichas criadas a partir de agora

## 8. Blindagem contra metadado interno

- Regex `/tipo_item\s*=|fase_voo\s*=|carater\s*=|fap_refs\s*=|matriz_v6_modelo\s*=/i`
- Backend: `buildOperationalFichaManobras()` em `worker-airtrust/src/constants/notechs.ts`
- Frontend: `buildFichaModeloPdfData()` em `src/react-app/pages/simuladores/fichas/fichaModeloPdf.ts`
- Ambos usam a mesma regex (mantida manualmente em sincronia)
- Testes cobrem o caso de override com metadado interno (backend + frontend)

## 9. Por que fichas existentes não foram tocadas

- Fichas (`fichas_sessao`) e manobras de ficha (`fichas_sessao_manobras`) copiam os dados do modelo no momento da criação
- Overrides em `modelos_sessao_manobras.observacoes` só afetam novas fichas
- 224 fichas existentes, 4706 manobras de ficha, 108 agendamentos: todos preservados
- Nenhum UPDATE/DELETE em tabelas de ficha ou histórico

## 10. Estado final de produção

| Métrica | Valor |
|---|---|
| Modelos ativos (não-TEST) | 51 |
| Vínculos modelo↔manobra | 918 |
| Técnicas por modelo | 18 (min=max=avg) |
| NOTECHS canônicos no catálogo (`NOTECHS-01`..`NOTECHS-15`) | 15 distintos (60 linhas multitenant) |
| LOFT-NOT no catálogo legado (`LOFT-NOT-%`) | 31 ativos |
| NOTECHS dentro das 18 técnicas | 0 |
| LOFT-NOT dentro das 18 técnicas | 0 |
| INV-CRM dentro de técnicas | 0 |
| EXA-NTS dentro de técnicas | 0 |
| EXA-CND-03 em CRED-EXA | Ativo, ordem=10 |
| EXA-CND-01 em CRED-EXA | Soft-deleted |
| OPS-NOT-X1 | 6 sessões |
| A139-AUT-03 | 2 sessões |
| INV-ETH-01 | TRE-INST |
| Overrides em observacoes | 7 (todos limpos, sem metadado) |
| Fichas | 224 |
| Manobras de ficha | 4706 |
| Agendamentos | 108 |

## 11. Rollback específico

### Rollback `EXA-CND-03` / `EXA-CND-01`

```sql
-- Reverter para estado pré-correção:
UPDATE modelos_sessao_manobras SET deleted_at = NULL WHERE id = 2647;  -- reativa EXA-CND-01
UPDATE modelos_sessao_manobras SET deleted_at = datetime('now') WHERE id = 2649;  -- desativa EXA-CND-03
```

### Rollback overrides em `observacoes`

```sql
-- Limpar todos os overrides da empresa 6:
UPDATE modelos_sessao_manobras
SET observacoes = NULL
WHERE id IN (
  SELECT msm.id FROM modelos_sessao_manobras msm
  JOIN modelos_sessao ms ON ms.id = msm.modelo_id
  WHERE ms.empresa_id = 6 AND msm.observacoes IS NOT NULL AND msm.observacoes != ''
);
```

**Nota**: Rollback de produção só deve ser executado com autorização explícita e backup prévio.

## 12. Pendências

| Pendência | Status | Bloqueador |
|---|---|---|
| Calibração NOTECHS | Pendente | Aguarda auditoria pedagógica final |
| Migration 0417 (`caracter_loft`) | NO-GO | Não necessária para correção atual; revisar em staging primeiro |
| Auditoria pedagógica final pós-contenção | Pendente | Depende de deploy do código de blindagem |
| PDFs/fichas finais | NO-GO | Aguarda calibração NOTECHS + auditoria pedagógica |
| Deploy do código | GO condicional | PR revisado, não mergear migration |

---

## 13. Classificação das alterações no commit `f55800bc`

| Arquivo | Classificação | Escopo |
|---|---|---|
| `worker-airtrust/src/constants/notechs.ts` | Override + blindagem | ✅ Dentro do escopo |
| `worker-airtrust/src/__tests__/constants/notechs.test.ts` | Testes | ✅ Dentro do escopo |
| `src/react-app/pages/simuladores/fichas/fichaModeloPdf.ts` | Override + blindagem (frontend) | ✅ Dentro do escopo |
| `src/react-app/pages/simuladores/fichas/__tests__/fichaModeloPdf.test.ts` | Testes (frontend) | ✅ Dentro do escopo |
| `worker-airtrust/src/routes/simuladores-fichas-simulador.ts` | Carregar `observacoes` | ✅ Dentro do escopo |
| `worker-airtrust/src/routes/simuladores-sessoes.ts` | Carregar `observacoes` | ✅ Dentro do escopo |
| `worker-airtrust/src/routes/simuladores-sessoes-update.ts` | Carregar `observacoes` | ✅ Dentro do escopo |
| `worker-airtrust/src/routes/simuladores-shared-session.ts` | Carregar `observacoes` | ✅ Dentro do escopo |
| `worker-airtrust/migrations/0417_add_modelos_sessao_caracter_loft.sql` | NO-GO (revisão) | ⚠️ Separar em PR diferente |
| `docs/analysis/matriz-v6-2-pedagogical-post-apply-audit.md` | Documentação | ✅ Dentro do escopo |

---

*Documento gerado em 2026-07-05 durante contenção pós-apply.*
*Commits: `ebf8bcd6` (auditoria) + `f55800bc` (correções)*
