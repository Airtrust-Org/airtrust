# AirTrust Player 2.0 — arquitetura de encerramento canônico (RFC operacional)

**Status:** implementação incremental e fail-closed; **não** é autorização para publicar cursos, migrar D1/R2 ou emitir certificados.  
**Autoridade:** GitHub `main`, workflows e Schema V2 vigente. Requisitos definidos após a auditoria de matrículas em 99–100% e falha `PROGRESS_EVIDENCE_MISSING`.

## Decisão arquitetural

Não reconstruir apenas o iframe nem atribuir certificação ao Native. Substituir os múltiplos julgamentos concorrentes por **um protocolo único de evidência**:

1. **Ingestão por adaptador**: SCORM 1.2, SCORM 2004 e Native produzem fatos estruturados (navegação, eventos, resultado, tentativa, versão). O player não decide aprovação.
2. **Persistência sem finalização**: salvar relatório de SCO e progresso, inclusive quando o pacote comunica `passed` antes da confirmação do aluno. Nunca rejeitar uma gravação intermediária só porque ela ainda não satisfaz todos os requisitos finais. Sempre exigir autenticação, tenant e escopo da sessão.
3. **Verificação central**: um único verificador do servidor decide se as evidências são elegíveis; responde com código e requisitos faltantes, sem confundir `SCORM_COMPLETION_ACCEPTED` (status de conteúdo) com `CONCLUIDO` (matrícula persistida).
4. **Transação canônica**: finalização idempotente e tenant-bound grava matrícula, histórico, qualificação e auditoria com proteção contra repetição/concorrência. Falha de qualificação bloqueia confirmação, nunca gera certificado falso.
5. **Emissão e conciliação**: resultado do certificado é verificado à parte; status de emissão nunca pode ser inferido do progresso, de `passed` ou de uma resposta de rede ambígua.
6. **Leitura única ao aluno**: UI consulta o verificador e exibe `pendente`, causa real e próxima ação; 100% visual representa apenas posição de conteúdo, não aprovação.

## Prova imediata incorporada no código

A função versionada `evaluateScormClosureReadiness` alimenta o guard de commit explícito, a reconciliação de evidência persistida e o novo `closure_readiness` do detalhe da matrícula. Distingue:

- evidência de telas distintas vs. a marca `42/42`;
- formulário de 10 questões não respondidas vs. nota registrada e mínima do curso;
- status terminal do SCORM vs. confirmação explícita do aluno;
- consentimento para finalizar vs. status real `CONCLUIDO`;
- erro de rede/gravação vs. falha legítima na política de avaliação.

Em `SCORM_FINISH` ou `SCORM_COMPLETION_CANDIDATE`, o guard não converte o relatório em conclusão. Em `SCORM_USER_FINALIZE`, o verificador é obrigatório. A sessão de asset, tenant, edição e RBAC permanecem obrigatórios.

## Etapas seguintes da mudança estrutural

### A. Adaptadores sem suposição proprietária — obrigatório antes de aceitar qualquer ZIP SCORM

Hoje `airtrust.total_slides` e `airtrust.viewed_slides` são exigidos como evidência de cobertura. Isso **não é SCORM padrão**. Construir um adaptador SCORM 1.2/2004 que valide as evidências padronizadas reais do pacote (status, objetivo, score, interações, commit/terminate e configuração de avaliação do catálogo), sem simular telas ou respostas. Pacotes AirTrust com `requiredSlides`/`requiredInteractions` continuam com requisitos próprios.

A ativação do adaptador de terceiros deve ser **explícita por versão/curso e tenant**, governada e testada com pacote real. Não habilitar um fallback global que permita a qualquer pacote autodeclarar `passed` em uma tela vazia e emitir qualificação. Curso que não emite nenhuma evidência suficiente deve indicar `PACOTE_INCOMPATIVEL` ou requisitos objetivos, não ficar preso indefinidamente em 99%.

### B. Ledger confiável da tentativa e confirmação

Modelar e governar via Schema V2 o par `attempt_id`/`enrollment_cycle_id`, pacote SHA/edição, tipo de evento, sequência/idempotência e veredito por transição. Resolver `resume`/offline/queda de rede sem reutilizar evidência de edição/ciclo anterior. Não usar SQL remoto improvisado.

### C. Testes exigidos para liberar

- SCORM 1.2 e 2004 de autores distintos; formulário incompleto, nota insuficiente, aprovação, saída rápida, reconexão, duplicação e múltiplas abas.
- Matrícula de outro tenant, sessão expirada, pacote trocado, categoria de qualificação inválida e corrida de múltiplos envios — devem falhar fechado.
- Aluno real autorizado de QA em staging: inicia, retoma, realiza, finaliza, refaz login, vê status `CONCLUIDO`, histórico/Compliance coerentes e certificado verificável.
- Player Native V1 da PR #1389 compartilha **transação canônica**, mas continua isolado até Schema V2 0550/0551/0552 e prova final. Os nove candidatos privados não são publicados automaticamente.

## Critério de encerramento

Não declarar correção completa por 8/8 CI, 100% de navegação, `SCORM_COMPLETION_ACCEPTED` ou deploy saudável. Encerramento depende de prova real de curso **SCORM** e **Native** e da persistência canônica e certificado, com rollback e observabilidade. Staging oficial antes de qualquer produção; produção somente para SHA, componentes e escopo exatos autorizados.
