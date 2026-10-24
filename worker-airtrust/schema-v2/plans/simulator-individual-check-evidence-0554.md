# Schema V2 0554 — resultado individual de check de simulador

## Problema comprovado
A tabela histórica `sessoes_checks_resultados` tem resultado por check de **sessão**, sem `ficha_id` ou `funcionario_id`. Um resultado de sessão compartilhada não comprova aprovação de cada participante. A PR #1544 impede a atribuição automática ambígua e a escrita coletiva indevida. Este change prepara o contrato individual da issue #1548, sem ativá-lo na aplicação.

## Mudança estritamente aditiva
- Tabela `sessoes_checks_resultados_individuais`, chave por `empresa_id + ficha_id + sessao_check_id`, com `funcionario_id` e `avaliador_funcionario_id`.
- Resultado explícito `aprovado` = 0/1; `NULL` é pendência, nunca aprovação.
- Estados `RASCUNHO`, `CONFIRMADO`, `ANULADO`, revisão, origem, instante, usuário confirmador e observações.
- `UNIQUE` de evidência ativa por funcionário/ficha/check; triggers impedem identidade cross-tenant ou de outra sessão, confirmação sem duas assinaturas e edição de evidência confirmada.
- **Nenhuma** atualização de `qualificacoes_historico`, `sessoes_checks_resultados`, `fichas_sessao`, matrículas, progresso LMS, Compliance, certificados ou evidências antigas.

## Dependências de governança
- **0553** (retirada governada do modelo LGPD vazio) já foi elaborado na PR #1396, mas arquivo no repositório não significa aplicado. Esta migration é **0554** e só pode seguir após revisão/merge da 0553 no código e confirmação de sequência exigida pelo ledger Schema V2.
- O Worker existente **não deve ler nem escrever** na nova tabela automaticamente. Habilitação demanda outra PR de contrato runtime: rota autenticada por ficha/funcionário, autorização do instrutor/examinador e tenant, transação de confirmação após assinatura, auditoria do resultado, revogação governada e consumidor de Compliance/histórico com provenance.
- Nunca fazer backfill de aprovação individual baseado em resultado da sessão, check global, presença no roster, ficha geral ou ausência de resultado. Registros antigos permanecem histórico de sessão, não evidência individual.
- Em uma sessão com participantes A e B, o check de A aprovado **não pode** satisfazer B; B sem registro permanece `PENDENTE_AVALIACAO`. Reprovação explícita de B permanece reprovação, mesmo se A tiver aprovação.

## Sequência de aplicação governada
1. Capturar SHA/manifest/hash/contrato, verificar oito gates, branch protection e ausência de colisão de change_id.
2. Inspecionar somente leitura no ambiente alvo: `PRAGMA table_info`, `sqlite_master`, existência das quatro tabelas-fonte, ledger e schema baseline.
3. Obter recovery point D1 Time Travel/backup pelo workflow oficial. Verificar plan/hash/allowlist, autorização específica do alvo e número da migration.
4. Executar **somente** `apply-schema-change-v2.yml` (ou sucessor governado), nunca `wrangler d1 execute --remote` manual.
5. Pós-validação: tabela/índices/triggers existem, ledger traz `simulator-individual-check-evidence-0554`, contagem inicial **zero**. Inspecionar que histórico/cursos/matrículas/qualificações não mudaram.
6. Depois, em PR **separada** e apenas após migration confirmada no ambiente, publicar Worker/Pages com API de resultado individual, confirmação assinada, autorização e visualização; validar sessão compartilhada completa em staging.
7. Produção requer autorização nova, explícita e SHA/artefato/escopo-específica. Este plano não concede autorização.

## Testes
`worker-airtrust/src/__tests__/migrations/simulator-individual-check-evidence-0554.test.ts` cobre: duas fichas na mesma sessão com resultados diferentes, tentativa cross-tenant/cross-ficha, assinatura ausente, identidade imutável, unicidade, ausência de backfill e tentativa de confirmar rascunho sem assinatura.

## Recuperação
Aplicação somente com recovery point registrado pelo workflow. Como mudança aditiva sem dados antigos alterados, rollback normal do Worker é independente; reversão da tabela requer **nova migration compensatória governada**, avaliação de dependências e preservação de quaisquer evidências já coletadas. Não remover por SQL direto.
