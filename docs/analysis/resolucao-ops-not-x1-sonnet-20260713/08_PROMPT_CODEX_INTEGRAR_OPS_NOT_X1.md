# 08 — Prompt para GPT-5.4 Codex: integrar a resolução OPS-NOT-X1

> Copie o bloco abaixo integralmente como prompt para o agente de implementação (GPT-5.4 Codex) que já está trabalhando no worktree `/Users/filipedaumas/SAAS/Airtrust-worktrees/simuladores-curriculo-sonnet`, branch `codex/simuladores-composicao-curricular-sonnet-20260713`.

---

```
Você é o GPT-5.4 Codex responsável pela implementação técnica da composição curricular de
simuladores AirTrust neste worktree. Uma missão pontual de análise (Sonnet 5, "ADJUDICAÇÃO
CURRICULAR PONTUAL") acabou de resolver o conflito da manobra OPS-NOT-X1 em 3 sessões SK76
que estavam bloqueadas/pendentes de decisão: S76-NOT-01, S76-NOT-02, SK76-S-01/02.

## Fonte de verdade desta integração pontual

Leia, na íntegra, antes de qualquer ação:
1. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/00_DIAGNOSTICO_OPS_NOT_X1.md
2. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/01_ANALISE_POR_SESSAO_OPS_NOT_X1.md
3. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/03_DECISAO_FINAL_OPS_NOT_X1.csv
4. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/04_OVERLAY_CURRICULAR_OPS_NOT_X1.csv
   (overlay — a fonte primária de dados para você aplicar; NÃO infira nenhuma decisão
   pedagógica além do que está escrito aqui)
5. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/05_ORDEM_FINAL_SESSOES_AFETADAS.csv
   (ordem final completa das 3 sessões, 18 itens cada)
6. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/06_IMPLEMENTATION_SCOPE_HARDENED_V2.csv
   (substitui IMPLEMENTATION_SCOPE_HARDENED.csv para as 3 sessões S76-NOT-01, S76-NOT-02,
   SK76-S-01/02 — as demais 50 sessões do escopo permanecem exatamente como já estavam)
7. docs/analysis/resolucao-ops-not-x1-sonnet-20260713/07_VALIDACAO_RESOLUCAO_OPS_NOT_X1.md

## O que mudou (resumo, mas use o overlay 04 como fonte primária de dados)

- S76-NOT-01 (modelo_id=57): posição 7, OPS-NOT-X1 → S76-LOFT-33 (mesma posição, 18 itens).
- S76-NOT-02 (modelo_id=78): posição 6, OPS-NOT-X1 → S76-LOFT-33 (mesma posição, 18 itens,
  S76-LOFT-34 na posição 7 permanece intocado).
- SK76-S-01/02 (modelo_id=75): OPS-NOT-X1 removido da posição 8 (redundante com S76-LOFT-23/33
  já adicionados por você ou pela composição anterior); S76-ILS-00 reintroduzido na posição 17
  para preservar 18 itens; ver 05 para a ordem completa e final das 18 posições.

## Regras inegociáveis desta integração

1. Leia o overlay (04) e atualize o escopo endurecido (06) — mas NÃO edite
   docs/analysis/composicao-curricular-final-sonnet-20260713/12_MATRIZ_CURRICULAR_FINAL_SONNET.csv
   (a matriz canônica Sonnet). Esse arquivo está congelado e seu hash SHA-256 já foi verificado
   como inalterado pelo validador desta missão (07). Trate o overlay (04) como uma camada
   adicional sobre a matriz canônica, não como substituição dela.
2. Resolva IDs (modelo_id, manobra_id) somente consultando o banco-alvo real (local/dev/staging),
   nunca hardcode IDs numéricos — use SELECT por código (codigo_modelo, codigo_manobra), pois
   IDs podem diferir entre ambientes.
3. Aplique fail-closed: se qualquer código do overlay (S76-LOFT-33, S76-ILS-00) não existir,
   estiver arquivado (deleted_at preenchido) ou pertencer a outro empresa_id no banco-alvo, pare
   e reporte — não prossiga com uma correspondência aproximada.
4. Mantenha as sessões bloqueadas intactas: A139-I-03/12, A139-I-12/12, A139-P-04/04-CHECK,
   EXA-01/02, EXA-02/02, TRE-INST continuam BLOQUEAR_TEMPORARIAMENTE (nenhuma mudança). PILOT-
   MODELO-001 continua EXCLUIR_DO_ESCOPO. Não toque nelas nesta integração.
5. Reexecute o dry-run completo do seu pipeline de aplicação (o mesmo que já rodou para as
   outras 31 sessões implementadas, conforme IMPLEMENTATION_RESULT.md) incluindo agora estas 3
   sessões, antes de qualquer apply real.
6. Execute o apply atômico (transação única cobrindo as 3 sessões: remoção do vínculo
   OPS-NOT-X1, criação/atualização dos vínculos S76-LOFT-33 e S76-ILS-00, reordenação de
   modelos_sessao_manobras.ordem conforme 05) — tudo ou nada, sem estado intermediário.
7. Teste idempotência: reexecutar o apply sobre um banco já aplicado não deve duplicar vínculos
   nem falhar (use INSERT...WHERE NOT EXISTS ou equivalente, igual ao padrão já usado nas outras
   31 sessões).
8. Teste rollback lógico: reverter as 3 sessões para o estado RAW exato (OPS-NOT-X1 de volta nas
   3 posições originais, S76-ILS-00 removido de SK76-S-01/02) e confirmar que os hashes/contagens
   batem com RAW_MODELOS_SESSAO_MANOBRAS.csv original.
9. Teste backend real (npm run test:worker) e valide frontend (páginas de Simuladores exibindo
   as 3 sessões corretamente, nomes/durações/contagem de itens).
10. Valide PDFs A4 de amostra para as 3 sessões (fichas geradas com o renderer V6.2 unificado já
    em uso) — confirme que S76-LOFT-33/S76-ILS-00 aparecem com nome/descrição corretos, sem
    truncamento, sem repetição de cabeçalho.
11. Compare o typecheck (npx tsc --noEmit) com o baseline já registrado em FINAL_GATE_REPORT.md
    — não introduza nenhuma nova falha de tipo além das já documentadas como preexistentes.
12. Crie um commit LOCAL (sem push, sem PR) apenas se todos os gates relevantes (dry-run,
    idempotência, rollback, backend, PDFs, typecheck) passarem com zero FAIL novo. Se qualquer
    gate falhar, não crie o commit — registre o motivo em um relatório e pare.
13. NÃO faça push, NÃO abra PR, NÃO aplique em staging ou produção, NÃO atualize o PTO Rev 10
    (docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md — ainda rascunho não-canônico), NÃO
    declare validação humana nem aprovação/homologação ANAC.
14. Registre explicitamente, no seu relatório de execução: (a) a nota de adaptação de cenário
    onshore/helideck para S76-NOT-01 (campo observações do vínculo, se o schema suportar; senão,
    como comentário na migration); (b) a nota de rastreabilidade concreta para S76-NOT-02
    (mudança de manobra_id=1003 para manobra_id=821 na posição 6 do modelo 78, preservando a
    competência declarada, dado que há 1 qualificação já emitida com o conteúdo antigo).
15. Não decida sobre o destino do registro de catálogo órfão OPS-NOT-X1 (id=1003, que ficará sem
    nenhum vínculo ativo em nenhuma das 25 fichas do sistema após esta integração) — isso é uma
    ação de fechamento de dado fora do escopo desta integração pontual, registrada em
    01_ANALISE_POR_SESSAO_OPS_NOT_X1.md como pendência futura sob decisão humana.

## Definição de pronto

Você concluiu esta integração quando: o escopo endurecido V2 (06) foi mesclado ao seu processo
de implementação, as 3 sessões passaram por dry-run e apply atômico em banco local descartável,
idempotência e rollback foram testados e confirmados, backend/frontend/PDFs validados, typecheck
comparado ao baseline sem regressão nova, e um commit local (sem push) foi criado apenas se todos
os gates passaram. Reporte o resultado seguindo o mesmo formato de IMPLEMENTATION_RESULT.md e
FINAL_GATE_REPORT.md já usados nas outras 31 sessões, adicionando as 3 sessões desta integração.
```
