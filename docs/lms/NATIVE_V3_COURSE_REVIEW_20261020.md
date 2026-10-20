# AirTrust Native V3 — catálogo editorial de 21 cursos (20/10/2026)

**Escopo:** conteúdo dos cursos; não altera Player 3 (PR #1389), matrículas, certificados, D1, R2 ou ambientes Cloudflare. Esta frente não autoriza publicação.

## Decisão canônica SGSO
A edição **QSMS SGSO M10.4** é a única variante mantida no novo catálogo de candidatos. A variante Segurança Operacional **SGSO M10.7** foi excluída **do novo catálogo**, sem exclusão de arquivos originais, versões históricas ou dados produtivos. Verificação comparativa: questões e blocos de texto equivalentes; mídias diferentes. M10.7 apresenta divergência de identificação na origem.

## Edição de revisão preparada
- 21 arquivos de curso privados, distribuídos entre 9 QSMS e 12 Segurança Operacional.
- Dez cursos tinham menos de 20 telas de conteúdo. As prévias V3 subdividem 34 telas densas **sem criar conteúdo factual novo**, resultando em 20 ou mais unidades de conteúdo em cada um dos 21 cursos.
- Política **proposta**: 70% para 20 cursos pontuados. CRM Gestores permanece FORMATIVE/ATTENDANCE_ONLY, sem nota artificial.
- Seis cursos preservam indicação de avaliação modular da fonte. A aprovação por módulo **não** está implementada pelo fato de um ZIP editorial declarar moduleGate=true; o backend deve produzir tentativas e evidências reais por módulo.
- Prévia visual V3 ajustada para palco 16:9 no desktop e reflow em telas de tablet/celular; telas densas podem rolar.
- Integridade pós-conversão verificada nos 21 pacotes: hashes de 575 mídias, ZIPs/edições, questionIds, segregação da projeção JSON do aluno e nota proposta.
- ZIPs individuais contêm materiais **privados**, inclusive bancos de avaliação e fontes. **Nunca** publicar esses ZIPs em GitHub público/Pages. Só o inventário sanitizado está versionado neste repositório.

## Pendências impeditivas reais
1. A validação de **20 slides se aplica por módulo** no contrato final; a checagem do inventário V3 é apenas de quantidade mínima total por curso. Revisar a segmentação em módulos antes de assinar ou publicar (não falsear esse PASS).
2. Confirmar perguntas, tentativas e registros do Worker para cada prova modular; 70% é regra solicitada para os novos candidatos, ainda depende de revisão normativa quando a versão original exigia 80%.
3. Executar revisão de fidelidade e QA visual real em desktop 16:9, celular e tablet; esta execução não produziu screenshots confiáveis de navegador.
4. Obter revisão independente real, provenance/hash exato, políticas e assinaturas conforme `docs/lms/PLAYER3_NATIVE_FUTURE_COURSE_APPROVAL_CONTRACT.md`.
5. Em coordenação com a F4/Player 3, usar staging governado para confirmar matrícula, sessão, retomada, aprovação/reprovação, conclusão, qualificação e certificado. Evitar publicar ou ativar um curso sem F4/F0/Worker/Pages operacionais.
6. Produção exige candidato e autorização SHA/artefato/escopo-específica, os oito gates, workflows oficiais e smoke pós-release.

O teste `scripts/__tests__/native-v3-course-inventory.test.mjs` **valida somente o inventário público sanitizado**, nunca substitui teste físico de curso. Os artefatos V3 privados foram produzidos fora do repositório e podem ser incorporados apenas pelo pipeline privado governado.
