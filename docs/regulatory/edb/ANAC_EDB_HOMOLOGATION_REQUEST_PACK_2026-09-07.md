# ANAC eDB — homologation / technical-contract request pack

Date: 2026-09-07  
Issue: #93  
Purpose: prepare an exact external-information request without inventing API behavior.  
Repository revalidation: reviewed for compatibility with current protected `main` after the F4-03 offline-recovery comparator merge; no runtime/API-contract assumption is introduced by that main advance.

## Confirmed regulatory/procedural basis

- Resolução ANAC nº 773/2025 governs the Diário de Bordo from 2026-01-01.
- Article 4 requires a request to ANAC for use of digital records and points to the specific regulation for computerized systems.
- For RBAC 135 operators, the current ANAC service flow for changes/certification identifies FOP 219 and FAI among the applicable documents, with revised operator manuals and additional software-conformity evidence when applicable.
- ANAC's PDTIC identifies an institutional initiative for the Diário de Bordo API, but that planning document is not a technical API contract.
- The public homologation Swagger shell at `https://homologacao-api-diariodebordo.anac.gov.br/api/docs/index.html` does not currently expose a usable API definition; the observed `/api/docs/v1/swagger.json` path returns Not Found.

Official references reviewed:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario
- https://www.gov.br/anac/pt-br/acesso-a-informacao/acoes-e-programas/governanca/plano-de-gestao-anual/PDTIC2024_2026.pdf

## Exact information required from ANAC

The request should ask ANAC to provide or formally identify the **current, versioned** material for the Diário de Bordo digital integration, including:

1. homologation base URL and environment-identification rules;
2. current OpenAPI/Swagger JSON/YAML or equivalent technical contract;
3. procedure for obtaining homologation credentials;
4. authentication mechanism, authorization model and scopes;
5. endpoint list and supported operations;
6. request/response DTOs, required/optional fields, enums and versioning rules;
7. validation rules and canonical error model;
8. idempotency semantics and duplicate-submission behavior;
9. retry guidance, timeout behavior and rate limits;
10. receipt, acceptance, rejection and later-status semantics;
11. digital-signature, certificate, hash or non-repudiation requirements;
12. requirements for operator/designated-person signature under the RBAC 135 lifecycle;
13. requirements for corrections/amendments while preserving prior information;
14. sandbox/homologation test cases and acceptance criteria;
15. procedure and evidence required to progress from homologation to production;
16. production credential issuance/rotation/revocation procedure;
17. change-notification/version-deprecation policy;
18. technical support channel for contract/environment incidents.

## Suggested formal request text

> A Costa do Sol Táxi Aéreo, operador certificado segundo o RBAC 135, está preparando a homologação de solução informatizada para registros de Diário de Bordo em conformidade com a Resolução ANAC nº 773/2025 e demais normas aplicáveis. Para evitar implementação baseada em inferência e assegurar aderência ao contrato técnico vigente da Agência, solicitamos a disponibilização ou indicação formal da documentação técnica atual da API de Diário de Bordo, incluindo contrato OpenAPI/Swagger ou equivalente, ambiente e credenciais de homologação, autenticação e escopos, endpoints/DTOs/enums, regras de validação, idempotência e tratamento de erros, semântica de recibo/aceite/rejeição, requisitos de assinatura e certificados, critérios de homologação e procedimento de progressão para produção. Solicitamos também confirmação do canal técnico oficial e da política de versionamento/depreciação da integração.

The operator/legal identity, certificate details and process identifiers should be completed only by the authorized operator representative in the official submission surface. They must not be guessed or copied from unrelated records.

## AirTrust implementation gate

Until ANAC supplies or confirms the current technical contract:

- do not infer or hard-code endpoint paths beyond the public documentation shell;
- do not invent DTOs, auth flows, enums or acceptance states;
- do not transmit production or homologation data;
- do not treat transport success as regulatory acceptance;
- keep external ANAC integration fail-closed;
- continue implementing only provider-neutral internal eDB domain invariants supported by the published regulation.

## Closure evidence for #93

Issue #93 can move from external-blocked to implementation-ready only when the repository can record, without secrets:

- document/version identifier and provenance of the technical contract;
- confirmed homologation procedure;
- sanitized environment metadata (never credentials);
- mapping review from ANAC DTOs to AirTrust internal model;
- explicit unresolved-contract findings, if any.

Credentials themselves must remain outside Git and outside issue/PR text.
