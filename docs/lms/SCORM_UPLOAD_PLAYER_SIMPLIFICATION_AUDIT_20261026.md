# Auditoria focada — upload SCORM e Player AirTrust (26/10/2026)

## Escopo e evidência

Leitura da `main=255db592f442804b97fe635527c88ec1bd19b0bb`:
- `src/react-app/pages/lms/LmsCatalogo.tsx`
- `src/react-app/pages/lms/lmsContentUpload.ts`
- `src/react-app/pages/lms/lmsPackageValidator.ts`
- `src/react-app/pages/lms/LmsPlayer.tsx`
- `worker-airtrust/src/routes/lms-cursos-upload-routes.ts`
- `worker-airtrust/src/lib/lms/lms-scorm-quality-gate.ts`
- `worker-airtrust/src/lib/lms/lms-scorm-package-version-service.ts`

Referências ativas: issue #1325, PR #1813 (revisão formativa MGM, sem conflito), PR #1814 (códigos de erro Worker, sem conflito), PR #1793 (readback de avaliação ainda incompleto). Sem acesso físico a matrícula/ZIP final nessa auditoria. Não afirmar homologação.

## Diagnóstico

1. **Ação de UI conflituosa (CORRIGIDO NESTA PR)**: na edição de curso SCORM existente, a tela oferecia simultaneamente `Enviar ZIP como candidato INATIVO` e o submit primário `Substituir conteúdo`. O segundo primeiro executava `updateCurso` (mudança de metadados), depois `POST scorm-upload`, conformance e `activate`. Se o ZIP continha `release.status=PRIVATE_*`, `DO_NOT_ACTIVATE` ou `assessment.mode=EXTERNAL`, a rejeição ocorria **depois do updateCurso**. A separação de responsabilidades não estava refletida no rótulo/ordem.
2. **Três etapas são operacionalmente distintas**: receber ZIP íntegro como versão inativa; homologar comportamento/navegador/registro; ativar versão aprovada com grant/autorização. Um único botão não deve fazer as três implicitamente.
3. **Limites materiais distintos**: upload multipart direto aceita até 32 MiB; o intake streamed F5 staging aceita até 80 MiB com grant por SHA. Não é seguro simplesmente aumentar a constante do browser ou redirecionar o ZIP de 80 MiB ao endpoint de 32 MiB. Compatibilizar limites requer análise de streaming/runtimes e workflow.
4. **Player depende da política da edição**: em `LmsPlayer.tsx` o predicado para `FORMATIVE` exige cobertura real dos slides e diagnósticos, enquanto o caminho `SCORED` exige `closureReadiness` do servidor. Não inferir que `assessment.mode=NONE` no ZIP atualizou automaticamente `scorm_assessment_policy` do curso/edição. É necessário verificar a correspondência explícita antes do teste MGM, sem migrar matrículas ativas por heurística.
5. **Excesso editorial específico do M8**: o verificador `validateModernM8AuditContract` reprova falta de imagem em cada slide e qualquer declaração CSS abaixo de 14 px, além de exigir `navigationGate=module-assessment`. São regras do esquema explícito `AIRTRUST_TRAINING_MODEL_M8`, não obrigatórias do padrão SCORM 1.2. Não extrapolar esses requisitos para pacotes F5 `content.js`. Recomenda-se revisão separada para classificar estética como aviso e integridade/contrato como erro; não remover silenciosamente políticas de edições já existentes.
6. **Safety gates reais**: autenticação, RBAC, tenant, ZIP traversal/bomba de descompressão, SHA, existência de launch/assets declarados, retomada, commit/ciclo, evidência física e certificado independente são necessários. Gates de CI e atestações de release não podem ser substituídos por flags do ZIP.
7. **Bloqueio funcional atual independente**: PR #1793 documenta ausência de produtor físico Worker/D1 para testemunho de avaliações F0. Embora corrigir a UX permita usar o botão correto, não certifica MGM nem libera ativação dos 43 pacotes.

## Simplificação nesta PR

- Para **curso SCORM existente em produção ou staging**, selecionar ZIP **não** faz o botão `Salvar dados` enviar/ativar pacote. O único envio direto exposto é `Enviar ZIP para homologação`, de forma inativa e com recibo SHA.
- O submit de metadados mantém seu significado: salva dados/capa, sem tentar substituir o ZIP escolhido. H5P, PDF, PPTX, novo curso e desenvolvimento local mantêm fluxos anteriores.
- UI diferencia visualmente a ação de intake da gravação de metadados e remove o `skipPurge` irrelevante à versão SCORM inativa.
- Nenhuma mudança em Worker/Player, política de notas, verificador, banco, grants ou publicação.

## Próximos aceites, por risco (não executados nesta PR)

1. Teste E2E UI: curso existente, ZIP privado, ação inativa → recibo SHA igual, versão ativa intacta; `Salvar dados` nunca alcança `/scorm-upload` ou `/activate`. Regressão com H5P e criação de curso.
2. Pinar pacote MGM F5 com SHA, conferir 101 slides/14 cenários e assets presentes; resolver inconsistência de política `NONE` / `FORMATIVE` / Worker, preservando histórico e qualificação.
3. QA autenticada Chromium/WebKit, leitura D1 de ciclo e progresso, fechamento sem nota/prova no SCORM, retomada e certificado somente conforme política aprovada.
4. Liberação pontual de MGM por workflow e autorização SHA/artefato/escopo; após aceite físico, replicar padrão ao lote F5.
5. Revisão futura de regras **editoriais** do M8 para distinguir aviso de erro, com cenários concretos e sem tocar em segurança de ZIP/LMS.

Estado: **correção da confusão da UI proposta**, não homologação técnica/pedagógica do MGM. Produção intocada.
