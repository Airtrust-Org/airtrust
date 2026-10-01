# Emergências Gerais — RC2 — checkpoint cloud

Data: 2026-10-01

## Objetivo
Finalizar a reconstrução do curso SCORM 1.2 **Emergências Gerais** conforme PTO Rev.10 e AirTrust Learning Factory V3.3, com mastery 80% e QA fail-closed.

## Estado da frente
- 48 unidades definidas e renderizadas em desktop/mobile no workspace de produção que originou este checkpoint.
- 6 avaliações de 10 questões, mastery 80%.
- Preview read-only, resume e cenários obrigatórios fazem parte do escopo de regressão.
- Encerramento é gate P0: todas as avaliações aprovadas -> `Concluir curso` -> persistência -> Commit -> Finish 1x -> zero chamadas posteriores.
- Limite de upload do LMS: pacote final < 32 MB.

## Auditoria visual RC2
Critérios obrigatórios por tela/asset:
- imagem pura, sem texto/legenda/interface/moldura incorporados;
- boa resolução e enquadramento;
- coerência semântica com a tela;
- zero repetição de imagem;
- nenhuma representação técnica falsa gerada por IA;
- vídeos em quadro integral, sem crop indevido.

Casos sinalizados na inspeção visual já realizada no workspace: telas 13, 31, 35, 36 e 45. A inspeção 48/48 precisa ser repetida sobre o pacote final reextraído, não sobre contact sheets ou previews intermediários.

## Regras de mídia consolidadas
- Proibido usar contact sheet, storyboard, screenshot de slide ou montagem com múltiplos painéis como mídia final.
- Imagem gerada só pode ser contextual; não pode inventar painel, disjuntor, equipamento, marcação ou configuração técnica de aeronave.
- Quando houver fotografia real adequada do equipamento/procedimento, preferi-la a geração.
- Não aceitar texto rasterizado dentro da fotografia, mesmo que repita corretamente o texto da tela.
- Não aceitar watermark, botão play rasterizado, borda de interface ou legenda incorporada.

## Autoridade mutável
Base inicial da branch: `528b4390fb2dedd5b8000779f05a855a2b7f1e16` (main observada em 2026-10-01).
Quality Gate M8 conferido em `worker-airtrust/src/lib/lms/lms-scorm-quality-gate.ts`, blob `f02454058bae84be43eb5c07dfaa1e0064c1a082`.
O repositório contém também `lms-scorm-browser-run.ts`, serviço de versionamento e testes específicos do quality gate/M8; esses componentes são a referência do LMS para a validação final, mas não substituem a auditoria do conteúdo do pacote.

## Critério de candidato
Não chamar CANDIDATE até concluir: preflight, seis viewports, static+rendered typography >=14 px, interações mouse/toque/teclado, Preview, resume parcial, avaliações/remediação, lifecycle, diagnostics, M8, criação do ZIP, SHA/CRC, reextração 1:1 e repetição dos gates afetados sobre a reextração.

### Gate SCORM de encerramento
Validar por instrumentação, e não apenas por leitura de código:
1. `LMSInitialize` uma vez.
2. Persistir status/score/location/suspend_data necessários antes do encerramento.
3. `LMSCommit("")` deve ocorrer antes de `LMSFinish("")`.
4. `LMSFinish("")` exatamente uma vez.
5. Depois do primeiro Finish, zero `LMSGetValue`, `LMSSetValue`, `LMSCommit`, novo `LMSFinish` ou outra chamada à API SCORM.
6. Repetir o teste no ZIP reextraído que será efetivamente entregue.

## Bloqueio cloud confirmado em 2026-10-01
A branch GitHub contém este checkpoint e o código do LMS, porém **não contém o source/árvore do pacote `Emergencias_Gerais_PTO_Rev10_AirTrust_V3_3_RC2_2026-10-01` nem suas mídias**. Busca no repositório por `Emergencias_Gerais_PTO_Rev10` não encontrou arquivos. Os assets e o pacote vistos na sessão estão em armazenamento de conversa/workspace, não em paths versionados do GitHub acessíveis por este conector.

Consequência: sem o computador local e sem um pacote/source RC2 publicado em armazenamento cloud editável, não é seguro nem tecnicamente possível nesta frente alterar as telas, substituir binários, gerar o ZIP final, calcular SHA/CRC do candidato, reextrair 1:1 ou executar QA visual/browser sobre o artefato final. Fazer commits simulando essas correções seria incorreto.

## Próxima retomada
Quando o workspace local voltar:
1. verificar trabalho concorrente antes de qualquer pull/reset;
2. sincronizar esta branch sem sobrescrever alterações locais;
3. publicar/espelhar o source RC2 em local versionável ou fornecer o pacote ZIP à frente cloud;
4. executar auditoria 48/48 e substituir os assets reprovados;
5. rodar todos os gates, empacotar, registrar SHA-256 + CRC/listagem, reextrair e repetir os gates afetados;
6. somente então promover o SHA exato a candidato.
