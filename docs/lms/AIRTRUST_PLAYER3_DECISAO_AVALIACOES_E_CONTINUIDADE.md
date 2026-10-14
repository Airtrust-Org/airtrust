# AirTrust Player 3 — decisão de avaliação e continuidade operacional

**Data:** 2026-10-14. **Prioridade:** P0 — LMS bloqueia fechamento real de treinamentos.
**Autoridade:** GitHub `Airtrust-Org/airtrust`, `main` e controles de release. Frente ativa: [PR #1389](https://github.com/Airtrust-Org/airtrust/pull/1389) (draft). [PR #1458](https://github.com/Airtrust-Org/airtrust/pull/1458) é mitigação SCORM legada, **não** certificação de solução estrutural. Incidente #1325.

## Decisão de arquitetura — não reabrir sem evidência nova

1. **Preservar o HTML5 autoral original** dos cursos próprios: HTML/CSS/JS, imagens, vídeos, animações, exercícios e layout. Não publicar as conversões declarativas que substituam interações reais por blocos genéricos sem equivalência visual/funcional homologada. O material original precisa ser validado por pacote e hash; versões candidatas são imutáveis.
2. **Criar camada de integração própria do AirTrust para execução, evidências, avaliação e conclusão**, independentemente da implementação SCORM 1.2. Cursos externos permanecem sob adaptador SCORM legado com contrato de compatibilidade; SCORM 2004 não é estratégia de correção do incidente.
3. **Manter fixação de aprendizagem após cada módulo**, dentro da experiência HTML5 original: questões, cenários e explicações imediatas. Essas atividades são **formativas**, não compõem a nota da prova final, não consomem tentativa de prova e não podem impedir conclusão por acerto quando o contrato pedagógico exigir apenas participação. Atividade/decisão obrigatória para certificação exige marcação **explícita** em política aprovada e evidência própria.
4. **Separar a prova final tecnicamente**, mas não criar um segundo curso ou matrícula. A prova aparece na mesma jornada e usa serviço independente do backend: questões e respostas versionadas, gabarito privado, correção/tentativas/notas servidoras, requisito de aproveitamento do curso, identidade/tenant/ciclo/edição validados. A nota final deriva **somente** das questões de prova explicitamente identificadas; não das atividades de fixação.
5. **Concluir uma única matrícula** somente após comprovar no servidor: requisitos de módulos, eventual participação/decisões obrigatórias explícitas, prova final aprovada (se exigida), estado do ciclo, idempotência e integrações de histórico/qualificação. Confirmar emissão/disponibilidade do certificado separadamente; não declarar certificado emitido sem recibo verificável.
6. **Fail-closed e isolamento:** nunca confiar em porcentagem da interface, contador DOM, evento autoafirmado, nota enviada pelo navegador, outra matrícula/tenant/ciclo ou edição antiga. Conteúdo HTML5 não recebe credenciais de administração; comunicação por ponte restrita, esquema de eventos allowlisted, origem e edição verificados, respostas protegidas, assets privados e CSP apropriada. Offline depende de sincronização testada; não presumir suporte automático.
7. **Testes de fidelidade**: cada conteúdo convertido/adaptado deve manter o visual e todas as atividades essenciais da versão original. Testar Safari/WebKit e Chromium, tela móvel, navegação, interrupção/retomada, repetição de sessão, prova insuficiente, nova tentativa, aprovação, servidor D1, matrícula, qualificação, certificado e reabertura. Um teste sintético verde, por si só, não aprova curso real.

## Gap comprovado na implementação da PR #1389

No HEAD `0f92441512eaf660da5636493eb7895112d721be` consultado em 2026-10-14:
- `worker-airtrust/src/lib/lms/lms-native-course-contract.ts` admite `lesson`, `scenario` e `assessment`, sem semântica explícita separada de *fixação após cada módulo* e *prova final*.
- `worker-airtrust/src/lib/lms/lms-native-grading.ts` calcula percentual apenas sobre `assessment`, o que é um avanço, mas exige resposta para **todas** as questões do artefato em uma submissão e acopla cenários ao resultado.
- `src/react-app/pages/lms/native/NativeStagingLearnerControls.tsx` envia `course.questions` inteiro a `/tentativas`, com sequência única de tentativa; portanto, exercícios de fixação não possuem fluxo de correção independente e podem virar gate indevido.
- `src/react-app/pages/lms/native/NativeCoursePreview.tsx` é uma reconstrução declarativa do visual e **não comprova** paridade com o HTML5 original.
- `worker-airtrust/src/routes/lms-native-completion.ts` permanece **staging-only/default-OFF**, dependente de governança Schema V2, publicação segura e validação real.

**Não interpretar este documento como implementação já concluída.** A PR permanece draft. Nenhum conteúdo real deve ser publicado, nenhuma matrícula migrada ou certificado declarado concluído pela aprovação deste design.

## Próxima implementação em lote coerente

1. A partir dos ZIPs originais fornecidos, inventariar o HTML5 executável do curso Doutrinamento em Segurança e Qualidade e demais oito cursos; comparar a interação visual e a taxonomia de perguntas do original com o contrato. O lote de nove conversões privadas pode ser usado como diagnóstico, não como fonte de apresentação final.
2. Na PR #1389, substituir a dependência de renderização genérica por uma execução HTML5 isolada com ponte de eventos explícita e adapter por curso/família, sem fragilizar tenant, RBAC, D1/R2, CSP e hashes. Preservar o legado em produção durante o piloto.
3. Separar `formative` (por módulo, repetível, feedback) de `final_exam` (tentativa oficial única por número, gabarito e nota no Worker). Versionar as políticas de obrigatoriedade; não inferir critérios do conteúdo visível.
4. Teste focado dos contratos, suíte afetada e os 8 gates Actions; staging governado Worker+Pages+Schema necessário; matricula de teste real do Doutrinamento com 42/42, aprovação, escrita no banco, qualificação, certificado, reabertura. Se falhar, reportar **camada exata** (conteúdo/ponte/motor/persistência/certificado) sem culpar outra camada por suposição.

## Estado compacto para continuidade entre conversas

- **Objetivo:** restaurar fechamento/certificação real de cursos EAD com fidelidade interativa.
- **Caso real:** Doutrinamento em Segurança e Qualidade exibiu 42/42 e nota 100, mas matrícula ficou em 99% / EM_ANDAMENTO; evidência SCORM de visitas das páginas 1–7 ausente.
- **Frentes:** #1389 draft = substituição estrutural; #1458 open = tentativa de corrigir contador `#count` no legado, staging smoke verde, sem prova do fechamento real; #1422 draft = certificação funcional SCORM independente.
- **Curso original:** o usuário já forneceu ZIP agregado de nove treinamentos, registrado como `SMS(4).zip` na Library AirTrust; cópia de conversão privada dos nove cursos foi inspecionada no workspace. A presença no catálogo não equivale a acesso aos bytes originais; confirmar origem/hash antes de conversão, não pedir reenvio por padrão.
- **Bloqueadores:** fluxo formativo separado, HTML5 original fiel, ponte segura, Schema V2 0550 e ativações/aplicações governadas, R2 privado, staging real e conclusão certificadora ponta a ponta.
- **Não autorizado:** deploy de produção sem SHA/artefatos/escopo explícitos; migrations D1/R2/seed não governados; marcar conclusão sem evidência; trocar conteúdo real por candidato genérico não homologado.
- **Próxima ação:** executar o lote de construção acima na PR existente, começando pela prova de fidelidade HTML5 e diferenciação de avaliações; revisar delta de main antes de merge. Não repetir auditorias já concluídas.

## Execução técnica — 2026-10-14 — contrato formativo separado (PR #1389)

**Implementado no worktree isolado e testado, sem alteração remota de banco ou publicação de curso:**

- Unidade `practice` distinta de `assessment` e `scenario` no contrato de artefato; o importador dos cursos deve mapear intencionalmente a modalidade com base nas regras pedagógicas originais, sem conversão silenciosa de avaliações certificadoras.
- `gradeNativePracticeAnswer` usa gabarito privado no Worker e responde exclusivamente à questão do bloco formativo, com correção e feedback, **sem nota, tentativa oficial ou conclusão**.
- Nova rota autenticada `POST /lms/native/matriculas/:id/pratica`, com limites de entrada e validação de tenant/ambiente/edição/ciclo; staging-only com allowlists exatas, sem escrita D1/R2 de prática.
- `evaluateNativeAssessment` recebe apenas questões oficiais e decisões de cenários já exigidas pelo contrato; recusa questão formativa em tentativa oficial. `assessNativeCompletionReadiness` não exige respostas formativas nem conta essas questões no total certificador.
- Interface mostra correção e feedback de cada questão de fixação no módulo e não as envia com a prova. Questões oficiais seguem privadas no Worker, enquanto a apresentação permanece **candidata genérica não homologada para o visual original**.
- Regressões específicas de segurança e isolamento incluídas nos testes. Nenhum pacote/questão/gabarito privado enviado ao GitHub.

**Testes locais neste lote, no worktree isolado `/tmp/airtrust-player3-exam-20261014`:**
- 25/25 Worker (grading + practice + evidence domain) PASS;
- 43/43 Worker rotas LMS Native PASS;
- 16/16 frontend (prévia + learner controls) PASS;
- Worker TypeScript `tsc --noEmit` PASS.
- **`npm run lint` geral FAIL** em regra de governança contra scripts históricos de `wrangler d1 ... --remote` existentes em `scripts/production/apply-simuladores-matriz-remote-migration.sh` e `scripts/setup-local-overrides.sql`. Não modificar ou ignorar esses controles para fazer este lote passar. Verificar o gate oficial do SHA do commit após push; não afirmar CI verde.

**Limitações reais e próximas ações (não recomeçar auditoria):**
1. Os candidatos `costa_do_sol_9_cursos_native_8_templates_PRIVADO.zip` foram inspecionados somente em workspace privado e permanecem `REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW`. O ZIP original `SMS(4).zip` está catalogado na Library, mas o serviço de materialização retornou ausência de caminho autorizado de bytes. Cópia original do Doutrinamento localizada no Mac em Google Drive File Provider apresentou `TimeoutError` ao ler. **Não há homologação de paridade do HTML5 original nesta execução**, nem motivo para pedir ao usuário reenviar antes de tentar fonte Cloud aprovada.
2. Implementar ponte segura para HTML5 autoral real em player isolado; validar com bytes do original e comparar comportamento, telas, interações e mídias. Não aprovar conversão genérica por equivalência de slides.
3. Estabelecer política explícita de qual questão é formativa versus cenário obrigatoriamente certificador versus prova final no manifesto da versão original. O lote de código não reclassifica automaticamente cursos anteriores.
4. Completar governança Schema V2 0550/ativações, publicação privada R2, matrículas de teste e integração Worker/Pages em staging. Confirmar conclusão real 42/42 + prova + histórico/qualificação/certificado + reabertura Safari/Chromium.
5. **Nada de produção sem autorização específica para SHA/artefatos/escopo** e gates oficiais. Nenhuma migration nem D1/R2 write remoto foi executado neste lote.

**Estado compacto:** objetivo=P0 fechamento LMS com fidelidade HTML5; PR=#1389 draft; main=verificar ao vivo; head=verificar PR após commit; última implementação=fixação separada da prova; testes=25+43 Worker e 16 React PASS, tsc PASS, lint geral BLOCKED (scripts históricos); não integrado/não publicado; próxima=obter ZIP original via caminho cloud autorizado + ponte HTML5 fiel + staging E2E; não autorizado=bypass, promover código sem homologação, produção genérica.
