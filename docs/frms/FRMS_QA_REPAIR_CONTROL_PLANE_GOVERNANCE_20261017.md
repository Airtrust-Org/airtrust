# FRMS — controlador de recuperação QA, sem rota de aplicação

**Referências:** issues #1426, #1476 e #776; PRs #1564 e #1573; preflight #39076290801 e revisão #39083434441.

O módulo `scripts/staging/frms-qa-repair-controller.mjs` separa **preparação de evidências read-only** e **execução sob aprovação criptograficamente verificada**. É biblioteca sem `main()`, sem `workflow_dispatch` de aplicação, sem credencial Cloudflare e sem endpoint HTTP. **Não foi aplicada nenhuma atualização em D1.**

Na preparação, um adaptador de ambiente staging adquire o lock compartilhado, verifica tenant 999013, D1 UUID, 14 tripulantes QA, fingerprints de usuários e registros fora do lote, captura oito linhas antigas, obtém bookmark Time Travel, cifra preimagem AES-256-GCM e exige recibo de armazenamento restrito, com validade máxima de 24 horas. Somente hashes/contagens entram na auditoria. A lista de registros é fixa e inclui quatro alertas e quatro jornadas fictícias.

A aplicação requer manifesto **assinado com Ed25519**, chave pública cuja impressão digital esteja previamente fixada por mecanismo independente de coordenação, `issuedAt`/`expiresAt` (máximo 15 minutos), SHA exato, digest da revisão, banco, tenant, oito IDs, preimagem criptografada e bookmark. Exige revalidação sob lock, reserva persistente de nonce, auditoria antes da mutação, novo bookmark e apenas **um** D1Database.batch com oito CAS e checagens `changes()=1`; exige pós-condição `valid=4`, preservação das identidades e do conjunto fora da allowlist. Falha antes do batch bloqueia a escrita; falha depois exige investigação e eventual compensação seletiva **com nova autorização**, sem restaurar D1 global concorrente.

## Pré-requisitos externos ainda não satisfeitos

O administrador do fluxo oficial deve fornecer adaptadores de autenticação/lock/conexão privada a D1, armazenamento cifrado ACL restrita, captura Time Travel, auditoria imutável, ledger de nonce persistente e captura de fingerprints. O callback `getDb` precisa fornecer binding real de staging; teste em SQLite não prova comportamento remoto. A chave pública confiável deve ser fixada em ambiente protegido e a autoridade central deve emitir uma aprovação assinada **para SHA e oito IDs exatos**. Só depois disso um workflow oficial de staging poderá ser criado/revisado/ativado em PR separada para a operação autorizada. Não passar segredo por input de `workflow_dispatch`, URL ou comentário GitHub.

Não tratar SIGVOOS sintético como voo real. Não alterar usuários, check-in, regras de aptidão ou peso do IMA V3. Prévia do caso não substitui decisão humana; a etapa de navegador autenticado só estará concluída após 4/4 registros válidos e autorização separada para mutações de tratamento.

## Camadas de interpretação operacional (sem novos pesos)

Conforme #1476, tratar **risco estimado**, **conformidade de coleta**, **completude/confiabilidade** e **avaliação humana** como dimensões diferentes. Check-in pendente e PVT ausente são pendências de informação e de processo: não comprovam fisiologicamente fadiga, nem significam normalidade. KSS é autorrelato de sonolência, PVT-B é tarefa de vigilância, oportunidade de repouso não equivale a sono medido. O adicional histórico de **+10 por qualquer check-in pendente em uma quinzena** é regra interna da baseline, não um coeficiente validado cientificamente; não usar isoladamente para negar ou liberar tripulante. Preservar obrigatoriedade de PVT diário e revisão científica humana de pesos e limiares.