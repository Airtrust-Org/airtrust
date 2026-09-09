# Relatório de Execução — Residuais de Auditoria Schema A-02 / A-06

Esta branch trata somente os residuais A-02 e A-06. A frente `/pilot` e a migration 0488 não foram alteradas.

A migration 0487 de `qualificacoes_renovacoes` **não pertence a esta frente**: ela já foi aplicada pelo fluxo governado e está `APPLIED_VERIFIED` conforme a issue #494 e o production preflight run `34177475204`.

## A-02 — Natural Keys Tenant-Scoped

- **Status de código:** migration 0489 preparada.
- **CPF:** unicidade exata por `(empresa_id, cpf)`; o runtime normaliza CPF para dígitos.
- **Matrícula:** unicidade exata/case-sensitive por `(empresa_id, matricula)`; não foi inventado `NOCASE`.
- **E-mail:** unicidade por `(empresa_id, LOWER(TRIM(email)))`, alinhada ao vínculo canônico usuário↔funcionário.
- **Soft delete / NULL / vazio:** excluídos da constraint parcial conforme contrato atual.
- **Segurança:** nenhum remote D1 foi alterado. O apply continua condicionado a preflight read-only sem conflitos e ao fluxo governado aplicável.

## A-06 — Índices Redundantes

- **Classificação:** `ACCEPTED-DEBT`.
- O bootstrap local canônico contém quatro pares candidatos equivalentes, mas isso não prova coexistência no schema remoto atual.
- Como se trata de otimização P3 sem defeito funcional conhecido, a migration destrutiva 0490 foi retirada.
- Qualquer cleanup futuro exige prova read-only do `sqlite_master` no ambiente alvo antes de qualquer DROP.

## Qualidade e governança

- preflights operacionais ficam fora de `worker-airtrust/migrations`;
- 0487 não foi reaberta nem reaplicada;
- 0488 e `/pilot` permanecem intactos;
- testes de 0489 exercitam isolamento cross-tenant, duplicidade intra-tenant, soft-delete, NULL/vazio, case-sensitive de matrícula e identidade de e-mail por `LOWER(TRIM(email))`.
