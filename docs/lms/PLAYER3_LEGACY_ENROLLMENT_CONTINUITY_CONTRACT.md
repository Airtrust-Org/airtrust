# Player 3 — continuidade de matrículas reais

## Regra antes de ativar cursos existentes

O relato CFIT mostra progresso 32/37 (86%) bloqueado por edição anterior e outro aluno em 37/37 sem possibilidade de fechamento. O Player 3 deve resolver a continuidade por matrícula, sem presumir que 86%, 37/37 ou número de slides provem equivalência ou certificação.

1. O Worker autentica tenant, funcionário, matrícula, ciclo e edição de origem. Lê marcador SCORM persistido, CMI/suspend_data, versão/hash do pacote, prova/notas e evidências de conclusão. Sem identidade de edição inequívoca, conservar evidência e classificar como reconciliação pendente — nunca reset automático.
2. Se a edição histórica ainda estiver disponível e íntegra, reabrir a MESMA edição e retomar no cursor do servidor, independentemente de revisão posterior do catálogo. Proibir autosave da edição nova sobre o ciclo antigo.
3. Migração de edição só quando um mapa de equivalência revisado comprovar cobertura integral de IDs, slides, interações, recursos, avaliações e critérios. Igual número de telas não basta. Guardar prova SHA e trilha auditável.
4. Se realmente incompatível, preservar matrícula, notas, tentativas e progresso da edição original; oferecer à Gerência de Treinamento um novo ciclo auditado, transacional e idempotente, sem reaproveitar notas, aprovações nem certificados. Não repetir ciclo a cada login.
5. Na última tela, executar a validação terminal da edição original: resultado oficial, requisitos de prova, histórico e certificado atômicos. Posição 37/37 isolada não autoriza conclusão.
6. Interface: mostrar “Continuar edição iniciada”, “Conferir conclusão”, “Nova edição requer ciclo autorizado” ou “Reconciliação necessária” — com motivo e próximo passo — em vez de um bloqueio sem solução.

## Aceite obrigatório na PR #1389

- CFIT com 32/37: retoma mesma edição no marcador histórico e salva sem perda.
- CFIT com 37/37: conclusão elegível é reconhecida uma única vez; caso não elegível, apresenta requisito real, sem nota inventada.
- Substituição com mesmos 37 slides mas IDs/hash divergentes: nenhum reaproveitamento automático.
- Pacote antigo indisponível: falha fechada sem reset nem uso indevido da nova edição.
- Mudança incompatível: gestor autoriza novo ciclo, sem destruir histórico, certificação ou matrícula anterior.
- Testar isolamento de tenant, identidade, concorrência, refresh, dois navegadores e regressão dos SCORM originais.

Este é um requisito de implementação no Player 3; NÃO certifica que esses caminhos já funcionam. A seleção Native atual é para novas matrículas, e a rota inicial ainda é preview/staging. Não ativar cursos reais nem produção sem a implementação e a prova física desses caminhos.
