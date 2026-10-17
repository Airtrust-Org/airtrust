# FRMS QA 999013 — reparo incremental PREPARE ONLY

Base: issue #1426, PRs #1550/#1561/#1562 e preflight D1 #39076290801.

**Situação comprovada:** quatro casos legados identificados, quatro jornadas-alvo sintéticas de origem MANUAL, zero casos válidos para aceite e zero writes executados.

### O que esta PR entrega

O módulo `scripts/staging/plan-frms-qa-case-repair.mjs` produz uma proposta determinística de oito UPDATEs com condições de comparação de estado anterior e IDs fixos. Quatro jornadas fictícias passariam a declarar SIGVOOS **simulado** exclusivamente no tenant 999013 e quatro casos seriam associados ao mesmo tripulante fictício/dia. Marcadores inequívocos continuam avisando que os dados não são operacionais.

**Não há executor, `--apply`, acesso D1, workflow de mutação ou permissão nova nesta PR.** Os testes Node com SQLite em memória simulam transação atômica, rejeição de alteração inesperada, recusa de reaplicação e isolamento do outro tenant. Isso não comprova atomicidade de execução remota do Wrangler/D1.

### Gates bloqueantes antes de qualquer escrita

1. Conferir novamente os oito registros e o tenant do staging por preflight somente leitura, incluindo sessão/login e 14 pessoas QA fictícias.
2. Capturar e guardar preimagem exata e hashes dos oito registros em local protegido, sem publicar dados nominais ou dumps nos logs/issue.
3. Confirmar D1 UUID, bookmark Time Travel, ausência de escrita concorrente, garantias de atomicidade do mecanismo remoto e compensação por linha.
4. Preparar executor e workflow governados em PR separada com confirmação explícita de SHA/UUID/8 IDs, testes SQLite/CI e autorização específica de staging. Não usar reseed ou rollback destrutivo legado.
5. Apenas após autorização, aplicar e verificar 4/4 casos via workflow READ-ONLY, obter screenshots saneados em QA autenticado e testar o ciclo de um caso com uma autorização de mutação separada.

A issue #1476 permanece exclusivamente científica; índices shadow não são promovidos. Produção nunca é alvo desta proposta.