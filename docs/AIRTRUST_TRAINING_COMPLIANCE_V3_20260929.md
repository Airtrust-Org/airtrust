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

| Requisito | Regra V3 |
|---|---|
| NR-06 | Toda a empresa por política interna/matriz auditada |
| NR-11 | Mecânico + Auxiliar de Manutenção |
| NR-20 | Mecânico + Auxiliar de Manutenção + Auxiliar de Suprimentos + Supervisor de Suprimentos; pacote atual de Iniciação permanece provisório até substituição pelo Intermediário adequado ao contato direto |
| NR-26 | Mesma população auditada de Manutenção/Suprimentos |
| NR-35 | Mecânico + Auxiliar de Manutenção; modalidade presencial |
| FOD | População funcional auditada + exceção individual já auditada quando aplicável |
| PPSP | População ARSO da matriz/PPSP + exceção individual auditada quando aplicável |
| PPSP Supervisor | Somente designação específica |
| FDM-EAD | Somente integrantes formalmente designados no programa FDM/HFDM |
| Gatekeeper | Somente designação formal |
| LOSA | Somente observador/equipe designada |
| AVSEC (D1) | Uma qualificação; Comandante/Copiloto usam perfil `AVSEC_TRIPULANTE`; demais perfis dependem da atividade/designação |
| DGR (D4) | Uma qualificação; perfis funcionais no requisito: Tripulante, Coordenador de Voo, Atendimento, Rampa e Rampa DG |
| CA-EBS | Mantido separado do HUET porque certificados HUET legados ainda válidos podem não incluir CA-EBS |
| SOP AW139/S-76 | Mantido para pilotos aplicáveis como `APRIMORAMENTO_INTERNO`, não como curso separado nominalmente exigido por norma |
| LOFT | Retirado como qualificação independente; permanece como componente do FSTD/CRM/OPC |
| English Assessment | Requisito ativo retirado; modelo inativado. Histórico preservado |

## Segurança de execução

O reconciliador `scripts/compliance/reconcile-training-compliance-v3.mjs`:

- executa em `DRY_RUN` por padrão;
- não grava em `lms_matriculas`;
- não habilita `auto_matricular_ead`;
- não apaga `qualificacoes_historico` nem evidências concluídas;
- exige autorização explícita por ambiente e SHA-256 exato do SQL para `--apply`.

## Limitação conhecida — perfis AVSEC/DGR

O esquema de requisito já armazena `perfil_competencia`, porém o motor atual de evidência de Compliance ainda resolve conclusão principalmente por `funcionario_id + qualificacao_tipo_id`.

Consequência: a configuração V3 pode definir corretamente o perfil requerido, mas a etapa seguinte deve fazer a evidência/certificado registrar e validar o perfil concluído antes de considerar AVSEC/DGR totalmente fechados em auditoria por competência.

Essa limitação é intencionalmente mantida fora desta primeira correção para evitar multiplicação artificial de cursos e será tratada em fase própria.

## Estado de implantação

A implementação desta revisão foi preparada e testada em branch dedicada. Nenhuma mutação em produção faz parte desta etapa sem autorização explícita adicional para aplicação/deploy.
