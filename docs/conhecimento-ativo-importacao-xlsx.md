# Conhecimento Ativo — contrato de importação XLSX

## Objetivo

Permitir que qualquer tenant AirTrust carregue um banco de conhecimento técnico sem depender de seed de código ou acesso ao banco.

O contrato é versionado. Versão atual: **1.0**.

A importação nunca publica conteúdo automaticamente:

- fontes importadas entram como `RASCUNHO`;
- itens e questões importados entram em revisão;
- a fonte deve ser marcada como `VIGENTE`;
- o item deve ser aprovado;
- a questão deve ser aprovada;
- o tenant do piloto continua protegido pelo feature gate `CONHECIMENTO_ATIVO_ENABLED_TENANTS`.

Conclusão de LMS, certificados e qualificações não são alterados.

## Como usar

1. Na Gestão Técnica do Conhecimento Ativo, baixar **modelo-conhecimento-ativo-airtrust.xlsx**.
2. Preencher a aba **Conhecimento**.
3. Fazer upload e executar **Validar sem gravar**.
4. Corrigir todos os erros por linha.
5. Executar **Importar para revisão**.
6. Homologar fontes, itens e questões.
7. Somente após conteúdo suficiente e homologado, habilitar o tenant do piloto.

A aba **Exemplo** é apenas referência e nunca é importada.

## Regra de uma linha

Cada linha da aba `Conhecimento` representa **uma variante de questão**.

Fonte, tópico e item podem se repetir entre várias linhas. Isso permite que um mesmo conceito tenha várias formulações de questão.

### Chaves naturais

- fonte: `fonte_tipo + fonte_titulo + fonte_revisao + aeronave_modelo`;
- tópico: `topico_codigo`;
- item: `item_codigo`;
- questão: `item_codigo + questao_variante`.

Reimportar a mesma definição é idempotente. Se a mesma chave já existir com definição diferente, o importador bloqueia o lote para revisão.

## Colunas — versão 1.0

| Coluna | Regra |
| --- | --- |
| versao_template | `1.0`; linhas pré-formatadas já recebem o valor |
| aeronave_modelo | Ex.: `AW139`, `SK76`; vazio = conhecimento geral |
| fonte_tipo | `RFM`, `FCOM`, `QRH`, `SOP`, `OM`, `OUTRO` |
| fonte_titulo | Nome controlado do documento |
| fonte_revisao | Revisão do documento |
| fonte_data_revisao | Opcional, `AAAA-MM-DD` |
| fonte_secao | Opcional |
| fonte_pagina | Opcional |
| fonte_referencia | Opcional, descrição curta da referência |
| topico_codigo | Chave estável do assunto |
| topico_nome | Nome didático do assunto |
| item_codigo | Chave estável do conceito |
| item_titulo | Título curto do conceito |
| item_conceito | Definição técnica do conhecimento |
| item_resumo_essencial | Resumo opcional |
| criticidade | `BAIXA`, `MEDIA`, `ALTA`, `CRITICA` |
| tempo_estudo_segundos | 15–900; padrão 60 |
| questao_variante | Ex.: `A`, `B`, `CENARIO-01` |
| questao_tipo | `MULTIPLA_ESCOLHA`, `VERDADEIRO_FALSO`, `CENARIO` |
| questao_enunciado | Pergunta apresentada ao piloto |
| questao_explicacao | Feedback didático após resposta |
| questao_o_que_guardar | Frase curta do ponto essencial |
| dificuldade | 1–5 |
| alternativa_a ... alternativa_f | 2 a 6 alternativas |
| alternativa_correta | Letra `A` a `F` correspondente a uma alternativa preenchida |

## Limites e validações

- arquivo `.xlsx`;
- até 8 MB;
- até 500 linhas por lote;
- mínimo de duas alternativas;
- exatamente uma alternativa correta;
- nenhuma alternativa duplicada;
- códigos e combinações de chaves não podem divergir dentro da própria planilha;
- conflitos com chaves existentes no banco bloqueiam a importação antes de qualquer escrita.

## Auditoria

Cada lote grava:

- tenant;
- nome e SHA-256 do arquivo;
- versão do modelo;
- usuário executor;
- total de linhas;
- totais inseridos/ignorados;
- estado do lote;
- lineage por linha e entidade criada/reutilizada.

A importação é idempotente. Um lote interrompido pode ser reenviado sem criar duplicações pelas mesmas chaves naturais.

## Revisões de manual

Ao marcar uma fonte vigente como `SUPERADO`:

- itens vinculados retornam para `REVISAO_NECESSARIA`;
- questões vinculadas retornam para `EM_REVISAO`;
- novas perguntas não devem ser geradas a partir desse conteúdo até nova homologação.

Snapshots já apresentados em desafios históricos permanecem preservados para rastreabilidade.
