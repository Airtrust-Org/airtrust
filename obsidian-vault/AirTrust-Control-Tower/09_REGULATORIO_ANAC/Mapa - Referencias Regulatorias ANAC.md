---
status: ativo
tipo: mapa
fonte_canonica: docs/ + ANAC
ultimo_sha_verificado: ""
risco: alto
ultima_revisao: "2026-07-05"
tags:
  - regulatorio
  - anac
  - risco/alto
---

# Referências Regulatórias ANAC

> ⚠️ A conformidade regulatória efetiva depende de validação pela autoridade competente.
> As referências abaixo indicam as fontes dos parâmetros configuráveis, não declaram conformidade.

## Documentos de referência

| Documento | Tema | Relevância |
|---|---|---|
| **RBAC-117** | Limites de Jornada | FRMS: thresholds de fadiga, limites de horas |
| **PRC-OPS-009** | Escala de Voo Diária | EVD: regras de publicação e distribuição |
| **PRC-OPS-012** | Gerenciamento de Fadiga | FRMS: pipeline completo, acumulados |
| **ICAO Doc 9966** | FRMS Manual | FRMS: referência internacional |

## Módulos impactados

| Módulo | Regulamento | Impacto |
|---|---|---|
| FRMS | RBAC-117, PRC-OPS-012, ICAO 9966 | Cálculos de fadiga, alertas, acumulados |
| EVD | PRC-OPS-009 | Publicação e distribuição de escalas |
| LMS | — (indireto) | Conteúdo EAD deve refletir regulamentos |
| SGSO | — (operacional) | Registro de incidentes e não-conformidades |

## Dossiês e documentação

| Documento | Localização |
|---|---|
| Dossiê Regulatório ANAC | `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md` |
| Matriz de Conformidade | `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv` |
| Briefing Consultor | `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md` |
| Homologação DB Digital | `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md` |

## Cautelas
- Não declarar conformidade sem evidência formal
- Não marcar documentação como "aprovada pela ANAC" sem aval oficial
- Mudanças em thresholds e cálculos do FRMS devem ser validadas contra os regulamentos

## Links
- [[Modulo - FRMS]]
- [[Modulo - EVD]]
