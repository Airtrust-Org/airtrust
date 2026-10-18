# Executor FRMS QA D1 — contrato condicionado, sem endpoint remoto

Fonte: AirTrust #1426, PR #1564, inspeção somente leitura #39076290801, contrato #1561.

A biblioteca scripts/staging/frms-qa-cases-atomic-executor.mjs prepara um único D1Database.batch com oito alterações CAS: quatro jornadas e quatro alertas fictícios do tenant 999013. Cada UPDATE é imediatamente seguido de um guard changes()=1 que dispara erro SQL se a pré-condição falhar; o batch contém também guard inicial dos 14 tripulantes QA e pós-condição de quatro casos válidos.

A documentação oficial Cloudflare garante execução transacional e rollback do D1Database.batch quando uma instrução falha: https://developers.cloudflare.com/d1/worker-api/d1-database/#batch . A garantia vale para a chamada ÚNICA do Worker Binding; NÃO presumir atomicidade em chamadas múltiplas ao Wrangler ou D1 REST.

A função encryptQaPreimage exige chave AES-256-GCM de 32 bytes e retorna payload cifrado com SHA-256 de conteúdo e de ciphertext. A biblioteca exige que uma preimagem completa dos oito registros tenha sido cifrada e armazenada em artefato restrito de retenção curta; exige SHA, plano e oito IDs, UUID D1 de staging, bookmark D1 Time Travel e autorização declarada. Esse objeto NÃO substitui verificação independente de autoridade, assinatura, vigência, lock, assinatura do artefato nem recovery real.

Não existe CLI, route HTTP, credencial D1, deploy ou workflow de APPLY nesta PR. A biblioteca também prepara compensação inversa CAS seletiva dos oito registros por outro D1Database.batch, com autorização separada e conferência da pós-imagem. Os testes locais demonstram restauração integral e rejeição de drift sem reversão parcial em SQLite. O controlador governado futuro deverá verificar autoridade e vigência da aprovação SHA/oito IDs, confirmar D1/tenant, armazenar a preimagem cifrada, capturar Time Travel, injetar binding staging privado, verificar compensação em D1 e guardar recibo de auditoria protegido. Sem esses controles externos, NENHUMA escrita autorizada.

Testes node:sqlite com adaptador da API batch validam rejeição de pré-requisitos, confidencialidade AES-GCM, oito atualizações atômicas e rollback após drift na terceira jornada. O adaptador é simulação: o comportamento remoto ainda não foi empiricamente testado no D1 de staging.

Aceite FRMS exige preflight read-only 4/4, mesmo SHA Worker/Pages, capturas saneadas, verificação EVD→FRMS e tratamento/eficácia/encerramento com autorização separada. A issue científica #1476 não é alterada.