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

## Matriz de interpretação para aceite humano (referência #1476)

A estrutura abaixo é **contrato de verificação**, não afirmação de telas já homologadas.

| Situação sintética | Informação comprovável | Informação que falta/limitação | Conduta que deve ficar clara |
|---|---|---|---|
| Check-in recebido | Formulário recebido e registrado | Não comprova sonolência baixa ou aptidão | Examinar KSS, PVT-B, jornada e alerta; decisão humana |
| Check-in pendente | Coleta não realizada no prazo | Estado fisiológico desconhecido | Cobrar/coletar e avaliar exposição; não considerar «normal» |
| PVT-B diário pendente | Não há medida daquele dia | Não interpretar ausência como desempenho normal | Solicitar aplicação obrigatória e registrar pendência |
| KSS elevado | Autorrelato de sonolência na escala KSS | Não substitui investigação nem mede causa isoladamente | Investigar sono, jornadas, condições e medidas imediatas |
| Repouso entre jornadas | Intervalo temporal derivado das jornadas | Oportunidade de repouso não comprova horas efetivamente dormidas | Confirmar contexto e documentação necessária |
| Alerta recorrente | Histórico de casos ligados ao tripulante | Contagens por página/filtro podem não representar o total global | Consultar histórico completo e eficácia das ações anteriores |
| Dados incompletos/desatualizados | Origem, momento, pendência e extensão conhecidos | Estimativas ou ausência de sincronização criam incerteza | Priorizar reconciliação antes de concluir risco ou liberar operação |
| Registro SIGVOOS **simulado** | Fixture QA com origem explícita e IDs sintéticos | Não é voo real nem serve para decisão sobre pessoas reais | Somente demonstrar tratamento e auditoria no tenant 999013 |

A Coordenação deve conseguir percorrer **Operação → tripulante/jornada → fonte/data → motivo e regra → situação de incerteza → Caso → responsável/ação/prazo → acompanhamento/eficácia/encerramento → Relatório**. Exigir screenshots saneados de cada decisão e do que **não** é possível concluir. Manutenção, relatórios/exportações e EVD→FRMS permanecem **não homologados visualmente** até haver 4/4 casos íntegros no staging.

### Separação metodológica sem alterar pesos

A issue #1476 documenta uma fórmula histórica de índice acumulado e o acréscimo **+10 por ao menos um check-in pendente** na quinzena. Esse +10 é critério interno de conformidade/coleta; **não foi cientificamente demonstrado como equivalente a agravamento fisiológico de fadiga**. Também podem ocorrer somas e classificações redundantes por pendência, inconsistência e dia incompleto. Não interpretar o índice bruto como diagnóstico clínico ou autorização operacional.

Manter cinco camadas discerníveis: **limites/regra aplicável**, **fatores de risco estimados**, **qualidade/completude**, **conformidade da coleta**, **decisão humana e evidência de eficácia**. Os coeficientes/limiares exatos requerem calibração e parecer FRMS/GAGEF independente com revisão das fontes e dados anonimizados; não presumir homologação por ICAO/ANAC. O PVT diário obrigatório deve permanecer exigível. O IMA V3 shadow não pode ser promovido enquanto a issue #1476 estiver pendente de validação humana.

### Prova ainda necessária

Após governança e autorização específica, a atualização deverá passar no preflight somente leitura com **4/4** casos íntegros, mesmo tenant e jornadas vinculadas. O QA de navegador precisa produzir evidência de leitura de Operação, Casos, Manutenção, Relatórios, EVD→FRMS e registro/auditoria de um ciclo sintético separado e autorizado. Sem essa prova, a Frente 6 continua aberta; não confundir UI renderizada com operação validada.
