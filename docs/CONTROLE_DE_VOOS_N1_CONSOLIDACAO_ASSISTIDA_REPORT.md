# Controle de Voos N1 - Consolidacao Assistida

Data de execucao: 2026-06-14, com evidencias UTC em 2026-06-15<br>
Ambiente: D1 dedicado `airtrust-db-pilot-cv-n1`<br>
UUID: `76ec876a-8727-44b6-aa33-b8dea53cdebb`<br>
Modo: operacional interno, controlado, nao regulado<br>
Veredito: **ENCERRAR N1 COM RESSALVAS**

## 1. Decisao

O piloto Controle de Voos N1 pode ser encerrado como N1 com ressalvas documentadas.

A decisao nao autoriza trilha regulada, nao inicia 0411, nao integra SIGVOOS/APUS, nao altera FRMS e nao define qualquer fonte canonica externa. O encerramento recomendado e restrito ao aprendizado N1 operacional interno, nao regulado, com evidencias sinteticas/controladas no D1 dedicado.

Nao houve usuario OCC ou observador real disponivel nesta consolidacao. Portanto, nao foi simulado aceite real. Essa ausencia permanece bloqueio para encerramento sem ressalvas e para qualquer expansao de escopo.

## 2. Isolamento

Confirmado nesta execucao:

- D1 usado exclusivamente: `airtrust-db-pilot-cv-n1`;
- UUID confirmado: `76ec876a-8727-44b6-aa33-b8dea53cdebb`;
- config usado: `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- env-file usado apenas de `/tmp/airtrust-pilot-cv-n1/`;
- nenhuma chamada contra producao;
- nenhuma chamada contra `airtrust-db-staging`;
- nenhum uso de `--env production`;
- nenhum deploy;
- nenhuma migration aplicada;
- nenhuma criacao ou aplicacao de `0411`;
- nenhuma integracao SIGVOOS/APUS;
- nenhuma alteracao em FRMS ou `frms-source-policy.ts`;
- nenhuma trilha ANAC regulada iniciada;
- nenhum snapshot, dump, env-file, config temporario ou credencial movido para o repositorio.

## 3. Baseline final

Validacao read-only no D1 dedicado:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| Voos sinteticos | 8 |
| RDVs finalizados | 4 |
| `regulated_count` | 0 |
| Tabelas 0411 | 0 |
| Escopos inesperados SIGVOOS/FRMS/eDB/SDRMe/Records Core | 0 |

Validacao adicional apos teste UI:

| Checagem | Resultado |
|---|---:|
| RDVs totais | 4 |
| RDVs finalizados | 4 |
| RDV criado para `voo_id = 4` durante consolidacao | 0 |

O teste UI de consolidacao nao criou novo RDV. A unica tentativa enviada ao backend foi rejeitada pelo guard antes de persistencia.

## 4. Ressalvas do Dia 3

| Ressalva | Estado | Evidencia/decisao |
|---|---|---|
| UI presa em `Salvando...` apos HTTP 400 do guard | Fechada com correcao minima | `ControleVoosRdvDetalhe.tsx` passou a usar estado local `isSaving` com `finally` e mensagem de erro visivel |
| Mensagem clara para termo bloqueado pelo guard | Fechada com correcao minima | Erro `Payload contem termo fora do escopo` agora e apresentado como orientacao operacional ao usuario |
| Regra de coerencia de combustivel | Fechada com correcao minima | Validacao local impede envio quando decolagem - pouso difere do consumo e exibe a regra |
| Inconsistencia entre voo selecionado e numero do RDV | Fechada para novos preenchimentos | Numero do RDV deve comecar com a base calculada a partir de data do voo e prefixo selecionado |
| Ruido dos endpoints globais 500 (`empresas_config`, `notificacoes_sistema`) | Aberta, classificada | Nao corrigida para evitar schema/baseline fora de escopo; nao bloqueia endpoints `controle-voos`, mas bloqueia uso menos assistido |
| Usuario real/controlado indisponivel | Aberta, classificada | Nao simulado; bloqueia encerramento sem ressalvas |
| Comparacao externa SIGVOOS/APUS/papel | Aberta, classificada | Nao executada por ausencia de referencia controlada |
| RDV historico Dia 3 com numero incoerente em `voo_id = 5` | Aberta, preservada | Dado mantido no D1 dedicado; correcao so previne novos casos |

## 5. Correcao minima aplicada

Arquivo alterado:

- `src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx`

Mudancas:

- estado local de salvamento com `try/catch/finally` para impedir botao preso em `Salvando...`;
- mensagem amigavel para erro do guard de escopo;
- mensagem amigavel e validacao local para combustivel incoerente;
- dica visual da regra de combustivel;
- validacao local do prefixo/base do numero RDV contra o voo selecionado;
- dica visual do formato esperado do numero RDV.

Nao houve alteracao no Worker, schema, migrations, FRMS, SIGVOOS ou qualquer contrato regulatorio.

## 6. Validacao UI da correcao

Validacao executada no frontend local `http://localhost:3000` com Worker preview `http://localhost:8791`, ambos apontados ao D1 dedicado.

Voo usado para validacao sem escrita persistente: `voo_id = 4`, ainda sem RDV.

| Caso | Resultado |
|---|---|
| Numero RDV de outro voo | Mensagem local exibida; botao voltou para `Criar rascunho` |
| Combustivel incoerente | Mensagem local exibida; botao voltou para `Criar rascunho` |
| Texto com termo bloqueado pelo guard | Worker retornou HTTP 400; mensagem amigavel exibida; botao voltou para `Criar rascunho` |

Assercoes registradas em `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-validation-20260615T012803Z.json`:

```text
localNumberValidationNoSaving = true
localFuelValidationNoSaving = true
guardValidationNoSaving = true
guardFriendlyMessage = true
```

## 7. Usuario real/controlado

Nao executado.

| Item | Estado |
|---|---|
| Usuario OCC ou observador real/controlado | Indisponivel |
| Aceite explicito de escopo nao regulado | Nao coletado |
| Tempo aproximado de usuario real | Nao coletado |
| Duvidas reais | Nao coletadas |
| Confusao regulatoria real | Nao avaliada |
| Valor operacional percebido por usuario real | Nao validado |

Impacto na decisao: nao bloqueia encerramento N1 com ressalvas, mas bloqueia encerramento sem ressalvas e qualquer ampliacao para uso menos assistido.

## 8. Comparacao externa

Comparacao manual com SIGVOOS/APUS/papel: **nao executada**.

Motivo:

- nenhuma referencia externa controlada foi disponibilizada nesta sessao;
- nenhuma integracao, importador ou escrita fora do D1 dedicado foi executada.

Template pendente:

| Voo | Fonte externa | Campo | AirTrust | Referencia externa | Divergencia | Acao |
|---|---|---|---|---|---|---|
| pendente | SIGVOOS/APUS/papel | pendente | pendente | pendente | pendente | pendente |

## 9. Endpoints globais 500

Durante a validacao UI, o shell autenticado continuou chamando endpoints globais que dependem de tabelas fora do baseline minimo do piloto:

- `/api/auth/empresas`;
- `/api/empresas/minha/sistema`;
- `/api/notificacoes/sistema`.

Classificacao:

- aberto como ressalva de ambiente/shell;
- nao corrigido nesta consolidacao para evitar criar baseline ou schema global fora do escopo;
- nao bloqueou os endpoints `controle-voos`;
- deve ser resolvido antes de qualquer sessao menos assistida, preferencialmente por isolamento do shell para o piloto ou por baseline read-only minimo explicitamente aprovado.

## 10. Evidencias

Evidencias geradas fora do repositorio:

| Evidencia | Local | Tamanho |
|---|---|---:|
| Resultado UI consolidacao | `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-validation-20260615T012803Z.json` | 2503 bytes |
| Screenshot RDV sem preenchimento | `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-started-empty-rdv-20260615T012803Z.png` | 164887 bytes |
| Screenshot validacao numero RDV | `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-number-validation-20260615T012803Z.png` | 174001 bytes |
| Screenshot validacao combustivel | `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-fuel-validation-20260615T012803Z.png` | 172446 bytes |
| Screenshot validacao guard | `/tmp/airtrust-pilot-cv-n1/consolidacao-ui-guard-validation-20260615T012803Z.png` | 181899 bytes |
| Snapshot pos-consolidacao | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-consolidacao-20260614222850.sql` | 51453 bytes |

Snapshot gerado por:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-consolidacao-20260614222850.sql
```

Confirmado tamanho maior que zero.

## 11. Validacoes executadas

| Validacao | Resultado |
|---|---|
| `npx tsc --noEmit --pretty false` | Passou |
| Baseline D1 dedicado read-only | Passou |
| UI de validacao local/guard | Passou |
| Confirmacao de nao criacao de RDV no voo 4 | Passou |
| Snapshot pos-consolidacao | Gerado fora do repo |

## 12. Recomendacao de governanca

Recomendacao explicita: **nao propor 0411, SIGVOOS -> Controle de Voos, FRMS canonico ou trilha ANAC enquanto o piloto N1 nao estiver formalmente consolidado e aceito com as ressalvas acima**.

Antes de qualquer proximo passo fora de N1:

- obter usuario OCC/observador real e aceite explicito de escopo nao regulado;
- executar comparacao manual com 1 ou 2 referencias externas controladas, sem integracao;
- resolver ou isolar o ruido dos endpoints globais do shell;
- decidir se o RDV historico incoerente do Dia 3 fica apenas como evidencia de teste ou se exige limpeza controlada em novo baseline, com aprovacao explicita.

## 13. Commit seletivo

Nao commitar:

- `worker-airtrust/wrangler.pilot-cv-n1.toml`;
- `/tmp/airtrust-pilot-cv-n1/*`;
- env-file;
- snapshots;
- dumps;
- credenciais;
- arquivos temporarios.

Commit sugerido, se aprovado:

```bash
git add src/react-app/pages/controle-voos/ControleVoosRdvDetalhe.tsx docs/CONTROLE_DE_VOOS_N1_CONSOLIDACAO_ASSISTIDA_REPORT.md
git commit -m "fix: consolidate controle voos n1 pilot"
```

Nao usar `git add .`.
