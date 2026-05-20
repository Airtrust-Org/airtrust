# CHECKLIST QA — Módulo Escalas

Executar antes de qualquer deploy de feature nova ou bugfix em Escalas.

## Fluxo 1: Criar escala nova
- [ ] Clicar em "+ Nova Escala Mensal" e abrir o modal
- [ ] Selecionar mês/ano e criar a escala sem erro
- [ ] O card novo aparece na lista
- [ ] O rodapé mostra "Criada por você" quando a escala foi criada pelo usuário logado

## Fluxo 2: Primeira alocação em escala vazia
- [ ] Abrir uma escala sem tripulantes
- [ ] Confirmar que só existe 1 CTA visível de alocação no empty state
- [ ] Toolbar e barra de filtros não mostram botão de alocação no estado vazio
- [ ] Abrir o modal de Nova Tripulação
- [ ] Selecionar aeronave e confirmar que a lista de pilotos carrega somente depois disso
- [ ] Conferir texto de filtro pelo modelo selecionado
- [ ] Confirmar que PIC/SIC não geram erro Zod ao salvar
- [ ] Após salvar, a grade mostra a linha do tripulante com eventos

## Fluxo 3: Escala com tripulantes
- [ ] Toolbar mostra botão principal de alocação
- [ ] Barra de filtros mostra botão secundário de alocação
- [ ] Cada tripulante aparece uma única vez na grade
- [ ] CTA por grupo de aeronave continua funcional
- [ ] Conflitos aparecem com marcador visual

## Fluxo 4: Regras de validação
- [ ] PIC = SIC bloqueia com mensagem clara
- [ ] PIC fora do modelo da aeronave bloqueia com mensagem de habilitação
- [ ] Escala publicada não permite edição
- [ ] Datas inválidas não chegam à API

## Fluxo 5: Multi-tenant e autenticação
- [ ] Escalas de outras empresas não aparecem
- [ ] A API `/api/escalas/health` responde `healthy`
- [ ] Endpoint admin de backfill responde 404
- [ ] Token expirado redireciona para login
