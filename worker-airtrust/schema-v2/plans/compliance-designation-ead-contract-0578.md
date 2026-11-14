# Compliance/LMS — integridade das designações EAD (0578)

## Incidente e fonte

11/11/2026: gerente de operações funcionário #138 designado no Comitê FDM
(condição FDM_COMITE #32, atribuição #7), mas sem matrícula no curso LMS #73.
Consulta D1 prod: curso #73 -> EAD FDM_GATE #201; a obrigação formal de
designação -> FDM-COMITE-GATEKEEPER #205, sem curso LMS. A regra #705 da #201
aplica-se a FDM_EQUIPE #13, porém sem modalidade EAD nem opt-in de matrícula.

Auditoria read-only: 254 regras obrigatórias ativas: 153 EAD com automatrícula
desabilitada, 5 EAD sem curso e 96 não EAD. Em 17 regras de designação: 9 EAD
com um único curso publicado, mas sem opt-in; 2 sem curso; 6 não EAD.

## Escopo

Tenant empresa_id=6 apenas. Atualizar somente as 9 regras condicionais EAD
IDs 587,656,657,658,659,660,669,674,705, verificando um único curso EAD
publicado e ativo vinculado à mesma qualificação. Adicionar duas regras EAD
FDM_GATE #201 para as condições #32 e #12, de modo independente da qualificação
operacional #205. Preservar integralmente o curso #73 e suas evidências históricas.

Não habilitar indiscriminadamente as 144 outras regras EAD: o valor auto=0
constitui opt-out que requer revisão específica das atribuições. Não fabricar
curso para qualificações GATEKEEPER #120 e BOWTIEXP #203, EAD sem curso.

## Gates

1. SHA main exato e oito gates oficiais, mutex produção, branch protection.
2. Preflight valida os 9 estados originais e 2 novas regras inexistentes,
   curso #73 e modelos únicos, designação #138 ativa.
3. Mudança V2 atômica com ledger, Time Travel recovery e sem escrita em matrículas.
4. Pós-condições das 11 políticas e preservação das 2 regras operacionais FDM #205.
5. Reconciliação autenticada separada de designações já ativas, sem convocação,
   com evidência de matrícula #138/#73. Conclusão LMS jamais satisfaz
   automaticamente a qualificação operacional formal #205.

## Recuperação

Não executar SQL de reversão ad-hoc. Nova migração forward-only ou D1 Time
Travel em janela isolada e aprovada, sem sobrescrever concorrência.
Preservar eventos, histórico de qualificação e registros SCORM.

A auditoria local Downloads/AirTrust_compliance_269_full_audit_20261111.json
é somente leitura e contém IDs de regras, não nomes de funcionários.
