# AirTrust Native Player V1 — Integração e Migração

Status: proposta inicial e extrator de rascunho. Nenhum player novo, formato nativo publicado ou D1/R2 alterado.
Incidente coordenador: https://github.com/Airtrust-Org/airtrust/issues/1325
Autoridade: GitHub/main e contratos de LMS, segurança, CI e release vigentes.

## Matriz de formato

- AirTrust Native V1 (HTML5 + JSON declarativo + mídia): padrão de autoria dos novos treinamentos internos.
- SCORM 1.2: adaptador legado, mantendo launch/progress/commit/finish, retomada e avaliação certificados.
- SCORM 2004 (2nd/3rd/4th editions): compatibilidade futura por edição e testes específicos; NÃO afirmar que já é integralmente suportado. "SCORM 1.4" não é edição formal.
- H5P, PDF, vídeo e PPTX: adaptadores existentes, sem assumir evidência de conclusão certificadora a partir de visualização/percentual.
- cmi5/xAPI: evolução para interoperabilidade. Só chamar cmi5 após implementar e certificar LRS/launch/State/Statements conforme especificação.

Um único frontend LMS pode exibir múltiplos adaptadores. Nenhum renderizador aceita JS/HTML arbitrário como código de player.

## Contrato de execução nativa

A Factory deve entregar conteúdos declarativos, versionados e identificados por hash: IDs estáveis de unidades/questões, conteúdo sanitizável, mídias, textos de feedback, fontes e critérios de avaliação. Ela NÃO entrega código de persistência, encerramento ou autenticação por curso.

O Player V2 renderiza, navega e informa eventos, mas o servidor é a autoridade. Uma única implementação de progresso e conclusão integrada ao Worker valida tenant, empresa, RBAC, matrícula, ciclo, edição, evidências e avaliação; não assume nota, visita ou aprovação de dados arbitrários enviados pelo cliente.

Integrações obrigatórias no mesmo resultado canônico:
1. Identidade, autenticação, empresas e RBAC (permitido, negado, cross-tenant).
2. Catálogo, matrícula, ciclo, edição imutável e retomada sem herdar estado de outra matrícula.
3. Progresso persistido por IDs de unidades efetivamente vistas e respostas válidas.
4. Política avaliado/formativo, nota e tentativas; sem fabricar score, passed ou completed.
5. Fechamento idempotente e auditável, com decisão pedagógica válida, matrícula, histórico, qualificação e certificado.
6. Compliance, notificações e relatórios derivados do resultado canônico, nunca de um contador exibido pelo frontend.
7. Erros com estágio identificado (assets/launch/progress/assessment/finalization/qualification/certificate), sem registrar tokens, PII ou gabaritos.
8. Isolamento de objetos R2, CSP, verificação de hashes, esquema governado e recuperação sem writes manuais.

Se a qualificação falhar após a aprovação pedagógica válida, o sistema futuro deverá preservar a evidência e permitir conciliação administrativa idempotente. Não declarar a matrícula CONCLUIDO antes das condições reais e não obrigar refazer prova por falha administrativa quando a evidência estiver íntegra.

## Primeiro componente entregue: importador de RASCUNHO, não publicador

O script scripts/learning-factory/convert_scorm_to_native.py recebe um ZIP SCORM individual e grava um pacote de rascunho privado:

- exige imsmanifest.xml e um curso em course_data.js ou course-model.js contendo JSON estrito;
- lê IDs e conteúdo autoral, registra metadados e hashes, copia apenas mídia permitida;
- não executa app.js, não chama Cloudflare e não altera matrícula/histórico;
- protege contra Zip Slip, links simbólicos, IDs repetidos, arquivos grandes e sobrescrita;
- resultado sempre AIRTRUST_NATIVE_IMPORT_DRAFT_V1, REQUIRES_REVIEW, publishable=false.

A estrutura de rascunho é intermediária e pode conter gabaritos/material privado. Não copiar rascunhos, ZIPs ou fontes proprietárias para GitHub público. Sanitização, remapeamento de avaliações, revisão pedagógica e QA integrado são etapas obrigatórias antes de qualquer publicação.

Exemplo de uso em workspace privado:
    python3 scripts/learning-factory/convert_scorm_to_native.py /privado/NR6_RC3_CORRIGIDO.zip /privado/NR6-native-draft

Teste focado:
    python3 -m unittest discover -s scripts/learning-factory -p 'test_convert_scorm_to_native.py'

No lote SMS anexado, 9 ZIPs individuais foram processados em workspace isolado: 241 slides e mídia preservada. Isso NÃO prova paridade de avaliação, certificado nem fechamento no LMS.

## Próximas entregas e bloqueios de release

1. Schema executável Native V1 (tipos seguros de blocos, questões e critérios de aprovação), validadores fail-closed.
2. Renderizador Native V1, componentes de navegação e avaliação e testes de navegador.
3. Adaptador do LMS com APIs de sessão, checkpoint, finalização e integração qualificação/certificado. Sem nova fonte paralela de verdade.
4. Primeiro curso convertendo rascunho e reconciliando cada slide, imagem, pergunta e gabarito com a fonte original.
5. Teste ponta a ponta em staging: launch, progresso parcial, queda/retomada, avaliação insuficiente, aprovação, conclusão, histórico/qualificação únicos, certificado e reabertura sem regressão; Chrome/WebKit e tela móvel.
6. Auditoria de cada hash/versão e piloto real controlado antes de liberar matrículas em massa. Não migrar matrícula ativa para edição incompatível.

Só avançar em produção com autorização específica, snapshot de SHA/artefatos, oito gates, workflows oficiais e pós-validação real. Incidente #1325 permanece aberto até certificação da turma real.
