# Pacote de reunião prévia — FOP 200 — eDB AirTrust

> **Data-base:** 2026-08-02 (BRT)  
> **Dependência:** baseline regulatório da PR #688  
> **Operador designado:** COSTA DO SOL TAXI AEREO S.A. — tenant AirTrust `empresa_id = 6`  
> **Status:** minuta específica do primeiro operador; completar responsáveis, escopo de frota e formulário oficial vigente antes do protocolo

## Finalidade

Este diretório organiza os artefatos auxiliares para solicitar reunião prévia com a ANAC sobre o Diário de Bordo Digital AirTrust para a Costa do Sol, operador RBAC 135 designado como primeiro requerente.

O FOP 200 oficial deve ser obtido na página de Modelos e Formulários da ANAC imediatamente antes do protocolo. A página consultada em 2026-08-02 informa:

- `FOP 200 (novo).doc`, publicado em 13/11/2023;
- `FOP 219 (novo).doc`;
- `FAI.doc`;
- página atualizada em 04/11/2025.

Fontes oficiais:

- https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5
- https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario

## Operador designado

O perfil verificado está em `OPERATOR_PROFILE_COSTA_DO_SOL.md`.

Baseline público identificado:

- razão social: `COSTA DO SOL TAXI AEREO S.A.`;
- CNPJ: `11.223.764/0001-62`;
- COA publicado em 2023: `2013-05-00AO-01-04`, revisão 33;
- tenant AirTrust: `empresa_id = 6`.

A revisão vigente do COA, as Especificações Operativas, o endereço, a base principal e os representantes devem ser confirmados pelo operador imediatamente antes do protocolo. Valores de seed ou migration interna não substituem documentos regulatórios.

## Conteúdo

- `OPERATOR_PROFILE_COSTA_DO_SOL.md`: identificação, fontes e pendências do primeiro operador.
- `SUBMISSION_CHECKLIST.md`: preparação, protocolo e pós-reunião.
- `COVER_LETTER_TEMPLATE.md`: minuta de carta de encaminhamento já direcionada à Costa do Sol.
- `MEETING_SCRIPT.md`: agenda, demonstração conceitual e perguntas prioritárias.
- `MINUTES_TEMPLATE.md`: ata para registrar orientação e decisões.
- `DECISION_REGISTER.csv`: registro rastreável das respostas que afetam arquitetura e submissão.

## Regra de uso

1. baixar o FOP 200 vigente no dia do preenchimento;
2. não alterar a estrutura do formulário oficial;
3. reconfirmar os dados do operador em documentos vigentes;
4. completar representantes, contatos, escopo de aeronaves, matrículas e bases;
5. anexar a nota conceitual da PR #688;
6. usar esta carta e os demais documentos como anexos auxiliares;
7. protocolar pelo Peticionamento Eletrônico da ANAC, pela Costa do Sol ou representante legitimado;
8. registrar número SEI/processo e comprovante;
9. não considerar orientação verbal como decisão arquitetural definitiva sem registro rastreável.

## Escopo da reunião

A reunião não solicita ainda a autorização final. Ela busca fechar os gates que impedem uma implementação segura:

- vigência e aplicação da Portaria nº 3.220 após a Resolução nº 773;
- caminho de ateste do software SaaS multi-tenant;
- qualificação da entidade avaliadora;
- assinatura do PIC, manutenção e operador;
- assinatura e sincronização offline;
- PWA/PED, EFB e não interferência;
- acesso da ANAC e exportação;
- mudanças que exigem novo ateste;
- escopo dos manuais e demonstrações RBAC 135;
- estratégia de shadow mode e migração da frota.

## Critério de conclusão

O pacote só é considerado concluído quando:

- formulário oficial vigente preenchido;
- carta e anexos revisados pela Costa do Sol;
- representantes designados;
- primeiro escopo de aeronaves, matrículas e bases definido;
- protocolo realizado;
- reunião realizada;
- ata e registro de decisões preenchidos;
- respostas críticas incorporadas aos ADRs e ao plano de implementação.
