# AirTrust Silent Fallbacks Audit

Data: 2026-06-17

Escopo:

- varredura estatica;
- sem correcoes automaticas;
- sem deploy;
- sem alterar logica operacional fora de scripts read-only, testes e documentacao.

## Critico

### 1. Fallback `ORD-*` em escrita de ficha de simulador

- Arquivo: `worker-airtrust/src/routes/simuladores-fichas-simulador.ts`
- Evidencia: quando a relacao `modelo -> manobra` nao e encontrada, a rota sintetiza `codigo = ORD-${ordem}` e `descricao = Manobra ordem ${ordem}`
- Risco: mascara integridade quebrada e permite popular ficha com manobra artificial
- Onda sugerida: Onda 2

### 2. Detector legado com drift de schema

- Arquivo: `scripts/validation/run-data-quality-local.sh` e metadados historicos associados
- Evidencia: referencias a `simulador_sessoes`, `simulador_sessao_participantes` e `frms_jornadas`
- Risco: check verde falso por nome inexistente
- Onda sugerida: Onda 1
- Status desta fase: mitigado com deprecacao do SQL legado e redirecionamento para o novo runner

## Alto

### 3. Preview SIGVOOS retorna `null` em drift de schema

- Arquivo: `worker-airtrust/src/services/controle-voos/sigvoos-real-preview.ts`
- Evidencia: `catch` devolve `null` quando encontra `no such table` ou `no such column`
- Risco: indisponibilidade estrutural pode parecer apenas ausencia de configuracao
- Onda sugerida: Onda 3
- Observacao: SIGVOOS permanece intocado nesta fase

### 4. Busca de gestores em fichas editadas retorna lista vazia em erro

- Arquivo: `worker-airtrust/src/routes/simuladores-fichas-edicoes.ts`
- Evidencia: falha na query de gestores cai em `return []`
- Risco: aprovacoes ou notificacoes podem seguir sem destinatarios esperados
- Onda sugerida: Onda 2

## Medio

### 5. Dashboard de compliance engole ausencia de tabela opcional

- Arquivo: `worker-airtrust/src/services/dashboardService.ts`
- Evidencia: bloco que assume `requisitos_compliance` opcional e segue sem alertas
- Risco: gap de observabilidade; menos grave que write path, mas oculta configuracao faltante
- Onda sugerida: Onda 2

### 6. LMS asset player usa `catch(() => null)` em fluxo de commit

- Arquivo: `worker-airtrust/src/routes/lms-assets.ts`
- Evidencia: callback de commit SCORM descarta erro e devolve `null`
- Risco: falha de persistencia pode parecer sucesso do player
- Onda sugerida: Onda 2

## Baixo

### 7. PDF e utilitarios de frontend devolvem `null` ou `false` em erro

- Arquivos: `src/react-app/services/pdf-ficha-client.ts`, `src/react-app/pages/simuladores/fichas/index.tsx`
- Evidencia: fallbacks controlados para UX
- Risco: baixo para integridade de dados; mais ligado a experiencia do usuario
- Onda sugerida: Onda 3

## Separacao por onda

Onda 1:

- detector legado / drift de schema
- consolidacao de checks read-only
- inventario estrutural e baseline

Onda 2:

- bloquear fallback `ORD-*` em escrita
- falhar fechado quando lookup critico de gestores falhar
- endurecer flows de dashboard e LMS que hoje degradam silenciosamente

Onda 3:

- revisar retornos silenciosos em modulos de integracao
- alinhar estrutura e constraints para eliminar caminhos ambiguos

## Conclusao

O principal fallback silencioso ainda relevante para integridade operacional e o `ORD-*` em Simuladores. Nesta fase ele foi apenas documentado; a correcao deve acontecer em Onda 2 junto com guards de runtime fail-closed.
