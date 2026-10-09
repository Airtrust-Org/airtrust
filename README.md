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
- Conformance: gate estático NOT_SUPPORTED por desenho, **mas Browser Runner real Cloudflare/AirTrust V1: PASS** para o ZIP SHA-256 indicado; trace e resultado em AIRTRUST_BROWSER_RUN_RC2.json.
- Teste Playwright com API SCORM equivalente à instrumentação oficial e mesma sequência de eventos: saída imediata PASS; saída na pré-visualização PASS; conclusão completa PASS. Em todos, Finish observado uma vez, Commit prévio e nenhuma chamada após Finish.
- Percurso completo 37 unidades, 40 questões e 4 avaliações: PASS.
- Retomada parcial e pré-visualização read-only: PASS.
- Seis resoluções, sem overflow horizontal, fonte >=14px; 100% Fold-Fit desktop das 28 unidades editoriais elegíveis.
- 37 fotografias contextuais distintas, fontes/licenças incluídas, sem SVG esquemáticos.

## Publicação
Criar matrícula/ciclo novo; a RC2 não deve herdar progresso e status do CFIT antigo. O Browser Runner remoto confirmou PASS para este SHA. O upload, catalogação e matrícula no AirTrust real continuam NÃO EXECUTADOS nesta sessão; não confundir conformance do runtime com homologação ponta a ponta do LMS.
