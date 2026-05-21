# AirTrust — Escala Diária: UI/UX e Teste Funcional v0.4-G3

Data: 2026-05-21
Fase: AIRTRUST v0.4-G3 — Correção conceitual e UI/UX da Escala Diária

---

## 1. Problema Encontrado

O frontend da Escala Diária (EvdPage) foi implementado com linguagem centrada em "voo/trecho":

- Botão "Novo Voo"
- Estado vazio "Nenhum voo programado"
- Campos "Origem", "Destino", "Decolagem prevista", "Pouso previsto"
- Cards orientados a voo/rota com ícone `MapPin` (Origem → Destino)
- Layout personalizado com `max-w-6xl` divergindo do padrão do módulo Escalas
- Banner "FRMS Diário (placeholder)" exposto ao usuário

A operação real é de **atribuição diária de tripulação por aeronave**, não de cadastro de voos.

---

## 2. Referência Operacional (PDF)

Documento: **ESCALA DIÁRIA SK76 03.02.2026**

Estrutura da EDV real:

| Campo | Descrição |
|---|---|
| Tipo | Tipo/modelo da aeronave (SK76, AW139) |
| Matrícula | Prefixo da aeronave (PR-...) |
| Status aeronave | D=Disponível, I=Indisponível, M=Manutenção |
| Comandante | Nome de guerra do PIC |
| Fadiga PIC | S/N — indicador de check-in de fadiga |
| Qualificação PIC | PIC / IN / EX / 1P / 1X |
| Assento PIC | 1P / 2P |
| Copiloto | Nome de guerra do SIC |
| Fadiga SIC | S/N |
| Qualificação SIC | SIC / 2P / 2X |
| Assento SIC | 1P / 2P |
| Tripulante extra | Opcional |
| Base/Local | Base operacional de saída |
| Apresentação | Horário de apresentação |
| Início | Horário de início da operação |
| Término | Horário de término |
| Observações | Campo livre |
| Alterações no dia | Registro de mudanças |

---

## 3. Decisões de Nomenclatura

| Antes (linguagem de voo) | Depois (linguagem EDV) |
|---|---|
| Novo Voo | Nova Atribuição |
| Nenhum voo programado | Nenhuma aeronave escalada |
| Criar primeiro voo do dia | Adicionar primeira aeronave à escala |
| Decolagem prevista | Início |
| Pouso previsto | Término |
| Origem | Base / Local |
| Destino | Localidade de operação |
| Tipo missão (label) | Tipo de operação |
| PIC (label solto) | Comandante (PIC) |
| SIC (label solto) | Copiloto (SIC) |
| Erro ao criar voo | Erro ao criar atribuição |
| Criar Voo (botão) | Criar Atribuição |

Campos internos do backend (`hora_decolagem_prevista`, `hora_pouso_previsto`, `origem`, `destino`) **não foram alterados** — apenas os rótulos visíveis ao usuário.

---

## 4. Campos Implementados (v0.4-G3)

- ✅ Matrícula / Prefixo da aeronave
- ✅ Modelo (exibição na listagem)
- ✅ Comandante (PIC) — com nome de guerra
- ✅ Copiloto (SIC) — com nome de guerra
- ✅ Status FRMS resumido (PIC e SIC) — apenas statusLabel, sem scores/KSS
- ✅ Alerta de revisão FRMS (⚑ flag)
- ✅ Alerta de repouso insuficiente (<12h30)
- ✅ Horário de apresentação
- ✅ Início (hora_decolagem_prevista)
- ✅ Término (hora_pouso_previsto)
- ✅ Base / Local (origem)
- ✅ Tipo de operação (tipo_missao)
- ✅ Observações

---

## 5. Campos Adiados (próximas fases)

| Campo | Motivo do adiamento |
|---|---|
| Status da aeronave (D/I/M) | Requer nova coluna no DB — migration não incluída |
| Qualificação PIC/SIC (PIC/IN/EX/1P/1X) | Requer campo dedicado — atualmente exibido via `pic_funcao` existente |
| Assento PIC/SIC (1P/2P) | Requer novo campo no schema |
| Tripulante extra | Requer novo campo no schema |
| Alterações no dia | Histórico de edições — feature futura |
| Fadiga S/N explícito | Dado FRMS sensível — exibido apenas como status resumido por decisão arquitetural |

---

## 6. Ajustes de Layout

| Área | Antes | Depois |
|---|---|---|
| Wrapper principal | `<div className="max-w-6xl mx-auto px-4 py-6">` | Removido — AppLayout gerencia |
| Header | Custom `<div>` + `<h1>` com botão ArrowLeft | `<PageHeader title= subtitle= actions=>` (padrão do módulo) |
| Botão voltar | `<ArrowLeft>` → `/escalas` | Removido — sub-nav tabs cumprem função |
| Listagem | Cards individuais por aeronave | Tabela responsiva com colunas operacionais |
| Estado vazio | Ícone + texto solto | Ícone + texto contextual + CTA |
| Banner FRMS | Seção placeholder visível | Removido (informação irrelevante para usuário final) |
| Formulário | Borda azul bg-blue-50/50 | Borda azul dark-mode compatível |

---

## 7. Estratégia de Teste

### Script automatizado

Localização: `scripts/test-evd-functional.sh`

Uso:
```bash
TOKEN=<jwt_admin> DATE=2026-05-21 bash scripts/test-evd-functional.sh
# Com ambiente customizado:
TOKEN=<jwt> DATE=2026-05-21 BASE_URL=https://api.airtrust.online bash scripts/test-evd-functional.sh
```

Cobertura:
| Teste | Descrição |
|---|---|
| T01 | Health 200 |
| T02 | Listagem GET /api/evd?data= |
| T03 | Criação POST /api/evd (atribuição por aeronave) |
| T04 | PIC=SIC bloqueado |
| T05 | Publicação POST /api/evd/publicacoes |
| T06 | Listagem de revisões GET /api/evd/publicacoes?data= |
| T07 | Leitura de snapshot GET /api/evd/publicacoes/:id |
| T08 | Ausência de dados FRMS sensíveis no snapshot |
| T09 | Segunda publicação incrementa revisão |

**Requisitos**: `curl`, `jq`, token JWT de administrador.
**Segurança**: sem credenciais hardcoded, sem leitura de `.env.production`.

### Checklist manual (UI)
1. Abrir `/escalas/diaria`
2. Navegar entre datas com setas
3. Clicar "Nova Atribuição" — verificar labels corretos
4. Criar atribuição com aeronave PR-TST, PIC e SIC diferentes
5. Verificar tabela com linha nova
6. Verificar badge FRMS se tripulante tiver check-in
7. Publicar escala do dia — verificar confirmação e revisão no histórico
8. Abrir snapshot — verificar colunas (Matrícula, Comandante, Copiloto, Apresentação, Início, Término, Base)
9. Imprimir revisão — verificar cabeçalho sem "Origem/Destino"
10. Confirmar que dados FRMS sensíveis não aparecem

---

## 8. Limitações

- O campo `origem` foi renomeado para "Base/Local" na UI mas o contrato da API permanece `origem` — sem breaking change.
- O campo `hora_decolagem_prevista` é exibido como "Início" e `hora_pouso_previsto` como "Término" — sem breaking change.
- Status da aeronave (D/I/M) não está disponível sem migration — documentar como próxima fase.
- Qualificações (PIC/IN/EX) são exibidas via `pic_funcao` existente quando preenchido.

---

## 9. Próximos Passos

1. **v0.4-H — Migration de campos EDV**: adicionar `status_aeronave TEXT`, `qualificacao_pic TEXT`, `qualificacao_sic TEXT`, `assento_pic TEXT`, `assento_sic TEXT` à tabela `escala_voo_diaria`.
2. **v0.4-I — Tabela de disponibilidade diária**: exibir lista de tripulantes disponíveis por aeronave para facilitar seleção PIC/SIC.
3. **v0.4-J — Integração com frota**: buscar aeronaves ativas da frota ao invés de prefixo manual.
4. **v0.4-K — Alterações no dia**: log de mudanças pós-publicação.

---

*Documento gerado em 2026-05-21. Sem deploy, push, migration ou alteração de banco realizada durante esta fase.*
