# LMS — contrato mínimo de evidência de conclusão não-SCORM

## Contexto

`lms_matriculas.progresso_pct`, `ultimo_slide` e `ultima_pagina` são valores
enviados pelo cliente. Eles podem servir para retomar a interface, mas não são
prova suficiente para emitir uma qualificação ou certificado.

O runtime atual já tem fontes distintas para conteúdo interativo:

- SCORM: estado CMI persistido e status terminal validado pelo Worker.
- H5P: statement xAPI terminal persistido e validado pelo Worker.

PDF, PPTX e vídeo não possuem hoje uma trilha de evidência de conclusão
persistida no servidor. Em particular, o player PDF atual usa um `iframe` e
cronômetro local; o PPTX envia a posição do slide pelo navegador; e o vídeo não
tem uma telemetria persistida de tempo assistido. Nenhuma dessas informações
deve liberar emissão automática apenas com `progresso_pct=100`.

## Comportamento transitório seguro

Enquanto não existir a evidência abaixo, uma matrícula de PDF, PPTX ou vídeo
com `gerar_qualificacao_ao_concluir=1` recebe `409 CONTENT_EVIDENCE_REQUIRED`
ao tentar finalizar ou ser concluída administrativamente. A matrícula e o
progresso de cursos não qualificantes permanecem utilizáveis. SCORM e H5P
mantêm suas rotas de conclusão baseadas em runtime validado.

## Mudança de contrato necessária

Uma fase posterior deve introduzir, por migration governada, uma entidade de
evidência imutável e tenant-scoped, por exemplo `lms_matricula_evidencias`, com
ao menos:

- `id`, `empresa_id`, `matricula_id`, `curso_id`, `funcionario_id`;
- `tipo_conteudo`, `tipo_evidencia`, `versao_conteudo`;
- `sequencia`, `payload_hash`, `server_received_at`, `server_validated_at`;
- métricas normalizadas de cobertura e duração, quando aplicáveis;
- vínculo opcional à tentativa/avaliação e uma referência de auditoria.

O Worker deve aceitar somente eventos autorizados para a própria matrícula,
validar cada evento contra metadados imutáveis do curso (páginas, slides,
duração ou avaliação configurada), persistir o evento antes de qualquer
transição terminal e decidir a conclusão por uma política versionada do tipo
de conteúdo. `progresso_pct` pode ser derivado dessa evidência, mas nunca ser a
fonte de autorização da qualificação.

## Políticas esperadas por tipo

- **PDF:** cobertura de páginas validada pelo servidor, ou avaliação vinculada
  ao curso quando essa for a política configurada.
- **PPTX:** cobertura ordenada dos slides da versão publicada, ou avaliação
  vinculada quando configurada.
- **Vídeo:** tempo assistido/cobertura de segmentos, calculado contra a duração
  canônica do asset, ou avaliação vinculada quando configurada.
- **H5P:** statement xAPI terminal com resultado coerente; cursos que geram
  qualificação preservam o gate de avaliação/mastery já existente no runtime.
- **SCORM:** status terminal e estado CMI coerente; cursos que geram
  qualificação preservam o gate de avaliação/mastery já existente no runtime.

Uma política de atestação administrativa, se necessária, deve ser explícita,
separada da finalização do aluno, exigir RBAC próprio e uma referência de
evidência auditável — uma observação livre não substitui a evidência.
