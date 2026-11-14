# AVSEC D1 Tripulantes — descontinuacao total do Corporativo 0584

## Decisao vinculante 14/11/2026
A Gerencia de Treinamento revogou a separacao em cinco modalidades e determinou: manter exclusivamente o modelo D1 com nome AVSEC — Tripulantes, Comandantes e Copilotos; retirar AVSEC Conscientizacao Corporativa de Qualificacoes e Compliance; excluir inclusive seu unico historico vinculado. Nenhum AVSEC Atendimento/Solo/Carga sera criado. A exclusao do historico corporativo e expressa e nao se confunde com excluir auditorias obrigatorias.

## Estado real de producao confirmado em modo somente leitura
Empresa 6: D1 id22, 31 historicos (21 Comandante, 10 Copiloto; 27 pessoas), todos perfil AVSEC_TRIPULANTE, validade tipo 24 meses. AVSEC_CONSC id194, historico 5276 do funcionario 111, concluido em 19/02/2024 e vencido em 19/02/2026; PR #1301/0544 previamente aplicada. Regras D1 IDs 486/487 (tripulantes) e 488/489/490 (nao mais controladas); Corporativo IDs 538/671. Nenhum LMS vinculado aos modelos 22/194. Preliminarmente, um log de notificacao referencia 5276; outras referencias consultadas para o registro (sistema, LMS ciclos, geradas, renovacoes, perfis, reclass queue, sucessores) retornaram zero.

## Contrato do change
- Renomear id22 para AVSEC — Tripulantes, preservando codigo D1 e todos os 31 historicos, validade, certificados e requisicoes 486/487.
- Desativar as cinco regras 488/489/490/538/671. Nenhum outro requisito ativo AVSEC pode permanecer em producao.
- Desvincular qualificacao_historico_id=5276 nos logs de notificacoes (sem apagar logs).
- Apagar fisicamente exclusivamente o historico 5276 e desativar o modelo id194. O modelo e soft-deleted por seguranca de integridade e auditoria; sera invisivel no catalogo ativo.
- Nao alterar outros historicos, empresas, LMS ou anexos; arquivo em R2 de certificado corporativo nao e apagado neste change (requer identificacao e ciclo de retencao/expurgo independente).

## Condicoes
Somente pipeline oficial Schema V2, hashes e ledger, Time Travel, SHA exato com gates e ausencia de concorrencia. Preflight falha fechado se houver referencia adicional, outro registro corporativo, mais regras, variacao de dados/identidade ou alerta inesperado. Postcondicoes verificam dois requisitos D1, zero corporativo ativo, zero historico 5276, 31 historicos D1 e 0 FK violadas. Sem exclusao direta remota. A autorizacao do proprietario e desta mudanca; as validacoes tecnicas nao podem ser dispensadas.
