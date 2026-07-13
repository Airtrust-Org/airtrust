# 07 — Validação Mecânica da Resolução OPS-NOT-X1

Script: `validate_ops_not_x1_resolution.py` (neste diretório). O script **somente valida** — não altera nenhum arquivo do repositório principal, do worktree, banco ou código de aplicação.

## Histórico de execução

**Rodada 1**: 54 erros falsos-positivos, causados por um bug do próprio validador — a checagem assumia que o campo `ativo` do RAW export sempre valeria `"1"` para manobras ativas. Investigação (`RAW_MANOBRAS.csv`, `RAW_SCHEMA_INSPECIONADO.md`) confirmou que `ativo` é `BOOLEAN default=1`, mas o dump exporta esse default como string vazia para todas as 754 manobras (nenhuma tem `ativo="1"` literal) — o sinal real de arquivamento no export é exclusivamente `deleted_at` não-vazio (81/754 manobras arquivadas, 673/754 ativas). Corrigido o critério do validador para checar apenas `deleted_at == ""`.

**Rodada 2** (após a correção): **0 erros, 3 avisos** — todos informativos, não bloqueantes:
1. Worktree tem alterações não rastreadas fora do escopo desta missão (`composicao-curricular-implementation-sonnet-20260713/`, `scripts/__tests__/curriculum-sonnet-20260713.test.mjs`, `scripts/simuladores/`) — pré-existentes de uma fase de implementação anterior já documentada (`IMPLEMENTATION_*`), não geradas por esta missão pontual (que só escreveu em `docs/analysis/resolucao-ops-not-x1-sonnet-20260713/` e no scratchpad).
2/3. Repositório principal tem alterações de outra frente de trabalho ativa nesta sessão (hotfix `simuladores schema compat`, branch `hotfix/simuladores-schema-compat`, visível no `git status` inicial da conversa) e diretórios de análise não rastreados (`docs/analysis/auditoria-global-fichas-simulador-20260713/`, `docs/analysis/composicao-curricular-final-sonnet-20260713/`) de missões anteriores já concluídas — nenhuma dessas alterações foi causada por esta missão de resolução de `OPS-NOT-X1`.

## Checks executados (todos passando na rodada final)

- 3 sessões (`S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02`) presentes na análise por sessão (`01`).
- `OPS-NOT-X1` tem decisão registrada nas 3 (`03`), nenhuma delas é `MANTER` (regra: não usar `MANTER` como fallback).
- As 3 composições finais (`05`) têm exatamente 18 itens, ordens 1..18 sem lacunas nem duplicidades.
- Nenhum código de manobra nas 3 composições finais pertence a catálogo AW139-exclusivo (`A139-*`, `LOFT-NOT-*`, `LOFT-OFF-*`, `LOFT-CHK-*`).
- Todos os códigos finais existem em `RAW_MANOBRAS.csv`, pertencem ao mesmo tenant (`empresa_id=6`) e não estão arquivados (`deleted_at` vazio).
- `OPS-NOT-X1` confirmado ausente da composição final das 3 sessões.
- Nenhuma criação de manobra nesta rodada (confirmado nas 3 análises independentes — todas as ações usam códigos já existentes no catálogo `S76-LOFT-*`/técnicos).
- Impacto em duração e em NOTECHS discutido explicitamente para as 3 sessões (`01`).
- Overlay (`04`) preenchido com todas as colunas obrigatórias, justificativa/risco/confiança não-vazios em cada linha.
- Escopo endurecido V2 (`06`) tem as 53 sessões do universo AW139/SK76; as 6 sessões que a missão exige permanecerem bloqueadas (`A139-I-03/12`, `A139-I-12/12`, `A139-P-04/04-CHECK`, `EXA-01/02`, `EXA-02/02`, `TRE-INST`) continuam `BLOQUEAR_TEMPORARIAMENTE`; `PILOT-MODELO-001` continua `EXCLUIR_DO_ESCOPO`; as 3 sessões desta missão estão `IMPLEMENTAR`.
- Matriz curricular canônica Sonnet (`12_MATRIZ_CURRICULAR_FINAL_SONNET.csv`) com hash SHA-256 idêntico ao registrado no manifesto congelado da missão anterior — **não foi alterada** por esta missão pontual.
- Nenhuma escrita em banco, nenhuma alteração de código de aplicação (`worker-airtrust/src`, `src/react-app`) causada por esta missão.
- Nenhuma declaração de validação humana ou aprovação/homologação ANAC em nenhum artefato gerado.

## Veredito desta seção

**RESOLVIDO_PARA_IMPLEMENTACAO** — as 3 sessões (`S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02`) têm solução concreta, mecanicamente íntegra e defensável com evidência textual direta; nenhum bloqueio residual impede a implementação local. Ressalvas registradas (não bloqueantes): nota de adaptação onshore/helideck em `S76-NOT-01`; nota de rastreabilidade obrigatória em `S76-NOT-02` (uso histórico real); confiança MÉDIA na escolha específica de `S76-ILS-00` como item reintroduzido em `SK76-S-01/02`; destino do registro de catálogo órfão `OPS-NOT-X1` (id=1003) registrado como ação de fechamento futura, fora do escopo desta missão pontual.
