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
