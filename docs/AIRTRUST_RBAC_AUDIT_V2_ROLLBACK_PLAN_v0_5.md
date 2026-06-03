# AirTrust - RBAC + Audit Trail v2 Rollback Plan

**Data:** 2026-06-02
**Branch:** `main`
**HEAD:** `32ca1f278a81a610fbc3c9821eddf0c5518dbb69`
**Modo:** Plano conceitual de rollback. Nenhuma migration real foi criada.

## 1. Riscos por fase

- **Fase 1:** schema aditivo de auditoria mal indexado ou com contrato incorreto.
- **Fase 2:** dual-write gerando divergencia ou falha silenciosa do writer canonico.
- **Fase 3:** grants persistidos de plataforma conflitarem com caminho legado.
- **Fase 4:** dual-read mudar decisao de autorizacao sem querer.
- **Fase 5:** enforcement de suporte bloquear diagnostico legitimo ou liberar write indevido.
- **Fase 6:** remocao de `userId===1` quebrar plataforma, login ou selecao de empresa.

## 2. Rollback para migration audit

- manter schema legado intacto;
- nao remover `auditoria`, `audit_logs` ou `auditoria_avancada_v2`;
- se a tabela v2 falhar, desabilitar writer novo e preservar apenas o schema aditivo sem uso.

## 3. Rollback para writer canonico

- desligar dual-write por feature flag;
- continuar somente com writers legados;
- preservar eventos v2 ja gravados para analise, sem apaga-los;
- bloquear qualquer cleanup de adapters enquanto houver incidentes abertos.

## 4. Rollback para platform roles

- desabilitar leitura de grants persistidos;
- preservar tabelas e grants criados;
- voltar a depender do caminho legado enquanto a divergencia e analisada.

## 5. Rollback para dual-read

- desligar shadow/dual-read;
- voltar a usar apenas o caminho legado;
- preservar logs de divergencia e request traces para investigacao.

## 6. Rollback para support enforcement

- desativar o enforcement do papel novo;
- voltar a negar `support_read_only` em runtime, se necessario;
- nunca liberar mutacao por suporte como mecanismo de rollback.

## 7. Por que `userId===1` nao deve ser removido ate o final

Porque ele e o ultimo fallback de compatibilidade para:

- resolucao de tenant de plataforma em `tenant.ts`;
- vinculo automatico em `auth.ts`;
- fluxos administrativos existentes que ainda nao leem grants persistidos.

Remove-lo antes do dual-read estavel transforma uma fase de observacao em uma mudanca irreversivel de comportamento.

## 8. Sinais de abortar rollout

- eventos v2 sem `empresa_id` quando obrigatorio;
- `support_reason` ausente em fluxo de suporte;
- divergencia frequente entre grant persistido e caminho legado;
- aumento de negacoes inesperadas em rotas de plataforma;
- falha do writer canonico em auth/admin/assets/FRMS;
- qualquer indicio de payload sensivel persistido fora da allowlist.

## 9. Como preservar logs/audit

- nunca apagar eventos v2 ja escritos;
- manter writers legados ate o fim da janela de estabilidade;
- registrar motivo e horario de desligamento de qualquer feature flag;
- comparar contagens entre writer legado e v2 antes de qualquer cleanup.

## 10. O que nunca apagar

- `auditoria`
- `audit_logs`
- `auditoria_avancada_v2`
- nova tabela canonica de audit trail
- grants persistidos de plataforma
- sessoes de suporte
- logs de divergencia do dual-read
- evidencias sinteticas usadas para validar o rollout
