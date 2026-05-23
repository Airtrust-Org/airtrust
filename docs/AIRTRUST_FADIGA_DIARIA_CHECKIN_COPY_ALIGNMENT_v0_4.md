# AIRTRUST — Fadiga Diária Check-in Copy Alignment v0.4

Data: 2026-05-23  
Projeto: AIRTRUST  
Escopo: ajuste de copy/UX no check-in de tripulante, preservando nomenclatura técnica FRMS

## 1) Decisão de produto

### 1.1 Manter nome técnico do módulo
- Mantido: **"Fadiga Diária"** como nome de aba/módulo.
- Mantido: **"Confirmar Fadiga Diária"** como CTA principal do formulário.
- Mantidas as rotas, integrações e semântica técnica de FRMS/fadiga no domínio administrativo e analítico.

### 1.2 Remover indução na pergunta subjetiva principal
- Alterado (copy tripulante):
  - De: "Como está sua fadiga agora?"
  - Para: **"Como está seu nível de alerta agora?"**
- Alterado subtítulo:
  - De: "Escolha a opção que melhor descreve como você se sente"
  - Para: **"Escolha a opção que melhor representa sua atenção e disposição neste momento"**

Objetivo: reduzir viés defensivo do termo "fadiga" na autoavaliação operacional, sem perder rastreabilidade técnica do FRMS.

## 2) Escala 1–5 (mapeamento de UX)

Escala numérica mantida em **1–5** para preservar contratos existentes.

- 1 — Muito alerta: Acordado, atento e disposto.
- 2 — Alerta: Bem, com leve cansaço.
- 3 — Regular: Cansado, mas mantendo atenção.
- 4 — Sonolento: Atenção reduzida ou esforço para manter o foco.
- 5 — Muito sonolento: Dificuldade para manter atenção ou permanecer acordado.

## 3) Compatibilidade técnica e de dados

- Backend permaneceu com nomenclatura técnica (`fadiga`, `score_fadiga`, `nivel_fadiga`, `subjective_fatigue_level`, etc.).
- Payload e persistência mantidos compatíveis com contratos atuais de API.
- Sem alteração de tabela/coluna, sem migration e sem mudança de rota pública.
- Registros históricos existentes permanecem íntegros e sem reinterpretação retroativa.

## 4) Relação com histórico, risco e painel FRMS

### 4.1 Histórico
- O histórico continua no contexto de **Fadiga Diária**.
- Onde a dimensão subjetiva aparece em label de interface, foi priorizado **"Nível de alerta"** / **"Nível de alerta informado"**.

### 4.2 Risco estimado
- Card de risco estimado permanece ativo.
- Escala 1–5 continua alimentando o mesmo fluxo interno de risco técnico.
- Gatilhos operacionais para níveis altos (4/5) e inaptidão declarada permanecem válidos.

### 4.3 Painel técnico FRMS/fadiga
- Painel administrativo mantém linguagem técnica de fadiga.
- Indicadores e colunas técnicas não foram removidos.

## 5) Pergunta adicional de sono 48h (sem migration)

Implementada por existir suporte já presente no backend (`horas_sono_48h`):
- Pergunta: **"Quanto você dormiu nas últimas 48h?"**
- Opções: `< 8h`, `8–10h`, `10–12h`, `> 12h`.

Integração aplicada:
- Valor é enviado no payload como `horas_sono_48h`.
- Entra no cálculo de **risco estimado local de UX** com regra simples:
  - `< 8h`: aumenta risco;
  - `8–10h`: risco leve;
  - `10–12h`: neutro;
  - `> 12h`: neutro/levemente positivo.

Observação de produto:
- A pergunta foi mantida opcional no formulário para não aumentar atrito operacional do tripulante.

## 6) Referencial normativo (contexto interno)

- RBAC 117 (ANAC): limitações operacionais relacionadas ao gerenciamento de fadiga.
- IS 117-003B (GRF): diretrizes de gerenciamento de risco de fadiga.
- IS 117-006A: fatores como perda de sono, tempo acordado, tempo de trabalho e horário do dia.

Links de referência usados para documentação interna:
- RBAC 117 (PDF): <https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD00.pdf>
- Página ANAC RBAC 117: <https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/operadores-121/normas-do-setor-operadores-121/rbac-117>
- IS 117-003B (PDF): <https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-117-003/@@display-file/arquivo_norma/IS117-003B.pdf>
- IS 117-006A (PDF): <https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-117-006a/@@display-file/arquivo_norma/IS%20117-006A.pdf>

## 7) Diretriz de UX mantida

- O check-in continua curto e operacional.
- Não foi transformado em questionário longo.
- Mantida a integração com regras de revisão operacional/FRAT sem bloqueio automático adicional por copy.
