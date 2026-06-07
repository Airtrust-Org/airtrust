# AIRTRUST — Órfãos, Duplicidades e Soft-Delete (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)

## 1. Cross-tenant (vínculos pai/filho)

| Relação | Achado | Severidade |
|---|---|---|
| escala_eventos → escalas_mensais / funcionarios | 4.936 eventos: **100% escala e6 ↔ funcionário e6** | OK (sem vazamento) |
| qualificacoes_historico (e1) → funcionarios | 361 linhas e1 com **funcionário e6** | CRÍTICO (estrutural) |
| documentos/pasta_virtual (e1) → funcionarios | 140 linhas e1 com **funcionário e6** | CRÍTICO (estrutural) |
| frms_jornada (NULL) → funcionarios | 2.378 com **tripulante e6** | ALTO (tenant NULL) |
| empresa 7 (todas) | dados próprios, sem cruzamento com e6 | OK |

Não há vazamento de leitura cross-tenant detectado em escalas. O cross-tenant é **estrutural** (tag de tenant ≠ tenant do FK).

## 2. Órfãos

| Tabela | FK lógica | Órfãos (ativos) | Impacto | Classificação |
|---|---|---:|---|---|
| sessoes_participantes | sessao_id → sessoes | **97 ativos / 323 total** | `sessoes` está **vazia (0)**; tabela legada substituída por `simulador_agendamentos` | ORFAO (legado) |
| qualificacoes_historico | funcionario_id → funcionarios | 1 (soft-deleted) | nenhum (já soft-deleted) | ORFAO/SOFT_DELETED |
| sessoes_participantes | funcionario_id → funcionarios | 0 | — | OK |
| escala_eventos | escala_id → escalas_mensais | 0 | — | OK |
| treinamentos_participantes | funcionario_id → funcionarios | 0 | — | OK |

**Recomendação:** arquivar `sessoes_participantes` (legado) — **não** deletar sem backup; confirmar que nenhuma rota ativa o consome (UI de simulador usa `simulador_agendamentos`).

## 3. Duplicidades (empresa 6, ativos)

| Chave canônica | Grupos duplicados |
|---|---:|
| funcionarios.cpf | **0** |
| aeronaves.prefixo | **0** |
| usuarios.email | **0** |
| funcionarios.nome | **0** |

**Não há duplicidade operacional ativa.** Sobreposições entre e1 e e6 (qualificações):
- 0 duplicatas exatas (funcionário+código+vencimento).
- 139 sobreposições funcionário+código (cadeias de renovação — esperado, não duplicata).
- 185 registros e1 sem par em e6 (dado único a preservar).

## 4. Soft-delete (mapa)

Colunas de soft-delete detectadas: `deleted_at` (predominante), `ativo`, `status`.

| Tabela | soft-deleted / total | % | Observação |
|---|---|---:|---|
| frms_jornada | 4.284 / 5.210 | 82% | reconstruções/reimportações (artifacts rebuild 20260605) — revisar antes de purge |
| documentos | 236 / 473 | 50% | inclui 25 de e1 |
| bkp_qual_historico_20260325 | 124 / 579 | 21% | tabela de backup |
| qualificacoes_historico | 90 / 967 | 9% | 37 são de e1 |
| pasta_virtual | 67 / 245 | 27% | 10 de e1 |
| simulador_agendamentos | 41 / 99 | 41% | revisar |
| escalas_mensais | 33 / 44 | 75% | revisar |
| qualificacoes_tipos | 28 / 93 | 30% | inclui tipos teste/old |
| funcionarios | 17 / 68 | 25% | revisar reais vs teste |
| aeronaves | 15 / 23 | 65% | recuperação recente; revisar |

**Riscos a investigar (próxima fase, ainda read-only):**
- Queries que **não** excluem `deleted_at` (mostrariam lixo) vs. queries que excluem demais (escondem real).
- `frms_jornada`: 82% soft-deleted é anômalo — confirmar se o ativo (926) é a fonte canônica correta.

## 5. Classificações de soft-delete (a confirmar manualmente)
```
SOFT_DELETED_VALIDO     → testes e reimportações antigas
SOFT_DELETED_SUSPEITO   → reais marcados em reconstruções FRMS (verificar)
```
Nenhuma restauração executada.
