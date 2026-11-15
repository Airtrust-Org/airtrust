# DGR 0585 — aceitação pós-produção

A migração `dgr-legacy-maintenance-consolidation-0585` foi aplicada pelo workflow oficial GitHub Actions #43676998109 no SHA `26644dae00d4280fb0b05a0cd8dfe80ac6ce3b5e` e o ledger foi gravado. O workflow terminou FAILED **na pós-validação**, após aplicação e ledger bem-sucedidos, porque a assertiva esperava o texto legado `qualificacoes_historico.tipo='Artigos Perigosos'`, mas o trigger de atualização do catálogo normaliza o campo para `Treinamento de Artigos Perigosos para o Transporte Aéreo`.

Verificação direta read-only da produção: históricos #4781 e #4782 estão vinculados ao D4 id25, vencidos, com códigos de origem `MNT_ARTIGOS_PERIGOSOS`, perfis `PTAP_MNT_LEGACY_NAO_HOMOLOGADO`, certificados e datas preservados. Observações registram a proveniência PTM 20.12. O terceiro histórico #4649 permanece logicamente excluído e vinculado ao modelo legado, sem reativação. O modelo duplicado #137 está inativo, as regras de Manutenção e Tripulação são segregadas, e não há violações de foreign key.

Uma execução independente **somente leitura** do script de pós-condições com o predicado de `tipo` corrigido verificou **15/15 condições**: `DGR_0585_POSTCONDITIONS_PASS` em 15/11/2026. Esta PR altera apenas o predicado de teste, o teste de regressão e este registro. Não altera SQL, manifest, plano versionado nem aplica segunda vez a migração.
