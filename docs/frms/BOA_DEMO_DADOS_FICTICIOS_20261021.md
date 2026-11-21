# BOA/CBMMG — base 100% fictícia para demonstração do FRMS

**Escopo:** PR #1650, frente FRMS BOA. **Data:** 21/10/2026.  
**Status:** base demonstrativa versionada e verificável **offline**; **não** aplicada em staging/produção, **não** homologada nem prova formal apta.

## O que foi criado

Gerador: `scripts/fixtures/boa/boa-demo-dataset.mjs`.  
Teste de integridade: `scripts/__tests__/boa-demo-dataset.test.mjs` (integrado ao gate oficial `worker-tests-2`).

A base é determinística, não copia dados de CBMMG, Costa do Sol nem de qualquer pessoa real. Nomes visíveis como **TRIPULANTE TOTALMENTE FICTICIO 001** deixam explícito seu caráter artificial. Não há CPF, matrícula militar, código ANAC, e-mail, telefone, senha, JWT ou informação clínica de indivíduos reais.

| Componente | Volume planejado | Demonstração |
| --- | ---: | --- |
| Bases/setores | 4 | Escopo de cada gestor, equipes segregadas |
| Tripulantes | 130 | Cadastro canônico, funções aeronáuticas válidas para classificação BOA |
| Gerentes fictícios | 4 | Gestão restrita ao setor com `setores_gestores.usuario_id` |
| Administrador fictício | 1 | Relatório agregado sem dados sensíveis |
| Referências de contas fictícias | 135 | **Não são usuários criados nem credenciais** |
| Missões/contextos ilustrativos | 280 | Resgate, salvamento, aeromédico, incêndio, treinamento |
| Recibos de check-in | 280 | 100 em setembro, 180 em outubro/2026 |
| Casos abertos | 280 | Cada recibo origina revisão humana |
| Eventos de tratamento | 186 | Mitigação com responsável, prazo e justificativa |
| Encerramentos ilustrativos | 93 | Avaliação textual de eficácia, **não** eficácia científica comprovada |
| Eventos totais | 839 | `frms_fadiga_evento` append-only compatível com a estrutura BOA |

Dois meses de referência produzem comparação real pelo mesmo SQL de relatório:

| Métrica | Setembro/2026 | Outubro/2026 |
| --- | ---: | ---: |
| Pessoas com recibo | 100 | 120 |
| Recibos | 100 | 180 |
| Casos aguardando tratamento | 34 | 60 |
| Casos em tratamento | 33 | 60 |
| Casos encerrados com texto de eficácia | 33 | 60 |

Os dez tripulantes restantes existem **sem recibos no mês corrente**; isso representa ausência de registro, **não** falta operacional comprovada nem índice de adesão. O delta de recibos é +80, **não** um índice de risco. As coortes foram deliberadamente construídas para evitar células de 1–4 na visão administrativa normal; mecanismos de supressão seguem obrigatórios em qualquer recorte diferente.

Há exemplos de missão noturna, sobreaviso, sono autorrelatado reduzido, KSS ilustrativo, PVT de 60 segundos **somente declarado** (sem desempenho medido), declaração de impedimento e campos ausentes mantidos `null`. **Nenhum cenário concede aptidão ou liberação de voo.** O método científico, limiares e procedimentos operacionais requerem validação BOA independente.

## Geração e teste sem nenhum acesso remoto

Na branch da PR, em ambiente Node 24 com dependências instaladas:

```bash
node scripts/fixtures/boa/boa-demo-dataset.mjs --out /tmp/boa-demo-ficticio.json
node --test scripts/__tests__/boa-demo-dataset.test.mjs
```

O arquivo de saída é criado com permissão `0600` e `flag: wx` (não sobrescreve arquivo existente). A execução sem `--out` não escreve arquivos e mostra apenas o modo de uso. O gerador **não** executa SQL, rede, Cloudflare, criação de usuário, login ou publicação de código.

A função `buildBoaDemoDataset()` gera aliases `BOA-DEMO-*`. A função `bindBoaDemoEventRows(dataset, { tenantId, employeeIds, userIds, policyRevision })` prepara **somente em memória** linhas do evento após receber mapas completos de IDs reais **sintéticos** já criados no tenant QA correto; rejeita tenant 6, IDs ausentes/duplicados e política sem evidência de aprovação fornecida pelo executor. O booleano de aprovação no objeto de entrada **não é prova jurídica/científica nem verificação de assinatura**: apenas um pré-requisito técnico. Uma futura carga deve verificar a aprovação externamente, em fluxo governado, antes de invocar a função. Não há mecanismo de carga remota implementado por esta entrega.

Os testes usam `node:sqlite` em `:memory:` e a **consulta SQL existente** do relatório BOA, verificam totais, integridade de histórico, exclusão explícita da empresa 6, dados agregados sem identificadores de pessoa e falha fechada para caso com funcionário adulterado. Isso não equivale a D1 remoto nem a teste de 130 sessões autenticadas.

## Roteiro de demonstração após staging autorizado

1. **Administrador BOA:** conferir 130 funcionários fictícios em quatro bases e papel do tenant com código `bombeiros`, perfil `FIREFIGHTER_AVIATION` aprovado. Cadastro de funcionários é exibido somente ao papel autorizado.
2. **Tripulante fictício:** exibir check-in diário e recibo do próprio usuário; situação de sono/KSS/PVT ilustrativa e revisão humana necessária, nunca aptidão automática.
3. **Gestor setorial:** consultar fila sanitizada de casos `ABERTO`, `EM_TRATAMENTO` e `RESOLVIDO`; reabrir uma situação de teste por novo caso, não alterar eventos históricos; negar acesso de gerente de outra base.
4. **Relatório mensal:** abrir prévia de outubro/2026, comparar setembro/2026, observar indicadores e recomendações com ausência de denominadores, sem assinar como oficial.
5. **Segurança:** provar 403 para empresa 6, usuário sem papel e gerente observador, sem divulgação de KSS, sono, PVT ou ID individual no relatório; testar revogação de vínculo e supressão de coorte pequena em ambiente controlado.

## Portão para staging — ainda não executado

**Não existe autorização genérica para gravar esses eventos em staging.** Antes de qualquer provisionamento ou write:

- Definir tenant QA novo `bombeiros` **com `empresa_id != 6`**, sem reaproveitar cadastros ou dados da Costa do Sol.
- Aprovar finalidade, tratamento de dados sintéticos, responsabilidades e protocolo técnico BOA; verificar separadamente os limites científicos/operacionais.
- Obter autorização explícita de staging para o artefato/SHA, janela e impacto, com conflito de deploy/schema resolvido.
- Provisionar usuários e seus vínculos por fluxo governado, com 130 contas **distintas**, quatro gestores com grants diretos e um administrador; emitir tokens **fora do Git/repo**.
- Verificar tabela/colunas e Schema V2 efetivamente aplicados; preparar dry-run, idempotência, baseline e recovery. Não executar raw SQL remoto improvisado.
- Ingerir aliases somente após mapear IDs de funcionários/usuários previamente autorizados, sem uso de IDs numéricos exemplificativos, através do executor governado que ainda deverá ser desenvolvido/aprovado. Validar contagens e histórico **antes e depois**; nunca inserir novamente os mesmos IDs.
- Confirmar leitura autenticada Worker/Pages/D1, isolamento bidirecional, QA de fluxo, gate de 130 usuários GET sob janela autorizada e encerramento/revogação das credenciais após ensaio.

**Produção:** não autorizada, não incluída. **PoC oficial:** só após convocação e avaliação da Administração, conforme edital e documentos vigentes. O software e essa massa de teste não substituem atestados de experiência da licitante nem pareceres assinados.

Relacionados: `docs/frms/BOA_STAGING_130_QA_POC_RUNBOOK_20261020.md`, `docs/frms/BOA_CBMMG_LICITACAO_POC_MATRIX_20261020.md` e `docs/frms/BOA_RELATORIO_MENSAL_GERENCIAL_TECNICO_CONTRATO_20261020.md`.

## Prévia interativa sem Cloudflare (21/10/2026)

Foi incluído na mesma PR o arquivo **`docs/frms/BOA_DEMO_INTERATIVA_OFFLINE_20261021.html`**, um painel demonstrativo HTML/CSS/JS totalmente independente, sem login, sem rede, sem D1/R2 e sem bibliotecas externas. Pode ser aberto no navegador com o arquivo local. Reproduz deterministicamente o mesmo contrato de 130 perfis sintéticos, 100/180 recibos e casos do conjunto oficial offline; não consulta o gerador Node durante a execução. Contém navegação por Visão Geral, Tripulantes, Ocorrências, Relatório Mensal, Cenários e Roteiro, além de alternância meramente ilustrativa de administrador/gestor/tripulante. **Esse seletor não testa RBAC ou autenticação real.**

Para visualizar, no GitHub da PR use **Raw / Download raw file** para salvar `BOA_DEMO_INTERATIVA_OFFLINE_20261021.html` e abra o arquivo em navegador moderno. Alternativamente, a conversa ChatGPT pode distribuir uma cópia baixável deste HTML após conferir o mesmo SHA no GitHub.

O teste de segurança `scripts/__tests__/boa-demo-offline-preview.test.mjs` bloqueia bibliotecas/requisições externas, chamadas de escrita/rede e uso de armazenamento/sessão; está incluído no gate `worker-tests-2`. A visualização sintética offline serve para **revisão visual e apresentação sem integração**, enquanto a demonstração autenticada em staging continua dependendo das autorizações já descritas.
