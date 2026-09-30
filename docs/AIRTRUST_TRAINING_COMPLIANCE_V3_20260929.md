# AirTrust — Training Compliance V3 — 2026-09-29

## Objetivo

Reconciliar o Compliance de Treinamentos da Costa do Sol com a matriz auditada de 28/09/2026, o PTO/PTAP/PPSP/SGSO aplicáveis, requisitos regulatórios e requisitos Petrobras/IOGP, sem transformar histórico em obrigação futura e sem criar matrícula automática.

## Princípios aprovados

1. A matriz auditada define a população padrão praticada pela empresa.
2. Norma/regulamento define o mínimo regulatório, conteúdo, modalidade e periodicidade quando aplicável.
3. Condição/designação individual é usada somente quando realmente diferencia uma pessoa do restante do cargo/grupo.
4. Histórico é evidência de cumprimento; não cria requisito nem renovação por si só.
5. Para pilotos, as regras do PTO aplicáveis à tripulação de voo passam a usar os cargos **Comandante** e **Copiloto**, preservando o escopo por aeronave quando existente.
6. `EMPRESA / NAO_APLICA` é regra-base de exclusão, não significa treinamento obrigatório para toda a empresa.
7. Todo requisito ativo deve explicar seu fundamento.

## Tipos de fundamento

- `REGULATORIO_DIRETO`: obrigação derivada diretamente de norma/regulamento.
- `PROGRAMA_APROVADO`: requisito decorrente de PTO, PTM, PTAP, PPSP, SGSO ou outro programa aprovado/controlado.
- `PETROBRAS_IOGP`: requisito de auditoria/recommended practice Petrobras/IOGP aplicável à operação contratada.
- `CONTRATUAL_CLIENTE`: requisito contratual específico de cliente.
- `DESIGNACAO`: obrigação que nasce de nomeação/função especial formal.
- `POLITICA_INTERNA`: padrão da empresa mais amplo que o mínimo externo.
- `APRIMORAMENTO_INTERNO`: treinamento adicional escolhido pela empresa para padronização/aprimoramento, sem obrigação de existir como curso externo separado.
- `PADRAO_EXCLUSAO`: regra técnica N/A para quem não possui regra mais específica.

## Regras reconciliadas

| Requisito             | Regra V3                                                                                                                                                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NR-06                 | Toda a empresa por política interna/matriz auditada                                                                                                                                                                                                                                           |
| NR-11                 | Mecânico + Auxiliar de Manutenção                                                                                                                                                                                                                                                             |
| NR-20                 | Mecânico + Auxiliar de Manutenção + Auxiliar de Suprimentos + Supervisor de Suprimentos; pacote atual de Iniciação permanece provisório até substituição pelo Intermediário adequado ao contato direto                                                                                        |
| NR-26                 | Mesma população auditada de Manutenção/Suprimentos                                                                                                                                                                                                                                            |
| NR-35                 | Mecânico + Auxiliar de Manutenção; modalidade presencial                                                                                                                                                                                                                                      |
| FOD                   | População funcional auditada + exceção individual já auditada quando aplicável                                                                                                                                                                                                                |
| PPSP                  | População ARSO da matriz/PPSP + exceção individual auditada quando aplicável                                                                                                                                                                                                                  |
| PPSP Supervisor       | Somente designação específica                                                                                                                                                                                                                                                                 |
| FDM-EAD               | Familiarização/conhecimento geral para a população ampla da matriz auditada (Tripulação, CTM, Manutenção, Segurança Operacional/QSMS e funções correlatas); `FDM_EQUIPE` permanece apenas como exceção para integrante formal fora da população já coberta                                    |
| Gatekeeper            | Somente designação formal                                                                                                                                                                                                                                                                     |
| LOSA                  | Somente observador/equipe designada                                                                                                                                                                                                                                                           |
| Conscientização AVSEC | Qualificação própria `AVSEC_CONSC`, requisito corporativo da Costa do Sol porque inclusive o pessoal do escritório do Rio precisa de credencial aeroportuária para acessar a unidade de Macaé. Para credencial permanente com acesso às áreas operacionais, a validade acompanha a credencial |
| AVSEC (D1)            | Certificação adicional por atividade: uma qualificação com perfis; Comandante/Copiloto usam `AVSEC_TRIPULANTE` e os demais perfis dependem da atividade                                                                                                                                       |
| DGR (D4)              | Uma qualificação; perfis funcionais no requisito: Tripulante, Coordenador de Voo, Atendimento, Rampa e Rampa DG                                                                                                                                                                               |
| CA-EBS                | Mantido separado do HUET porque certificados HUET legados ainda válidos podem não incluir CA-EBS                                                                                                                                                                                              |
| SOP AW139/S-76        | Mantido para pilotos aplicáveis como `APRIMORAMENTO_INTERNO`, não como curso separado nominalmente exigido por norma                                                                                                                                                                          |
| LOFT                  | Retirado como qualificação independente; permanece como componente do FSTD/CRM/OPC                                                                                                                                                                                                            |
| English Assessment    | Requisito ativo retirado; modelo inativado. Histórico preservado                                                                                                                                                                                                                              |

## Segurança de execução

O reconciliador `scripts/compliance/reconcile-training-compliance-v3.mjs`:

- executa em `DRY_RUN` por padrão;
- não grava em `lms_matriculas`;
- não habilita `auto_matricular_ead`;
- não apaga `qualificacoes_historico` nem evidências concluídas;
- exige autorização explícita por ambiente e SHA-256 exato do SQL para `--apply`.

## Evidência por perfil — AVSEC/DGR

A migration Schema V2 `0519_training_compliance_evidence_profiles` persiste `perfil_competencia` no histórico de qualificação e na matrícula LMS. O motor de Compliance compara o perfil requerido pela regra com o perfil efetivamente comprovado pela evidência; um certificado de outro perfil não satisfaz o requisito apenas por pertencer ao mesmo modelo de qualificação.

No LMS, o perfil é herdado do requisito aplicável no momento da matrícula/conclusão. No upload manual, o AirTrust sugere o perfil exigido pela função/atividade, mas o operador confirma explicitamente o perfil que o certificado realmente comprova. O backend aceita apenas perfis ativos configurados para aquela qualificação e rejeita valores arbitrários antes de gravar o arquivo.

A atribuição manual de uma qualificação não copia automaticamente o perfil exigido para a evidência: requisito e prova permanecem separados até a classificação explícita do certificado.

O PDF é evidência documental; o sistema não infere competência pelo nome do arquivo. Se o perfil comprovado divergir do perfil atualmente exigido, a evidência é preservada com seu perfil real e o Compliance permanece não atendido para o perfil exigido.

A extensão Schema V2 `0520_training_compliance_evidence_multi_profiles` normaliza a relação entre um histórico/certificado e seus perfis comprovados. Assim, um único PDF pode comprovar mais de uma competência ativa da mesma qualificação (por exemplo, dois perfis AVSEC) sem duplicar o arquivo nem o histórico; cada requisito perfilado é avaliado separadamente contra essa relação. Antes da aplicação do 0520, o backend permanece fail-closed para tentativas de registrar mais de um perfil.

## Estado de implantação

A implementação desta revisão foi preparada e testada em branch dedicada. Nenhuma mutação em produção faz parte desta etapa sem autorização explícita adicional para aplicação/deploy.
