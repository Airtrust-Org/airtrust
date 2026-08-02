# Pacote de reunião prévia — FOP 200 — eDB AirTrust

> **Data-base:** 2026-08-02 (BRT)  
> **Dependência:** baseline regulatório da PR #688  
> **Status:** minuta; preencher dados do operador e usar o formulário oficial vigente antes do protocolo

## Finalidade

Este diretório organiza os artefatos auxiliares para solicitar reunião prévia com a ANAC sobre o Diário de Bordo Digital AirTrust para operador RBAC 135.

O FOP 200 oficial deve ser obtido na página de Modelos e Formulários da ANAC imediatamente antes do protocolo. A página consultada em 2026-08-02 informa:

- `FOP 200 (novo).doc`, publicado em 13/11/2023;
- `FOP 219 (novo).doc`;
- `FAI.doc`;
- página atualizada em 04/11/2025.

Fontes oficiais:

- https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5
- https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario

## Conteúdo

- `SUBMISSION_CHECKLIST.md`: preparação, protocolo e pós-reunião.
- `COVER_LETTER_TEMPLATE.md`: minuta de carta de encaminhamento.
- `MEETING_SCRIPT.md`: agenda, demonstração conceitual e perguntas prioritárias.
- `MINUTES_TEMPLATE.md`: ata para registrar orientação e decisões.
- `DECISION_REGISTER.csv`: registro rastreável das respostas que afetam arquitetura e submissão.

## Regra de uso

1. baixar o FOP 200 vigente no dia do preenchimento;
2. não alterar a estrutura do formulário oficial;
3. preencher os campos do operador com dados verificados;
4. anexar a nota conceitual da PR #688;
5. usar esta carta e os demais documentos como anexos auxiliares;
6. protocolar pelo Peticionamento Eletrônico da ANAC, pela organização legitimada;
7. registrar número SEI/processo e comprovante;
8. não considerar orientação verbal como decisão arquitetural definitiva sem registro rastreável.

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
- carta e anexos revisados pelo operador;
- representantes designados;
- protocolo realizado;
- reunião realizada;
- ata e registro de decisões preenchidos;
- respostas críticas incorporadas aos ADRs e ao plano de implementação.
