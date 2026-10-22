# SCORE F5 — Política transitória de avaliação por curso e edição (22/10/2026)

Decisão: manter Player 2 SCORM, substituir gradualmente os cursos por pacotes
`AIRTRUST_UNIFIED_SCORE_SCORM12_V1`. No lançamento, **não exigir prova final
externa** nas edições novas que tiverem política individual **NO_FINAL_EXAM**
aprovada e compatível com seus requisitos legais. Depois de implementado o
módulo de Banco de Questões e Provas (#1661/#1662), a exigência
**EXTERNAL_REQUIRED** poderá ser ativada separadamente por curso e nova
edição/ciclo, sem alterar retroativamente aprovações ou tentativas anteriores.

* Separar `scorm_assessment_policy=FORMATIVE` (regra já existente no LMS)
  da futura obrigação de exame externo. O modo `FORMATIVE` existente não
  deve ser confundido com autorização automática de certificação.
* Política futura deve ser persistida por tenant, curso, edição SHA e
  matrícula/ciclo; a decisão por default global não deve reclassificar cursos
  já publicados ou matrículas abertas.
* Para NO_FINAL_EXAM, o manifesto do novo ZIP deve declarar
  `assessment.mode=NONE`, `scoringBySCORM=false` e contrato de
  encerramento validado pelo Worker. **O NR-20 SHA
  `60427a948217b59bc073c0ef455231afa4d5095f734094b56dee90babc2beb97`
  declara EXTERNAL e permanece candidato privado NÃO ATIVAR.**
  O pacote precisa ser regenerado e recertificado com novo SHA se sua
  modalidade mudar; não reinterpretar metadados externamente.
* Estudo exige encerramento explícito, edição correta e evidências de cobertura
  persistidas, idempotentes e verificadas por backend; nem `LMSFinish`,
  porcentagem, `suspend_data.study=true`, nota ou última página isolados
  autorizam terminal.
* **Exceção normativa:** a NR-20 exige avaliação satisfatória para emissão do
  certificado. `NO_FINAL_EXAM` dispensa somente prova final externa quando
  permitido; não dispensa avaliação obrigatória. Falta de classificação
  regulatória ou de evidência satisfatória bloqueia conformidade legal.
* Após validação, chamar `completeLmsMatricula` exclusivamente pelo writer
  canônico com qualificações, validade e certificado. O planejador puro
  `decideScoreF5Finalization` não concede estado, nota ou qualificação.
* A implementação operacional continua pendente: persistência por edição,
  autorização admin, integração ao Worker/SCORM F5, pacote recertificado,
  testes reais de estudo/conclusão/compliance e governança Schema V2.
  Esta especificação não é autorização para alteração de dados reais.

Frentes: #1681 SCORM atual e matrículas históricas, #1661/#1662 prova externa
futura, #1677 intake de candidatos externos. #1389 Native suspensa.
