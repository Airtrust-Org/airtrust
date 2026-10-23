# FRMS F0 — fronteira prepare-only de service binding (protótipo não implantado)

**Escopo:** #1426 / #776, somente tenant sintético 999013, D1 staging
`bf9963f4-eb12-439b-a830-20bbf577ac22`. Não executa deploy,
nem confere autorização do operador por si só. A fase bucket R2
está concluída, mas NÃO autoriza `prepare`, `apply` ou o Worker.

## Contrato testado

`ops/frms-qa-repair/private-binding-prepare-prototype.mjs`
implementa um consumidor puro de **RPC privado**. Ele exige contexto de
runner restrito a `main`, SHA de 40 caracteres, `workflow_dispatch`,
run ID/attempt exatos, indicação de fase `prepare`, grant ID e o HMAC
do caller privado. Só envia `{callerAuth}` a `binding.prepare`. Não
aceita SQL, IDs, bookmark, bearer token ou assinatura Ed25519 no payload.
O método `apply` não faz parte desse protótipo.

Há uma dependência proposital `independentGrantVerifier`:
o retorno de um callback injetado **NÃO é evidência de autorização**.
Nos testes, ele é **inteiramente falso/sintético**.

A verificação GET-only agora também tem **implementação de contrato real** em
`ops/frms-qa-repair/verify-prepare-admin-grant.mjs`, ainda não instalada em
um chamador operacional. O verificador usa o GitHub REST autenticado,
consulta `main` e SHA exato, a identidade de run `workflow_dispatch`
no caminho fixo `staging-frms-qa-private-prepare.yml`, e as oito
conclusões oficiais com origem `github-actions`. Consulta comentário
novo e não editado na issue #776, com conteúdo JSON de campos fechados,
publicado por identidade administrativa do GitHub; o ator do job
precisa também ter permissão `admin`. Expira 2 horas após criação.
A fase é `prepare`, com **D1 writes=0** e
`apply_authorized=false`, mas permite **exclusivamente armazenar a
preimagem cifrada** no bucket privado R2 já aprovado, no prefixo
`frms-qa/999013/`, com retenção máxima de 24 horas. Essa gravação R2
exige um NOVO grant exato da fase `prepare`; o grant V2 que criou o
bucket não autoriza armazenar preimagens. O
antigo grant V2 do bucket ou assinaturas de apply não satisfazem o
contrato. Os testes percorrem os caminhos reais do verificador com
respostas **sintéticas**, incluindo recusa de 403, redirect, grant editado,
idade, SHA, run, permissão não administrativa e oito gates incompletos.

O comentário administrativo antecede a criação do `runId`, portanto o
plano fixa SHA, fase, recursos e arquivo do workflow, enquanto o
**run ID real é atestado separadamente pela API de GitHub Actions**.
Não inventar nem preatribuir número de run em comentário, e nunca
aceitar que o próprio chamador controle o provedor da API autenticada.
O `GITHUB_TOKEN` deve permanecer exclusivo do runner governado,
sem ser transmitido no RPC do Worker. A validação de concessão não
substitui o ledger durável de uso único nem o mutex staging.


O protótipo exige também um `grantLedger.transaction` que reserva de forma
atômica **o par SHA + ID da concessão** antes do RPC. Reutilização do grant
é negada mesmo com HMAC e nonce novos. Se o RPC falhar depois da reserva,
o grant permanece gasto até uma reconciliação especificamente aprovada;
não há retry automático. Em testes o ledger é um `Map` sintético; nenhuma
persistência real foi provisionada. A futura implantação precisa de um
ledger durável compartilhado entre instâncias, não KV eventualmente
consistente, nem apenas variáveis do job.
 Antes de qualquer
uso operacional, uma implementação confiável deve comprovar, via API
autenticada do GitHub e sob mutex governado: comentário inalterado,
autor admin F0, idade, fase, SHA, recursos, workflow/run, exigências dos
oito gates, sem reutilizar o grant V2 do bucket. O código de verificação existe, mas **não está instalado num executor
confiável**, não fornece a implementação de transporte entre GitHub e
Cloudflare e não está conectado ao CI de provisionamento. Em particular, um caller que controle a injeção
poderia falsificar seu retorno, portanto o protótipo não deve ser
promovido a um serviço confiável sem essa fronteira externa.

A suíte privada Miniflare usa um **binding real de execução local**
para o Worker sintético com DO, D1 e R2 descartáveis. Confirma recibo
`prepare` e artefato criptografado R2, sem alterações no D1, além
de garantir que a rota HTTP do Worker permanece 404. Testes negativos
cobrem falta de verificador, divergência de SHA, runner, escopo e grant;
um caller sem segredo HMAC não consegue preparar o recibo.

## Bloqueios reais para produção de staging

Mesmo com o RPC exercitado localmente, o GitHub Actions runner
**não tem ligação direta** a `WorkerEntrypoint` dentro da infraestrutura
Cloudflare. A futura arquitetura precisa de um serviço de transporte
independente, privado e explicitamente autorizado; não abrir endpoint
HTTP de reparo como atalho. Além disso, o Worker ainda depende de
`FRMS_QA_D1_READ_TOKEN` read-only, enquanto a prova Time Travel com
token existente #39977611720 só validou um GET e um HMAC local
descartável. Resolver a transferência confiável e replay de bookmark
exige nova revisão de segurança.

Por fim, a assinatura Ed25519 de `apply` precisa permanecer sob
uma autoridade independente, com chave pública previamente pinada e
chave privada fora do Worker. O proprietário ainda não autorizou
a fase Worker, nem concedeu permissão de escrita D1/aceite 4/4.
Nenhuma dessas condições é atendida pelos testes do protótipo.

**Saída permitida desta PR:** contrato de transporte privado e
testes sintéticos, integrados após gates oficiais. **Proibido:**
deploy, criação/reutilização ampla de token no runtime, R2/D1 remoto
ou `apply` sem autorização própria.
