# FRMS Petrobras + UX — contrato de implementação

Data: 2026-08-25
Base inicial da branch: `ff86770e56da2a7d3595dd3c410911bb02e2a56f`
Branch: `feat/frms-petrobras-ux-20260825`

## Objetivo

Consolidar o FRMS atual sem remover funcionalidades existentes e integrar o desenho aprovado para:

- Painel Operacional;
- Gestão FRMS;
- Análise & Evidência;
- Fadiga Diária;
- Configuração FRMS;
- Como funciona;
- Alertas/Relatórios;
- critérios Petrobras / IOGP 690-2 de demanda operacional e carga ambiental.

## Layout

Usar o `AppLayout` e o design system atuais do AirTrust. Não criar header global paralelo nem identidade visual própria para FRMS.

## Painel Operacional

- Fila por exceção e criticidade.
- Fadiga diária/check-in pendente no dia operacional deve aparecer como pendência de liberação, sem transformar check-in futuro em bloqueio.
- Sem polling contínuo.
- `Atualizar agora` executa nova leitura.
- Mostrar horário do último snapshot válido.
- Se o refresh falhar, manter o snapshot anterior e avisar que os dados exibidos são do último snapshot válido.
- Não usar ação simulada de `Ciência`.

## Filtros

Gestão e Análise/Evidência devem compartilhar o mesmo recorte:

- tipo de aeronave;
- quinzena: 1ª / 2ª / ambas;
- período: este mês / 30 / 60 / 90 / 180 / 365 dias;
- busca por nome do tripulante;
- base.

Aeronave, base e tripulante devem ser derivados da escala operacional tenant-scoped do período selecionado.

## Gestão FRMS

Dashboard funcional da frota com:

- críticos/violações;
- atenção;
- efetividade degradada;
- dados incompletos;
- demanda operacional alta;
- carga ambiental alta;
- setores/pousos;
- tendência;
- ranking automático dos tripulantes mais críticos;
- saúde SIGVOOS/REDEMET/demais fontes.

## Análise & Evidência

Começar pela frota, não por seletor vazio. Selecionar automaticamente o caso mais crítico e mostrar:

- heatmap;
- curva temporal de efetividade;
- componentes/fatores;
- jornadas do período;
- compliance;
- demanda operacional;
- ambiente;
- regra determinante;
- proveniência/qualidade/revisão.

## Funcionalidades existentes a preservar

- Fadiga Diária / Check-in;
- Controle Operacional;
- Fadiga Acumulada;
- Histórico/Painel de Fadiga;
- Configuração FRMS;
- Como funciona;
- Alertas;
- Relatórios;
- Importar FIRAs;
- Incluir Jornada.

## Configuração FRMS

Preservar as três áreas atuais:

1. Limites Regulatórios;
2. Fatorização Metodológica;
3. Notificações.

Adicionar/organizar uma área `Operação Offshore & Ambiente`.

Separar visualmente:

- legal/regulatório;
- IOGP/contratual;
- política interna;
- modelo de fadiga;
- reservado/compatibilidade.

### Limites que precisam aparecer corretamente

- HV diária helicóptero: 8 h;
- HV 7 dias: 45 h — fonte IOGP/contratual;
- HV 28 dias: 93 h;
- mês calendário: 90 h;
- 365 dias: 930 h;
- FDP baseline/profile-dependent: 11 h;
- repouso baseline/profile-dependent: 12 h;
- alertas 80/90/95/101% como política interna.

Não confundir 28 dias com mês calendário.

## Demanda operacional — Petrobras / IOGP 690-2 §17C.1

Reutilizar o motor existente em `operational-demand.ts` e adapters atuais.

Expor/usar:

- setores;
- decolagens;
- pousos;
- pousos diurnos/noturnos;
- pousos em janela móvel de 60 min;
- taxa de pousos/h;
- trechos curtos;
- trechos offshore;
- shuttle plataforma/helideck;
- bloco contínuo;
- pausa verificada;
- qualidade dos dados.

Preservar como benchmark/política governada, sem rotular como ANAC:

- short sector <= 30 min;
- high sector count = 7;
- landing density benchmark = 10/h;
- break = 30 min;
- continuous block = 180 min.

A identidade física da etapa SIGVOOS é `flightReportId + legNumber`; múltiplos tripulantes na mesma etapa não podem duplicar setor/pouso/meteorologia.

## Ambiente — Petrobras / IOGP 690-2 §17C.1

Reutilizar `environmental-risk.ts`, `redemet-weather.ts`, catálogo de localidades e shadow/evaluation pipeline atuais.

Expor:

- temperatura;
- ponto de orvalho;
- umidade;
- vento;
- Heat Index;
- Wind Chill;
- WBGT e `MEASURED/ESTIMATED/UNAVAILABLE`;
- estação, horário, idade e qualidade do dado.

REDEMET deve ser consultado de forma batched por estação/janela, nunca por tripulante.

Plataforma/helideck sem estação compatível => `UNAVAILABLE`; não usar aeródromo proxy silenciosamente.

## Orquestração

Domínios independentes:

1. Compliance;
2. Biológico/Circadiano;
3. Demanda Operacional;
4. Ambiente.

Regras:

- violação obrigatória não é compensável;
- operacional HIGH + ambiente HIGH => CRITICAL;
- dado insuficiente permanece explícito;
- frontend não recalcula fórmulas do backend.

## Parâmetros

Não alterar coeficientes apenas para “melhorar” a tela.

`CICLO_EMBARCADO_PCT_MAX` tem divergência observada entre tela (`-0.10`) e baseline governado histórico (`-0.15`). Resolver a revisão ativa do tenant antes de qualquer write. Se houver mudança real de modelo, criar nova revisão governada; não mutar V1 em place.

Parâmetros sem efeito na revisão atual devem ficar como `Reservado/Compatibilidade`, não aparentar controle ativo.

## Migration / D1

Preferir zero migration. Nenhum recálculo histórico automático nesta frente.

Se uma mudança de schema/revisão for necessária, seguir governança, preflight, rollback/compensação, postconditions e tenant isolation. Produção exige autorização explícita para o SHA final.

## Testes mínimos

- filtros combinados, incluindo base e aeronave derivados da escala;
- 1ª/2ª/ambas;
- 30/60/90/180/365 e este mês;
- refresh manual sem polling;
- erro mantém snapshot anterior;
- fadiga diária preenchida desaparece após refresh;
- multi-crew não duplica leg;
- pousos/60m, short sector, shuttle e break;
- Heat Index/Wind Chill/WBGT;
- missing != zero;
- violation não compensável;
- operational HIGH + environmental HIGH => CRITICAL;
- tenant isolation;
- regressão de Fadiga Diária, Configuração, Como funciona, Alertas, Relatórios e Controle Operacional.

## Entregas já aplicadas nesta branch

- hook operacional preserva último snapshot válido quando refresh falha;
- hook expõe `lastUpdatedAt` e usa `cache: no-store` na leitura explícita;
- componente `FrmsManualRefreshControl` criado;
- períodos 60/180/365 adicionados aos filtros;
- quinzena apresentada como 1ª/2ª/ambas;
- ação simulada `Ciência` removida da fila da coordenação.

## Próximo passo local obrigatório

Continuar nesta mesma branch, reconciliar a main atual antes de editar, implementar os gaps backend/UI restantes, rodar testes e CI, abrir/atualizar PR e levar até staging validado. Não fazer write D1 nem produção sem os gates/autorização correspondentes.
