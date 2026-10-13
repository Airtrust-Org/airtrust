# FRMS — prévia de cenários sintéticos Bombeiros e coordenação Costa do Sol

**Data:** 2026-10-12. **Escopo:** demonstração read-only em staging. Não cria dados em D1 e não constitui teste de carga, conformidade regulatória ou POC homologada.

## Como ver

1. Entrar no ambiente **staging**, com acesso administrativo válido da **plataforma AirTrust**.
2. Selecionar o contexto administrativo `airtrust`, não `costadosol`.
3. Abrir **Configurações → Gestão de Empresas → Ver exemplos do FRMS**.
4. Usar o seletor de missão para ver cenários de resgate aeromédico, busca e salvamento, guincho, combate aéreo a incêndio e transporte aeromédico. Abrir uma pessoa para ler sono, KSS, check-in, acúmulo, motivo, providência e responsável.
5. O cabeçalho identifica explicitamente a simulação. Não existe botão de despacho, alteração de prontidão ou gravação de dados; os nomes `QA...` são fictícios.

A prévia é indisponível no host de produção, no contexto Costa do Sol e para usuários sem o contexto `airtrust`. O código usa checagem exata de hostname e tenant da sessão. Esse controle de visibilidade não substitui RBAC backend para operações reais.

## Separação dos dois trabalhos

**Bombeiros:** cinco cenários estáticos demonstram estados recebidos, pendentes e ausentes; alerta de sono/KSS; fadiga acumulada; intervenção e rastreabilidade ilustrativa. Não são calculados cientificamente, não geram relatórios oficiais e não concedem aptidão. O tenant `bombeiros` permanece sem cadastro real confirmado. Provisão da empresa, um primeiro admin, atribuição `FIREFIGHTER_AVIATION`, parâmetros normativos e a entrada de dados reais dependem de fluxo autorizado.

**Costa do Sol:** novo card compacto "Check-ins a receber" na central `/frms`, com filtro que mostra somente pessoas operacionalmente relevantes cujo check-in diário não está `RECEBIDO`. Pode ser desativado para recuperar a fila original, preservando os quatro estados de decisão e explicações no detalhe. O backend continua sendo a autoridade para qualquer liberação.

## Evidências necessárias para avançar

- Testes locais da prévia sintética e da central de decisão (incluindo bloqueio sem check-in).
- Oito gates da PR e da `main`, merge sem bypass.
- Deploy oficial Worker/Pages para staging quando aplicável; smoke autenticado mais teste específico de presença da prévia e ausência dela na Costa do Sol.
- Tenant real de demonstração, se desejado posteriormente, somente por cadastro de superadministrador e preenchimento/seed **governado em staging**, com rollback e confirmação. Nunca importar os nomes fake para Costa do Sol nem rodar SQL remoto avulso.
- Produção: autorização específica para SHA, componentes e escopo. Esta prévia de staging não deve ser apresentada como funcionalidade operacional disponível aos bombeiros.

## Limitações atuais

A versão demonstra o fluxo interpretativo, não "tudo funcionando" em um tenant real. Ainda faltam homologação normativa dos bombeiros, cadastro de empresa e administração, cálculo/indicadores por missão validados, relatórios mensais específicos, evidência de capacidade para 130 usuários e POC com critérios do edital.
