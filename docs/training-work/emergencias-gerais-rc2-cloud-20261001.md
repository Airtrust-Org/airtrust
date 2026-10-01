# Emergências Gerais — RC2 — checkpoint cloud

Data: 2026-10-01

## Objetivo
Finalizar a reconstrução do curso SCORM 1.2 **Emergências Gerais** conforme PTO Rev.10 e AirTrust Learning Factory V3.3, com mastery 80% e QA fail-closed.

## Estado da frente
- 48 unidades definidas e renderizadas em desktop/mobile.
- 6 avaliações de 10 questões, mastery 80%.
- Preview read-only, resume e cenários obrigatórios fazem parte do escopo de regressão.
- Encerramento é gate P0: todas as avaliações aprovadas -> `Concluir curso` -> persistência -> Commit -> Finish 1x -> zero chamadas posteriores.
- Limite de upload do LMS: pacote final < 32 MB.

## Auditoria visual RC2 em andamento
Revisar cada tela e cada asset para:
- imagem pura, sem texto/legenda/interface/moldura incorporados;
- boa resolução e enquadramento;
- coerência semântica com a tela;
- zero repetição de imagem;
- nenhuma representação técnica falsa gerada por IA;
- vídeos em quadro integral, sem crop indevido.

Casos já sinalizados para inspeção/correção mais rígida: telas 31, 35, 36 e 45; também rever 13 e quaisquer outros casos detectados na inspeção 48/48.

## Autoridade mutável
Base da branch: `528b4390fb2dedd5b8000779f05a855a2b7f1e16` (main observada em 2026-10-01).
Quality Gate M8 conferido em `worker-airtrust/src/lib/lms/lms-scorm-quality-gate.ts`, blob `f02454058bae84be43eb5c07dfaa1e0064c1a082`.

## Critério de candidato
Não chamar CANDIDATE até concluir: preflight, seis viewports, static+rendered typography >=14 px, interações mouse/toque/teclado, Preview, resume parcial, avaliações/remediação, lifecycle, diagnostics, M8, criação do ZIP, SHA/CRC, reextração 1:1 e repetição dos gates afetados sobre a reextração.

## Sincronização posterior
Quando o computador local voltar, sincronizar esta branch com o clone local apenas depois de confirmar que não há trabalho concorrente não publicado no diretório local.
