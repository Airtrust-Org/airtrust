# CFIT em Helicópteros — V3.3 RC2 (Correção de conformidade)

**Pacote:** CFIT_EM_HELICOPTEROS_PREVENCAO_OPERACIONAL_AIRTRUST_V3_3_RC2_SCORM12.zip

**SHA-256:** 4bcf6e004bb0937c025f8216ec0cb2e78223c267ddf061daf06bf4a9ded896ff

**Tamanho:** 5.732.975 bytes.

## Erro P0 corrigido
RC1 executava LMSFinish somente ao completar o curso. O AirTrust Browser Runner também encerra sessões incompletas por beforeunload, pagehide e unload, exigindo LMSFinish e Commit anteriores.

## Correção RC2
- LMSInitialize uma única vez.
- LMSCommit inicial sem conclusão de curso.
- Exit=suspend e Commit antes de LMSFinish em sessão incompleta.
- LMSFinish exatamente uma vez em qualquer saída, mesmo sob múltiplos eventos de fechamento.
- Zero gravações posteriores ao LMSFinish.
- Status passed e nota registrados somente após 37/37 e quatro avaliações aprovadas.
- Pré-visualização sem avanço de progresso.

## Evidências para o ZIP exato
- CRC e reextração 52/52: PASS.
- Quality Gate oficial AirTrust: structural PASS, completionManifest PASS, diagnostics PASS.
- Conformance remoto do AirTrust: NÃO EXECUTADO — runner não disponibilizado no gate estático, NOT_SUPPORTED.
- Teste Playwright com API SCORM equivalente à instrumentação oficial e mesma sequência de eventos: saída imediata PASS; saída na pré-visualização PASS; conclusão completa PASS. Em todos, Finish observado uma vez, Commit prévio e nenhuma chamada após Finish.
- Percurso completo 37 unidades, 40 questões e 4 avaliações: PASS.
- Retomada parcial e pré-visualização read-only: PASS.
- Seis resoluções, sem overflow horizontal, fonte >=14px; 100% Fold-Fit desktop das 28 unidades editoriais elegíveis.
- 37 fotografias contextuais distintas, fontes/licenças incluídas, sem SVG esquemáticos.

## Publicação
Criar matrícula/ciclo novo; a RC2 não deve herdar progresso e status do CFIT antigo. O Quality Gate remoto ainda precisa emitir PASS para o SHA acima antes de tratar o pacote como certificável.
