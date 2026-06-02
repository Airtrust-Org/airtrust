# AirTrust Module Release Matrix v0.5

Data: 2026-06-02

## Objetivo

Classificar os modulos para entrada da segunda empresa real em piloto controlado, deixando claro o que pode ser liberado, o que deve ficar oculto, o que e uso interno e o que deve ser bloqueado.

## Status

- `LIBERAR PILOTO CONTROLADO`: pode ser usado por novo tenant com acompanhamento e smoke.
- `BETA/OCULTO`: nao vender como pronto; manter fora de demo/cliente salvo aprovacao especifica.
- `USO INTERNO`: operado pela equipe AirTrust, nao exposto como feature do cliente.
- `BLOQUEAR`: nao ativar para a segunda empresa.

## Matriz

| Modulo | Status | Motivo | Risco principal | Teste minimo antes de liberar | Smoke necessario | Observacao para demo |
| --- | --- | --- | --- | --- | --- | --- |
| Funcionarios | LIBERAR PILOTO CONTROLADO | Base operacional do tenant e ja possui isolamento por empresa | Exposicao cross-tenant de dados pessoais | Listar `GET /api/funcionarios?limit=1` com tenant esperado | Smoke autenticado read-only com empresa esperada | Mostrar apenas dados reais autorizados ou dataset minimo aprovado |
| Qualificacoes | LIBERAR PILOTO CONTROLADO | Fluxo central do produto e rotas autenticadas existentes | Certificados/documentos sensiveis | `GET /api/qualificacoes/historico?limit=1` e download somente por rota autenticada | Smoke autenticado + probe de assets | Evitar documentos reais em demo aberta |
| Simuladores | LIBERAR PILOTO CONTROLADO | Modulo maduro para sessoes e fichas | Fichas/PDFs por tenant | `GET /api/simuladores/sessoes?limit=1` | Smoke autenticado | Demonstrar fluxo sem gerar dados novos em producao |
| Dashboard executivo | LIBERAR PILOTO CONTROLADO | Read-only consolidado | Dados agregados de tenant errado | `GET /api/dashboard/metrics` | Smoke autenticado | Usar como tela inicial do piloto |
| Escalas/EVD | LIBERAR PILOTO CONTROLADO | Valor operacional alto, mas requer acompanhamento | Publicacao ou alteracao indevida de escala | `GET /api/evd?data=<hoje>` | Smoke autenticado | Demo read-only ate confirmar processo do cliente |
| FRMS/Fadiga | LIBERAR PILOTO CONTROLADO | Diferencial do produto, com cuidado LGPD | Dados de saude/sono/fadiga | `GET /api/frms/daily-fatigue`; writes so com aprovacao | Smoke autenticado read-only | Explicar limites LGPD e consentimento operacional |
| Exportacao/PDFs/certificados | LIBERAR PILOTO CONTROLADO | Assets privados foram corrigidos e publicados | URL publica de documento | Probe `/api/assets/fira/123/test.pdf` nao 200; downloads por rota autenticada | Smoke assets + smoke autenticado | Nao usar documentos reais sem aprovacao |
| Admin/manutencao | USO INTERNO | Ferramentas de operacao e suporte | Alteracao destrutiva ou global | `ops:guard`; revisar permissao antes de qualquer uso | Nao expor ao cliente | Nao demonstrar em piloto |
| Usuarios/empresas/permissoes | USO INTERNO OPERACIONAL | Necessario para onboarding controlado | Vinculo incorreto entre tenants | `GET /api/auth/empresas` e validacao de empresa esperada | Smoke autenticado com expected empresa | Operado pela equipe AirTrust |
| Treinamentos planejados | BETA/OCULTO | Funcionalidade ainda em estabilizacao | Fluxos incompletos ou confusos | Teste dedicado antes de liberar | Fora do smoke minimo | Ocultar no menu/demo |
| SGSO | BETA/OCULTO | Modulo amplo, ainda nao produto pronto | Workflow incompleto e risco operacional | Validacao dedicada de tenant e permissao | Fora do smoke minimo | Nao vender como pronto |
| LMS/EAD | BETA/OCULTO | Assets e conteudo demandam revisao propria | Exposicao de conteudo/arquivos e contratos de curso | Smoke LMS especifico antes de liberar | Fora do smoke minimo | Mostrar apenas se explicitamente aprovado |
| Hospedagem | BETA/OCULTO | Fora do escopo do piloto inicial | Dados operacionais incompletos | Teste dedicado antes de liberar | Fora do smoke minimo | Nao ativar para segunda empresa |
| SIGVOOS | BLOQUEAR | Integracao externa e alto impacto operacional | Importacao/sincronizacao indevida | Nenhum para piloto; requer projeto separado | Nao executar | Nao ativar nem demonstrar |
| Configuracoes "em breve" | BETA/OCULTO | Pode sugerir promessa de produto nao entregue | Frustracao e uso de tela incompleta | Revisao visual antes de demo | Fora do smoke minimo | Ocultar seco para cliente |

## Regras Para Demo

- Nao expor telas com "em breve", "dados de teste" ou funcoes incompletas.
- Nao usar dados reais da empresa atual para demonstrar outro tenant.
- Nao ativar modulo beta durante reuniao sem aprovacao previa.
- Nao executar writes em producao para demonstracao.

## Smoke Minimo Para Piloto

Antes de liberar acesso:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID="<tenant-id>" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

Aceite:

- auth e empresa esperada OK;
- modulos liberados retornam `PASS` ou, se fora do contrato atual, `SKIPPED_ENDPOINT_NOT_AVAILABLE` documentado;
- probe de assets privados retorna nao `200`;
- nenhum write executado.
