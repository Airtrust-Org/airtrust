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
Nos testes, ele é **inteiramente falso/sintético**. Antes de qualquer
uso operacional, uma implementação confiável deve comprovar, via API
autenticada do GitHub e sob mutex governado: comentário inalterado,
autor admin F0, idade, fase, SHA, recursos, workflow/run, exigências dos
oito gates, sem reutilizar o grant V2 do bucket. O código não fornece
essa implementação, não a presume e não está conectado ao CI de
provisionamento. Em particular, um caller que controle a injeção
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
